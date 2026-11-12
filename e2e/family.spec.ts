/**
 * Every family game in the browser: discovery page -> instructions -> start -> gameplay input ->
 * pause/resume -> finish -> results -> restart. Runs on desktop and on a 390px phone viewport.
 *
 * Replay games are ended with the in-game "Finish" control; the server re-verifies the run and the
 * results screen must say so. Strategy games are ended by resigning; Word Ladder by giving up.
 * The remaining server-timed games (quiz/sprint rounds that last minutes) are interacted with and
 * then restarted; their full play-to-end path is covered by tests/familyComplete.test.ts.
 */
import { test, expect, Page } from '@playwright/test';
import { watchErrors, acceptDialogs } from './helpers';

const REPLAY = ['mind-maze', 'pattern-hunter', 'number-rush', 'logic-lock', 'sequence-master', 'grid-genius', 'block-battle', 'tower-tactics', 'reflex-arena', 'color-dash', 'rhythm-rush', 'obstacle-sprint'];
const RESIGN = ['chess-blitz', 'connect-five', 'hex-conquest', 'territory-wars'];
const SERVER_OTHER = ['code-breaker', 'word-duel', 'trivia-clash', 'emoji-decode', 'word-ladder', 'geo-sprint', 'fact-or-fiction', 'memory-duel', 'party-chaos'];
const SKIP_CONTROLS = /resign|finish|pause|restart|quit|leave|how to play|back|give up|show a route|mute|sound|notifications/i;

async function openFromDiscovery(page: Page, id: string) {
  await page.goto(`/games/${id}`);
  await expect(page.locator('h1').first()).toBeVisible();
  // Instructions are available before playing.
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('ol li').first()).toBeVisible();
  await page.getByRole('button', { name: "Let's play" }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Instructions were just checked here, so mark them seen (the in-game copy would otherwise open again).
  await page.evaluate((g) => localStorage.setItem(`pz-tut-${g}`, '1'), id);
  const start = page.waitForResponse((r) => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
  await page.getByRole('link', { name: /Play (vs computer|solo)/ }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${id}`));
  expect((await start).status()).toBe(200);
}
const ended = (page: Page) => page.getByText(/Score verified by server replay|Server-authoritative result/).isVisible().catch(() => false);

async function pokeGame(page: Page, clicks = 4) {
  const body = page.locator('.stage-body');
  await expect(body).toBeVisible();
  for (const k of ['ArrowRight', 'ArrowDown', 'Space', 'ArrowLeft', 'ArrowUp', '1', 'Enter']) await page.keyboard.press(k).catch(() => undefined);
  const buttons = body.locator('button:enabled');
  const n = Math.min(await buttons.count(), 30);
  let done = 0;
  for (let i = 0; i < n && done < clicks; i++) {
    const b = buttons.nth(i);
    const label = ((await b.getAttribute('aria-label')) ?? (await b.innerText().catch(() => ''))).trim();
    if (SKIP_CONTROLS.test(label) || !(await b.isVisible().catch(() => false))) continue;
    await b.click({ timeout: 2000 }).catch(() => undefined);
    done++;
  }
  // Canvas / board games: tap the middle of the play area too.
  const box = await body.boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 260)).catch(() => undefined);
}

async function pauseResume(page: Page) {
  const pause = page.getByTestId('pause');
  if (!(await pause.isVisible().catch(() => false))) return false;
  await pause.click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
  return true;
}

test.describe('replay-verified family games', () => {
  for (const id of REPLAY) {
    test(id, async ({ page }) => {
      const w = watchErrors(page);
      acceptDialogs(page);
      await openFromDiscovery(page, id);
      await expect(page.getByTestId('finish-run')).toBeVisible({ timeout: 15_000 }); // countdown done, run in progress
      await pokeGame(page);
      // Some runs end naturally while playing (e.g. a crash in Obstacle Sprint, a wrong pad in Sequence Master).
      // A run that just ended shows "Verifying…" briefly; wait until it is either still playing or showing results.
      const settled = async () => {
        await expect(page.getByTestId('finish-run').or(page.getByText('Score verified by server replay'))).toBeVisible({ timeout: 15_000 });
        return page.getByTestId('finish-run').isVisible().catch(() => false);
      };
      if (await settled()) {
        expect(await pauseResume(page)).toBe(true);
        await pokeGame(page, 2);
      }
      if (await settled()) {
        const submit = page.waitForResponse((r) => r.url().includes('/submit'));
        await page.getByTestId('finish-run').click();
        const res = await submit;
        expect(res.status(), await res.text()).toBe(200);
      }
      await expect(page.getByText('Score verified by server replay')).toBeVisible();
      await expect(page.getByText(/XP/).first()).toBeVisible();
      // Restart: "Play again" starts a fresh, separately verified run.
      const again = page.waitForResponse((r) => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Play again' }).click();
      expect((await again).status()).toBe(200);
      await expect(page.getByTestId('finish-run')).toBeVisible({ timeout: 15_000 });
      w.assertClean();
    });
  }
});

test.describe('strategy games vs computer', () => {
  for (const id of RESIGN) {
    test(id, async ({ page }) => {
      const w = watchErrors(page);
      acceptDialogs(page);
      await openFromDiscovery(page, id);
      await pokeGame(page, 3);
      expect(await pauseResume(page)).toBe(true);
      const act = page.waitForResponse((r) => r.url().includes('/action'));
      await page.getByRole('button', { name: /Resign/ }).first().click();
      expect((await act).status()).toBe(200);
      await expect(page.getByText('Server-authoritative result')).toBeVisible();
      await page.getByRole('button', { name: 'Play again' }).click();
      await expect(page.locator('.stage-body')).toBeVisible();
      w.assertClean();
    });
  }
});

test.describe('server-authoritative word, quiz and party games', () => {
  for (const id of SERVER_OTHER) {
    test(id, async ({ page }) => {
      const w = watchErrors(page);
      acceptDialogs(page);
      await openFromDiscovery(page, id);
      await pokeGame(page, 4);
      expect(await pauseResume(page)).toBe(true);
      await pokeGame(page, 2);
      if (id === 'word-ladder') {
        for (let i = 0; i < 12; i++) {
          if (await page.getByText('Server-authoritative result').isVisible().catch(() => false)) break;
          const g = page.getByRole('button', { name: /Show a route|Give up/i });
          if (await g.isVisible().catch(() => false)) await g.click({ timeout: 3000 }).catch(() => undefined); // results may replace the button
          await page.waitForTimeout(250);
        }
        await expect(page.getByText('Server-authoritative result')).toBeVisible();
      } else if (!(await page.getByText('Server-authoritative result').isVisible().catch(() => false))) {
        // Restart mid-game: the current run ends without a score and a new session starts.
        const again = page.waitForResponse((r) => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
        await page.getByTestId('restart').click();
        await page.getByTestId('confirm-restart').click();
        expect((await again).status()).toBe(200);
        await expect(page.locator('.stage-body')).toBeVisible();
      }
      w.assertClean();
    });
  }
});

test('daily puzzle opens in daily context and cannot be paused', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/daily');
  await page.getByRole('link', { name: /Play today's puzzle|Play again/ }).click();
  const lets = page.getByRole('button', { name: "Let's play" });
  if (await lets.isVisible({ timeout: 3000 }).catch(() => false)) await lets.click();
  await expect(page.getByText('Daily', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('pause')).toHaveCount(0);
  w.assertClean();
});
