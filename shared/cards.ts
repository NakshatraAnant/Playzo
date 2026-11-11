/**
 * Card utilities. A card is an integer 0..51: rank = (c % 13) + 2 (2..14, 14 = Ace),
 * suit = floor(c / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs).
 */
import type { Rng } from './rng';

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANK_LABEL: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
export const rank = (c: number) => (c % 13) + 2;
export const suit = (c: number) => Math.floor(c / 13) % 4;
export const cardLabel = (c: number) => `${RANK_LABEL[rank(c)]}${SUITS[suit(c)]}`;

export function freshDeck(decks = 1): number[] {
  const out: number[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) out.push(c);
  return out;
}
export function shuffledDeck(rng: Rng, decks = 1): number[] {
  return rng.shuffle(freshDeck(decks));
}

/** Blackjack point value. */
export function bjValue(c: number): number {
  const r = rank(c);
  if (r === 14) return 11;
  return r >= 10 ? 10 : r;
}
export function bjTotal(cards: number[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += bjValue(c);
    if (rank(c) === 14) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBlackjack = (cards: number[]) => cards.length === 2 && bjTotal(cards).total === 21;

/** Baccarat point value (A=1, 2-9 face, 10/J/Q/K = 0). */
export function bacValue(c: number): number {
  const r = rank(c);
  if (r === 14) return 1;
  return r >= 10 ? 0 : r;
}
export const bacTotal = (cards: number[]) => cards.reduce((t, c) => t + bacValue(c), 0) % 10;

/* ---------------- 5-card poker evaluation ---------------- */
export const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];
const B5 = Math.pow(16, 5);

/** Returns a comparable score: category * 16^5 + kickers. Higher is better. */
export function eval5(cards: number[]): number {
  const ranks = cards.map(rank).sort((a, b) => b - a);
  const flush = cards.every((c) => suit(c) === suit(cards[0]));
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // wheel A-2-3-4-5
  }
  const pack = (cat: number, ks: number[]) => {
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] ?? 0);
    return cat * B5 + v;
  };
  if (straightHigh && flush) return pack(straightHigh === 14 ? 9 : 8, [straightHigh]);
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]]);
  if (flush) return pack(5, ranks);
  if (straightHigh) return pack(4, [straightHigh]);
  if (groups[0][1] === 3) return pack(3, groups.map((g) => g[0]));
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(2, groups.map((g) => g[0]));
  if (groups[0][1] === 2) return pack(1, groups.map((g) => g[0]));
  return pack(0, ranks);
}
export const handCategory = (score: number) => Math.floor(score / B5);

export function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

export function bestHoldem(hole: number[], board: number[]): { score: number; cards: number[] } {
  let best = { score: -1, cards: [] as number[] };
  for (const c of combos([...hole, ...board], 5)) {
    const s = eval5(c);
    if (s > best.score) best = { score: s, cards: c };
  }
  return best;
}

/** Omaha: exactly two hole cards and three board cards. */
export function bestOmaha(hole: number[], board: number[]): { score: number; cards: number[] } {
  let best = { score: -1, cards: [] as number[] };
  for (const h of combos(hole, 2)) for (const b of combos(board, 3)) {
    const s = eval5([...h, ...b]);
    if (s > best.score) best = { score: s, cards: [...h, ...b] };
  }
  return best;
}

/* ---------------- 3-card hands ---------------- */
export type ThreeCardStyle = 'teenpatti' | 'threecardpoker';
export const TEEN_PATTI_NAMES = ['High Card', 'Pair', 'Colour', 'Sequence', 'Pure Sequence', 'Trail'];
export const THREE_CARD_NAMES = ['High Card', 'Pair', 'Flush', 'Straight', 'Three of a Kind', 'Straight Flush'];
const B3 = Math.pow(64, 3);

/**
 * 3-card evaluation. Category indexes:
 *  teenpatti:      0 high, 1 pair, 2 colour, 3 sequence, 4 pure sequence, 5 trail
 *  threecardpoker: 0 high, 1 pair, 2 flush,  3 straight, 4 trips,         5 straight flush
 * A-2-3 is the lowest straight in Three Card Poker; in Teen Patti it ranks just below A-K-Q.
 */
export function eval3(cards: number[], style: ThreeCardStyle): number {
  const r = cards.map(rank).sort((a, b) => b - a);
  const flush = suit(cards[0]) === suit(cards[1]) && suit(cards[1]) === suit(cards[2]);
  const trips = r[0] === r[2];
  let seqHigh = 0; // doubled to keep the A-2-3 teen patti special case integral
  if (!trips && r[0] - r[2] === 2 && r[0] !== r[1] && r[1] !== r[2]) seqHigh = r[0] * 2;
  if (r[0] === 14 && r[1] === 3 && r[2] === 2) seqHigh = style === 'teenpatti' ? 27 : 6;
  const pair = !trips && (r[0] === r[1] || r[1] === r[2]);
  let cat: number;
  if (style === 'teenpatti') cat = trips ? 5 : seqHigh && flush ? 4 : seqHigh ? 3 : flush ? 2 : pair ? 1 : 0;
  else cat = seqHigh && flush ? 5 : trips ? 4 : seqHigh ? 3 : flush ? 2 : pair ? 1 : 0;
  let kick: number[];
  if (trips) kick = [r[0] * 2];
  else if (seqHigh) kick = [seqHigh];
  else if (pair) {
    const p = r[0] === r[1] ? r[0] : r[1];
    const k = r[0] === r[1] ? r[2] : r[0];
    kick = [p * 2, k * 2];
  } else kick = r.map((x) => x * 2);
  let v = 0;
  for (let i = 0; i < 3; i++) v = v * 64 + (kick[i] ?? 0);
  return cat * B3 + v;
}
export const cat3 = (score: number) => Math.floor(score / B3);
