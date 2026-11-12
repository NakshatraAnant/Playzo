/** Every main route renders without errors, navigation works, and no page scrolls sideways at common widths. */
import { test, expect } from '@playwright/test';
import { watchErrors, noHorizontalOverflow, skipTutorials } from './helpers';

const ROUTES = ['/', '/games', '/games/number-rush', '/daily', '/leaderboards', '/leaderboards?view=season', '/rooms', '/missions', '/me', '/friends', '/shop', '/settings', '/notifications', '/legal/fair-play', '/legal/privacy', '/legal/terms', '/legal/support', '/login', '/register', '/forgot', '/no-such-page'];

test.beforeEach(async ({ page }) => { await skipTutorials(page, []); });

test('all main routes render cleanly (guest session)', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'PLAYZO home' })).toBeVisible();
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.locator('main#main')).not.toHaveText(/^\s*$/);
    await expect(page.locator('main#main .spinner')).toHaveCount(0, { timeout: 15_000 });
    await noHorizontalOverflow(page);
  }
  await expect(page.getByText('Page not found')).toBeVisible();
  w.assertClean();
});

test('primary navigation reaches each section', async ({ page, isMobile }) => {
  const w = watchErrors(page);
  await page.goto('/');
  const nav = isMobile ? page.locator('nav.tabbar') : page.locator('nav.rail');
  for (const [label, path] of [['Discover', '/games'], ['Missions', '/missions'], ['Profile', '/me'], ['Home', '/']] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}`));
  }
  w.assertClean();
});

test('the Lounge is not linked, listed or reachable for ordinary visitors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Lounge/ })).toHaveCount(0);
  await page.goto('/games');
  await expect(page.getByText(/Roulette|Blackjack|Slots/)).toHaveCount(0);
  await page.goto('/lounge');
  await expect(page.getByText('Page not available')).toBeVisible();
  const api = await page.request.get('/api/games?env=lounge');
  expect((await api.json()).games).toHaveLength(0);
  const sm = await page.request.get('/sitemap.xml');
  expect(await sm.text()).not.toContain('/lounge');
});

for (const width of [360, 375, 390, 430, 768, 1024, 1440, 1920]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const r of ['/', '/games', '/games/chess-blitz', '/rooms', '/leaderboards', '/settings', '/shop', '/me']) {
      await page.goto(r);
      await expect(page.locator('main#main .spinner')).toHaveCount(0, { timeout: 15_000 });
      await noHorizontalOverflow(page);
    }
  });
}

test('SEO metadata and security headers are present', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/PLAYZO/);
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
  expect(await page.locator('meta[property="og:title"]').count()).toBeGreaterThan(0);
  expect(await page.locator('link[rel="icon"]').count()).toBeGreaterThan(0);
  const h = await request.get('/api/health');
  expect(h.headers()['x-content-type-options']).toBe('nosniff');
  expect(h.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
