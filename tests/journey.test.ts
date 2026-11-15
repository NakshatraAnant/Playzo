/** Product-journey integration tests: onboarding data, home feed, support workflow, analytics, backup/restore. */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_DEV_MODE = 'true';
process.env.PLAYZO_RATE_LIMIT_MULTIPLIER = '10';

const { buildApp } = await import('../server/app');
const { db, applyPendingRestore, restoreRequestFile } = await import('../server/db');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });
let ipSeq = 1;
class Client {
  cookie = '';
  ip = `10.44.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250 + 1}`;
  async req(method: string, url: string, body?: unknown) {
    const res = await app.inject({ method: method as any, url, payload: body as any, remoteAddress: this.ip, headers: { 'x-playzo': '1', 'content-type': 'application/json', cookie: this.cookie } });
    const set = res.headers['set-cookie'];
    if (set) { const c = (Array.isArray(set) ? set : [set]).find((x) => x.startsWith('pz_session=')); if (c) this.cookie = c.split(';')[0]; }
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
}
const reg = (c: Client, name: string, extra: object = {}) => c.post('/api/auth/register', { email: `${name}@j.local`, username: name, password: 'password123', dob: '1992-03-03', acceptTerms: true, ...extra });
const staff = async (name: string, role = 'admin') => { const c = new Client(); await reg(c, name); db().run('UPDATE users SET role = ? WHERE username = ?', role, name); return c; };

describe('onboarding and personalisation', () => {
  it('stores the chosen avatar and game tastes, and recommendations follow the tastes', async () => {
    const c = new Client();
    const r = await reg(c, 'tasty', { avatar: 'orb-4', preferences: ['strategy', 'not-a-category', 'strategy'] });
    expect(r.body.user.avatar).toBe('orb-4');
    expect(r.body.user.preferences).toEqual(['strategy']);
    const home = await c.get('/api/home');
    const strategyIds = ['chess-blitz', 'territory-wars', 'hex-conquest', 'connect-five', 'tower-tactics'];
    expect(strategyIds).toContain(home.body.recommended[0].id);
    const p = await c.req('PATCH', '/api/auth/profile', { preferences: ['word'], displayName: 'Word Nerd' });
    expect(p.body.user.preferences).toEqual(['word']);
    expect(p.body.user.displayName).toBe('Word Nerd');
    expect((await c.req('PATCH', '/api/auth/profile', { displayName: '<script>' })).status).toBe(400);
  });
  it('the home feed has every journey section and never invents popularity', async () => {
    const c = new Client(); await c.post('/api/auth/guest');
    const h = (await c.get('/api/home')).body;
    for (const k of ['popular', 'trending', 'quick', 'multiplayer', 'categories', 'featured', 'daily', 'recommended', 'community']) expect(h[k], k).toBeDefined();
    expect(h.quick.every((g: any) => g.minutes <= 3)).toBe(true);
    expect(h.categories.map((x: any) => x.key)).toEqual(['puzzle', 'word', 'trivia', 'strategy', 'arcade', 'reflex', 'party']);
    // Popular lists only games that were actually played; each card shows real distinct-player counts.
    for (const g of h.popular) expect(g.playersWeek).toBeGreaterThan(0);
    const s = await c.post('/api/sessions', { gameId: 'number-rush' });
    expect(s.status).toBe(200);
  });
});

describe('support workflow', () => {
  it('player opens a ticket, staff reply notifies them, statuses change, other players cannot see it', async () => {
    const p = new Client(); await reg(p, 'helpme');
    expect((await p.post('/api/support', { kind: 'bug', subject: 'Hi', message: 'short' })).status).toBe(400);
    const t = await p.post('/api/support', { kind: 'bug', subject: 'Board froze', message: 'The chess board froze after castling.' });
    expect(t.status).toBe(200);
    const mine = await p.get('/api/support');
    expect(mine.body.tickets[0]).toMatchObject({ subject: 'Board froze', status: 'open' });
    const other = new Client(); await reg(other, 'nosy');
    expect((await other.get(`/api/support/${t.body.id}`)).status).toBe(404);
    expect((await other.get('/api/admin/support')).status).toBe(403);
    const s = await staff('helper', 'support');
    const q = await s.get('/api/admin/support');
    expect(q.body.tickets.some((x: any) => x.id === t.body.id)).toBe(true);
    expect((await s.post(`/api/admin/support/${t.body.id}`, { message: 'Fixed in the latest build. Can you retry?' })).status).toBe(200);
    const view = await p.get(`/api/support/${t.body.id}`);
    expect(view.body.ticket.status).toBe('awaiting_user');
    expect(view.body.messages.at(-1)).toMatchObject({ staff: 1, author: 'PLAYZO Support' });
    const n = await p.get('/api/notifications');
    expect(n.body.notifications.some((x: any) => /Support replied/.test(x.title))).toBe(true);
    await p.post(`/api/support/${t.body.id}/reply`, { message: 'Works now, thanks!' });
    expect((await p.get(`/api/support/${t.body.id}`)).body.ticket.status).toBe('open');
    await s.post(`/api/admin/support/${t.body.id}`, { status: 'resolved' });
    await p.post(`/api/support/${t.body.id}/close`);
    expect((await p.post(`/api/support/${t.body.id}/reply`, { message: 'again' })).status).toBe(409);
    expect(db().get<any>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.support_update'").n).toBeGreaterThanOrEqual(2);
  });
  it('players can track reports they filed', async () => {
    const a = new Client(); await reg(a, 'reporter1');
    const b = new Client(); const rb = await reg(b, 'baduser1');
    await a.post('/api/report', { userId: rb.body.user.id, reason: 'harassment', details: 'spam emotes' });
    const r = await a.get('/api/support');
    expect(r.body.reports[0]).toMatchObject({ reason: 'harassment', status: 'open' });
  });
});

describe('analytics dashboard', () => {
  it('is staff-only and returns every journey metric', async () => {
    const plain = new Client(); await reg(plain, 'plainan');
    expect((await plain.get('/api/admin/analytics')).status).toBe(403);
    const s = await staff('analyst');
    await s.post('/api/events', { name: 'game_load', props: { game: 'number-rush', ms: 420 } });
    const r = await s.get('/api/admin/analytics?days=7');
    expect(r.status).toBe(200);
    expect(r.body.dayList).toHaveLength(7);
    for (const k of ['dau', 'wau', 'homeVisits', 'gameStarts', 'gameCompletions', 'guestToRegistration', 'firstGameCompletion', 'd1', 'd7', 'sessionsPerUser', 'gamesPerSession', 'roomsCreated', 'invitationAcceptance', 'challengeCompletion', 'gameLoadMs', 'crashFreeSessions', 'supportRequests']) expect(r.body.kpis[k], k).toBeDefined();
    expect(r.body.kpis.gameLoadMs.samples).toBeGreaterThanOrEqual(1);
    expect(r.body.kpis.supportRequests).toBeGreaterThanOrEqual(1);
  });
});

describe('notifications for progress', () => {
  it('unlocking an achievement creates an in-app notification', async () => {
    const c = new Client(); await reg(c, 'achiever');
    const s = await c.post('/api/sessions', { gameId: 'logic-lock', difficulty: 'easy' });
    await c.post(`/api/sessions/${s.body.sessionId}/submit`, { actions: [{ t: 10, end: true }] });
    const n = await c.get('/api/notifications');
    expect(n.body.notifications.some((x: any) => /Achievement unlocked/.test(x.title))).toBe(true);
  });
});

describe('backup and restore', () => {
  it('restore test verifies a backup; a staged restore replaces the database and keeps a safety copy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-restore-'));
    const dbPath = path.join(dir, 'playzo.db');
    const live = new DatabaseSync(dbPath);
    live.exec("CREATE TABLE schema_migrations (name TEXT); INSERT INTO schema_migrations VALUES ('001'); CREATE TABLE users (id TEXT); INSERT INTO users VALUES ('a'), ('b');");
    fs.mkdirSync(path.join(dir, 'backups'));
    const backup = path.join(dir, 'backups', 'playzo-2026-01-01T00-00-00-000Z.db');
    live.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    live.exec("INSERT INTO users VALUES ('c')"); // newer data that the restore will roll back
    live.close();
    fs.writeFileSync(restoreRequestFile(dbPath), JSON.stringify({ file: path.basename(backup) }));
    const r = applyPendingRestore(dbPath)!;
    expect(r.restored).toBe(path.basename(backup));
    const after = new DatabaseSync(dbPath, { readOnly: true });
    expect((after.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n).toBe(2);
    after.close();
    const safety = new DatabaseSync(path.join(dir, 'backups', r.safetyCopy), { readOnly: true });
    expect((safety.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n).toBe(3); // nothing lost
    safety.close();
    expect(fs.existsSync(restoreRequestFile(dbPath))).toBe(false);
    expect(applyPendingRestore(dbPath)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('restore endpoints are admin-only and require typed confirmation', async () => {
    const plain = new Client(); await reg(plain, 'plainbk');
    expect((await plain.get('/api/admin/backups')).status).toBe(403);
    const a = await staff('backupadmin');
    expect((await a.get('/api/admin/backups')).status).toBe(200);
    expect((await a.post('/api/admin/backups/../../etc/verify')).status).toBe(404);
    expect((await a.post('/api/admin/backups/playzo-x.db/restore', {})).status).toBe(400);
  });
  it('health reports the startup integrity check', async () => {
    const h = await new Client().get('/api/health');
    expect(h.body.dbCheck).toBe('ok');
    expect(h.body.migrations).toContain('003_journey_support.sql');
  });
});
