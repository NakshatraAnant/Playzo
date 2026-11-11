/** First-party product analytics. No third-party trackers, no device fingerprinting. */
import { db, dayKey } from './db';

export const CLIENT_EVENTS = new Set([
  'page_view', 'game_view', 'game_tutorial_open', 'search', 'filter', 'share_click', 'install_prompt', 'onboarding_step', 'onboarding_complete', 'intro_skipped',
]);

export function track(name: string, userId: string | null, props?: Record<string, unknown>) {
  try {
    db().run('INSERT INTO analytics_events (user_id, name, props, day) VALUES (?, ?, ?, ?)', userId, name, props ? JSON.stringify(props).slice(0, 1000) : null, dayKey());
  } catch {
    /* analytics must never break gameplay */
  }
}

export function overview() {
  const today = dayKey();
  const d = (n: number) => dayKey(new Date(Date.now() - n * 86400_000));
  const dau = db().get<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day = ? AND user_id IS NOT NULL', today)!.n;
  const wau = db().get<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL', d(6))!.n;
  const mau = db().get<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL', d(29))!.n;
  const users = db().get<{ n: number; guests: number }>('SELECT COUNT(*) AS n, SUM(is_guest) AS guests FROM users')!;
  const sessions = db().get<{ n: number; done: number; avg: number | null }>(
    "SELECT COUNT(*) AS n, SUM(status='completed') AS done, AVG(CASE WHEN ended_at IS NOT NULL THEN (julianday(ended_at)-julianday(started_at))*86400 END) AS avg FROM game_sessions WHERE started_at >= ?",
    d(29) + 'T00:00:00Z',
  )!;
  const popular = db().all('SELECT game_id, COUNT(*) AS plays FROM game_sessions WHERE started_at >= ? GROUP BY game_id ORDER BY plays DESC LIMIT 10', d(29) + 'T00:00:00Z');
  const daily = db().all('SELECT day, COUNT(DISTINCT user_id) AS users, COUNT(*) AS events FROM analytics_events WHERE day >= ? GROUP BY day ORDER BY day', d(13));
  const multiplayer = db().get<{ n: number }>('SELECT COUNT(*) AS n FROM matches WHERE created_at >= ?', d(29) + 'T00:00:00Z')!.n;
  const errors = db().get<{ n: number }>('SELECT COUNT(*) AS n FROM client_errors WHERE created_at >= ?', d(6) + 'T00:00:00Z')!.n;
  const rejected = db().get<{ n: number }>("SELECT COUNT(*) AS n FROM game_sessions WHERE status = 'rejected' AND started_at >= ?", d(29) + 'T00:00:00Z')!.n;
  // D1 / D7 retention by registration cohort (users created 1/7+ days ago who returned on that day)
  const retention = (k: number) => {
    const r = db().get<{ cohort: number; kept: number }>(
      `SELECT COUNT(*) AS cohort, SUM(EXISTS(SELECT 1 FROM analytics_events e WHERE e.user_id = u.id AND e.day = date(u.created_at, '+${k} day'))) AS kept
       FROM users u WHERE date(u.created_at) <= date('now', '-${k} day') AND date(u.created_at) > date('now', '-${k + 30} day')`,
    )!;
    return { cohort: r.cohort, kept: r.kept ?? 0, rate: r.cohort ? (r.kept ?? 0) / r.cohort : null };
  };
  const acquisition = db().all("SELECT json_extract(props,'$.source') AS source, COUNT(*) AS n FROM analytics_events WHERE name = 'page_view' AND day >= ? AND json_extract(props,'$.source') IS NOT NULL GROUP BY source ORDER BY n DESC LIMIT 8", d(29));
  return { dau, wau, mau, users: users.n, guests: users.guests ?? 0, sessions, popular, daily, multiplayer, errors, rejected, retention: { d1: retention(1), d7: retention(7) }, acquisition };
}
