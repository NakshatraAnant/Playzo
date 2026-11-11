/**
 * Access policy: age bands, Lounge (18+) entitlement and legal gates.
 * Every decision here is enforced server-side; the client only mirrors it for display.
 */
import { config } from './config';
import { db } from './db';
import { BY_ID, GameMeta } from '../shared/catalogue';
import type { User } from './http';

export type AgeBand = 'unknown' | 'child' | 'teen' | 'adult';

export function ageOn(dob: string, at = new Date()): number {
  const d = new Date(dob + 'T00:00:00Z');
  let age = at.getUTCFullYear() - d.getUTCFullYear();
  const m = at.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
export const bandFor = (age: number): AgeBand => (age < 13 ? 'child' : age < 18 ? 'teen' : 'adult');

/** Age-assurance providers. Only 'dev-attestation' exists locally and is refused in production. */
export const AGE_ASSURANCE_PROVIDERS: Record<string, { strong: boolean; production: boolean; label: string }> = {
  'dev-attestation': { strong: true, production: false, label: 'Local development attestation (NOT a real verification)' },
  // Production providers (e.g. DigiLocker-based or document + liveness checks) are added only after legal review.
};

export type LegalGate = 'approved' | 'dev-preview' | 'pending_legal_review';
export function legalGate(gameId: string): { status: LegalGate; ref: string | null } {
  if (config.legalApprovals[gameId]) return { status: 'approved', ref: config.legalApprovals[gameId] };
  if (config.adultDevPreview) return { status: 'dev-preview', ref: null };
  return { status: 'pending_legal_review', ref: null };
}

export interface LoungeAccess { entitled: boolean; reasons: string[]; cooloffUntil: string | null }

/** Is this user entitled to the Lounge environment at all (independent of individual game gates)? */
export function loungeAccess(u: User | null): LoungeAccess {
  const reasons: string[] = [];
  if (!u) return { entitled: false, reasons: ['not_signed_in'], cooloffUntil: null };
  if (u.is_guest) reasons.push('guest_account');
  if (u.age_band !== 'adult') reasons.push('not_adult');
  // Re-check DOB at request time (people age; bands are cached).
  if (u.dob && bandFor(ageOn(u.dob)) !== 'adult') reasons.push('not_adult');
  const method = u.adult_verify_method as string | null;
  const provider = method ? AGE_ASSURANCE_PROVIDERS[method] : undefined;
  if (!u.adult_verified_at || !provider) reasons.push('age_not_verified');
  else if (config.production && !provider.production) reasons.push('age_verification_not_production_grade');
  const consent = db().get('SELECT 1 AS ok FROM consents WHERE user_id = ? AND kind = ?', u.id, 'lounge_terms');
  if (!consent) reasons.push('lounge_terms_not_accepted');
  const cool = (u as any).lounge_cooloff_until as string | null;
  if (cool && cool > new Date().toISOString()) reasons.push('cool_off_active');
  return { entitled: reasons.length === 0, reasons: [...new Set(reasons)], cooloffUntil: cool && cool > new Date().toISOString() ? cool : null };
}

/** Can the user see this game in listings/APIs at all? Lounge games are invisible without entitlement. */
export function canSee(u: User | null, g: GameMeta): boolean {
  if (g.env === 'family') return true;
  return loungeAccess(u).entitled;
}

export function gameStatus(gameId: string): string {
  return db().get<{ status: string }>('SELECT status FROM game_settings WHERE game_id = ?', gameId)?.status ?? 'live';
}

/** Full check before starting a session. Returns a reason code when refused. */
export function canPlay(u: User, gameId: string): { ok: true; gate?: LegalGate } | { ok: false; status: number; code: string; message: string } {
  const g = BY_ID[gameId];
  if (!g) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Game not found' };
  const st = gameStatus(gameId);
  if (st === 'maintenance') return { ok: false, status: 503, code: 'MAINTENANCE', message: 'This game is in maintenance. Please try again later.' };
  if (st === 'hidden') return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Game not found' };
  if (g.env === 'family') return { ok: true };
  const acc = loungeAccess(u);
  // Do not reveal Lounge game existence to non-entitled users.
  if (!acc.entitled) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Game not found' };
  const gate = legalGate(gameId);
  if (gate.status === 'pending_legal_review') return { ok: false, status: 451, code: 'LEGAL_GATE', message: 'This simulation is disabled until legal review is complete.' };
  return { ok: true, gate: gate.status };
}

/** Social permissions by age band. Under-13s need parental consent for any multiplayer. */
export function socialPolicy(u: User) {
  const child = u.age_band === 'child' || u.age_band === 'unknown';
  return {
    canSearchUsers: !child,
    canBeFound: !child,
    canSendFriendRequests: !u.is_guest && (!child || !!u.parental_consent_at),
    canJoinPrivateRooms: !u.is_guest ? (!child || !!u.parental_consent_at) : true,
    canUsePublicMatchmaking: !u.is_guest && (u.age_band === 'teen' || u.age_band === 'adult'),
    canPurchase: !u.is_guest && u.age_band === 'adult',
    personalisedAds: false, // PLAYZO serves contextual house placements only
    chat: 'emotes-only',
  };
}
