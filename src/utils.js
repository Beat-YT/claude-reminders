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
