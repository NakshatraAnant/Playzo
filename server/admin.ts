/** Internal admin API. Every route is role-checked server-side and every mutation is audited. */
import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { HttpError, requireRole, audit, str, User } from './http';
import { overview } from './analytics';
import { CATALOGUE, BY_ID } from '../shared/catalogue';
import { legalGate, AGE_ASSURANCE_PROVIDERS, latestLegalReview } from './access';
import { post, balance } from './economy';
import { newId } from './secureRng';
import { config } from './config';
import { roomCount, roomList, closeRoom } from './rooms';
import fs from 'node:fs';
import path from 'node:path';
import { emailStatus, requeue } from './email';
import { backupNow, latestBackup } from './backup';
import { disabledSet, setEnabled } from './contentFlags';
import { ACHIEVEMENTS, DAILY_POOL, dailyMissions, weeklyMissions, seasonKey } from './progression';
import { COSMETICS, COSMETIC_BY_ID } from '../shared/cosmetics';

const STAFF: User['role'][] = ['admin', 'support'];

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (req) => {
    requireRole(req, STAFF);
    return { ...overview(), liveRooms: roomCount(), ledger: db().get("SELECT COUNT(*) AS txs, COALESCE(SUM(CASE WHEN currency='ZO' AND amount>0 THEN amount END),0) AS zoIssued, COALESCE(SUM(CASE WHEN currency='CHIPS' AND type='grant' THEN amount END),0) AS chipsGranted FROM ledger") };
  });

  app.get('/api/admin/users', async (req) => {
    requireRole(req, STAFF);
    const q = String((req.query as any).q ?? '').trim();
    const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    return {
      users: db().all(
        `SELECT id, username, display_name, email, is_guest, age_band, role, status, level, xp, adult_verified_at, adult_verify_method, parental_consent_at, created_at, last_seen_at
         FROM users WHERE (? = '' OR username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR id = ?) ORDER BY created_at DESC LIMIT 50`, q, like, like, q,
      ),
    };
  });

  app.get('/api/admin/users/:id', async (req) => {
    requireRole(req, STAFF);
    const id = (req.params as any).id;
    const u = db().get('SELECT id, username, display_name, email, is_guest, dob, age_band, role, status, level, xp, adult_verified_at, adult_verify_method, parental_consent_at, parent_email, premium_until, lounge_cooloff_until, created_at, last_seen_at FROM users WHERE id = ?', id);
    if (!u) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    return {
      user: u, balances: { ZO: balance(id, 'ZO'), CHIPS: balance(id, 'CHIPS') },
      ledger: db().all('SELECT * FROM ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', id),
      sessions: db().all('SELECT id, game_id, status, score, context, reject_reason, started_at, ended_at FROM game_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 50', id),
      reports: db().all('SELECT * FROM reports WHERE target_user = ? ORDER BY created_at DESC', id),
      consents: db().all('SELECT kind, version, granted_at FROM consents WHERE user_id = ?', id),
    };
  });

  app.post('/api/admin/users/:id/status', async (req) => {
    const admin = requireRole(req, STAFF);
    const id = (req.params as any).id;
    const status = String((req.body as any)?.status);
    if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'Status must be active or suspended', 'VALIDATION');
    const target = db().get<User>('SELECT * FROM users WHERE id = ?', id);
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    if (target.role === 'admin' && admin.role !== 'admin') throw new HttpError(403, 'Only admins can change admins', 'FORBIDDEN');
    db().run('UPDATE users SET status = ? WHERE id = ?', status, id);
    if (status === 'suspended') db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), id);
    audit(admin.id, 'admin.user_status', id, { status, reason: (req.body as any)?.reason });
    return { ok: true };
  });

  app.post('/api/admin/users/:id/role', async (req) => {
    const admin = requireRole(req, ['admin']);
    const role = String((req.body as any)?.role);
    if (!['user', 'tester', 'support', 'admin'].includes(role)) throw new HttpError(400, 'Bad role', 'VALIDATION');
    db().run('UPDATE users SET role = ? WHERE id = ? AND is_guest = 0', role, (req.params as any).id);
    audit(admin.id, 'admin.user_role', (req.params as any).id, { role });
    return { ok: true };
  });

  /** Support adjustments to ZO only (never Fun Chips beyond policy). Requires a reason; audited. */
  app.post('/api/admin/users/:id/adjust', async (req) => {
    const admin = requireRole(req, ['admin']);
    const id = (req.params as any).id;
    const amount = Math.trunc(Number((req.body as any)?.amount));
    const reason = str((req.body as any)?.reason, 'Reason', 5, 200);
    if (!amount || Math.abs(amount) > 5000) throw new HttpError(400, 'Amount must be between -5000 and 5000', 'VALIDATION');
    const r = post(id, 'ZO', amount, 'admin_adjust', `admin:${admin.id}`, `admin-adjust:${newId()}`, null, { reason });
    audit(admin.id, 'admin.zo_adjust', id, { amount, reason });
    return { ok: true, balance: r.balance };
  });

  app.get('/api/admin/reports', async (req) => {
    requireRole(req, STAFF);
    return { reports: db().all(`SELECT r.*, a.username AS reporter_name, t.username AS target_name FROM reports r JOIN users a ON a.id = r.reporter JOIN users t ON t.id = r.target_user ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 100`) };
  });
  app.post('/api/admin/reports/:id', async (req) => {
    const admin = requireRole(req, STAFF);
    const status = String((req.body as any)?.status);
    if (!['actioned', 'dismissed'].includes(status)) throw new HttpError(400, 'Bad status', 'VALIDATION');
    db().run('UPDATE reports SET status = ?, resolved_by = ?, resolution = ? WHERE id = ?', status, admin.id, String((req.body as any)?.resolution ?? '').slice(0, 300), (req.params as any).id);
    audit(admin.id, 'admin.report_resolve', (req.params as any).id, { status });
    return { ok: true };
  });

  app.get('/api/admin/games', async (req) => {
    requireRole(req, STAFF);
    const stats = db().all<{ game_id: string; plays: number; completed: number; rejected: number; avg_score: number }>(
      "SELECT game_id, COUNT(*) AS plays, SUM(status='completed') AS completed, SUM(status='rejected') AS rejected, AVG(score) AS avg_score FROM game_sessions GROUP BY game_id",
    );
    const settings = db().all<{ game_id: string; status: string; note: string }>('SELECT * FROM game_settings');
    return {
      games: CATALOGUE.map((g) => ({
        id: g.id, n: g.n, title: g.title, env: g.env, category: g.category, status: settings.find((s) => s.game_id === g.id)?.status ?? 'live', note: settings.find((s) => s.game_id === g.id)?.note ?? null,
        legal: g.env === 'lounge' ? legalGate(g.id) : null, ...(stats.find((s) => s.game_id === g.id) ?? { plays: 0, completed: 0, rejected: 0, avg_score: null }),
      })),
    };
  });
  app.post('/api/admin/games/:id', async (req) => {
    const admin = requireRole(req, ['admin']);
    const id = (req.params as any).id;
    if (!BY_ID[id]) throw new HttpError(404, 'Game not found', 'NOT_FOUND');
    const status = String((req.body as any)?.status);
    if (!['live', 'maintenance', 'hidden'].includes(status)) throw new HttpError(400, 'Bad status', 'VALIDATION');
    db().run('INSERT INTO game_settings (game_id, status, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(game_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
      id, status, String((req.body as any)?.note ?? '').slice(0, 200) || null, admin.id, nowIso());
    audit(admin.id, 'admin.game_status', id, { status });
    return { ok: true };
  });

  app.get('/api/admin/ledger', async (req) => {
    requireRole(req, STAFF);
    const q = req.query as any;
    return {
      entries: db().all('SELECT l.*, u.username FROM ledger l LEFT JOIN users u ON u.id = l.user_id WHERE (? IS NULL OR l.currency = ?) ORDER BY l.created_at DESC LIMIT 200', q.currency ?? null, q.currency ?? null),
      // Suspicious activity: rejected replays and unusually high family earnings today.
      suspicious: {
        rejectedRuns: db().all("SELECT s.id, s.user_id, u.username, s.game_id, s.reject_reason, s.started_at FROM game_sessions s JOIN users u ON u.id = s.user_id WHERE s.status = 'rejected' ORDER BY s.started_at DESC LIMIT 50"),
        topEarners: db().all("SELECT l.user_id, u.username, SUM(l.amount) AS zo FROM ledger l JOIN users u ON u.id = l.user_id WHERE l.currency = 'ZO' AND l.amount > 0 AND l.created_at >= date('now') GROUP BY l.user_id ORDER BY zo DESC LIMIT 10"),
      },
    };
  });

  app.get('/api/admin/ads', async (req) => {
    requireRole(req, STAFF);
    return { placements: db().all('SELECT * FROM ad_placements ORDER BY slot') };
  });
  app.post('/api/admin/ads/:id', async (req) => {
    const admin = requireRole(req, ['admin']);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const cap = Math.max(1, Math.min(20, Number(b.frequencyCap ?? 3) | 0));
    db().run('UPDATE ad_placements SET enabled = ?, frequency_cap_per_day = ? WHERE id = ?', b.enabled ? 1 : 0, cap, (req.params as any).id);
    audit(admin.id, 'admin.ad_update', (req.params as any).id, { enabled: !!b.enabled, cap });
    return { ok: true };
  });

  app.get('/api/admin/audit', async (req) => {
    requireRole(req, ['admin']);
    return { entries: db().all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200') };
  });

  /* ---------------- legal review records (documentation only; never unlocks a game by itself) ---------------- */
  app.get('/api/admin/legal', async (req) => {
    requireRole(req, STAFF);
    return {
      loungeEnabled: config.loungeEnabled, adultDevPreview: config.adultDevPreview, production: config.production,
      rule: 'A Lounge game is public only when PLAYZO_LOUNGE_ENABLED=true AND PLAYZO_LEGAL_APPROVALS names it AND the latest india_law record is "approved" with the same reference. This dashboard can record reviews but cannot change server configuration.',
      games: CATALOGUE.filter((g) => g.env === 'lounge').map((g) => ({
        id: g.id, title: g.title, gate: legalGate(g.id).status, configRef: config.legalApprovals[g.id] ?? null, latest: latestLegalReview(g.id),
        platforms: Object.fromEntries(['google_play', 'app_store'].map((sc) => [sc, latestLegalReview(g.id, sc)?.status ?? 'pending'])),
        history: db().all('SELECT r.id, r.scope, r.status, r.reference, r.reviewer, r.notes, r.created_at, u.username AS recorded_by FROM legal_reviews r LEFT JOIN users u ON u.id = r.recorded_by WHERE r.game_id = ? ORDER BY r.id DESC LIMIT 20', g.id),
      })),
    };
  });
  app.post('/api/admin/legal/:id', async (req) => {
    const admin = requireRole(req, ['admin']);
    const id = (req.params as any).id;
    if (BY_ID[id]?.env !== 'lounge') throw new HttpError(404, 'Lounge game not found', 'NOT_FOUND');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const status = String(b.status);
    const scope = String(b.scope ?? 'india_law');
    if (!['pending', 'in_review', 'approved', 'rejected', 'blocked'].includes(status)) throw new HttpError(400, 'Bad status', 'VALIDATION');
    if (!['india_law', 'state_law', 'google_play', 'app_store'].includes(scope)) throw new HttpError(400, 'Bad scope', 'VALIDATION');
    const reference = b.reference ? str(b.reference, 'Reference', 3, 120) : null;
    const reviewer = b.reviewer ? str(b.reviewer, 'Reviewer', 2, 120) : null;
    if (status === 'approved' && (!reference || !reviewer)) throw new HttpError(400, 'An approval needs the written opinion reference and the reviewer', 'VALIDATION');
    db().run('INSERT INTO legal_reviews (game_id, scope, status, reference, reviewer, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, scope, status, reference, reviewer, b.notes ? String(b.notes).slice(0, 1000) : null, admin.id);
    audit(admin.id, 'admin.legal_review', id, { scope, status, reference });
    return { ok: true, gate: legalGate(id).status };
  });

  /* ---------------- live rooms and matches ---------------- */
  app.get('/api/admin/rooms', async (req) => {
    requireRole(req, STAFF);
    return {
      live: roomList(),
      persisted: db().get<{ n: number }>("SELECT COUNT(*) AS n FROM rooms WHERE status IN ('lobby','playing')")!.n,
      matches: db().all('SELECT id, room_code, game_id, format, created_at, (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id) AS players FROM matches m ORDER BY created_at DESC LIMIT 50'),
    };
  });
  app.post('/api/admin/rooms/:code/close', async (req) => {
    const admin = requireRole(req, STAFF);
    const code = String((req.params as any).code).toUpperCase();
    const reason = str((req.body as any)?.reason, 'Reason', 3, 200);
    if (!closeRoom(code, reason)) throw new HttpError(404, 'Room not found', 'NOT_FOUND');
    audit(admin.id, 'admin.room_close', code, { reason });
    return { ok: true };
  });

  /* ---------------- sessions, leaderboards, content ---------------- */
  app.post('/api/admin/users/:id/revoke-sessions', async (req) => {
    const admin = requireRole(req, STAFF);
    const id = (req.params as any).id;
    const n = db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), id).changes;
    audit(admin.id, 'admin.revoke_sessions', id, { count: Number(n) });
    return { ok: true, revoked: Number(n) };
  });
  app.post('/api/admin/scores/remove', async (req) => {
    const admin = requireRole(req, ['admin']);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const userId = str(b.userId, 'User', 3, 64), gameId = str(b.gameId, 'Game', 2, 40);
    const reason = str(b.reason, 'Reason', 5, 200);
    if (!BY_ID[gameId]) throw new HttpError(404, 'Game not found', 'NOT_FOUND');
    const n = db().tx(() => {
      const r = db().run('DELETE FROM scores WHERE user_id = ? AND game_id = ?', userId, gameId);
      db().run('UPDATE game_stats SET best_score = 0 WHERE user_id = ? AND game_id = ?', userId, gameId);
      return Number(r.changes);
    });
    audit(admin.id, 'admin.scores_removed', userId, { gameId, removed: n, reason });
    return { ok: true, removed: n };
  });
  app.get('/api/admin/content', async (req) => {
    requireRole(req, STAFF);
    const offM = disabledSet('mission'), offC = disabledSet('cosmetic');
    const unlocks = db().all<{ achievement_id: string; n: number }>('SELECT achievement_id, COUNT(*) AS n FROM achievements GROUP BY achievement_id');
    const owned = db().all<{ item_id: string; n: number }>('SELECT item_id, COUNT(*) AS n FROM inventory GROUP BY item_id');
    return {
      missions: [...DAILY_POOL, ...weeklyMissions()].map((m) => ({ id: m.id, period: m.period, title: m.title, target: m.target, zo: m.zo, enabled: !offM.has(m.id), activeToday: dailyMissions().some((d) => d.id === m.id) || m.period === 'weekly' })),
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, desc: a.desc, zo: a.zo, unlocked: unlocks.find((u) => u.achievement_id === a.id)?.n ?? 0 })),
      cosmetics: COSMETICS.map((c) => ({ id: c.id, name: c.name, kind: c.kind, priceZo: c.priceZo, plusOnly: !!c.plusOnly, enabled: !offC.has(c.id), owned: owned.find((o) => o.item_id === c.id)?.n ?? 0 })),
      season: { key: seasonKey(), players: db().get<{ n: number }>('SELECT COUNT(*) AS n FROM season_points WHERE season = ?', seasonKey())!.n },
    };
  });
  app.post('/api/admin/content/:kind/:id', async (req) => {
    const admin = requireRole(req, ['admin']);
    const { kind, id } = req.params as { kind: string; id: string };
    if (kind !== 'mission' && kind !== 'cosmetic') throw new HttpError(400, 'Bad kind', 'VALIDATION');
    const known = kind === 'mission' ? [...DAILY_POOL, ...weeklyMissions()].some((m) => m.id === id) : !!COSMETIC_BY_ID[id];
    if (!known) throw new HttpError(404, 'Not found', 'NOT_FOUND');
    const enabled = !!(req.body as any)?.enabled;
    setEnabled(kind, id, enabled, admin.id);
    audit(admin.id, 'admin.content_flag', `${kind}:${id}`, { enabled });
    return { ok: true };
  });

  /* ---------------- system health, configuration (read-only), email delivery ---------------- */
  app.get('/api/admin/system', async (req) => {
    requireRole(req, STAFF);
    const mem = process.memoryUsage();
    let dbBytes = 0;
    try { if (config.dbPath !== ':memory:') dbBytes = fs.statSync(config.dbPath).size + (fs.existsSync(config.dbPath + '-wal') ? fs.statSync(config.dbPath + '-wal').size : 0); } catch { /* ignore */ }
    const count = (t: string) => db().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n;
    return {
      node: process.version, uptimeSec: Math.round(process.uptime()), memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
      db: { path: config.dbPath, bytes: dbBytes, migrations: db().all('SELECT name, applied_at FROM schema_migrations'), rows: Object.fromEntries(['users', 'game_sessions', 'ledger', 'matches', 'rooms', 'notifications', 'audit_log'].map((t) => [t, count(t)])) },
      activeSessions: db().get<{ n: number }>('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?', nowIso())!.n,
      liveRooms: roomCount(), email: emailStatus(),
      backup: (() => { const b = latestBackup(); return b ? { file: b.file, at: new Date(b.at).toISOString() } : null; })(),
      // Non-secret configuration only. Secrets (passwords, API keys) are never returned.
      config: {
        production: config.production, devMode: config.devMode, loungeEnabled: config.loungeEnabled, adultDevPreview: config.adultDevPreview,
        legalApprovals: Object.keys(config.legalApprovals).length, ageVerificationDays: config.ageVerificationDays, publicUrl: config.publicUrl,
        oauth: { google: !!config.googleClientId, apple: !!config.appleClientId }, payments: 'dev-mock (TEST MODE) only',
        ageAssurance: Object.entries(AGE_ASSURANCE_PROVIDERS).map(([k, v]) => ({ id: k, production: v.production })),
      },
    };
  });
  app.post('/api/admin/backup', async (req) => {
    const admin = requireRole(req, ['admin']);
    if (config.dbPath === ':memory:') throw new HttpError(409, 'In-memory database: nothing to back up', 'NOT_AVAILABLE');
    const file = backupNow();
    const name = path.basename(file);
    audit(admin.id, 'admin.backup', name);
    return { ok: true, file: name };
  });
  app.get('/api/admin/emails', async (req) => {
    requireRole(req, STAFF);
    const mask = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a, b, c) => a + '*'.repeat(Math.min(6, b.length)) + c);
    return {
      delivery: emailStatus(),
      messages: db().all<any>('SELECT id, to_email, template, subject, provider, status, attempts, last_error, created_at, sent_at FROM dev_outbox ORDER BY id DESC LIMIT 100').map((m) => ({ ...m, to_email: mask(m.to_email) })),
      counts: db().all('SELECT status, COUNT(*) AS n FROM dev_outbox GROUP BY status'),
    };
  });
  app.post('/api/admin/emails/:id/retry', async (req) => {
    const admin = requireRole(req, ['admin']);
    const ok = requeue(Number((req.params as any).id));
    if (!ok) throw new HttpError(409, 'Retry is only possible for failed messages with a configured provider', 'NOT_CONFIGURED');
    audit(admin.id, 'admin.email_retry', String((req.params as any).id));
    return { ok: true };
  });

  app.get('/api/admin/compliance', async (req) => {
    requireRole(req, STAFF);
    return {
      legalGates: CATALOGUE.filter((g) => g.env === 'lounge').map((g) => ({ id: g.id, title: g.title, ...legalGate(g.id) })), loungeEnabled: config.loungeEnabled,
      ageAssurance: AGE_ASSURANCE_PROVIDERS, devMode: config.devMode, adultDevPreview: config.adultDevPreview, production: config.production,
      deletionRequests: db().all('SELECT * FROM deletion_requests ORDER BY requested_at DESC LIMIT 50'),
      errors: db().all('SELECT * FROM client_errors ORDER BY id DESC LIMIT 50'),
      purchases: db().all('SELECT p.*, u.username FROM purchases p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 50'),
    };
  });
}
