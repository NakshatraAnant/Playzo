import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { scrypt, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { db, nowIso } from './db';
import { config } from './config';
import { HttpError, User, currentUser, requireUser, str, rateLimit, audit, SESSION_COOKIE } from './http';
import { sha256, randomToken, newId } from './secureRng';
import { ageOn, bandFor, loungeAccess, socialPolicy, AGE_ASSURANCE_PROVIDERS, isQaPreview, loungeAgeOk, agePolicyFor } from './access';
import { PREF_KEYS } from '../shared/preferences';

function sanitizePrefs(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && PREF_KEYS.includes(x)))] : [];
}
const prefsOf = (u: User) => { try { return sanitizePrefs(JSON.parse((u as any).preferences ?? '[]')); } catch { return []; } };
import { balance } from './economy';
import { track } from './analytics';
import { sendEmail, emailStatus } from './email';
import { notify, prefsFor } from './notify';
import { oauthRoutes, providerConfigured, peekOauthTicket, takeOauthTicket, linkIdentity } from './oauth';

export const TERMS_VERSION = '2026-11';

/* ---------------- passwords ---------------- */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const scryptAsync = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
/** Async hashing runs on the worker thread pool, so sign-ups never stall live games. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scryptAsync(pw, salt)).toString('base64')}`;
}
/** Startup seeding only. */
export function hashPasswordSync(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 64, SCRYPT).toString('base64')}`;
}
const DUMMY_HASH = hashPasswordSync(randomBytes(12).toString('hex'));
/** Constant-work verification: unknown accounts still pay for one hash (no timing-based account discovery). */
export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  const [kind, sB64, hB64] = (stored ?? DUMMY_HASH).split('$');
  if (kind !== 'scrypt') return false;
  const hash = await scryptAsync(pw, Buffer.from(sB64, 'base64'));
  const expected = Buffer.from(hB64, 'base64');
  return !!stored && expected.length === hash.length && timingSafeEqual(expected, hash);
}

/* ---------------- sessions ---------------- */
/** Coarse device label for the session list (never the raw user-agent string or IP). */
function deviceLabel(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}
function createSession(reply: FastifyReply, userId: string, req?: FastifyRequest) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  db().run('INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent, last_used_at) VALUES (?, ?, ?, ?, ?)', sha256(token), userId, expires.toISOString(), deviceLabel(req?.headers['user-agent']), nowIso());
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', expires });
}
function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db().run('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?', nowIso(), sha256(token));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/* ---------------- login throttling (per account identifier, persisted) ---------------- */
const LOGIN_WINDOW_MS = 15 * 60_000, LOGIN_MAX_FAILURES = 5, LOCK_MS = 15 * 60_000;
function loginLocked(key: string): number | null {
  const r = db().get<{ locked_until: number | null }>('SELECT locked_until FROM auth_throttle WHERE key = ?', key);
  return r?.locked_until && r.locked_until > Date.now() ? r.locked_until : null;
}
function loginFailed(key: string): boolean {
  const now = Date.now();
  const r = db().get<{ failures: number; window_start: number }>('SELECT failures, window_start FROM auth_throttle WHERE key = ?', key);
  const fresh = !r || now - r.window_start > LOGIN_WINDOW_MS;
  const failures = fresh ? 1 : r!.failures + 1;
  const lock = failures >= LOGIN_MAX_FAILURES ? now + LOCK_MS : null;
  db().run('INSERT INTO auth_throttle (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until',
    key, failures, fresh ? now : r!.window_start, lock);
  return !!lock;
}
const loginCleared = (key: string) => db().run('DELETE FROM auth_throttle WHERE key = ?', key);
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
    preferences: prefsOf(u), onboarded: !u.is_guest,
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
    return { user: u ? publicMe(u) : null, providers: { google: providerConfigured('google'), apple: providerConfigured('apple'), devMode: config.devMode, email: emailStatus().configured } };
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

  /**
   * Onboarding step 1: what a date of birth allows. Nothing is stored; the server repeats the same
   * calculation at registration and on every request, so the client cannot change the outcome.
   */
  app.post('/api/auth/age-check', async (req) => {
    rateLimit(req, 'age-check', 30);
    const p = agePolicyFor(validateDob((req.body as any)?.dob));
    return {
      canRegister: p.canRegister, band: p.band, loungeEligible: p.loungeEligible, loungeMinAge: p.loungeMinAge,
      message: !p.canRegister ? 'PLAYZO accounts are for players aged 13 and over. You can still play every family game as a guest.'
        : p.band === 'teen' ? 'You can play every family game, join friends and climb the leaderboards.'
        : p.loungeEligible ? `Every family game is yours. You also meet the ${p.loungeMinAge}+ age requirement for the PLAYZO Lounge.`
        : `Every family game is yours. The PLAYZO Lounge opens at ${p.loungeMinAge}.`,
    };
  });

  /** Registration (or guest upgrade, keeping progress). */
  app.post('/api/auth/register', async (req, reply) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = str(b.email, 'Email', 5, 160).toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email', 'VALIDATION');
    // Players arriving from Google/Apple finish sign-up here (date of birth + username) without a password.
    const oauthPeek = typeof b.oauthTicket === 'string' ? peekOauthTicket(b.oauthTicket) : null;
    if (b.oauthTicket !== undefined && !oauthPeek) throw new HttpError(400, 'This sign-in has expired. Please start again.', 'OAUTH_EXPIRED');
    const password = oauthPeek ? null : str(b.password, 'Password', 8, 128);
    const username = str(b.username, 'Username', 3, 20);
    if (!validUsername(username)) throw new HttpError(400, 'Usernames use letters, numbers and _ (3-20)', 'VALIDATION');
    const dob = validateDob(b.dob);
    if (b.acceptTerms !== true) throw new HttpError(400, 'Please accept the Terms and Privacy Policy', 'VALIDATION');
    const band = bandFor(ageOn(dob));
    // Under-13 accounts stay closed until a verified parental-consent flow is enabled (guest play remains open).
    if (band === 'child' && !config.allowUnder13) {
      track('auth_under13_blocked', null);
      throw new HttpError(403, 'PLAYZO accounts are for players aged 13 and over. You can still play every family game as a guest.', 'UNDER_13');
    }
    const avatar = typeof b.avatar === 'string' && /^orb-([1-6])$/.test(b.avatar) ? b.avatar : `orb-${1 + Math.floor(Math.random() * 6)}`;
    const preferences = sanitizePrefs(b.preferences);
    let parentEmail: string | null = null;
    if (band === 'child') {
      parentEmail = str(b.parentEmail, 'Parent or guardian email', 5, 160).toLowerCase();
      if (!validEmail(parentEmail) || parentEmail === email) throw new HttpError(400, 'Enter a different, valid parent or guardian email', 'VALIDATION');
    }
    const pwHash = password ? await hashPassword(password) : null;
    if (db().get('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    const existingName = db().get<{ id: string }>('SELECT id FROM users WHERE username = ?', username);
    const guest = currentUser(req);
    if (existingName && existingName.id !== guest?.id) throw new HttpError(409, 'That username is taken', 'USERNAME_TAKEN');
    // Children get a generic display name; their chosen username stays private to friends.
    const display = band === 'child' ? username.slice(0, 1).toUpperCase() + username.slice(1, 3) + '***' : username;
    let id: string;
    if (guest && guest.is_guest) {
      id = guest.id;
      db().run('UPDATE users SET email=?, username=?, display_name=?, password_hash=?, is_guest=0, dob=?, age_band=?, parent_email=?, preferences=?' + (b.avatar ? ', avatar=?' : '') + ' WHERE id=?',
        ...[email, username, display, pwHash, dob, band, parentEmail, JSON.stringify(preferences), ...(b.avatar ? [avatar] : []), id]);
    } else {
      id = newId('u_');
      db().run('INSERT INTO users (id, email, username, display_name, password_hash, dob, age_band, parent_email, avatar, preferences) VALUES (?,?,?,?,?,?,?,?,?,?)', id, email, username, display, pwHash, dob, band, parentEmail, avatar, JSON.stringify(preferences));
      createSession(reply, id, req);
    }
    if (oauthPeek) {
      const t = takeOauthTicket(b.oauthTicket)!;
      linkIdentity(id, t);
      if (t.email && t.email === email) db().run('UPDATE users SET email_verified_at = ? WHERE id = ?', nowIso(), id); // provider verified it
    }
    db().run("INSERT INTO consents (user_id, kind, version) VALUES (?, 'terms', ?), (?, 'privacy', ?)", id, TERMS_VERSION, id, TERMS_VERSION);
    const vt = issueToken(id, 'verify_email', 48);
    sendEmail(email, 'verify_email', { url: `${config.publicUrl}/verify?token=${vt}` }, id);
    if (parentEmail) {
      const pt = issueToken(id, 'parent_consent', 24 * 7);
      sendEmail(parentEmail, 'parent_consent', { username, url: `${config.publicUrl}/parent-consent?token=${pt}` }, id);
    }
    // Referral tracking (attribution only; referrals never pay out currency).
    if (typeof b.ref === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(b.ref)) {
      const ref = db().get<{ id: string }>('SELECT id FROM users WHERE username = ? AND is_guest = 0 AND id != ?', b.ref, id);
      if (ref) db().run('UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL', ref.id, id);
    }
    notify(id, 'system', 'Welcome to PLAYZO!', emailStatus().configured ? 'Check your inbox to verify your email.' : 'Email delivery is not configured on this server yet, so verification links are kept in the local outbox.', '/settings');
    audit(id, guest?.is_guest ? 'auth.upgrade_guest' : 'auth.register', id, { band });
    track('auth_register', id, { band, upgraded: !!guest?.is_guest });
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', id)!) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const ident = str(b.identifier, 'Email or username', 3, 160);
    const password = str(b.password, 'Password', 1, 128);
    const key = `login:${ident.toLowerCase()}`;
    const locked = loginLocked(key);
    if (locked) throw new HttpError(429, 'Too many failed sign-in attempts. Try again in a few minutes or reset your password.', 'ACCOUNT_LOCKED', { retryAfterSec: Math.ceil((locked - Date.now()) / 1000) });
    const u = db().get<User>("SELECT * FROM users WHERE (email = ? OR username = ?) AND status = 'active' AND is_guest = 0", ident.toLowerCase(), ident);
    if (!(await verifyPassword(password, u ? (u.password_hash as string) : null)) || !u) {
      const nowLocked = loginFailed(key);
      if (nowLocked && u) {
        audit(u.id, 'auth.login_locked', u.id);
        notify(u.id, 'security', 'Sign-in temporarily locked', 'There were several failed attempts to sign in to your account. If this was not you, consider changing your password.', '/settings');
      }
      throw new HttpError(401, 'Incorrect email/username or password', 'BAD_CREDENTIALS');
    }
    loginCleared(key);
    const prior = currentUser(req);
    if (prior) destroySession(req, reply);
    createSession(reply, u.id, req);
    const device = deviceLabel(req.headers['user-agent']);
    notify(u.id, 'security', 'New sign-in', `Signed in on ${device}.`, '/settings');
    if (u.email && prefsFor(u.id).emailSecurity) sendEmail(u.email, 'new_sign_in', { when: new Date().toUTCString(), device, url: `${config.publicUrl}/settings` }, u.id);
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
      sendEmail(email, 'reset_password', { url: `${config.publicUrl}/reset?token=${t}` }, u.id);
    }
    return { ok: true }; // same response either way (no account enumeration)
  });

  app.post('/api/auth/reset', async (req) => {
    rateLimit(req, 'auth', 10);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const uid = consumeToken(str(b.token, 'Token', 10, 100), 'reset_password');
    const newHash = await hashPassword(str(b.password, 'Password', 8, 128));
    db().run('UPDATE users SET password_hash = ? WHERE id = ?', newHash, uid);
    db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), uid);
    const ru = db().get<{ email: string | null; username: string }>('SELECT email, username FROM users WHERE id = ?', uid);
    if (ru) { loginCleared(`login:${ru.username.toLowerCase()}`); if (ru.email) loginCleared(`login:${ru.email}`); }
    notify(uid, 'security', 'Password reset', 'Your password was reset and all devices were signed out.', '/settings');
    audit(uid, 'auth.password_reset', uid);
    return { ok: true };
  });

  app.post('/api/auth/change-password', async (req) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!(await verifyPassword(str(b.current, 'Current password', 1, 128), u.password_hash as string))) throw new HttpError(401, 'Current password is incorrect', 'BAD_CREDENTIALS');
    const changed = await hashPassword(str(b.password, 'New password', 8, 128));
    db().run('UPDATE users SET password_hash = ? WHERE id = ?', changed, u.id);
    // Sign out every other device; keep this one.
    const mine = req.cookies?.[SESSION_COOKIE];
    const revoked = db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?', nowIso(), u.id, mine ? sha256(mine) : '');
    notify(u.id, 'security', 'Password changed', 'Your password was changed and other devices were signed out.', '/settings');
    if (u.email && prefsFor(u.id).emailSecurity) sendEmail(u.email as string, 'password_changed', { url: `${config.publicUrl}/forgot` }, u.id);
    audit(u.id, 'auth.password_change', u.id);
    return { ok: true, otherSessionsRevoked: Number(revoked.changes) };
  });

  /** Account deletion: permanently removes personal data and gameplay history. */
  app.post('/api/auth/delete-account', async (req, reply) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm', 'VALIDATION');
    if (!u.is_guest && !(await verifyPassword(str(b.password, 'Password', 1, 128), u.password_hash as string))) throw new HttpError(401, 'Password is incorrect', 'BAD_CREDENTIALS');
    const hashed = sha256(u.id);
    db().tx(() => {
      db().run('INSERT OR REPLACE INTO deletion_requests (user_id, requested_at, completed_at) VALUES (?, ?, ?)', hashed, nowIso(), nowIso());
      db().run('DELETE FROM users WHERE id = ?', u.id); // cascades to all user-owned rows
      db().run('UPDATE analytics_events SET user_id = NULL WHERE user_id = ?', u.id);
    });
    audit(null, 'auth.account_deleted', hashed);
    if (u.email) sendEmail(u.email as string, 'account_deleted', {}, null);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Age assurance for the Lounge. Locally only the clearly-labelled dev attestation exists. */
  app.post('/api/auth/age-assurance', async (req) => {
    const u = requireUser(req);
    const method = str((req.body as any)?.method, 'Method', 2, 40);
    const provider = AGE_ASSURANCE_PROVIDERS[method];
    if (!provider) throw new HttpError(400, 'Unknown verification method', 'VALIDATION');
    if (!loungeAgeOk(u)) throw new HttpError(403, `The PLAYZO Lounge is for players aged ${config.loungeMinAge} and over`, 'NOT_ADULT');
    // Certified providers must complete their own redirect/callback flow (see ageAssurance adapter); a bare POST never verifies anyone.
    if (provider.production) throw new HttpError(501, 'This provider must be completed through its verification flow', 'NOT_CONFIGURED');
    if (!provider.production && (!config.devMode || config.production)) throw new HttpError(503, 'No production age-assurance provider is configured', 'NOT_CONFIGURED');
    // The dev attestation is not a real verification: only internal QA accounts on a dev server may use it.
    if (!provider.production && !isQaPreview(u)) {
      audit(u.id, 'access.age_assurance_refused', u.id, { method, reason: 'not_qa_account' });
      throw new HttpError(503, 'Age verification is not available yet: no certified provider is configured', 'NOT_CONFIGURED');
    }
    db().run('UPDATE users SET adult_verified_at = ?, adult_verify_method = ? WHERE id = ?', nowIso(), method, u.id);
    audit(u.id, 'access.age_assurance', u.id, { method, production: provider.production });
    return { ok: true, method, production: provider.production, label: provider.label };
  });

  app.post('/api/auth/lounge-terms', async (req) => {
    const u = requireUser(req);
    if (!loungeAgeOk(u)) throw new HttpError(403, `The PLAYZO Lounge is for players aged ${config.loungeMinAge} and over`, 'NOT_ADULT');
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
    if (b.preferences !== undefined) db().run('UPDATE users SET preferences = ? WHERE id = ?', JSON.stringify(sanitizePrefs(b.preferences)), u.id);
    if (b.displayName !== undefined && !u.is_guest && u.age_band !== 'child') {
      const dn = str(b.displayName, 'Display name', 2, 24);
      if (!/^[\p{L}\p{N} _.-]+$/u.test(dn)) throw new HttpError(400, 'Display names use letters, numbers, spaces, _ . -', 'VALIDATION');
      db().run('UPDATE users SET display_name = ? WHERE id = ?', dn, u.id);
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

  await oauthRoutes(app, { createSession });

  /** Active sign-in sessions (device label only) and revocation. */
  app.get('/api/auth/sessions', async (req) => {
    const u = requireUser(req);
    const mine = req.cookies?.[SESSION_COOKIE];
    const myHash = mine ? sha256(mine) : '';
    return {
      sessions: db().all<{ token_hash: string; user_agent: string | null; created_at: string; last_used_at: string | null; expires_at: string }>(
        'SELECT token_hash, user_agent, created_at, last_used_at, expires_at FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20', u.id, nowIso(),
      ).map((x) => ({ id: x.token_hash.slice(0, 16), device: x.user_agent ?? 'Unknown device', createdAt: x.created_at, lastUsedAt: x.last_used_at, current: x.token_hash === myHash })),
    };
  });
  app.post('/api/auth/sessions/revoke', async (req) => {
    const u = requireUser(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const mine = req.cookies?.[SESSION_COOKIE];
    const myHash = mine ? sha256(mine) : '';
    let n = 0;
    if (b.all === true) n = Number(db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?', nowIso(), u.id, myHash).changes);
    else {
      const id = str(b.id, 'Session', 16, 16);
      if (myHash.startsWith(id)) throw new HttpError(400, 'Use Sign out to end this session', 'VALIDATION');
      n = Number(db().run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND substr(token_hash, 1, 16) = ?', nowIso(), u.id, id).changes);
    }
    audit(u.id, 'auth.sessions_revoked', u.id, { count: n });
    return { ok: true, revoked: n };
  });
  app.post('/api/auth/resend-verification', async (req) => {
    const u = requireUser(req);
    rateLimit(req, 'resend-verify', 3);
    if (!u.email || u.email_verified_at) throw new HttpError(400, 'Nothing to verify', 'VALIDATION');
    sendEmail(u.email as string, 'verify_email', { url: `${config.publicUrl}/verify?token=${issueToken(u.id, 'verify_email', 48)}` }, u.id);
    return { ok: true, delivery: emailStatus() };
  });

  /** Dev-only email outbox viewer (the local delivery log). */
  app.get('/api/dev/outbox', async () => {
    if (!config.devMode) throw new HttpError(404, 'Not found', 'NOT_FOUND');
    return { delivery: emailStatus(), messages: db().all('SELECT id, to_email, subject, body, template, provider, status, attempts, last_error, created_at, sent_at FROM dev_outbox ORDER BY id DESC LIMIT 50') };
  });
}
