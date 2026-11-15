/**
 * Support: players open tickets (help, bug, account, complaint, safety, feedback), follow their
 * status and reply; staff triage, respond and resolve from Admin → Support. Players can also track
 * the reports they filed against other players. Every staff action is audited; replies notify the
 * player in-app (and by email only when an email provider is configured).
 */
import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { HttpError, requireUser, requireRole, rateLimit, str, oneOf, audit, User } from './http';
import { newId } from './secureRng';
import { notify } from './notify';
import { sendEmail } from './email';
import { config } from './config';
import { track } from './analytics';

export const TICKET_KINDS = ['help', 'bug', 'account', 'complaint', 'safety', 'feedback'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'] as const;
const STAFF: User['role'][] = ['admin', 'support'];

function ticketFor(u: User, id: string) {
  const t = db().get<any>('SELECT * FROM support_tickets WHERE id = ?', id);
  if (!t || t.user_id !== u.id) throw new HttpError(404, 'Ticket not found', 'NOT_FOUND');
  return t;
}
const thread = (id: string) => db().all('SELECT m.id, m.staff, m.body, m.created_at, CASE WHEN m.staff = 1 THEN \'PLAYZO Support\' ELSE u.display_name END AS author FROM support_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.ticket_id = ? ORDER BY m.id', id);

export async function supportRoutes(app: FastifyInstance) {
  app.post('/api/support', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'support', 6);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const kind = oneOf(b.kind, TICKET_KINDS, 'Topic');
    const subject = str(b.subject, 'Subject', 4, 120);
    const message = str(b.message, 'Message', 10, 4000);
    const id = newId('t_');
    db().tx(() => {
      db().run('INSERT INTO support_tickets (id, user_id, kind, subject, priority) VALUES (?, ?, ?, ?, ?)', id, u.id, kind, subject, kind === 'safety' ? 'high' : 'normal');
      db().run('INSERT INTO support_messages (ticket_id, author_id, staff, body) VALUES (?, ?, 0, ?)', id, u.id, message);
    });
    track('support_request', u.id, { kind });
    notify(u.id, 'system', 'We received your request', `Ticket "${subject}" is open. We'll reply here.`, `/support/${id}`);
    return { id };
  });
  app.get('/api/support', async (req) => {
    const u = requireUser(req);
    return {
      tickets: db().all('SELECT id, kind, subject, status, created_at, updated_at, (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.staff = 1) AS staff_replies FROM support_tickets t WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50', u.id),
      reports: db().all('SELECT r.id, r.reason, r.status, r.resolution, r.created_at, t.display_name AS target FROM reports r JOIN users t ON t.id = r.target_user WHERE r.reporter = ? ORDER BY r.created_at DESC LIMIT 50', u.id),
    };
  });
  app.get('/api/support/:id', async (req) => {
    const u = requireUser(req);
    const t = ticketFor(u, (req.params as any).id);
    return { ticket: t, messages: thread(t.id) };
  });
  app.post('/api/support/:id/reply', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'support-reply', 20);
    const t = ticketFor(u, (req.params as any).id);
    if (t.status === 'closed') throw new HttpError(409, 'This ticket is closed. Open a new one if you still need help.', 'CLOSED');
    db().run('INSERT INTO support_messages (ticket_id, author_id, staff, body) VALUES (?, ?, 0, ?)', t.id, u.id, str((req.body as any)?.message, 'Message', 1, 4000));
    db().run("UPDATE support_tickets SET status = CASE WHEN status IN ('awaiting_user','resolved') THEN 'open' ELSE status END, updated_at = ? WHERE id = ?", nowIso(), t.id);
    return { ok: true };
  });
  app.post('/api/support/:id/close', async (req) => {
    const u = requireUser(req);
    const t = ticketFor(u, (req.params as any).id);
    db().run("UPDATE support_tickets SET status = 'closed', updated_at = ? WHERE id = ?", nowIso(), t.id);
    return { ok: true };
  });

  /* ---------------- staff ---------------- */
  app.get('/api/admin/support', async (req) => {
    requireRole(req, STAFF);
    const status = String((req.query as any).status ?? 'active');
    const where = status === 'active' ? "t.status IN ('open','in_progress','awaiting_user')" : status === 'all' ? '1=1' : 't.status = ?';
    const args = status === 'active' || status === 'all' ? [] : [oneOf(status, TICKET_STATUSES, 'Status')];
    return {
      tickets: db().all(`SELECT t.*, u.username, u.age_band, (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS messages FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE ${where} ORDER BY (t.priority = 'high') DESC, t.updated_at DESC LIMIT 200`, ...args),
      counts: db().all('SELECT status, COUNT(*) AS n FROM support_tickets GROUP BY status'),
    };
  });
  app.get('/api/admin/support/:id', async (req) => {
    requireRole(req, STAFF);
    const t = db().get<any>('SELECT t.*, u.username FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?', (req.params as any).id);
    if (!t) throw new HttpError(404, 'Ticket not found', 'NOT_FOUND');
    return { ticket: t, messages: thread(t.id) };
  });
  app.post('/api/admin/support/:id', async (req) => {
    const staff = requireRole(req, STAFF);
    const id = (req.params as any).id;
    const t = db().get<any>('SELECT t.*, u.email FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?', id);
    if (!t) throw new HttpError(404, 'Ticket not found', 'NOT_FOUND');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const status = b.status !== undefined ? oneOf(b.status, TICKET_STATUSES, 'Status') : null;
    const message = b.message ? str(b.message, 'Reply', 1, 4000) : null;
    if (!status && !message) throw new HttpError(400, 'Nothing to update', 'VALIDATION');
    db().tx(() => {
      if (message) db().run('INSERT INTO support_messages (ticket_id, author_id, staff, body) VALUES (?, ?, 1, ?)', id, staff.id, message);
      const next = status ?? (message && t.status === 'open' ? 'awaiting_user' : t.status);
      db().run('UPDATE support_tickets SET status = ?, assigned_to = COALESCE(assigned_to, ?), updated_at = ? WHERE id = ?', next, staff.id, nowIso(), id);
    });
    audit(staff.id, 'admin.support_update', id, { status, replied: !!message });
    if (t.user_id && message) {
      notify(t.user_id, 'system', 'PLAYZO Support replied', `Re: ${t.subject}`, `/support/${id}`);
      if (t.email) sendEmail(t.email, 'security_alert', { message: `PLAYZO Support replied to your request "${t.subject}". Read it at ${config.publicUrl}/support/${id}` }, t.user_id);
    } else if (t.user_id && status) notify(t.user_id, 'system', `Your request is now ${status.replace('_', ' ')}`, t.subject, `/support/${id}`);
    return { ok: true };
  });
}
