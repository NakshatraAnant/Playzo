import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env loader (no external dependency). Existing process env wins. */
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const env = process.env;
const production = env.NODE_ENV === 'production';
const bool = (v: string | undefined) => v === 'true' || v === '1';

/** Parse "game-id:LEGAL-REF,game-id:REF" into a map. */
function parseApprovals(v: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [id, ref] = part.split(':');
    if (id && ref) out[id.trim()] = ref.trim();
  }
  return out;
}

const publicUrl = (env.PLAYZO_PUBLIC_URL || 'http://localhost:5757').replace(/\/+$/, '');
const isLocalHost = (h: string) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(h) || h.endsWith('.localhost');
const localPublicUrl = (() => { try { return isLocalHost(new URL(publicUrl).hostname); } catch { return false; } })();
/** Fastify trustProxy value: number of proxy hops, or a comma-separated list of proxy addresses. */
function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (!v || v === 'false') return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}

export const config = {
  production,
  /** Interface to listen on. 'localhost' = this computer only; use 0.0.0.0 in a container behind a TLS proxy. */
  host: env.PLAYZO_HOST || 'localhost',
  /** Set when a reverse proxy sits in front, so rate limits see real client addresses. */
  trustProxy: parseTrustProxy(env.PLAYZO_TRUST_PROXY),
  logLevel: env.PLAYZO_LOG_LEVEL || '',
  localPublicUrl,
  secureCookies: publicUrl.startsWith('https:'),
  apiPort: Number(env.PLAYZO_API_PORT ?? 5758),
  webPort: Number(env.PLAYZO_WEB_PORT ?? 5757),
  publicUrl,
  dbPath: env.PLAYZO_DB_PATH ?? 'data/playzo.db',
  /** Dev mode features are always refused in production. */
  devMode: !production && localPublicUrl && bool(env.PLAYZO_DEV_MODE ?? 'true'),
  legalApprovals: parseApprovals(env.PLAYZO_LEGAL_APPROVALS),
  /**
   * Master switch for the public Lounge. OFF by default. Even when ON, each game also needs a
   * PLAYZO_LEGAL_APPROVALS entry whose reference matches an 'approved' legal_reviews record.
   */
  loungeEnabled: bool(env.PLAYZO_LOUNGE_ENABLED),
  /** Internal QA preview: localhost only, never in production, and only for admin/tester accounts. */
  adultDevPreview: !production && localPublicUrl && bool(env.PLAYZO_ADULT_DEV_PREVIEW),
  /** PLAYZO Lounge minimum age (product decision: 21). Computed from date of birth on every request. */
  loungeMinAge: Math.max(18, Number(env.PLAYZO_LOUNGE_MIN_AGE ?? 21)),
  /** Require an age-assurance result (not just a self-declared date of birth) for the Lounge. */
  loungeRequireAgeAssurance: (env.PLAYZO_LOUNGE_REQUIRE_AGE_ASSURANCE ?? 'true') !== 'false',
  /** Under-13 accounts stay closed until a verified parental-consent flow (with real email delivery) is enabled. */
  allowUnder13: bool(env.PLAYZO_ALLOW_UNDER13),
  /** Serve the built app (dist/) from the API process outside production (`npm run local`). */
  serveDist: bool(env.PLAYZO_SERVE_DIST),
  /** Adult age verification must be renewed after this many days. */
  ageVerificationDays: Number(env.PLAYZO_AGE_VERIFICATION_DAYS ?? 365),
  email: {
    provider: (env.PLAYZO_EMAIL_PROVIDER || 'outbox') as 'outbox' | 'resend',
    from: env.PLAYZO_EMAIL_FROM || '',
    resendApiKey: env.RESEND_API_KEY || '',
  },
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  appleClientId: env.APPLE_CLIENT_ID || '',
  adminEmail: env.PLAYZO_ADMIN_EMAIL || '',
  adminPassword: env.PLAYZO_ADMIN_PASSWORD || '',
  sessionDays: 30,
  /** Daily free Fun Chips allowance (Lounge only, non-redeemable, never purchasable). */
  chipsDailyTopUp: 10_000,
  /** Automated-test environments only: loosens rate limits. Always 1 in production. */
  rateLimitMultiplier: production ? 1 : Math.max(1, Number(env.PLAYZO_RATE_LIMIT_MULTIPLIER ?? 1)),
};

/** Start-up checks. Errors stop the server: a half-configured public server is worse than none. */
export function configProblems(c: Pick<typeof config, 'production' | 'publicUrl' | 'localPublicUrl' | 'host' | 'adminEmail' | 'adminPassword' | 'email'> = config): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  let url: URL | null = null;
  try { url = new URL(c.publicUrl); } catch { errors.push(`PLAYZO_PUBLIC_URL is not a valid URL: ${c.publicUrl}`); }
  if (!c.production && (!isLocalHost(c.host) || !c.localPublicUrl)) errors.push('Development mode is for this computer only. Set NODE_ENV=production to use a public PLAYZO_HOST or PLAYZO_PUBLIC_URL.');
  if (c.production) {
    if (url && url.protocol !== 'https:' && !c.localPublicUrl) errors.push('PLAYZO_PUBLIC_URL must be https in production.');
    if (c.adminEmail && c.adminPassword && c.adminPassword.length < 12) errors.push('PLAYZO_ADMIN_PASSWORD must be at least 12 characters.');
    if (c.localPublicUrl) warnings.push('PLAYZO_PUBLIC_URL points at localhost: emailed links will not work for other people.');
    if (c.email.provider !== 'resend' || !c.email.resendApiKey || !c.email.from) warnings.push('No email provider configured: verification and password-reset emails are NOT delivered.');
  }
  return { errors, warnings };
}

if (production && bool(env.PLAYZO_ADULT_DEV_PREVIEW)) {
  console.warn('[playzo] PLAYZO_ADULT_DEV_PREVIEW is ignored in production.');
}
