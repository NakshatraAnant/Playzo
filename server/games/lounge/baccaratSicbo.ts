import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt } from '../../../shared/engine';
import { bacTotal, bacValue, shuffledDeck } from '../../../shared/cards';

/* =============================== BACCARAT (Punto Banco) =============================== */
interface BacState extends ChanceState { shoe: number[]; last: null | { player: number[]; banker: number[]; pt: number; bt: number; winner: 'player' | 'banker' | 'tie'; notes: string[] } }
type BacA = { type: 'deal'; bets: { player?: number; banker?: number; tie?: number } };

/** Standard tableau. Returns hands and human-readable notes explaining each decision. */
export function baccaratCoup(draw: () => number) {
  const player = [draw(), draw()], banker = [draw(), draw()];
  const notes: string[] = [];
  let pt = bacTotal(player), bt = bacTotal(banker);
  if (pt >= 8 || bt >= 8) {
    notes.push(`Natural ${pt >= 8 ? 'for Player' : 'for Banker'}: no more cards.`);
  } else {
    let third: number | null = null;
    if (pt <= 5) { third = draw(); player.push(third); notes.push(`Player had ${pt} (0-5): draws.`); pt = bacTotal(player); }
    else notes.push(`Player has ${pt} (6-7): stands.`);
    if (third === null) {
      if (bt <= 5) { banker.push(draw()); notes.push(`Player stood; Banker had ${bt} (0-5): draws.`); }
      else notes.push(`Player stood; Banker has ${bt}: stands.`);
    } else {
      const t = bacValue(third);
      const drawIt = bt <= 2 || (bt === 3 && t !== 8) || (bt === 4 && t >= 2 && t <= 7) || (bt === 5 && t >= 4 && t <= 7) || (bt === 6 && (t === 6 || t === 7));
      if (drawIt) { banker.push(draw()); notes.push(`Banker had ${bt} vs Player third card ${t}: draws.`); }
      else notes.push(`Banker has ${bt} vs Player third card ${t}: stands.`);
    }
    bt = bacTotal(banker);
  }
  const winner: 'player' | 'banker' | 'tie' = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
  return { player, banker, pt, bt, winner, notes };
}

export const baccarat: Engine<BacState, BacA> = {
  id: 'baccarat', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: (_o, ctx) => ({ ...newChanceState(), shoe: shuffledDeck(ctx.rng, 8), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'deal' || !a.bets) throw new GameError('Place a bet');
    const bets = { player: a.bets.player ? clampInt(a.bets.player, 10, 5000) : 0, banker: a.bets.banker ? clampInt(a.bets.banker, 10, 5000) : 0, tie: a.bets.tie ? clampInt(a.bets.tie, 10, 5000) : 0 };
    if (!bets.player && !bets.banker && !bets.tie) throw new GameError('Place a bet');
    if (s.shoe.length < 60) s.shoe = shuffledDeck(ctx.rng, 8);
    s.round++;
    for (const k of ['player', 'banker', 'tie'] as const) if (bets[k]) stake(s, bets[k], ctx, `r${s.round}-${k}`);
    const coup = baccaratCoup(() => s.shoe.pop()!);
    let ret = 0;
    if (coup.winner === 'tie') ret = bets.tie * 9 + bets.player + bets.banker;
    else if (coup.winner === 'player') ret = bets.player * 2;
    else ret = Math.floor(bets.banker * 1.95);
    payout(s, ret, `r${s.round}-win`);
    s.last = coup;
    pushHistory(s, { winner: coup.winner, pt: coup.pt, bt: coup.bt }, 60);
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked, shoeLeft: s.shoe.length }),
};

/* =============================== SIC BO =============================== */
export type SicBet = { kind: 'small' | 'big' | 'anyTriple'; amount: number } | { kind: 'total' | 'double' | 'triple' | 'single'; n: number; amount: number };
export const TOTAL_PAYS: Record<number, number> = { 4: 60, 17: 60, 5: 30, 16: 30, 6: 17, 15: 17, 7: 12, 14: 12, 8: 8, 13: 8, 9: 6, 12: 6, 10: 6, 11: 6 };
interface SBState extends ChanceState { last: null | { dice: number[]; bets: (SicBet & { won: number })[] } }
type SBA = { type: 'roll'; bets: SicBet[] };

export function sicReturn(b: SicBet, d: number[]): number {
  const sum = d[0] + d[1] + d[2];
  const triple = d[0] === d[1] && d[1] === d[2];
  const count = (n: number) => d.filter((x) => x === n).length;
  switch (b.kind) {
    case 'small': return !triple && sum >= 4 && sum <= 10 ? b.amount * 2 : 0;
    case 'big': return !triple && sum >= 11 && sum <= 17 ? b.amount * 2 : 0;
    case 'anyTriple': return triple ? b.amount * 31 : 0;
    case 'total': return sum === b.n ? b.amount * (TOTAL_PAYS[b.n] + 1) : 0;
    case 'double': return count(b.n) >= 2 ? b.amount * 11 : 0;
    case 'triple': return triple && d[0] === b.n ? b.amount * 151 : 0;
    case 'single': { const c = count(b.n); return c ? b.amount * (1 + c) : 0; }
  }
}

/** Exact RTP over all 216 equally likely outcomes. */
export function sicRtp(b: SicBet): number {
  let ret = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) for (let z = 1; z <= 6; z++) ret += sicReturn({ ...b, amount: 1 } as SicBet, [x, y, z]);
  return ret / 216;
}

function validSic(b: SicBet): SicBet {
  const amount = clampInt(b.amount, 10, 5000);
  if (b.kind === 'small' || b.kind === 'big' || b.kind === 'anyTriple') return { kind: b.kind, amount };
  if (b.kind === 'total') return { kind: 'total', n: clampInt((b as any).n, 4, 17), amount };
  if (b.kind === 'double' || b.kind === 'triple' || b.kind === 'single') return { kind: b.kind, n: clampInt((b as any).n, 1, 6), amount };
  throw new GameError('Unknown bet');
}

export const sicBo: Engine<SBState, SBA> = {
  id: 'sic-bo', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'roll' || !Array.isArray(a.bets) || !a.bets.length || a.bets.length > 30) throw new GameError('Place 1-30 bets');
    const bets = a.bets.map(validSic);
    s.round++;
    bets.forEach((b, i) => stake(s, b.amount, ctx, `r${s.round}-b${i}`));
    const dice = [1 + ctx.rng.int(6), 1 + ctx.rng.int(6), 1 + ctx.rng.int(6)];
    const settled = bets.map((b) => ({ ...b, won: sicReturn(b, dice) }));
    payout(s, settled.reduce((t, b) => t + b.won, 0), `r${s.round}-win`);
    s.last = { dice, bets: settled };
    pushHistory(s, { dice, sum: dice[0] + dice[1] + dice[2] });
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked }),
};
