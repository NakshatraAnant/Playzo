/** Browser regressions found by the November 2026 production audit. */
import { test, expect } from '@playwright/test';
import { watchErrors, skipTutorials, registerVia, uniq, acceptDialogs } from './helpers';

const started = (page: any) => page.waitForResponse((r: any) => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');

test('typing in a dialog keeps focus in the field', async ({ page, context }) => {
  const w = watchErrors(page);
  await skipTutorials(page, []);
  await registerVia(context, uniq('foc'));
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Type DELETE').click();
  await page.keyboard.type('DELETE'); // real key presses: each one re-renders the dialog
  await expect(page.getByLabel('Type DELETE')).toHaveValue('DELETE');
  await expect(page.getByRole('button', { name: 'Delete forever' })).toBeEnabled();
  // Tab stays inside the dialog.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  w.assertClean();
});

test('first visit: instructions come first and the run starts only afterwards', async ({ page }) => {
  const w = watchErrors(page);
  await skipTutorials(page, []);
  let sessions = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/sessions') && r.method() === 'POST') sessions++; });
  await page.goto('/play/obstacle-sprint');
  await expect(page.getByRole('button', { name: "Let's play" })).toBeVisible();
  await page.waitForTimeout(4000); // long enough for an unattended runner to crash
  expect(sessions).toBe(0);
  const s = started(page);
  await page.getByRole('button', { name: "Let's play" }).click();
  expect((await s).status()).toBe(200);
  await expect(page.getByTestId('finish-run')).toBeVisible({ timeout: 15_000 });
  expect(sessions).toBe(1);
  w.assertClean();
});

test('Obstacle Sprint stands still while paused and continues afterwards', async ({ page }) => {
  const w = watchErrors(page);
  acceptDialogs(page);
  await skipTutorials(page, ['obstacle-sprint']);
  await page.goto('/play/obstacle-sprint?difficulty=easy');
  await expect(page.getByTestId('pause')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  const dist = () => page.locator('.hud .stat b').first().innerText();
  const before = await dist();
  await page.waitForTimeout(5000);
  expect(await dist()).toBe(before);
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page.getByText('Score verified by server replay')).toBeVisible({ timeout: 60_000 }); // runs on, crashes by itself, verifies
  w.assertClean();
});

test('a game left while paused can be continued', async ({ page }) => {
  const w = watchErrors(page);
  acceptDialogs(page);
  await skipTutorials(page, ['code-breaker']);
  const s = started(page);
  await page.goto('/play/code-breaker');
  const id = (await (await s).json()).sessionId;
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByRole('link', { name: 'Quit to game page' }).click();
  await page.goto(`/play/code-breaker?resume=${id}`);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add pink diamond' }).click();
  const act = page.waitForResponse((r) => r.url().includes(`/api/sessions/${id}/action`));
  await page.getByRole('button', { name: 'Submit guess' }).click();
  expect((await act).status()).toBe(200);
  w.assertClean();
});

test('a score is not lost when the connection drops at the end', async ({ page }) => {
  acceptDialogs(page);
  await skipTutorials(page, ['logic-lock']);
  await page.goto('/play/logic-lock');
  await expect(page.getByTestId('finish-run')).toBeVisible({ timeout: 15_000 });
  await page.route('**/submit', (r) => r.abort());
  await page.getByTestId('finish-run').click();
  await expect(page.getByTestId('retry-submit')).toBeVisible();
  await page.unroute('**/submit');
  await page.getByTestId('retry-submit').click();
  await expect(page.getByText('Score verified by server replay')).toBeVisible();
});

test('a crash inside a page shows the error screen, not "Page not found"; bad leaderboard links work', async ({ page }) => {
  await skipTutorials(page, []);
  await page.goto('/leaderboards?game=does-not-exist');
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
  await page.route('**/api/shop', (r) => r.fulfill({ json: { items: null, plans: [], payments: {} } })); // unexpected data: the page throws
  await page.goto('/shop');
  await expect(page.getByText('Something went wrong')).toBeVisible();
  await expect(page.getByText('Page not found')).toHaveCount(0);
  await expect(page.locator('nav').first()).toBeVisible(); // navigation survives
});

test('board games work with the keyboard alone', async ({ page }) => {
  const w = watchErrors(page);
  await skipTutorials(page, ['connect-five']);
  await page.goto('/play/connect-five');
  const cell = page.getByRole('button', { name: 'Row 6 column 6', exact: true });
  await cell.focus();
  const act = page.waitForResponse((r) => r.url().includes('/action'));
  await page.keyboard.press('Enter');
  expect((await act).status()).toBe(200);
  w.assertClean();
});

test('no third-party requests', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) outside.push(r.url()); });
  for (const p of ['/', '/games/word-duel', '/rooms']) { await page.goto(p); await page.waitForTimeout(500); }
  expect(outside).toEqual([]);
});
