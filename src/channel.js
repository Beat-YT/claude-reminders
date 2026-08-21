import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { log } from './log.js';
import {
  addReminder,
  listReminders,
  deleteReminder,
  getDueReminders,
  markFired,
} from './store.js';

const CHECK_INTERVAL_MS = 30_000;

const INSTRUCTIONS = `You have a persistent reminder system.

When a reminder fires, you'll receive a notification like:
  <channel source="reminder" reminder_id="<id>">
    reminder message here
  </channel>

Use the "set_reminder" tool to create reminders with a due date/time.
Use "list_reminders" to see pending reminders.
Use "delete_reminder" to cancel one.

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
      const lines = reminders.map(r =>
        `[${r.fired ? 'FIRED' : 'PENDING'}] ${r.id}\n  "${r.message}"\n  due: ${r.dueAt}${r.firedAt ? `  fired: ${r.firedAt}` : ''}`
      );
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
    startChecker();
    log.info('mcp', 'reminder channel connected');
  }

  function stop() {
    if (checkTimer) clearInterval(checkTimer);
  }

  return { connect, stop };
}

function parseDate(input) {
  const relative = input.match(/^\+(\d+)([smhd])$/);
  if (relative) {
    const amount = parseInt(relative[1], 10);
    const unit = relative[2];
    const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + amount * multipliers[unit]);
  }

  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}
