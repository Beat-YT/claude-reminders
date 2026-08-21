import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { log } from './log.js';
import { parseDate, parseInterval, formatInterval, localISO } from './utils.js';
import {
  addReminder,
  listReminders,
  deleteReminder,
  getDueReminders,
  markFired,
  rescheduleStaleIntervals,
} from './store.js';

const CHECK_INTERVAL_MS = 30_000;

const INSTRUCTIONS = `You have a persistent reminder system.

When a reminder fires, you'll receive a notification like:
  <channel source="reminder" reminder_id="<id>">
    reminder message here
  </channel>

Use the "set_reminder" tool to create one-time reminders with a due date/time.
Use "set_interval" to create recurring reminders that fire every N minutes/hours/days.
Use "list_reminders" to see pending reminders.
Use "delete_reminder" to cancel one (works for both one-time and recurring).

Reminders persist across sessions — they survive restarts.`;

export function createChannel() {
  const mcp = new McpServer(
    { name: 'claude-reminder', version: '0.1.0' },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
      },
      instructions: INSTRUCTIONS,
    },
  );

  mcp.registerTool(
    'set_reminder',
    {
      description: 'Create a persistent reminder. The due_at field accepts ISO 8601 datetime strings (e.g. "2025-03-15T14:30:00") or relative expressions like "+30m", "+2h", "+1d".',
      inputSchema: {
        message: z.string().describe('What to remind about'),
        due_at: z.string().describe('When the reminder should fire — ISO 8601 datetime or relative like "+30m", "+2h", "+1d"'),
      },
    },
    async ({ message, due_at }) => {
      const resolvedDate = parseDate(due_at);
      if (!resolvedDate) {
        return {
          content: [{ type: 'text', text: `Could not parse date: "${due_at}". Use ISO 8601 or relative like "+30m", "+2h", "+1d".` }],
          isError: true,
        };
      }

      const reminder = addReminder(message, resolvedDate.toISOString());
      return {
        content: [{ type: 'text', text: `Reminder set (id: ${reminder.id}) — will fire at ${reminder.dueAt}` }],
      };
    },
  );

  mcp.registerTool(
    'set_interval',
    {
      description: 'Create a recurring reminder that fires every N minutes/hours/days. Uses the same relative syntax: "30m", "2h", "1d". The first fire happens after one interval from now.',
      inputSchema: {
        message: z.string().describe('What to remind about'),
        every: z.string().describe('How often — e.g. "30m", "2h", "1d"'),
      },
    },
    async ({ message, every }) => {
      const intervalMs = parseInterval(every);
      if (!intervalMs) {
        return {
          content: [{ type: 'text', text: `Could not parse interval: "${every}". Use "30m", "2h", "1d", etc.` }],
          isError: true,
        };
      }

      const firstDue = new Date(Date.now() + intervalMs).toISOString();
      const reminder = addReminder(message, firstDue, { interval: intervalMs });
      return {
        content: [{ type: 'text', text: `Recurring reminder set (id: ${reminder.id}) — fires every ${every}, first at ${reminder.dueAt}` }],
      };
    },
  );

  mcp.registerTool(
    'list_reminders',
    {
      description: 'List all pending reminders. Pass include_fired=true to also see past reminders.',
      inputSchema: {
        include_fired: z.boolean().optional().default(false).describe('Include already-fired reminders'),
      },
    },
    async ({ include_fired }) => {
      const reminders = listReminders({ includeFired: include_fired });
      if (reminders.length === 0) {
        return { content: [{ type: 'text', text: 'No reminders.' }] };
      }
      const lines = reminders.map(r => {
        const type = r.interval ? 'RECURRING' : (r.fired ? 'FIRED' : 'PENDING');
        let line = `[${type}] ${r.id}\n  "${r.message}"\n  due: ${r.dueAt}`;
        if (r.interval) line += `\n  every: ${formatInterval(r.interval)}`;
        if (r.fireCount) line += `  (fired ${r.fireCount}x, last: ${r.lastFiredAt})`;
        if (r.firedAt) line += `  fired: ${r.firedAt}`;
        return line;
      });
      return { content: [{ type: 'text', text: lines.join('\n\n') }] };
    },
  );

  mcp.registerTool(
    'delete_reminder',
    {
      description: 'Delete a reminder by ID',
      inputSchema: {
        id: z.string().describe('The reminder ID to delete'),
      },
    },
    async ({ id }) => {
      const ok = deleteReminder(id);
      return {
        content: [{ type: 'text', text: ok ? `Deleted reminder ${id}` : `Reminder ${id} not found` }],
        ...(ok ? {} : { isError: true }),
      };
    },
  );

  let checkTimer;

  function startChecker() {
    checkTimer = setInterval(async () => {
      try {
        const due = getDueReminders();
        for (const r of due) {
          log.info('scheduler', `firing reminder ${r.id}: "${r.message}"`);
          await mcp.server.notification({
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

  async function connect() {
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    const rescheduled = rescheduleStaleIntervals();
    if (rescheduled > 0) {
      log.info('boot', `rescheduled ${rescheduled} stale recurring reminder(s)`);
    }
    startChecker();
    log.info('mcp', 'reminder channel connected');
  }

  function stop() {
    if (checkTimer) clearInterval(checkTimer);
  }

  return { connect, stop };
}

