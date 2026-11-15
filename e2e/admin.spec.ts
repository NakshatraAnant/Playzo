/** Admin dashboard: every tab loads for an admin; normal users are refused by the server, not just the UI. */
import { test, expect } from '@playwright/test';
import { watchErrors, loginVia, registerVia, uniq } from './helpers';

const TABS = ['Overview', 'Analytics', 'Users', 'Support', 'Reports', 'Games', 'Rooms', 'Content', 'Economy', 'Legal', 'Emails', 'Ads', 'System', 'Errors', 'Compliance', 'Audit'];

test('admin can open every tab; Legal records cannot open a game', async ({ browser }) => {
  const ctx = await browser.newContext();
  await loginVia(ctx, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
  const page = await ctx.newPage();
  const w = watchErrors(page);
  await page.goto('/admin');
  for (const t of TABS) {
    await page.getByRole('button', { name: t, exact: true }).click();
    await expect(page.locator('main .spinner')).toHaveCount(0, { timeout: 15_000 });
  }
  // System tab never shows secrets.
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.getByText('Configuration (read-only)')).toBeVisible();
  const sys = await (await ctx.request.get('/api/admin/system')).text();
  expect(sys).not.toContain(process.env.E2E_ADMIN_PASSWORD!);
  expect(sys).not.toMatch(/password|api_?key|secret/i);

  // Recording an approval documents it but the public gate stays closed (config + master switch required).
  await page.getByRole('button', { name: 'Legal', exact: true }).click();
  await expect(page.getByText(/Lounge master switch: OFF|Lounge master switch:/)).toBeVisible();
  const rec = await ctx.request.post('/api/admin/legal/plinko', { headers: { 'x-playzo': '1' }, data: { status: 'approved', reference: 'E2E-TEST-DOC', reviewer: 'E2E test (not real counsel)' } });
  expect((await rec.json()).gate).toBe('pending_legal_review');
  w.assertClean();
  await ctx.close();
});

test('non-staff users get 403 from every admin endpoint and a "Not permitted" page', async ({ browser }) => {
  const ctx = await browser.newContext();
  await registerVia(ctx, uniq('plain'));
  for (const p of ['overview', 'users', 'legal', 'rooms', 'system', 'emails', 'content', 'audit']) {
    expect((await ctx.request.get(`/api/admin/${p}`)).status(), p).toBe(403);
  }
  expect((await ctx.request.post('/api/admin/legal/plinko', { headers: { 'x-playzo': '1' }, data: { status: 'approved' } })).status()).toBe(403);
  const page = await ctx.newPage();
  await page.goto('/admin');
  await expect(page.getByText('Not permitted')).toBeVisible();
  await ctx.close();
});
