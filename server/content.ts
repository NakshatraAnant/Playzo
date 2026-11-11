import type { FastifyInstance } from 'fastify';
import { db, weekKey } from './db';
import { HttpError, currentUser, requireUser, User } from './http';
import { CATALOGUE, BY_ID, FAMILY, GameMeta } from '../shared/catalogue';
import { canSee, legalGate, gameStatus, loungeAccess } from './access';
import { ENGINES } from './games/registry';
import { leaderboard, missionsFor, claimMission, dailyPuzzle, streak, ACHIEVEMENTS, levelFor, xpForLevel } from './progression';
import { balance, dailyChipsTopUp, history } from './economy';
import { SeededRng } from '../shared/rng';
import { CLIENT_EVENTS, track } from './analytics';
import { loungeMath } from './loungeMath';
import { loungeMinutesToday } from './sessions';

function card(g: GameMeta, u: User | null) {
  const e = ENGINES[g.id];
  const stats = u ? db().get<{ plays: number; best_score: number; wins: number }>('SELECT plays, best_score, wins FROM game_stats WHERE user_id = ? AND game_id = ?', u.id, g.id) : undefined;
  const fav = u ? !!db().get('SELECT 1 FROM favourites WHERE user_id = ? AND game_id = ?', u.id, g.id) : false;
  return {
    ...g, mode: e.mode, live: gameStatus(g.id) === 'live', status: gameStatus(g.id),
    multiplayer: g.formats.some((f) => ['versus', 'teams', 'group', 'race'].includes(f)),
    gate: g.env === 'lounge' ? legalGate(g.id).status : undefined,
    me: u ? { plays: stats?.plays ?? 0, best: stats?.best_score ?? 0, wins: stats?.wins ?? 0, favourite: fav } : null,
  };
}

const COLLECTIONS = [
  { id: 'quick', title: 'One-minute thrills', blurb: 'Fast sessions for a quick break', ids: ['number-rush', 'pattern-hunter', 'color-dash', 'reflex-arena', 'geo-sprint', 'rhythm-rush'] },
  { id: 'friends', title: 'Better with friends', blurb: 'Live rooms, races and team trivia', ids: ['word-duel', 'trivia-clash', 'party-chaos', 'chess-blitz', 'territory-wars', 'memory-duel'] },
  { id: 'brain', title: 'Brain trainers', blurb: 'Logic, memory and deduction', ids: ['logic-lock', 'grid-genius', 'code-breaker', 'sequence-master', 'mind-maze'] },
  { id: 'strategy', title: 'Outsmart the machine', blurb: 'Strategy games against the computer', ids: ['hex-conquest', 'connect-five', 'chess-blitz', 'tower-tactics', 'territory-wars'] },
  { id: 'learn', title: 'Learn something', blurb: 'Knowledge games with explanations', ids: ['fact-or-fiction', 'geo-sprint', 'trivia-clash', 'emoji-decode', 'word-ladder'] },
];

export async function contentRoutes(app: FastifyInstance) {
  app.get('/api/games', async (req) => {
    const u = currentUser(req);
    const env = (req.query as any).env;
    return { games: CATALOGUE.filter((g) => canSee(u, g) && gameStatus(g.id) !== 'hidden' && (!env || g.env === env)).map((g) => card(g, u)) };
  });

  app.get('/api/games/:id', async (req) => {
    const u = currentUser(req);
    const g = BY_ID[(req.params as any).id];
    if (!g || !canSee(u, g) || gameStatus(g.id) === 'hidden') throw new HttpError(404, 'Game not found', 'NOT_FOUND');
    const related = CATALOGUE.filter((x) => x.env === g.env && x.id !== g.id && x.category === g.category && canSee(u, x)).slice(0, 4).map((x) => card(x, u));
    track('game_view', u?.id ?? null, { game: g.id });
    return {
      game: card(g, u), related,
      leaderboard: g.env === 'family' ? leaderboard(g.id, 'week', u?.id ?? null, false, 10) : [],
      math: g.env === 'lounge' ? loungeMath(g.id) : null,
    };
  });

  app.post('/api/games/:id/favourite', async (req) => {
    const u = requireUser(req);
    const g = BY_ID[(req.params as any).id];
    if (!g || !canSee(u, g)) throw new HttpError(404, 'Game not found', 'NOT_FOUND');
    const on = !!(req.body as any)?.on;
    if (on) db().run('INSERT OR IGNORE INTO favourites (user_id, game_id) VALUES (?, ?)', u.id, g.id);
    else db().run('DELETE FROM favourites WHERE user_id = ? AND game_id = ?', u.id, g.id);
    return { favourite: on };
  });

  app.get('/api/leaderboard/:id', async (req) => {
    const u = currentUser(req);
    const g = BY_ID[(req.params as any).id];
    if (!g || g.env !== 'family') throw new HttpError(404, 'Leaderboard not found', 'NOT_FOUND');
    const q = req.query as any;
    const scope = ['week', 'daily', 'all'].includes(q.scope) ? q.scope : 'week';
    return { entries: leaderboard(g.id, scope, u?.id ?? null, q.friends === '1' && !!u, 50), week: weekKey() };
  });

  app.get('/api/home', async (req) => {
    const u = currentUser(req);
    const week = weekKey();
    const rng = new SeededRng(`featured:${week}`);
    const featured = rng.shuffle(FAMILY.slice()).slice(0, 5).map((g) => card(g, u));
    const spotlight = card(FAMILY[new SeededRng(`spotlight:${week}`).int(FAMILY.length)], u);
    const dp = dailyPuzzle();
    const dailyDone = u ? !!db().get("SELECT 1 FROM scores WHERE user_id = ? AND game_id = ? AND context = 'daily' AND period_day = ?", u.id, dp.gameId, dp.day) : false;
    let continuePlaying: unknown[] = [], recommended: unknown[] = [], recent: unknown[] = [], friendsActivity: unknown[] = [];
    if (u) {
      continuePlaying = db().all<{ id: string; game_id: string; started_at: string }>("SELECT id, game_id, started_at FROM game_sessions WHERE user_id = ? AND status = 'active' AND env = 'family' AND mode = 'server' ORDER BY started_at DESC LIMIT 4", u.id)
        .map((s) => ({ sessionId: s.id, game: card(BY_ID[s.game_id], u), startedAt: s.started_at }));
      const played = db().all<{ game_id: string; plays: number }>('SELECT game_id, plays FROM game_stats WHERE user_id = ? ORDER BY last_played_at DESC', u.id);
      recent = played.slice(0, 8).map((p) => card(BY_ID[p.game_id], u)).filter((g) => g.env === 'family');
      // Recommend unplayed games from the user's favourite categories, then other unplayed games.
      const catCount: Record<string, number> = {};
      for (const p of played) { const c = BY_ID[p.game_id]?.category; if (c) catCount[c] = (catCount[c] ?? 0) + p.plays; }
      const playedSet = new Set(played.map((p) => p.game_id));
      recommended = FAMILY.filter((g) => !playedSet.has(g.id)).sort((a, b) => (catCount[b.category] ?? 0) - (catCount[a.category] ?? 0)).slice(0, 6).map((g) => card(g, u));
      friendsActivity = db().all(
        `SELECT u.display_name AS name, u.avatar, s.game_id, s.score, s.ended_at FROM game_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'completed' AND s.env = 'family' AND u.privacy_profile != 'private' AND s.user_id IN (SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted')
         ORDER BY s.ended_at DESC LIMIT 6`, u.id, u.id, u.id,
      );
    } else recommended = FAMILY.slice(0, 6).map((g) => card(g, u));
    return {
      featured, spotlight: { game: spotlight, week, leaderboard: leaderboard(spotlight.id, 'week', u?.id ?? null, false, 5) },
      daily: { ...dp, game: card(BY_ID[dp.gameId], u), done: dailyDone, leaderboard: leaderboard(dp.gameId, 'daily', u?.id ?? null, false, 5) },
      continuePlaying, recommended, recent, friendsActivity,
      collections: COLLECTIONS.map((c) => ({ ...c, games: c.ids.map((id) => card(BY_ID[id], u)) })),
      launchLineup: FAMILY.map((g) => g.id),
      missions: u ? missionsFor(u.id) : null,
      streak: u ? streak(u.id) : 0,
      lounge: u ? { entitled: loungeAccess(u).entitled } : { entitled: false },
    };
  });

  app.get('/api/missions', async (req) => missionsFor(requireUser(req).id));
  app.post('/api/missions/:id/claim', async (req) => {
    const u = requireUser(req);
    const r = claimMission(u.id, (req.params as any).id);
    if (!r.ok) throw new HttpError(409, r.reason!, 'NOT_CLAIMABLE');
    return r;
  });

  app.get('/api/me/progress', async (req) => {
    const u = requireUser(req);
    const unlocked = db().all<{ achievement_id: string; unlocked_at: string }>('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?', u.id);
    const stats = db().all('SELECT game_id, plays, wins, best_score, mastery_xp, last_played_at FROM game_stats WHERE user_id = ? ORDER BY last_played_at DESC', u.id);
    const games = db().all("SELECT id, game_id, score, status, context, difficulty, started_at, ended_at FROM game_sessions WHERE user_id = ? AND env = 'family' ORDER BY started_at DESC LIMIT 30", u.id);
    const matches = db().all('SELECT m.id, m.game_id, m.format, mp.score, mp.outcome, m.created_at FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ? ORDER BY m.created_at DESC LIMIT 20', u.id);
    return {
      level: u.level, xp: u.xp, nextLevelXp: xpForLevel(levelFor(u.xp) + 1), levelXp: xpForLevel(levelFor(u.xp)), streak: streak(u.id),
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: unlocked.find((x) => x.achievement_id === a.id)?.unlocked_at ?? null })),
      stats, games, matches, ledger: history(u.id, 30).filter((l: any) => l.currency === 'ZO'),
    };
  });

  /* ---------------- Lounge namespace (all checks server-side) ---------------- */
  app.get('/api/lounge/status', async (req) => {
    const u = requireUser(req);
    const acc = loungeAccess(u);
    if (u.age_band !== 'adult') throw new HttpError(404, 'Not found', 'NOT_FOUND'); // invisible to minors
    if (acc.entitled) dailyChipsTopUp(u.id);
    return {
      access: acc, chips: acc.entitled ? balance(u.id, 'CHIPS') : 0, minutesToday: Math.round(loungeMinutesToday(u.id)), dailyLimitMin: u.lounge_daily_limit_min,
      gates: acc.entitled ? Object.fromEntries(CATALOGUE.filter((g) => g.env === 'lounge').map((g) => [g.id, legalGate(g.id)])) : null,
      ledger: acc.entitled ? history(u.id, 30).filter((l: any) => l.currency === 'CHIPS') : [],
    };
  });

  app.post('/api/events', async (req) => {
    const u = currentUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!CLIENT_EVENTS.has(String(b.name))) throw new HttpError(400, 'Unknown event', 'VALIDATION');
    track(String(b.name), u?.id ?? null, typeof b.props === 'object' && b.props ? (b.props as Record<string, unknown>) : undefined);
    return { ok: true };
  });

  app.post('/api/client-errors', async (req) => {
    const u = currentUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    db().run('INSERT INTO client_errors (user_id, message, where_) VALUES (?, ?, ?)', u?.id ?? null, String(b.message ?? '').slice(0, 500), String(b.where ?? '').slice(0, 200));
    return { ok: true };
  });
}
