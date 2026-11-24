/**
 * Google and Apple sign-in (OpenID Connect, authorization-code flow with PKCE, state and nonce).
 *
 * Activation: set the provider's credentials in .env (see DEPLOYMENT_GUIDE.md). Without them the
 * buttons stay disabled and the endpoints answer 501. The flow is exercised in tests against a local
 * stand-in identity provider; it has not been run against Google or Apple from this machine.
 *
 *  1. GET  /api/auth/oauth/:p/start     -> redirect to the provider (PKCE S256, state, nonce)
 *  2. GET|POST /api/auth/oauth/:p/callback -> code exchange, ID-token signature/iss/aud/exp/nonce checks
 *  3a. known identity                    -> signed in
 *  3b. new identity                      -> /register?oauth=<ticket>: the date-of-birth step and
 *      username are still required, so the age policy applies to every account.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, verify as cryptoVerify, KeyObject } from 'node:crypto';
import { db } from './db';
import { config } from './config';
import { HttpError, currentUser, audit, rateLimit } from './http';
import { track } from './analytics';

export type ProviderId = 'google' | 'apple';
export interface OidcProvider {
  id: ProviderId; issuer: string; authUrl: string; tokenUrl: string; jwksUrl: string; scope: string;
  clientId: () => string; clientSecret: () => string; responseMode?: 'form_post';
}
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Apple's client secret is a short-lived ES256 JWT signed with the .p8 key from the Apple developer account. */
function appleClientSecret(): string {
  const key = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!key || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID) return '';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })));
  const body = b64url(Buffer.from(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: config.appleClientId })));
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(key), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

export const PROVIDERS: Record<ProviderId, OidcProvider> = {
  google: {
    id: 'google', issuer: 'https://accounts.google.com', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', scope: 'openid email', clientId: () => config.googleClientId, clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  apple: {
    id: 'apple', issuer: 'https://appleid.apple.com', authUrl: 'https://appleid.apple.com/auth/authorize', tokenUrl: 'https://appleid.apple.com/auth/token',
    jwksUrl: 'https://appleid.apple.com/auth/keys', scope: 'email', responseMode: 'form_post', clientId: () => config.appleClientId, clientSecret: appleClientSecret,
  },
};
export const providerConfigured = (p: ProviderId) => !!(PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret());

/* Short-lived, single-use state (10 min). Single-process by design, like rooms' memory cache. */
const pending = new Map<string, { provider: ProviderId; verifier: string; nonce: string; next: string; userId: string | null; at: number }>();
const tickets = new Map<string, { provider: ProviderId; subject: string; email: string | null; at: number }>();
setInterval(() => { const cut = Date.now() - 10 * 60_000; for (const m of [pending, tickets]) for (const [k, v] of m) if (v.at < cut) m.delete(k); }, 60_000).unref();
/** The state must come back to the browser that started the flow; otherwise a crafted link could link an attacker's identity to a victim's account. */
const STATE_COOKIE = 'pz_oauth';
const safeNext = (n: unknown) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : '/');

/* ---------------- ID token verification ---------------- */
let jwksCache: Record<string, { at: number; keys: any[] }> = {};
async function jwks(p: OidcProvider): Promise<any[]> {
  const c = jwksCache[p.id];
  if (c && Date.now() - c.at < 3600_000) return c.keys;
  const r = await fetch(p.jwksUrl, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new HttpError(502, 'Could not reach the sign-in provider', 'OAUTH_PROVIDER');
  const keys = ((await r.json()) as any).keys ?? [];
  jwksCache[p.id] = { at: Date.now(), keys };
  return keys;
}
export function _resetJwksCacheForTests() { jwksCache = {}; }
export async function verifyIdToken(p: OidcProvider, token: string, nonce: string) {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) throw new HttpError(401, 'Invalid sign-in token', 'OAUTH_TOKEN');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (!['RS256', 'ES256'].includes(header.alg)) throw new HttpError(401, 'Unsupported sign-in token', 'OAUTH_TOKEN');
  const jwk = (await jwks(p)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'Unknown signing key', 'OAUTH_TOKEN');
  const key: KeyObject = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = cryptoVerify('sha256', Buffer.from(`${h}.${b}`), header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key, Buffer.from(s, 'base64url'));
  if (!ok) throw new HttpError(401, 'Sign-in token signature is invalid', 'OAUTH_TOKEN');
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== p.issuer && !(p.id === 'google' && claims.iss === 'accounts.google.com')) throw new HttpError(401, 'Wrong token issuer', 'OAUTH_TOKEN');
  if (claims.aud !== p.clientId() && !(Array.isArray(claims.aud) && claims.aud.includes(p.clientId()))) throw new HttpError(401, 'Token is for another app', 'OAUTH_TOKEN');
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new HttpError(401, 'Sign-in token expired', 'OAUTH_TOKEN');
  if (claims.nonce !== nonce) throw new HttpError(401, 'Sign-in token replay detected', 'OAUTH_TOKEN');
  if (!claims.sub) throw new HttpError(401, 'Sign-in token has no subject', 'OAUTH_TOKEN');
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  return { subject: String(claims.sub), email: claims.email && emailVerified ? String(claims.email).toLowerCase() : null };
}

/** Consumed by /api/auth/register when a new player finishes sign-up after Google/Apple. */
export function takeOauthTicket(t: unknown) {
  if (typeof t !== 'string') return null;
  const v = tickets.get(t);
  if (!v) throw new HttpError(400, 'This sign-in has expired. Please start again.', 'OAUTH_EXPIRED');
  tickets.delete(t);
  return v;
}
export function peekOauthTicket(t: string) { const v = tickets.get(t); return v ? { provider: v.provider, email: v.email } : null; }
export function linkIdentity(userId: string, v: { provider: ProviderId; subject: string; email: string | null }) {
  db().run('INSERT INTO oauth_identities (provider, subject, user_id, email) VALUES (?, ?, ?, ?)', v.provider, v.subject, userId, v.email);
}

export async function oauthRoutes(app: FastifyInstance, opts: { createSession: (reply: FastifyReply, userId: string, req?: FastifyRequest) => void }) {
  const prov = (req: FastifyRequest) => {
    const id = (req.params as any).provider as ProviderId;
    if (!Object.hasOwn(PROVIDERS, id)) throw new HttpError(404, 'Unknown provider', 'NOT_FOUND');
    if (!providerConfigured(id)) throw new HttpError(501, `${id === 'google' ? 'Google' : 'Apple'} sign-in is not configured on this server`, 'NOT_CONFIGURED');
    return PROVIDERS[id];
  };
  const redirectUri = (p: OidcProvider) => `${config.publicUrl}/api/auth/oauth/${p.id}/callback`;

  app.get('/api/auth/oauth/:provider/start', async (req, reply) => {
    const p = prov(req);
    rateLimit(req, 'oauth', 20, 'ip');
    const me = currentUser(req);
    const state = b64url(randomBytes(24)), nonce = b64url(randomBytes(16)), verifier = b64url(randomBytes(32));
    pending.set(state, { provider: p.id, verifier, nonce, next: safeNext((req.query as any).next), userId: me && !me.is_guest ? me.id : null, at: Date.now() });
    // Apple answers with a cross-site POST, which only carries SameSite=None cookies (HTTPS only).
    reply.setCookie(STATE_COOKIE, state, { httpOnly: true, path: '/api/auth/oauth', maxAge: 600, secure: config.secureCookies, sameSite: p.responseMode === 'form_post' && config.secureCookies ? 'none' : 'lax' });
    const q = new URLSearchParams({
      client_id: p.clientId(), redirect_uri: redirectUri(p), response_type: 'code', scope: p.scope, state, nonce,
      code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
      ...(p.responseMode ? { response_mode: p.responseMode } : { prompt: 'select_account' }),
    });
    return reply.redirect(`${p.authUrl}?${q}`, 302);
  });

  const callback = async (req: FastifyRequest, reply: FastifyReply) => {
    const p = prov(req);
    const src = (req.method === 'POST' ? req.body : req.query) as Record<string, string>;
    const fail = (why: string) => reply.redirect(`/login?oauth_error=${encodeURIComponent(why)}`, 302);
    if (src?.error) return fail(src.error === 'access_denied' || src.error === 'user_cancelled_authorize' ? 'cancelled' : 'provider_error');
    const st = pending.get(String(src?.state ?? ''));
    if (!st || st.provider !== p.id || req.cookies[STATE_COOKIE] !== String(src.state)) return fail('expired');
    pending.delete(String(src.state)); // single use
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' });
    const tok = await fetch(p.tokenUrl, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(src.code ?? ''), redirect_uri: redirectUri(p), client_id: p.clientId(), client_secret: p.clientSecret(), code_verifier: st.verifier }),
    }).catch(() => null);
    if (!tok || !tok.ok) return fail('exchange_failed');
    const idToken = ((await tok.json().catch(() => ({}))) as any).id_token;
    let ident: { subject: string; email: string | null };
    try { ident = await verifyIdToken(p, String(idToken ?? ''), st.nonce); } catch { return fail('invalid_token'); }
    const known = db().get<{ user_id: string; status: string }>('SELECT i.user_id, u.status FROM oauth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?', p.id, ident.subject);
    if (known && known.status !== 'active') return fail('suspended');
    if (known && st.userId && known.user_id !== st.userId) return fail('linked_elsewhere');
    if (known) {
      opts.createSession(reply, known.user_id, req);
      track('auth_login', known.user_id, { via: p.id });
      return reply.redirect(st.next, 302);
    }
    // Signed in already (password account): link the identity to it.
    const me = st.userId ? db().get<{ id: string }>("SELECT id FROM users WHERE id = ? AND status = 'active'", st.userId) : null;
    if (me) {
      linkIdentity(me.id, { provider: p.id, ...ident });
      audit(me.id, 'auth.oauth_linked', me.id, { provider: p.id });
      return reply.redirect('/settings?linked=' + p.id, 302);
    }
    // Same verified email as an existing account: never auto-merge (account-takeover risk); ask the player to sign in and link.
    if (ident.email && db().get('SELECT 1 FROM users WHERE email = ?', ident.email)) return fail('email_exists');
    const ticket = b64url(randomBytes(24));
    tickets.set(ticket, { provider: p.id, subject: ident.subject, email: ident.email, at: Date.now() });
    return reply.redirect(`/register?oauth=${ticket}`, 302);
  };
  app.get('/api/auth/oauth/:provider/callback', callback);
  app.post('/api/auth/oauth/:provider/callback', callback); // Apple uses form_post

  app.get('/api/auth/oauth/ticket/:t', async (req) => {
    const v = peekOauthTicket((req.params as any).t);
    if (!v) throw new HttpError(404, 'This sign-in has expired. Please start again.', 'OAUTH_EXPIRED');
    return v;
  });
  app.get('/api/auth/identities', async (req) => {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, 'Sign in first', 'AUTH_REQUIRED');
    return { identities: db().all('SELECT provider, email, created_at FROM oauth_identities WHERE user_id = ?', u.id), hasPassword: !!u.password_hash };
  });
}
