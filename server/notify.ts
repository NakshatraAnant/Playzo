/**
 * In-app notifications and user-controlled preferences.
 * Security notices are always delivered in-app (and by email when an email provider is configured);
 * everything else respects the user's preferences. No push or marketing messages are sent.
 */
import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { newId } from './secureRng';
import { requireUser, HttpError } from './http';

export type NotifyKind = 'security' | 'friend' | 'challenge' | 'room' | 'system' | 'reminder';
export interface NotifyPrefs { friend: boolean; challenge: boolean; room: boolean; reminder: boolean; emailSecurity: boolean; playReminderMin: number | null }
export const DEFAULT_PREFS: NotifyPrefs = { friend: true, challenge: true, room: true, reminder: true, emailSecurity: true, playReminderMin: 60 };

export function prefsFor(userId: string): NotifyPrefs {
  const raw = db().get<{ notify_prefs: string }>('SELECT notify_prefs FROM users WHERE id = ?', userId)?.notify_prefs ?? '{}';
  try { return { ...DEFAULT_PREFS, ...JSON.parse(raw) }; } catch { return { ...DEFAULT_PREFS }; }
}

export function notify(userId: string, kind: NotifyKind, title: string, body?: string, link?: string) {
  if (kind !== 'security' && kind !== 'system') {
    const p = prefsFor(userId);
    if (kind in p && !(p as any)[kind]) return;
  }
  db().run('INSERT INTO notifications (id, user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)', newId('n_'), userId, kind, title.slice(0, 120), body?.slice(0, 400) ?? null, link ?? null);
  // Keep the inbox bounded.
  db().run('DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)', userId, userId);
}

export async function notifyRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (req) => {
    const u = requireUser(req);
    return {
      notifications: db().all('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', u.id),
      unread: db().get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id)!.n,
      prefs: prefsFor(u.id),
    };
  });
  app.post('/api/notifications/read', async (req) => {
    const u = requireUser(req);
    const id = (req.body as any)?.id;
    if (id) db().run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', nowIso(), String(id), u.id);
    else db().run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowIso(), u.id);
    return { ok: true };
  });
  app.patch('/api/notifications/prefs', async (req) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const cur = prefsFor(u.id);
    for (const k of ['friend', 'challenge', 'room', 'reminder', 'emailSecurity'] as const) if (b[k] !== undefined) cur[k] = !!b[k];
    if (b.playReminderMin !== undefined) {
      if (b.playReminderMin !== null && ![30, 60, 90, 120].includes(Number(b.playReminderMin))) throw new HttpError(400, 'Reminder must be 30, 60, 90 or 120 minutes, or off', 'VALIDATION');
      cur.playReminderMin = b.playReminderMin === null ? null : Number(b.playReminderMin);
    }
    db().run('UPDATE users SET notify_prefs = ? WHERE id = ?', JSON.stringify(cur), u.id);
    return { prefs: cur };
  });
}
