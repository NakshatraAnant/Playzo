import { buildApp } from './app';
import { config } from './config';
import { db } from './db';

const app = await buildApp({ logger: false });
// 'localhost' binds both loopback addresses (127.0.0.1 and ::1): local-only, and no slow IPv6-to-IPv4
// fallback when a browser resolves localhost to ::1 first (that cost ~200 ms per connection on Windows).
await app.listen({ port: config.apiPort, host: 'localhost' });
console.log(`[playzo] API listening on http://localhost:${config.apiPort}  (health: /api/health, devMode=${config.devMode}, adultDevPreview=${config.adultDevPreview})`);

/** Graceful shutdown: stop accepting work, flush live rooms (onClose hook), checkpoint the WAL, close the DB. */
let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  console.log(`[playzo] ${signal}: shutting down`);
  const force = setTimeout(() => process.exit(1), 8000);
  try {
    await app.close();
    db().raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db().raw.close();
  } catch (e) { console.error('[playzo] shutdown error', e); }
  clearTimeout(force);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => console.error('[playzo] unhandled rejection', e));
