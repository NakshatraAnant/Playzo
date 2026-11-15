/**
 * Database backups: online, consistent copies (VACUUM INTO) in data/backups/, newest 14 kept.
 * The API takes one automatically at start-up when the newest backup is older than 24 hours, and
 * re-checks every 6 hours. Disabled for in-memory databases and with PLAYZO_AUTO_BACKUP=false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, restoreRequestFile } from './db';
import { DatabaseSync } from 'node:sqlite';
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

/** List backups (newest first) with size; never exposes anything outside data/backups. */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => /^(playzo|pre-restore)-.*\.db$/.test(f)).sort().reverse()
    .map((f) => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { file: f, bytes: st.size, at: new Date(st.mtimeMs).toISOString(), kind: f.startsWith('pre-restore') ? 'safety copy' : 'backup' }; });
}
const safeName = (name: string) => {
  const f = path.basename(String(name));
  if (!/^(playzo|pre-restore)-[\w-]+\.db$/.test(f) || !fs.existsSync(path.join(BACKUP_DIR, f))) throw new Error('Backup not found');
  return f;
};
/** Restore test: open the backup read-only, run an integrity check and read key tables. */
export function verifyBackup(name: string) {
  const f = safeName(name);
  const d = new DatabaseSync(path.join(BACKUP_DIR, f), { readOnly: true });
  try {
    const integrity = (d.prepare('PRAGMA integrity_check').get() as any)?.integrity_check ?? 'unknown';
    const migrations = (d.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as any[]).map((r) => r.name);
    const count = (t: string) => { try { return (d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n as number; } catch { return null; } };
    return { file: f, integrity, migrations, users: count('users'), ledger: count('ledger'), matches: count('matches'), ok: integrity === 'ok' && migrations.length > 0 };
  } finally { d.close(); }
}
/** Stage a restore; it is applied at the next start, after a safety copy of the current database. */
export function requestRestore(name: string, by: string) {
  const f = safeName(name);
  const v = verifyBackup(f);
  if (!v.ok) throw new Error(`Backup failed verification: ${v.integrity}`);
  fs.writeFileSync(restoreRequestFile(config.dbPath), JSON.stringify({ file: f, requestedBy: by, at: new Date().toISOString() }));
  return v;
}
export function pendingRestore(): { file: string; at: string } | null {
  try { return JSON.parse(fs.readFileSync(restoreRequestFile(config.dbPath), 'utf8')); } catch { return null; }
}
export function cancelRestore() { try { fs.unlinkSync(restoreRequestFile(config.dbPath)); } catch { /* none */ } }
