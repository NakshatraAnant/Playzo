import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt } from '../../../shared/engine';
import { rank, shuffledDeck, eval3, cat3, THREE_CARD_NAMES, eval5, handCategory } from '../../../shared/cards';

/* =============================== ANDAR BAHAR =============================== */
interface ABState extends ChanceState { last: null | { joker: number; andar: number[]; bahar: number[]; winner: 'andar' | 'bahar' } }
type ABA = { type: 'deal'; side: 'andar' | 'bahar'; amount: number };

export function andarBaharDeal(deck: number[]) {
  const joker = deck.pop()!;
  const andar: number[] = [], bahar: number[] = [];
  let side: 'andar' | 'bahar' = 'andar';
  for (;;) {
    const c = deck.pop()!;
    (side === 'andar' ? andar : bahar).push(c);
    if (rank(c) === rank(joker)) return { joker, andar, bahar, winner: side };
    side = side === 'andar' ? 'bahar' : 'andar';
  }
}
export const AB_PAYS = { andar: 1.9, bahar: 2 };

export const andarBahar: Engine<ABState, ABA> = {
  id: 'andar-bahar', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'deal' || (a.side !== 'andar' && a.side !== 'bahar')) throw new GameError('Choose Andar or Bahar');
    const amount = clampInt(a.amount, 10, 5000);
    s.round++;
    stake(s, amount, ctx, `r${s.round}-bet`);
    const deal = andarBaharDeal(shuffledDeck(ctx.rng));
    if (deal.winner === a.side) payout(s, Math.floor(amount * AB_PAYS[a.side]), `r${s.round}-win`);
    s.last = deal;
    pushHistory(s, { winner: deal.winner, cards: deal.andar.length + deal.bahar.length });
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked }),
};

/* =============================== DRAGON TIGER =============================== */
interface DTState extends ChanceState { shoe: number[]; last: null | { dragon: number; tiger: number; winner: 'dragon' | 'tiger' | 'tie' } }
type DTA = { type: 'deal'; bets: { dragon?: number; tiger?: number; tie?: number } };
/** Ace low. */
export const dtRank = (c: number) => (rank(c) === 14 ? 1 : rank(c));

export const dragonTiger: Engine<DTState, DTA> = {
  id: 'dragon-tiger', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: (_o, ctx) => ({ ...newChanceState(), shoe: shuffledDeck(ctx.rng, 8), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'deal' || !a.bets) throw new GameError('Place a bet');
    const b = { dragon: a.bets.dragon ? clampInt(a.bets.dragon, 10, 5000) : 0, tiger: a.bets.tiger ? clampInt(a.bets.tiger, 10, 5000) : 0, tie: a.bets.tie ? clampInt(a.bets.tie, 10, 5000) : 0 };
    if (!b.dragon && !b.tiger && !b.tie) throw new GameError('Place a bet');
    if (s.shoe.length < 20) s.shoe = shuffledDeck(ctx.rng, 8);
    s.round++;
    for (const k of ['dragon', 'tiger', 'tie'] as const) if (b[k]) stake(s, b[k], ctx, `r${s.round}-${k}`);
    const dragon = s.shoe.pop()!, tiger = s.shoe.pop()!;
    const d = dtRank(dragon), t = dtRank(tiger);
    const winner = d > t ? 'dragon' : t > d ? 'tiger' : 'tie';
    let ret = 0;
    if (winner === 'tie') ret = b.tie * 9 + Math.floor(b.dragon / 2) + Math.floor(b.tiger / 2);
    else ret = b[winner] * 2;
    payout(s, ret, `r${s.round}-win`);
    s.last = { dragon, tiger, winner };
    pushHistory(s, { winner }, 60);
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked }),
};

/* =============================== THREE CARD POKER =============================== */
export const ANTE_BONUS: Record<number, number> = { 3: 1, 4: 4, 5: 5 }; // straight, trips, straight flush
export const PAIR_PLUS: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 30, 5: 40 };
interface TCState extends ChanceState {
  phase: 'bet' | 'decide' | 'done'; deck: number[]; player: number[]; dealer: number[]; ante: number; pairPlus: number;
  outcome: null | { qualified: boolean; result: string; anteBonus: number; pairPlusWin: number; playerHand: string; dealerHand: string };
}
type TCA = { type: 'deal'; ante: number; pairPlus?: number } | { type: 'play' } | { type: 'fold' };

export function dealerQualifies(cards: number[]): boolean {
  const sc = eval3(cards, 'threecardpoker');
  if (cat3(sc) >= 1) return true;
  return Math.max(...cards.map(rank)) >= 12;
}

/** Return (including stakes) for ante+play, given a decision to play. */
export function threeCardSettle(player: number[], dealer: number[], ante: number, pairPlus: number) {
  const ps = eval3(player, 'threecardpoker'), ds = eval3(dealer, 'threecardpoker');
  const pc = cat3(ps);
  const qualified = dealerQualifies(dealer);
  let ret = 0, result: string;
  if (!qualified) { ret += ante * 2 + ante; result = 'Dealer does not qualify'; }
  else if (ps > ds) { ret += ante * 2 + ante * 2; result = 'You win'; }
  else if (ps === ds) { ret += ante * 2; result = 'Push'; }
  else result = 'Dealer wins';
  const anteBonus = (ANTE_BONUS[pc] ?? 0) * ante;
  const pairPlusWin = pairPlus && PAIR_PLUS[pc] ? pairPlus * (PAIR_PLUS[pc] + 1) : 0;
  return { ret: ret + anteBonus + pairPlusWin, qualified, result, anteBonus, pairPlusWin, playerHand: THREE_CARD_NAMES[pc], dealerHand: THREE_CARD_NAMES[cat3(ds)] };
}

/** "Q-6-4 or better" play strategy. */
export function shouldPlay(cards: number[]): boolean {
  const sc = eval3(cards, 'threecardpoker');
  if (cat3(sc) >= 1) return true;
  const r = cards.map(rank).sort((a, b) => b - a);
  if (r[0] !== 12) return r[0] > 12;
  if (r[1] !== 6) return r[1] > 6;
  return r[2] >= 4;
}

export const threeCardPoker: Engine<TCState, TCA> = {
  id: 'three-card-poker', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), phase: 'bet', deck: [], player: [], dealer: [], ante: 0, pairPlus: 0, outcome: null }),
  apply(s, a, ctx) {
    if (a.type === 'deal') {
      if (s.phase === 'decide') throw new GameError('Play or fold first');
      s.ante = clampInt(a.ante, 10, 2500);
      s.pairPlus = a.pairPlus ? clampInt(a.pairPlus, 10, 2500) : 0;
      s.round++;
      stake(s, s.ante, ctx, `r${s.round}-ante`);
      if (s.pairPlus) stake(s, s.pairPlus, ctx, `r${s.round}-pp`);
      s.deck = shuffledDeck(ctx.rng);
      s.player = [s.deck.pop()!, s.deck.pop()!, s.deck.pop()!];
      s.dealer = [s.deck.pop()!, s.deck.pop()!, s.deck.pop()!];
      s.phase = 'decide';
      s.outcome = null;
      return s;
    }
    if (s.phase !== 'decide') throw new GameError('Deal first');
    if (a.type === 'fold') {
      s.outcome = { qualified: dealerQualifies(s.dealer), result: 'Folded', anteBonus: 0, pairPlusWin: 0, playerHand: THREE_CARD_NAMES[cat3(eval3(s.player, 'threecardpoker'))], dealerHand: THREE_CARD_NAMES[cat3(eval3(s.dealer, 'threecardpoker'))] };
    } else if (a.type === 'play') {
      stake(s, s.ante, ctx, `r${s.round}-play`);
      const r = threeCardSettle(s.player, s.dealer, s.ante, s.pairPlus);
      payout(s, r.ret, `r${s.round}-win`);
      s.outcome = r;
    } else throw new GameError('Unknown action');
    s.phase = 'done';
    pushHistory(s, { result: s.outcome!.result, hand: s.outcome!.playerHand });
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({
    phase: s.phase, player: s.player, dealer: s.phase === 'done' ? s.dealer : s.dealer.map(() => -1), ante: s.ante, pairPlus: s.pairPlus,
    outcome: s.outcome, history: s.history, net: s.totalReturned - s.totalStaked,
    playerHand: s.player.length ? THREE_CARD_NAMES[cat3(eval3(s.player, 'threecardpoker'))] : null,
    guide: s.phase === 'decide' ? (shouldPlay(s.player) ? 'Guide: Q-6-4 or better - Play' : 'Guide: below Q-6-4 - Fold') : null,
  }),
};

/* =============================== VIDEO POKER (Jacks or Better 9/6) =============================== */
/** Pays per coin. Royal pays 800 per coin only at 5 coins (4000 total). */
export const VP_TABLE: { name: string; pay: number }[] = [
  { name: 'Royal Flush', pay: 250 }, { name: 'Straight Flush', pay: 50 }, { name: 'Four of a Kind', pay: 25 }, { name: 'Full House', pay: 9 },
  { name: 'Flush', pay: 6 }, { name: 'Straight', pay: 4 }, { name: 'Three of a Kind', pay: 3 }, { name: 'Two Pair', pay: 2 }, { name: 'Jacks or Better', pay: 1 },
];
export function vpHand(cards: number[]): { name: string; perCoin: number } | null {
  const sc = eval5(cards);
  const cat = handCategory(sc);
  const map: Record<number, string> = { 9: 'Royal Flush', 8: 'Straight Flush', 7: 'Four of a Kind', 6: 'Full House', 5: 'Flush', 4: 'Straight', 3: 'Three of a Kind', 2: 'Two Pair' };
  if (map[cat]) { const n = map[cat]; return { name: n, perCoin: VP_TABLE.find((x) => x.name === n)!.pay }; }
  if (cat === 1) {
    const counts: Record<number, number> = {};
    for (const c of cards) counts[rank(c)] = (counts[rank(c)] ?? 0) + 1;
    const pr = +Object.keys(counts).find((k) => counts[+k] === 2)!;
    if (pr >= 11) return { name: 'Jacks or Better', perCoin: 1 };
  }
  return null;
}
export const VP_UNIT = 10;
export function vpPayout(cards: number[], coins: number): { name: string | null; ret: number } {
  const h = vpHand(cards);
  if (!h) return { name: null, ret: 0 };
  const perCoin = h.name === 'Royal Flush' && coins === 5 ? 800 : h.perCoin;
  return { name: h.name, ret: perCoin * coins * VP_UNIT };
}

interface VPState extends ChanceState { phase: 'bet' | 'hold' | 'done'; deck: number[]; hand: number[]; coins: number; result: { name: string | null; ret: number } | null }
type VPA = { type: 'deal'; coins: number } | { type: 'draw'; hold: boolean[] };

export const videoPoker: Engine<VPState, VPA> = {
  id: 'video-poker', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), phase: 'bet', deck: [], hand: [], coins: 5, result: null }),
  apply(s, a, ctx) {
    if (a.type === 'deal') {
      if (s.phase === 'hold') throw new GameError('Draw first');
      s.coins = clampInt(a.coins, 1, 5);
      s.round++;
      stake(s, s.coins * VP_UNIT, ctx, `r${s.round}-bet`);
      s.deck = shuffledDeck(ctx.rng);
      s.hand = [0, 1, 2, 3, 4].map(() => s.deck.pop()!);
      s.phase = 'hold';
      s.result = null;
      return s;
    }
    if (a.type === 'draw') {
      if (s.phase !== 'hold') throw new GameError('Deal first');
      if (!Array.isArray(a.hold) || a.hold.length !== 5) throw new GameError('Hold must list five cards');
      s.hand = s.hand.map((c, i) => (a.hold[i] ? c : s.deck.pop()!));
      s.result = vpPayout(s.hand, s.coins);
      payout(s, s.result.ret, `r${s.round}-win`);
      s.phase = 'done';
      pushHistory(s, { hand: s.result.name ?? 'No win', ret: s.result.ret });
      return s;
    }
    throw new GameError('Unknown action');
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ phase: s.phase, hand: s.hand, coins: s.coins, result: s.result, current: s.hand.length === 5 ? vpHand(s.hand)?.name ?? null : null, history: s.history, net: s.totalReturned - s.totalStaked, unit: VP_UNIT }),
};
