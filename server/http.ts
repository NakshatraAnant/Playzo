import type { FastifyRequest, FastifyReply } from 'fastify';
import { db, Row } from './db';
import { sha256 } from './secureRng';
import { config } from './config';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public extra?: Record<string, unknown>) {
    super(message);
  }
}

export interface User extends Row {
  id: string; username: string; display_name: string; email: string | null; is_guest: number; age_band: 'unknown' | 'child' | 'teen' | 'adult';
  role: 'user' | 'tester' | 'support' | 'admin'; status: string; dob: string | null; adult_verified_at: string | null; parental_consent_at: string | null;
}

export const SESSION_COOKIE = 'pz_session';

/** Resolve the signed-in user from the session cookie (or null). */
export function currentUser(req: FastifyRequest): User | null {
  const cached = (req as any)._user;
  if (cached !== undefined) return cached;
  const token = req.cookies?.[SESSION_COOKIE];
  let user: User | null = null;
  if (token) {
    user = db().get<User>(
      `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
      sha256(token), new Date().toISOString(),
    ) ?? null;
  }
  if (user && token) {
    // Track last use for the session list (at most one write per session every 5 minutes).
    const now = new Date();
    db().run('UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ? AND (last_used_at IS NULL OR last_used_at < ?)', now.toISOString(), sha256(token), new Date(now.getTime() - 300_000).toISOString());
  }
  (req as any)._user = user;
  return user;
}

export function requireUser(req: FastifyRequest): User {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in or continue as a guest', 'AUTH_REQUIRED');
  return u;
}

export function requireRole(req: FastifyRequest, roles: User['role'][]): User {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw new HttpError(403, 'Not permitted', 'FORBIDDEN');
  return u;
}

/* ---------------- simple validation ---------------- */
export function str(v: unknown, name: string, min = 1, max = 200): string {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`, 'VALIDATION');
  const t = v.trim();
  if (t.length < min || t.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`, 'VALIDATION');
  return t;
}
export function oneOf<T extends string>(v: unknown, options: readonly T[], name: string): T {
  if (!options.includes(v as T)) throw new HttpError(400, `${name} must be one of ${options.join(', ')}`, 'VALIDATION');
  return v as T;
}

/* ---------------- in-memory rate limiting (per process) ---------------- */
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(req: FastifyRequest, group: string, perMinute: number) {
  perMinute *= config.rateLimitMultiplier;
  const key = `${group}:${currentUser(req)?.id ?? req.ip}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1) throw new HttpError(429, 'Slow down a little and try again', 'RATE_LIMITED');
  b.tokens -= 1;
  buckets.set(key, b);
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 60_000).unref();

export function audit(actor: string | null, action: string, target?: string, meta?: unknown) {
  db().run('INSERT INTO audit_log (actor, action, target, meta) VALUES (?, ?, ?, ?)', actor, action, target ?? null, meta ? JSON.stringify(meta) : null);
}

export function sendError(reply: FastifyReply, e: unknown) {
  if (e instanceof HttpError) return reply.code(e.status).send({ error: e.message, code: e.code, ...e.extra });
  throw e;
}
