// Debug: play Trivia Clash to the end against an isolated server and log every action response.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const env = { ...process.env, PLAYZO_SERVE_DIST: 'true', PLAYZO_API_PORT: '5771', PLAYZO_PUBLIC_URL: 'http://localhost:5771', PLAYZO_DB_PATH: ':memory:', PLAYZO_AUTO_BACKUP: 'false' };
const srv = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5771/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage();
p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('response', async (r) => { if (r.url().includes('/action')) { let j = {}; try { j = await r.json(); } catch {} console.log(new Date().toISOString().slice(17, 23), r.status(), (r.request().postData() ?? '').slice(0, 40), 'over=', j.over, 'phase=', j.view?.phase, 'idx=', j.view?.idx, j.code ?? ''); } });
await p.addInitScript(() => localStorage.setItem('pz-tut-trivia-clash', '1'));
await p.goto('http://localhost:5771/play/trivia-clash?difficulty=easy');
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  if (await p.getByText('Server-authoritative result').isVisible().catch(() => false)) { console.log('RESULTS SHOWN'); break; }
  const body = (await p.locator('.stage-body').innerText().catch(() => '')).trim();
  if (Date.now() - t0 > 5000 && body === '') { console.log('BLANK STAGE'); await new Promise((r) => setTimeout(r, 3000)); console.log('after 3s blank?', (await p.locator('.stage-body').innerText()).trim() === ''); break; }
  const opt = p.locator('.stage-body button.answer:enabled').first();
  await opt.click({ timeout: 800 }).catch(() => undefined);
  await p.waitForTimeout(500);
}
await b.close(); srv.kill(); process.exit(0);
