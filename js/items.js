// Row markup shared by the views. Clicks are handled in main.js through the data-action attributes.

import * as store from './store.js';
import { formatTime, relativeDay, REPEATS, REPEAT_SHORT } from './dates.js';
import { esc, icon } from './ui.js';

function goalTag(goalId) {
  const g = goalId && store.get('goals', goalId);
  if (!g) return '';
  return `<a class="goal-tag" href="#/goal/${g.id}" style="--c:${esc(g.color)}">${esc(g.title)}</a>`;
}

// day: which day's tick to show (matters for repeating tasks). showDate: show the date in the meta line.
export function taskRow(task, day, { showDate = false } = {}) {
  const done = store.isTaskDone(task, day);
  const repeat = task.repeat && task.repeat !== 'none';
  const meta = [
    showDate && task.date && !repeat ? `<span>${esc(relativeDay(task.date))}</span>` : '',
    task.time ? `<span>${icon('clock')}${esc(formatTime(task.time))}</span>` : '',
    repeat ? `<span title="${esc(REPEATS[task.repeat])}">${icon('repeat')}${esc(REPEAT_SHORT[task.repeat])}</span>` : '',
    goalTag(task.goalId),
  ].filter(Boolean).join('');
  return `
    <li class="item ${done ? 'done' : ''} ${task.priority ? 'important' : ''}">
      <button class="tick" data-action="toggle-task" data-id="${task.id}" data-day="${day}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(task.title)}">${icon('check')}</button>
      <button class="item-main" data-action="edit-task" data-id="${task.id}">
        <span class="item-title">${task.priority ? icon('star', 'star') : ''}${esc(task.title)}</span>
        ${meta ? `<span class="item-meta">${meta}</span>` : ''}
      </button>
    </li>`;
}

export function stepRow(step, { showGoal = true, showDate = true, controls = '' } = {}) {
  const goal = store.get('goals', step.goalId);
  const meta = [
    showDate && step.dueDate ? `<span>${icon('flag')}${esc(relativeDay(step.dueDate))}</span>` : '',
    showGoal ? goalTag(step.goalId) : '',
  ].filter(Boolean).join('');
  return `
    <li class="item step ${step.done ? 'done' : ''}" style="--c:${esc(goal ? goal.color : 'var(--accent)')}">
      <button class="tick" data-action="toggle-step" data-id="${step.id}" aria-pressed="${!!step.done}" aria-label="${step.done ? 'Mark not done' : 'Mark done'}: ${esc(step.title)}">${icon('check')}</button>
      <button class="item-main" data-action="edit-step" data-id="${step.id}">
        <span class="item-title">${esc(step.title)}</span>
        ${meta ? `<span class="item-meta">${meta}</span>` : ''}
      </button>
      ${controls}
    </li>`;
}

export function deadlineRow(goal) {
  return `
    <li class="item deadline" style="--c:${esc(goal.color)}">
      <span class="tick-static">${icon('flag')}</span>
      <a class="item-main" href="#/goal/${goal.id}">
        <span class="item-title">Deadline: ${esc(goal.title)}</span>
        <span class="item-meta"><span>${store.goalProgress(goal.id).pct}% done</span></span>
      </a>
    </li>`;
}

export function progressBar(pct, color) {
  return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="--c:${esc(color)}"><span style="width:${pct}%"></span></div>`;
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p><p class="muted">${esc(text)}</p>${action}</div>`;
}
