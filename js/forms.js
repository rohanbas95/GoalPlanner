// Add / edit forms for tasks, goals and goal steps.

import * as store from './store.js';
import { REPEATS, todayKey, addDays, addMonths } from './dates.js';
import { esc, openForm, toast, confirmDialog } from './ui.js';

function goalOptions(selected) {
  const goals = store.data.goals.filter(g => g.status !== 'done' || g.id === selected);
  return `<option value="">No goal</option>` + goals.map(g =>
    `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.title)}</option>`).join('');
}

export function taskForm(task = {}, defaults = {}) {
  const t = { title: '', notes: '', date: todayKey(), time: '', repeat: 'none', repeatUntil: '', goalId: '', priority: false, ...defaults, ...task };
  const isNew = !task.id;
  openForm({
    title: isNew ? 'New task' : 'Edit task',
    submitLabel: isNew ? 'Add task' : 'Save',
    body: `
      <label class="field"><span>What needs doing?</span>
        <input name="title" required autofocus maxlength="200" value="${esc(t.title)}" placeholder="e.g. Go for a 20 min walk"></label>
      <div class="row2">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(t.date)}"></label>
        <label class="field"><span>Time (optional)</span><input type="time" name="time" value="${esc(t.time)}"></label>
      </div>
      <div class="chips" data-date-chips>
        <button type="button" class="chip" data-set-date="${todayKey()}">Today</button>
        <button type="button" class="chip" data-set-date="${addDays(todayKey(), 1)}">Tomorrow</button>
        <button type="button" class="chip" data-set-date="">No date (Inbox)</button>
      </div>
      <div class="row2">
        <label class="field"><span>Repeat</span>
          <select name="repeat">${Object.entries(REPEATS).map(([k, v]) => `<option value="${k}" ${k === t.repeat ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field" data-until ${t.repeat === 'none' ? 'hidden' : ''}><span>Until (optional)</span>
          <input type="date" name="repeatUntil" value="${esc(t.repeatUntil)}"></label>
      </div>
      <label class="field"><span>Part of a goal</span><select name="goalId">${goalOptions(t.goalId)}</select></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2" maxlength="2000">${esc(t.notes)}</textarea></label>
      <label class="check"><input type="checkbox" name="priority" ${t.priority ? 'checked' : ''}> Important</label>`,
    onMount(form) {
      const repeat = form.elements.repeat;
      const until = form.querySelector('[data-until]');
      repeat.addEventListener('change', () => {
        until.hidden = repeat.value === 'none';
        if (repeat.value !== 'none' && !form.elements.date.value) form.elements.date.value = todayKey();
      });
      form.querySelector('[data-date-chips]').addEventListener('click', e => {
        const b = e.target.closest('[data-set-date]');
        if (!b) return;
        form.elements.date.value = b.dataset.setDate;
      });
    },
    onSubmit(v) {
      const repeat = v.date ? v.repeat : 'none';
      store.upsert('tasks', {
        ...(task.id ? { id: task.id } : {}),
        title: v.title.trim(),
        notes: v.notes.trim(),
        date: v.date,
        time: v.date ? v.time : '',
        repeat,
        repeatUntil: repeat === 'none' ? '' : v.repeatUntil,
        goalId: v.goalId,
        priority: v.priority,
      });
      toast(isNew ? 'Task added ✓' : 'Saved ✓');
    },
    extra: isNew ? [] : [{ label: 'Delete', className: 'btn-text danger', onClick: () => deleteTask(task) }],
  });
}

export function deleteTask(task) {
  const removed = store.remove('tasks', task.id);
  toast('Task deleted', { action: 'Undo', onAction: () => store.restore('tasks', removed) });
}

export function goalForm(goal = {}) {
  const g = {
    title: '', description: '', category: '', color: store.COLORS[store.data.goals.length % store.COLORS.length],
    startDate: todayKey(), targetDate: addMonths(todayKey(), 3), status: 'active', ...goal,
  };
  const isNew = !goal.id;
  openForm({
    title: isNew ? 'New goal' : 'Edit goal',
    submitLabel: isNew ? 'Create goal' : 'Save',
    body: `
      <label class="field"><span>Goal</span>
        <input name="title" required autofocus maxlength="200" value="${esc(g.title)}" placeholder="e.g. Run a half marathon"></label>
      <label class="field"><span>Why does it matter? (optional)</span>
        <textarea name="description" rows="2" maxlength="2000" placeholder="Your reason keeps you going">${esc(g.description)}</textarea></label>
      <label class="field"><span>Category</span>
        <input name="category" list="categoryList" maxlength="40" value="${esc(g.category)}" placeholder="Health, Career, Learning…">
        <datalist id="categoryList">${categoryNames().map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <div class="row2">
        <label class="field"><span>Start</span><input type="date" name="startDate" value="${esc(g.startDate)}"></label>
        <label class="field"><span>Target date</span><input type="date" name="targetDate" value="${esc(g.targetDate)}"></label>
      </div>
      <fieldset class="field"><legend>Colour</legend>
        <div class="swatches">${store.COLORS.map(c => `
          <label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === g.color ? 'checked' : ''} aria-label="Colour ${c}"><span></span></label>`).join('')}
        </div></fieldset>
      ${isNew ? '' : `<label class="field"><span>Status</span><select name="status">
        ${[['active', 'Active'], ['paused', 'Paused'], ['done', 'Achieved 🎉']].map(([k, l]) => `<option value="${k}" ${k === g.status ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>`}`,
    onSubmit(v) {
      if (v.startDate && v.targetDate && v.targetDate < v.startDate) {
        toast('The target date is before the start date.');
        return false;
      }
      const saved = store.upsert('goals', {
        ...(goal.id ? { id: goal.id } : {}),
        title: v.title.trim(),
        description: v.description.trim(),
        category: v.category.trim(),
        color: v.color || g.color,
        startDate: v.startDate,
        targetDate: v.targetDate,
        status: v.status || g.status,
      });
      toast(isNew ? 'Goal created ✓ Now add the steps to get there.' : 'Saved ✓');
      if (isNew) location.hash = `#/goal/${saved.id}`;
    },
    extra: isNew ? [] : [{ label: 'Delete goal', className: 'btn-text danger', onClick: () => { deleteGoal(goal); } }],
  });
}

function categoryNames() {
  const used = store.data.goals.map(g => g.category).filter(Boolean);
  return [...new Set([...used, ...store.CATEGORIES])];
}

export async function deleteGoal(goal) {
  const steps = store.goalSteps(goal.id);
  const ok = await confirmDialog({
    title: 'Delete this goal?',
    message: `"${goal.title}"${steps.length ? ` and its ${steps.length} step${steps.length === 1 ? '' : 's'}` : ''} will be deleted. Linked tasks are kept.`,
  });
  if (!ok) return;
  const taskIds = store.data.tasks.filter(t => t.goalId === goal.id).map(t => t.id);
  const removed = store.remove('goals', goal.id);
  if (location.hash.startsWith('#/goal/')) location.hash = '#/goals';
  toast('Goal deleted', { action: 'Undo', onAction: () => store.restore('goals', removed, { steps, taskIds }) });
}

export function stepForm(goalId, step = {}) {
  const s = { title: '', dueDate: '', notes: '', ...step };
  const isNew = !step.id;
  openForm({
    title: isNew ? 'New step' : 'Edit step',
    submitLabel: isNew ? 'Add step' : 'Save',
    body: `
      <label class="field"><span>Step</span>
        <input name="title" required autofocus maxlength="200" value="${esc(s.title)}" placeholder="e.g. Buy running shoes"></label>
      <label class="field"><span>Due date (optional)</span><input type="date" name="dueDate" value="${esc(s.dueDate)}"></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2" maxlength="2000">${esc(s.notes)}</textarea></label>`,
    onSubmit(v) {
      const order = isNew ? Math.max(-1, ...store.goalSteps(goalId).map(x => x.order ?? 0)) + 1 : s.order;
      store.upsert('steps', {
        ...(step.id ? { id: step.id } : {}),
        goalId, order, title: v.title.trim(), dueDate: v.dueDate, notes: v.notes.trim(), done: !!s.done,
      });
      toast(isNew ? 'Step added ✓' : 'Saved ✓');
    },
    extra: isNew ? [] : [{ label: 'Delete', className: 'btn-text danger', onClick: () => deleteStep(step) }],
  });
}

export function deleteStep(step) {
  const removed = store.remove('steps', step.id);
  toast('Step deleted', { action: 'Undo', onAction: () => store.restore('steps', removed) });
}
