# claude-reminder

A [Claude Code channel](https://code.claude.com/docs/en/channels) that gives Claude **persistent reminders**. Set a reminder with a message and a due time; when it fires, Claude is notified directly in the session. Reminders survive restarts — they're stored on disk, not in memory.

## Why

Claude Code's built-in `/schedule` is session-only (dies with the instance) and limited to 50 entries. This channel gives you unlimited persistent reminders that work across sessions.

## How it works

The channel is a single Node.js process that Claude Code spawns as an MCP stdio server (see `.mcp.json`). A 30-second interval checks for due reminders and fires them as channel notifications.

```
set_reminder → store to disk → interval checker → channel notification → Claude
```

- **Set**: Claude calls the `set_reminder` tool with a message and due time (ISO 8601 or relative like `+30m`, `+2h`, `+1d`).
- **Fire**: the checker picks up due reminders and injects them into the session.
- **Persist**: reminders are stored as JSON on disk — they survive process restarts and new sessions.

## Requirements

- Node.js ≥ 20.12

## Setup

```sh
npm install
```

No build step — the source is plain JavaScript.

## Register the MCP server

Claude Code discovers the channel via a `.mcp.json` entry:

```json
{
  "mcpServers": {
    "reminder": {
      "command": "node",
      "args": ["/absolute/path/to/claude-reminders/src/index.js"]
    }
  }
}
```

Place this in:
- **Project-level**: `.mcp.json` in your project root (already included in this repo)
- **User-level**: `~/.claude/.mcp.json` (available across all projects)

The `server:reminder` name in the run command below maps to the `"reminder"` key in this file.

## Run

```sh
claude --dangerously-load-development-channels server:reminder
```

(The dev flag is required for custom channels not on Anthropic's allowlist. Claude Code shows a warning prompt; choose "I am using this for local development".)

Then ask Claude to set a reminder — it'll have the tools available.

## Tools

| Tool | Description |
|---|---|
| `set_reminder` | Create a reminder with a message and due time (`+30m`, `+2h`, `+1d`, or ISO 8601) |
| `list_reminders` | List pending reminders (pass `include_fired=true` to see past ones) |
| `delete_reminder` | Cancel a reminder by ID |

## Configuration

| Var | Required | Default | Meaning |
|---|---|---|---|
| `REMINDER_DATA_DIR` | no | `%APPDATA%/.claude-reminder` (Windows) or `~/.claude-reminder` (Unix) | Where reminders are stored on disk |

## v2 ideas (not implemented)

- Recurring reminders (cron-style), snooze support, reminder categories/tags.
