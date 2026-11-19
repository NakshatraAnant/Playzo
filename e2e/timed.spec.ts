/**
 * The five server-timed family games played to their natural end in the browser (each takes 40 s to
 * 2 min of real time, because the server clock decides). Completes the per-game browser coverage.
 */
import { test, expect, Page } from '@playwright/test';
import { watchErrors, skipTutorials } from './helpers';

const RESULT = 'Server-authoritative result';
const CONTROLS = /pause|restart|how to play|music|sound|leave|back|resign|shuffle|delete|hint|skip|enter|guess/i;

async function answerSomething(page: Page) {
  // Prefer real answer buttons (quiz games); fall back to any other enabled game button.
  const answers = page.locator('.stage-body button.answer:enabled');
  // 5 s: the question panel animates in as the answers enable, and Playwright waits for the buttons to be stable.
  if (await answers.count().catch(() => 0)) { await answers.first().click({ timeout: 5000 }).catch(() => undefined); return; }
  const buttons = page.locator('.stage-body button:enabled');
  const n = await buttons.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const label = ((await b.getAttribute('aria-label').catch(() => null)) ?? (await b.innerText().catch(() => ''))).trim();
    if (CONTROLS.test(label) || !(await b.isVisible().catch(() => false))) continue;
    await b.click({ timeout: 1500 }).catch(() => undefined);
    return;
  }
}

async function playToEnd(page: Page, id: string, difficulty: string, step: (p: Page) => Promise<void>) {
  const w = watchErrors(page);
  await skipTutorials(page, [id]);
  await page.goto(`/play/${id}?difficulty=${difficulty}`);
  await expect(page.locator('.stage-body')).toBeVisible();
  const deadline = Date.now() + 280_000;
  while (Date.now() < deadline && !(await page.getByText(RESULT).isVisible().catch(() => false))) {
    await step(page);
    await page.waitForTimeout(450);
  }
  await expect(page.getByText(RESULT)).toBeVisible();
  await expect(page.getByText(/XP/).first()).toBeVisible();
  await expect(page.getByTestId('up-next')).toBeVisible();
  w.assertClean();
}

test.describe('server-timed games played to the end', () => {
  test.describe.configure({ timeout: 300_000 });
  test('trivia-clash (10 questions)', async ({ page }) => playToEnd(page, 'trivia-clash', 'easy', answerSomething));
  test('party-chaos (8 rounds)', async ({ page }) => playToEnd(page, 'party-chaos', 'easy', answerSomething));
  test('geo-sprint (60-second sprint)', async ({ page }) => playToEnd(page, 'geo-sprint', 'normal', answerSomething));
  test('emoji-decode (skip through every puzzle)', async ({ page }) => playToEnd(page, 'emoji-decode', 'easy', async (p) => {
    const skip = p.locator('.stage-body').getByRole('button', { name: /skip/i });
    if (await skip.isEnabled().catch(() => false)) await skip.click({ timeout: 1500 }).catch(() => undefined);
  }));
  test('word-duel (90-second round)', async ({ page }) => {
    let typed = false;
    await playToEnd(page, 'word-duel', 'normal', async (p) => {
      if (typed) return;
      const letters = p.locator('.stage-body button:enabled').filter({ hasText: /^[A-Za-z]$/ });
      if ((await letters.count()) >= 3) {
        for (let i = 0; i < 4; i++) await letters.nth(i % (await letters.count())).click({ timeout: 1500 }).catch(() => undefined);
        await p.locator('.stage-body').getByRole('button', { name: /enter/i }).click({ timeout: 1500 }).catch(() => undefined);
        typed = true;
      }
    });
  });
});
