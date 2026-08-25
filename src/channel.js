import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { log } from './log.js';
import { parseDate, parseCron, nextCronDate, previewCron, stringifyCron } from './utils.js';
import {
  addReminder,
  listReminders,
  deleteReminder,
  rescheduleStaleCrons,
} from './store.js';
import { createScheduler } from './scheduler.js';

const INSTRUCTIONS = `You have a persistent reminder system.

When a reminder fires, you'll receive a notification like:
  <channel source="reminder" reminder_id="<id>">
    reminder message here
  </channel>

Use the "set_reminder" tool to create one-time reminders with a due date/time.
Use "set_schedule" to create recurring reminders using cron expressions (e.g. "0 9 * * 1-5" for weekdays at 9am).
  Predefined expressions like @daily, @hourly, @weekdays, @weekends are also supported.
  Timezone can be specified (e.g. "America/New_York").
Use "list_reminders" to see pending reminders.
Use "delete_reminder" to cancel one (works for both one-time and recurring).

Reminders persist across sessions — they survive restarts.`;

export function createChannel() {
  const mcp = new McpServer(
    { name: 'claude-reminder', version: '2.0.0' },
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
      description: 'Create a persistent one-time reminder. Survives restarts and sessions. Accepts ISO 8601 datetime or relative like "+30m", "+2h", "+1d".',
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
    'set_schedule',
    {
      description: 'Create a persistent recurring schedule using a cron expression. Survives restarts and sessions. Supports 5-field (or 6 with seconds), L, #, and predefined expressions (@daily, @weekdays, etc.).',
      inputSchema: {
        message: z.string().describe('What to remind about'),
        cron: z.string().describe('Cron expression — e.g. "0 9 * * 1-5", "*/30 * * * *", or "@daily"'),
        tz: z.string().optional().describe('IANA timezone — e.g. "America/New_York", "Europe/London". Defaults to system timezone.'),
      },
    },
    async ({ message, cron, tz }) => {
      const validated = parseCron(cron);
      if (!validated) {
        return {
          content: [{ type: 'text', text: `Invalid cron expression: "${cron}". Use standard cron syntax or predefined like @daily, @weekdays.` }],
          isError: true,
        };
      }

      let firstDue;
      try {
        firstDue = nextCronDate(cron, tz);
      } catch (e) {
        return {
          content: [{ type: 'text', text: `Error computing next date: ${e.message}` }],
          isError: true,
        };
      }

      const normalized = stringifyCron(cron);
      const reminder = addReminder(message, firstDue.toISOString(), { cron, tz: tz || null });
      const upcoming = previewCron(cron, 3, tz);
      let text = `Schedule set (id: ${reminder.id})\n  cron: ${normalized}`;
      if (tz) text += `\n  timezone: ${tz}`;
      text += `\n  next 3 fires:\n    ${upcoming.join('\n    ')}`;
      return {
        content: [{ type: 'text', text }],
      };
    },
  );

  mcp.registerTool(
    'list_reminders',
    {
      description: 'List all pending reminders. Pass include_fired=true to also see past one-time reminders.',
      inputSchema: {
        include_fired: z.boolean().optional().default(false).describe('Include already-fired one-time reminders'),
      },
    },
    async ({ include_fired }) => {
      const reminders = listReminders({ includeFired: include_fired });
      if (reminders.length === 0) {
        return { content: [{ type: 'text', text: 'No reminders.' }] };
      }
      const lines = reminders.map(r => {
        const type = r.cron ? 'CRON' : (r.fired ? 'FIRED' : 'PENDING');
        let line = `[${type}] ${r.id}\n  "${r.message}"\n  due: ${r.dueAt}`;
        if (r.cron) {
          line += `\n  cron: ${r.cron}`;
          if (r.tz) line += `\n  timezone: ${r.tz}`;
        }
        if (r.fireCount) line += `\n  fired ${r.fireCount}x, last: ${r.lastFiredAt}`;
        if (r.firedAt) line += `\n  fired: ${r.firedAt}`;
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

  const scheduler = createScheduler(mcp.server);

  async function connect() {
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    const rescheduled = rescheduleStaleCrons();
    if (rescheduled > 0) {
      log.info('boot', `rescheduled ${rescheduled} stale cron reminder(s)`);
    }
    scheduler.start();
    log.info('mcp', 'reminder channel connected');
  }

  return { connect, stop: scheduler.stop };
}
