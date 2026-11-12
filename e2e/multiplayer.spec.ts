/** Two real browsers play a live room: create from the game page, join by code, ready, start, move, resign, results, rematch. */
import { test, expect } from '@playwright/test';
import { watchErrors, acceptDialogs, uniq, registerVia } from './helpers';

test('two players: Connect Five room from creation to saved result', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  await registerVia(ca, uniq('host'));
  await registerVia(cb, uniq('guest'));
  const a = await ca.newPage(), b = await cb.newPage();
  const wa = watchErrors(a), wb = watchErrors(b);
  acceptDialogs(a); acceptDialogs(b);

  await a.goto('/games/connect-five');
  await a.getByRole('button', { name: 'Create room' }).click();
  await expect(a).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  const code = a.url().split('/').pop()!;
  await expect(a.getByText('Waiting room')).toBeVisible();

  // Player B joins by typing the code on the Rooms page.
  await b.goto('/rooms');
  await b.getByLabel('Room code').fill(code);
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b).toHaveURL(new RegExp(`/room/${code}`));
  await expect(a.getByText(/2\/2 joined/)).toBeVisible();

  await b.getByRole('button', { name: "I'm ready" }).click();
  await expect(a.getByText('Ready', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: /Start match/ }).click();

  // Both see the board; the host moves first.
  await expect(a.locator('.stage-body')).toBeVisible();
  await expect(b.getByText(/to move/)).toBeVisible();
  const cells = a.locator('.stage-body button:enabled:not(:has-text("Resign"))');
  await cells.first().click();
  await expect(b.getByText(/· you|You · to move|to move/).first()).toBeVisible();

  // Emotes are the only chat.
  await b.getByRole('button', { name: 'GG' }).click();
  await expect(a.locator('.toast').getByText('GG')).toHaveCount(1); // exactly one: one live connection per player

  // Host resigns: both see the result, which is saved to match history.
  await a.getByRole('button', { name: /Resign/ }).click();
  await expect(a.getByRole('heading', { name: / wins|You win|Good game/ })).toBeVisible();
  await expect(b.getByRole('heading', { name: /You win/ })).toBeVisible();
  const hist = await (await cb.request.get('/api/me/matches')).json();
  expect(hist.matches[0]).toMatchObject({ game_id: 'connect-five', outcome: 'win' });

  // Rematch returns everyone to the lobby.
  await a.getByRole('button', { name: 'Rematch' }).click();
  await expect(a.getByText('Waiting room')).toBeVisible();
  wa.assertClean(); wb.assertClean();
  await ca.close(); await cb.close();
});

test('a player who reloads mid-match reconnects to the same room state', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  await registerVia(ca, uniq('rh'));
  await registerVia(cb, uniq('rg'));
  const create = await ca.request.post('/api/rooms', { headers: { 'x-playzo': '1' }, data: { gameId: 'hex-conquest' } });
  const { code } = await create.json();
  const a = await ca.newPage(), b = await cb.newPage();
  await a.goto(`/room/${code}`); await b.goto(`/room/${code}`);
  await b.getByRole('button', { name: "I'm ready" }).click();
  await a.getByRole('button', { name: /Start match/ }).click();
  await expect(a.locator('.stage-body')).toBeVisible();
  await b.reload();
  await expect(b.getByText(/to move/)).toBeVisible();
  const room = await (await cb.request.get(`/api/rooms/${code}`)).json();
  expect(room.room.status).toBe('playing');
  expect(room.room.members.every((m: any) => m.connected)).toBe(true);
  await ca.close(); await cb.close();
});
