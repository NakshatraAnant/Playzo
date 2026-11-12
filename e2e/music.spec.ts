/** Every game starts its own soundtrack; music pauses, can be switched off in-game, and the Sound settings work. */
import { test, expect, Page } from '@playwright/test';
import { watchErrors } from './helpers';

const state = (page: Page) => page.evaluate(() => (window as any).__pzMusic?.state());
const FAMILY_SAMPLE = ['chess-blitz', 'trivia-clash', 'party-chaos', 'tower-tactics', 'number-rush', 'word-duel'];

test('each family game plays its own theme', async ({ page }) => {
  const w = watchErrors(page);
  await page.addInitScript(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('pz-tut-')) localStorage.removeItem(k); });
  const seen = new Map<string, string>();
  for (const id of FAMILY_SAMPLE) {
    await page.evaluate((g) => localStorage.setItem(`pz-tut-${g}`, '1'), id).catch(() => undefined);
    await page.goto(`/play/${id}`);
    await expect.poll(async () => (await state(page))?.gameId, { timeout: 15_000 }).toBe(id);
    const s = await state(page);
    expect(s.playing).toBe(true);
    seen.set(id, `${s.style}:${s.tempo}`);
  }
  expect(new Set(seen.values()).size).toBe(FAMILY_SAMPLE.length); // all different
  w.assertClean();
});

test('pause sinks the music, the in-game toggle switches it off, and Settings controls it', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pz-tut-code-breaker', '1'));
  await page.goto('/play/code-breaker');
  await expect.poll(async () => (await state(page))?.playing, { timeout: 15_000 }).toBe(true);
  await page.getByTestId('pause').click();
  expect((await state(page)).paused).toBe(true);
  await page.getByTestId('resume').click();
  expect((await state(page)).paused).toBe(false);
  await page.getByTestId('music-toggle').click();
  await expect.poll(async () => (await state(page)).playing).toBe(false);
  await page.getByTestId('music-toggle').click();
  await expect.poll(async () => (await state(page)).playing).toBe(true);

  await page.goto('/settings');
  await expect(page.getByText('Sound and music')).toBeVisible();
  await expect(page.getByLabel('Music volume')).toBeVisible();
  await page.getByRole('button', { name: /Baroque chamber/ }).click();
  await expect.poll(async () => (await state(page))?.style).toBe('baroque');
  await page.getByRole('button', { name: /Baroque chamber/ }).click();
  await expect.poll(async () => (await state(page)).playing).toBe(false);
  w.assertClean();
});
