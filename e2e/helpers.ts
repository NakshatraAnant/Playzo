import { expect, Page, APIRequestContext, BrowserContext } from '@playwright/test';

/** Collects console errors and failed API calls (5xx) on a page; asserted at the end of each test. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Expected, handled responses (e.g. 4xx validation in negative tests, websocket reconnects) are not app errors.
    if (/status of 4\d\d|WebSocket connection|ERR_CONNECTION_REFUSED|net::ERR_ABORTED/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  return { errors, assertClean: () => expect(errors, errors.join('\n')).toEqual([]) };
}

/** Accept every confirm() dialog (resign, finish run, restart). */
export const acceptDialogs = (page: Page) => page.on('dialog', (d) => d.accept());

export async function noHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(o.sw, `page is ${o.sw}px wide in a ${o.cw}px viewport`).toBeLessThanOrEqual(o.cw + 1);
}

let seq = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;

/** Register an adult account through the API inside a browser context (shares its cookies). */
export async function registerVia(ctx: BrowserContext | APIRequestContext, name: string, dob = '1990-04-04') {
  const req = 'request' in ctx ? (ctx as BrowserContext).request : (ctx as APIRequestContext);
  const r = await req.post('/api/auth/register', { headers: { 'x-playzo': '1' }, data: { email: `${name}@e2e.test`, username: name, password: 'e2e-password-1', dob, acceptTerms: true } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).user as { id: string; username: string };
}

export async function loginVia(ctx: BrowserContext, identifier: string, password: string) {
  const r = await ctx.request.post('/api/auth/login', { headers: { 'x-playzo': '1' }, data: { identifier, password } });
  expect(r.status(), await r.text()).toBe(200);
}

/** Skip the first-run tutorial for a game (the tutorial itself is tested separately). */
export async function skipTutorials(page: Page, ids: string[]) {
  await page.addInitScript((list) => { try { for (const id of list) localStorage.setItem(`pz-tut-${id}`, '1'); localStorage.setItem('pz-intro-seen', '1'); } catch { /* ignore */ } }, ids);
}
