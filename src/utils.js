const MULTIPLIERS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDate(input) {
  const relative = input.match(/^\+(\d+)([smhd])$/);
  if (relative) {
    const amount = parseInt(relative[1], 10);
    return new Date(Date.now() + amount * MULTIPLIERS[relative[2]]);
  }

  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

export function parseInterval(input) {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  return parseInt(match[1], 10) * MULTIPLIERS[match[2]];
}

export function formatInterval(ms) {
  if (ms >= 86_400_000 && ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${ms / 1000}s`;
}

const DAY_NAMES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const DAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function parseDowntime(input) {
  const match = input.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const sh = parseInt(match[1], 10);
  const sm = parseInt(match[2], 10);
  const eh = parseInt(match[3], 10);
  const em = parseInt(match[4], 10);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return null;
  const pad = n => String(n).padStart(2, '0');
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` };
}

export function parseExcludeDays(input) {
  const parts = input.split(',').map(s => s.trim().toLowerCase());
  const days = [];
  for (const p of parts) {
    if (p in DAY_NAMES) {
      days.push(DAY_NAMES[p]);
    } else {
      const n = parseInt(p, 10);
      if (isNaN(n) || n < 0 || n > 6) return null;
      days.push(n);
    }
  }
  return [...new Set(days)].sort();
}

export function isInDowntime(downtime) {
  if (!downtime) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = downtime.start.split(':').map(Number);
  const [eh, em] = downtime.end.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

export function isExcludedDay(excludeDays) {
  if (!excludeDays || excludeDays.length === 0) return false;
  return excludeDays.includes(new Date().getDay());
}

export function formatDays(days) {
  return days.map(d => DAY_LABELS[d]).join(', ');
}

export function localISO() {
  const now = new Date();
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = n => String(Math.abs(n)).padStart(2, '0');
  return now.getFullYear()
    + '-' + pad(now.getMonth() + 1)
    + '-' + pad(now.getDate())
    + 'T' + pad(now.getHours())
    + ':' + pad(now.getMinutes())
    + ':' + pad(now.getSeconds())
    + sign + pad(Math.floor(off / 60)) + ':' + pad(off % 60);
}
