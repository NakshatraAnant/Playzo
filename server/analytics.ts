/** First-party product analytics. No third-party trackers, no device fingerprinting. */
import { db, dayKey } from './db';

export const CLIENT_EVENTS = new Set([
  'page_view', 'game_view', 'game_tutorial_open', 'search', 'filter', 'share_click', 'install_prompt', 'onboarding_step', 'onboarding_complete', 'intro_skipped',
  'game_load', 'cta_play_now', 'cta_play_friends', 'cta_explore', 'invite_shared', 'app_session',
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

/* ---------------- product analytics dashboard (Admin → Analytics) ---------------- */
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
/** All metrics come from first-party events and game records; no personal data leaves the server. */
export function productAnalytics(days: number) {
  days = Math.max(7, Math.min(90, Math.floor(days) || 14));
  const d = (n: number) => dayKey(new Date(Date.now() - n * 86400_000));
  const from = d(days - 1), fromIso = from + 'T00:00:00Z';
  const dayList = Array.from({ length: days }, (_, i) => d(days - 1 - i));
  const series = (sql: string, ...args: unknown[]) => {
    const rows = new Map(db().all<{ day: string; n: number }>(sql, ...args).map((r) => [r.day, r.n]));
    return dayList.map((day) => rows.get(day) ?? 0);
  };
  const ev = (name: string) => series('SELECT day, COUNT(*) AS n FROM analytics_events WHERE name = ? AND day >= ? GROUP BY day', name, from);
  const active = series('SELECT day, COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL GROUP BY day', from);
  const home = series("SELECT day, COUNT(*) AS n FROM analytics_events WHERE name = 'page_view' AND json_extract(props,'$.path') = '/' AND day >= ? GROUP BY day", from);
  const starts = series("SELECT substr(started_at,1,10) AS day, COUNT(*) AS n FROM game_sessions WHERE started_at >= ? AND env = 'family' GROUP BY day", fromIso);
  const completions = series("SELECT substr(started_at,1,10) AS day, COUNT(*) AS n FROM game_sessions WHERE started_at >= ? AND env = 'family' AND status = 'completed' GROUP BY day", fromIso);
  const registrations = ev('auth_register');
  const rooms = ev('room_created');
  const support = ev('support_request');
  const count = (sql: string, ...args: unknown[]) => db().get<{ n: number }>(sql, ...args)!.n ?? 0;

  const guests = count("SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'auth_guest' AND day >= ?", from);
  const upgraded = count("SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'auth_register' AND json_extract(props,'$.upgraded') = 1 AND day >= ?", from);
  // First-game completion: of players whose first-ever session started in the window, how many completed it.
  const first = db().get<{ n: number; done: number }>(
    `SELECT COUNT(*) AS n, SUM(s.status = 'completed') AS done FROM game_sessions s
     WHERE s.env = 'family' AND s.started_at >= ? AND s.started_at = (SELECT MIN(started_at) FROM game_sessions x WHERE x.user_id = s.user_id)`, fromIso)!;
  const retention = (k: number) => {
    const r = db().get<{ cohort: number; kept: number }>(
      `SELECT COUNT(*) AS cohort, SUM(EXISTS(SELECT 1 FROM analytics_events e WHERE e.user_id = u.id AND e.day = date(u.created_at, '+${k} day'))) AS kept
       FROM users u WHERE date(u.created_at) <= date('now', '-${k} day') AND date(u.created_at) >= ?`, from)!;
    return { cohort: r.cohort, kept: r.kept ?? 0, rate: pct(r.kept ?? 0, r.cohort) };
  };
  const activeUsers = count('SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL', from);
  const userDays = count('SELECT COUNT(*) AS n FROM (SELECT DISTINCT user_id, day FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL)', from);
  const gameSessions = count("SELECT COUNT(*) AS n FROM game_sessions WHERE started_at >= ? AND env = 'family'", fromIso);
  const errorDays = count('SELECT COUNT(*) AS n FROM (SELECT DISTINCT user_id, substr(created_at,1,10) FROM client_errors WHERE created_at >= ? AND user_id IS NOT NULL)', fromIso);
  const loads = db().all<{ ms: number }>("SELECT CAST(json_extract(props,'$.ms') AS INTEGER) AS ms FROM analytics_events WHERE name = 'game_load' AND day >= ? AND json_extract(props,'$.ms') IS NOT NULL ORDER BY ms", from).map((r) => r.ms);
  const q = (p: number) => (loads.length ? loads[Math.min(loads.length - 1, Math.floor(p * loads.length))] : null);
  const roomsCreated = count("SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'room_created' AND day >= ?", from);
  const roomsPlayed = count("SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'room_started' AND day >= ?", from);
  const ch = db().get<{ n: number; done: number }>("SELECT COUNT(*) AS n, SUM(status = 'completed') AS done FROM challenges WHERE created_at >= ?", fromIso)!;
  const wau = count('SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events WHERE day >= ? AND user_id IS NOT NULL', d(6));
  const topGames = db().all("SELECT game_id, COUNT(*) AS starts, SUM(status = 'completed') AS completed FROM game_sessions WHERE started_at >= ? AND env = 'family' GROUP BY game_id ORDER BY starts DESC LIMIT 10", fromIso);
  return {
    days, from, dayList,
    series: { active, home, starts, completions, registrations, rooms, support },
    kpis: {
      dau: active[active.length - 1] ?? 0, wau,
      homeVisits: home.reduce((a, b) => a + b, 0),
      gameStarts: starts.reduce((a, b) => a + b, 0), gameCompletions: completions.reduce((a, b) => a + b, 0),
      completionRate: pct(completions.reduce((a, b) => a + b, 0), starts.reduce((a, b) => a + b, 0)),
      guestToRegistration: { guests, upgraded, rate: pct(upgraded, guests) },
      firstGameCompletion: { players: first.n ?? 0, completed: first.done ?? 0, rate: pct(first.done ?? 0, first.n ?? 0) },
      d1: retention(1), d7: retention(7),
      sessionsPerUser: activeUsers ? Math.round((userDays / activeUsers) * 10) / 10 : null,
      gamesPerSession: userDays ? Math.round((gameSessions / userDays) * 10) / 10 : null,
      roomsCreated, invitationAcceptance: { created: roomsCreated, played: roomsPlayed, rate: pct(roomsPlayed, roomsCreated) },
      challengeCompletion: { created: ch.n ?? 0, completed: ch.done ?? 0, rate: pct(ch.done ?? 0, ch.n ?? 0) },
      gameLoadMs: { samples: loads.length, p50: q(0.5), p75: q(0.75), p95: q(0.95) },
      crashFreeSessions: { userDays, withErrors: errorDays, rate: pct(userDays - errorDays, userDays) },
      supportRequests: support.reduce((a, b) => a + b, 0),
    },
    topGames,
    definitions: {
      sessionsPerUser: 'Active days per active player in the window (one app session per player per day).',
      gamesPerSession: 'Family game sessions started per player-day.',
      invitationAcceptance: 'Rooms whose match actually started, as a share of rooms created.',
      crashFreeSessions: 'Player-days with no client error reported.',
    },
  };
}
