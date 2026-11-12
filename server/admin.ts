/** Internal admin API. Every route is role-checked server-side and every mutation is audited. */
import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { HttpError, requireRole, audit, str, User } from './http';
import { overview } from './analytics';
import { CATALOGUE, BY_ID } from '../shared/catalogue';
import { legalGate, AGE_ASSURANCE_PROVIDERS } from './access';
import { post, balance } from './economy';
import { newId } from './secureRng';
import { config } from './config';
import { roomCount } from './rooms';

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

  app.get('/api/admin/compliance', async (req) => {
    requireRole(req, STAFF);
    return {
      legalGates: CATALOGUE.filter((g) => g.env === 'lounge').map((g) => ({ id: g.id, title: g.title, ...legalGate(g.id) })),
      ageAssurance: AGE_ASSURANCE_PROVIDERS, devMode: config.devMode, adultDevPreview: config.adultDevPreview, production: config.production,
      deletionRequests: db().all('SELECT * FROM deletion_requests ORDER BY requested_at DESC LIMIT 50'),
      errors: db().all('SELECT * FROM client_errors ORDER BY id DESC LIMIT 50'),
      purchases: db().all('SELECT p.*, u.username FROM purchases p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 50'),
    };
  });
}
