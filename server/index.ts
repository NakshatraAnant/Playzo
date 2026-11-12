import { buildApp } from './app';
import { config } from './config';

const app = await buildApp({ logger: false });
// 'localhost' binds both loopback addresses (127.0.0.1 and ::1): local-only, and no slow IPv6-to-IPv4
// fallback when a browser resolves localhost to ::1 first (that cost ~200 ms per connection on Windows).
await app.listen({ port: config.apiPort, host: 'localhost' });
console.log(`[playzo] API listening on http://localhost:${config.apiPort}  (health: /api/health, devMode=${config.devMode}, adultDevPreview=${config.adultDevPreview})`);

const shutdown = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
