// Manual check (needs `npm run serve:local` running): service worker registers, controls the page, and offline navigation serves the app shell.
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage();
const errors = [];
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5757/');
await p.waitForTimeout(3000);
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? 'active' : r.installing ? 'installing' : 'waiting') : 'none'; });
await p.reload(); await p.waitForTimeout(1500);
const controlled = await p.evaluate(() => !!navigator.serviceWorker.controller);
await p.context().setOffline(true);
await p.goto('http://localhost:5757/games').catch(() => undefined);
const offlineText = await p.locator('body').innerText().catch(() => '');
console.log(JSON.stringify({ sw, controlled, offlineShows: offlineText.slice(0, 90), errors }));
await b.close();
