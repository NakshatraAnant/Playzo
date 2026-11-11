import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt } from '../../../shared/engine';

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type Variant = 'eu' | 'us' | 'fr';
export type BetKind = 'straight' | 'split' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column';
export interface Bet { kind: BetKind; n?: number; a?: number; b?: number; amount: number }
interface RState extends ChanceState { variant: Variant; last: null | { pocket: number; label: string; bets: (Bet & { won: number })[] } }
type A = { type: 'spin'; bets: Bet[] };

/** Pocket index: 0..36, and 37 represents "00" (American wheel only). */
export const pocketLabel = (p: number) => (p === 37 ? '00' : String(p));
export const PAYS: Record<BetKind, number> = { straight: 35, split: 17, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
const EVEN_MONEY: BetKind[] = ['red', 'black', 'odd', 'even', 'low', 'high'];

export function covers(bet: Bet, p: number): boolean {
  const num = p === 37 ? -1 : p;
  switch (bet.kind) {
    case 'straight': return bet.n === p;
    case 'split': return bet.a === p || bet.b === p;
    case 'red': return RED.has(num);
    case 'black': return num >= 1 && !RED.has(num);
    case 'odd': return num >= 1 && num % 2 === 1;
    case 'even': return num >= 1 && num % 2 === 0;
    case 'low': return num >= 1 && num <= 18;
    case 'high': return num >= 19 && num <= 36;
    case 'dozen': return num >= 1 && Math.floor((num - 1) / 12) === bet.n;
    case 'column': return num >= 1 && (num - 1) % 3 === bet.n;
  }
}

export function validateBet(b: Bet, variant: Variant): Bet {
  const amount = clampInt(b.amount, 10, 5000);
  const maxPocket = variant === 'us' ? 37 : 36;
  switch (b.kind) {
    case 'straight': return { kind: 'straight', n: clampInt(b.n, 0, maxPocket), amount };
    case 'split': {
      const a = clampInt(b.a, 1, 36), c = clampInt(b.b, 1, 36);
      const lo = Math.min(a, c), hi = Math.max(a, c);
      const adjacent = hi - lo === 3 || (hi - lo === 1 && Math.floor((lo - 1) / 3) === Math.floor((hi - 1) / 3));
      if (!adjacent) throw new GameError('Split must cover two adjacent numbers');
      return { kind: 'split', a: lo, b: hi, amount };
    }
    case 'dozen': case 'column': return { kind: b.kind, n: clampInt(b.n, 0, 2), amount };
    default:
      if (!EVEN_MONEY.includes(b.kind)) throw new GameError('Unknown bet');
      return { kind: b.kind, amount };
  }
}

/** Theoretical RTP of a bet type on a variant (exact). */
export function theoreticalRtp(kind: BetKind, variant: Variant): number {
  const pockets = variant === 'us' ? 38 : 37;
  const sample: Bet = kind === 'straight' ? { kind, n: 17, amount: 1 } : kind === 'split' ? { kind, a: 17, b: 20, amount: 1 } : kind === 'dozen' || kind === 'column' ? { kind, n: 0, amount: 1 } : { kind, amount: 1 };
  let ret = 0;
  for (let p = 0; p < pockets; p++) ret += settleOne(sample, p, variant);
  return ret / pockets;
}

export function settleOne(b: Bet, p: number, variant: Variant): number {
  if (covers(b, p)) return b.amount * (PAYS[b.kind] + 1);
  if (variant === 'fr' && p === 0 && EVEN_MONEY.includes(b.kind)) return b.amount / 2; // La Partage
  return 0;
}

export function rouletteEngine(variant: Variant, id: string): Engine<RState, A> {
  return {
    id, rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
    init: () => ({ ...newChanceState(), variant, last: null }),
    apply(s, a, ctx) {
      if (a.type !== 'spin' || !Array.isArray(a.bets) || !a.bets.length) throw new GameError('Place at least one bet');
      if (a.bets.length > 40) throw new GameError('Too many bets');
      const bets = a.bets.map((b) => validateBet(b, variant));
      if (bets.reduce((t, b) => t + b.amount, 0) > 20000) throw new GameError('Table limit is 20,000 Fun Chips per spin');
      s.round++;
      const ref = `r${s.round}`;
      bets.forEach((b, i) => stake(s, b.amount, ctx, `${ref}-b${i}`));
      const pocket = ctx.rng.int(variant === 'us' ? 38 : 37);
      const settled = bets.map((b) => ({ ...b, won: Math.floor(settleOne(b, pocket, variant)) }));
      const total = settled.reduce((t, b) => t + b.won, 0);
      payout(s, total, `${ref}-win`);
      s.last = { pocket, label: pocketLabel(pocket), bets: settled };
      pushHistory(s, { pocket, label: pocketLabel(pocket), staked: bets.reduce((t, b) => t + b.amount, 0), returned: total });
      return s;
    },
    isOver: () => false,
    result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked }, summary: { rounds: s.round } }),
    view: (s) => ({ variant: s.variant, last: s.last, history: s.history, round: s.round, net: s.totalReturned - s.totalStaked }),
  };
}

export const euRoulette = rouletteEngine('eu', 'eu-roulette');
export const usRoulette = rouletteEngine('us', 'us-roulette');
export const frRoulette = rouletteEngine('fr', 'fr-roulette');
