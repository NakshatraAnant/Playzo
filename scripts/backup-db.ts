/** Online, consistent SQLite backup (VACUUM INTO) to data/backups/playzo-<timestamp>.db. Keeps the newest 14. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../server/config';

const dir = path.resolve('data/backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `playzo-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(config.dbPath);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
db.close();
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(dir, f));
console.log(`[backup] wrote ${file}`);
