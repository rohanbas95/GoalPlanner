// Category filter shared by Today, Goals, Timeline and Calendar. The choice is remembered on this device.

import * as store from './store.js';
import { esc } from './ui.js';

const KEY = 'goalPlanner.filter.v1';
const NONE = '__none';

let selected = localStorage.getItem(KEY) || '';

function current() {
  // A deleted category stops filtering
  if (selected && selected !== NONE && !store.get('categories', selected)) selected = '';
  return selected;
}

export function setFilter(id) {
  selected = id;
  if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY);
}

// Whether an item (task, step or goal) passes the filter
export function matches(item) {
  const f = current();
  if (!f) return true;
  const cat = store.categoryIdOf(item);
  return f === NONE ? !cat : cat === f;
}

export function isActive() { return !!current(); }

// The category being filtered on, if it's a real one: the natural default for something new
export function selectedCategory() {
  const f = current();
  return f && f !== NONE ? f : '';
}

export function filterBar() {
  const cats = store.categoriesSorted();
  if (!cats.length) return '';
  const f = current();
  const chip = (id, label, color) => `
    <button class="chip cat-chip ${f === id ? 'on' : ''}" data-action="filter-cat" data-cat="${esc(id)}" aria-pressed="${f === id}" ${color ? `style="--c:${esc(color)}"` : ''}>
      ${color ? '<i></i>' : ''}${esc(label)}</button>`;
  return `<div class="chips filter" role="group" aria-label="Filter by category">
    ${chip('', 'All')}
    ${cats.map(c => chip(c.id, c.name, c.color)).join('')}
    ${chip(NONE, 'No category', store.UNCATEGORISED)}
  </div>`;
}
