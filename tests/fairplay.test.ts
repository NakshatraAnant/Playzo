/** Behavioural fair-play scoring: human-like timing passes, scripted timing is held for review. */
import { describe, it, expect, beforeAll } from 'vitest';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_RATE_LIMIT_MULTIPLIER = '10';
const { buildApp } = await import('../server/app');
const { db } = await import('../server/db');
const { botScore, reviewRun, FLAG_THRESHOLD } = await import('../server/fairplay');
const { SeededRng } = await import('../shared/rng');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });
const call = async (method: string, url: string, cookie: string, payload?: unknown) => {
  const r = await app.inject({ method: method as any, url, payload: payload as any, headers: { 'x-playzo': '1', cookie } });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, cookie: String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] };
};
const register = async (name: string) => (await call('POST', '/api/auth/register', '', { email: `${name}@fp.local`, username: name, password: 'password123', dob: '1991-01-01', acceptTerms: true })).cookie;

const human = (n: number, seed: string) => { const r = new SeededRng(seed); let t = 0; return Array.from({ length: n }, () => ({ t: (t += 280 + Math.round(r.next() * 520)) })); };
const robot = (n: number, gap: number) => Array.from({ length: n }, (_, i) => ({ t: 1000 + i * gap }));

describe('bot score', () => {
  it('human-like timing stays well below the flag threshold', () => {
    for (let k = 0; k < 20; k++) expect(botScore(human(60, `h${k}`)).score).toBeLessThan(FLAG_THRESHOLD);
  });
  it('metronomic, superhuman or exactly-repeated timing is flagged', () => {
    expect(botScore(robot(60, 120)).score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);       // identical gaps
    expect(botScore(robot(60, 50)).score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);        // and too fast
    const jitterBot = robot(60, 70).map((a, i) => ({ t: a.t + (i % 2) }));                // fast with 1 ms jitter
    expect(botScore(jitterBot).score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
  });
  it('short runs are never judged', () => {
    expect(botScore(robot(10, 50)).score).toBe(0);
  });
});

describe('review workflow', () => {
  it('a flagged run is held from the leaderboard until staff clear or remove it', async () => {
    const player = await register('speedy');
    const s = await call('POST', '/api/sessions', player, { gameId: 'logic-lock', difficulty: 'easy' });
    const sub = await call('POST', `/api/sessions/${s.body.sessionId}/submit`, player, { actions: [{ t: 10, end: true }] });
    expect(sub.body.verified).toBe(true);
    const visible = async () => (await call('GET', '/api/leaderboard/logic-lock?scope=week', player)).body.entries.length;
    expect(await visible()).toBe(1);
    const sig = reviewRun(s.body.sessionId, robot(60, 40));
    expect(sig.score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
    expect(await visible()).toBe(0); // held
    // Staff only.
    expect((await call('GET', '/api/admin/reviews', player)).status).toBe(403);
    const admin = await register('reviewer');
    db().run("UPDATE users SET role = 'admin' WHERE username = 'reviewer'");
    const q = await call('GET', '/api/admin/reviews', admin);
    expect(q.body.runs.map((r: any) => r.id)).toContain(s.body.sessionId);
    expect((await call('POST', `/api/admin/reviews/${s.body.sessionId}`, admin, { decision: 'clear' })).status).toBe(200);
    expect(await visible()).toBe(1);
    expect((await call('POST', `/api/admin/reviews/${s.body.sessionId}`, admin, { decision: 'remove' })).status).toBe(404); // already decided
    // Second run removed outright.
    const s2 = await call('POST', '/api/sessions', player, { gameId: 'logic-lock', difficulty: 'easy' });
    await call('POST', `/api/sessions/${s2.body.sessionId}/submit`, player, { actions: [{ t: 10, end: true }] });
    reviewRun(s2.body.sessionId, robot(60, 40));
    expect((await call('POST', `/api/admin/reviews/${s2.body.sessionId}`, admin, { decision: 'remove' })).status).toBe(200);
    expect(db().get<any>('SELECT COUNT(*) AS n FROM scores WHERE session_id = ?', s2.body.sessionId).n).toBe(0);
    expect(db().get<any>("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('admin.run_clear','admin.run_remove')").n).toBe(2);
  });
  it('every verified replay run gets a bot score recorded', async () => {
    const player = await register('scored1');
    const s = await call('POST', '/api/sessions', player, { gameId: 'logic-lock', difficulty: 'easy' });
    await call('POST', `/api/sessions/${s.body.sessionId}/submit`, player, { actions: [{ t: 10, end: true }] });
    expect(db().get<any>('SELECT bot_score FROM game_sessions WHERE id = ?', s.body.sessionId).bot_score).toBe(0);
  });
});
