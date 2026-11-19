// Debug: click Trivia Clash answers and print the full Playwright call log of any failing click.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const env = { ...process.env, PLAYZO_SERVE_DIST: 'true', PLAYZO_API_PORT: '5771', PLAYZO_PUBLIC_URL: 'http://localhost:5771', PLAYZO_DB_PATH: ':memory:', PLAYZO_AUTO_BACKUP: 'false' };
const srv = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5771/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
p.on('response', async (r) => { if (r.url().includes('/action')) { let j = {}; try { j = await r.json(); } catch {} console.log('ACTION', r.status(), (r.request().postData() ?? '').slice(0, 40), j.view?.phase, j.view?.idx, j.code ?? ''); } });
await p.addInitScript(() => localStorage.setItem('pz-tut-trivia-clash', '1'));
await p.goto('http://localhost:5771/play/trivia-clash?difficulty=easy');
let fails = 0;
const t0 = Date.now();
while (Date.now() - t0 < 40000 && fails < 2) {
  const opt = p.locator('.stage-body button.answer:enabled').first();
  if (!(await opt.count())) { await p.waitForTimeout(300); continue; }
  try { await opt.click({ timeout: 3000 }); console.log('clicked at', Date.now() - t0); }
  catch (e) {
    fails++;
    console.log('FAIL at', Date.now() - t0, e.message.replace(/\u001b\[\d+m/g, ''));
    console.log('overlay at center:', await p.evaluate(() => { const el = document.querySelector('.stage-body button.answer'); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top ? top.outerHTML.slice(0, 300) : null; }));
  }
  await p.waitForTimeout(500);
}
await b.close(); srv.kill(); process.exit(0);
