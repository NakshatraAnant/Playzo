/** Daily clean-up of short-lived records. Accounts, scores, the ledger and the audit log are never touched. */
import { db } from './db';

const ago = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

export function runHousekeeping(): Record<string, number> {
  const out: Record<string, number> = {};
  const del = (name: string, sql: string, ...args: unknown[]) => { out[name] = Number(db().run(sql, ...args).changes); };
  db().tx(() => {
    del('auth_sessions', 'DELETE FROM auth_sessions WHERE expires_at < ? OR revoked_at < ?', ago(0), ago(30));
    del('auth_tokens', 'DELETE FROM auth_tokens WHERE expires_at < ?', ago(7));
    del('auth_throttle', 'DELETE FROM auth_throttle WHERE window_start < ? AND COALESCE(locked_until, 0) < ?', Date.now() - 86400_000, Date.now());
    del('dev_outbox', "DELETE FROM dev_outbox WHERE status IN ('sent','failed') AND created_at < ?", ago(30));
    del('ad_impressions', 'DELETE FROM ad_impressions WHERE day < ?', ago(7).slice(0, 10));
    del('client_errors', 'DELETE FROM client_errors WHERE created_at < ?', ago(90));
    del('analytics_events', 'DELETE FROM analytics_events WHERE day < ?', ago(400).slice(0, 10));
  });
  return out;
}
export function startHousekeeping() {
  const run = () => { try { runHousekeeping(); } catch (e) { console.error('[housekeeping]', e); } };
  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
