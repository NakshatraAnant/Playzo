/**
 * Proves the PostgreSQL migration path end to end on this machine:
 *  1. exports the live SQLite database (scripts/export-postgres.ts),
 *  2. starts a throwaway embedded PostgreSQL in a temp folder,
 *  3. loads schema.sql and data.sql,
 *  4. compares row counts table by table and checks the append-only ledger trigger.
 * The real database is only read. The temporary PostgreSQL is deleted afterwards.
 *   npm run verify:postgres
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { config } from '../server/config';

const src = process.argv[2] ?? config.dbPath;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-pgverify-'));
const out = path.join(work, 'export');
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/export-postgres.ts', src, out], { stdio: 'inherit' });

const port = 55432 + Math.floor(Math.random() * 500);
const pgServer = new EmbeddedPostgres({ databaseDir: path.join(work, 'pgdata'), user: 'playzo', password: 'local-verify-only', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
let ok = false;
try {
  await pgServer.initialise();
  await pgServer.start();
  await pgServer.createDatabase('playzo'); // inherits UTF8 from initdb (PLAYZO data contains emoji)
  const client = new pg.Client({ host: 'localhost', port, user: 'playzo', password: 'local-verify-only', database: 'playzo' });
  client.on('error', (e) => console.error('[pg]', e.message));
  await client.connect();
  await client.query(fs.readFileSync(path.join(out, 'schema.sql'), 'utf8'));
  await client.query(fs.readFileSync(path.join(out, 'data.sql'), 'utf8'));
  const sqlite = new DatabaseSync(src, { readOnly: true });
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
  const mismatches: string[] = [];
  let total = 0;
  for (const t of tables) {
    const a = (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as any).n as number;
    const b = Number((await client.query(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
    total += b;
    if (a !== b) mismatches.push(`${t}: sqlite ${a} vs postgres ${b}`);
  }
  sqlite.close();
  let triggerOk = false;
  const led = await client.query('SELECT id FROM ledger LIMIT 1');
  if (led.rows.length) {
    try { await client.query('UPDATE ledger SET amount = amount + 1 WHERE id = $1', [led.rows[0].id]); } catch (e: any) { triggerOk = /append-only/.test(e.message); }
  } else triggerOk = true;
  const version = (await client.query('SHOW server_version')).rows[0].server_version;
  await client.end();
  ok = mismatches.length === 0 && triggerOk;
  console.log(JSON.stringify({ postgres: version, tables: tables.length, rows: total, mismatches, appendOnlyTrigger: triggerOk, ok }));
} finally {
  await pgServer.stop().catch(() => undefined);
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
