import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { log } from './log.js';
import { nextCronDate } from './utils.js';

const DATA_DIR = path.join(
  process.env.REMINDER_DATA_DIR ||
  path.join(process.env.APPDATA || process.env.HOME || '.', '.claude-reminder'),
);
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAll() {
  ensureDir();
  if (!fs.existsSync(REMINDERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));
  } catch (e) {
    log.error('store', `failed to read reminders: ${e}`);
    return [];
  }
}

function saveAll(reminders) {
  ensureDir();
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf-8');
}

export function addReminder(message, dueAt, { cron = null, tz = null, slug = null } = {}) {
  const reminders = loadAll();

  let id;
  if (slug) {
    if (reminders.some(r => r.id === slug)) {
      throw new Error(`A reminder with id "${slug}" already exists`);
    }
    id = slug;
  } else {
    id = crypto.randomUUID();
  }

  const reminder = {
    id,
    message,
    dueAt,
    createdAt: new Date().toISOString(),
    fired: false,
    ...(cron && { cron }),
    ...(tz && { tz }),
  };
  reminders.push(reminder);
  saveAll(reminders);
  log.info('store', `added reminder ${reminder.id} due at ${dueAt}${cron ? ` (cron: ${cron})` : ''}`);
  return reminder;
}

export function listReminders({ includeFired = false } = {}) {
  const reminders = loadAll();
  if (includeFired) return reminders;
  return reminders.filter(r => !r.fired);
}

export function deleteReminder(id) {
  const reminders = loadAll();
  const idx = reminders.findIndex(r => r.id === id);
  if (idx === -1) return false;
  reminders.splice(idx, 1);
  saveAll(reminders);
  log.info('store', `deleted reminder ${id}`);
  return true;
}

export function markFired(id) {
  const reminders = loadAll();
  const r = reminders.find(r => r.id === id);
  if (!r) return false;

  if (r.cron) {
    r.dueAt = nextCronDate(r.cron, r.tz).toISOString();
    r.fireCount = (r.fireCount || 0) + 1;
    r.lastFiredAt = new Date().toISOString();
    saveAll(reminders);
    return true;
  }

  r.fired = true;
  r.firedAt = new Date().toISOString();
  saveAll(reminders);
  return true;
}

export function editReminder(id, { message, dueAt, cron, tz } = {}) {
  const reminders = loadAll();
  const r = reminders.find(r => r.id === id);
  if (!r) return null;

  if (message !== undefined) r.message = message;

  if (r.cron) {
    if (cron !== undefined) r.cron = cron;
    if (tz !== undefined) r.tz = tz || undefined;
    if (cron !== undefined || tz !== undefined) {
      r.dueAt = nextCronDate(r.cron, r.tz).toISOString();
    }
  } else {
    if (dueAt !== undefined) {
      r.dueAt = dueAt;
      r.fired = false;
      delete r.firedAt;
    }
  }

  saveAll(reminders);
  log.info('store', `edited reminder ${id}`);
  return r;
}

export function getDueReminders() {
  const now = Date.now();
  return loadAll().filter(r => !r.fired && new Date(r.dueAt).getTime() <= now);
}

export function rescheduleStaleCrons() {
  const now = Date.now();
  const reminders = loadAll();
  let count = 0;
  for (const r of reminders) {
    if (r.fired || !r.cron) continue;
    if (new Date(r.dueAt).getTime() > now) continue;
    r.dueAt = nextCronDate(r.cron, r.tz).toISOString();
    count++;
    log.info('store', `rescheduled stale cron ${r.id} to ${r.dueAt}`);
  }
  if (count > 0) saveAll(reminders);
  return count;
}
