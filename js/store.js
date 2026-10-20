// All data lives in this browser's localStorage. Every record carries `updatedAt`, and deletions are kept
// as tombstones in `deleted`, so two devices can be merged safely (newer change wins) when syncing.

import { occursOn, todayKey } from './dates.js';

const KEY = 'goalPlanner.data.v1';
const COLLECTIONS = ['goals', 'steps', 'tasks'];
const listeners = new Set();

export const COLORS = ['#0f766e', '#2a78d6', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#475569'];
export const CATEGORIES = ['Health', 'Career', 'Learning', 'Finance', 'Personal', 'Relationships', 'Home', 'Travel'];

function emptyData() {
  return { version: 1, goals: [], steps: [], tasks: [], deleted: {}, settings: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return emptyData();
}

export function normalize(d) {
  const out = emptyData();
  if (!d || typeof d !== 'object') return out;
  for (const c of COLLECTIONS) out[c] = Array.isArray(d[c]) ? d[c].filter(r => r && r.id) : [];
  out.deleted = d.deleted && typeof d.deleted === 'object' ? d.deleted : {};
  out.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
  return out;
}

export let data = load();

function save({ silent = false } = {}) {
  localStorage.setItem(KEY, JSON.stringify(data));
  if (!silent) listeners.forEach(fn => fn());
}

// Listener runs after every local change (the UI re-renders, and sync is scheduled)
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Ids use only 0-9 and a-v so they can double as Google Calendar event ids
const ID_CHARS = '0123456789abcdefghijklmnopqrstuv';
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => ID_CHARS[b & 31]).join('');
}

export function get(collection, id) { return data[collection].find(r => r.id === id); }

export function upsert(collection, record) {
  const now = Date.now();
  const list = data[collection];
  const i = list.findIndex(r => r.id === record.id);
  if (i === -1) {
    const created = { id: newId(), createdAt: now, ...record, updatedAt: now };
    list.push(created);
    save();
    return created;
  }
  list[i] = { ...list[i], ...record, updatedAt: now };
  save();
  return list[i];
}

export function remove(collection, id) {
  const record = get(collection, id);
  data[collection] = data[collection].filter(r => r.id !== id);
  data.deleted[id] = Date.now();
  // Deleting a goal deletes its steps and unlinks its tasks
  if (collection === 'goals') {
    for (const s of data.steps.filter(s => s.goalId === id)) {
      data.deleted[s.id] = Date.now();
    }
    data.steps = data.steps.filter(s => s.goalId !== id);
    for (const t of data.tasks) if (t.goalId === id) { t.goalId = ''; t.updatedAt = Date.now(); }
  }
  save();
  return record;
}

// Put back something just deleted (the "Undo" toast)
export function restore(collection, record, { steps = [], taskIds = [] } = {}) {
  delete data.deleted[record.id];
  data[collection].push({ ...record, updatedAt: Date.now() });
  for (const s of steps) {
    delete data.deleted[s.id];
    data.steps.push({ ...s, updatedAt: Date.now() });
  }
  for (const t of data.tasks) if (taskIds.includes(t.id)) { t.goalId = record.id; t.updatedAt = Date.now(); }
  save();
}

export function setSetting(name, value) {
  data.settings = { ...data.settings, [name]: value, updatedAt: Date.now() };
  save({ silent: true });
}

export function replaceAll(next) {
  data = normalize(next);
  save();
}

// ---------- Merge (used by sync and by import) ----------

export function merge(local, remote) {
  local = normalize(local);
  remote = normalize(remote);
  const deleted = { ...local.deleted };
  for (const [id, ts] of Object.entries(remote.deleted)) deleted[id] = Math.max(deleted[id] || 0, ts);
  const out = emptyData();
  out.deleted = deleted;
  for (const c of COLLECTIONS) {
    const byId = new Map();
    for (const r of [...local[c], ...remote[c]]) {
      const have = byId.get(r.id);
      if (!have || (r.updatedAt || 0) > (have.updatedAt || 0)) byId.set(r.id, r);
    }
    // A record edited after it was deleted elsewhere comes back; otherwise the deletion wins
    out[c] = [...byId.values()].filter(r => !deleted[r.id] || (r.updatedAt || 0) > deleted[r.id]);
  }
  out.settings = (remote.settings.updatedAt || 0) > (local.settings.updatedAt || 0) ? remote.settings : local.settings;
  // Forget tombstones older than 90 days
  const cutoff = Date.now() - 90 * 86400000;
  for (const [id, ts] of Object.entries(out.deleted)) if (ts < cutoff) delete out.deleted[id];
  return out;
}

export function applyMerged(merged) {
  data = normalize(merged);
  save();
}

// ---------- Queries ----------

export function goalSteps(goalId) {
  return data.steps.filter(s => s.goalId === goalId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
}

export function goalProgress(goalId) {
  const steps = goalSteps(goalId);
  if (!steps.length) {
    const g = get('goals', goalId);
    return { done: 0, total: 0, pct: g && g.status === 'done' ? 100 : 0 };
  }
  const done = steps.filter(s => s.done).length;
  return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) };
}

export function isTaskDone(task, day) {
  if ((task.repeat || 'none') === 'none') return !!task.done;
  return (task.doneDates || []).includes(day);
}

export function toggleTask(task, day) {
  if ((task.repeat || 'none') === 'none') {
    return upsert('tasks', { id: task.id, done: !task.done, doneAt: task.done ? null : Date.now() });
  }
  const set = new Set(task.doneDates || []);
  set.has(day) ? set.delete(day) : set.add(day);
  // Keep only the last year of ticks so the record stays small
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const minKey = cutoff.toISOString().slice(0, 10);
  return upsert('tasks', { id: task.id, doneDates: [...set].filter(k => k >= minKey).sort() });
}

export function toggleStep(step) {
  return upsert('steps', { id: step.id, done: !step.done, doneAt: step.done ? null : Date.now() });
}

// Everything that happens on one day: task occurrences, steps due, and goal deadlines
export function itemsOn(day) {
  const tasks = data.tasks.filter(t => occursOn(t, day));
  const steps = data.steps.filter(s => s.dueDate === day);
  const goals = data.goals.filter(g => g.targetDate === day);
  return { tasks, steps, goals };
}

export function overdue() {
  const today = todayKey();
  return {
    tasks: data.tasks.filter(t => (t.repeat || 'none') === 'none' && t.date && t.date < today && !t.done),
    steps: data.steps.filter(s => s.dueDate && s.dueDate < today && !s.done && goalActive(s.goalId)),
  };
}

function goalActive(goalId) {
  const g = get('goals', goalId);
  return g && g.status !== 'done';
}

export function sortTasks(tasks, day) {
  return [...tasks].sort((a, b) => {
    const da = isTaskDone(a, day), db = isTaskDone(b, day);
    if (da !== db) return da ? 1 : -1;
    if ((a.time || '') !== (b.time || '')) return !a.time ? 1 : !b.time ? -1 : a.time.localeCompare(b.time);
    return (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.createdAt - b.createdAt;
  });
}
