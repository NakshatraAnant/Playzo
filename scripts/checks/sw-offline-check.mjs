// Manual check: a page controlled by the service worker shows the clear "can't reach" page, not a stale app,
// when the server stops. Uses its own server on :5770 (in-memory DB) so the real one is untouched.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const env = { ...process.env, PLAYZO_SERVE_DIST: 'true', PLAYZO_API_PORT: '5770', PLAYZO_PUBLIC_URL: 'http://localhost:5770', PLAYZO_DB_PATH: ':memory:', PLAYZO_AUTO_BACKUP: 'false' };
const srv = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: 'ignore' });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5770/api/health')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
await up();
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage();
await p.goto('http://localhost:5770/');
await p.waitForFunction(() => navigator.serviceWorker.controller !== null || (location.reload(), false), null, { timeout: 15000 }).catch(() => undefined);
await p.reload();
const heroOk = await p.getByRole('heading', { name: /Your place to play/ }).waitFor({ timeout: 10000 }).then(() => true, () => false);
const sw = await p.evaluate(async () => (await caches.keys()).join(','));
srv.kill();
await new Promise((r) => setTimeout(r, 1500));
await p.goto('http://localhost:5770/games').catch(() => undefined);
const offline = await p.locator('body').innerText();
console.log(JSON.stringify({ newHomepage: heroOk, caches: sw, controlled: await p.evaluate(() => !!navigator.serviceWorker.controller), whenServerStopped: offline.slice(0, 80) }));
await b.close();
process.exit(0);
