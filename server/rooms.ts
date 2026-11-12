/**
 * Real-time multiplayer over WebSocket.
 *  - 'versus' rooms run a server-authoritative engine (turn-based or simultaneous) for 2-8 players.
 *  - 'race' rooms give every player the same seed for a replay-verified game; scores come only from
 *    verified sessions (see sessions.ts submit()).
 * Safety: emotes only (no free text), rooms never mix adult and under-18/unknown-age accounts,
 * under-13 accounts need parental consent, blocked players cannot share a room.
 * Persistence: every room is snapshotted to the `rooms` table (engine state + RNG cursor), so live
 * rooms survive a server restart; players reconnect with the same code and carry on.
 */
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { ENGINES } from './games/registry';
import { BY_ID } from '../shared/catalogue';
import { Difficulty, DIFFICULTIES, GameError } from '../shared/engine';
import { SeededRng } from '../shared/rng';
import { db } from './db';
import { currentUser, HttpError, requireUser, User, rateLimit } from './http';
import { socialPolicy } from './access';
import { isBlocked } from './social';
import { hooks } from './sessions';
import { recordCompletion } from './progression';
import { newId, newServerSeed } from './secureRng';
import { track } from './analytics';
import { config } from './config';

export const EMOTES = ['👍', '🔥', '😮', '😂', '👏', '🤝', 'GG', 'Nice!'];
const DISCONNECT_FORFEIT_MS = 60_000;

interface Member { userId: string; name: string; avatar: string; adult: boolean; ready: boolean; team: number; connected: boolean; leftAt: number | null; sockets: Set<WebSocket> }
interface Room {
  code: string; gameId: string; hostId: string; format: 'versus' | 'race'; difficulty: Difficulty; teams: boolean; status: 'lobby' | 'playing' | 'done';
  members: Member[]; maxPlayers: number; adult: boolean; isPublic: boolean; createdAt: number;
  state: any; rng: SeededRng | null; seed: string | null; startedAt: number | null; deadline: number | null;
  race: Record<string, { score: number; sessionId: string } | null>; result: any; matchId: string | null; lastActivity: number;
  dirty?: boolean; lastSaved?: number;
}
const rooms = new Map<string, Room>();
const queue = new Map<string, { userId: string; at: number }[]>();
const LOBBY_DISCONNECT_MS = 60_000;

const code6 = () => {
  let c: string;
  do { c = randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase(); }
  while (c.length < 6 || rooms.has(c) || db().get("SELECT 1 FROM rooms WHERE code = ? AND status IN ('lobby','playing')", c));
  return c;
};

/* ---------------- persistence ---------------- */
function snapshot(r: Room) {
  return {
    code: r.code, gameId: r.gameId, hostId: r.hostId, format: r.format, difficulty: r.difficulty, teams: r.teams, status: r.status,
    members: r.members.map((m) => ({ userId: m.userId, name: m.name, avatar: m.avatar, adult: m.adult, ready: m.ready, team: m.team, connected: m.connected, leftAt: m.leftAt })),
    maxPlayers: r.maxPlayers, adult: r.adult, isPublic: r.isPublic, createdAt: r.createdAt, state: r.state, seed: r.seed, rngCursor: r.rng?.cursor() ?? 0,
    startedAt: r.startedAt, deadline: r.deadline, race: r.race, result: r.result, matchId: r.matchId, lastActivity: r.lastActivity,
  };
}
/** Write the room to the database now (structural changes) - cheap with SQLite WAL. */
function saveRoom(r: Room, status: string = r.status) {
  try {
    db().run(
      `INSERT INTO rooms (code, game_id, host_id, status, adult, snapshot, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(code) DO UPDATE SET host_id = excluded.host_id, status = excluded.status, snapshot = excluded.snapshot, version = rooms.version + 1, updated_at = excluded.updated_at`,
      r.code, r.gameId, r.hostId, status, r.adult ? 1 : 0, JSON.stringify(snapshot(r)), new Date().toISOString(),
    );
    r.dirty = false; r.lastSaved = Date.now();
  } catch (e) { console.error('[rooms] save failed', r.code, e); }
}
/** Restore lobby/playing rooms after a restart. Members start disconnected and must reconnect. */
export function restoreRooms(): number {
  let n = 0;
  const now = Date.now();
  for (const row of db().all<{ code: string; snapshot: string }>("SELECT code, snapshot FROM rooms WHERE status IN ('lobby','playing')")) {
    try {
      const s = JSON.parse(row.snapshot);
      if (!ENGINES[s.gameId] || now - s.createdAt > 3 * 3600_000) { db().run("UPDATE rooms SET status = 'expired' WHERE code = ?", row.code); continue; }
      const r: Room = {
        ...s, members: s.members.map((m: any) => ({ ...m, connected: false, leftAt: now, sockets: new Set<WebSocket>() })),
        rng: s.status === 'playing' && s.format === 'versus' && s.seed ? new SeededRng(`${s.seed}::room`, s.rngCursor ?? 0) : null,
        lastActivity: now,
      };
      rooms.set(r.code, r);
      n++;
    } catch (e) { console.error('[rooms] restore failed', row.code, e); }
  }
  // Housekeeping: old finished/expired rows are purged after 7 days (match results live in `matches`).
  db().run("DELETE FROM rooms WHERE status IN ('done','expired') AND updated_at < ?", new Date(now - 7 * 86400_000).toISOString());
  if (n) console.log(`[rooms] restored ${n} live room(s) from the database`);
  return n;
}
const isAdult = (u: User) => u.age_band === 'adult';

function formatFor(gameId: string): 'versus' | 'race' | null {
  const e = ENGINES[gameId];
  const meta = BY_ID[gameId];
  if (!e || !meta || meta.env !== 'family') return null;
  if (e.mode === 'server' && e.players.max > 1) return 'versus';
  if (e.mode === 'replay' && meta.formats.includes('race')) return 'race';
  return null;
}

function roomView(r: Room, viewer?: string) {
  return {
    code: r.code, gameId: r.gameId, hostId: r.hostId, format: r.format, difficulty: r.difficulty, teams: r.teams, status: r.status, maxPlayers: r.maxPlayers, isPublic: r.isPublic,
    members: r.members.map((m) => ({ userId: m.userId, name: m.name, avatar: m.avatar, ready: m.ready, team: m.team, connected: m.connected, me: m.userId === viewer })),
    race: r.format === 'race' ? { seed: r.status !== 'lobby' && viewer && r.members.some((m) => m.userId === viewer) ? r.seed : null, scores: r.race, deadline: r.deadline } : null,
    result: r.result, startedAt: r.startedAt,
  };
}

function send(ws: WebSocket, msg: unknown) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcastRoom(r: Room) { for (const m of r.members) for (const ws of m.sockets) send(ws, { t: 'room', room: roomView(r, m.userId) }); }
function broadcastState(r: Room) {
  if (!r.state) return;
  const e = ENGINES[r.gameId];
  for (const m of r.members) for (const ws of m.sockets) send(ws, { t: 'state', view: e.view(r.state, m.userId), turn: e.turn?.(r.state) ?? null, serverNow: Date.now() });
}

export function createRoom(u: User, gameId: string, difficulty: string, teams: boolean, isPublic = false): Room {
  const format = formatFor(gameId);
  if (!format) throw new HttpError(400, 'This game has no multiplayer rooms', 'VALIDATION');
  const pol = socialPolicy(u);
  if (!pol.canJoinPrivateRooms) throw new HttpError(403, 'A parent or guardian must approve multiplayer first', 'FORBIDDEN');
  const e = ENGINES[gameId];
  const meta = BY_ID[gameId];
  const r: Room = {
    code: code6(), gameId, hostId: u.id, format, difficulty: DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : 'normal',
    teams: teams && meta.formats.includes('teams'), status: 'lobby', members: [], maxPlayers: format === 'race' ? Math.min(8, meta.maxPlayers) : e.players.max,
    adult: isAdult(u), isPublic, createdAt: Date.now(), state: null, rng: null, seed: null, startedAt: null, deadline: null, race: {}, result: null, matchId: null, lastActivity: Date.now(),
  };
  rooms.set(r.code, r);
  saveRoom(r);
  track('room_created', u.id, { game: gameId, format });
  return r;
}

function join(r: Room, u: User, ws: WebSocket) {
  const existing = r.members.find((m) => m.userId === u.id);
  if (existing) { existing.sockets.add(ws); existing.connected = true; existing.leftAt = null; return; }
  if (r.status !== 'lobby') throw new HttpError(409, 'This match has already started', 'STARTED');
  if (r.members.length >= r.maxPlayers) throw new HttpError(409, 'Room is full', 'FULL');
  if (isAdult(u) !== r.adult) throw new HttpError(403, 'This room is not available for your account type', 'FORBIDDEN');
  if (!socialPolicy(u).canJoinPrivateRooms) throw new HttpError(403, 'A parent or guardian must approve multiplayer first', 'FORBIDDEN');
  if (r.members.some((m) => isBlocked(m.userId, u.id))) throw new HttpError(403, 'You cannot join this room', 'FORBIDDEN');
  const team = r.teams ? (r.members.filter((m) => m.team === 0).length <= r.members.filter((m) => m.team === 1).length ? 0 : 1) : 0;
  r.members.push({ userId: u.id, name: u.display_name, avatar: u.avatar, adult: isAdult(u), ready: false, team, connected: true, leftAt: null, sockets: new Set([ws]) });
  saveRoom(r);
}

function start(r: Room) {
  const e = ENGINES[r.gameId];
  const n = r.members.length;
  const min = r.format === 'race' ? 2 : Math.max(2, e.players.min);
  if (n < min) throw new HttpError(400, `Need at least ${min} players`, 'VALIDATION');
  if (r.teams && (n < 4 || r.members.some((m) => m.team !== 0 && m.team !== 1) || !r.members.some((m) => m.team === 0) || !r.members.some((m) => m.team === 1))) throw new HttpError(400, 'Team games need at least 2 players on each team', 'VALIDATION');
  r.seed = newServerSeed().slice(0, 32);
  r.status = 'playing';
  r.startedAt = Date.now();
  r.lastActivity = Date.now();
  if (r.format === 'versus') {
    r.rng = new SeededRng(`${r.seed}::room`);
    const teams = r.teams ? Object.fromEntries(r.members.map((m) => [m.userId, m.team])) : undefined;
    r.state = e.init({ players: r.members.map((m) => m.userId), difficulty: r.difficulty, config: { teams, clockMs: 300_000 } }, { rng: r.rng, now: Date.now(), player: r.hostId });
  } else {
    r.race = Object.fromEntries(r.members.map((m) => [m.userId, null]));
    r.deadline = Date.now() + Math.min(e.maxDurationMs?.(null as any) ?? 600_000, 20 * 60_000) + 60_000;
  }
  saveRoom(r);
  track('room_started', r.hostId, { game: r.gameId, players: n });
  broadcastRoom(r);
  broadcastState(r);
}

function finish(r: Room, forced?: { winner: string | null; reason: string }) {
  if (r.status === 'done') return;
  r.status = 'done';
  const meta = BY_ID[r.gameId];
  let scores: Record<string, number>, winner: string | null = null, teamWinner: number | null = null, summary: any = {};
  if (r.format === 'versus') {
    const res = ENGINES[r.gameId].result(r.state);
    scores = res.scores; winner = res.winner ?? null; summary = res.summary ?? {};
    if (r.teams) teamWinner = (summary.winningTeam as number | null) ?? null;
  } else {
    scores = Object.fromEntries(r.members.map((m) => [m.userId, r.race[m.userId]?.score ?? 0]));
    const ranked = [...r.members].filter((m) => r.race[m.userId]).sort((a, b) => scores[b.userId] - scores[a.userId]);
    if (ranked.length && (ranked.length === 1 || scores[ranked[0].userId] > scores[ranked[1].userId])) winner = ranked[0].userId;
  }
  if (forced) { winner = forced.winner; summary.reason = forced.reason; }
  const outcome = (uid: string, team: number) => (r.teams ? (teamWinner === null ? 'draw' : teamWinner === team ? 'win' : 'loss') : winner === null ? 'draw' : winner === uid ? 'win' : 'loss');
  // Deterministic match id: a room start can only ever produce one match record (no duplicate results/rewards).
  r.matchId = `m_${r.code}_${r.startedAt ?? 0}`;
  r.result = { scores, winner, teamWinner, summary, outcomes: Object.fromEntries(r.members.map((m) => [m.userId, outcome(m.userId, m.team)])) };
  db().tx(() => {
    const ins = db().run('INSERT OR IGNORE INTO matches (id, room_code, game_id, format, players, result) VALUES (?, ?, ?, ?, ?, ?)', r.matchId, r.code, r.gameId, r.teams ? 'teams' : r.format, JSON.stringify(r.members.map((m) => m.userId)), JSON.stringify(r.result));
    if (Number(ins.changes) === 0) return; // already recorded
    for (const m of r.members) {
      const user = db().get<{ id: string }>('SELECT id FROM users WHERE id = ?', m.userId);
      if (!user) continue;
      db().run('INSERT INTO match_players (match_id, user_id, score, outcome, team) VALUES (?, ?, ?, ?, ?)', r.matchId, m.userId, Math.round(scores[m.userId] ?? 0), outcome(m.userId, m.team), r.teams ? m.team : null);
      // Race players already got progression from their verified session; versus players get it here.
      if (r.format === 'versus') recordCompletion({ userId: m.userId, gameId: r.gameId, sessionId: `${r.matchId}:${m.userId}`, score: Math.round(scores[m.userId] ?? 0), won: outcome(m.userId, m.team) === 'win', vsAi: false, difficulty: r.difficulty, context: 'room', multiplayer: true });
    }
  });
  saveRoom(r);
  track('room_finished', r.hostId, { game: meta.id, format: r.format });
  broadcastRoom(r);
  broadcastState(r);
}

function applyAction(r: Room, uid: string, action: unknown) {
  if (r.status !== 'playing' || r.format !== 'versus') throw new HttpError(409, 'Not in a live match', 'NOT_PLAYING');
  if (!action || typeof action !== 'object' || JSON.stringify(action).length > 2000) throw new HttpError(400, 'Bad action', 'VALIDATION');
  if ((action as any).type === 'tick') return;
  const e = ENGINES[r.gameId];
  try {
    r.state = e.apply(r.state, action, { rng: r.rng!, now: Date.now(), player: uid });
  } catch (err) {
    if (err instanceof GameError) throw new HttpError(422, err.message, err.code);
    throw err;
  }
  r.lastActivity = Date.now();
  saveRoom(r);
  broadcastState(r);
  if (e.isOver(r.state)) finish(r);
}

/* ---------------- race hooks (called by sessions.ts) ---------------- */
hooks.raceSeed = (code, userId, gameId) => {
  const r = rooms.get(code);
  if (!r || r.format !== 'race' || r.gameId !== gameId || r.status !== 'playing' || !(userId in r.race) || r.race[userId]) return null;
  return { seed: r.seed!, difficulty: r.difficulty };
};
hooks.raceFinished = (code, userId, score, sessionId) => {
  const r = rooms.get(code);
  if (!r || r.status !== 'playing' || !(userId in r.race)) return;
  r.race[userId] = { score, sessionId };
  saveRoom(r);
  broadcastRoom(r);
  if (r.members.every((m) => r.race[m.userId] || !m.connected)) finish(r);
};

/* ---------------- timers: ticks, forfeits, cleanup ---------------- */
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    try {
      if (r.status === 'playing' && r.format === 'versus') {
        const e = ENGINES[r.gameId];
        if (e.timed) {
          r.state = e.apply(r.state, { type: 'tick' }, { rng: r.rng!, now, player: r.hostId });
          r.dirty = true;
          broadcastState(r);
          if (e.isOver(r.state)) finish(r);
        }
        // Disconnect forfeits for turn-based games.
        const gone = r.members.filter((m) => !m.connected && m.leftAt && now - m.leftAt > DISCONNECT_FORFEIT_MS);
        if (r.status === 'playing' && gone.length && !e.simultaneous) {
          const left = r.members.filter((m) => !gone.includes(m));
          finish(r, { winner: left.length === 1 ? left[0].userId : null, reason: 'opponent disconnected' });
        }
      }
      if (r.status === 'playing' && r.format === 'race' && r.deadline && now > r.deadline) finish(r);
      // Lobby: players who dropped and did not come back within the grace period leave the room.
      if (r.status === 'lobby') {
        const before = r.members.length;
        r.members = r.members.filter((m) => m.connected || !m.leftAt || now - m.leftAt < LOBBY_DISCONNECT_MS);
        if (r.members.length !== before) {
          if (r.members.length && !r.members.some((m) => m.userId === r.hostId)) r.hostId = r.members[0].userId;
          r.dirty = true;
          broadcastRoom(r);
        }
      }
      if (r.dirty && now - (r.lastSaved ?? 0) > 2000) saveRoom(r);
      const empty = r.members.every((m) => !m.connected);
      if ((empty && now - r.lastActivity > 5 * 60_000) || now - r.createdAt > 3 * 3600_000) {
        rooms.delete(r.code);
        saveRoom(r, r.status === 'done' ? 'done' : 'expired');
      }
    } catch (err) {
      console.error('[rooms] tick error', err);
    }
  }
  // stale queue entries
  for (const [k, list] of queue) queue.set(k, list.filter((q) => now - q.at < 120_000));
}, 500).unref();

/* ---------------- routes ---------------- */
export async function roomRoutes(app: FastifyInstance) {
  restoreRooms();
  app.addHook('onClose', async () => { for (const r of rooms.values()) saveRoom(r); });
  app.get('/api/me/matches', async (req) => {
    const u = requireUser(req);
    return {
      matches: db().all(
        `SELECT m.id, m.game_id, m.format, m.room_code, m.created_at, mp.score, mp.outcome, mp.team,
                (SELECT COUNT(*) FROM match_players x WHERE x.match_id = m.id) AS players
         FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ? ORDER BY m.created_at DESC LIMIT 30`, u.id,
      ),
    };
  });
  app.post('/api/rooms', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'room-create', 20);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = createRoom(u, String(b.gameId), String(b.difficulty ?? 'normal'), !!b.teams);
    return { code: r.code, format: r.format };
  });
  app.get('/api/rooms/:code', async (req) => {
    const u = requireUser(req);
    const r = rooms.get(String((req.params as any).code).toUpperCase());
    if (!r || r.adult !== isAdult(u)) throw new HttpError(404, 'Room not found', 'NOT_FOUND');
    return { room: roomView(r, u.id) };
  });
  app.get('/api/rooms-meta', async () => ({ emotes: EMOTES }));

  app.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
    // Cross-site WebSocket hijacking defence: browsers always send Origin; it must be our own site.
    const origin = req.headers.origin;
    if (origin && !allowedOrigin(origin)) { send(socket, { t: 'error', message: 'Origin not allowed', code: 'FORBIDDEN' }); socket.close(); return; }
    const u = currentUser(req);
    if (!u) { send(socket, { t: 'error', message: 'Sign in to play online', code: 'AUTH_REQUIRED' }); socket.close(); return; }
    let room: Room | null = null;
    let msgs = 0;
    const rl = setInterval(() => { msgs = 0; }, 1000);
    const fail = (e: unknown) => send(socket, { t: 'error', message: e instanceof HttpError ? e.message : 'Something went wrong', code: e instanceof HttpError ? e.code : 'ERROR' });
    socket.on('message', (raw: Buffer) => {
      if (++msgs > 30) return fail(new HttpError(429, 'Too many messages', 'RATE_LIMITED'));
      let m: any;
      try { m = JSON.parse(raw.toString()); } catch { return fail(new HttpError(400, 'Bad message', 'VALIDATION')); }
      try {
        const fresh = db().get<User>("SELECT * FROM users WHERE id = ? AND status = 'active'", u.id);
        if (!fresh) { socket.close(); return; }
        switch (m.t) {
          case 'join': {
            const r = rooms.get(String(m.code ?? '').toUpperCase());
            if (!r) throw new HttpError(404, 'Room not found', 'NOT_FOUND');
            join(r, fresh, socket);
            room = r;
            broadcastRoom(r);
            broadcastState(r);
            break;
          }
          case 'ready': if (room) { const me = room.members.find((x) => x.userId === u.id); if (me && room.status === 'lobby') { me.ready = !!m.v; saveRoom(room); broadcastRoom(room); } } break;
          case 'team': if (room && room.teams && room.status === 'lobby') { const me = room.members.find((x) => x.userId === u.id); if (me) { me.team = m.team === 1 ? 1 : 0; saveRoom(room); broadcastRoom(room); } } break;
          case 'start':
            if (!room) throw new HttpError(400, 'Join a room first', 'VALIDATION');
            if (room.hostId !== u.id) throw new HttpError(403, 'Only the host can start', 'FORBIDDEN');
            if (room.status !== 'lobby') throw new HttpError(409, 'Already started', 'STARTED');
            if (room.members.some((x) => x.userId !== room!.hostId && !x.ready)) throw new HttpError(400, 'Everyone must be ready', 'NOT_READY');
            start(room);
            break;
          case 'act': if (!room) throw new HttpError(400, 'Join a room first', 'VALIDATION'); applyAction(room, u.id, m.action); break;
          case 'emote': {
            if (!room || !EMOTES.includes(m.e)) break;
            for (const x of room.members) for (const ws of x.sockets) send(ws, { t: 'emote', from: fresh.display_name, e: m.e });
            break;
          }
          case 'rematch': {
            if (!room || room.status !== 'done' || room.hostId !== u.id) break;
            Object.assign(room, { status: 'lobby', state: null, rng: null, seed: null, startedAt: null, deadline: null, race: {}, result: null, matchId: null });
            room.members = room.members.filter((x) => x.connected);
            room.members.forEach((x) => { x.ready = false; });
            saveRoom(room);
            broadcastRoom(room);
            break;
          }
          case 'queue': {
            const pol = socialPolicy(fresh);
            if (!pol.canUsePublicMatchmaking) throw new HttpError(403, 'Quick match needs a registered 13+ account. Play with friends using a room code instead.', 'FORBIDDEN');
            const gameId = String(m.gameId);
            if (formatFor(gameId) !== 'versus' || ENGINES[gameId].players.max < 2) throw new HttpError(400, 'Quick match is not available for this game', 'VALIDATION');
            const key = `${gameId}:${isAdult(fresh) ? 'adult' : 'teen'}`;
            const list = (queue.get(key) ?? []).filter((q) => q.userId !== u.id && !isBlocked(q.userId, u.id));
            const opp = list.shift();
            if (!opp) { queue.set(key, [...(queue.get(key) ?? []).filter((q) => q.userId !== u.id), { userId: u.id, at: Date.now() }]); send(socket, { t: 'queued', gameId }); break; }
            queue.set(key, (queue.get(key) ?? []).filter((q) => q.userId !== opp.userId));
            const oppUser = db().get<User>('SELECT * FROM users WHERE id = ?', opp.userId);
            if (!oppUser) break;
            const r = createRoom(oppUser, gameId, 'normal', false, true);
            for (const c of [opp.userId, u.id]) socketsFor(c).forEach((ws) => send(ws, { t: 'matched', code: r.code }));
            break;
          }
          case 'unqueue': for (const [k, list] of queue) queue.set(k, list.filter((q) => q.userId !== u.id)); break;
          case 'leave': leave(true); break;
          case 'ping': send(socket, { t: 'pong', serverNow: Date.now() }); break;
        }
      } catch (e) { fail(e); }
    });
    /** explicit = the player pressed Leave; otherwise the connection dropped and they may reconnect. */
    const leave = (explicit = false) => {
      if (!room) return;
      const me = room.members.find((x) => x.userId === u.id);
      if (me) {
        me.sockets.delete(socket);
        if (!me.sockets.size) {
          if (room.status === 'lobby' && explicit) room.members = room.members.filter((x) => x !== me);
          else { me.connected = false; me.leftAt = Date.now(); }
          if (room.hostId === u.id && room.members.length && room.status === 'lobby' && explicit) room.hostId = room.members[0].userId;
        }
      }
      saveRoom(room);
      broadcastRoom(room);
      room = null;
    };
    socket.on('close', () => { clearInterval(rl); leave(false); for (const [k, list] of queue) queue.set(k, list.filter((q) => q.userId !== u.id)); allSockets.get(u.id)?.delete(socket); });
    if (!allSockets.has(u.id)) allSockets.set(u.id, new Set());
    allSockets.get(u.id)!.add(socket);
    send(socket, { t: 'hello', userId: u.id, emotes: EMOTES, serverNow: Date.now() });
  });
}

const allSockets = new Map<string, Set<WebSocket>>();
/** Same-site origins only: the configured public URL plus localhost on the web port (dev). */
function allowedOrigin(origin: string): boolean {
  try {
    const o = new URL(origin);
    if (o.origin === new URL(config.publicUrl).origin) return true;
    return !config.production && ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname);
  } catch { return false; }
}
const socketsFor = (uid: string) => [...(allSockets.get(uid) ?? [])];
export const roomCount = () => rooms.size;
/** Admin monitoring: live rooms without any personal data beyond display names. */
export const roomList = () => [...rooms.values()].map((r) => ({
  code: r.code, gameId: r.gameId, format: r.teams ? 'teams' : r.format, status: r.status, adult: r.adult, players: r.members.length,
  connected: r.members.filter((m) => m.connected).length, createdAt: new Date(r.createdAt).toISOString(), startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
}));
/** Admin moderation: close a room immediately (members are notified). */
export function closeRoom(code: string, reason: string): boolean {
  const r = rooms.get(code);
  if (!r) return false;
  for (const m of r.members) for (const ws of m.sockets) { send(ws, { t: 'error', message: 'This room was closed by a moderator', code: 'CLOSED' }); ws.close(); }
  rooms.delete(code);
  saveRoom(r, 'expired');
  track('room_closed', null, { game: r.gameId, reason });
  return true;
}
/** Tests: simulate a process restart (drop memory, keep the database). */
export function _dropMemoryForTests() { rooms.clear(); queue.clear(); }
