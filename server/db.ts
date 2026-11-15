import { DatabaseSync, StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';

const here = path.dirname(fileURLToPath(import.meta.url));

export type Row = Record<string, any>;

export class Db {
  readonly raw: DatabaseSync;
  private cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  }
  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) { s = this.raw.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  get<T = Row>(sql: string, ...params: any[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }
  all<T = Row>(sql: string, ...params: any[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }
  run(sql: string, ...params: any[]) {
    return this.stmt(sql).run(...params);
  }
  /** Nested-safe transaction (savepoints). Rolls back on throw. */
  tx<T>(fn: () => T): T {
    const name = `sp${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return out;
    } catch (e) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  }
  migrate(): string[] {
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const dir = path.join(here, 'migrations');
    const done = new Set(this.all<{ name: string }>('SELECT name FROM schema_migrations').map((r) => r.name));
    const applied: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      this.tx(() => {
        this.raw.exec(sql);
        this.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', f, new Date().toISOString());
      });
      applied.push(f);
    }
    return applied;
  }
}

let instance: Db | null = null;
export function db(): Db {
  if (!instance) {
    if (config.dbPath !== ':memory:') {
      const r = applyPendingRestore(config.dbPath);
      if (r) console.log(`[db] restored ${r.restored} (previous database kept as ${r.safetyCopy})`);
    }
    instance = new Db(config.dbPath);
    const applied = instance.migrate();
    if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);
    // Startup validation: a fast integrity check; problems are logged loudly and reported by /api/health.
    try {
      const qc = instance.get<{ quick_check: string }>('PRAGMA quick_check')?.quick_check ?? 'unknown';
      startupCheck = qc;
      if (qc !== 'ok') console.error(`[db] INTEGRITY CHECK FAILED: ${qc}. Restore a backup from Admin → System.`);
    } catch (e) { startupCheck = `error: ${String(e)}`; }
  }
  return instance;
}
export let startupCheck = 'not run';

/** Restore requests are written by Admin → System and applied here, before the database is opened. */
export const restoreRequestFile = (dbPath: string) => path.join(path.dirname(path.resolve(dbPath)), 'restore-request.json');
export function applyPendingRestore(dbPath: string): { restored: string; safetyCopy: string } | null {
  const reqFile = restoreRequestFile(dbPath);
  if (!fs.existsSync(reqFile)) return null;
  let req: { file?: string };
  try { req = JSON.parse(fs.readFileSync(reqFile, 'utf8')); } catch { fs.renameSync(reqFile, reqFile + '.invalid'); return null; }
  const backupsDir = path.join(path.dirname(path.resolve(dbPath)), 'backups');
  const src = req.file ? path.join(backupsDir, path.basename(req.file)) : '';
  if (!src || !fs.existsSync(src)) { console.error(`[db] restore skipped: backup not found (${req.file})`); fs.renameSync(reqFile, reqFile + '.failed'); return null; }
  // Never lose the current data: keep it next to the backups before replacing it.
  fs.mkdirSync(backupsDir, { recursive: true });
  const safety = path.join(backupsDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  if (fs.existsSync(dbPath)) {
    const tmp = new DatabaseSync(dbPath);
    tmp.exec(`VACUUM INTO '${safety.replace(/'/g, "''")}'`);
    tmp.close();
  }
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(dbPath + ext)) fs.unlinkSync(dbPath + ext);
  fs.copyFileSync(src, dbPath);
  fs.unlinkSync(reqFile);
  return { restored: path.basename(src), safetyCopy: path.basename(safety) };
}
/** Tests: use an isolated database. */
export function useDb(d: Db) { instance = d; }

export const nowIso = () => new Date().toISOString();
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
