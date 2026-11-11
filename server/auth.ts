import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { db, nowIso } from './db';
import { config } from './config';
import { HttpError, User, currentUser, requireUser, str, rateLimit, audit, SESSION_COOKIE } from './http';
import { sha256, randomToken, newId } from './secureRng';
import { ageOn, bandFor, loungeAccess, socialPolicy, AGE_ASSURANCE_PROVIDERS } from './access';
import { balance } from './economy';
import { track } from './analytics';

export const TERMS_VERSION = '2026-11';

/* ---------------- passwords ---------------- */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [kind, s, h] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const hash = scryptSync(pw, Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(h, 'base64');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

/* ---------------- sessions ---------------- */
function createSession(reply: FastifyReply, userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  db().run('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires.toISOString());
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', expires });
}
function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db().run('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?', nowIso(), sha256(token));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/* ---------------- dev outbox (local email stand-in) ---------------- */
export function sendMail(to: string, subject: string, body: string) {
  // No real email provider is configured. Messages are stored locally and shown at /dev/outbox (dev mode only).
  db().run('INSERT INTO dev_outbox (to_email, subject, body) VALUES (?, ?, ?)', to, subject, body);
}
function issueToken(userId: string, purpose: string, hours: number): string {
  const t = randomToken(24);
  db().run('INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)', sha256(t), userId, purpose, new Date(Date.now() + hours * 3600_000).toISOString());
  return t;
}
function consumeToken(t: string, purpose: string): string {
  const row = db().get<{ user_id: string; expires_at: string; used_at: string | null }>('SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND purpose = ?', sha256(t), purpose);
  if (!row || row.used_at || row.expires_at < nowIso()) throw new HttpError(400, 'This link is invalid or has expired', 'BAD_TOKEN');
  db().run('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?', nowIso(), sha256(t));
  return row.user_id;
}

/* ---------------- helpers ---------------- */
const ADJ = ['Swift', 'Bright', 'Cosmic', 'Lucky', 'Brave', 'Neon', 'Clever', 'Mighty', 'Sunny', 'Zippy', 'Nimble', 'Epic'];
const NOUN = ['Comet', 'Tiger', 'Falcon', 'Pixel', 'Rocket', 'Panda', 'Lotus', 'Meteor', 'Koala', 'Cobra', 'Mango', 'Orbit'];
function freeUsername(base: string): string {
  let name = base;
  for (let i = 0; db().get('SELECT 1 FROM users WHERE username = ?', name); i++) name = `${base}${Math.floor(Math.random() * 9000) + 100}`;
  return name;
}
const validUsername = (u: string) => /^[A-Za-z0-9_]{3,20}$/.test(u);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;

export function publicMe(u: User) {
  const lounge = loungeAccess(u);
  return {
    id: u.id, username: u.username, displayName: u.display_name, email: u.email, isGuest: !!u.is_guest, ageBand: u.age_band, role: u.role,
    avatar: u.avatar, frame: u.frame, theme: u.theme, xp: u.xp, level: u.level, emailVerified: !!u.email_verified_at,
    parentalConsent: !!u.parental_consent_at, adultVerified: !!u.adult_verified_at, adultVerifyMethod: u.adult_verify_method,
    premium: !!(u.premium_until && u.premium_until > nowIso()), premiumUntil: u.premium_until, privacy: u.privacy_profile, allowFriendRequests: !!u.allow_friend_requests,
    balances: { ZO: balance(u.id, 'ZO'), ...(lounge.entitled ? { CHIPS: balance(u.id, 'CHIPS') } : {}) },
    lounge, social: socialPolicy(u), loungeDailyLimitMin: u.lounge_daily_limit_min,
  };
}

function validateDob(dob: unknown): string {
  const d = str(dob, 'Date of birth', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) throw new HttpError(400, 'Date of birth must be YYYY-MM-DD', 'VALIDATION');
  const age = ageOn(d);
  if (age < 4 || age > 120) throw new HttpError(400, 'Please enter a real date of birth', 'VALIDATION');
  return d;
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/me', async (req) => {
    const u = currentUser(req);
    if (u) db().run('UPDATE users SET last_seen_at = ? WHERE id = ?', nowIso(), u.id);
    return { user: u ? publicMe(u) : null, providers: { google: !!config.googleClientId, apple: !!config.appleClientId, devMode: config.devMode } };
  });

  /** Guest play: no personal data. Treated with child-safe defaults until upgraded. */
  app.post('/api/auth/guest', async (req, reply) => {
    rateLimit(req, 'guest', 10);
    if (currentUser(req)) throw new HttpError(400, 'Already signed in', 'ALREADY');
    const id = newId('u_');
    const username = freeUsername(`${ADJ[Math.floor(Math.random() * ADJ.length)]}${NOUN[Math.floor(Math.random() * NOUN.length)]}`);
    db().run('INSERT INTO users (id, username, display_name, is_guest, age_band, avatar) VALUES (?, ?, ?, 1, ?, ?)', id, username, username, 'unknown', `orb-${1 + Math.floor(Math.random() * 12)}`);
    db().run("INSERT INTO consents (user_id, kind, version) VALUES (?, 'terms', ?)", id, TERMS_VERSION);
    createSession(reply, id);
    track('auth_guest', id);
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', id)!) };
  });

  /** Registration (or guest upgrade, keeping progress). */
  app.post('/api/auth/register', async (req, reply) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = str(b.email, 'Email', 5, 160).toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email', 'VALIDATION');
    const password = str(b.password, 'Password', 8, 128);
    const username = str(b.username, 'Username', 3, 20);
    if (!validUsername(username)) throw new HttpError(400, 'Usernames use letters, numbers and _ (3-20)', 'VALIDATION');
    const dob = validateDob(b.dob);
    if (b.acceptTerms !== true) throw new HttpError(400, 'Please accept the Terms and Privacy Policy', 'VALIDATION');
    const band = bandFor(ageOn(dob));
    let parentEmail: string | null = null;
    if (band === 'child') {
      parentEmail = str(b.parentEmail, 'Parent or guardian email', 5, 160).toLowerCase();
      if (!validEmail(parentEmail) || parentEmail === email) throw new HttpError(400, 'Enter a different, valid parent or guardian email', 'VALIDATION');
    }
    if (db().get('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    const existingName = db().get<{ id: string }>('SELECT id FROM users WHERE username = ?', username);
    const guest = currentUser(req);
    if (existingName && existingName.id !== guest?.id) throw new HttpError(409, 'That username is taken', 'USERNAME_TAKEN');
    // Children get a generic display name; their chosen username stays private to friends.
    const display = band === 'child' ? username.slice(0, 1).toUpperCase() + username.slice(1, 3) + '***' : username;
    let id: string;
    if (guest && guest.is_guest) {
      id = guest.id;
      db().run('UPDATE users SET email=?, username=?, display_name=?, password_hash=?, is_guest=0, dob=?, age_band=?, parent_email=? WHERE id=?', email, username, display, hashPassword(password), dob, band, parentEmail, id);
    } else {
      id = newId('u_');
      db().run('INSERT INTO users (id, email, username, display_name, password_hash, dob, age_band, parent_email, avatar) VALUES (?,?,?,?,?,?,?,?,?)', id, email, username, display, hashPassword(password), dob, band, parentEmail, `orb-${1 + Math.floor(Math.random() * 12)}`);
      createSession(reply, id);
    }
    db().run("INSERT INTO consents (user_id, kind, version) VALUES (?, 'terms', ?), (?, 'privacy', ?)", id, TERMS_VERSION, id, TERMS_VERSION);
    const vt = issueToken(id, 'verify_email', 48);
    sendMail(email, 'Verify your PLAYZO email', `Welcome to PLAYZO! Verify your email: ${config.publicUrl}/verify?token=${vt}`);
    if (parentEmail) {
      const pt = issueToken(id, 'parent_consent', 24 * 7);
      sendMail(parentEmail, 'Your child wants to play on PLAYZO', `A child account "${username}" was created with this address as parent/guardian. Approve multiplayer & friends: ${config.publicUrl}/parent-consent?token=${pt}. Without approval the account can only play solo family games.`);
    }
    audit(id, guest?.is_guest ? 'auth.upgrade_guest' : 'auth.register', id, { band });
    track('auth_register', id, { band, upgraded: !!guest?.is_guest });
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', id)!) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const ident = str(b.identifier, 'Email or username', 3, 160);
    const password = str(b.password, 'Password', 1, 128);
    const u = db().get<User>("SELECT * FROM users WHERE (email = ? OR username = ?) AND status = 'active' AND is_guest = 0", ident.toLowerCase(), ident);
    if (!u || !verifyPassword(password, u.password_hash as string)) throw new HttpError(401, 'Incorrect email/username or password', 'BAD_CREDENTIALS');
    const prior = currentUser(req);
    if (prior) destroySession(req, reply);
    createSession(reply, u.id);
    track('auth_login', u.id);
    return { user: publicMe(u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const u = currentUser(req);
    destroySession(req, reply);
    if (u) track('auth_logout', u.id);
    return { ok: true };
  });

  app.post('/api/auth/verify-email', async (req) => {
    const uid = consumeToken(str((req.body as any)?.token, 'Token', 10, 100), 'verify_email');
    db().run('UPDATE users SET email_verified_at = ? WHERE id = ?', nowIso(), uid);
    return { ok: true };
  });

  app.post('/api/auth/parent-consent', async (req) => {
    const uid = consumeToken(str((req.body as any)?.token, 'Token', 10, 100), 'parent_consent');
    db().run('UPDATE users SET parental_consent_at = ? WHERE id = ?', nowIso(), uid);
    db().run("INSERT INTO consents (user_id, kind, version) VALUES (?, 'parental', ?)", uid, TERMS_VERSION);
    audit(null, 'auth.parent_consent', uid);
    return { ok: true };
  });

  app.post('/api/auth/forgot', async (req) => {
    rateLimit(req, 'auth', 5);
    const email = str((req.body as any)?.email, 'Email', 5, 160).toLowerCase();
    const u = db().get<User>("SELECT * FROM users WHERE email = ? AND status = 'active'", email);
    if (u) {
      const t = issueToken(u.id, 'reset_password', 1);
      sendMail(email, 'Reset your PLAYZO password', `Reset your password (valid 1 hour): ${config.publicUrl}/reset?token=${t}`);
    }
    return { ok: true }; // same response either way (no account enumeration)
  });

  app.post('/api/auth/reset', async (req) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const uid = consumeToken(str(b.token, 'Token', 10, 100), 'reset_password');
    db().run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(str(b.password, 'Password', 8, 128)), uid);
    db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), uid);
    audit(uid, 'auth.password_reset', uid);
    return { ok: true };
  });

  app.post('/api/auth/change-password', async (req) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!verifyPassword(str(b.current, 'Current password', 1, 128), u.password_hash as string)) throw new HttpError(401, 'Current password is incorrect', 'BAD_CREDENTIALS');
    db().run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(str(b.password, 'New password', 8, 128)), u.id);
    audit(u.id, 'auth.password_change', u.id);
    return { ok: true };
  });

  /** Account deletion: permanently removes personal data and gameplay history. */
  app.post('/api/auth/delete-account', async (req, reply) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm', 'VALIDATION');
    if (!u.is_guest && !verifyPassword(str(b.password, 'Password', 1, 128), u.password_hash as string)) throw new HttpError(401, 'Password is incorrect', 'BAD_CREDENTIALS');
    const hashed = sha256(u.id);
    db().tx(() => {
      db().run('INSERT OR REPLACE INTO deletion_requests (user_id, requested_at, completed_at) VALUES (?, ?, ?)', hashed, nowIso(), nowIso());
      db().run('DELETE FROM users WHERE id = ?', u.id); // cascades to all user-owned rows
      db().run('UPDATE analytics_events SET user_id = NULL WHERE user_id = ?', u.id);
    });
    audit(null, 'auth.account_deleted', hashed);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Age assurance for the Lounge. Locally only the clearly-labelled dev attestation exists. */
  app.post('/api/auth/age-assurance', async (req) => {
    const u = requireUser(req);
    const method = str((req.body as any)?.method, 'Method', 2, 40);
    const provider = AGE_ASSURANCE_PROVIDERS[method];
    if (!provider) throw new HttpError(400, 'Unknown verification method', 'VALIDATION');
    if (!provider.production && !config.devMode) throw new HttpError(503, 'No production age-assurance provider is configured', 'NOT_CONFIGURED');
    if (u.is_guest || !u.dob || bandFor(ageOn(u.dob)) !== 'adult') throw new HttpError(403, 'Age assurance is only available to adult accounts', 'NOT_ADULT');
    db().run('UPDATE users SET adult_verified_at = ?, adult_verify_method = ? WHERE id = ?', nowIso(), method, u.id);
    audit(u.id, 'access.age_assurance', u.id, { method, production: provider.production });
    return { ok: true, method, production: provider.production, label: provider.label };
  });

  app.post('/api/auth/lounge-terms', async (req) => {
    const u = requireUser(req);
    if (u.age_band !== 'adult') throw new HttpError(403, 'Adults only', 'NOT_ADULT');
    if (!db().get("SELECT 1 FROM consents WHERE user_id = ? AND kind = 'lounge_terms'", u.id)) db().run("INSERT INTO consents (user_id, kind, version) VALUES (?, 'lounge_terms', ?)", u.id, TERMS_VERSION);
    return { ok: true };
  });

  app.patch('/api/auth/profile', async (req) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.privacy !== undefined) {
      if (!['public', 'friends', 'private'].includes(b.privacy as string)) throw new HttpError(400, 'Bad privacy value', 'VALIDATION');
      const p = u.age_band === 'child' && b.privacy === 'public' ? 'friends' : b.privacy;
      db().run('UPDATE users SET privacy_profile = ? WHERE id = ?', p, u.id);
    }
    if (b.allowFriendRequests !== undefined) db().run('UPDATE users SET allow_friend_requests = ? WHERE id = ?', b.allowFriendRequests ? 1 : 0, u.id);
    if (b.loungeDailyLimitMin !== undefined) {
      const v = b.loungeDailyLimitMin === null ? null : Math.max(5, Math.min(600, Number(b.loungeDailyLimitMin) | 0));
      db().run('UPDATE users SET lounge_daily_limit_min = ? WHERE id = ?', v, u.id);
    }
    if (b.loungeCooloffDays !== undefined) {
      const days = Number(b.loungeCooloffDays);
      if (![1, 7, 30].includes(days)) throw new HttpError(400, 'Cool-off must be 1, 7 or 30 days', 'VALIDATION');
      db().run('UPDATE users SET lounge_cooloff_until = ? WHERE id = ?', new Date(Date.now() + days * 86400_000).toISOString(), u.id);
      audit(u.id, 'lounge.cooloff', u.id, { days });
    }
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', u.id)!) };
  });

  /** OAuth: only enabled when real credentials are configured (none in this local build). */
  app.get('/api/auth/oauth/:provider', async (req) => {
    const p = (req.params as any).provider;
    const id = p === 'google' ? config.googleClientId : p === 'apple' ? config.appleClientId : '';
    if (!id) throw new HttpError(501, `${p} sign-in is not configured on this server`, 'NOT_CONFIGURED');
    throw new HttpError(501, 'OAuth redirect flow requires deployment configuration (see DEPLOYMENT_GUIDE.md)', 'NOT_CONFIGURED');
  });

  /** Dev-only email outbox viewer. */
  app.get('/api/dev/outbox', async () => {
    if (!config.devMode) throw new HttpError(404, 'Not found', 'NOT_FOUND');
    return { messages: db().all('SELECT id, to_email, subject, body, created_at FROM dev_outbox ORDER BY id DESC LIMIT 50') };
  });
}
