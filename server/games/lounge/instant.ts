import { createHash } from 'node:crypto';
import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory, clampInt } from '../../../shared/engine';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const EDGE = 0.98;

/* =============================== PLINKO =============================== */
export type Risk = 'low' | 'medium' | 'high';
export const PLINKO_ROWS = [8, 12, 16] as const;
export function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
const shape = (risk: Risk, d: number) => (risk === 'low' ? 0.5 + 0.14 * Math.pow(d, 1.5) : risk === 'medium' ? 0.3 + 0.05 * Math.pow(d, 2.6) : 0.12 + 0.012 * Math.pow(d, 3.6));
const round = (x: number) => (x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);

/** Multiplier tables, normalised to 98% then rounded. Exact RTP after rounding is reported by plinkoRtp(). */
export const PLINKO_TABLES: Record<string, number[]> = {};
for (const n of PLINKO_ROWS) for (const risk of ['low', 'medium', 'high'] as Risk[]) {
  const base = Array.from({ length: n + 1 }, (_, k) => shape(risk, Math.abs(k - n / 2)));
  const ev = base.reduce((t, m, k) => t + (m * binom(n, k)) / Math.pow(2, n), 0);
  PLINKO_TABLES[`${n}-${risk}`] = base.map((m) => round((m * EDGE) / ev));
}
export function plinkoRtp(n: number, risk: Risk): number {
  return PLINKO_TABLES[`${n}-${risk}`].reduce((t, m, k) => t + (m * binom(n, k)) / Math.pow(2, n), 0);
}

interface PlinkoState extends ChanceState { last: null | { rows: number; risk: Risk; path: number[]; slot: number; mult: number; won: number } }
type PA = { type: 'drop'; rows: number; risk: Risk; amount: number };

export const plinko: Engine<PlinkoState, PA> = {
  id: 'plinko', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'drop' || !PLINKO_ROWS.includes(a.rows as 8) || !['low', 'medium', 'high'].includes(a.risk)) throw new GameError('Choose rows and risk');
    const amount = clampInt(a.amount, 10, 2000);
    s.round++;
    stake(s, amount, ctx, `r${s.round}-bet`);
    const path = Array.from({ length: a.rows }, () => ctx.rng.int(2));
    const slot = path.reduce((t, x) => t + x, 0);
    const mult = PLINKO_TABLES[`${a.rows}-${a.risk}`][slot];
    const won = Math.floor(amount * mult);
    payout(s, won, `r${s.round}-win`);
    s.last = { rows: a.rows, risk: a.risk, path, slot, mult, won };
    pushHistory(s, { mult, won, amount });
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked }),
};

/* =============================== DICE ARENA =============================== */
export type DiceBet = { kind: 'under' | 'over' | 'seven'; amount: number } | { kind: 'double'; n: number; amount: number };
export const DICE_PAYS = { under: 2.35, over: 2.35, seven: 5.8, double: 35 };
export function diceReturn(b: DiceBet, d1: number, d2: number): number {
  const t = d1 + d2;
  if (b.kind === 'under') return t < 7 ? b.amount * DICE_PAYS.under : 0;
  if (b.kind === 'over') return t > 7 ? b.amount * DICE_PAYS.over : 0;
  if (b.kind === 'seven') return t === 7 ? b.amount * DICE_PAYS.seven : 0;
  return d1 === d2 && d1 === (b as { n: number }).n ? b.amount * DICE_PAYS.double : 0;
}
export function diceRtp(b: DiceBet): number {
  let r = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) r += diceReturn({ ...b, amount: 1 } as DiceBet, x, y);
  return r / 36;
}
interface DiceState extends ChanceState { last: null | { dice: [number, number]; bet: DiceBet; won: number } }
type DA = { type: 'roll'; bet: DiceBet };

export const diceArena: Engine<DiceState, DA> = {
  id: 'dice-arena', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), last: null }),
  apply(s, a, ctx) {
    if (a.type !== 'roll' || !a.bet) throw new GameError('Choose a bet');
    const amount = clampInt(a.bet.amount, 10, 5000);
    let bet: DiceBet;
    if (a.bet.kind === 'double') bet = { kind: 'double', n: clampInt((a.bet as any).n, 1, 6), amount };
    else if (['under', 'over', 'seven'].includes(a.bet.kind)) bet = { kind: a.bet.kind, amount } as DiceBet;
    else throw new GameError('Unknown bet');
    s.round++;
    stake(s, amount, ctx, `r${s.round}-bet`);
    const dice: [number, number] = [1 + ctx.rng.int(6), 1 + ctx.rng.int(6)];
    const won = Math.floor(diceReturn(bet, dice[0], dice[1]));
    payout(s, won, `r${s.round}-win`);
    s.last = { dice, bet, won };
    pushHistory(s, { dice, won });
    return s;
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked }),
};

/* =============================== HI-LO =============================== */
interface HLState extends ChanceState {
  active: boolean; stakeAmt: number; mult: number; card: { r: number; s: number }; steps: number; skips: number;
  last: null | { call: string; next: { r: number; s: number }; win: boolean } ; banked: number | null;
}
type HLA = { type: 'start'; amount: number } | { type: 'call'; dir: 'higher' | 'lower' } | { type: 'skip' } | { type: 'bank' };
export const hlProb = (r: number, dir: 'higher' | 'lower') => (dir === 'higher' ? (13 - r) / 13 : (r - 1) / 13);
export const MAX_SKIPS = 5;

export const hiLo: Engine<HLState, HLA> = {
  id: 'hi-lo', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: (_o, ctx) => ({ ...newChanceState(), active: false, stakeAmt: 0, mult: 1, card: { r: 1 + ctx.rng.int(13), s: ctx.rng.int(4) }, steps: 0, skips: 0, last: null, banked: null }),
  apply(s, a, ctx) {
    const draw = () => ({ r: 1 + ctx.rng.int(13), s: ctx.rng.int(4) });
    if (a.type === 'start') {
      if (s.active) throw new GameError('Round in progress');
      s.stakeAmt = clampInt(a.amount, 10, 5000);
      s.round++;
      stake(s, s.stakeAmt, ctx, `r${s.round}-bet`);
      s.active = true; s.mult = 1; s.steps = 0; s.skips = 0; s.last = null; s.banked = null;
      s.card = draw();
      return s;
    }
    if (a.type === 'skip') {
      if (s.active && s.skips >= MAX_SKIPS) throw new GameError('No skips left this round');
      if (s.active) s.skips++;
      s.card = draw();
      return s;
    }
    if (!s.active) throw new GameError('Start a round first');
    if (a.type === 'bank') {
      if (s.steps === 0) throw new GameError('Make at least one call before banking');
      const won = Math.floor(s.stakeAmt * s.mult);
      payout(s, won, `r${s.round}-bank`);
      s.banked = won; s.active = false;
      pushHistory(s, { mult: s.mult, won });
      return s;
    }
    if (a.type === 'call') {
      if (a.dir !== 'higher' && a.dir !== 'lower') throw new GameError('Call higher or lower');
      const p = hlProb(s.card.r, a.dir);
      if (p === 0) throw new GameError('That call cannot win');
      const next = draw();
      const win = a.dir === 'higher' ? next.r > s.card.r : next.r < s.card.r;
      s.last = { call: a.dir, next, win };
      s.card = next;
      if (win) {
        s.mult = Math.min(10000, Math.floor(s.mult * (EDGE / p) * 10000) / 10000);
        s.steps++;
      } else {
        s.active = false;
        pushHistory(s, { mult: 0, won: 0 });
      }
      return s;
    }
    throw new GameError('Unknown action');
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({
    active: s.active, stake: s.stakeAmt, mult: s.mult, card: s.card, steps: s.steps, skipsLeft: MAX_SKIPS - s.skips, last: s.last, banked: s.banked,
    odds: { higher: hlProb(s.card.r, 'higher'), lower: hlProb(s.card.r, 'lower') },
    nextMult: { higher: hlProb(s.card.r, 'higher') ? (s.mult * EDGE) / hlProb(s.card.r, 'higher') : null, lower: hlProb(s.card.r, 'lower') ? (s.mult * EDGE) / hlProb(s.card.r, 'lower') : null },
    history: s.history, net: s.totalReturned - s.totalStaked,
  }),
};

/* =============================== MINES =============================== */
export function minesMult(mines: number, safe: number): number {
  let m = EDGE;
  for (let i = 0; i < safe; i++) m *= (25 - i) / (25 - mines - i);
  return Math.floor(m * 100) / 100;
}
interface MinesState extends ChanceState {
  active: boolean; stakeAmt: number; mines: number; layout: number[]; salt: string; commit: string; revealed: number[];
  boom: number | null; banked: number | null; lastReveal: { layout: number[]; salt: string; commit: string } | null;
}
type MA = { type: 'start'; amount: number; mines: number } | { type: 'reveal'; i: number } | { type: 'bank' };

export const mines: Engine<MinesState, MA> = {
  id: 'mines', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init: () => ({ ...newChanceState(), active: false, stakeAmt: 0, mines: 3, layout: [], salt: '', commit: '', revealed: [], boom: null, banked: null, lastReveal: null }),
  apply(s, a, ctx) {
    const end = () => { s.active = false; s.lastReveal = { layout: s.layout, salt: s.salt, commit: s.commit }; };
    if (a.type === 'start') {
      if (s.active) throw new GameError('Round in progress');
      s.stakeAmt = clampInt(a.amount, 10, 5000);
      s.mines = clampInt(a.mines, 1, 24);
      s.round++;
      stake(s, s.stakeAmt, ctx, `r${s.round}-bet`);
      s.layout = ctx.rng.shuffle([...Array(25).keys()]).slice(0, s.mines).sort((x, y) => x - y);
      s.salt = Array.from({ length: 4 }, () => ctx.rng.u32().toString(16).padStart(8, '0')).join('');
      s.commit = sha(`${s.layout.join(',')}:${s.salt}`);
      s.revealed = []; s.boom = null; s.banked = null; s.active = true; s.lastReveal = null;
      return s;
    }
    if (!s.active) throw new GameError('Start a round first');
    if (a.type === 'reveal') {
      const i = clampInt(a.i, 0, 24);
      if (s.revealed.includes(i)) throw new GameError('Already revealed');
      if (s.layout.includes(i)) { s.boom = i; end(); pushHistory(s, { mines: s.mines, safe: s.revealed.length, won: 0 }); return s; }
      s.revealed.push(i);
      if (s.revealed.length === 25 - s.mines) {
        const won = Math.floor(s.stakeAmt * minesMult(s.mines, s.revealed.length));
        payout(s, won, `r${s.round}-bank`);
        s.banked = won; end();
        pushHistory(s, { mines: s.mines, safe: s.revealed.length, won });
      }
      return s;
    }
    if (a.type === 'bank') {
      if (!s.revealed.length) throw new GameError('Reveal at least one tile');
      const won = Math.floor(s.stakeAmt * minesMult(s.mines, s.revealed.length));
      payout(s, won, `r${s.round}-bank`);
      s.banked = won; end();
      pushHistory(s, { mines: s.mines, safe: s.revealed.length, won });
      return s;
    }
    throw new GameError('Unknown action');
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({
    active: s.active, stake: s.stakeAmt, mines: s.mines, revealed: s.revealed, boom: s.boom, banked: s.banked, commit: s.commit,
    mult: s.revealed.length ? minesMult(s.mines, s.revealed.length) : 1, nextMult: minesMult(s.mines, s.revealed.length + 1),
    reveal: s.active ? null : s.lastReveal, history: s.history, net: s.totalReturned - s.totalStaked,
  }),
};

/* =============================== CRASH FLIGHT =============================== */
export const GROWTH = 0.00006; // per ms: 2x at ~11.6s
export const multAt = (ms: number) => Math.floor(Math.exp(GROWTH * Math.max(0, ms)) * 100) / 100;
export const msFor = (m: number) => Math.log(m) / GROWTH;
/** P(stall >= m) = 0.98 / m for m >= 1; values below 1.00 stall instantly. */
export function crashPoint(u: number): number {
  const m = EDGE / (1 - u);
  return m < 1 ? 1 : Math.floor(m * 100) / 100;
}
interface CrashState extends ChanceState {
  phase: 'idle' | 'flying' | 'done'; stakeAmt: number; auto: number | null; start: number; point: number; salt: string; commit: string;
  bankedAt: number | null; won: number; lastReveal: { point: number; salt: string; commit: string } | null;
}
type CA = { type: 'takeoff'; amount: number; auto?: number | null } | { type: 'bank' } | { type: 'tick' };

function resolveCrash(s: CrashState, now: number) {
  if (s.phase !== 'flying') return;
  const elapsed = now - s.start;
  const cur = multAt(elapsed);
  if (s.auto && s.point >= s.auto && cur >= s.auto) { settleCrash(s, s.auto); return; }
  if (cur >= s.point || s.point <= 1) { s.phase = 'done'; s.bankedAt = null; s.won = 0; reveal(s); pushHistory(s, { point: s.point, banked: null }); }
}
function settleCrash(s: CrashState, m: number) {
  s.won = Math.floor(s.stakeAmt * m);
  payout(s, s.won, `r${s.round}-bank`);
  s.bankedAt = m;
  s.phase = 'done';
  reveal(s);
  pushHistory(s, { point: s.point, banked: m });
}
const reveal = (s: CrashState) => { s.lastReveal = { point: s.point, salt: s.salt, commit: s.commit }; };

export const crashFlight: Engine<CrashState, CA> = {
  id: 'crash-flight', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 }, timed: true,
  init: () => ({ ...newChanceState(), phase: 'idle', stakeAmt: 0, auto: null, start: 0, point: 1, salt: '', commit: '', bankedAt: null, won: 0, lastReveal: null }),
  apply(s, a, ctx) {
    if (a.type === 'tick') { resolveCrash(s, ctx.now); return s; }
    if (a.type === 'takeoff') {
      resolveCrash(s, ctx.now);
      if (s.phase === 'flying') throw new GameError('Already flying');
      s.stakeAmt = clampInt(a.amount, 10, 5000);
      s.auto = a.auto ? Math.round(Number(a.auto) * 100) / 100 : null;
      if (s.auto !== null && (!(s.auto >= 1.01) || s.auto > 1000)) throw new GameError('Auto-bank must be between 1.01x and 1000x');
      s.round++;
      stake(s, s.stakeAmt, ctx, `r${s.round}-bet`);
      s.point = crashPoint(ctx.rng.next());
      s.salt = Array.from({ length: 4 }, () => ctx.rng.u32().toString(16).padStart(8, '0')).join('');
      s.commit = sha(`${s.point.toFixed(2)}:${s.salt}`);
      s.start = ctx.now + 1500; // countdown before lift-off
      s.phase = 'flying'; s.bankedAt = null; s.won = 0; s.lastReveal = null;
      if (s.point <= 1) { /* instant stall resolves on first tick after lift-off */ }
      return s;
    }
    if (a.type === 'bank') {
      if (s.phase !== 'flying') throw new GameError('Not flying');
      if (ctx.now < s.start) throw new GameError('Not airborne yet');
      resolveCrash(s, ctx.now);
      if (s.phase !== 'flying') return s;
      settleCrash(s, multAt(ctx.now - s.start));
      return s;
    }
    throw new GameError('Unknown action');
  },
  isOver: () => false,
  result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
  view: (s) => ({
    phase: s.phase, stake: s.stakeAmt, auto: s.auto, start: s.start, commit: s.commit, bankedAt: s.bankedAt, won: s.won,
    reveal: s.phase === 'flying' ? null : s.lastReveal, growth: GROWTH, history: s.history, net: s.totalReturned - s.totalStaked,
  }),
};
