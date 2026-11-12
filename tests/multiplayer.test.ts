/** End-to-end multiplayer over real WebSockets: two registered friends play a live match and a race. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
process.env.PLAYZO_DB_PATH = ':memory:';
const { buildApp } = await import('../server/app');
const { db } = await import('../server/db');
const { REPLAY_ENGINES } = await import('../shared/games');
const { SeededRng } = await import('../shared/rng');

let app: Awaited<ReturnType<typeof buildApp>>;
let base = '';
beforeAll(async () => { app = await buildApp(); await app.listen({ port: 0, host: '127.0.0.1' }); const a = app.server.address() as any; base = `127.0.0.1:${a.port}`; });
afterAll(async () => { await app.close(); });

async function user(name: string) {
  const r = await fetch(`http://${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-playzo': '1' }, body: JSON.stringify({ email: `${name}@mp.local`, username: name, password: 'password123', dob: '1992-02-02', acceptTerms: true }) });
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  const body = await r.json();
  return { id: body.user.id as string, cookie };
}
function socket(cookie: string) {
  const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } });
  const msgs: any[] = [];
  const waiters: { pred: (m: any) => boolean; res: (m: any) => void }[] = [];
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); msgs.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } });
  const wait = (pred: (m: any) => boolean, ms = 5000) => new Promise<any>((res, rej) => { const hit = [...msgs].reverse().find(pred); if (hit) return res(hit); waiters.push({ pred, res }); setTimeout(() => rej(new Error('timeout waiting for message')), ms); });
  const open = new Promise((r) => ws.on('open', r));
  return { ws, msgs, wait, open, send: (m: any) => ws.send(JSON.stringify(m)) };
}
const api = (cookie: string, path: string, body?: unknown) => fetch(`http://${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-playzo': '1', cookie }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

describe('live room: Connect Five between two players', () => {
  it('create -> join -> ready -> start -> play to a win -> results persisted', async () => {
    const a = await user('mpa'), b = await user('mpb');
    const { code } = await api(a.cookie, '/api/rooms', { gameId: 'connect-five' });
    const A = socket(a.cookie), B = socket(b.cookie);
    await Promise.all([A.open, B.open]);
    A.send({ t: 'join', code }); await A.wait((m) => m.t === 'room');
    B.send({ t: 'join', code }); await A.wait((m) => m.t === 'room' && m.room.members.length === 2);
    B.send({ t: 'ready', v: true }); await A.wait((m) => m.t === 'room' && m.room.members.every((x: any) => x.ready || x.userId === a.id));
    A.send({ t: 'start' });
    await A.wait((m) => m.t === 'state');
    // Host is black (first). A plays row 0 cols 0-4, B plays row 5.
    for (let k = 0; k < 5; k++) {
      A.send({ t: 'act', action: { type: 'place', i: k } });
      await B.wait((m) => m.t === 'state' && m.view.cells[k] === 0);
      if (k < 4) { B.send({ t: 'act', action: { type: 'place', i: 13 * 5 + k } }); await A.wait((m) => m.t === 'state' && m.view.cells[13 * 5 + k] === 1); }
    }
    const done = await B.wait((m) => m.t === 'room' && m.room.status === 'done');
    expect(done.room.result.winner).toBe(a.id);
    expect(done.room.result.outcomes[b.id]).toBe('loss');
    const rows = db().all('SELECT user_id, outcome FROM match_players');
    expect(rows).toEqual(expect.arrayContaining([{ user_id: a.id, outcome: 'win' }, { user_id: b.id, outcome: 'loss' }]));
    const progA = await api(a.cookie, '/api/me/progress');
    expect(progA.matches[0].outcome).toBe('win');
    A.ws.close(); B.ws.close();
  });
  it('emotes only: arbitrary text cannot be broadcast', async () => {
    const a = await user('mpc');
    const { code } = await api(a.cookie, '/api/rooms', { gameId: 'trivia-clash' });
    const A = socket(a.cookie); await A.open;
    A.send({ t: 'join', code }); await A.wait((m) => m.t === 'room');
    A.send({ t: 'emote', e: 'hello stranger, what is your address?' });
    A.send({ t: 'emote', e: 'GG' });
    const em = await A.wait((m) => m.t === 'emote');
    expect(em.e).toBe('GG');
    expect(A.msgs.filter((m) => m.t === 'emote')).toHaveLength(1);
    A.ws.close();
  });
});

describe('race room: same seed, verified scores', () => {
  it('both racers receive the same seed and standings come from verified sessions', async () => {
    const a = await user('race1'), b = await user('race2');
    const { code, format } = await api(a.cookie, '/api/rooms', { gameId: 'logic-lock', difficulty: 'easy' });
    expect(format).toBe('race');
    const A = socket(a.cookie), B = socket(b.cookie);
    await Promise.all([A.open, B.open]);
    A.send({ t: 'join', code }); B.send({ t: 'join', code });
    await A.wait((m) => m.t === 'room' && m.room.members.length === 2);
    B.send({ t: 'ready', v: true }); await A.wait((m) => m.t === 'room' && m.room.members.find((x: any) => x.userId === b.id)?.ready);
    A.send({ t: 'start' });
    const ra = await A.wait((m) => m.t === 'room' && m.room.status === 'playing' && m.room.race.seed);
    const rb = await B.wait((m) => m.t === 'room' && m.room.status === 'playing' && m.room.race.seed);
    expect(ra.room.race.seed).toBe(rb.room.race.seed);
    for (const p of [a, b]) {
      const s = await api(p.cookie, '/api/sessions', { gameId: 'logic-lock', context: 'race', ref: code });
      expect(s.seed).toBe(ra.room.race.seed);
      const sub = await api(p.cookie, `/api/sessions/${s.sessionId}/submit`, { actions: [{ t: 10, end: true }] });
      expect(sub.verified).toBe(true);
    }
    const done = await A.wait((m) => m.t === 'room' && m.room.status === 'done');
    expect(Object.keys(done.room.result.scores)).toHaveLength(2);
    void REPLAY_ENGINES; void SeededRng;
    A.ws.close(); B.ws.close();
  });
});
