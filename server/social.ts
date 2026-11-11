import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { HttpError, requireUser, currentUser, str, rateLimit, audit, User } from './http';
import { socialPolicy } from './access';
import { newId } from './secureRng';
import { unlock, streak } from './progression';
import { hooks } from './sessions';
import { BY_ID } from '../shared/catalogue';
import { DIFFICULTIES, Difficulty } from '../shared/engine';
import { ENGINES } from './games/registry';
import { track } from './analytics';

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
export const isBlocked = (a: string, b: string) => !!db().get('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)', a, b, b, a);
export const areFriends = (a: string, b: string) => { const [x, y] = pair(a, b); return !!db().get("SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'", x, y); };

function card(u: User, viewer: User | null) {
  return { id: u.id, name: u.display_name, avatar: u.avatar, frame: u.frame, level: u.level, friend: viewer ? areFriends(u.id, viewer.id) : false };
}

/** Public profile respecting privacy: public, friends-only, or private. Children never expose details beyond friends. */
export function profileFor(target: User, viewer: User | null) {
  const self = viewer?.id === target.id;
  const friend = viewer ? areFriends(target.id, viewer.id) : false;
  const visible = self || target.privacy_profile === 'public' || (target.privacy_profile === 'friends' && friend);
  const base = card(target, viewer);
  if (!visible || (target.age_band === 'child' && !self && !friend)) return { ...base, private: true };
  const stats = db().all('SELECT game_id, plays, wins, best_score FROM game_stats WHERE user_id = ? ORDER BY plays DESC LIMIT 12', target.id);
  const achievements = db().all('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC', target.id);
  const totals = db().get('SELECT COALESCE(SUM(plays),0) AS plays, COALESCE(SUM(wins),0) AS wins, COUNT(*) AS games FROM game_stats WHERE user_id = ?', target.id);
  return { ...base, private: false, xp: target.xp, stats, achievements, totals, streak: streak(target.id), joined: target.created_at };
}

export async function socialRoutes(app: FastifyInstance) {
  app.get('/api/users/search', async (req) => {
    const u = requireUser(req);
    if (!socialPolicy(u).canSearchUsers) throw new HttpError(403, 'Search is not available on this account', 'FORBIDDEN');
    rateLimit(req, 'search-users', 30);
    const q = str((req.query as any).q, 'Search', 2, 30);
    const rows = db().all<User>(
      `SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' AND status = 'active' AND is_guest = 0 AND age_band IN ('teen','adult') AND id != ? LIMIT 10`,
      q.replace(/[%_\\]/g, (m) => '\\' + m) + '%', u.id,
    );
    // Teens and adults are not mixed in discovery.
    return { users: rows.filter((r) => (u.age_band === 'adult') === (r.age_band === 'adult') && !isBlocked(u.id, r.id)).map((r) => card(r, u)) };
  });

  app.get('/api/users/:id', async (req) => {
    const viewer = currentUser(req);
    const t = db().get<User>("SELECT * FROM users WHERE id = ? AND status = 'active'", (req.params as any).id);
    if (!t || (viewer && isBlocked(viewer.id, t.id))) throw new HttpError(404, 'Player not found', 'NOT_FOUND');
    return { profile: profileFor(t, viewer) };
  });

  app.get('/api/friends', async (req) => {
    const u = requireUser(req);
    const rows = db().all<{ other: string; status: string; requested_by: string }>(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS other, status, requested_by FROM friendships WHERE user_a = ? OR user_b = ?`, u.id, u.id, u.id,
    );
    const users = (ids: string[]) => ids.map((id) => db().get<User>('SELECT * FROM users WHERE id = ?', id)).filter(Boolean).map((x) => card(x!, u));
    const activity = db().all(
      `SELECT s.user_id, u.display_name, u.avatar, s.game_id, s.score, s.ended_at FROM game_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.status = 'completed' AND s.env = 'family' AND s.user_id IN (SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted')
       AND u.privacy_profile != 'private' ORDER BY s.ended_at DESC LIMIT 15`, u.id, u.id, u.id,
    );
    return {
      friends: users(rows.filter((r) => r.status === 'accepted').map((r) => r.other)),
      incoming: users(rows.filter((r) => r.status === 'pending' && r.requested_by !== u.id).map((r) => r.other)),
      outgoing: users(rows.filter((r) => r.status === 'pending' && r.requested_by === u.id).map((r) => r.other)),
      blocked: db().all<{ blocked: string }>('SELECT blocked FROM blocks WHERE blocker = ?', u.id).map((b) => { const x = db().get<User>('SELECT * FROM users WHERE id = ?', b.blocked); return x ? card(x, u) : null; }).filter(Boolean),
      activity, policy: socialPolicy(u),
    };
  });

  app.post('/api/friends/request', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'friend-req', 20);
    if (!socialPolicy(u).canSendFriendRequests) throw new HttpError(403, u.is_guest ? 'Create an account to add friends' : 'A parent or guardian must approve friends first', 'FORBIDDEN');
    const t = db().get<User>("SELECT * FROM users WHERE (id = ? OR username = ?) AND status = 'active' AND is_guest = 0", (req.body as any)?.userId ?? '', (req.body as any)?.username ?? '');
    if (!t || t.id === u.id || isBlocked(u.id, t.id)) throw new HttpError(404, 'Player not found', 'NOT_FOUND');
    if (!t.allow_friend_requests) throw new HttpError(403, 'This player is not accepting friend requests', 'FORBIDDEN');
    const adultMix = (u.age_band === 'adult') !== (t.age_band === 'adult');
    if (adultMix) throw new HttpError(403, 'Friend requests between adult and under-18 accounts are not allowed', 'FORBIDDEN');
    if (t.age_band === 'child' && !t.parental_consent_at) throw new HttpError(403, 'This player cannot accept friends yet', 'FORBIDDEN');
    const [a, b] = pair(u.id, t.id);
    const ex = db().get<{ status: string; requested_by: string }>('SELECT status, requested_by FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    if (ex?.status === 'accepted') return { status: 'accepted' };
    if (ex && ex.requested_by !== u.id) {
      db().run("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?", a, b);
      unlock(u.id, 'friend_1'); unlock(t.id, 'friend_1');
      return { status: 'accepted' };
    }
    db().run("INSERT OR IGNORE INTO friendships (user_a, user_b, status, requested_by) VALUES (?, ?, 'pending', ?)", a, b, u.id);
    track('friend_request', u.id);
    return { status: 'pending' };
  });

  app.post('/api/friends/respond', async (req) => {
    const u = requireUser(req);
    const other = str((req.body as any)?.userId, 'User', 3, 64);
    const accept = !!(req.body as any)?.accept;
    const [a, b] = pair(u.id, other);
    const ex = db().get<{ requested_by: string; status: string }>('SELECT requested_by, status FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    if (!ex || ex.status !== 'pending' || ex.requested_by === u.id) throw new HttpError(404, 'No pending request', 'NOT_FOUND');
    if (accept) {
      db().run("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?", a, b);
      unlock(u.id, 'friend_1'); unlock(other, 'friend_1');
    } else db().run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    return { ok: true };
  });

  app.post('/api/friends/remove', async (req) => {
    const u = requireUser(req);
    const [a, b] = pair(u.id, str((req.body as any)?.userId, 'User', 3, 64));
    db().run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    return { ok: true };
  });

  app.post('/api/block', async (req) => {
    const u = requireUser(req);
    const other = str((req.body as any)?.userId, 'User', 3, 64);
    if (other === u.id) throw new HttpError(400, 'You cannot block yourself', 'VALIDATION');
    const [a, b] = pair(u.id, other);
    db().run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    db().run('INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?, ?)', u.id, other);
    audit(u.id, 'social.block', other);
    return { ok: true };
  });
  app.post('/api/unblock', async (req) => {
    const u = requireUser(req);
    db().run('DELETE FROM blocks WHERE blocker = ? AND blocked = ?', u.id, str((req.body as any)?.userId, 'User', 3, 64));
    return { ok: true };
  });

  app.post('/api/report', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'report', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const target = str(b.userId, 'User', 3, 64);
    const reason = str(b.reason, 'Reason', 3, 40);
    if (!['cheating', 'offensive_name', 'harassment', 'impersonation', 'underage', 'other'].includes(reason)) throw new HttpError(400, 'Choose a reason', 'VALIDATION');
    if (!db().get('SELECT 1 FROM users WHERE id = ?', target)) throw new HttpError(404, 'Player not found', 'NOT_FOUND');
    const id = newId('rp_');
    db().run('INSERT INTO reports (id, reporter, target_user, reason, details) VALUES (?, ?, ?, ?, ?)', id, u.id, target, reason, typeof b.details === 'string' ? b.details.slice(0, 500) : null);
    audit(u.id, 'social.report', target, { reason });
    return { ok: true, id };
  });

  /* ---------------- async challenges ---------------- */
  app.post('/api/challenges', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'challenge', 20);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const meta = BY_ID[String(b.gameId)];
    if (!meta || meta.env !== 'family' || !meta.formats.includes('async')) throw new HttpError(400, 'That game does not support challenges', 'VALIDATION');
    const difficulty = (DIFFICULTIES.includes(b.difficulty as Difficulty) ? b.difficulty : 'normal') as Difficulty;
    let to: string | null = null;
    if (b.toUserId) {
      to = String(b.toUserId);
      if (!areFriends(u.id, to)) throw new HttpError(403, 'You can only challenge friends directly', 'FORBIDDEN');
    } else if (u.age_band === 'child' || u.is_guest) throw new HttpError(403, 'Open challenge links are not available on this account', 'FORBIDDEN');
    const id = newId('ch_');
    db().run('INSERT INTO challenges (id, from_user, to_user, game_id, difficulty, seed, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, u.id, to, meta.id, difficulty, `challenge:${id}`, new Date(Date.now() + 7 * 86400_000).toISOString());
    track('challenge_created', u.id, { game: meta.id, direct: !!to });
    return { id, link: `/challenge/${id}` };
  });

  app.get('/api/challenges', async (req) => {
    const u = requireUser(req);
    const rows = db().all(
      `SELECT c.*, fu.display_name AS from_name, tu.display_name AS to_name FROM challenges c JOIN users fu ON fu.id = c.from_user LEFT JOIN users tu ON tu.id = c.to_user
       WHERE (c.from_user = ? OR c.to_user = ?) ORDER BY c.created_at DESC LIMIT 30`, u.id, u.id,
    );
    return { challenges: rows.map((r: any) => ({ ...r, seed: undefined })) };
  });

  app.get('/api/challenges/:id', async (req) => {
    const viewer = currentUser(req);
    const c = db().get<any>('SELECT c.*, fu.display_name AS from_name FROM challenges c JOIN users fu ON fu.id = c.from_user WHERE c.id = ?', (req.params as any).id);
    if (!c) throw new HttpError(404, 'Challenge not found', 'NOT_FOUND');
    if (c.to_user && viewer && viewer.id !== c.to_user && viewer.id !== c.from_user) throw new HttpError(404, 'Challenge not found', 'NOT_FOUND');
    return { challenge: { id: c.id, gameId: c.game_id, difficulty: c.difficulty, fromName: c.from_name, fromScore: c.from_score, toScore: c.to_score, status: c.status, expiresAt: c.expires_at, mine: viewer?.id === c.from_user } };
  });

  hooks.challengeSeed = (id, userId, gameId) => {
    const c = db().get<any>('SELECT * FROM challenges WHERE id = ?', id);
    if (!c || c.game_id !== gameId || c.status !== 'open' || c.expires_at < nowIso()) return null;
    if (c.from_user === userId) return c.from_score === null ? { seed: c.seed, difficulty: c.difficulty } : null;
    if (c.to_user && c.to_user !== userId) return null;
    if (c.to_score !== null) return null;
    if (isBlocked(c.from_user, userId)) return null;
    return { seed: c.seed, difficulty: c.difficulty };
  };
  hooks.challengeFinished = (id, userId, score) => {
    const c = db().get<any>('SELECT * FROM challenges WHERE id = ?', id);
    if (!c) return;
    if (c.from_user === userId && c.from_score === null) db().run('UPDATE challenges SET from_score = ? WHERE id = ?', score, id);
    else if (c.from_user !== userId && c.to_score === null) db().run('UPDATE challenges SET to_score = ?, to_user = COALESCE(to_user, ?) WHERE id = ?', score, userId, id);
    const after = db().get<any>('SELECT * FROM challenges WHERE id = ?', id);
    if (after.from_score !== null && after.to_score !== null) db().run("UPDATE challenges SET status = 'completed' WHERE id = ?", id);
  };
  void ENGINES;
}
