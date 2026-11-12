/** Account journeys in the browser: register, sign out, sign in, password reset via outbox, sessions, notifications, delete. */
import { test, expect } from '@playwright/test';
import { watchErrors, uniq, skipTutorials } from './helpers';

test('register -> welcome -> sign out -> sign in -> reset password -> delete account', async ({ page }) => {
  const w = watchErrors(page);
  await skipTutorials(page, []);
  const name = uniq('e2eu');
  await page.goto('/register');
  await page.getByLabel(/email/i).first().fill(`${name}@e2e.test`);
  await page.getByLabel(/username/i).fill(name);
  await page.getByLabel(/^password/i).fill('e2e-password-1');
  await page.getByLabel(/date of birth/i).fill('1994-06-06');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/welcome/);

  // Settings shows this device and email-verification state honestly.
  await page.goto('/settings');
  await expect(page.getByText(/Where you're signed in/)).toBeVisible();
  await expect(page.getByText(/this device/)).toBeVisible();
  await expect(page.getByText(/Verify your email/)).toBeVisible();

  // The welcome notification is in the inbox.
  await page.goto('/notifications');
  await expect(page.getByText('Welcome to PLAYZO!')).toBeVisible();

  // Sign out and back in.
  await page.goto('/settings');
  await page.getByRole('button', { name: /sign out/i }).first().click();
  await page.goto('/login');
  await page.getByLabel(/email or username/i).fill(name);
  await page.getByLabel(/password/i).fill('e2e-password-1');
  await page.getByRole('button', { name: /^sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.user.username).toBe(name);

  // Forgot password -> the reset link lands in the local outbox (not claimed as delivered).
  await page.goto('/forgot');
  await page.getByLabel(/email/i).fill(`${name}@e2e.test`);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/nothing was emailed/)).toBeVisible();
  await page.goto('/dev/outbox');
  await expect(page.getByText('Not delivered (local outbox)').first()).toBeVisible();
  const box = await (await page.request.get('/api/dev/outbox')).json();
  const reset = box.messages.find((m: any) => m.template === 'reset_password' && m.to_email === `${name}@e2e.test`);
  const path = reset.body.match(/https?:\/\/\S+/)[0].replace(/^https?:\/\/[^/]+/, '');
  await page.goto(path);
  await page.getByLabel(/new password/i).fill('e2e-password-2');
  await page.getByRole('button', { name: /update password/i }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();

  // Old password no longer works; new one does.
  const bad = await page.request.post('/api/auth/login', { headers: { 'x-playzo': '1' }, data: { identifier: name, password: 'e2e-password-1' } });
  expect(bad.status()).toBe(401);
  const good = await page.request.post('/api/auth/login', { headers: { 'x-playzo': '1' }, data: { identifier: name, password: 'e2e-password-2' } });
  expect(good.status()).toBe(200);

  // Delete the account from Settings.
  await page.goto('/settings');
  await page.getByRole('button', { name: /delete my account/i }).click();
  await page.getByLabel('Type DELETE').fill('DELETE');
  await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill('e2e-password-2');
  await page.getByRole('button', { name: /delete forever/i }).click();
  await expect(page).toHaveURL(/\/$/);
  const after = await page.request.post('/api/auth/login', { headers: { 'x-playzo': '1' }, data: { identifier: name, password: 'e2e-password-2' } });
  expect(after.status()).toBe(401);
  w.assertClean();
});

test('guest can play immediately and the daily reward is collected once', async ({ page }) => {
  const w = watchErrors(page);
  await page.request.post('/api/auth/guest', { headers: { 'x-playzo': '1' } });
  await page.goto('/');
  const claim = page.getByTestId('claim-daily');
  await expect(claim).toBeVisible();
  await claim.click();
  await expect(page.getByText('Daily reward collected')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('claim-daily')).toHaveCount(0);
  w.assertClean();
});

test('wrong passwords lock sign-in for that account', async ({ page }) => {
  const name = uniq('lock');
  await page.request.post('/api/auth/register', { headers: { 'x-playzo': '1' }, data: { email: `${name}@e2e.test`, username: name, password: 'e2e-password-1', dob: '1990-01-01', acceptTerms: true } });
  for (let i = 0; i < 5; i++) await page.request.post('/api/auth/login', { headers: { 'x-playzo': '1' }, data: { identifier: name, password: 'nope-nope' } });
  await page.goto('/login');
  await page.getByLabel(/email or username/i).fill(name);
  await page.getByLabel(/password/i).fill('e2e-password-1');
  await page.getByRole('button', { name: /^sign in/i }).click();
  await expect(page.getByText(/Too many failed sign-in attempts/)).toBeVisible();
});
