// App shell: hash routing (#/today, #/goals, #/goal/<id>, #/timeline, #/calendar, #/settings),
// shared click actions, and wiring between local changes, re-rendering and Google sync.

import * as store from './store.js';
import * as google from './google.js';
import { todayKey } from './dates.js';
import { esc, icon, vibrate } from './ui.js';
import { taskForm, goalForm, stepForm } from './forms.js';
import * as today from './views/today.js';
import * as goals from './views/goals.js';
import * as timeline from './views/timeline.js';
import * as calendar from './views/calendar.js';
import * as settings from './views/settings.js';

const NAV = [
  ['today', 'Today', 'sun'],
  ['goals', 'Goals', 'target'],
  ['timeline', 'Timeline', 'timeline'],
  ['calendar', 'Calendar', 'calendar'],
  ['settings', 'Settings', 'settings'],
];

const main = document.getElementById('main');
let renderedDay = todayKey();

function route() {
  const [name = 'today', param] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'today', param };
}

function render() {
  const { name, param } = route();
  renderedDay = todayKey();
  let view;
  switch (name) {
    case 'goals': view = { html: goals.renderList(), mount: goals.mountList }; break;
    case 'goal': view = { html: goals.renderDetail(param), mount: goals.mountDetail }; break;
    case 'timeline': view = timeline; break;
    case 'calendar': view = calendar; break;
    case 'settings': view = settings; break;
    default: view = today;
  }
  main.innerHTML = view.html ?? view.render();
  view.mount?.(main, render);
  const active = name === 'goal' ? 'goals' : name;
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  renderSyncBadge();
}

function renderNav() {
  const links = NAV.map(([key, label, ic]) => `<a href="#/${key}" data-nav="${key}">${icon(ic)}<span>${label}</span></a>`).join('');
  document.getElementById('sideNav').innerHTML = links;
  document.getElementById('tabBar').innerHTML = links;
}

// Small cloud button in the header showing Google sync state
function renderSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (!google.enabled || !google.account) { el.hidden = true; return; }
  el.hidden = false;
  const s = google.status.state;
  const needsSignin = !google.tokenValid();
  const label = needsSignin ? 'Reconnect' : s === 'busy' ? 'Syncing…' : s === 'error' ? 'Sync error' : 'Synced';
  el.className = `sync-badge ${needsSignin ? 'signin' : s}`;
  el.innerHTML = `${icon('cloud')}<span>${esc(label)}</span>`;
  el.title = google.status.message || label;
}

document.getElementById('syncBadge').addEventListener('click', () => {
  if (!google.tokenValid()) google.signIn();
  else if (google.status.state === 'error') location.hash = '#/settings';
  else google.syncNow();
});

// Clicks on rows and buttons anywhere in the app
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'toggle-task': {
      const task = store.get('tasks', id);
      if (!task) return;
      store.toggleTask(task, el.dataset.day || todayKey());
      vibrate();
      break;
    }
    case 'toggle-step': {
      const step = store.get('steps', id);
      if (step) { store.toggleStep(step); vibrate(); }
      break;
    }
    case 'edit-task': { const t = store.get('tasks', id); if (t) taskForm(t); break; }
    case 'new-task': taskForm({}, { date: el.dataset.date ?? todayKey(), goalId: el.dataset.goal || '' }); break;
    case 'edit-step': { const s = store.get('steps', id); if (s) stepForm(s.goalId, s); break; }
    case 'new-step': stepForm(el.dataset.goal); break;
    case 'move-step': goals.moveStep(id, Number(el.dataset.dir)); break;
    case 'new-goal': goalForm(); break;
    case 'edit-goal': { const g = store.get('goals', id); if (g) goalForm(g); break; }
    case 'achieve-goal': store.upsert('goals', { id, status: 'done', achievedAt: Date.now() }); vibrate(); break;
    default: return;
  }
});

document.getElementById('fab').addEventListener('click', () => {
  const { name, param } = route();
  if (name === 'goals' || name === 'timeline') goalForm();
  else if (name === 'goal' && store.get('goals', param)) stepForm(param);
  else taskForm({}, { date: todayKey() });
});

store.onChange(() => {
  render();
  google.scheduleSync();
});

google.onStatus(() => {
  renderSyncBadge();
  if (route().name === 'settings') {
    // Keep the open settings page current, without rebuilding it while a checkbox is being used
    if (!document.activeElement || !document.activeElement.matches('[data-g-opt]')) render();
  }
  if (google.status.state === 'ok') {
    calendar.resetEvents();
    if (route().name === 'calendar') render();
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// Coming back to the app on a new day: redraw so "Today" is today; also sync if signed in
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (renderedDay !== todayKey()) render();
  if (google.tokenValid()) google.syncNow();
  else renderSyncBadge();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.applyTheme(localStorage.getItem(settings.THEME_KEY)));
settings.applyTheme(localStorage.getItem(settings.THEME_KEY));

renderNav();
render();
if (google.tokenValid()) google.syncNow();
else if (google.account) google.loadGoogle().catch(() => {});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
