/**
 * Database backups: online, consistent copies (VACUUM INTO) in data/backups/, newest 14 kept.
 * The API takes one automatically at start-up when the newest backup is older than 24 hours, and
 * re-checks every 6 hours. Disabled for in-memory databases and with PLAYZO_AUTO_BACKUP=false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { config } from './config';

export const BACKUP_DIR = path.resolve('data/backups');
const KEEP = 14, EVERY_MS = 24 * 3600_000;

export function backupNow(): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `playzo-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db().raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^playzo-.*\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return file;
}
export function latestBackup(): { file: string; at: number } | null {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^playzo-.*\.db$/.test(f)).sort();
  const f = files[files.length - 1];
  return f ? { file: f, at: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs } : null;
}
export function startAutoBackups() {
  if (config.dbPath === ':memory:' || process.env.PLAYZO_AUTO_BACKUP === 'false') return;
  const check = () => {
    try {
      const last = latestBackup();
      if (!last || Date.now() - last.at > EVERY_MS) console.log(`[backup] wrote ${backupNow()}`);
    } catch (e) { console.error('[backup] failed', e); }
  };
  setTimeout(check, 5_000).unref();
  setInterval(check, 6 * 3600_000).unref();
}
