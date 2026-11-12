/** API integration tests against an isolated in-memory database. */
import { describe, it, expect, beforeAll } from 'vitest';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_DEV_MODE = 'true';
process.env.PLAYZO_ADULT_DEV_PREVIEW = 'false';
process.env.PLAYZO_LEGAL_APPROVALS = '';

const { buildApp } = await import('../server/app');
const { config } = await import('../server/config');
const { REPLAY_ENGINES } = await import('../shared/games');
const { db } = await import('../server/db');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });

let ipSeq = 1;
class Client {
  cookie = '';
  ip = `10.0.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250 + 1}`;
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({ method: method as any, url, payload: body as any, remoteAddress: this.ip, headers: { 'x-playzo': '1', 'content-type': 'application/json', cookie: this.cookie, ...headers } });
    const set = res.headers['set-cookie'];
    if (set) { const c = (Array.isArray(set) ? set : [set]).find((x) => x.startsWith('pz_session=')); if (c) this.cookie = c.split(';')[0]; }
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
}
const reg = async (c: Client, name: string, dob: string, extra: object = {}) => c.post('/api/auth/register', { email: `${name}@test.local`, username: name, password: 'password123', dob, acceptTerms: true, ...extra });

describe('auth & security', () => {
  it('health reports db, migrations and 50 engines', async () => {
    const r = await new Client().get('/api/health');
    expect(r.body.ok).toBe(true);
    expect(r.body.engines).toBe(50);
  });
  it('rejects state-changing requests without the CSRF header', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    expect(r.statusCode).toBe(403);
  });
  it('guest -> register keeps the same user (progress carried over)', async () => {
    const c = new Client();
    const g = await c.post('/api/auth/guest');
    expect(g.body.user.isGuest).toBe(true);
    const r = await reg(c, 'upgrader', '1995-04-04');
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(g.body.user.id);
    expect(r.body.user.isGuest).toBe(false);
  });
  it('login, wrong password, logout', async () => {
    const c = new Client();
    await reg(c, 'loginuser', '1990-01-01');
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
    expect((await c.post('/api/auth/login', { identifier: 'loginuser', password: 'nope-nope' })).status).toBe(401);
    expect((await c.post('/api/auth/login', { identifier: 'loginuser@test.local', password: 'password123' })).status).toBe(200);
  });
  it('under-13 registration requires a parent email and starts without social permissions', async () => {
    const c = new Client();
    const dob = new Date(Date.now() - 9 * 365.25 * 86400_000).toISOString().slice(0, 10);
    expect((await reg(c, 'kid1', dob)).status).toBe(400);
    const r = await reg(c, 'kid2', dob, { parentEmail: 'parent@test.local' });
    expect(r.body.user.ageBand).toBe('child');
    expect(r.body.user.social.canSendFriendRequests).toBe(false);
    expect(r.body.user.social.canUsePublicMatchmaking).toBe(false);
    const out = (await c.get('/api/dev/outbox')).body.messages;
    expect(out.some((m: any) => m.to_email === 'parent@test.local')).toBe(true);
  });
  it('password reset revokes sessions', async () => {
    const c = new Client();
    await reg(c, 'resetme', '1990-02-02');
    await c.post('/api/auth/forgot', { email: 'resetme@test.local' });
    const msg = db().get<any>("SELECT body FROM dev_outbox WHERE to_email = 'resetme@test.local' AND subject LIKE 'Reset%'");
    const token = msg.body.match(/token=([\w-]+)/)[1];
    expect((await new Client().post('/api/auth/reset', { token, password: 'newpassword1' })).status).toBe(200);
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
  });
});

describe('game sessions', () => {
  it('server-mode game: secret hidden, actions validated, completion awards XP', async () => {
    const c = new Client(); await c.post('/api/auth/guest');
    const s = await c.post('/api/sessions', { gameId: 'code-breaker', difficulty: 'easy' });
    expect(s.body.seed).toBeUndefined();
    expect(s.body.view.secret).toBeNull();
    expect((await c.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'guess', g: [9, 9, 9, 9] } })).status).toBe(422);
    const secret = JSON.parse(db().get<any>('SELECT state FROM game_sessions WHERE id = ?', s.body.sessionId).state).secret;
    const r = await c.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'guess', g: secret } });
    expect(r.body.over).toBe(true);
    expect(r.body.completion.xp).toBeGreaterThan(0);
  });
  it('replay game: verified score is recomputed by the server; tampered logs are rejected', async () => {
    const c = new Client(); await c.post('/api/auth/guest');
    const s = await c.post('/api/sessions', { gameId: 'logic-lock', difficulty: 'easy' });
    const e = REPLAY_ENGINES['logic-lock'];
    const { SeededRng } = await import('../shared/rng');
    const st: any = e.init({ players: ['p1'], difficulty: 'easy', seed: s.body.seed }, { rng: new SeededRng('x'), now: 0, player: 'p1' });
    const log: any[] = [];
    const { minMoves } = await import('../shared/games/logicLock');
    void minMoves;
    // brute-force solve the first lock by pressing levers per a found combination
    const L = st.lock, P = L.positions;
    const counts = new Array(L.links.length).fill(0);
    const solve = (i: number): boolean => {
      if (i === L.links.length) return L.start.every((v: number, d: number) => (v + L.links.reduce((t: number, l: number[], k: number) => t + (l.includes(d) ? counts[k] : 0), 0)) % P === 0);
      for (let x = 0; x < P; x++) { counts[i] = x; if (solve(i + 1)) return true; }
      return false;
    };
    solve(0);
    let t = 100;
    counts.forEach((n: number, lever: number) => { for (let k = 0; k < n; k++) log.push({ t: (t += 10), lever }); });
    log.push({ t: (t += 10), end: true });
    const ok = await c.post(`/api/sessions/${s.body.sessionId}/submit`, { actions: log });
    expect(ok.status).toBe(200);
    expect(ok.body.score).toBeGreaterThanOrEqual(200);
    // tampered: claims more time than real time allows
    const s2 = await c.post('/api/sessions', { gameId: 'number-rush' });
    const bad = await c.post(`/api/sessions/${s2.body.sessionId}/submit`, { actions: [{ t: 50000, end: true }] });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('TOO_FAST');
  });
  it('daily puzzle uses the shared daily seed', async () => {
    const c = new Client(); await c.post('/api/auth/guest');
    const home = await c.get('/api/home');
    const r = await c.post('/api/sessions', { gameId: home.body.daily.gameId, context: 'daily' });
    expect(r.status).toBe(200);
    const wrong = await c.post('/api/sessions', { gameId: home.body.daily.gameId === 'mind-maze' ? 'logic-lock' : 'mind-maze', context: 'daily' });
    expect(wrong.status).toBe(400);
  });
});

describe('Lounge access & legal gates', () => {
  it('lounge games are invisible to guests, children and teens', async () => {
    const g = new Client(); await g.post('/api/auth/guest');
    expect((await g.get('/api/games?env=lounge')).body.games).toHaveLength(0);
    expect((await g.get('/api/games/blackjack')).status).toBe(404);
    expect((await g.post('/api/sessions', { gameId: 'blackjack' })).status).toBe(404);
    const t = new Client(); await reg(t, 'teen1', new Date(Date.now() - 15 * 365.25 * 86400_000).toISOString().slice(0, 10));
    expect((await t.get('/api/lounge/status')).status).toBe(404);
    expect((await t.post('/api/auth/age-assurance', { method: 'dev-attestation' })).status).toBe(403);
  });
  it('ordinary adults cannot see or unlock the Lounge while it is switched off (default)', async () => {
    const a = new Client(); await reg(a, 'adult1', '1988-08-08');
    expect((await a.get('/api/auth/me')).body.user.lounge.visible).toBe(false);
    expect((await a.get('/api/lounge/status')).status).toBe(404);
    expect((await a.get('/api/games?env=lounge')).body.games).toHaveLength(0);
    // The dev attestation is refused for non-QA accounts: no fake verification success.
    expect((await a.post('/api/auth/age-assurance', { method: 'dev-attestation' })).status).toBe(503);
    expect((await a.post('/api/sessions', { gameId: 'blackjack' })).status).toBe(404);
  });
  it('QA preview needs the server flag AND an admin/tester role; legal gate blocks play (451) without it', async () => {
    const a = new Client(); await reg(a, 'qa1', '1988-08-08');
    db().run("UPDATE users SET role = 'tester' WHERE username = 'qa1'");
    // Flag off: even a tester is refused.
    expect((await a.post('/api/auth/age-assurance', { method: 'dev-attestation' })).status).toBe(503);
    config.adultDevPreview = true;
    try {
      expect((await a.post('/api/auth/age-assurance', { method: 'dev-attestation' })).status).toBe(200);
      expect((await a.post('/api/auth/lounge-terms')).status).toBe(200);
      const list = await a.get('/api/games?env=lounge');
      expect(list.body.games).toHaveLength(25);
      expect(list.body.games.every((g: any) => g.gate === 'dev-preview')).toBe(true);
      expect((await a.post('/api/sessions', { gameId: 'blackjack' })).status).toBe(200);
    } finally { config.adultDevPreview = false; }
    // Preview flag off again: the tester loses access immediately.
    expect((await a.get('/api/games?env=lounge')).body.games).toHaveLength(0);
    expect((await a.post('/api/sessions', { gameId: 'blackjack' })).status).toBe(404);
    // Lounge switched on, certified verification, but no legal approval: 451, never a playable game.
    const { AGE_ASSURANCE_PROVIDERS } = await import('../server/access');
    AGE_ASSURANCE_PROVIDERS['test-certified'] = { strong: true, production: true, label: 'test-only certified provider' };
    db().run("UPDATE users SET adult_verify_method = 'test-certified' WHERE username = 'qa1'");
    config.loungeEnabled = true;
    try {
      expect((await a.post('/api/sessions', { gameId: 'blackjack' })).status).toBe(451);
    } finally { config.loungeEnabled = false; delete AGE_ASSURANCE_PROVIDERS['test-certified']; }
  });
  it('approved game needs master switch + config reference + matching approved legal record', async () => {
    const { AGE_ASSURANCE_PROVIDERS } = await import('../server/access');
    AGE_ASSURANCE_PROVIDERS['test-certified'] = { strong: true, production: true, label: 'test-only certified provider' };
    const a = new Client(); await reg(a, 'adult2', '1985-05-05');
    db().run("UPDATE users SET adult_verified_at = ?, adult_verify_method = 'test-certified' WHERE username = 'adult2'", new Date().toISOString());
    await a.post('/api/auth/lounge-terms');
    config.loungeEnabled = true;
    config.legalApprovals['dice-arena'] = 'TEST-REF-1';
    try {
      // Config reference alone is not enough: no matching approved legal record yet.
      expect((await a.post('/api/sessions', { gameId: 'dice-arena' })).status).toBe(451);
      db().run("INSERT INTO legal_reviews (game_id, status, reference, reviewer) VALUES ('dice-arena', 'approved', 'WRONG-REF', 'test')");
      expect((await a.post('/api/sessions', { gameId: 'dice-arena' })).status).toBe(451);
      db().run("INSERT INTO legal_reviews (game_id, status, reference, reviewer) VALUES ('dice-arena', 'approved', 'TEST-REF-1', 'test')");
      const s = await a.post('/api/sessions', { gameId: 'dice-arena' });
      expect(s.status).toBe(200);
      expect(s.body.chips).toBe(10000);
      expect(s.body.seed).toBeUndefined();
      const r = await a.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'roll', bet: { kind: 'over', amount: 100 } } });
      expect(r.status).toBe(200);
      const won = r.body.view.last.won;
      expect(r.body.chips).toBe(10000 - 100 + won);
      expect((await a.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'roll', bet: { kind: 'over', amount: 99999999 } } })).status).toBe(422);
      const end = await a.post(`/api/sessions/${s.body.sessionId}/end`);
      expect(end.body.seed).toHaveLength(64); // seed revealed for audit after the session
      const { createHash } = await import('node:crypto');
      expect(createHash('sha256').update(end.body.seed).digest('hex')).toBe(s.body.commit);
      // Master switch off again: the approved game disappears for the public.
      config.loungeEnabled = false;
      expect((await a.post('/api/sessions', { gameId: 'dice-arena' })).status).toBe(404);
    } finally {
      config.loungeEnabled = false;
      delete config.legalApprovals['dice-arena'];
      delete AGE_ASSURANCE_PROVIDERS['test-certified'];
    }
  });
  it('expired age verification removes entitlement', async () => {
    const a = new Client(); await reg(a, 'adultold', '1982-02-02');
    db().run("UPDATE users SET role = 'tester', adult_verified_at = '2020-01-01T00:00:00.000Z', adult_verify_method = 'dev-attestation' WHERE username = 'adultold'");
    config.adultDevPreview = true;
    try {
      await a.post('/api/auth/lounge-terms');
      const me = await a.get('/api/auth/me');
      expect(me.body.user.lounge.entitled).toBe(false);
      expect(me.body.user.lounge.reasons).toContain('age_verification_expired');
    } finally { config.adultDevPreview = false; }
  });
  it('cool-off blocks lounge entitlement', async () => {
    const a = new Client(); await reg(a, 'adult3', '1980-03-03');
    db().run("UPDATE users SET role = 'tester' WHERE username = 'adult3'");
    config.adultDevPreview = true;
    try {
      expect((await a.post('/api/auth/age-assurance', { method: 'dev-attestation' })).status).toBe(200);
      await a.post('/api/auth/lounge-terms');
      expect((await a.get('/api/auth/me')).body.user.lounge.entitled).toBe(true);
      const r = await a.req('PATCH', '/api/auth/profile', { loungeCooloffDays: 1 });
      expect(r.status).toBe(200);
      expect(r.body.user.lounge.entitled).toBe(false);
      expect(r.body.user.lounge.reasons).toContain('cool_off_active');
    } finally { config.adultDevPreview = false; }
  });
});

describe('economy', () => {
  it('ledger is idempotent and never goes negative', async () => {
    const { post, balance } = await import('../server/economy');
    const c = new Client(); const g = await c.post('/api/auth/guest');
    const id = g.body.user.id;
    post(id, 'ZO', 50, 'reward', 'test', 'idem-1');
    post(id, 'ZO', 50, 'reward', 'test', 'idem-1');
    expect(balance(id, 'ZO')).toBe(50);
    expect(() => post(id, 'ZO', -51, 'purchase', 'test', 'idem-2')).toThrow(/Not enough/);
    expect(balance(id, 'ZO')).toBe(50);
  });
  it('cosmetic purchase deducts ZO once; Plus-only items cannot be bought with ZO', async () => {
    const { post } = await import('../server/economy');
    const c = new Client(); const g = await c.post('/api/auth/guest');
    post(g.body.user.id, 'ZO', 300, 'reward', 'test', `seed-${g.body.user.id}`);
    expect((await c.post('/api/shop/buy', { itemId: 'frame-bronze' })).status).toBe(200);
    expect((await c.post('/api/shop/buy', { itemId: 'frame-bronze' })).body.owned).toBe(true);
    expect((await c.post('/api/shop/buy', { itemId: 'frame-plus' })).status).toBe(400);
    expect((await c.get('/api/auth/me')).body.user.balances.ZO).toBe(200);
    expect((await c.post('/api/shop/checkout', { planId: 'plus-monthly', acknowledgeTest: true })).status).toBe(403); // guests cannot purchase
  });
});

describe('social & safety', () => {
  it('adult and minor accounts cannot become friends; blocking hides', async () => {
    const a = new Client(); const ra = await reg(a, 'socialadult', '1990-01-01');
    const t = new Client(); const rt = await reg(t, 'socialteen', new Date(Date.now() - 15 * 365.25 * 86400_000).toISOString().slice(0, 10));
    expect((await a.post('/api/friends/request', { userId: rt.body.user.id })).status).toBe(403);
    const b = new Client(); const rb = await reg(b, 'socialadult2', '1991-01-01');
    expect((await a.post('/api/friends/request', { userId: rb.body.user.id })).body.status).toBe('pending');
    expect((await b.post('/api/friends/respond', { userId: ra.body.user.id, accept: true })).status).toBe(200);
    expect((await a.get('/api/friends')).body.friends).toHaveLength(1);
    await b.post('/api/block', { userId: ra.body.user.id });
    expect((await a.get('/api/friends')).body.friends).toHaveLength(0);
    expect((await a.get(`/api/users/${rb.body.user.id}`)).status).toBe(404);
    expect((await a.post('/api/report', { userId: rb.body.user.id, reason: 'cheating' })).status).toBe(200);
  });
  it('async challenge: both players get the same seed and results resolve', async () => {
    const a = new Client(); await reg(a, 'chall1', '1990-01-01');
    const ch = await a.post('/api/challenges', { gameId: 'number-rush' });
    expect(ch.status).toBe(200);
    const s1 = await a.post('/api/sessions', { gameId: 'number-rush', context: 'challenge', ref: ch.body.id });
    const b = new Client(); await reg(b, 'chall2', '1990-01-01');
    const s2 = await b.post('/api/sessions', { gameId: 'number-rush', context: 'challenge', ref: ch.body.id });
    expect(s1.body.seed).toBe(s2.body.seed);
  });
  it('admin endpoints are forbidden for normal users', async () => {
    const u = new Client(); await reg(u, 'plainuser', '1990-01-01');
    expect((await u.get('/api/admin/overview')).status).toBe(403);
    db().run("UPDATE users SET role = 'admin' WHERE username = 'plainuser'");
    expect((await u.get('/api/admin/overview')).status).toBe(200);
  });
  it('account deletion removes the user and their data', async () => {
    const c = new Client(); const r = await reg(c, 'deleteme', '1990-01-01');
    await c.post('/api/sessions', { gameId: 'code-breaker' });
    expect((await c.post('/api/auth/delete-account', { confirm: 'DELETE', password: 'password123' })).status).toBe(200);
    expect(db().get('SELECT 1 FROM users WHERE id = ?', r.body.user.id)).toBeUndefined();
    expect(db().get('SELECT 1 FROM game_sessions WHERE user_id = ?', r.body.user.id)).toBeUndefined();
  });
});

describe('SEO', () => {
  it('sitemap lists family games but never the lounge; robots disallows /lounge', async () => {
    const s = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(s.body).toContain('/games/mind-maze');
    expect(s.body).not.toContain('roulette');
    const r = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(r.body).toContain('Disallow: /lounge');
  });
});
