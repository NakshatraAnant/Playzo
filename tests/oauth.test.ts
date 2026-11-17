/**
 * Google/Apple sign-in adapter against a local stand-in OpenID provider (real RS256 signatures,
 * JWKS, PKCE verification). Proves the protocol handling; it is not a test against Google or Apple.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_RATE_LIMIT_MULTIPLIER = '10';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.local';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const { buildApp } = await import('../server/app');
const { PROVIDERS, _resetJwksCacheForTests } = await import('../server/oauth');
const { db } = await import('../server/db');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const codes = new Map<string, { challenge: string; claims: Record<string, unknown> }>();
let idp: http.Server, ISS = '';
function idToken(claims: Record<string, unknown>) {
  const h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), b = b64(claims);
  return `${h}.${b}.${sign('sha256', Buffer.from(`${h}.${b}`), privateKey).toString('base64url')}`;
}

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  idp = http.createServer((req, res) => {
    if (req.url === '/jwks') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (req.url === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d)).on('end', () => {
        const p = new URLSearchParams(body);
        const c = codes.get(p.get('code') ?? '');
        const pkceOk = c && createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url') === c.challenge;
        if (!c || !pkceOk || p.get('client_secret') !== 'test-secret') { res.statusCode = 400; return res.end('{"error":"invalid_grant"}'); }
        codes.delete(p.get('code')!);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id_token: idToken(c.claims) }));
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => idp.listen(0, '127.0.0.1', r));
  ISS = `http://127.0.0.1:${(idp.address() as any).port}`;
  Object.assign(PROVIDERS.google, { issuer: ISS, authUrl: `${ISS}/authorize`, tokenUrl: `${ISS}/token`, jwksUrl: `${ISS}/jwks` });
  _resetJwksCacheForTests();
  app = await buildApp();
});
afterAll(() => idp.close());

async function start(next = '/') {
  const r = await app.inject({ method: 'GET', url: `/api/auth/oauth/google/start?next=${encodeURIComponent(next)}` });
  expect(r.statusCode).toBe(302);
  const u = new URL(String(r.headers.location));
  expect(u.origin + u.pathname).toBe(`${ISS}/authorize`);
  expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  return { state: u.searchParams.get('state')!, nonce: u.searchParams.get('nonce')!, challenge: u.searchParams.get('code_challenge')! };
}
function issueCode(s: { nonce: string; challenge: string }, claims: Record<string, unknown> = {}) {
  const code = `c${Math.random().toString(36).slice(2)}`;
  const now = Math.floor(Date.now() / 1000);
  codes.set(code, { challenge: s.challenge, claims: { iss: ISS, aud: 'test-client.apps.local', sub: 'g-123', email: 'gplayer@gmail.test', email_verified: true, nonce: s.nonce, iat: now, exp: now + 300, ...claims } });
  return code;
}
const callback = (state: string, code: string, cookie = '') => app.inject({ method: 'GET', url: `/api/auth/oauth/google/callback?state=${state}&code=${code}`, headers: cookie ? { cookie } : {} });
const cookieOf = (r: any) => String([r.headers['set-cookie']].flat().find((c: any) => String(c).startsWith('pz_session=')) ?? '').split(';')[0];

describe('Google sign-in adapter', () => {
  it('reports configuration honestly', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(JSON.parse(me.body).providers).toMatchObject({ google: true, apple: false });
    expect((await app.inject({ method: 'GET', url: '/api/auth/oauth/apple/start' })).statusCode).toBe(501);
  });
  it('new player: callback → date-of-birth sign-up → identity linked; next time signs straight in', async () => {
    const s = await start('/games');
    const r = await callback(s.state, issueCode(s));
    expect(r.statusCode).toBe(302);
    const ticket = new URL(String(r.headers.location), 'http://x').searchParams.get('oauth')!;
    expect(ticket).toBeTruthy();
    const peek = JSON.parse((await app.inject({ method: 'GET', url: `/api/auth/oauth/ticket/${ticket}` })).body);
    expect(peek).toEqual({ provider: 'google', email: 'gplayer@gmail.test' });
    // Age policy still applies to Google sign-ups.
    const kid = new Date(Date.now() - 10 * 365.25 * 86400_000).toISOString().slice(0, 10);
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'x-playzo': '1' }, payload: { oauthTicket: ticket, email: 'gplayer@gmail.test', username: 'gkid', dob: kid, acceptTerms: true } });
    expect(blocked.statusCode).toBe(403);
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'x-playzo': '1' }, payload: { oauthTicket: ticket, email: 'gplayer@gmail.test', username: 'gplayer', dob: '1993-07-07', acceptTerms: true } });
    expect(reg.statusCode).toBe(200);
    const u = JSON.parse(reg.body).user;
    expect(u.emailVerified).toBe(true);
    expect(db().get<any>("SELECT user_id FROM oauth_identities WHERE provider = 'google' AND subject = 'g-123'").user_id).toBe(u.id);
    // Ticket is single use.
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'x-playzo': '1' }, payload: { oauthTicket: ticket, email: 'x@y.test', username: 'again1', dob: '1990-01-01', acceptTerms: true } })).statusCode).toBe(400);
    // Returning player: straight in, redirected to `next`.
    const s2 = await start('/games');
    const r2 = await callback(s2.state, issueCode(s2));
    expect(r2.headers.location).toBe('/games');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieOf(r2) } });
    expect(JSON.parse(me.body).user.username).toBe('gplayer');
    // No password exists for this account, so password sign-in is impossible.
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-playzo': '1' }, payload: { identifier: 'gplayer', password: 'anything-at-all' } })).statusCode).toBe(401);
  });
  it('rejects replayed state, wrong nonce, wrong audience, expired tokens, bad PKCE and open redirects', async () => {
    const s = await start();
    const code = issueCode(s, { sub: 'g-x1', email: 'x1@gmail.test' });
    await callback(s.state, code);
    expect(String((await callback(s.state, issueCode(s))).headers.location)).toContain('oauth_error=expired'); // state reused
    for (const [bad, why] of [[{ nonce: 'other' }, 'invalid_token'], [{ aud: 'someone-else' }, 'invalid_token'], [{ exp: 1000 }, 'invalid_token'], [{ iss: 'https://evil.test' }, 'invalid_token']] as const) {
      const st = await start();
      expect(String((await callback(st.state, issueCode(st, { sub: 'g-bad', ...bad }))).headers.location), JSON.stringify(bad)).toContain(`oauth_error=${why}`);
    }
    const st = await start();
    const c = issueCode(st, { sub: 'g-pkce' });
    codes.get(c)!.challenge = 'not-the-real-challenge';
    expect(String((await callback(st.state, c)).headers.location)).toContain('oauth_error=exchange_failed');
    const evil = await start('//evil.example/steal');
    const ok = await callback(evil.state, issueCode(evil));
    expect(String(ok.headers.location)).toBe('/');
  });
  it('never auto-merges into an existing password account with the same email; a signed-in player can link explicitly', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'x-playzo': '1' }, remoteAddress: '10.9.9.9', payload: { email: 'owner@gmail.test', username: 'owner1', password: 'password123', dob: '1988-01-01', acceptTerms: true } });
    const ck = cookieOf(reg);
    const s = await start();
    expect(String((await callback(s.state, issueCode(s, { sub: 'g-owner', email: 'owner@gmail.test' }))).headers.location)).toContain('oauth_error=email_exists');
    const s2 = await start('/settings');
    const linked = await callback(s2.state, issueCode(s2, { sub: 'g-owner', email: 'owner@gmail.test' }), ck);
    expect(String(linked.headers.location)).toContain('/settings?linked=google');
    const ids = JSON.parse((await app.inject({ method: 'GET', url: '/api/auth/identities', headers: { cookie: ck } })).body);
    expect(ids.identities[0]).toMatchObject({ provider: 'google' });
    expect(ids.hasPassword).toBe(true);
  });
});
