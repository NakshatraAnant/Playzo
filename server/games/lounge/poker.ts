import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt, Ctx } from '../../../shared/engine';
import { bestHoldem, bestOmaha, shuffledDeck, HAND_NAMES, handCategory, freshDeck, eval3, cat3, TEEN_PATTI_NAMES } from '../../../shared/cards';
import type { Rng } from '../../../shared/rng';

type Style = 'tight' | 'loose' | 'aggro';
const BOTS: { name: string; style: Style }[] = [
  { name: 'Ruby (steady)', style: 'tight' }, { name: 'Kabir (loose)', style: 'loose' }, { name: 'Zara (aggressive)', style: 'aggro' },
];
const BOT_STACK = 2000;

/* ======================================================================================
 * HOLD'EM / OMAHA
 * ==================================================================================== */
interface Seat { name: string; bot: boolean; style?: Style; stack: number; hole: number[]; folded: boolean; allIn: boolean; bet: number; contributed: number; acted: boolean; inHand: boolean }
interface PokerState extends ChanceState {
  variant: 'holdem' | 'omaha'; seats: Seat[]; seated: boolean; buyIn: number; button: number; deck: number[]; board: number[];
  street: 'idle' | 'pre' | 'flop' | 'turn' | 'river' | 'showdown'; toAct: number; currentBet: number; minRaise: number; hand: number;
  log: string[]; showdown: null | { winners: { seat: number; amount: number; hand: string }[]; reveal: Record<number, number[]> };
}
type PA = { type: 'sit'; buyIn: number } | { type: 'deal' } | { type: 'act'; move: 'fold' | 'check' | 'call' | 'raise'; to?: number } | { type: 'leave' } | { type: 'rebuy'; amount: number };
const SB = 10, BB = 20;

const best = (s: PokerState, hole: number[], board: number[]) => (s.variant === 'omaha' ? bestOmaha(hole, board) : bestHoldem(hole, board));
const potTotal = (s: PokerState) => s.seats.reduce((t, x) => t + x.contributed, 0);
const live = (s: PokerState) => s.seats.map((x, i) => i).filter((i) => s.seats[i].inHand && !s.seats[i].folded);
const nextIdx = (s: PokerState, from: number, pred: (i: number) => boolean) => {
  for (let k = 1; k <= s.seats.length; k++) { const i = (from + k) % s.seats.length; if (pred(i)) return i; }
  return -1;
};
const canAct = (s: PokerState) => (i: number) => s.seats[i].inHand && !s.seats[i].folded && !s.seats[i].allIn;

function putIn(s: PokerState, i: number, amount: number) {
  const seat = s.seats[i];
  const a = Math.min(amount, seat.stack);
  seat.stack -= a; seat.bet += a; seat.contributed += a;
  if (seat.stack === 0) seat.allIn = true;
}

export function equity(s: PokerState, i: number, rng: Rng, trials = 60): number {
  const me = s.seats[i];
  const opps = Math.max(1, live(s).length - 1);
  const known = new Set([...me.hole, ...s.board]);
  const rest = freshDeck().filter((c) => !known.has(c));
  let win = 0;
  const holeN = s.variant === 'omaha' ? 4 : 2;
  for (let t = 0; t < trials; t++) {
    const d = rng.shuffle(rest.slice());
    const opp = d.splice(0, holeN);
    const board = [...s.board, ...d.splice(0, 5 - s.board.length)];
    const a = best(s, me.hole, board).score, b = best(s, opp, board).score;
    win += a > b ? 1 : a === b ? 0.5 : 0;
  }
  return Math.pow(win / trials, Math.sqrt(opps));
}

function maxRaiseTo(s: PokerState, i: number): number {
  const seat = s.seats[i];
  const all = seat.bet + seat.stack;
  if (s.variant === 'omaha') {
    const toCall = s.currentBet - seat.bet;
    return Math.min(all, s.currentBet + potTotal(s) + toCall);
  }
  return all;
}
const minRaiseTo = (s: PokerState) => s.currentBet + s.minRaise;

function doAct(s: PokerState, i: number, move: string, to?: number) {
  const seat = s.seats[i];
  const toCall = s.currentBet - seat.bet;
  if (move === 'fold') { seat.folded = true; s.log.unshift(`${seat.name} folds`); }
  else if (move === 'check') { if (toCall > 0) throw new GameError('Cannot check: there is a bet'); s.log.unshift(`${seat.name} checks`); }
  else if (move === 'call') { if (toCall <= 0) throw new GameError('Nothing to call'); putIn(s, i, toCall); s.log.unshift(`${seat.name} calls ${Math.min(toCall, seat.bet)}`); }
  else if (move === 'raise') {
    const max = maxRaiseTo(s, i);
    let target = Math.floor(Number(to));
    if (!Number.isFinite(target)) throw new GameError('Raise amount required');
    target = Math.min(target, max);
    const isAllIn = target === seat.bet + seat.stack;
    if (target <= s.currentBet) throw new GameError('Raise must exceed the current bet');
    if (target < minRaiseTo(s) && !isAllIn) throw new GameError(`Minimum raise is to ${minRaiseTo(s)}`);
    putIn(s, i, target - seat.bet);
    if (seat.bet - s.currentBet >= s.minRaise) s.minRaise = seat.bet - s.currentBet;
    s.currentBet = Math.max(s.currentBet, seat.bet);
    s.seats.forEach((x, k) => { if (k !== i) x.acted = false; });
    s.log.unshift(`${seat.name} raises to ${seat.bet}${seat.allIn ? ' (all-in)' : ''}`);
  } else throw new GameError('Unknown move');
  seat.acted = true;
  if (s.log.length > 30) s.log.length = 30;
  progress(s);
}

function progress(s: PokerState) {
  const alive = live(s);
  if (alive.length === 1) { award(s, [[alive[0]]], 'Everyone else folded'); return; }
  const actors = alive.filter((i) => !s.seats[i].allIn);
  const done = actors.every((i) => s.seats[i].acted && s.seats[i].bet === s.currentBet);
  if (!done) { s.toAct = nextIdx(s, s.toAct, (i) => canAct(s)(i) && (!s.seats[i].acted || s.seats[i].bet < s.currentBet)); return; }
  // street complete
  s.seats.forEach((x) => { x.bet = 0; x.acted = false; });
  s.currentBet = 0; s.minRaise = BB;
  const deal = (n: number) => { for (let k = 0; k < n; k++) s.board.push(s.deck.pop()!); };
  const runOut = actors.length <= 1;
  if (s.street === 'pre') { deal(3); s.street = 'flop'; }
  else if (s.street === 'flop') { deal(1); s.street = 'turn'; }
  else if (s.street === 'turn') { deal(1); s.street = 'river'; }
  else { showdown(s); return; }
  if (runOut) { while (s.board.length < 5) deal(1); showdown(s); return; }
  s.toAct = nextIdx(s, s.button, canAct(s));
}

function showdown(s: PokerState) {
  const alive = live(s);
  const levels = [...new Set(s.seats.filter((x) => x.contributed > 0).map((x) => x.contributed))].sort((a, b) => a - b);
  const pots: number[][] = [];
  const amounts: number[] = [];
  let prev = 0;
  for (const lv of levels) {
    const amount = s.seats.reduce((t, x) => t + Math.max(0, Math.min(x.contributed, lv) - prev), 0);
    const eligible = alive.filter((i) => s.seats[i].contributed >= lv);
    if (amount > 0 && eligible.length) {
      const scores = eligible.map((i) => best(s, s.seats[i].hole, s.board).score);
      const top = Math.max(...scores);
      pots.push(eligible.filter((_, k) => scores[k] === top));
      amounts.push(amount);
    } else if (amount > 0 && pots.length) amounts[amounts.length - 1] += amount;
    prev = lv;
  }
  award(s, pots, 'Showdown', amounts);
}

function award(s: PokerState, winnersPerPot: number[][], reason: string, amounts?: number[]) {
  const total = potTotal(s);
  const amts = amounts ?? [total];
  const winners: { seat: number; amount: number; hand: string }[] = [];
  winnersPerPot.forEach((ws, k) => {
    const share = Math.floor(amts[k] / ws.length);
    let rem = amts[k] - share * ws.length;
    for (const w of ws) {
      const amt = share + (rem-- > 0 ? 1 : 0);
      s.seats[w].stack += amt;
      const hand = s.board.length === 5 && reason === 'Showdown' ? HAND_NAMES[handCategory(best(s, s.seats[w].hole, s.board).score)] : reason;
      const ex = winners.find((x) => x.seat === w);
      if (ex) ex.amount += amt; else winners.push({ seat: w, amount: amt, hand });
    }
  });
  const reveal: Record<number, number[]> = {};
  if (reason === 'Showdown') live(s).forEach((i) => { reveal[i] = s.seats[i].hole; });
  s.showdown = { winners, reveal };
  s.street = 'idle';
  s.seats.forEach((x) => { x.contributed = 0; x.bet = 0; });
  s.log.unshift(winners.map((w) => `${s.seats[w.seat].name} wins ${w.amount} (${w.hand})`).join('; '));
  pushHistory(s, { hand: s.hand, you: s.seats[0].stack });
}

function botAct(s: PokerState, i: number, rng: Rng) {
  const seat = s.seats[i];
  const eq = equity(s, i, rng);
  const toCall = s.currentBet - seat.bet;
  const pot = potTotal(s);
  const odds = toCall / (pot + toCall || 1);
  const th = seat.style === 'tight' ? { raise: 0.72, call: 0.08 } : seat.style === 'loose' ? { raise: 0.66, call: -0.04 } : { raise: 0.58, call: 0.02 };
  const bluff = seat.style === 'aggro' && toCall === 0 && rng.next() < 0.12;
  const sizeTo = () => Math.max(minRaiseTo(s), s.currentBet + Math.floor((pot + toCall) * (eq > 0.85 ? 1 : 0.5)));
  if ((eq > th.raise || bluff) && maxRaiseTo(s, i) > s.currentBet) {
    const target = Math.min(maxRaiseTo(s, i), sizeTo());
    if (target >= minRaiseTo(s) || target === seat.bet + seat.stack) { doAct(s, i, 'raise', target); return; }
  }
  if (toCall === 0) { doAct(s, i, 'check'); return; }
  if (eq > odds + th.call || toCall <= BB / 2) doAct(s, i, 'call');
  else doAct(s, i, 'fold');
}

function runBots(s: PokerState, rng: Rng) {
  let guard = 0;
  while (s.street !== 'idle' && s.toAct >= 0 && s.seats[s.toAct].bot && guard++ < 200) botAct(s, s.toAct, rng);
}

function newHand(s: PokerState, rng: Rng) {
  s.hand++;
  s.seats.forEach((x) => {
    if (x.bot && x.stack < BB * 5) x.stack = BOT_STACK; // house tops up computer opponents (virtual, documented)
    Object.assign(x, { hole: [], folded: false, allIn: false, bet: 0, contributed: 0, acted: false, inHand: x.stack > 0 });
  });
  if (!s.seats[0].inHand) throw new GameError('Rebuy to keep playing');
  s.button = nextIdx(s, s.button, (i) => s.seats[i].inHand);
  s.deck = shuffledDeck(rng);
  s.board = []; s.showdown = null;
  const holeN = s.variant === 'omaha' ? 4 : 2;
  for (let k = 0; k < holeN; k++) s.seats.forEach((x) => { if (x.inHand) x.hole.push(s.deck.pop()!); });
  const sb = nextIdx(s, s.button, (i) => s.seats[i].inHand), bb = nextIdx(s, sb, (i) => s.seats[i].inHand);
  putIn(s, sb, SB); putIn(s, bb, BB);
  s.currentBet = BB; s.minRaise = BB; s.street = 'pre';
  s.toAct = nextIdx(s, bb, canAct(s));
  s.log.unshift(`Hand #${s.hand}: blinds ${SB}/${BB}`);
}

function pokerEngine(variant: 'holdem' | 'omaha', id: string): Engine<PokerState, PA> {
  const leave = (s: PokerState, rng: Rng) => {
    if (!s.seated) return;
    if (s.street !== 'idle') {
      // Abandoning mid-hand folds, per table rules; the bots finish the hand.
      s.seats[0].folded = true; s.seats[0].acted = true;
      progress(s);
      runBots(s, rng);
    }
    const back = s.seats[0].stack;
    payout(s, back, `leave-${s.hand}-${s.round}`);
    s.seats[0].stack = 0; s.seated = false; s.street = 'idle';
  };
  return {
    id, rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
    init: () => ({
      ...newChanceState(), variant, seated: false, buyIn: 0, button: 0, deck: [], board: [], street: 'idle', toAct: -1, currentBet: 0, minRaise: BB, hand: 0, log: [], showdown: null,
      seats: [{ name: 'You', bot: false, stack: 0, hole: [], folded: false, allIn: false, bet: 0, contributed: 0, acted: false, inHand: false },
        ...BOTS.map((b) => ({ name: b.name, bot: true, style: b.style, stack: BOT_STACK, hole: [], folded: false, allIn: false, bet: 0, contributed: 0, acted: false, inHand: false }))],
    }),
    apply(s, a, ctx) {
      if (a.type === 'sit' || a.type === 'rebuy') {
        if (a.type === 'sit' && s.seated) throw new GameError('Already seated');
        if (s.street !== 'idle') throw new GameError('Wait for the hand to finish');
        const amt = clampInt(a.type === 'sit' ? a.buyIn : a.amount, 200, 5000);
        s.round++;
        stake(s, amt, ctx, `buyin-${s.round}`, 200, 5000);
        s.seats[0].stack += amt; s.seated = true; s.buyIn += amt;
        return s;
      }
      if (a.type === 'leave') { leave(s, ctx.rng); return s; }
      if (!s.seated) throw new GameError('Take a seat first');
      if (a.type === 'deal') {
        if (s.street !== 'idle') throw new GameError('Hand in progress');
        newHand(s, ctx.rng);
        runBots(s, ctx.rng);
        return s;
      }
      if (a.type === 'act') {
        if (s.street === 'idle') throw new GameError('No hand in progress');
        if (s.toAct !== 0) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
        doAct(s, 0, a.move, a.to);
        runBots(s, ctx.rng);
        return s;
      }
      throw new GameError('Unknown action');
    },
    finalize: (s, ctx) => { leave(s, ctx.rng); return s; },
    isOver: () => false,
    result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked + (s.seated ? s.seats[0].stack : 0) } }),
    view: (s) => {
      const me = s.seats[0];
      const toCall = Math.max(0, s.currentBet - me.bet);
      return {
        variant: s.variant, seated: s.seated, street: s.street, board: s.board, toAct: s.toAct, currentBet: s.currentBet, pot: potTotal(s), hand: s.hand, log: s.log.slice(0, 12),
        seats: s.seats.map((x, i) => ({
          name: x.name, bot: x.bot, style: x.style, stack: x.stack, bet: x.bet, folded: x.folded, allIn: x.allIn, inHand: x.inHand, button: i === s.button,
          hole: i === 0 ? x.hole : s.showdown?.reveal[i] ?? x.hole.map(() => -1),
        })),
        showdown: s.showdown,
        myBest: me.hole.length && s.board.length >= 3 ? { name: HAND_NAMES[handCategory(best(s, me.hole, s.board).score)], cards: best(s, me.hole, s.board).cards } : null,
        options: s.toAct === 0 && s.street !== 'idle' ? {
          toCall, canCheck: toCall === 0, minRaiseTo: Math.min(minRaiseTo(s), me.bet + me.stack), maxRaiseTo: maxRaiseTo(s, 0),
          halfPot: Math.min(maxRaiseTo(s, 0), Math.max(minRaiseTo(s), s.currentBet + Math.floor((potTotal(s) + toCall) / 2))),
          pot: Math.min(maxRaiseTo(s, 0), Math.max(minRaiseTo(s), s.currentBet + potTotal(s) + toCall)),
        } : null,
        net: s.totalReturned - s.totalStaked + (s.seated ? me.stack : 0),
      };
    },
  };
}
export const holdem = pokerEngine('holdem', 'holdem');
export const omaha = pokerEngine('omaha', 'omaha');

/* ======================================================================================
 * TEEN PATTI
 * ==================================================================================== */
interface TPSeat { name: string; bot: boolean; style?: Style; stack: number; cards: number[]; seen: boolean; packed: boolean; inHand: boolean; put: number }
interface TPState extends ChanceState {
  seats: TPSeat[]; seated: boolean; phase: 'idle' | 'play'; pot: number; stake: number; boot: number; toAct: number; dealer: number; hand: number;
  log: string[]; result: null | { winner: number; reason: string; reveal: Record<number, number[]>; hands: Record<number, string> }; turns: number;
}
type TA = { type: 'sit'; buyIn: number } | { type: 'deal' } | { type: 'see' } | { type: 'chaal'; raise?: boolean } | { type: 'pack' } | { type: 'show' } | { type: 'leave' } | { type: 'rebuy'; amount: number };
const BOOT = 10, POT_LIMIT = 1024 * BOOT;

const tpScore = (c: number[]) => eval3(c, 'teenpatti');
const tpName = (c: number[]) => TEEN_PATTI_NAMES[cat3(tpScore(c))];
const tpActive = (s: TPState) => s.seats.map((_, i) => i).filter((i) => s.seats[i].inHand && !s.seats[i].packed);
const chaalCost = (s: TPState, i: number, raise: boolean) => (s.seats[i].seen ? 2 : 1) * s.stake * (raise ? 2 : 1);

function tpNext(s: TPState) {
  for (let k = 1; k <= 4; k++) { const i = (s.toAct + k) % 4; if (s.seats[i].inHand && !s.seats[i].packed) { s.toAct = i; return; } }
}
function tpEnd(s: TPState, winner: number, reason: string, reveal: number[]) {
  s.seats[winner].stack += s.pot;
  const rv: Record<number, number[]> = {}, hands: Record<number, string> = {};
  for (const i of reveal) { rv[i] = s.seats[i].cards; hands[i] = tpName(s.seats[i].cards); }
  s.log.unshift(`${s.seats[winner].name} wins ${s.pot} (${reason})`);
  s.result = { winner, reason, reveal: rv, hands };
  s.pot = 0; s.phase = 'idle';
  pushHistory(s, { hand: s.hand, winner: s.seats[winner].name });
}
function tpCheckEnd(s: TPState) {
  const act = tpActive(s);
  if (act.length === 1) { tpEnd(s, act[0], 'others packed', []); return true; }
  if (s.pot >= POT_LIMIT) {
    const bestI = act.reduce((b, i) => (tpScore(s.seats[i].cards) > tpScore(s.seats[b].cards) ? i : b), act[0]);
    tpEnd(s, bestI, 'pot limit reached - showdown', act);
    return true;
  }
  return false;
}
function tpPay(s: TPState, i: number, amt: number) {
  const a = Math.min(amt, s.seats[i].stack);
  s.seats[i].stack -= a; s.seats[i].put += a; s.pot += a;
}
function tpAct(s: TPState, i: number, a: TA) {
  const seat = s.seats[i];
  if (a.type === 'pack') { seat.packed = true; s.log.unshift(`${seat.name} packs`); }
  else if (a.type === 'chaal') {
    const cost = chaalCost(s, i, !!a.raise);
    if (seat.stack < cost) throw new GameError('Not enough chips for chaal - show or pack');
    tpPay(s, i, cost);
    if (a.raise) s.stake *= 2;
    s.log.unshift(`${seat.name} ${seat.seen ? 'chaal' : 'blind'} ${cost}${a.raise ? ' (raise)' : ''}`);
  } else if (a.type === 'show') {
    const act = tpActive(s);
    if (act.length !== 2) throw new GameError('Show is only available with two players left');
    tpPay(s, i, (seat.seen ? 2 : 1) * s.stake);
    const other = act.find((x) => x !== i)!;
    const mine = tpScore(seat.cards), theirs = tpScore(s.seats[other].cards);
    // On an exact tie, the player who asked for the show loses.
    tpEnd(s, mine > theirs ? i : other, 'show', act);
    return;
  } else throw new GameError('Unknown move');
  s.turns++;
  if (tpCheckEnd(s)) return;
  tpNext(s);
}
function tpBot(s: TPState, i: number, rng: Rng) {
  const seat = s.seats[i];
  if (!seat.seen && (s.turns >= 4 || rng.next() < 0.3)) { seat.seen = true; s.log.unshift(`${seat.name} sees cards`); }
  const cat = cat3(tpScore(seat.cards));
  const hi = Math.max(...seat.cards.map((c) => (c % 13) + 2));
  const act = tpActive(s);
  const pressure = s.stake / BOOT;
  let strength = seat.seen ? cat * 0.2 + (hi >= 13 ? 0.12 : hi >= 11 ? 0.05 : 0) : 0.45;
  if (seat.style === 'loose') strength += 0.08;
  if (seat.style === 'aggro') strength += 0.05;
  const cost = chaalCost(s, i, false);
  if (seat.stack < cost) { if (act.length === 2) tpAct(s, i, { type: 'show' }); else tpAct(s, i, { type: 'pack' }); return; }
  if (act.length === 2 && seat.seen && strength >= 0.6 && rng.next() < 0.5) { tpAct(s, i, { type: 'show' }); return; }
  if (strength < 0.15 + pressure * 0.03 && seat.seen) { tpAct(s, i, { type: 'pack' }); return; }
  const raise = strength >= 0.6 && seat.stack >= cost * 2 && rng.next() < (seat.style === 'aggro' ? 0.5 : 0.25) && s.stake < BOOT * 64;
  tpAct(s, i, { type: 'chaal', raise });
}
function tpRunBots(s: TPState, rng: Rng) {
  let g = 0;
  while (s.phase === 'play' && s.seats[s.toAct].bot && g++ < 200) tpBot(s, s.toAct, rng);
}

const tpLeave = (s: TPState) => {
  if (!s.seated) return;
  if (s.phase === 'play' && !s.seats[0].packed) { s.seats[0].packed = true; if (!tpCheckEnd(s)) { if (s.toAct === 0) tpNext(s); } }
  payout(s, s.seats[0].stack, `leave-${s.hand}-${s.round}`);
  s.seats[0].stack = 0; s.seated = false;
};

export const teenPatti: Engine<TPState, TA> = {
  id: 'teen-patti', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({
    ...newChanceState(), seated: false, phase: 'idle', pot: 0, stake: BOOT, boot: BOOT, toAct: 0, dealer: 0, hand: 0, log: [], result: null, turns: 0,
    seats: [{ name: 'You', bot: false, stack: 0, cards: [], seen: false, packed: false, inHand: false, put: 0 },
      ...BOTS.map((b) => ({ name: b.name, bot: true, style: b.style, stack: BOT_STACK, cards: [], seen: false, packed: false, inHand: false, put: 0 }))],
  }),
  apply(s, a, ctx: Ctx) {
    if (a.type === 'sit' || a.type === 'rebuy') {
      if (a.type === 'sit' && s.seated) throw new GameError('Already seated');
      if (s.phase !== 'idle') throw new GameError('Wait for the hand to end');
      const amt = clampInt(a.type === 'sit' ? a.buyIn : a.amount, 200, 5000);
      s.round++;
      stake(s, amt, ctx, `buyin-${s.round}`, 200, 5000);
      s.seats[0].stack += amt; s.seated = true;
      return s;
    }
    if (a.type === 'leave') {
      tpLeave(s);
      tpRunBots(s, ctx.rng);
      return s;
    }
    if (!s.seated) throw new GameError('Take a seat first');
    if (a.type === 'deal') {
      if (s.phase !== 'idle') throw new GameError('Hand in progress');
      s.hand++; s.result = null; s.turns = 0; s.stake = BOOT; s.pot = 0;
      s.seats.forEach((x) => { if (x.bot && x.stack < BOOT * 10) x.stack = BOT_STACK; Object.assign(x, { cards: [], seen: false, packed: false, inHand: x.stack >= BOOT, put: 0 }); });
      if (!s.seats[0].inHand) throw new GameError('Rebuy to keep playing');
      const deck = shuffledDeck(ctx.rng);
      s.seats.forEach((x, i) => { if (x.inHand) { tpPay(s, i, BOOT); x.cards = [deck.pop()!, deck.pop()!, deck.pop()!]; } });
      s.dealer = (s.dealer + 1) % 4;
      s.toAct = s.dealer;
      s.phase = 'play';
      tpNext(s);
      s.log.unshift(`Hand #${s.hand}: boot ${BOOT}`);
      tpRunBots(s, ctx.rng);
      return s;
    }
    if (s.phase !== 'play') throw new GameError('No hand in progress');
    if (a.type === 'see') { s.seats[0].seen = true; return s; }
    if (s.toAct !== 0) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    tpAct(s, 0, a);
    tpRunBots(s, ctx.rng);
    return s;
  },
  finalize: (s, ctx) => { tpLeave(s); tpRunBots(s, ctx.rng); return s; },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked + (s.seated ? s.seats[0].stack : 0) } }),
  view: (s) => {
    const me = s.seats[0];
    const act = tpActive(s);
    return {
      seated: s.seated, phase: s.phase, pot: s.pot, stake: s.stake, toAct: s.toAct, hand: s.hand, log: s.log.slice(0, 12), result: s.result, potLimit: POT_LIMIT,
      seats: s.seats.map((x, i) => ({ name: x.name, bot: x.bot, stack: x.stack, seen: x.seen, packed: x.packed, inHand: x.inHand, dealer: i === s.dealer,
        cards: i === 0 ? (x.seen || s.phase === 'idle' ? x.cards : x.cards.map(() => -1)) : s.result?.reveal[i] ?? x.cards.map(() => -1) })),
      myHand: me.seen && me.cards.length ? tpName(me.cards) : null,
      options: s.phase === 'play' && s.toAct === 0 ? { chaal: chaalCost(s, 0, false), raise: chaalCost(s, 0, true), canShow: act.length === 2, canAfford: me.stack >= chaalCost(s, 0, false) } : null,
      net: s.totalReturned - s.totalStaked + (s.seated ? me.stack : 0),
    };
  },
};
