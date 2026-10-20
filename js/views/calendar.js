// Calendar: a month grid of tasks, goal steps, goal deadlines and (if signed in) Google Calendar events,
// with the chosen day's full list underneath.

import * as store from '../store.js';
import * as google from '../google.js';
import { todayKey, addDays, addMonths, startOfMonth, daysInMonth, weekday, formatMonth, formatLong, formatTime } from '../dates.js';
import { esc, icon } from '../ui.js';
import { taskRow, stepRow, deadlineRow } from '../items.js';

let month = startOfMonth(todayKey());
let selected = todayKey();
let gEvents = null;     // events for the month on screen
let gEventsFor = '';
let gError = '';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function goalColor(goalId) {
  const g = goalId && store.get('goals', goalId);
  return g ? g.color : 'var(--accent)';
}

function gridRange() {
  const lead = (weekday(month) + 6) % 7; // Monday first
  const first = addDays(month, -lead);
  const cells = Math.ceil((lead + daysInMonth(month)) / 7) * 7;
  return { first, last: addDays(first, cells - 1), cells };
}

export function render() {
  const today = todayKey();
  const { first, last, cells } = gridRange();
  const rangeKey = `${first}|${last}`;
  const events = gEventsFor === rangeKey ? gEvents : null;

  const days = [];
  for (let i = 0; i < cells; i++) {
    const day = addDays(first, i);
    const { tasks, steps, goals } = store.itemsOn(day);
    const chips = [
      ...goals.map(g => ({ cls: 'deadline', c: g.color, text: '🏁 ' + g.title })),
      ...store.sortTasks(tasks, day).map(t => ({ cls: store.isTaskDone(t, day) ? 'done' : '', c: goalColor(t.goalId), text: (t.time ? formatTime(t.time) + ' ' : '') + t.title })),
      ...steps.map(s => ({ cls: 'step' + (s.done ? ' done' : ''), c: goalColor(s.goalId), text: '🎯 ' + s.title })),
      ...((events && events[day]) || []).map(e => ({ cls: 'gcal', c: 'var(--muted)', text: (e.time ? formatTime(e.time) + ' ' : '') + e.title })),
    ];
    days.push(`
      <button class="cal-day ${day.slice(0, 7) !== month.slice(0, 7) ? 'other' : ''} ${day === today ? 'today' : ''} ${day === selected ? 'selected' : ''}"
        data-day="${day}" aria-label="${esc(formatLong(day))}, ${chips.length} item${chips.length === 1 ? '' : 's'}">
        <span class="cal-num">${Number(day.slice(8))}</span>
        <span class="cal-chips">${chips.slice(0, 3).map(ch => `<span class="cal-chip ${ch.cls}" style="--c:${esc(ch.c || 'var(--accent)')}">${esc(ch.text)}</span>`).join('')}
          ${chips.length > 3 ? `<span class="cal-more">+${chips.length - 3}</span>` : ''}</span>
        <span class="cal-dots">${chips.slice(0, 4).map(ch => `<i class="${ch.cls}" style="--c:${esc(ch.c || 'var(--accent)')}"></i>`).join('')}</span>
      </button>`);
  }

  const sel = store.itemsOn(selected);
  const selEvents = (events && events[selected]) || [];
  const hasAny = sel.tasks.length || sel.steps.length || sel.goals.length || selEvents.length;
  let gNote = '';
  if (google.canShowEvents() && !google.tokenValid()) gNote = 'Reconnect Google (top right) to see your Google Calendar events.';
  else if (gError) gNote = gError;

  return `
    <div class="page-head">
      <h1 class="page-title">Calendar</h1>
      <button class="btn btn-primary" data-action="new-task" data-date="${selected}">${icon('plus')} Task</button>
    </div>
    <section class="card calendar">
      <div class="cal-head" data-cal-nav>
        <button class="icon-btn" data-shift="-1" aria-label="Previous month">${icon('chevronLeft')}</button>
        <h2>${esc(formatMonth(month))}</h2>
        <button class="icon-btn" data-shift="1" aria-label="Next month">${icon('chevronRight')}</button>
        <button class="btn btn-text" data-shift="0">Today</button>
      </div>
      <div class="cal-grid" data-cal-grid>
        ${WEEKDAYS.map(w => `<span class="cal-wd">${w}</span>`).join('')}
        ${days.join('')}
      </div>
      <div class="cal-legend small muted">
        <span>Colours match your goals</span><span>🎯 Goal step</span><span>🏁 Goal deadline</span>
        ${google.canShowEvents() ? '<span><i class="gcal"></i>Google Calendar</span>' : ''}
      </div>
      ${gNote ? `<p class="small muted">${esc(gNote)}</p>` : ''}
    </section>
    <section class="card">
      <div class="section-head">
        <h2 class="section-title">${esc(formatLong(selected))}</h2>
        <button class="btn btn-text" data-action="new-task" data-date="${selected}">${icon('plus')} Task</button>
      </div>
      ${hasAny ? `<ul class="list">
        ${sel.goals.map(deadlineRow).join('')}
        ${store.sortTasks(sel.tasks, selected).map(t => taskRow(t, selected)).join('')}
        ${sel.steps.map(s => stepRow(s, { showDate: false })).join('')}
        ${selEvents.map(e => `<li class="item gcal-item">
          <span class="tick-static">${icon('calendar')}</span>
          <a class="item-main" href="${esc(e.link || '#')}" target="_blank" rel="noopener">
            <span class="item-title">${esc(e.title)}</span>
            <span class="item-meta"><span>${e.time ? esc(formatTime(e.time)) : 'All day'} · Google Calendar</span></span>
          </a></li>`).join('')}
      </ul>` : '<p class="muted small">Nothing on this day.</p>'}
    </section>`;
}

export function mount(root, rerender) {
  root.querySelector('[data-cal-nav]').addEventListener('click', e => {
    const b = e.target.closest('[data-shift]');
    if (!b) return;
    const n = Number(b.dataset.shift);
    if (n === 0) { month = startOfMonth(todayKey()); selected = todayKey(); }
    else { month = addMonths(month, n); selected = month.slice(0, 7) === todayKey().slice(0, 7) ? todayKey() : month; }
    rerender();
  });
  root.querySelector('[data-cal-grid]').addEventListener('click', e => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    selected = b.dataset.day;
    if (selected.slice(0, 7) !== month.slice(0, 7)) month = startOfMonth(selected);
    rerender();
  });
  loadEvents(rerender);
}

async function loadEvents(rerender) {
  const { first, last } = gridRange();
  const key = `${first}|${last}`;
  if (gEventsFor === key || !google.canShowEvents() || !google.tokenValid()) return;
  try {
    const events = await google.eventsBetween(first, last);
    gEvents = events;
    gEventsFor = key;
    gError = '';
  } catch (err) {
    gError = `Could not load Google Calendar events: ${err.message}`;
    gEventsFor = key;
    gEvents = null;
  }
  // Only redraw if the user is still looking at this month
  if (location.hash.startsWith('#/calendar') && gridRange().first === first) rerender();
}

export function resetEvents() { gEventsFor = ''; gEvents = null; gError = ''; }
