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

export const config = {
  production,
  apiPort: Number(env.PLAYZO_API_PORT ?? 5758),
  webPort: Number(env.PLAYZO_WEB_PORT ?? 5757),
  publicUrl: env.PLAYZO_PUBLIC_URL ?? 'http://localhost:5757',
  dbPath: env.PLAYZO_DB_PATH ?? 'data/playzo.db',
  /** Dev mode features are always refused in production. */
  devMode: !production && bool(env.PLAYZO_DEV_MODE ?? 'true'),
  legalApprovals: parseApprovals(env.PLAYZO_LEGAL_APPROVALS),
  /**
   * Master switch for the public Lounge. OFF by default. Even when ON, each game also needs a
   * PLAYZO_LEGAL_APPROVALS entry whose reference matches an 'approved' legal_reviews record.
   */
  loungeEnabled: bool(env.PLAYZO_LOUNGE_ENABLED),
  /** Internal QA preview: localhost only, never in production, and only for admin/tester accounts. */
  adultDevPreview: !production && bool(env.PLAYZO_ADULT_DEV_PREVIEW),
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
};

if (production && bool(env.PLAYZO_ADULT_DEV_PREVIEW)) {
  console.warn('[playzo] PLAYZO_ADULT_DEV_PREVIEW is ignored in production.');
}
