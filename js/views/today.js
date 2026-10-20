// Today: what's overdue, what's on today, what's coming up this week, undated tasks, and active goals.

import * as store from '../store.js';
import { todayKey, addDays, formatLong, relativeDay, daysLeftLabel } from '../dates.js';
import { esc, icon } from '../ui.js';
import { taskRow, stepRow, deadlineRow, progressBar, emptyState } from '../items.js';
import * as filter from '../filter.js';

// Items of one day, narrowed to the chosen category
function on(day) {
  const { tasks, steps, goals } = store.itemsOn(day);
  return { tasks: tasks.filter(filter.matches), steps: steps.filter(filter.matches), goals: goals.filter(filter.matches) };
}

export function render() {
  const today = todayKey();
  const { tasks, steps, goals } = on(today);
  const allLate = store.overdue();
  const late = { tasks: allLate.tasks.filter(filter.matches), steps: allLate.steps.filter(filter.matches) };
  const inbox = store.data.tasks.filter(t => !t.date && !t.done && filter.matches(t));
  const doneInbox = store.data.tasks.filter(t => !t.date && t.done && filter.matches(t));

  const todayTasks = store.sortTasks(tasks, today);
  const total = todayTasks.length + steps.length;
  const done = todayTasks.filter(t => store.isTaskDone(t, today)).length + steps.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const upcoming = [];
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    const items = on(day);
    // Daily repeating tasks would fill every day, so the week ahead shows only one-off tasks
    const oneOff = items.tasks.filter(t => (t.repeat || 'none') === 'none' && !t.done);
    const openSteps = items.steps.filter(s => !s.done);
    if (oneOff.length || openSteps.length || items.goals.length) upcoming.push({ day, tasks: oneOff, steps: openSteps, goals: items.goals });
  }

  const activeGoals = store.data.goals.filter(g => g.status === 'active' && filter.matches(g))
    .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));

  return `
    <section class="hero">
      <div>
        <p class="eyebrow">${esc(formatLong(today))}</p>
        <h1>${greeting}</h1>
        <p class="muted">${total ? `${done} of ${total} done today` : 'Nothing planned yet for today'}</p>
      </div>
      ${total ? `<div class="ring" style="--p:${pct}" aria-label="${pct}% of today done"><span>${pct}%</span></div>` : ''}
    </section>

    <form class="quick-add" data-quick-add>
      <input name="title" placeholder="Add a task for today…" aria-label="Add a task for today" maxlength="200" autocomplete="off">
      <button class="btn btn-primary" type="submit" aria-label="Add">${icon('plus')}</button>
    </form>
    ${filter.filterBar()}

    ${late.tasks.length || late.steps.length ? `
      <section class="card">
        <h2 class="section-title danger-ink">Overdue</h2>
        <ul class="list">
          ${late.tasks.map(t => taskRow(t, today, { showDate: true })).join('')}
          ${late.steps.map(s => stepRow(s)).join('')}
        </ul>
      </section>` : ''}

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">Today</h2>
        <button class="btn btn-text" data-action="new-task" data-date="${today}">${icon('plus')} Task</button>
      </div>
      ${total || goals.length ? `<ul class="list">
        ${goals.map(deadlineRow).join('')}
        ${todayTasks.map(t => taskRow(t, today)).join('')}
        ${steps.map(s => stepRow(s, { showDate: false })).join('')}
      </ul>` : emptyState('A clear day', 'Add a task above, or give a goal some steps with due dates.')}
    </section>

    ${activeGoals.length ? `
      <section class="card">
        <div class="section-head">
          <h2 class="section-title">Your goals</h2>
          <a class="btn btn-text" href="#/goals">See all</a>
        </div>
        <div class="goal-strip">
          ${activeGoals.slice(0, 6).map(g => {
            const p = store.goalProgress(g.id);
            const next = store.goalSteps(g.id).find(s => !s.done);
            const color = store.colorOf(g);
            return `<a class="goal-mini" href="#/goal/${g.id}" style="--c:${esc(color)}">
              <span class="goal-mini-title">${esc(g.title)}</span>
              ${progressBar(p.pct, color)}
              <span class="muted small">${p.total ? `${p.done}/${p.total} steps` : 'No steps yet'}${g.targetDate ? ` · ${esc(daysLeftLabel(g.targetDate))}` : ''}</span>
              ${next ? `<span class="small next-step">Next: ${esc(next.title)}</span>` : ''}
            </a>`;
          }).join('')}
        </div>
      </section>` : filter.isActive() ? '' : `
      <section class="card">
        ${emptyState('No goals yet', 'Goals give your days direction. Start with one thing you want to achieve this year.',
          `<button class="btn btn-primary" data-action="new-goal">${icon('target')} Create your first goal</button>`)}
      </section>`}

    ${upcoming.length ? `
      <section class="card">
        <h2 class="section-title">Next 7 days</h2>
        ${upcoming.map(u => `
          <h3 class="day-label">${esc(relativeDay(u.day))}</h3>
          <ul class="list">
            ${u.goals.map(deadlineRow).join('')}
            ${store.sortTasks(u.tasks, u.day).map(t => taskRow(t, u.day)).join('')}
            ${u.steps.map(s => stepRow(s, { showDate: false })).join('')}
          </ul>`).join('')}
      </section>` : ''}

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">${icon('inbox')} Inbox <span class="muted small">tasks without a date</span></h2>
        <button class="btn btn-text" data-action="new-task" data-date="">${icon('plus')} Task</button>
      </div>
      ${inbox.length ? `<ul class="list">${store.sortTasks(inbox, today).map(t => taskRow(t, today)).join('')}</ul>`
        : `<p class="muted small">Ideas and to-dos for "some time" go here.</p>`}
      ${doneInbox.length ? `<details class="done-list"><summary>${doneInbox.length} done</summary>
        <ul class="list">${doneInbox.map(t => taskRow(t, today)).join('')}</ul></details>` : ''}
    </section>`;
}

export function mount(root) {
  const form = root.querySelector('[data-quick-add]');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (!title) return;
    store.upsert('tasks', { title, date: todayKey(), time: '', repeat: 'none', notes: '', goalId: '', categoryId: filter.selectedCategory(), priority: false });
    // The page re-renders after the change; put the cursor back in the new box
    requestAnimationFrame(() => document.querySelector('[data-quick-add] input')?.focus());
  });
}
