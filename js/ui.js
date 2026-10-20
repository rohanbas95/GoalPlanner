// Small UI helpers: HTML escaping, toasts, and forms shown in a native <dialog> (which handles focus and Escape).

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function $(sel, root = document) { return root.querySelector(sel); }

let toastTimer = null;

// toast('Saved ✓') or toast('Task deleted', { action: 'Undo', onAction: fn })
export function toast(message, { action, onAction, ms = 4000 } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.classList.add('show');
  if (action) {
    el.querySelector('button').onclick = () => { hide(); onAction(); };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
  function hide() {
    el.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 200);
  }
}

export function vibrate() {
  if (navigator.vibrate) navigator.vibrate(12);
}

// Opens a form in a dialog. onSubmit(values, form) may return false to keep it open.
// extra: [{ label, className, onClick }] adds buttons (e.g. Delete) to the footer.
export function openForm({ title, body, submitLabel = 'Save', onSubmit, extra = [], onMount }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="sheet-body">${body}</div>
      <div class="sheet-foot">
        ${extra.map((b, i) => `<button type="button" class="btn ${b.className || 'btn-text'}" data-extra="${i}">${esc(b.label)}</button>`).join('')}
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');
  const close = () => { dialog.close(); };
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  dialog.querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', () => {
    const result = extra[Number(b.dataset.extra)].onClick(close);
    if (result !== false) close();
  }));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const required = [...form.querySelectorAll('[required]')].find(f => !f.value.trim());
    if (required) { required.focus(); required.classList.add('invalid'); return; }
    const values = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type=checkbox]').forEach(c => { values[c.name] = c.checked; });
    if ((await onSubmit(values, form)) !== false) close();
  });
  if (onMount) onMount(form, close);
  dialog.showModal();
  const first = form.querySelector('[autofocus]') || form.querySelector('input, textarea, select');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
  return { dialog, form, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise(resolve => {
    let answered = false;
    const { dialog } = openForm({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      submitLabel: confirmLabel,
      onSubmit: () => { answered = true; resolve(true); },
    });
    if (danger) dialog.querySelector('[type=submit]').classList.add('btn-danger');
    dialog.addEventListener('close', () => { if (!answered) resolve(false); });
  });
}

// Inline SVG icons (stroke style, inherits currentColor)
const ICONS = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  timeline: '<path d="M4 6h10M8 12h12M4 18h8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
