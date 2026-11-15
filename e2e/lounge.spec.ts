/**
 * Lounge (21+) in the browser. Public users never see it. Internal QA: an admin promotes an adult
 * test account to "tester" on this isolated localhost instance (PLAYZO_ADULT_DEV_PREVIEW=true),
 * the tester completes the dev attestation + Lounge terms, and plays one round of each of the
 * 25 simulations through the real UI. Every game shows "NOT LEGALLY APPROVED" banners.
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { watchErrors, acceptDialogs, uniq, registerVia, loginVia } from './helpers';

const LOUNGE = ['eu-roulette', 'us-roulette', 'fr-roulette', 'blackjack', 'blackjack-duel', 'baccarat', 'sic-bo', 'holdem', 'omaha', 'teen-patti', 'andar-bahar', 'dragon-tiger', 'three-card-poker', 'video-poker', 'classic-slots', 'adventure-slots', 'vault-slots', 'cosmic-reels', 'neon-fruit', 'mystery-jackpot', 'plinko', 'dice-arena', 'hi-lo', 'mines', 'crash-flight'];

async function makeTester(browserCtx: BrowserContext, adminCtx: BrowserContext) {
  const name = uniq('qa');
  const u = await registerVia(browserCtx, name, '1988-08-08');
  await loginVia(adminCtx, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
  const r = await adminCtx.request.post(`/api/admin/users/${u.id}/role`, { headers: { 'x-playzo': '1' }, data: { role: 'tester' } });
  expect(r.status()).toBe(200);
  return u;
}

test('ordinary adults are refused even the dev attestation; minors get 404', async ({ browser }) => {
  const ctx = await browser.newContext();
  await registerVia(ctx, uniq('adult'), '1985-01-01');
  const att = await ctx.request.post('/api/auth/age-assurance', { headers: { 'x-playzo': '1' }, data: { method: 'dev-attestation' } });
  expect(att.status()).toBe(503);
  const page = await ctx.newPage();
  await page.goto('/lounge');
  await expect(page.getByText('Page not available')).toBeVisible();
  await expect(page.getByRole('link', { name: /Lounge/ })).toHaveCount(0);
  const teen = await browser.newContext();
  await registerVia(teen, uniq('teen'), new Date(Date.now() - 15 * 365.25 * 86400_000).toISOString().slice(0, 10));
  expect((await teen.request.get('/api/lounge/status')).status()).toBe(404);
  expect((await teen.request.post('/api/sessions', { headers: { 'x-playzo': '1' }, data: { gameId: 'blackjack' } })).status()).toBe(404);
  await ctx.close(); await teen.close();
});

test.describe('internal QA: all 25 simulations', () => {
  test.describe.configure({ mode: 'default' }); // a failure in one game must not skip the others
  let ctx: BrowserContext, page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    const admin = await browser.newContext();
    await makeTester(ctx, admin);
    await admin.close();
    page = await ctx.newPage();
    acceptDialogs(page);
    // Gate flow through the UI: attestation (labelled as not a real verification) and terms.
    await page.goto('/lounge');
    await expect(page.getByText(/DEVELOPMENT ONLY/)).toBeVisible();
    await page.getByRole('button', { name: /attest|verify/i }).first().click();
    await page.getByRole('button', { name: /I'm 21\+ and I accept/ }).click();
    await expect(page.getByText(/DEV PREVIEW/)).toBeVisible();
    await expect(page.getByText(/NOT LEGALLY APPROVED/)).toBeVisible();
  });
  test.afterAll(async () => { await ctx?.close(); });

  for (const id of LOUNGE) {
    test(id, async () => {
      const w = watchErrors(page);
      await page.goto(`/lounge/${id}`);
      await expect(page.getByText('Dev preview')).toBeVisible();
      await expect(page.getByText(/Published mathematics/)).toBeVisible();
      await page.getByRole('link', { name: /Play with Fun Chips/ }).click();
      await expect(page).toHaveURL(new RegExp(`/lounge/play/${id}`));
      await expect(page.locator('.stage-body')).toBeVisible();
      const lets = page.getByRole('button', { name: "Let's play" });
      if (await lets.isVisible({ timeout: 3000 }).catch(() => false)) await lets.click(); // first-visit instructions
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const ok = page.waitForResponse((r) => r.url().includes('/action') && r.request().method() === 'POST' && r.status() === 200, { timeout: 30_000 });
      await playOneRound(page, id);
      await ok; // at least one valid action was settled server-side through the ledger
      // Leaving closes the session and reveals the seed for audit.
      const end = page.waitForResponse((r) => r.url().endsWith('/end'));
      await page.getByRole('link', { name: 'Leave game' }).click();
      expect((await end).status()).toBe(200);
      w.assertClean();
    });
  }
});

async function click(page: Page, name: RegExp) {
  const b = page.locator('.stage-body').getByRole('button', { name }).first();
  await expect(b).toBeEnabled({ timeout: 10_000 });
  await b.click();
}
async function clickIfVisible(page: Page, name: RegExp) {
  const b = page.locator('.stage-body').getByRole('button', { name }).first();
  if (await b.isVisible({ timeout: 2500 }).catch(() => false) && await b.isEnabled().catch(() => false)) return b.click({ timeout: 3000 }).then(() => true, () => false); // the round may end first
  return false;
}

async function playOneRound(page: Page, id: string) {
  if (id.endsWith('roulette')) { await click(page, /^red$/i); await click(page, /^spin/i); return; }
  if (/slots|reels|fruit|jackpot/.test(id)) { await click(page, /^spin/i); return; }
  switch (id) {
    case 'blackjack': await click(page, /^deal/i); await clickIfVisible(page, /^stand/i); return;
    case 'blackjack-duel': await click(page, /^deal duel/i); await clickIfVisible(page, /^stand/i); return;
    case 'baccarat': await click(page, /banker/i); await click(page, /^deal$/i); return;
    case 'dragon-tiger': await click(page, /dragon/i); await click(page, /^deal$/i); return;
    case 'sic-bo': await page.locator('.stage-body button[title]').first().click(); await click(page, /roll/i); return;
    case 'andar-bahar': await clickIfVisible(page, /andar/i); await click(page, /^deal/i); return;
    case 'three-card-poker': await click(page, /^deal/i); await click(page, /^(play|fold)/i); return;
    case 'video-poker': await click(page, /^deal/i); await click(page, /^draw/i); return;
    case 'holdem': case 'omaha': await click(page, /take a seat/i); await click(page, /^deal/i); await clickIfVisible(page, /^(fold|check)/i); return;
    case 'teen-patti': await click(page, /join the mehfil|take a seat/i); await click(page, /^deal/i); await clickIfVisible(page, /^pack/i); return;
    case 'plinko': await click(page, /drop ball/i); return;
    case 'dice-arena': await click(page, /^roll/i); return;
    case 'hi-lo': await click(page, /^start/i); await click(page, /^(higher|lower)/i); return;
    case 'mines': await click(page, /^start/i); await page.locator('.stage-body button[aria-label^="Tile"], .stage-body .mines-grid button').first().click(); return;
    case 'crash-flight': await click(page, /take off/i); await page.waitForTimeout(2500); await clickIfVisible(page, /^bank/i); return;
  }
}
