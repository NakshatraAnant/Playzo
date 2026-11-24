/** Renders PNG app icons and the share image from favicon.svg with Microsoft Edge (npm run icons). */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const svg = fs.readFileSync('client/public/favicon.svg', 'utf8').replace(/<\?xml.*?\?>/, '');
fs.mkdirSync('client/public/icons', { recursive: true });
const b = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge' });
const shot = async (name, w, h, html) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<style>*{margin:0}body{width:${w}px;height:${h}px;display:grid;place-items:center;background:#07040f;font-family:'Segoe UI',sans-serif;color:#fff}</style>${html}`);
  await p.screenshot({ path: `client/public/icons/${name}.png` });
  await p.close();
};
const icon = (px) => `<div style="width:${px}px;height:${px}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;
await shot('icon-192', 192, 192, icon(192));
await shot('icon-512', 512, 512, icon(512));
await shot('maskable-512', 512, 512, icon(360));
await shot('apple-touch-icon', 180, 180, icon(150));
await shot('og', 1200, 630, `<div style="text-align:center">${icon(220).replace('<div ', '<div class="i" ')}<style>.i{margin:0 auto 30px}</style><b style="font-size:104px;letter-spacing:.02em">PLAYZO</b><p style="font-size:38px;color:#c3bbe6;margin-top:10px">25 original games. Play solo or with friends.</p></div>`);
await b.close();
