/**
 * Progression: XP, levels, achievements, missions, stats and leaderboards (family games only).
 * Lounge simulations never award XP, achievements or ZO (no reward loop around chance play).
 */
import { db, dayKey, weekKey, nowIso } from './db';
import { disabledSet, isEnabled } from './contentFlags';
import { post, zoEarnedToday, ZO_DAILY_GAME_CAP } from './economy';
import { BY_ID, FAMILY } from '../shared/catalogue';
import { track } from './analytics';
import { SeededRng } from '../shared/rng';

export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 60)) + 1;
export const xpForLevel = (lvl: number) => (lvl - 1) * (lvl - 1) * 60;

export interface AchievementDef { id: string; title: string; desc: string; icon: string; zo: number }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_game', title: 'First Spark', desc: 'Finish your first game', icon: 'spark', zo: 20 },
  { id: 'ten_games', title: 'Warmed Up', desc: 'Finish 10 games', icon: 'flame', zo: 40 },
  { id: 'fifty_games', title: 'Regular', desc: 'Finish 50 games', icon: 'crown', zo: 100 },
  { id: 'explorer_5', title: 'Explorer', desc: 'Play 5 different games', icon: 'compass', zo: 40 },
  { id: 'explorer_15', title: 'Globetrotter', desc: 'Play 15 different games', icon: 'globe', zo: 120 },
  { id: 'all_family', title: 'Completionist', desc: 'Play all 25 family games', icon: 'gem', zo: 300 },
  { id: 'beat_ai', title: 'Machine Tamer', desc: 'Beat the computer in a strategy game', icon: 'chip', zo: 40 },
  { id: 'beat_ai_hard', title: 'Grandmaster Mind', desc: 'Beat the computer on Hard', icon: 'trophy', zo: 120 },
  { id: 'mp_win', title: 'Rival Slayer', desc: 'Win a live multiplayer match', icon: 'swords', zo: 60 },
  { id: 'daily_1', title: 'Daily Habit', desc: 'Complete a Daily Puzzle', icon: 'calendar', zo: 30 },
  { id: 'streak_3', title: 'Three-Day Streak', desc: 'Play on 3 days in a row', icon: 'bolt', zo: 60 },
  { id: 'streak_7', title: 'Week Warrior', desc: 'Play on 7 days in a row', icon: 'bolt', zo: 150 },
  { id: 'friend_1', title: 'Squad Up', desc: 'Make your first friend', icon: 'heart', zo: 30 },
  { id: 'challenge_1', title: 'Gauntlet Thrown', desc: 'Complete a friend challenge', icon: 'flag', zo: 40 },
  { id: 'level_5', title: 'Rising Star', desc: 'Reach level 5', icon: 'star', zo: 50 },
  { id: 'level_10', title: 'PLAYZO Pro', desc: 'Reach level 10', icon: 'star', zo: 150 },
  { id: 'maze_master', title: 'Maze Master', desc: 'Score 1,800+ in Mind Maze', icon: 'maze', zo: 50 },
  { id: 'lightning', title: 'Lightning Brain', desc: 'Score 400+ in Number Rush', icon: 'bolt', zo: 50 },
  { id: 'perfect_rhythm', title: 'On The Beat', desc: 'Score 30,000+ in Rhythm Rush', icon: 'note', zo: 60 },
  { id: 'wordsmith', title: 'Wordsmith', desc: 'Score 60+ in Word Duel', icon: 'quill', zo: 60 },
  { id: 'defender', title: 'Crystal Defender', desc: 'Clear all 10 waves in Tower Tactics', icon: 'shield', zo: 80 },
];
const SCORE_ACH: Record<string, { id: string; min: number }> = {
  'mind-maze': { id: 'maze_master', min: 1800 }, 'number-rush': { id: 'lightning', min: 400 }, 'rhythm-rush': { id: 'perfect_rhythm', min: 30000 }, 'word-duel': { id: 'wordsmith', min: 60 },
};

export function unlock(userId: string, id: string): boolean {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return false;
  const r = db().run('INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)', userId, id);
  if (!r.changes) return false;
  post(userId, 'ZO', def.zo, 'reward', `achievement:${id}`, `ach:${userId}:${id}`);
  track('achievement_unlocked', userId, { id });
  return true;
}

/* ---------------- missions ---------------- */
export interface MissionDef { id: string; period: 'daily' | 'weekly'; title: string; target: number; zo: number; match: (e: MissionEvent) => number }
export interface MissionEvent { gameId: string; score: number; won: boolean; vsAi: boolean; multiplayer: boolean; daily: boolean; newGame: boolean; challenge: boolean; category: string }
export const DAILY_POOL: MissionDef[] = [
  { id: 'd_play3', period: 'daily', title: 'Play 3 games', target: 3, zo: 30, match: () => 1 },
  { id: 'd_brain', period: 'daily', title: 'Play a Brain & Logic game', target: 1, zo: 20, match: (e) => +(e.category === 'Brain & Logic') },
  { id: 'd_word', period: 'daily', title: 'Play a Word & Knowledge game', target: 1, zo: 20, match: (e) => +(e.category === 'Word & Knowledge') },
  { id: 'd_score', period: 'daily', title: 'Score 500+ in any game', target: 1, zo: 25, match: (e) => +(e.score >= 500) },
  { id: 'd_daily', period: 'daily', title: 'Complete the Daily Puzzle', target: 1, zo: 30, match: (e) => +e.daily },
  { id: 'd_ai', period: 'daily', title: 'Beat the computer once', target: 1, zo: 30, match: (e) => +(e.vsAi && e.won) },
  { id: 'd_new', period: 'daily', title: 'Try a game you have never played', target: 1, zo: 25, match: (e) => +e.newGame },
  { id: 'd_react', period: 'daily', title: 'Play 2 Reaction & Party games', target: 2, zo: 25, match: (e) => +(e.category === 'Reaction & Party') },
];
const WEEKLY: MissionDef[] = [
  { id: 'w_play15', period: 'weekly', title: 'Finish 15 games this week', target: 15, zo: 120, match: () => 1 },
  { id: 'w_mp3', period: 'weekly', title: 'Play 3 live multiplayer matches', target: 3, zo: 120, match: (e) => +e.multiplayer },
  { id: 'w_strategy', period: 'weekly', title: 'Win 3 Strategy games', target: 3, zo: 100, match: (e) => +(e.category === 'Strategy' && e.won) },
  { id: 'w_challenge', period: 'weekly', title: 'Complete a friend challenge', target: 1, zo: 80, match: (e) => +e.challenge },
];

/** Today's 3 daily missions (deterministic per day, same for everyone). */
export function dailyMissions(day = dayKey()): MissionDef[] {
  const rng = new SeededRng(`missions:${day}`);
  const pool = DAILY_POOL.filter((m) => m.id !== 'd_play3');
  return [DAILY_POOL[0], ...rng.shuffle(pool.slice()).slice(0, 2)];
}
export const weeklyMissions = () => WEEKLY;

export function missionsFor(userId: string) {
  const d = dayKey(), w = weekKey();
  const off = disabledSet('mission');
  const rows = db().all<{ mission_id: string; period: string; progress: number; claimed_at: string | null }>('SELECT mission_id, period, progress, claimed_at FROM mission_progress WHERE user_id = ? AND period IN (?, ?)', userId, d, w);
  const get = (id: string, p: string) => rows.find((r) => r.mission_id === id && r.period === p);
  const shape = (m: MissionDef, p: string) => {
    const r = get(m.id, p);
    return { id: m.id, period: m.period, title: m.title, target: m.target, zo: m.zo, progress: Math.min(m.target, r?.progress ?? 0), claimed: !!r?.claimed_at };
  };
  return { daily: dailyMissions().filter((m) => !off.has(m.id)).map((m) => shape(m, d)), weekly: weeklyMissions().filter((m) => !off.has(m.id)).map((m) => shape(m, w)), resetsDaily: d, week: w };
}

function bumpMissions(userId: string, e: MissionEvent) {
  const d = dayKey(), w = weekKey();
  const off = disabledSet('mission');
  for (const [defs, p] of [[dailyMissions(), d], [weeklyMissions(), w]] as const) {
    for (const m of defs) {
      if (off.has(m.id)) continue;
      const inc = m.match(e);
      if (!inc) continue;
      db().run(
        `INSERT INTO mission_progress (user_id, mission_id, period, progress) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, mission_id, period) DO UPDATE SET progress = MIN(?, progress + ?)`,
        userId, m.id, p, Math.min(m.target, inc), m.target, inc,
      );
    }
  }
}

export function claimMission(userId: string, missionId: string) {
  const def = [...dailyMissions(), ...weeklyMissions()].find((m) => m.id === missionId);
  if (!def) throw new Error('Unknown mission');
  if (!isEnabled('mission', missionId)) return { ok: false, reason: 'This mission is not available right now' };
  const period = def.period === 'daily' ? dayKey() : weekKey();
  return db().tx(() => {
    const row = db().get<{ progress: number; claimed_at: string | null }>('SELECT progress, claimed_at FROM mission_progress WHERE user_id = ? AND mission_id = ? AND period = ?', userId, missionId, period);
    if (!row || row.progress < def.target) return { ok: false, reason: 'Mission not complete yet' };
    if (row.claimed_at) return { ok: false, reason: 'Already claimed' };
    db().run('UPDATE mission_progress SET claimed_at = ? WHERE user_id = ? AND mission_id = ? AND period = ?', nowIso(), userId, missionId, period);
    const r = post(userId, 'ZO', def.zo, 'reward', `mission:${missionId}`, `mission:${userId}:${missionId}:${period}`);
    return { ok: true, zo: def.zo, balance: r.balance };
  });
}

/* ---------------- streaks ---------------- */
export function streak(userId: string): number {
  const days = db().all<{ d: string }>("SELECT DISTINCT substr(started_at,1,10) AS d FROM game_sessions WHERE user_id = ? AND status = 'completed' ORDER BY d DESC LIMIT 60", userId).map((r) => r.d);
  let n = 0;
  let cur = new Date();
  if (days[0] !== dayKey(cur)) cur = new Date(Date.now() - 86400_000);
  for (const d of days) {
    if (d === dayKey(cur)) { n++; cur = new Date(cur.getTime() - 86400_000); } else if (d < dayKey(cur)) break;
  }
  return n;
}

/* ---------------- daily puzzle ---------------- */
export const DAILY_ROTATION = ['logic-lock', 'mind-maze', 'grid-genius', 'word-ladder', 'word-duel'];
export function dailyPuzzle(day = dayKey()) {
  const idx = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400_000) % DAILY_ROTATION.length;
  return { day, gameId: DAILY_ROTATION[idx], seed: `daily:${day}`, difficulty: 'normal' as const };
}

/* ---------------- completion hook ---------------- */
export interface CompletionInput {
  userId: string; gameId: string; sessionId: string | null; score: number; won: boolean; vsAi: boolean; difficulty: string;
  context: 'solo' | 'daily' | 'challenge' | 'race' | 'room'; multiplayer: boolean;
  /** Paused solo runs still earn XP and missions but never enter leaderboards or personal bests. */
  rankable?: boolean;
}
export const seasonKey = (d = new Date()) => d.toISOString().slice(0, 7);
export interface CompletionOutput { xp: number; zo: number; level: number; leveledUp: boolean; personalBest: boolean; achievements: string[] }

export function recordCompletion(c: CompletionInput): CompletionOutput {
  const meta = BY_ID[c.gameId];
  const out: CompletionOutput = { xp: 0, zo: 0, level: 1, leveledUp: false, personalBest: false, achievements: [] };
  if (!meta || meta.env !== 'family') return out;
  return db().tx(() => {
    const prev = db().get<{ plays: number; best_score: number }>('SELECT plays, best_score FROM game_stats WHERE user_id = ? AND game_id = ?', c.userId, c.gameId);
    const newGame = !prev;
    const rankable = c.rankable !== false;
    out.personalBest = rankable && (!prev || c.score > prev.best_score);
    db().run(
      `INSERT INTO game_stats (user_id, game_id, plays, wins, best_score, total_score, mastery_xp, last_played_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, game_id) DO UPDATE SET plays = plays + 1, wins = wins + excluded.wins, best_score = MAX(best_score, excluded.best_score),
         total_score = total_score + excluded.total_score, mastery_xp = mastery_xp + excluded.mastery_xp, last_played_at = excluded.last_played_at`,
      c.userId, c.gameId, c.won ? 1 : 0, rankable ? c.score : 0, c.score, 10 + (c.won ? 10 : 0), nowIso(),
    );
    if (rankable) db().run('INSERT INTO scores (user_id, game_id, score, period_week, period_day, context, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)', c.userId, c.gameId, c.score, weekKey(), dayKey(), c.context, c.sessionId);
    // XP: participation + performance (bounded) + win; difficulty multiplier.
    const diffMult = c.difficulty === 'hard' ? 1.5 : c.difficulty === 'easy' ? 0.8 : 1;
    out.xp = Math.round((15 + Math.min(35, Math.floor(c.score / 60)) + (c.won ? 20 : 0) + (out.personalBest ? 10 : 0)) * diffMult);
    const u = db().get<{ xp: number; level: number }>('SELECT xp, level FROM users WHERE id = ?', c.userId)!;
    const xp = u.xp + out.xp;
    out.level = levelFor(xp);
    out.leveledUp = out.level > u.level;
    db().run('UPDATE users SET xp = ?, level = ? WHERE id = ?', xp, out.level, c.userId);
    // Monthly season standings are driven by XP earned (participation-weighted, not spend-driven).
    db().run(
      'INSERT INTO season_points (user_id, season, points, games) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, season) DO UPDATE SET points = points + excluded.points, games = games + 1',
      c.userId, seasonKey(), out.xp,
    );
    // ZO: modest, capped per day.
    const want = 5 + (c.won ? 10 : 0) + (out.personalBest ? 5 : 0) + (out.leveledUp ? 25 : 0);
    const room = Math.max(0, ZO_DAILY_GAME_CAP - zoEarnedToday(c.userId));
    out.zo = Math.min(want, room);
    if (out.zo > 0) post(c.userId, 'ZO', out.zo, 'reward', `game:${c.gameId}`, `game-reward:${c.sessionId ?? c.userId + ':' + Date.now()}`, c.sessionId);
    // Missions
    bumpMissions(c.userId, { gameId: c.gameId, score: c.score, won: c.won, vsAi: c.vsAi, multiplayer: c.multiplayer, daily: c.context === 'daily', newGame, challenge: c.context === 'challenge', category: meta.category });
    // Achievements
    const plays = db().get<{ n: number; g: number }>('SELECT SUM(plays) AS n, COUNT(*) AS g FROM game_stats WHERE user_id = ?', c.userId)!;
    const tryU = (id: string, cond: boolean) => { if (cond && unlock(c.userId, id)) out.achievements.push(ACHIEVEMENTS.find((a) => a.id === id)?.title ?? id); };
    tryU('first_game', plays.n >= 1);
    tryU('ten_games', plays.n >= 10);
    tryU('fifty_games', plays.n >= 50);
    tryU('explorer_5', plays.g >= 5);
    tryU('explorer_15', plays.g >= 15);
    tryU('all_family', plays.g >= FAMILY.length);
    tryU('beat_ai', c.vsAi && c.won);
    tryU('beat_ai_hard', c.vsAi && c.won && c.difficulty === 'hard');
    tryU('mp_win', c.multiplayer && c.won);
    tryU('daily_1', c.context === 'daily');
    tryU('challenge_1', c.context === 'challenge');
    tryU('level_5', out.level >= 5);
    tryU('level_10', out.level >= 10);
    const sa = SCORE_ACH[c.gameId];
    if (sa) tryU(sa.id, c.score >= sa.min);
    if (c.gameId === 'tower-tactics') tryU('defender', c.won);
    const st = streak(c.userId);
    tryU('streak_3', st >= 3);
    tryU('streak_7', st >= 7);
    return out;
  });
}

/* ---------------- leaderboards ---------------- */
export function leaderboard(gameId: string, scope: 'week' | 'daily' | 'all', viewerId: string | null, friendsOnly = false, limit = 20) {
  const params: unknown[] = [gameId];
  let where = 's.game_id = ?';
  if (scope === 'week') { where += ' AND s.period_week = ?'; params.push(weekKey()); }
  if (scope === 'daily') { where += " AND s.period_day = ? AND s.context = 'daily'"; params.push(dayKey()); }
  if (friendsOnly && viewerId) {
    where += ` AND (s.user_id = ? OR s.user_id IN (SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'))`;
    params.push(viewerId, viewerId, viewerId, viewerId);
  }
  const rows = db().all<{ user_id: string; best: number; display_name: string; avatar: string; level: number; privacy_profile: string }>(
    `SELECT s.user_id, MAX(s.score) AS best, u.display_name, u.avatar, u.level, u.privacy_profile
     FROM scores s JOIN users u ON u.id = s.user_id WHERE ${where} AND u.status = 'active' GROUP BY s.user_id ORDER BY best DESC LIMIT ?`,
    ...params, limit,
  );
  return rows.map((r, i) => ({
    rank: i + 1, score: r.best, me: r.user_id === viewerId, level: r.level, avatar: r.avatar,
    // Private profiles appear anonymised on public boards.
    name: r.user_id === viewerId || r.privacy_profile !== 'private' ? r.display_name : 'Private player',
    userId: r.privacy_profile === 'public' || r.user_id === viewerId ? r.user_id : null,
  }));
}
