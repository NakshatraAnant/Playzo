import { buildApp } from './app';
import { config } from './config';

const app = await buildApp({ logger: false });
await app.listen({ port: config.apiPort, host: '127.0.0.1' });
console.log(`[playzo] API listening on http://127.0.0.1:${config.apiPort}  (health: /api/health, devMode=${config.devMode}, adultDevPreview=${config.adultDevPreview})`);

const shutdown = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
