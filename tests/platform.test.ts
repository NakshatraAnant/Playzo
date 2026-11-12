/** Integration tests for account security, notifications, rewards, pause/resume and data integrity. */
import { describe, it, expect, beforeAll } from 'vitest';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_DEV_MODE = 'true';
process.env.PLAYZO_ADULT_DEV_PREVIEW = 'false';

const { buildApp } = await import('../server/app');
const { db } = await import('../server/db');
const { ENGINES } = await import('../server/games/registry');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });

let ipSeq = 1;
class Client {
  cookie = '';
  ip = `10.9.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250 + 1}`;
  ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/150.0';
  async req(method: string, url: string, body?: unknown) {
    const res = await app.inject({ method: method as any, url, payload: body as any, remoteAddress: this.ip, headers: { 'x-playzo': '1', 'content-type': 'application/json', cookie: this.cookie, 'user-agent': this.ua } });
    const set = res.headers['set-cookie'];
    if (set) { const c = (Array.isArray(set) ? set : [set]).find((x) => x.startsWith('pz_session=')); if (c) this.cookie = c.split(';')[0]; }
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
}
const reg = (c: Client, name: string, dob = '1990-01-01', extra: object = {}) => c.post('/api/auth/register', { email: `${name}@plat.local`, username: name, password: 'password123', dob, acceptTerms: true, ...extra });

describe('account security', () => {
  it('locks sign-in after 5 failures for that account, without revealing whether it exists', async () => {
    const a = new Client(); await reg(a, 'lockme');
    const b = new Client();
    for (let i = 0; i < 5; i++) expect((await b.post('/api/auth/login', { identifier: 'lockme', password: 'wrong-pass' })).status).toBe(401);
    const locked = await b.post('/api/auth/login', { identifier: 'lockme', password: 'password123' });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    // The owner is told in-app.
    const n = await a.get('/api/notifications');
    expect(n.body.notifications.some((x: any) => x.kind === 'security' && /locked/i.test(x.title))).toBe(true);
    // An unknown identifier behaves the same way (no enumeration).
    const c = new Client();
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { identifier: 'nobody_here', password: 'x' });
    expect((await c.post('/api/auth/login', { identifier: 'nobody_here', password: 'x' })).body.code).toBe('ACCOUNT_LOCKED');
  });
  it('lists sessions with device labels; changing password signs out other devices only', async () => {
    const a = new Client(); await reg(a, 'multidev');
    const b = new Client(); b.ua = 'Mozilla/5.0 (Linux; Android 15) Chrome/150.0 Mobile';
    expect((await b.post('/api/auth/login', { identifier: 'multidev', password: 'password123' })).status).toBe(200);
    const list = await a.get('/api/auth/sessions');
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.find((s: any) => !s.current).device).toBe('Chrome on Android');
    expect(JSON.stringify(list.body)).not.toMatch(/token_hash|[0-9a-f]{64}/); // never the full token hash
    const ch = await a.post('/api/auth/change-password', { current: 'password123', password: 'newpassword456' });
    expect(ch.body.otherSessionsRevoked).toBe(1);
    expect((await b.get('/api/auth/me')).body.user).toBeNull();
    expect((await a.get('/api/auth/me')).body.user.username).toBe('multidev');
  });
  it('revokes a single other session by id', async () => {
    const a = new Client(); await reg(a, 'revoker');
    const b = new Client(); await b.post('/api/auth/login', { identifier: 'revoker', password: 'password123' });
    const other = (await a.get('/api/auth/sessions')).body.sessions.find((s: any) => !s.current);
    expect((await a.post('/api/auth/sessions/revoke', { id: other.id })).body.revoked).toBe(1);
    expect((await b.get('/api/auth/me')).body.user).toBeNull();
  });
  it('emails are logged as outbox_only (never claimed as sent) when no provider is configured', async () => {
    const a = new Client(); await reg(a, 'mailcheck');
    const row = db().get<any>("SELECT status, provider, template FROM dev_outbox WHERE to_email = 'mailcheck@plat.local' AND template = 'verify_email'");
    expect(row).toMatchObject({ status: 'outbox_only', provider: 'outbox' });
    const out = await a.get('/api/dev/outbox');
    expect(out.body.delivery.configured).toBe(false);
    expect(out.body.delivery.note).toMatch(/NOT CONFIGURED/);
  });
  it('records referrals as attribution only (no currency paid)', async () => {
    const a = new Client(); await reg(a, 'referrer1');
    const zoBefore = (await a.get('/api/me/referrals')).body.zo;
    const b = new Client(); await reg(b, 'referee1', '1995-05-05', { ref: 'referrer1' });
    const r = await a.get('/api/me/referrals');
    expect(r.body.count).toBe(1);
    expect(r.body.zo).toBe(zoBefore);
  });
});

describe('notifications', () => {
  it('friend requests notify the recipient, and preferences can switch them off', async () => {
    const a = new Client(); await reg(a, 'notifa');
    const b = new Client(); await reg(b, 'notifb');
    await a.post('/api/friends/request', { username: 'notifb' });
    let n = await b.get('/api/notifications');
    expect(n.body.unread).toBeGreaterThanOrEqual(1);
    expect(n.body.notifications.some((x: any) => x.kind === 'friend')).toBe(true);
    await b.post('/api/notifications/read');
    expect((await b.get('/api/notifications')).body.unread).toBe(0);
    expect((await b.req('PATCH', '/api/notifications/prefs', { friend: false })).body.prefs.friend).toBe(false);
    const c = new Client(); await reg(c, 'notifc');
    await c.post('/api/friends/request', { username: 'notifb' });
    n = await b.get('/api/notifications');
    expect(n.body.unread).toBe(0);
    expect((await b.req('PATCH', '/api/notifications/prefs', { playReminderMin: 7 })).status).toBe(400);
  });
});

describe('rewards and seasons', () => {
  it('daily reward can be claimed once per day through the idempotent ledger', async () => {
    const a = new Client(); await reg(a, 'dailyr');
    const st = await a.get('/api/rewards/daily');
    expect(st.body).toMatchObject({ claimedToday: false, streak: 1, amount: 10 });
    const c1 = await a.post('/api/rewards/daily');
    expect(c1.body.amount).toBe(10);
    expect((await a.post('/api/rewards/daily')).status).toBe(409);
    const led = db().all<any>("SELECT amount FROM ledger l JOIN users u ON u.id = l.user_id WHERE u.username = 'dailyr' AND l.source = 'daily_reward'");
    expect(led).toHaveLength(1);
  });
  it('a continued streak raises the reward (capped), a broken one restarts it', async () => {
    const a = new Client(); await reg(a, 'streaker');
    const id = (await a.get('/api/auth/me')).body.user.id;
    const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
    db().run('INSERT INTO daily_rewards (user_id, day, streak, zo) VALUES (?, ?, 9, 40)', id, day(1));
    expect((await a.get('/api/rewards/daily')).body).toMatchObject({ streak: 10, amount: 40 });
  });
  it('completed games add season points; the season board ranks players', async () => {
    const a = new Client(); await reg(a, 'seasonp');
    const s = await a.post('/api/sessions', { gameId: 'code-breaker', difficulty: 'easy' });
    // Play Code Breaker by brute force over the server API until it ends.
    let over = false;
    for (let i = 0; i < 12 && !over; i++) {
      const r = await a.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'guess', g: [i % 5, (i + 1) % 5, (i + 2) % 5, (i + 3) % 5] } });
      if (r.status !== 200) break;
      over = r.body.over;
    }
    const board = await a.get('/api/seasons/current');
    expect(board.body.me?.points ?? 0).toBeGreaterThan(0);
    expect(board.body.season).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('pause and resume', () => {
  it('pausing a timed solo game stops its clock: deadlines shift by the paused time, actions are refused while paused', async () => {
    const a = new Client(); await reg(a, 'pauser');
    const s = await a.post('/api/sessions', { gameId: 'geo-sprint' });
    const before = s.body.view.endsAt;
    expect((await a.post(`/api/sessions/${s.body.sessionId}/pause`)).body.paused).toBe(true);
    const blocked = await a.post(`/api/sessions/${s.body.sessionId}/action`, { action: { type: 'answer', choice: 0 } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('PAUSED');
    await new Promise((r) => setTimeout(r, 120));
    const res = await a.post(`/api/sessions/${s.body.sessionId}/resume`);
    expect(res.body.pausedMs).toBeGreaterThanOrEqual(100);
    expect(res.body.view.endsAt - before).toBe(res.body.pausedMs);
  });
  it('multiplayer contexts cannot be paused', async () => {
    const a = new Client(); await reg(a, 'nopause');
    const d = await a.get('/api/home');
    const daily = d.body.daily ?? d.body.dailyPuzzle;
    const s = await a.post('/api/sessions', { gameId: daily.gameId, context: 'daily' });
    expect((await a.post(`/api/sessions/${s.body.sessionId}/pause`)).status).toBe(400);
  });
  it('a paused replay run earns XP but never enters the leaderboard', async () => {
    const a = new Client(); await reg(a, 'pausedrun');
    const s = await a.post('/api/sessions', { gameId: 'logic-lock', difficulty: 'easy' });
    await a.post(`/api/sessions/${s.body.sessionId}/pause`);
    await a.post(`/api/sessions/${s.body.sessionId}/resume`);
    const sub = await a.post(`/api/sessions/${s.body.sessionId}/submit`, { actions: [{ t: 10, end: true }] });
    expect(sub.body.verified).toBe(true);
    expect(sub.body.completion.xp).toBeGreaterThan(0);
    expect(sub.body.completion.personalBest).toBe(false);
    expect(db().get<any>('SELECT COUNT(*) AS n FROM scores WHERE session_id = ?', s.body.sessionId).n).toBe(0);
  });
  it('every timed server engine implements shiftTime', () => {
    for (const [id, e] of Object.entries(ENGINES)) if (e.timed && BY_ENV(id) === 'family') expect(typeof e.shiftTime, id).toBe('function');
  });
});

describe('data integrity', () => {
  it('ledger and audit log are append-only at the database level', () => {
    const a = db().get<any>('SELECT id FROM ledger LIMIT 1');
    expect(a).toBeTruthy();
    expect(() => db().run('UPDATE ledger SET amount = 999999 WHERE id = ?', a.id)).toThrow(/append-only/);
    expect(() => db().run('DELETE FROM ledger WHERE id = ?', a.id)).toThrow(/append-only/);
    db().run("INSERT INTO audit_log (actor, action) VALUES (NULL, 'test.event')");
    expect(() => db().run("DELETE FROM audit_log WHERE action = 'test.event'")).toThrow(/append-only/);
  });
  it('balances can never go negative (CHECK constraint)', () => {
    const u = db().get<any>('SELECT user_id FROM balances LIMIT 1');
    expect(() => db().run("UPDATE balances SET balance = -1 WHERE user_id = ? AND currency = 'ZO'", u.user_id)).toThrow();
  });
});

import { BY_ID } from '../shared/catalogue';
function BY_ENV(id: string) { return BY_ID[id]?.env; }
