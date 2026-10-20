// Google sign-in, Drive sync and Google Calendar, all from the browser (no server).
// Sign-in gives an access token that lasts about an hour; after that a tap is needed to reconnect,
// because browsers only let Google's sign-in window open from a tap.
//
// - Drive: the whole planner is saved as one JSON file in Drive's hidden app folder (only this app sees it)
//   and merged with this device's copy, so phone and laptop stay in step.
// - Calendar (write): dated tasks, goal steps and goal deadlines are copied into a separate "GoalPlanner"
//   calendar that this app creates. It can't touch your other calendars.
// - Calendar (read): your main calendar's events are shown in the Calendar view (read-only).

import { GOOGLE_CLIENT_ID } from './config.js';
import * as store from './store.js';
import { addDays, pad } from './dates.js';

const SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive.appdata',
  calWrite: 'https://www.googleapis.com/auth/calendar.app.created',
  calRead: 'https://www.googleapis.com/auth/calendar.events.readonly',
};
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const DRIVE_FILE = 'goal-planner.json';
const AUTH_KEY = 'goalPlanner.google.v1';
const PUSHED_KEY = 'goalPlanner.gcalPushed.v1';

export const enabled = !!GOOGLE_CLIENT_ID;

// { email, token, tokenExpiry, granted: {drive, calWrite, calRead}, lastSync, pushCalendar, showEvents }
export let account = readJSON(AUTH_KEY, null);
export const status = { state: account ? 'idle' : 'off', message: '' };

const listeners = new Set();
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(state, message = '') {
  status.state = state;
  status.message = message;
  listeners.forEach(fn => fn());
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveAccount() {
  if (account) localStorage.setItem(AUTH_KEY, JSON.stringify(account));
  else localStorage.removeItem(AUTH_KEY);
}

export function tokenValid() {
  return !!(account && account.token && account.tokenExpiry - 60000 > Date.now());
}

// ---------- Sign-in ----------

let tokenClient = null;
let loading = null;

export function loadGoogle() {
  if (!enabled) return Promise.reject(new Error('Google sign-in is not set up (see js/config.js).'));
  return loading || (loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: Object.values(SCOPES).join(' ') + ' email',
        callback: onToken,
        error_callback: onTokenError,
      });
      resolve();
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load Google sign-in. Check your internet connection.'));
    };
    document.head.appendChild(script);
  }));
}

// Must run straight from a tap, or the browser blocks Google's window
export function signIn() {
  if (!tokenClient) {
    setStatus('busy', 'Loading Google sign-in…');
    loadGoogle().then(
      () => setStatus(account ? 'signin' : 'off', 'Google sign-in is ready. Tap the button again.'),
      err => setStatus('error', err.message));
    return;
  }
  tokenClient.requestAccessToken(account && account.email ? { prompt: '', login_hint: account.email } : { prompt: 'consent' });
}

async function onToken(resp) {
  if (resp.error) return setStatus('error', `Google sign-in failed (${resp.error}).`);
  const has = scope => google.accounts.oauth2.hasGrantedAllScopes(resp, scope);
  const granted = { drive: has(SCOPES.drive), calWrite: has(SCOPES.calWrite), calRead: has(SCOPES.calRead) };
  let email = '';
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` } });
    if (res.ok) email = (await res.json()).email || '';
  } catch {}
  const same = account && (!email || account.email === email);
  account = {
    pushCalendar: true,
    showEvents: true,
    ...(same ? account : {}),
    email: email || (same ? account.email : ''),
    token: resp.access_token,
    tokenExpiry: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
    granted,
    lastSync: same ? account.lastSync : null,
  };
  if (!same) localStorage.removeItem(PUSHED_KEY);
  saveAccount();
  eventCache.clear();
  await syncNow();
}

function onTokenError(err) {
  const messages = {
    popup_closed: 'Google sign-in was closed before it finished.',
    popup_failed_to_open: 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  };
  setStatus(account ? 'signin' : 'off', messages[err && err.type] || 'Google sign-in did not finish.');
}

export function signOut() {
  if (account && account.token && window.google) {
    try { google.accounts.oauth2.revoke(account.token, () => {}); } catch {}
  }
  account = null;
  saveAccount();
  localStorage.removeItem(PUSHED_KEY);
  eventCache.clear();
  setStatus('off', 'Signed out. Your data is still on this device.');
}

export function setOption(name, value) {
  if (!account) return;
  account[name] = value;
  saveAccount();
  if (name === 'showEvents') eventCache.clear();
  listeners.forEach(fn => fn());
}

// ---------- API helper ----------

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${account.token}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body && !raw ? JSON.stringify(body) : body,
  });
  if (res.status === 401) {
    account.tokenExpiry = 0;
    saveAccount();
    throw new ApiError(401, 'Your Google session has ended. Tap "Reconnect" to sign in again.');
  }
  if (!res.ok) {
    let message = `Google returned an error (${res.status}).`;
    try { message = (await res.json()).error.message || message; } catch {}
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? null : res.json();
}

// ---------- Sync ----------

let syncing = false;
let syncTimer = null;

export function isSyncing() { return syncing; }

// Called after each local change; waits a moment so a burst of edits becomes one sync
export function scheduleSync() {
  if (syncing || !tokenValid()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 2500);
}

export async function syncNow() {
  if (!account) return;
  if (!tokenValid()) return setStatus('signin', 'Tap "Reconnect" to sync with Google.');
  if (syncing) return;
  syncing = true;
  clearTimeout(syncTimer);
  setStatus('busy', 'Syncing…');
  try {
    const g = account.granted || {};
    let fileId = null;
    if (g.drive) {
      fileId = await findDriveFile();
      if (fileId) {
        const remote = await api(`${DRIVE_API}/files/${fileId}?alt=media`);
        store.applyMerged(store.merge(store.data, remote));
      }
    }
    if (g.calWrite && account.pushCalendar) await pushCalendar();
    if (g.drive) await uploadDrive(fileId);
    account.lastSync = Date.now();
    saveAccount();
    setStatus('ok', 'Synced');
  } catch (err) {
    console.error(err);
    setStatus(err.status === 401 ? 'signin' : 'error', err.message || 'Sync failed.');
  } finally {
    syncing = false;
  }
}

async function findDriveFile() {
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const res = await api(`${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  return res.files && res.files[0] ? res.files[0].id : null;
}

async function uploadDrive(fileId) {
  const content = JSON.stringify(store.data);
  if (fileId) {
    await api(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, {
      method: 'PATCH', body: content, raw: true, headers: { 'Content-Type': 'application/json' },
    });
    return;
  }
  const boundary = 'gp' + Math.random().toString(36).slice(2);
  const meta = { name: DRIVE_FILE, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  await api(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST', body, raw: true, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  });
}

// ---------- Google Calendar: copy planner items into the "GoalPlanner" calendar ----------
// Event ids are derived from item ids ("gp" + id), so every device updates the same events instead of
// making duplicates. PUSHED_KEY remembers what was last sent from this device, so only changes are sent.

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function ymd(key) { return key.replaceAll('-', ''); }

function allDay(date) {
  return { start: { date, timeZone }, end: { date: addDays(date, 1), timeZone } };
}

function timed(date, time, minutes = 30) {
  const [h, m] = time.split(':').map(Number);
  const end = new Date(2000, 0, 1, h, m + minutes);
  const endDate = end.getDate() === 1 ? date : addDays(date, 1);
  return {
    start: { dateTime: `${date}T${time}:00`, timeZone },
    end: { dateTime: `${endDate}T${pad(end.getHours())}:${pad(end.getMinutes())}:00`, timeZone },
  };
}

// Google Calendar only offers 11 event colours; use the one nearest to the item's category colour
const GOOGLE_COLORS = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };

function googleColorId(hex) {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const [r, g, b] = rgb(hex);
  let best, bestDist = Infinity;
  for (const [id, h] of Object.entries(GOOGLE_COLORS)) {
    const [r2, g2, b2] = rgb(h);
    const dist = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (dist < bestDist) { best = id; bestDist = dist; }
  }
  return best;
}

const RRULES = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' };

function desiredEvents() {
  const events = new Map();
  const goalTitle = id => (store.get('goals', id) || {}).title || '';
  const footer = '\n\nAdded by GoalPlanner. Edit it in the app, changes made here are overwritten.';
  for (const t of store.data.tasks) {
    if (!t.date) continue;
    const repeat = t.repeat || 'none';
    const body = {
      summary: (repeat === 'none' && t.done ? '✓ ' : '') + t.title,
      description: [t.notes, t.goalId && `Goal: ${goalTitle(t.goalId)}`].filter(Boolean).join('\n') + footer,
      ...(t.time ? timed(t.date, t.time) : allDay(t.date)),
      transparency: t.time ? 'opaque' : 'transparent',
      colorId: googleColorId(store.colorOf(t)),
      status: 'confirmed',
    };
    if (repeat !== 'none') {
      const until = t.repeatUntil ? `;UNTIL=${ymd(t.repeatUntil)}${t.time ? 'T235959Z' : ''}` : '';
      body.recurrence = [`RRULE:${RRULES[repeat]}${until}`];
    }
    events.set('gp' + t.id, body);
  }
  for (const s of store.data.steps) {
    if (!s.dueDate) continue;
    const goal = store.get('goals', s.goalId);
    if (!goal) continue;
    events.set('gp' + s.id, {
      summary: `${s.done ? '✓ ' : ''}🎯 ${s.title}`,
      description: [`Step towards: ${goal.title}`, s.notes].filter(Boolean).join('\n') + footer,
      ...allDay(s.dueDate),
      transparency: 'transparent',
      colorId: googleColorId(store.colorOf(s)),
      status: 'confirmed',
    });
  }
  for (const g of store.data.goals) {
    if (!g.targetDate) continue;
    events.set('gp' + g.id, {
      summary: `${g.status === 'done' ? '✓ ' : ''}🏁 Goal deadline: ${g.title}`,
      description: (g.description || '') + footer,
      ...allDay(g.targetDate),
      transparency: 'transparent',
      colorId: googleColorId(store.colorOf(g)),
      status: 'confirmed',
    });
  }
  return events;
}

async function ensureCalendar() {
  let id = store.data.settings.gcalCalendarId;
  if (id) return id;
  const cal = await api(`${CAL_API}/calendars`, { method: 'POST', body: { summary: 'GoalPlanner', description: 'Goals, steps and tasks from GoalPlanner', timeZone } });
  store.setSetting('gcalCalendarId', cal.id);
  return cal.id;
}

async function pushCalendar(retry = true) {
  const calId = await ensureCalendar();
  let pushed = readJSON(PUSHED_KEY, null);
  if (!pushed || pushed.calendarId !== calId) pushed = { calendarId: calId, events: {} };
  const save = () => localStorage.setItem(PUSHED_KEY, JSON.stringify(pushed));
  const base = `${CAL_API}/calendars/${encodeURIComponent(calId)}/events`;
  const want = desiredEvents();
  try {
    for (const [id, body] of want) {
      const hash = JSON.stringify(body);
      if (pushed.events[id] === hash) continue;
      try {
        await api(`${base}/${id}`, { method: 'PUT', body });
      } catch (err) {
        if (err.status !== 404) throw err;
        await api(base, { method: 'POST', body: { id, ...body } });
      }
      pushed.events[id] = hash;
      save();
    }
    for (const id of Object.keys(pushed.events)) {
      if (want.has(id)) continue;
      try {
        await api(`${base}/${id}`, { method: 'DELETE' });
      } catch (err) {
        if (err.status !== 404 && err.status !== 410) throw err;
      }
      delete pushed.events[id];
      save();
    }
  } catch (err) {
    // The GoalPlanner calendar was deleted in Google Calendar: make a fresh one and send everything again
    if (err.status === 404 && retry) {
      store.setSetting('gcalCalendarId', '');
      localStorage.removeItem(PUSHED_KEY);
      return pushCalendar(false);
    }
    throw err;
  }
}

// ---------- Google Calendar: read events from the main calendar for the Calendar view ----------

const eventCache = new Map();

export function canShowEvents() {
  return !!(account && account.showEvents && account.granted && account.granted.calRead);
}

// Returns { 'YYYY-MM-DD': [{ title, time, allDay }] } for days in [from, to], or null if unavailable
export async function eventsBetween(from, to) {
  if (!canShowEvents() || !tokenValid()) return null;
  const key = `${from}|${to}`;
  if (eventCache.has(key)) return eventCache.get(key);
  const params = new URLSearchParams({
    timeMin: new Date(from + 'T00:00:00').toISOString(),
    timeMax: new Date(addDays(to, 1) + 'T00:00:00').toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
  });
  const res = await api(`${CAL_API}/calendars/primary/events?${params}`);
  const byDay = {};
  for (const ev of res.items || []) {
    if (ev.status === 'cancelled') continue;
    const title = ev.summary || '(No title)';
    if (ev.start.date) {
      // All-day events can span several days; end date is exclusive
      for (let d = ev.start.date; d < ev.end.date && d <= to; d = addDays(d, 1)) {
        if (d >= from) (byDay[d] ||= []).push({ title, allDay: true, link: ev.htmlLink });
      }
    } else {
      const start = new Date(ev.start.dateTime);
      const d = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      (byDay[d] ||= []).push({ title, time: `${pad(start.getHours())}:${pad(start.getMinutes())}`, link: ev.htmlLink });
    }
  }
  eventCache.set(key, byDay);
  return byDay;
}

export function clearEventCache() { eventCache.clear(); }
