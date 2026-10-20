// Goals list (grouped by status, filterable by category) and the goal detail page with its steps.

import * as store from '../store.js';
import { todayKey, formatDate, daysLeftLabel, daysBetween } from '../dates.js';
import { esc, icon } from '../ui.js';
import { taskRow, stepRow, progressBar, emptyState } from '../items.js';
import * as filter from '../filter.js';

function categoryPill(g) {
  const c = store.get('categories', g.categoryId);
  return c ? `<span class="pill" style="--c:${esc(c.color)}">${esc(c.name)}</span>` : '<span></span>';
}

export function renderList() {
  const goals = store.data.goals;
  if (!goals.length) {
    return `<h1 class="page-title">Goals</h1>
      <section class="card">${emptyState('Set your first goal',
        'Pick something you want to achieve, give it a target date, then break it into small steps.',
        `<button class="btn btn-primary" data-action="new-goal">${icon('plus')} New goal</button>`)}</section>`;
  }
  const shown = goals.filter(filter.matches);
  const groups = [
    ['active', 'Active'],
    ['paused', 'Paused'],
    ['done', 'Achieved'],
  ].map(([status, label]) => [label, shown.filter(g => (g.status || 'active') === status)
    .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))]);

  return `
    <div class="page-head">
      <h1 class="page-title">Goals</h1>
      <button class="btn btn-primary" data-action="new-goal">${icon('plus')} New goal</button>
    </div>
    ${filter.filterBar()}
    ${shown.length ? '' : '<p class="muted">No goals in this category.</p>'}
    ${groups.filter(([, list]) => list.length).map(([label, list]) => `
      <h2 class="group-title">${label} <span class="muted">${list.length}</span></h2>
      <div class="goal-grid">${list.map(goalCard).join('')}</div>`).join('')}`;
}

function goalCard(g) {
  const p = store.goalProgress(g.id);
  const next = store.goalSteps(g.id).find(s => !s.done);
  const late = g.status === 'active' && g.targetDate && g.targetDate < todayKey();
  const color = store.colorOf(g);
  return `
    <a class="card goal-card ${g.status === 'done' ? 'achieved' : ''}" href="#/goal/${g.id}" style="--c:${esc(color)}">
      <div class="goal-card-top">
        ${categoryPill(g)}
        ${g.targetDate ? `<span class="small ${late ? 'danger-ink' : 'muted'}">${g.status === 'done' ? '🎉 Achieved' : esc(daysLeftLabel(g.targetDate))}</span>` : ''}
      </div>
      <h3>${esc(g.title)}</h3>
      ${progressBar(p.pct, color)}
      <div class="goal-card-foot">
        <span class="muted small">${p.total ? `${p.done} of ${p.total} steps` : 'No steps yet'}</span>
        <span class="small strong">${p.pct}%</span>
      </div>
      ${next && g.status !== 'done' ? `<p class="small next-step">Next: ${esc(next.title)}</p>` : ''}
    </a>`;
}

export function renderDetail(id) {
  const g = store.get('goals', id);
  if (!g) {
    return `<section class="card">${emptyState('Goal not found', 'It may have been deleted.', '<a class="btn btn-primary" href="#/goals">Back to goals</a>')}</section>`;
  }
  const steps = store.goalSteps(id);
  const p = store.goalProgress(id);
  const color = store.colorOf(g);
  const tasks = store.data.tasks.filter(t => t.goalId === id);
  const today = todayKey();
  let timeInfo = '';
  if (g.startDate && g.targetDate) {
    const span = Math.max(1, daysBetween(g.startDate, g.targetDate));
    const elapsed = Math.min(span, Math.max(0, daysBetween(g.startDate, today)));
    const timePct = Math.round((elapsed / span) * 100);
    const ahead = p.total && g.status === 'active' && today >= g.startDate
      ? (p.pct >= timePct ? '<span class="good-ink">On track</span>' : '<span class="warn-ink">Behind schedule</span>') : '';
    timeInfo = `
      <div class="time-track">
        <div class="time-track-labels"><span>${esc(formatDate(g.startDate))}</span><span>${esc(formatDate(g.targetDate))}</span></div>
        <div class="time-bar"><span style="width:${timePct}%"></span><i style="left:${timePct}%"></i></div>
        <p class="small muted">${timePct}% of the time used · ${p.pct}% of steps done ${ahead ? '· ' + ahead : ''}</p>
      </div>`;
  }
  const stepControls = (s, i) => `
    <span class="row-controls">
      <button class="icon-btn" data-action="move-step" data-id="${s.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button>
      <button class="icon-btn" data-action="move-step" data-id="${s.id}" data-dir="1" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button>
    </span>`;

  return `
    <a class="back" href="#/goals">${icon('chevronLeft')} Goals</a>
    <section class="card goal-hero" style="--c:${esc(color)}">
      <div class="goal-card-top">
        ${categoryPill(g)}
        <button class="btn btn-text" data-action="edit-goal" data-id="${g.id}">${icon('edit')} Edit</button>
      </div>
      <h1>${esc(g.title)}</h1>
      ${g.description ? `<p class="why">${esc(g.description)}</p>` : ''}
      <div class="goal-stats">
        <div><strong>${p.pct}%</strong><span class="muted small">complete</span></div>
        <div><strong>${p.done}/${p.total}</strong><span class="muted small">steps</span></div>
        <div><strong>${g.status === 'done' ? '🎉' : g.targetDate ? esc(daysLeftLabel(g.targetDate).split(' ')[0]) : '–'}</strong>
          <span class="muted small">${g.status === 'done' ? 'achieved' : g.targetDate ? esc(daysLeftLabel(g.targetDate).split(' ').slice(1).join(' ')) : 'no target date'}</span></div>
      </div>
      ${progressBar(p.pct, color)}
      ${timeInfo}
      ${g.status !== 'done' && p.total && p.done === p.total ? `
        <div class="celebrate">All steps done! <button class="btn btn-primary" data-action="achieve-goal" data-id="${g.id}">Mark goal achieved 🎉</button></div>` : ''}
    </section>

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">Steps</h2>
        <button class="btn btn-text" data-action="new-step" data-goal="${g.id}">${icon('plus')} Step</button>
      </div>
      ${steps.length ? `<ol class="list steps">${steps.map((s, i) => stepRow(s, { showGoal: false, controls: stepControls(s, i) })).join('')}</ol>`
        : `<p class="muted small">Break this goal into small, concrete steps. Give them due dates and they show up on Today and in the calendar.</p>`}
      <form class="quick-add inline" data-add-step="${g.id}">
        <input name="title" placeholder="Add a step…" aria-label="Add a step" maxlength="200" autocomplete="off">
        <button class="btn btn-secondary" type="submit" aria-label="Add step">${icon('plus')}</button>
      </form>
    </section>

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">Habits & tasks for this goal</h2>
        <button class="btn btn-text" data-action="new-task" data-goal="${g.id}" data-date="${today}">${icon('plus')} Task</button>
      </div>
      ${tasks.length ? `<ul class="list">${store.sortTasks(tasks, today).map(t => taskRow(t, today, { showDate: true })).join('')}</ul>`
        : `<p class="muted small">Link regular tasks here, e.g. "Run 3 km" every weekday.</p>`}
    </section>`;
}

export function mountDetail(root) {
  const form = root.querySelector('[data-add-step]');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (!title) return;
    const goalId = form.dataset.addStep;
    const order = Math.max(-1, ...store.goalSteps(goalId).map(s => s.order ?? 0)) + 1;
    store.upsert('steps', { goalId, title, order, done: false, dueDate: '', notes: '' });
    requestAnimationFrame(() => document.querySelector('[data-add-step] input')?.focus());
  });
}

export function moveStep(id, dir) {
  const step = store.get('steps', id);
  const steps = store.goalSteps(step.goalId);
  const i = steps.findIndex(s => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= steps.length) return;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  // Renumber so every step has a distinct order
  steps.forEach((s, n) => { if (s.order !== n) store.upsert('steps', { id: s.id, order: n }); });
}
