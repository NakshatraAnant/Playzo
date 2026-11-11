import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt } from '../../../shared/engine';
import { bjTotal, isBlackjack, rank, shuffledDeck } from '../../../shared/cards';
import type { Rng } from '../../../shared/rng';

interface Hand { cards: number[]; bet: number; done: boolean; doubled: boolean; fromSplit: boolean; outcome?: string }
interface BJState extends ChanceState {
  shoe: number[]; phase: 'bet' | 'player' | 'done'; hands: Hand[]; active: number; dealer: number[]; reshuffled: boolean;
  lastResult: string[] | null;
}
type A = { type: 'deal'; amount: number } | { type: 'hit' } | { type: 'stand' } | { type: 'double' } | { type: 'split' };

const DECKS = 6, CUT = 78;
function draw(s: BJState, rng: Rng): number {
  if (!s.shoe.length) s.shoe = shuffledDeck(rng, DECKS);
  return s.shoe.pop()!;
}
const pairRank = (c: number) => Math.min(10, rank(c) === 14 ? 11 : rank(c));

/** Basic strategy for 6 decks, dealer stands on soft 17, DAS, no surrender. */
export function basicStrategy(cards: number[], up: number, canDouble: boolean, canSplit: boolean): 'hit' | 'stand' | 'double' | 'split' {
  const d = pairRank(up) === 11 ? 11 : pairRank(up);
  if (canSplit && cards.length === 2 && pairRank(cards[0]) === pairRank(cards[1])) {
    const p = pairRank(cards[0]);
    if (p === 11 || p === 8) return 'split';
    if (p === 9 && ![7, 10, 11].includes(d)) return 'split';
    if ((p === 7 || p === 3 || p === 2) && d <= 7) return 'split';
    if (p === 6 && d <= 6) return 'split';
    if (p === 4 && (d === 5 || d === 6)) return 'split';
  }
  const { total, soft } = bjTotal(cards);
  const dbl = (cond: boolean, fallback: 'hit' | 'stand') => (cond && canDouble ? 'double' : fallback);
  if (soft && total <= 21 && cards.length >= 2) {
    if (total >= 19) return total === 19 && d === 6 ? dbl(true, 'stand') : 'stand';
    if (total === 18) return d <= 6 ? dbl(d >= 2, 'stand') : d <= 8 ? 'stand' : 'hit';
    if (total === 17) return dbl(d >= 3 && d <= 6, 'hit');
    if (total >= 15) return dbl(d >= 4 && d <= 6, 'hit');
    return dbl(d >= 5 && d <= 6, 'hit');
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return d <= 6 ? 'stand' : 'hit';
  if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (total === 11) return dbl(true, 'hit');
  if (total === 10) return dbl(d <= 9, 'hit');
  if (total === 9) return dbl(d >= 3 && d <= 6, 'hit');
  return 'hit';
}

function settle(s: BJState, ctx: { rng: Rng }) {
  const anyLive = s.hands.some((h) => bjTotal(h.cards).total <= 21);
  if (anyLive) while (bjTotal(s.dealer).total < 17) s.dealer.push(draw(s, ctx.rng));
  const dt = bjTotal(s.dealer).total;
  const res: string[] = [];
  s.hands.forEach((h, i) => {
    const pt = bjTotal(h.cards).total;
    let ret = 0, outcome: string;
    if (pt > 21) outcome = 'Bust';
    else if (dt > 21 || pt > dt) { ret = h.bet * 2; outcome = 'Win'; }
    else if (pt === dt) { ret = h.bet; outcome = 'Push'; }
    else outcome = 'Lose';
    h.outcome = outcome;
    payout(s, ret, `r${s.round}-h${i}`);
    res.push(outcome);
  });
  s.phase = 'done';
  s.lastResult = res;
  pushHistory(s, { dealer: dt, hands: s.hands.map((h) => bjTotal(h.cards).total), res });
}

function advance(s: BJState, ctx: { rng: Rng }) {
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active >= s.hands.length) settle(s, ctx);
}

export const blackjack: Engine<BJState, A> = {
  id: 'blackjack', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: (_o, ctx) => ({ ...newChanceState(), shoe: shuffledDeck(ctx.rng, DECKS), phase: 'bet', hands: [], active: 0, dealer: [], reshuffled: false, lastResult: null }),
  apply(s, a, ctx) {
    if (a.type === 'deal') {
      if (s.phase === 'player') throw new GameError('Finish the current hand first');
      const amount = clampInt(a.amount, 10, 5000);
      s.round++;
      s.reshuffled = false;
      if (s.shoe.length < CUT) { s.shoe = shuffledDeck(ctx.rng, DECKS); s.reshuffled = true; }
      stake(s, amount, ctx, `r${s.round}-bet`);
      s.hands = [{ cards: [draw(s, ctx.rng), draw(s, ctx.rng)], bet: amount, done: false, doubled: false, fromSplit: false }];
      s.dealer = [draw(s, ctx.rng), draw(s, ctx.rng)];
      s.active = 0;
      s.phase = 'player';
      s.lastResult = null;
      const pBJ = isBlackjack(s.hands[0].cards), dBJ = isBlackjack(s.dealer);
      if (pBJ || dBJ) {
        const ret = pBJ && dBJ ? amount : pBJ ? Math.floor(amount * 2.5) : 0;
        payout(s, ret, `r${s.round}-h0`);
        s.hands[0].done = true;
        s.hands[0].outcome = pBJ && dBJ ? 'Push' : pBJ ? 'Blackjack' : 'Dealer blackjack';
        s.phase = 'done';
        s.lastResult = [s.hands[0].outcome];
        pushHistory(s, { dealer: 21, hands: [bjTotal(s.hands[0].cards).total], res: s.lastResult });
      }
      return s;
    }
    if (s.phase !== 'player') throw new GameError('Deal a hand first');
    const h = s.hands[s.active];
    if (a.type === 'hit') {
      h.cards.push(draw(s, ctx.rng));
      if (bjTotal(h.cards).total >= 21) h.done = true;
    } else if (a.type === 'stand') {
      h.done = true;
    } else if (a.type === 'double') {
      if (h.cards.length !== 2) throw new GameError('Double only on two cards');
      stake(s, h.bet, ctx, `r${s.round}-dbl${s.active}`);
      h.bet *= 2; h.doubled = true;
      h.cards.push(draw(s, ctx.rng));
      h.done = true;
    } else if (a.type === 'split') {
      if (s.hands.length > 1) throw new GameError('One split per round');
      if (h.cards.length !== 2 || pairRank(h.cards[0]) !== pairRank(h.cards[1])) throw new GameError('Split needs a pair');
      stake(s, h.bet, ctx, `r${s.round}-split`);
      const aces = rank(h.cards[0]) === 14;
      const second: Hand = { cards: [h.cards[1], draw(s, ctx.rng)], bet: h.bet, done: aces, doubled: false, fromSplit: true };
      h.cards = [h.cards[0], draw(s, ctx.rng)];
      h.fromSplit = true;
      h.done = aces;
      s.hands.push(second);
    } else throw new GameError('Unknown action');
    advance(s, ctx);
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked }, summary: { rounds: s.round } }),
  view: (s) => {
    const hideHole = s.phase === 'player';
    const h = s.hands[s.active];
    const hint = s.phase === 'player' && h ? basicStrategy(h.cards, s.dealer[0], h.cards.length === 2, s.hands.length === 1 && h.cards.length === 2 && pairRank(h.cards[0]) === pairRank(h.cards[1])) : null;
    return {
      phase: s.phase, active: s.active, reshuffled: s.reshuffled, shoeLeft: s.shoe.length,
      hands: s.hands.map((x) => ({ cards: x.cards, bet: x.bet, total: bjTotal(x.cards).total, soft: bjTotal(x.cards).soft, done: x.done, outcome: x.outcome })),
      dealer: hideHole ? [s.dealer[0], -1] : s.dealer, dealerTotal: hideHole ? null : bjTotal(s.dealer).total,
      hint, history: s.history, net: s.totalReturned - s.totalStaked, lastResult: s.lastResult,
      canSplit: s.phase === 'player' && s.hands.length === 1 && h?.cards.length === 2 && pairRank(h.cards[0]) === pairRank(h.cards[1]),
      canDouble: s.phase === 'player' && h?.cards.length === 2,
    };
  },
};

/* ---------------- Blackjack Duel: you vs a rival with a printed rule ---------------- */
interface DuelState extends ChanceState { shoe: number[]; phase: 'bet' | 'player' | 'done'; you: number[]; rival: number[]; bet: number; outcome: string | null }
type DA = { type: 'deal'; amount: number } | { type: 'hit' } | { type: 'stand' };

export function duelSettle(you: number[], rival: number[]): { mult: number; outcome: string } {
  const y = bjTotal(you).total, r = bjTotal(rival).total;
  const yN = isBlackjack(you), rN = isBlackjack(rival);
  if (yN && !rN) return { mult: 2.5, outcome: 'Natural 21' };
  if (y > 21 && r > 21) return { mult: 1, outcome: 'Both bust - push' };
  if (y > 21) return { mult: 0, outcome: 'Bust' };
  if (r > 21) return { mult: 2, outcome: 'Rival busts' };
  if (y > r) return { mult: 2, outcome: 'Win' };
  if (y === r) return { mult: 1, outcome: 'Push' };
  return { mult: 0, outcome: 'Rival wins' };
}

function duelFinish(s: DuelState, rng: Rng) {
  while (bjTotal(s.rival).total < 17) { if (!s.shoe.length) s.shoe = shuffledDeck(rng, DECKS); s.rival.push(s.shoe.pop()!); }
  const { mult, outcome } = duelSettle(s.you, s.rival);
  payout(s, Math.floor(s.bet * mult), `r${s.round}-win`);
  s.outcome = outcome;
  s.phase = 'done';
  pushHistory(s, { you: bjTotal(s.you).total, rival: bjTotal(s.rival).total, outcome });
}

export const blackjackDuel: Engine<DuelState, DA> = {
  id: 'blackjack-duel', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: (_o, ctx) => ({ ...newChanceState(), shoe: shuffledDeck(ctx.rng, DECKS), phase: 'bet', you: [], rival: [], bet: 0, outcome: null }),
  apply(s, a, ctx) {
    const d = () => { if (!s.shoe.length) s.shoe = shuffledDeck(ctx.rng, DECKS); return s.shoe.pop()!; };
    if (a.type === 'deal') {
      if (s.phase === 'player') throw new GameError('Finish this hand first');
      if (s.shoe.length < CUT) s.shoe = shuffledDeck(ctx.rng, DECKS);
      s.bet = clampInt(a.amount, 10, 5000);
      s.round++;
      stake(s, s.bet, ctx, `r${s.round}-bet`);
      s.you = [d(), d()]; s.rival = [d(), d()]; s.outcome = null; s.phase = 'player';
      if (isBlackjack(s.you)) duelFinish(s, ctx.rng);
      return s;
    }
    if (s.phase !== 'player') throw new GameError('Deal first');
    if (a.type === 'hit') { s.you.push(d()); if (bjTotal(s.you).total >= 21) duelFinish(s, ctx.rng); }
    else if (a.type === 'stand') duelFinish(s, ctx.rng);
    else throw new GameError('Unknown action');
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({
    phase: s.phase, you: s.you, youTotal: bjTotal(s.you).total, bet: s.bet, outcome: s.outcome,
    rival: s.phase === 'player' ? [s.rival[0], -1] : s.rival, rivalTotal: s.phase === 'player' ? null : bjTotal(s.rival).total,
    history: s.history, net: s.totalReturned - s.totalStaked,
  }),
};
