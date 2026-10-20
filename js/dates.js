// Dates are stored as local 'YYYY-MM-DD' strings so a task due "today" stays today in any time zone.

export function pad(n) { return String(n).padStart(2, '0'); }

export function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() { return toKey(new Date()); }

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key, n) {
  const d = fromKey(key);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export function startOfMonth(key) { return key.slice(0, 8) + '01'; }

export function daysInMonth(key) {
  const d = fromKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function weekday(key) { return fromKey(key).getDay(); }

const fmt = (opts) => new Intl.DateTimeFormat(undefined, opts);
const fmtDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = fmt({ month: 'long', year: 'numeric' });
const fmtShortMonth = fmt({ month: 'short' });
const fmtDate = fmt({ day: 'numeric', month: 'short', year: 'numeric' });

export function formatDay(key) { return fmtDay.format(fromKey(key)); }
export function formatLong(key) { return fmtLong.format(fromKey(key)); }
export function formatMonth(key) { return fmtMonth.format(fromKey(key)); }
export function formatShortMonth(key) { return fmtShortMonth.format(fromKey(key)); }
export function formatDate(key) { return fmtDate.format(fromKey(key)); }

export function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

// "Today", "Tomorrow", "Yesterday", "in 5 days", "3 days ago", or the date
export function relativeDay(key) {
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return formatDay(key).split(',')[0] || formatDay(key);
  return formatDay(key);
}

export function daysLeftLabel(key) {
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return 'Due today';
  if (diff > 0) return diff === 1 ? '1 day left' : `${diff} days left`;
  return diff === -1 ? '1 day overdue' : `${-diff} days overdue`;
}

export const REPEAT_SHORT = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };

export const REPEATS = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday (Mon–Fri)',
  weekly: 'Every week',
  monthly: 'Every month',
};

// Whether a task falls on a given day. Repeating tasks start on task.date and can stop on task.repeatUntil.
export function occursOn(task, key) {
  if (!task.date) return false;
  const repeat = task.repeat || 'none';
  if (repeat === 'none') return task.date === key;
  if (key < task.date) return false;
  if (task.repeatUntil && key > task.repeatUntil) return false;
  switch (repeat) {
    case 'daily': return true;
    case 'weekdays': { const w = weekday(key); return w >= 1 && w <= 5; }
    case 'weekly': return weekday(key) === weekday(task.date);
    case 'monthly': {
      // A task on the 31st shows on the last day of shorter months
      const want = Number(task.date.slice(8));
      return Number(key.slice(8)) === Math.min(want, daysInMonth(key));
    }
    default: return false;
  }
}
