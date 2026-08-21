import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { log } from './log.js';

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

export function addReminder(message, dueAt) {
  const reminders = loadAll();
  const reminder = {
    id: crypto.randomUUID(),
    message,
    dueAt,
    createdAt: new Date().toISOString(),
    fired: false,
  };
  reminders.push(reminder);
  saveAll(reminders);
  log.info('store', `added reminder ${reminder.id} due at ${dueAt}`);
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
  r.fired = true;
  r.firedAt = new Date().toISOString();
  saveAll(reminders);
  return true;
}

export function getDueReminders() {
  const now = Date.now();
  return loadAll().filter(r => !r.fired && new Date(r.dueAt).getTime() <= now);
}
