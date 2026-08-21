const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_TAG = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' };

let minLevel = 'info';

function emit(level, scope, msg) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`${ts} ${LEVEL_TAG[level]} [${scope}] ${msg}\n`);
}

export const log = {
  setLevel(level) { minLevel = level; },
  debug(scope, msg) { emit('debug', scope, msg); },
  info(scope, msg) { emit('info', scope, msg); },
  warn(scope, msg) { emit('warn', scope, msg); },
  error(scope, msg) { emit('error', scope, msg); },
};
