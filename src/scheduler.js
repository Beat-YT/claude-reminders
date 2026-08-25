import { log } from './log.js';
import { getDueReminders, markFired } from './store.js';
import { localISO } from './utils.js';

const CHECK_INTERVAL_MS = 30_000;

export function createScheduler(server) {
  let timer;

  function start() {
    timer = setInterval(async () => {
      try {
        const due = getDueReminders();
        for (const r of due) {
          log.info('scheduler', `firing reminder ${r.id}: "${r.message}"`);
          await server.notification({
            method: 'notifications/claude/channel',
            params: {
              content: r.message,
              meta: {
                reminder_id: r.id,
                created_at: r.createdAt,
                due_at: r.dueAt,
                fired_at: localISO(),
              },
            },
          });
          markFired(r.id);
        }
      } catch (e) {
        log.error('scheduler', `check failed: ${e}`);
      }
    }, CHECK_INTERVAL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  return { start, stop };
}
