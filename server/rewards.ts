/**
 * Retention features kept deliberately non-manipulative:
 *  - Daily check-in reward: small ZO amount that grows with consecutive days (capped at day 7).
 *    Missing a day simply restarts the count: no "you'll lose everything" framing, no paid streak repair.
 *  - Monthly seasons: standings by XP earned in the calendar month (play-driven, never spend-driven).
 *  - Referrals: attribution only (count shown on profile). No currency is ever paid for referrals.
 * All ZO goes through the idempotent ledger; ZO cannot be bought, transferred or redeemed.
 */
import type { FastifyInstance } from 'fastify';
import { db, dayKey } from './db';
import { requireUser, currentUser, HttpError } from './http';
import { post, balance } from './economy';
import { seasonKey } from './progression';
import { track } from './analytics';

export const DAILY_REWARD = (streak: number) => 10 + 5 * Math.min(6, Math.max(0, streak - 1)); // 10..40 ZO

function rewardState(userId: string) {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const last = db().get<{ day: string; streak: number }>('SELECT day, streak FROM daily_rewards WHERE user_id = ? ORDER BY day DESC LIMIT 1', userId);
  const claimedToday = last?.day === today;
  const streak = claimedToday ? last!.streak : last?.day === yesterday ? last.streak + 1 : 1;
  return { today, claimedToday, streak, next: DAILY_REWARD(streak) };
}

export async function rewardRoutes(app: FastifyInstance) {
  app.get('/api/rewards/daily', async (req) => {
    const u = requireUser(req);
    const s = rewardState(u.id);
    return { claimedToday: s.claimedToday, streak: s.streak, amount: s.next, schedule: [1, 2, 3, 4, 5, 6, 7].map(DAILY_REWARD) };
  });
  app.post('/api/rewards/daily', async (req) => {
    const u = requireUser(req);
    const s = rewardState(u.id);
    if (s.claimedToday) throw new HttpError(409, 'Already claimed today. Come back tomorrow!', 'ALREADY_CLAIMED');
    const out = db().tx(() => {
      db().run('INSERT INTO daily_rewards (user_id, day, streak, zo) VALUES (?, ?, ?, ?)', u.id, s.today, s.streak, s.next);
      return post(u.id, 'ZO', s.next, 'reward', 'daily_reward', `daily-reward:${u.id}:${s.today}`);
    });
    track('daily_reward', u.id, { streak: s.streak });
    return { ok: true, amount: s.next, streak: s.streak, balance: out.balance };
  });

  app.get('/api/seasons/current', async (req) => {
    const u = currentUser(req);
    const season = seasonKey();
    const top = db().all(
      `SELECT sp.user_id, sp.points, sp.games, u.display_name, u.avatar, u.level FROM season_points sp JOIN users u ON u.id = sp.user_id
       WHERE sp.season = ? AND u.status = 'active' AND u.privacy_profile != 'private' ORDER BY sp.points DESC, sp.games ASC LIMIT 50`, season,
    );
    let me: { points: number; rank: number } | null = null;
    if (u) {
      const mine = db().get<{ points: number }>('SELECT points FROM season_points WHERE user_id = ? AND season = ?', u.id, season);
      if (mine) me = { points: mine.points, rank: 1 + db().get<{ n: number }>('SELECT COUNT(*) AS n FROM season_points WHERE season = ? AND points > ?', season, mine.points)!.n };
    }
    const now = new Date();
    const ends = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    return { season, endsAt: ends, top: top.map((r: any, i: number) => ({ rank: i + 1, userId: r.user_id, name: r.display_name, avatar: r.avatar, level: r.level, points: r.points, games: r.games, me: r.user_id === u?.id })), me };
  });

  app.get('/api/me/referrals', async (req) => {
    const u = requireUser(req);
    return { code: u.is_guest ? null : u.username, count: db().get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE referred_by = ?', u.id)!.n, zo: balance(u.id, 'ZO') };
  });
}
