/**
 * Email delivery with a provider adapter.
 *
 *  - 'outbox' (default): NOT a delivery. Messages are stored in the delivery log with status
 *    'outbox_only' and shown at /dev/outbox in dev mode. Nothing leaves this machine.
 *  - 'resend': HTTP adapter for the Resend API. Activated only when PLAYZO_EMAIL_PROVIDER=resend,
 *    RESEND_API_KEY and PLAYZO_EMAIL_FROM are all set. Not exercised against the live service in
 *    this build (no credentials were available).
 *
 * Every message is recorded with its status, attempts and last error. Failed sends are retried
 * with exponential back-off (max 5 attempts). The UI never claims an email was "sent" unless the
 * provider accepted it.
 */
import { db, nowIso } from './db';
import { config } from './config';

export type Template = 'verify_email' | 'reset_password' | 'parent_consent' | 'password_changed' | 'new_sign_in' | 'account_deleted' | 'security_alert';

interface Rendered { subject: string; text: string; html: string }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function layout(title: string, paras: string[], cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0718;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#f4f1ff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#140d2b;border-radius:18px;padding:28px">
<tr><td style="font-size:26px;font-weight:900;letter-spacing:.04em;color:#ffb020">PLAYZO</td></tr>
<tr><td style="font-size:20px;font-weight:800;padding:14px 0 6px">${esc(title)}</td></tr>
${paras.map((p) => `<tr><td style="font-size:15px;line-height:1.55;color:#cfc8ea;padding:4px 0">${esc(p)}</td></tr>`).join('')}
${cta ? `<tr><td style="padding:18px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:12px">${esc(cta.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#8f86b3;word-break:break-all">${esc(cta.url)}</td></tr>` : ''}
<tr><td style="font-size:12px;color:#8f86b3;padding-top:18px">You received this because of activity on your PLAYZO account. If this wasn't you, you can ignore this email or reset your password.</td></tr>
</table></td></tr></table></body></html>`;
}

export function render(t: Template, v: Record<string, string>): Rendered {
  const mk = (subject: string, paras: string[], cta?: { label: string; url: string }): Rendered => ({
    subject, html: layout(subject, paras, cta), text: [...paras, cta ? `${cta.label}: ${cta.url}` : ''].filter(Boolean).join('\n\n'),
  });
  switch (t) {
    case 'verify_email': return mk('Verify your PLAYZO email', ['Welcome to PLAYZO! Aaja PLAYZO pe khelte hain!', 'Confirm this address so you can recover your account.'], { label: 'Verify email', url: v.url });
    case 'reset_password': return mk('Reset your PLAYZO password', ['Someone asked to reset your password. The link is valid for 1 hour.'], { label: 'Reset password', url: v.url });
    case 'parent_consent': return mk('Your child wants to play on PLAYZO', [`A child account "${v.username}" was created with this address as parent or guardian.`, 'Without your approval the account can only play solo family games. Approving enables friends and private rooms (emote-only chat).'], { label: 'Review and approve', url: v.url });
    case 'password_changed': return mk('Your PLAYZO password was changed', ['Your password was just changed and other devices were signed out.', 'If this was not you, reset your password immediately.'], { label: 'Reset password', url: v.url });
    case 'new_sign_in': return mk('New sign-in to your PLAYZO account', [`A new sign-in happened at ${v.when}${v.device ? ` from ${v.device}` : ''}.`, 'If this was you, there is nothing to do.'], { label: 'Review account security', url: v.url });
    case 'account_deleted': return mk('Your PLAYZO account was deleted', ['Your account and gameplay data were permanently deleted as you requested.']);
    case 'security_alert': return mk('PLAYZO security notice', [v.message]);
  }
}

/* ---------------- providers ---------------- */
interface Provider { name: string; configured: boolean; send(to: string, r: Rendered): Promise<{ ok: true; id?: string } | { ok: false; error: string; retryable: boolean }> }

const outbox: Provider = { name: 'outbox', configured: false, send: async () => ({ ok: false, error: 'No email provider configured (local outbox only)', retryable: false }) };

const resend: Provider = {
  name: 'resend',
  get configured() { return !!(config.email.resendApiKey && config.email.from); },
  async send(to, r) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: config.email.from, to: [to], subject: r.subject, html: r.html, text: r.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) { const j = (await res.json().catch(() => ({}))) as { id?: string }; return { ok: true, id: j.id }; }
      return { ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 };
    } catch (e: any) { return { ok: false, error: String(e?.message ?? e).slice(0, 200), retryable: true }; }
  },
};

export function activeProvider(): Provider {
  if (config.email.provider === 'resend' && resend.configured) return resend;
  return outbox;
}
export function emailStatus() {
  const p = activeProvider();
  return { provider: p.name, configured: p.configured, requested: config.email.provider, note: p.configured ? 'External delivery enabled' : 'NOT CONFIGURED: messages are stored in the local outbox only and are not delivered' };
}

/** Queue an email. Returns the delivery-log id. Never throws on provider failure. */
export function sendEmail(to: string, template: Template, vars: Record<string, string>, userId?: string | null): number {
  const r = render(template, vars);
  const p = activeProvider();
  const res = db().run(
    'INSERT INTO dev_outbox (to_email, subject, body, template, provider, status, user_id, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    to, r.subject, r.text, template, p.name, p.configured ? 'queued' : 'outbox_only', userId ?? null, p.configured ? nowIso() : null,
  );
  const id = Number(res.lastInsertRowid);
  if (p.configured) void deliver(id);
  return id;
}

const BACKOFF_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
async function deliver(id: number) {
  const row = db().get<{ id: number; to_email: string; template: Template; subject: string; body: string; attempts: number; status: string }>('SELECT * FROM dev_outbox WHERE id = ?', id);
  if (!row || row.status !== 'queued') return;
  const p = activeProvider();
  if (!p.configured) return;
  const rendered: Rendered = { subject: row.subject, text: row.body, html: layout(row.subject, row.body.split('\n\n')) };
  const r = await p.send(row.to_email, rendered);
  const attempts = row.attempts + 1;
  if (r.ok) db().run("UPDATE dev_outbox SET status = 'sent', attempts = ?, sent_at = ?, last_error = NULL, next_attempt_at = NULL WHERE id = ?", attempts, nowIso(), id);
  else if (!r.retryable || attempts >= BACKOFF_MS.length) db().run("UPDATE dev_outbox SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = NULL WHERE id = ?", attempts, r.error, id);
  else db().run('UPDATE dev_outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?', attempts, r.error, new Date(Date.now() + BACKOFF_MS[attempts]).toISOString(), id);
}

/** Retry worker: picks up queued messages whose back-off has elapsed. */
export function retryDueEmails() {
  if (!activeProvider().configured) return;
  for (const r of db().all<{ id: number }>("SELECT id FROM dev_outbox WHERE status = 'queued' AND next_attempt_at <= ? LIMIT 20", nowIso())) void deliver(r.id);
}
/** Admin: re-queue a failed message. */
export function requeue(id: number): boolean {
  if (!activeProvider().configured) return false;
  const r = db().run("UPDATE dev_outbox SET status = 'queued', next_attempt_at = ?, attempts = 0 WHERE id = ? AND status = 'failed'", nowIso(), id);
  if (Number(r.changes)) void deliver(id);
  return Number(r.changes) > 0;
}
