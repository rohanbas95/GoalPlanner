// Timeline: each goal as a bar from its start to its target date, with its steps as dots.

import * as store from '../store.js';
import { todayKey, addMonths, startOfMonth, daysBetween, formatShortMonth, formatDate, addDays } from '../dates.js';
import { esc, icon } from '../ui.js';

let months = 6;
let offset = 0; // months moved with the arrows
let showDone = false;

export function render() {
  const today = todayKey();
  const from = addMonths(startOfMonth(today), offset - (months >= 6 ? 1 : 0));
  const to = addDays(addMonths(from, months), -1);
  const span = daysBetween(from, to) + 1;
  const pos = key => (Math.min(Math.max(daysBetween(from, key), 0), span) / span) * 100;

  const monthCols = [];
  for (let m = 0; m < months; m++) {
    const start = addMonths(from, m);
    monthCols.push({ key: start, left: pos(start), label: formatShortMonth(start) + (start.slice(5, 7) === '01' || m === 0 ? ` ${start.slice(0, 4)}` : '') });
  }

  const goals = store.data.goals.filter(g => showDone || g.status !== 'done');
  const dated = goals.filter(g => g.startDate || g.targetDate)
    .sort((a, b) => (a.startDate || a.targetDate).localeCompare(b.startDate || b.targetDate));
  const undated = goals.filter(g => !g.startDate && !g.targetDate);
  const todayIn = today >= from && today <= to;

  const rows = dated.map(g => {
    const start = g.startDate || g.targetDate;
    const end = g.targetDate || g.startDate;
    const visible = end >= from && start <= to;
    const left = pos(start);
    const width = Math.max(pos(addDays(end, 1)) - left, 0.8);
    const p = store.goalProgress(g.id);
    const steps = store.goalSteps(g.id).filter(s => s.dueDate && s.dueDate >= from && s.dueDate <= to);
    return `
      <div class="tl-row">
        <a class="tl-label" href="#/goal/${g.id}" style="--c:${esc(g.color)}">
          <span class="dot"></span><span class="tl-name">${esc(g.title)}</span><span class="muted small">${p.pct}%</span>
        </a>
        <div class="tl-track">
          ${visible ? `<a class="tl-bar ${g.status === 'done' ? 'achieved' : ''} ${start < from ? 'cut-start' : ''} ${end > to ? 'cut-end' : ''}"
              href="#/goal/${g.id}" style="left:${left}%;width:${width}%;--c:${esc(g.color)}"
              title="${esc(g.title)}: ${esc(formatDate(start))} – ${esc(formatDate(end))}">
              <span class="tl-fill" style="width:${p.pct}%"></span>
            </a>` : `<span class="tl-off muted small">${end < from ? '← earlier' : 'later →'}</span>`}
          ${steps.map(s => `<button class="tl-step ${s.done ? 'done' : ''}" style="left:${pos(s.dueDate) + (50 / span)}%;--c:${esc(g.color)}"
              data-action="edit-step" data-id="${s.id}" title="${esc(s.title)} · ${esc(formatDate(s.dueDate))}" aria-label="Step: ${esc(s.title)}"></button>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-head">
      <h1 class="page-title">Timeline</h1>
      <button class="btn btn-primary" data-action="new-goal">${icon('plus')} New goal</button>
    </div>
    <div class="toolbar" data-tl-toolbar>
      <div class="segmented" role="group" aria-label="Range">
        ${[3, 6, 12].map(n => `<button data-months="${n}" class="${n === months ? 'on' : ''}">${n === 12 ? '1 year' : `${n} months`}</button>`).join('')}
      </div>
      <div class="nav-buttons">
        <button class="icon-btn" data-shift="-1" aria-label="Earlier">${icon('chevronLeft')}</button>
        <button class="btn btn-text" data-shift="0">Today</button>
        <button class="icon-btn" data-shift="1" aria-label="Later">${icon('chevronRight')}</button>
      </div>
      <label class="check small"><input type="checkbox" data-show-done ${showDone ? 'checked' : ''}> Show achieved</label>
    </div>
    <section class="card timeline">
      ${dated.length ? `<div class="tl-inner">
        <div class="tl-row tl-head">
          <div class="tl-label"></div>
          <div class="tl-track">
            ${monthCols.map(c => `<span class="tl-month" style="left:${c.left}%">${esc(c.label)}</span>`).join('')}
          </div>
        </div>
        <div class="tl-body">
          <div class="tl-grid" aria-hidden="true">
            ${monthCols.map(c => `<span style="left:${c.left}%"></span>`).join('')}
            ${todayIn ? `<i class="tl-today" style="left:${pos(today) + (50 / span)}%"><b>Today</b></i>` : ''}
          </div>
          ${rows}
        </div></div>`
      : `<p class="muted">Give your goals a start and target date to see them here.</p>`}
    </section>
    ${undated.length ? `<section class="card"><h2 class="section-title">Goals without dates</h2>
      <ul class="plain-list">${undated.map(g => `<li><a href="#/goal/${g.id}">${esc(g.title)}</a></li>`).join('')}</ul></section>` : ''}`;
}

export function mount(root, rerender) {
  const bar = root.querySelector('[data-tl-toolbar]');
  bar.addEventListener('click', e => {
    const m = e.target.closest('[data-months]');
    const s = e.target.closest('[data-shift]');
    if (m) { months = Number(m.dataset.months); offset = 0; rerender(); }
    if (s) { const n = Number(s.dataset.shift); offset = n === 0 ? 0 : offset + n * Math.max(1, months / 3); rerender(); }
  });
  bar.querySelector('[data-show-done]').addEventListener('change', e => { showDone = e.target.checked; rerender(); });
}
