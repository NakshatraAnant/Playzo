/** The approved user journey: homepage CTAs, age gate at onboarding, guest play, support, analytics. */
import { test, expect } from '@playwright/test';
import { watchErrors, uniq, registerVia, loginVia, skipTutorials } from './helpers';

test('homepage: the three primary actions work and every journey section is present', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your place to play, compete and connect/ })).toBeVisible();
  for (const s of ['Quick games', 'Play with friends', 'Puzzle & logic', 'Word games', 'Trivia', 'Strategy', 'Arcade', 'Party games', 'Featured games']) {
    await expect(page.getByRole('heading', { name: s, exact: true }).first()).toBeVisible();
  }
  await page.getByTestId('cta-explore').click();
  await expect(page).toHaveURL(/\/games$/);
  await page.goBack();
  await page.getByTestId('cta-play-friends').click();
  await expect(page).toHaveURL(/\/rooms$/);
  await page.goBack();
  await skipTutorials(page, ['number-rush', 'pattern-hunter', 'geo-sprint', 'reflex-arena', 'color-dash', 'word-duel', 'trivia-clash', 'fact-or-fiction', 'rhythm-rush', 'obstacle-sprint', 'party-chaos']);
  await page.getByTestId('cta-play-now').click();
  await expect(page).toHaveURL(/\/play\//); // a guest goes straight into a real game
  await expect(page.locator('.stage-body')).toBeVisible();
  w.assertClean();
});

test('onboarding: under-13 cannot create an account but can play as a guest', async ({ page }) => {
  await page.goto('/register');
  const kid = new Date(Date.now() - 10 * 365.25 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel(/date of birth/i).fill(kid);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/accounts are for players aged 13 and over/)).toBeVisible();
  await expect(page.getByLabel(/username/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Play as a guest' }).click();
  await expect(page).toHaveURL(/\/games/);
  // The server refuses too, whatever the client does.
  const r = await page.request.post('/api/auth/register', { headers: { 'x-playzo': '1' }, data: { email: 'kidx@e2e.test', username: uniq('kid'), password: 'e2e-password-1', dob: kid, acceptTerms: true, parentEmail: 'p@e2e.test' } });
  expect(r.status()).toBe(403);
});

test('a 19-year-old sees no Lounge anywhere, even by direct URL or API', async ({ browser }) => {
  const ctx = await browser.newContext();
  const dob = new Date(Date.now() - 19.4 * 365.25 * 86400_000).toISOString().slice(0, 10);
  await registerVia(ctx, uniq('nineteen'), dob);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Lounge/ })).toHaveCount(0);
  await page.goto('/lounge');
  await expect(page.getByText('Page not available')).toBeVisible();
  await page.goto('/lounge/blackjack');
  await expect(page.getByText('Page not available')).toBeVisible();
  expect((await ctx.request.get('/api/lounge/status')).status()).toBe(404);
  expect((await ctx.request.post('/api/sessions', { headers: { 'x-playzo': '1' }, data: { gameId: 'eu-roulette' } })).status()).toBe(404);
  expect((await ctx.request.post('/api/auth/lounge-terms', { headers: { 'x-playzo': '1' } })).status()).toBe(403);
  await ctx.close();
});

test('support: a player opens a ticket, staff reply in Admin, the player sees the reply', async ({ browser }) => {
  const pc = await browser.newContext();
  await registerVia(pc, uniq('needhelp'));
  const page = await pc.newPage();
  const w = watchErrors(page);
  await page.goto('/support');
  await page.getByLabel('Topic').selectOption('bug');
  await page.getByLabel('Subject').fill('Sound stops after pause');
  await page.getByLabel('Message').fill('After pausing Number Rush twice the music does not come back.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page).toHaveURL(/\/support\/t_/);
  const id = page.url().split('/').pop()!;

  const ac = await browser.newContext();
  await loginVia(ac, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
  const admin = await ac.newPage();
  await admin.goto('/admin');
  await admin.getByRole('button', { name: 'Support', exact: true }).click();
  await admin.getByText('Sound stops after pause').click();
  await admin.getByLabel('Reply').fill('Thanks! Fixed in the next build.');
  await admin.getByRole('button', { name: /Send reply/ }).click();
  await expect(admin.getByText('Thanks! Fixed in the next build.')).toBeVisible();

  await page.goto(`/support/${id}`);
  await expect(page.getByText('Thanks! Fixed in the next build.')).toBeVisible();
  await expect(page.getByText('Waiting for you')).toBeVisible();
  w.assertClean();
  await pc.close(); await ac.close();
});

test('admin analytics shows KPIs and charts with a date filter', async ({ browser }) => {
  const ac = await browser.newContext();
  await loginVia(ac, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
  const page = await ac.newPage();
  const w = watchErrors(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByText('Guest → registered')).toBeVisible();
  await expect(page.getByText('D7 retention')).toBeVisible();
  await expect(page.locator('figure.chart')).toHaveCount(6);
  await page.getByRole('button', { name: '30 days' }).click();
  await expect(page.getByText(/From \d{4}-\d{2}-\d{2}/)).toBeVisible();
  w.assertClean();
  await ac.close();
});
