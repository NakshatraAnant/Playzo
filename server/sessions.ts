/**
 * Game session service - the server-authoritative core.
 *
 *  server mode : state is kept here; each action is validated by the engine; views are redacted.
 *  replay mode : the client receives a seed, plays locally, then submits its action log, which is
 *                re-simulated here with the same deterministic engine to produce the official score.
 *  Lounge      : HMAC-SHA256 RNG with a committed server seed (revealed at session end);
 *                stakes/payouts settle atomically through the idempotent ledger.
 */
import type { FastifyInstance } from 'fastify';
import { ENGINES } from './games/registry';
import { BY_ID } from '../shared/catalogue';
import { Ctx, Difficulty, DIFFICULTIES, Engine, GameError } from '../shared/engine';
import { SeededRng, Rng } from '../shared/rng';
import { HmacRng, newServerSeed, commitOf, newId } from './secureRng';
import { db, nowIso, dayKey } from './db';
import { HttpError, requireUser, rateLimit, User } from './http';
import { canPlay, loungeAccess } from './access';
import { balance, post, dailyChipsTopUp } from './economy';
import { recordCompletion, dailyPuzzle, CompletionOutput } from './progression';
import { track } from './analytics';

export type Context = 'solo' | 'daily' | 'challenge' | 'race';
interface SessionRow {
  id: string; user_id: string; game_id: string; env: string; mode: string; status: string; difficulty: Difficulty; seed: string; seed_commit: string;
  rng_cursor: number; rules_version: string; state: string | null; context: Context; context_ref: string | null; score: number | null; result: string | null;
  started_ms: number; started_at: string; ended_at: string | null;
}

export const SOLO = 'p1';
/** Hooks used by other modules (rooms/challenges) - set at startup to avoid import cycles. */
export const hooks: {
  raceSeed?: (code: string, userId: string, gameId: string) => { seed: string; difficulty: Difficulty } | null;
  raceFinished?: (code: string, userId: string, score: number, sessionId: string) => void;
  challengeSeed?: (id: string, userId: string, gameId: string) => { seed: string; difficulty: Difficulty } | null;
  challengeFinished?: (id: string, userId: string, score: number) => void;
} = {};

/* ---------------- per-session serialisation ---------------- */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => undefined));
  try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
}

function rngFor(row: SessionRow): Rng {
  return row.env === 'lounge' ? new HmacRng(row.seed, row.rng_cursor) : new SeededRng(`${row.seed}::server`, row.rng_cursor);
}
const load = (id: string) => db().get<SessionRow>('SELECT * FROM game_sessions WHERE id = ?', id);
function owned(u: User, id: string): SessionRow {
  const row = load(id);
  if (!row || row.user_id !== u.id) throw new HttpError(404, 'Session not found', 'NOT_FOUND');
  return row;
}

export function loungeMinutesToday(userId: string): number {
  return db().get<{ m: number }>(
    "SELECT COALESCE(SUM((julianday(COALESCE(ended_at, ?)) - julianday(started_at)) * 1440), 0) AS m FROM game_sessions WHERE user_id = ? AND env = 'lounge' AND started_at >= ?",
    nowIso(), userId, dayKey() + 'T00:00:00.000Z',
  )!.m;
}
function loungeLimitCheck(u: User) {
  const lim = u.lounge_daily_limit_min as number | null;
  if (lim && loungeMinutesToday(u.id) >= lim) throw new HttpError(429, `You reached your daily Lounge time limit (${lim} min). It resets at midnight UTC.`, 'TIME_LIMIT');
}

/* ---------------- start ---------------- */
export function startSession(u: User, body: { gameId: string; difficulty?: string; context?: Context; ref?: string; config?: Record<string, unknown> }) {
  const meta = BY_ID[body.gameId];
  const access = canPlay(u, body.gameId);
  if (!access.ok) throw new HttpError(access.status, access.message, access.code);
  const engine = ENGINES[body.gameId];
  let difficulty: Difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty) ? (body.difficulty as Difficulty) : 'normal';
  const context: Context = (['solo', 'daily', 'challenge', 'race'] as const).includes(body.context as Context) ? (body.context as Context) : 'solo';
  let seed: string;
  if (meta.env === 'lounge') {
    if (context !== 'solo') throw new HttpError(400, 'Lounge simulations are solo only', 'VALIDATION');
    loungeLimitCheck(u);
    dailyChipsTopUp(u.id);
    seed = newServerSeed();
  } else if (context === 'daily') {
    const dp = dailyPuzzle();
    if (dp.gameId !== body.gameId) throw new HttpError(400, "That is not today's Daily Puzzle", 'VALIDATION');
    seed = dp.seed; difficulty = dp.difficulty;
  } else if (context === 'challenge') {
    const c = hooks.challengeSeed?.(String(body.ref ?? ''), u.id, body.gameId);
    if (!c) throw new HttpError(404, 'Challenge not found or already played', 'NOT_FOUND');
    seed = c.seed; difficulty = c.difficulty;
  } else if (context === 'race') {
    const r = hooks.raceSeed?.(String(body.ref ?? ''), u.id, body.gameId);
    if (!r) throw new HttpError(404, 'Race not found', 'NOT_FOUND');
    seed = r.seed; difficulty = r.difficulty;
  } else seed = newServerSeed().slice(0, 32);

  const id = newId('s_');
  const startedMs = Date.now();
  const row: SessionRow = {
    id, user_id: u.id, game_id: body.gameId, env: meta.env, mode: engine.mode, status: 'active', difficulty, seed, seed_commit: commitOf(seed),
    rng_cursor: 0, rules_version: engine.rulesVersion, state: null, context, context_ref: body.ref ?? null, score: null, result: null, started_ms: startedMs, started_at: nowIso(), ended_at: null,
  };
  let view: unknown = null;
  if (engine.mode === 'server') {
    const rng = rngFor(row);
    const vsAi = engine.players.max > 1;
    const state = engine.init({ players: [SOLO], difficulty, vsAi, config: sanitizeConfig(body.config), seed: meta.env === 'family' ? seed : undefined }, { rng, now: startedMs, player: SOLO });
    row.rng_cursor = rng.cursor();
    row.state = JSON.stringify(state);
    view = engine.view(state, SOLO);
  }
  db().run(
    `INSERT INTO game_sessions (id, user_id, game_id, env, mode, status, difficulty, seed, seed_commit, rng_cursor, rules_version, state, context, context_ref, started_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, u.id, body.gameId, meta.env, engine.mode, 'active', difficulty, seed, row.seed_commit, row.rng_cursor, row.rules_version, row.state, context, row.context_ref, startedMs,
  );
  track('game_start', u.id, { game: body.gameId, mode: engine.mode, context, difficulty });
  return {
    sessionId: id, gameId: body.gameId, mode: engine.mode, difficulty, context, rulesVersion: engine.rulesVersion, commit: row.seed_commit,
    // Replay seeds are needed by the client; server/Lounge seeds stay secret until the session ends.
    seed: engine.mode === 'replay' ? seed : undefined,
    view, serverNow: Date.now(),
    chips: meta.env === 'lounge' ? balance(u.id, 'CHIPS') : undefined,
    gate: (access as any).gate,
  };
}

function sanitizeConfig(c: unknown): Record<string, unknown> | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  if ('colourMode' in (c as any)) out.colourMode = !!(c as any).colourMode;
  return out;
}

/* ---------------- server-mode actions ---------------- */
export async function act(u: User, id: string, action: unknown) {
  return withLock(id, () => {
    const row = owned(u, id);
    if (row.status !== 'active') throw new HttpError(409, 'This session has ended', 'SESSION_ENDED');
    if (row.mode !== 'server') throw new HttpError(400, 'Submit replay games with /submit', 'VALIDATION');
    if (!action || typeof action !== 'object' || JSON.stringify(action).length > 4000) throw new HttpError(400, 'Bad action', 'VALIDATION');
    const engine = ENGINES[row.game_id];
    if (row.env === 'lounge') {
      if (!loungeAccess(u).entitled) throw new HttpError(403, 'Lounge access is not active', 'LOUNGE_LOCKED');
      const a = canPlay(u, row.game_id);
      if (!a.ok) throw new HttpError(a.status, a.message, a.code);
      if ((action as any).type !== 'tick') loungeLimitCheck(u);
    }
    const rng = rngFor(row);
    const ctx: Ctx = { rng, now: Date.now(), player: SOLO, balance: row.env === 'lounge' ? balance(u.id, 'CHIPS') : undefined };
    let state = JSON.parse(row.state!);
    try {
      state = engine.apply(state, action, ctx);
    } catch (e) {
      if (e instanceof GameError) throw new HttpError(422, e.message, e.code);
      throw e;
    }
    return persist(u, row, engine, state, rng, action);
  });
}

function persist(u: User, row: SessionRow, engine: Engine, state: any, rng: Rng, action: unknown, finalizing = false) {
  let completion: CompletionOutput | null = null;
  db().tx(() => {
    if (row.env === 'lounge' && Array.isArray(state.ledger)) {
      for (const l of state.ledger) {
        const key = `${row.id}:${l.ref}:${l.kind}`;
        post(u.id, 'CHIPS', l.kind === 'stake' ? -l.amount : l.amount, l.kind === 'stake' ? 'stake' : 'payout', `game:${row.game_id}`, key, row.id);
      }
      state.ledger = [];
    }
    const seq = db().get<{ n: number }>('SELECT COUNT(*) AS n FROM game_actions WHERE session_id = ?', row.id)!.n;
    if ((action as any)?.type !== 'tick') db().run('INSERT INTO game_actions (session_id, seq, action, at_ms) VALUES (?, ?, ?, ?)', row.id, seq, JSON.stringify(action), Date.now());
    db().run('UPDATE game_sessions SET state = ?, rng_cursor = ? WHERE id = ?', JSON.stringify(state), rng.cursor(), row.id);
    if (!finalizing && row.env === 'family' && engine.isOver(state)) completion = complete(u, row, engine, state);
  });
  const over = row.env === 'family' && engine.isOver(state);
  return {
    view: engine.view(state, SOLO), over, completion,
    result: over ? engine.result(state) : undefined,
    chips: row.env === 'lounge' ? balance(u.id, 'CHIPS') : undefined,
    serverNow: Date.now(),
  };
}

/* ---------------- completion ---------------- */
function complete(u: User, row: SessionRow, engine: Engine, state: any): CompletionOutput {
  const res = engine.result(state);
  const score = Math.max(0, Math.round(res.scores[SOLO] ?? 0));
  const vsAi = engine.players.max > 1;
  let won = res.winner === SOLO;
  if (row.game_id === 'tower-tactics') won = (res.summary as any)?.waves === 10 && (res.summary as any)?.shields > 0;
  db().run("UPDATE game_sessions SET status = 'completed', score = ?, result = ?, ended_at = ? WHERE id = ?", score, JSON.stringify(res), nowIso(), row.id);
  const out = recordCompletion({ userId: u.id, gameId: row.game_id, sessionId: row.id, score, won, vsAi, difficulty: row.difficulty, context: row.context, multiplayer: row.context === 'race' });
  if (row.context === 'challenge' && row.context_ref) hooks.challengeFinished?.(row.context_ref, u.id, score);
  if (row.context === 'race' && row.context_ref) hooks.raceFinished?.(row.context_ref, u.id, score, row.id);
  track('game_complete', u.id, { game: row.game_id, score, won, context: row.context });
  return out;
}

/* ---------------- replay verification ---------------- */
export const MAX_ACTIONS = 50_000;
export function verifyReplay(engine: Engine, seed: string, difficulty: Difficulty, actions: any[], config?: Record<string, unknown>): { state: any } {
  const rng = new SeededRng(`${seed}::replay`);
  let state = engine.init({ players: [SOLO], difficulty, seed, config }, { rng, now: 0, player: SOLO });
  let last = 0;
  for (const a of actions) {
    if (!a || typeof a !== 'object' || typeof a.t !== 'number' || !Number.isFinite(a.t) || a.t < 0) throw new GameError('Malformed action', 'MALFORMED');
    if (a.t < last) throw new GameError('Actions out of order', 'IMPLAUSIBLE');
    last = a.t;
    if (engine.isOver(state)) break;
    state = engine.apply(state, a, { rng, now: a.t, player: SOLO });
  }
  return { state };
}

export async function submit(u: User, id: string, body: { actions?: unknown; config?: Record<string, unknown> }) {
  return withLock(id, () => {
    const row = owned(u, id);
    if (row.status !== 'active') throw new HttpError(409, 'This session has ended', 'SESSION_ENDED');
    if (row.mode !== 'replay') throw new HttpError(400, 'Not a replay game', 'VALIDATION');
    const engine = ENGINES[row.game_id];
    const actions = body.actions;
    if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) throw new HttpError(400, 'Bad action log', 'VALIDATION');
    const lastT = actions.length ? Number((actions[actions.length - 1] as any).t) : 0;
    const reject = (reason: string, code: string) => {
      db().run("UPDATE game_sessions SET status = 'rejected', reject_reason = ?, ended_at = ? WHERE id = ?", reason, nowIso(), row.id);
      track('game_rejected', u.id, { game: row.game_id, code });
      throw new HttpError(422, `Run could not be verified: ${reason}`, code);
    };
    const maxMs = engine.maxDurationMs?.(null as any) ?? 3_600_000;
    if (lastT > maxMs) reject('session longer than the game allows', 'TOO_LONG');
    const wall = Date.now() - row.started_ms;
    if (lastT > wall + 2500) reject('submitted timeline is faster than real time', 'TOO_FAST');
    let state: any;
    try {
      state = verifyReplay(engine, row.seed, row.difficulty, actions, sanitizeConfig(body.config)).state;
    } catch (e) {
      if (e instanceof GameError) reject(e.message, e.code);
      throw e;
    }
    let completion: CompletionOutput | null = null;
    db().tx(() => {
      const ins = 'INSERT INTO game_actions (session_id, seq, action, at_ms) VALUES (?, ?, ?, ?)';
      // Store a compact copy of the verified log for audits (capped).
      db().run(ins, row.id, 0, JSON.stringify(actions.slice(0, 5000)), Date.now());
      completion = complete(u, row, engine, state);
    });
    const res = engine.result(state);
    return { verified: true, score: Math.max(0, Math.round(res.scores[SOLO] ?? 0)), result: res, completion };
  });
}

/* ---------------- end / abandon ---------------- */
export async function endSession(u: User, id: string) {
  return withLock(id, () => {
    const row = owned(u, id);
    if (row.status !== 'active') return { ended: true, seed: row.env === 'lounge' ? row.seed : undefined };
    const engine = ENGINES[row.game_id];
    let out: any = {};
    if (row.mode === 'server' && engine.finalize && row.state) {
      const rng = rngFor(row);
      const state = engine.finalize(JSON.parse(row.state), { rng, now: Date.now(), player: SOLO, balance: row.env === 'lounge' ? balance(u.id, 'CHIPS') : undefined });
      out = persist(u, row, engine, state, rng, { type: 'close' }, true);
    }
    const st = row.env === 'lounge' ? 'completed' : 'abandoned';
    let net: number | null = null;
    if (row.env === 'lounge') {
      net = db().get<{ n: number }>("SELECT COALESCE(SUM(amount),0) AS n FROM ledger WHERE session_id = ? AND currency = 'CHIPS'", row.id)!.n;
    }
    db().run('UPDATE game_sessions SET status = ?, ended_at = ?, score = COALESCE(score, ?) WHERE id = ?', st, nowIso(), net, row.id);
    track('game_end', u.id, { game: row.game_id, status: st });
    return { ended: true, net, chips: out.chips, seed: row.env === 'lounge' ? row.seed : undefined, commit: row.seed_commit };
  });
}

/** Close Lounge sessions idle for 2h and abandon stale family sessions. */
export function reapSessions() {
  const cutoff = Date.now() - 2 * 3600_000;
  for (const row of db().all<SessionRow>("SELECT * FROM game_sessions WHERE status = 'active' AND started_ms < ? LIMIT 200", cutoff)) {
    const u = db().get<User>('SELECT * FROM users WHERE id = ?', row.user_id);
    if (!u) continue;
    endSession(u, row.id).catch((e) => console.error('[reaper]', e));
  }
}

export function sessionView(u: User, id: string) {
  const row = owned(u, id);
  const engine = ENGINES[row.game_id];
  return {
    sessionId: row.id, gameId: row.game_id, mode: row.mode, status: row.status, difficulty: row.difficulty, context: row.context, commit: row.seed_commit,
    seed: row.mode === 'replay' || (row.env === 'lounge' && row.status !== 'active') ? row.seed : undefined,
    view: row.mode === 'server' && row.state ? engine.view(JSON.parse(row.state), SOLO) : null,
    score: row.score, result: row.result ? JSON.parse(row.result) : null, serverNow: Date.now(),
    chips: row.env === 'lounge' ? balance(u.id, 'CHIPS') : undefined,
  };
}

export async function sessionRoutes(app: FastifyInstance) {
  app.post('/api/sessions', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'session-start', 60);
    return startSession(u, (req.body ?? {}) as any);
  });
  app.get('/api/sessions/active', async (req) => {
    const u = requireUser(req);
    return {
      sessions: db().all(
        "SELECT id, game_id, difficulty, context, started_at FROM game_sessions WHERE user_id = ? AND status = 'active' AND mode = 'server' AND env = 'family' ORDER BY started_at DESC LIMIT 5",
        u.id,
      ),
    };
  });
  app.get('/api/sessions/:id', async (req) => sessionView(requireUser(req), (req.params as any).id));
  app.post('/api/sessions/:id/action', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'action', 1200);
    return act(u, (req.params as any).id, (req.body as any)?.action);
  });
  app.post('/api/sessions/:id/submit', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'submit', 30);
    return submit(u, (req.params as any).id, (req.body ?? {}) as any);
  });
  app.post('/api/sessions/:id/end', async (req) => endSession(requireUser(req), (req.params as any).id));
}
