import { CronExpressionParser } from 'cron-parser';

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

export function parseCron(input) {
  try {
    CronExpressionParser.parse(input);
    return input;
  } catch {
    return null;
  }
}

export function nextCronDate(cronExpr, tz) {
  const opts = tz ? { tz } : {};
  const expr = CronExpressionParser.parse(cronExpr, opts);
  return expr.next().toDate();
}

export function previewCron(cronExpr, count, tz) {
  const opts = tz ? { tz } : {};
  const expr = CronExpressionParser.parse(cronExpr, opts);
  return expr.take(count).map(d => d.toISOString());
}

export function stringifyCron(cronExpr) {
  const expr = CronExpressionParser.parse(cronExpr);
  return expr.fields.stringify();
}

export const PREVIEW_RANGES = ['today', 'tomorrow', 'week', 'next_week', 'upcoming'];

/**
 * Bounds (epoch ms) for a preview range as { after, before }: inclusive lower, exclusive
 * upper, null for unbounded. Local machine time; weeks run Monday–Sunday. "today" and
 * "week" are open on the past side so past-due reminders stay visible; "tomorrow" and
 * "next_week" are exact windows.
 */
export function rangeBounds(range) {
  const now = new Date();
  const day = n => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).getTime();
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  switch (range) {
    case 'today': return { after: null, before: day(1) };
    case 'tomorrow': return { after: day(1), before: day(2) };
    case 'week': return { after: null, before: day(daysToMonday) };
    case 'next_week': return { after: day(daysToMonday), before: day(daysToMonday + 7) };
    default: return { after: now.getTime(), before: null };
  }
}

export function localISO(date) {
  const now = date instanceof Date ? date : date ? new Date(date) : new Date();
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
