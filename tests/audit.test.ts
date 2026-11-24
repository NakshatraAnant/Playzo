/** Regression tests for the November 2026 production audit. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_DEV_MODE = 'true';
const { buildApp } = await import('../server/app');
const { config, configProblems } = await import('../server/config');
const { db, nowIso } = await import('../server/db');
const { ENGINES } = await import('../server/games/registry');
const { SeededRng } = await import('../shared/rng');
const { GameError } = await import('../shared/engine');
const { REPLAY_ENGINES } = await import('../shared/games');
const { runHousekeeping } = await import('../server/housekeeping');
const { streak } = await import('../server/progression');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });
afterAll(() => app.close());
let ip = 1;
class C {
  cookie = ''; ip = `10.77.0.${ip++}`;
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const r = await app.inject({ method: method as any, url, payload: body as any, remoteAddress: this.ip, headers: { 'x-playzo': '1', cookie: this.cookie, ...headers } });
    const set = [r.headers['set-cookie']].flat().find((x) => String(x).startsWith('pz_session='));
    if (set) this.cookie = String(set).split(';')[0];
    let j: any = null;
    try { j = JSON.parse(r.body); } catch { /* not json */ }
    return { status: r.statusCode, body: j, headers: r.headers };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
}
const reg = async (name: string, dob = '1990-01-01') => {
  const c = new C();
  const r = await c.post('/api/auth/register', { email: `${name}@audit.test`, username: name, password: 'password123', dob, acceptTerms: true });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return Object.assign(c, { id: r.body.user.id as string });
};

describe('engines', () => {
  it('Party Chaos question generation always terminates with 4 distinct non-negative answers', () => {
    for (let n = 0; n < 5000; n++) {
      const s = ENGINES['party-chaos'].init({ players: ['p1'], difficulty: 'normal' }, { rng: new SeededRng(`s${n}`), now: 0, player: 'p1' });
      const sum = s.qs.find((q: any) => q.tag === 'Quick Sum');
      if (sum) expect(sum.options.every((o: string) => Number(o) >= 0)).toBe(true);
      for (const q of s.qs) if (q.tag !== 'Odd One Out') expect(new Set(q.options).size).toBe(4);
    }
  });
  const fresh = (id: string) => REPLAY_ENGINES[id].init({ players: ['p1'], difficulty: 'normal', seed: 'x' }, { rng: new SeededRng('x'), now: 0, player: 'p1' });
  const ctx = { rng: new SeededRng('x'), now: 3000, player: 'p1' };
  it('refuses placements, targets, towers and directions that are not real', () => {
    const cases: [string, object][] = [['block-battle', { p: 0, r: 0, c: 0.5 }], ['block-battle', { p: 'length', r: 0, c: 0 }], ['reflex-arena', { i: 'length' }], ['tower-tactics', { type: 'build', x: 0, y: 0, kind: 'constructor' }], ['mind-maze', { d: 'constructor' }]];
    for (const [id, a] of cases) expect(() => REPLAY_ENGINES[id].apply(fresh(id), { t: 3000, ...a }, ctx), id).toThrow(GameError);
  });
  it('quitting Tower Tactics at once scores nothing', () => {
    const e = REPLAY_ENGINES['tower-tactics'];
    expect(e.result(e.apply(fresh('tower-tactics'), { t: 1, type: 'end' }, ctx)).scores.p1).toBe(0);
  });
});

describe('HTTP hardening', () => {
  it('CSRF protection cannot be skipped with an encoded path', async () => {
    const r = await app.inject({ method: 'POST', url: '/%61pi/auth/guest', payload: {} });
    expect(r.statusCode).toBe(403);
  });
  it('never answers 500 to malformed input, and never caches API responses', async () => {
    const c = await reg('malformed');
    const cases: [string, object][] = [['/api/sessions', { gameId: {} }], ['/api/sessions', { gameId: 'constructor' }], ['/api/sessions', { gameId: 'chess-blitz', ref: {} }], ['/api/shop/buy', { itemId: 'constructor' }], ['/api/friends/request', { username: {} }], ['/api/block', { userId: 'u_missing' }], ['/api/missions/nope/claim', {}], ['/api/auth/age-assurance', { method: 'constructor' }], ['/api/rooms', { gameId: 'constructor' }]];
    for (const [u, b] of cases) {
      const r = await c.post(u, b);
      expect(r.status, `${u} ${JSON.stringify(b)} -> ${JSON.stringify(r.body)}`).toBeLessThan(500);
    }
    const s = await c.post('/api/sessions', { gameId: 'number-rush' });
    expect((await c.post(`/api/sessions/${s.body.sessionId}/submit`, { actions: [null] })).status).toBe(422);
    expect((await c.get('/api/games/constructor')).status).toBe(404);
    expect((await c.get('/api/auth/me')).headers['cache-control']).toBe('no-store');
    expect((await c.req('POST', '/api/auth/logout', '<x/>', { 'content-type': 'text/xml' })).status).toBe(415);
  });
  it('rejects dates that do not exist', async () => {
    expect((await new C().post('/api/auth/age-check', { dob: '2000-02-31' })).status).toBe(400);
  });
  it('sign-in limits are per address, so new guest accounts do not reset them', async () => {
    const c = new C();
    let limited = false;
    for (let i = 0; i < 14; i++) {
      c.cookie = '';
      await c.post('/api/auth/guest');
      const r = await c.post('/api/auth/login', { identifier: `nobody${i}`, password: 'x' });
      if (r.body.code === 'RATE_LIMITED') limited = true;
    }
    expect(limited).toBe(true);
  });
});

describe('accounts', () => {
  it('a too-short new password does not use up the reset link, and one reset kills the others', async () => {
    const c = await reg('resetter');
    for (let i = 0; i < 2; i++) await c.post('/api/auth/forgot', { email: 'resetter@audit.test' });
    const links = db().all<any>("SELECT body FROM dev_outbox WHERE template = 'reset_password' AND user_id = ? ORDER BY id", c.id).map((m) => m.body.match(/token=(\S+)/)[1]);
    const o = new C();
    expect((await o.post('/api/auth/reset', { token: links[0], password: 'short' })).status).toBe(400);
    expect((await o.post('/api/auth/reset', { token: links[0], password: 'a-new-password' })).status).toBe(200);
    expect((await o.post('/api/auth/reset', { token: links[1], password: 'another-password' })).status).toBe(400);
  });
  it('age bands follow birthdays', async () => {
    const c = await reg('birthday');
    db().run("UPDATE users SET age_band = 'teen' WHERE id = ?", c.id); // as stored years ago, at sign-up
    expect((await c.get('/api/auth/me')).body.user.ageBand).toBe('adult');
  });
  it('accounts without a password can be deleted after a recent sign-in only, and leave no personal rows', async () => {
    const c = await reg('oauthonly');
    await c.post('/api/support', { kind: 'help', subject: 'Hello there', message: 'A message with details' });
    db().run('UPDATE users SET password_hash = NULL WHERE id = ?', c.id);
    db().run('UPDATE auth_sessions SET created_at = ? WHERE user_id = ?', new Date(Date.now() - 3600_000).toISOString(), c.id);
    expect((await c.post('/api/auth/delete-account', { confirm: 'DELETE' })).body.code).toBe('REAUTH_REQUIRED');
    db().run('UPDATE auth_sessions SET created_at = ? WHERE user_id = ?', nowIso(), c.id);
    expect((await c.post('/api/auth/delete-account', { confirm: 'DELETE' })).status).toBe(200);
    expect(db().get('SELECT 1 FROM dev_outbox WHERE user_id = ?', c.id)).toBeUndefined();
    expect(db().get("SELECT 1 FROM support_tickets WHERE subject = 'Hello there'")).toBeUndefined();
  });
  it('a Lounge cool-off can be extended but never shortened', async () => {
    const c = await reg('cooloff');
    await c.req('PATCH', '/api/auth/profile', { loungeCooloffDays: 30 });
    const until = () => db().get<any>('SELECT lounge_cooloff_until AS x FROM users WHERE id = ?', c.id).x;
    const long = until();
    expect(long).toBeTruthy();
    await c.req('PATCH', '/api/auth/profile', { loungeCooloffDays: 1 });
    expect(until()).toBe(long);
  });
  it('guests start with free avatars only', async () => {
    for (let i = 0; i < 20; i++) expect((await new C().post('/api/auth/guest')).body.user.avatar).toMatch(/^orb-[1-6]$/);
  });
});

describe('staff and social', () => {
  it('support staff cannot act on admins; nobody can change their own role or status', async () => {
    const admin = await reg('boss'), sup = await reg('helper');
    db().run("UPDATE users SET role = 'admin' WHERE id = ?", admin.id);
    db().run("UPDATE users SET role = 'support' WHERE id = ?", sup.id);
    expect((await sup.post(`/api/admin/users/${admin.id}/status`, { status: 'suspended' })).status).toBe(403);
    expect((await sup.post(`/api/admin/users/${admin.id}/revoke-sessions`)).status).toBe(403);
    expect((await admin.post(`/api/admin/users/${admin.id}/role`, { role: 'user' })).status).toBe(403);
    expect((await admin.post(`/api/admin/users/${admin.id}/status`, { status: 'suspended' })).status).toBe(403);
    expect((await admin.post('/api/admin/users/u_missing/role', { role: 'tester' })).status).toBe(404);
    expect((await admin.post('/api/admin/users/u_missing/adjust', { amount: 5, reason: 'testing' })).status).toBe(404);
  });
  it('repeating a friend request notifies once', async () => {
    const a = await reg('asker'), b = await reg('asked');
    for (let i = 0; i < 3; i++) expect((await a.post('/api/friends/request', { userId: b.id })).body.status).toBe('pending');
    expect(db().get<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'friend'", b.id).n).toBe(1);
  });
  it('expired challenges say so; games in maintenance cannot host rooms; hidden games leave the home page', async () => {
    const a = await reg('challenger');
    const id = (await a.post('/api/challenges', { gameId: 'logic-lock' })).body.id;
    db().run("UPDATE challenges SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", id);
    expect((await a.get(`/api/challenges/${id}`)).body.challenge.status).toBe('expired');
    db().run("INSERT INTO game_settings (game_id, status) VALUES ('chess-blitz', 'maintenance')");
    expect((await a.post('/api/rooms', { gameId: 'chess-blitz' })).status).toBe(503);
    db().run("UPDATE game_settings SET status = 'hidden' WHERE game_id = 'chess-blitz'");
    expect(JSON.stringify((await a.get('/api/home')).body)).not.toContain('"title":"Chess Blitz"');
    db().run("DELETE FROM game_settings WHERE game_id = 'chess-blitz'");
  });
  it('streaks ignore Lounge sessions', async () => {
    const a = await reg('streaker');
    db().run("INSERT INTO game_sessions (id,user_id,game_id,env,mode,status,difficulty,seed,seed_commit,rules_version,started_ms) VALUES ('s_l1',?,'plinko','lounge','server','completed','normal','x','x','1',1)", a.id);
    expect(streak(a.id)).toBe(0);
  });
});

describe('operations', () => {
  it('refuses unsafe production and development configurations', () => {
    const base = { ...config, production: true, publicUrl: 'https://playzo.example', localPublicUrl: false, host: '0.0.0.0', adminEmail: '', adminPassword: '', email: { provider: 'resend' as const, from: 'a@b.c', resendApiKey: 'k' } };
    expect(configProblems(base)).toEqual({ errors: [], warnings: [] });
    expect(configProblems({ ...base, publicUrl: 'http://playzo.example' }).errors).toHaveLength(1);
    expect(configProblems({ ...base, adminEmail: 'a@b.c', adminPassword: 'short' }).errors).toHaveLength(1);
    expect(configProblems({ ...base, production: false }).errors).toHaveLength(1);
    expect(configProblems({ ...base, email: { provider: 'outbox', from: '', resendApiKey: '' } }).warnings).toHaveLength(1);
  });
  it('housekeeping removes expired sessions and keeps live ones', async () => {
    const a = await reg('keeper');
    db().run("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ('old', ?, '2020-01-01T00:00:00.000Z')", a.id);
    expect(runHousekeeping().auth_sessions).toBeGreaterThanOrEqual(1);
    expect((await a.get('/api/auth/me')).body.user.id).toBe(a.id);
  });
  it('emails go out once even if the retry worker overlaps, and delivered bodies are not kept', async () => {
    const email = await import('../server/email');
    const old = { ...config.email };
    Object.assign(config.email, { provider: 'resend', from: 'a@b.c', resendApiKey: 'k' });
    const sent: any[] = [];
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u: any, o: any) => { sent.push(JSON.parse(o.body)); await new Promise((r) => setTimeout(r, 30)); return new Response('{"id":"1"}', { status: 200 }); });
    const id = email.sendEmail('x@audit.test', 'reset_password', { url: 'https://p.test/reset?token=secret' });
    email.retryDueEmails();
    await new Promise((r) => setTimeout(r, 120));
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('href="https://p.test/reset?token=secret"');
    expect(db().get<any>('SELECT status, body FROM dev_outbox WHERE id = ?', id)).toMatchObject({ status: 'sent', body: '[delivered]' });
    f.mockRestore();
    Object.assign(config.email, old);
  });
});
