// Settings: theme, Google sign-in and sync options, backup (export / import) and clearing data.

import * as store from '../store.js';
import * as google from '../google.js';
import { esc, toast, confirmDialog, icon } from '../ui.js';

export const THEME_KEY = 'goalPlanner.theme.v1';

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#111827' : '#0f766e';
}

function googleSection() {
  if (!google.enabled) {
    return `<p class="muted small">Google sign-in isn't set up. Add an OAuth client ID in <code>js/config.js</code> (see README).</p>`;
  }
  const a = google.account;
  if (!a) {
    return `
      <p class="small">Sign in with Google to:</p>
      <ul class="small benefits">
        <li><strong>Sync</strong> your planner between phone and computer (saved in a private app folder in your Google Drive)</li>
        <li><strong>Add</strong> your tasks, steps and deadlines to a separate <em>GoalPlanner</em> calendar in Google Calendar</li>
        <li><strong>See</strong> your Google Calendar events in the Calendar view</li>
      </ul>
      <button class="btn btn-primary" data-g="signin">Sign in with Google</button>
      ${google.status.message ? `<p class="small muted">${esc(google.status.message)}</p>` : ''}`;
  }
  const g = a.granted || {};
  const missing = [!g.drive && 'Drive sync', !g.calWrite && 'adding to Google Calendar', !g.calRead && 'showing Google Calendar events'].filter(Boolean);
  const last = a.lastSync ? new Date(a.lastSync).toLocaleString() : 'never';
  return `
    <p class="small">Signed in as <strong>${esc(a.email || 'your Google account')}</strong></p>
    <p class="small muted" data-g-status>${esc(google.status.message || '')} · Last synced: ${esc(last)}</p>
    ${missing.length ? `<p class="small warn-ink">Permission not given for: ${esc(missing.join(', '))}. Sign in again and tick all boxes to use them.</p>` : ''}
    <label class="check"><input type="checkbox" data-g-opt="pushCalendar" ${a.pushCalendar ? 'checked' : ''} ${g.calWrite ? '' : 'disabled'}>
      Add tasks, steps and deadlines to Google Calendar <span class="muted small">(in a separate "GoalPlanner" calendar)</span></label>
    <label class="check"><input type="checkbox" data-g-opt="showEvents" ${a.showEvents ? 'checked' : ''} ${g.calRead ? '' : 'disabled'}>
      Show my Google Calendar events in the Calendar view</label>
    <div class="btn-row">
      ${google.tokenValid()
        ? `<button class="btn btn-primary" data-g="sync" ${google.isSyncing() ? 'disabled' : ''}>Sync now</button>`
        : `<button class="btn btn-primary" data-g="signin">Reconnect</button>`}
      <button class="btn btn-secondary" data-g="signout">Sign out</button>
    </div>`;
}

export function render() {
  const theme = localStorage.getItem(THEME_KEY) || 'system';
  const d = store.data;
  return `
    <h1 class="page-title">Settings</h1>
    <section class="card">
      <h2 class="section-title">Appearance</h2>
      <div class="segmented" role="group" aria-label="Theme" data-theme-pick>
        ${[['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-theme="${k}" class="${k === theme ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </section>
    <section class="card" data-google>
      <h2 class="section-title">Google account</h2>
      ${googleSection()}
    </section>
    <section class="card">
      <div class="section-head">
        <h2 class="section-title">Categories</h2>
        <button class="btn btn-text" data-action="new-category">${icon('plus')} Category</button>
      </div>
      <p class="small muted">Give goals and tasks a category to filter by it and to colour them in the calendar. Tap one to rename it or change its colour.</p>
      ${d.categories.length ? `<ul class="cat-list">${store.categoriesSorted().map(c => {
        const n = [...d.goals, ...d.tasks].filter(r => r.categoryId === c.id).length;
        return `<li><button class="cat-row" data-action="edit-category" data-id="${c.id}" style="--c:${esc(c.color)}">
          <i></i><span>${esc(c.name)}</span><span class="muted small">${n} item${n === 1 ? '' : 's'}</span>${icon('edit')}</button></li>`;
      }).join('')}</ul>` : '<p class="small muted">No categories yet.</p>'}
    </section>
    <section class="card">
      <h2 class="section-title">Your data</h2>
      <p class="small muted">Everything is stored in this browser: ${d.goals.length} goals, ${d.steps.length} steps, ${d.tasks.length} tasks.
        Without Google sync, download a backup now and then.</p>
      <div class="btn-row">
        <button class="btn btn-secondary" data-data="export">Download backup</button>
        <label class="btn btn-secondary">Restore from backup<input type="file" accept="application/json,.json" data-data="import" hidden></label>
        <button class="btn btn-text danger" data-data="clear">Delete everything</button>
      </div>
    </section>
    <p class="small muted center">GoalPlanner · works offline · no account needed</p>`;
}

export function mount(root, rerender) {
  root.querySelector('[data-theme-pick]').addEventListener('click', e => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    const t = b.dataset.theme;
    if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
    rerender();
  });

  const g = root.querySelector('[data-google]');
  g.addEventListener('click', async e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    if (b.dataset.g === 'signin') google.signIn();
    if (b.dataset.g === 'sync') google.syncNow();
    if (b.dataset.g === 'signout') {
      const ok = await confirmDialog({ title: 'Sign out of Google?', message: 'Your planner stays on this device. Events already added to Google Calendar are kept.', confirmLabel: 'Sign out', danger: false });
      if (ok) google.signOut();
    }
  });
  g.addEventListener('change', e => {
    const c = e.target.closest('[data-g-opt]');
    if (!c) return;
    google.setOption(c.dataset.gOpt, c.checked);
    if (c.dataset.gOpt === 'pushCalendar' && c.checked) google.syncNow();
  });
  // Google sign-in loads in the background so the button opens the window on the first tap
  if (google.enabled) google.loadGoogle().catch(() => {});

  root.querySelector('[data-data=export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `goal-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  root.querySelector('[data-data=import]').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.goals) && !Array.isArray(imported.tasks)) throw new Error('not a backup');
      store.applyMerged(store.merge(store.data, imported));
      toast('Backup restored ✓ (merged with what was here)');
    } catch {
      toast("That file isn't a GoalPlanner backup.");
    }
    e.target.value = '';
  });

  root.querySelector('[data-data=clear]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Delete everything?', message: 'All goals, steps and tasks on this device will be removed (categories are kept). Download a backup first if unsure.', confirmLabel: 'Delete everything' });
    if (!ok) return;
    // Tombstones make the deletion carry over to other devices on the next sync
    const deleted = { ...store.data.deleted };
    for (const c of ['goals', 'steps', 'tasks']) for (const r of store.data[c]) deleted[r.id] = Date.now();
    store.replaceAll({ deleted, settings: store.data.settings, categories: store.data.categories });
    toast('All data deleted');
  });
}
