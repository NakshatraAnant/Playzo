/**
 * Economy service. Two non-redeemable currencies:
 *  - ZO   : earned through family play; spent only on cosmetics. Never purchasable, transferable or redeemable.
 *  - CHIPS: free Fun Chips for Lounge simulations; daily top-up only. Never purchasable, transferable or redeemable.
 * All mutations are atomic, ledgered and idempotent. The client can never set a balance.
 */
import { db, dayKey } from './db';
import { newId } from './secureRng';
import { HttpError } from './http';
import { config } from './config';

export type Currency = 'ZO' | 'CHIPS';
export type TxType = 'reward' | 'stake' | 'payout' | 'grant' | 'purchase' | 'admin_adjust' | 'refund';

export function balance(userId: string, currency: Currency): number {
  return db().get<{ balance: number }>('SELECT balance FROM balances WHERE user_id = ? AND currency = ?', userId, currency)?.balance ?? 0;
}

export interface PostResult { id: string; balance: number; duplicate: boolean }

/** Apply a signed amount. Throws INSUFFICIENT_FUNDS if it would go negative. Idempotent by key. */
export function post(userId: string, currency: Currency, amount: number, type: TxType, source: string, idempotencyKey: string, sessionId?: string | null, meta?: unknown): PostResult {
  if (!Number.isInteger(amount)) throw new Error('Ledger amounts must be integers');
  return db().tx(() => {
    const existing = db().get<{ id: string; balance_after: number }>('SELECT id, balance_after FROM ledger WHERE idempotency_key = ?', idempotencyKey);
    if (existing) return { id: existing.id, balance: balance(userId, currency), duplicate: true };
    db().run('INSERT OR IGNORE INTO balances (user_id, currency, balance) VALUES (?, ?, 0)', userId, currency);
    const cur = balance(userId, currency);
    const next = cur + amount;
    if (next < 0) throw new HttpError(409, currency === 'CHIPS' ? 'Not enough Fun Chips' : 'Not enough ZO coins', 'INSUFFICIENT_FUNDS');
    db().run('UPDATE balances SET balance = ? WHERE user_id = ? AND currency = ?', next, userId, currency);
    const id = newId('tx_');
    db().run(
      'INSERT INTO ledger (id, user_id, currency, amount, balance_after, type, source, session_id, idempotency_key, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, userId, currency, amount, next, type, source, sessionId ?? null, idempotencyKey, meta ? JSON.stringify(meta) : null,
    );
    return { id, balance: next, duplicate: false };
  });
}

/** Free daily Fun Chips top-up to the allowance (never above it). Lounge-entitled adults only (caller checks). */
export function dailyChipsTopUp(userId: string): { granted: number; balance: number } {
  const cur = balance(userId, 'CHIPS');
  const need = Math.max(0, config.chipsDailyTopUp - cur);
  if (!need) return { granted: 0, balance: cur };
  const r = post(userId, 'CHIPS', need, 'grant', 'daily_topup', `chips-topup:${userId}:${dayKey()}`);
  return { granted: r.duplicate ? 0 : need, balance: r.balance };
}

export function history(userId: string, limit = 50) {
  return db().all('SELECT id, currency, amount, balance_after, type, source, session_id, created_at FROM ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', userId, limit);
}

/** ZO earned today from gameplay (daily earning cap prevents farming). */
export function zoEarnedToday(userId: string): number {
  return db().get<{ t: number }>(
    "SELECT COALESCE(SUM(amount),0) AS t FROM ledger WHERE user_id = ? AND currency = 'ZO' AND type = 'reward' AND source LIKE 'game:%' AND created_at >= ?",
    userId, dayKey() + 'T00:00:00.000Z',
  )!.t;
}
export const ZO_DAILY_GAME_CAP = 400;
