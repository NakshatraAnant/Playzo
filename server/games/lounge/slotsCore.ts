/**
 * Generic slot engine with exact RTP mathematics.
 * - Reel stops are drawn uniformly by the server's cryptographic RNG.
 * - Outcomes never depend on balance, spend, history or membership status.
 * - `exactRtp()` computes theoretical return from the published reel strips.
 */
import { Engine, GameError, ChanceState, newChanceState, stake, payout, pushHistory } from '../../../shared/engine';

export interface SlotConfig {
  id: string;
  rows: 1 | 3;
  mode: 'lines' | 'ways';
  reels: string[][];
  /** Row index per reel for each payline (lines mode). */
  lines?: number[][];
  /** symbol -> count -> multiplier (of line bet, or of totalBet / waysDivisor). */
  pays: Record<string, Record<number, number>>;
  wild?: string;
  scatter?: { sym: string; pays: Record<number, number> };
  jackpot?: { oneIn: number; mult: number };
  waysDivisor?: number;
  bets: number[];
}

export interface SpinWin { kind: 'line' | 'ways' | 'scatter' | 'jackpot'; line?: number; sym: string; count: number; ways?: number; amount: number; cells: [number, number][] }

export const windowOf = (cfg: SlotConfig, stops: number[]): string[][] =>
  cfg.reels.map((strip, r) => Array.from({ length: cfg.rows }, (_, row) => strip[(stops[r] + row) % strip.length]));

/** Evaluate one line (left to right). Returns multiplier of the line bet and matched count. */
export function evalLine(cfg: SlotConfig, seq: string[]): { mult: number; sym: string; count: number } {
  const wild = cfg.wild, scat = cfg.scatter?.sym;
  let lineSym = seq.find((s) => s !== wild) ?? wild!;
  if (lineSym === scat) return { mult: 0, sym: lineSym, count: 0 };
  let count = 0;
  for (const s of seq) { if (s === lineSym || (s === wild && lineSym !== scat)) count++; else break; }
  let best = { mult: cfg.pays[lineSym]?.[count] ?? 0, sym: lineSym, count };
  if (wild && cfg.pays[wild]) {
    let wc = 0;
    for (const s of seq) { if (s === wild) wc++; else break; }
    const wm = cfg.pays[wild][wc] ?? 0;
    if (wm > best.mult) best = { mult: wm, sym: wild, count: wc };
  }
  if (!best.mult) lineSym = seq[0];
  return best;
}

export function evaluate(cfg: SlotConfig, win: string[][], totalBet: number): SpinWin[] {
  const wins: SpinWin[] = [];
  if (cfg.mode === 'lines') {
    const lines = cfg.lines ?? [[0, 0, 0]];
    const lineBet = totalBet / lines.length;
    lines.forEach((ln, li) => {
      const seq = ln.map((row, r) => win[r][row]);
      const e = evalLine(cfg, seq);
      if (e.mult > 0) wins.push({ kind: 'line', line: li, sym: e.sym, count: e.count, amount: e.mult * lineBet, cells: ln.slice(0, e.count).map((row, r) => [r, row]) });
    });
  } else {
    const unit = totalBet / (cfg.waysDivisor ?? 25);
    for (const sym of Object.keys(cfg.pays)) {
      if (sym === cfg.wild || sym === cfg.scatter?.sym) continue;
      let ways = 1, n = 0;
      const cells: [number, number][] = [];
      for (let r = 0; r < win.length; r++) {
        const hits = win[r].map((s, row) => (s === sym || s === cfg.wild ? row : -1)).filter((x) => x >= 0);
        if (!hits.length) break;
        ways *= hits.length; n++;
        hits.forEach((row) => cells.push([r, row]));
      }
      const m = cfg.pays[sym][n] ?? 0;
      if (m) wins.push({ kind: 'ways', sym, count: n, ways, amount: m * ways * unit, cells });
    }
  }
  if (cfg.scatter) {
    const cells: [number, number][] = [];
    win.forEach((col, r) => col.forEach((s, row) => { if (s === cfg.scatter!.sym) cells.push([r, row]); }));
    const m = cfg.scatter.pays[cells.length] ?? 0;
    if (m) wins.push({ kind: 'scatter', sym: cfg.scatter.sym, count: cells.length, amount: m * totalBet, cells });
  }
  return wins;
}

/* ---------------- exact mathematics ---------------- */
function dist(strip: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of strip) m.set(s, (m.get(s) ?? 0) + 1 / strip.length);
  return m;
}

export function exactRtp(cfg: SlotConfig): { total: number; base: number; scatter: number; jackpot: number; hitRate?: number } {
  let base = 0;
  if (cfg.mode === 'lines') {
    const dists = cfg.reels.map(dist);
    const rec = (r: number, seq: string[], p: number) => {
      if (r === dists.length) { base += p * evalLine(cfg, seq).mult; return; }
      for (const [s, q] of dists[r]) { seq.push(s); rec(r + 1, seq, p * q); seq.pop(); }
    };
    rec(0, [], 1);
  } else {
    const D = cfg.waysDivisor ?? 25;
    for (const sym of Object.keys(cfg.pays)) {
      if (sym === cfg.wild || sym === cfg.scatter?.sym) continue;
      const ex: number[] = [], p0: number[] = [];
      for (const strip of cfg.reels) {
        let e = 0, z = 0;
        for (let stop = 0; stop < strip.length; stop++) {
          let x = 0;
          for (let row = 0; row < cfg.rows; row++) { const s = strip[(stop + row) % strip.length]; if (s === sym || s === cfg.wild) x++; }
          e += x / strip.length; if (!x) z += 1 / strip.length;
        }
        ex.push(e); p0.push(z);
      }
      for (let n = 1; n <= cfg.reels.length; n++) {
        const m = cfg.pays[sym][n];
        if (!m) continue;
        let v = m / D;
        for (let r = 0; r < n; r++) v *= ex[r];
        if (n < cfg.reels.length) v *= p0[n];
        base += v;
      }
    }
  }
  let scatter = 0;
  if (cfg.scatter) {
    let totalDist = new Map<number, number>([[0, 1]]);
    for (const strip of cfg.reels) {
      const per = new Map<number, number>();
      for (let stop = 0; stop < strip.length; stop++) {
        let k = 0;
        for (let row = 0; row < cfg.rows; row++) if (strip[(stop + row) % strip.length] === cfg.scatter.sym) k++;
        per.set(k, (per.get(k) ?? 0) + 1 / strip.length);
      }
      const next = new Map<number, number>();
      for (const [a, pa] of totalDist) for (const [b, pb] of per) next.set(a + b, (next.get(a + b) ?? 0) + pa * pb);
      totalDist = next;
    }
    for (const [k, p] of totalDist) scatter += p * (cfg.scatter.pays[k] ?? 0);
  }
  const jackpot = cfg.jackpot ? cfg.jackpot.mult / cfg.jackpot.oneIn : 0;
  return { total: base + scatter + jackpot, base, scatter, jackpot };
}

/* ---------------- engine ---------------- */
interface SlotState extends ChanceState { last: null | { stops: number[]; window: string[][]; wins: SpinWin[]; bet: number; total: number; jackpot: boolean } }
type A = { type: 'spin'; bet: number };

export function slotEngine(cfg: SlotConfig): Engine<SlotState, A> {
  return {
    id: cfg.id, rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
    init: () => ({ ...newChanceState(), last: null }),
    apply(s, a, ctx) {
      if (a.type !== 'spin') throw new GameError('Unknown action');
      const bet = Number(a.bet);
      if (!cfg.bets.includes(bet)) throw new GameError('Choose a listed bet size');
      s.round++;
      stake(s, bet, ctx, `r${s.round}-bet`, cfg.bets[0], cfg.bets[cfg.bets.length - 1]);
      const stops = cfg.reels.map((strip) => ctx.rng.int(strip.length));
      const window = windowOf(cfg, stops);
      const wins = evaluate(cfg, window, bet);
      // Jackpot draw is independent of the reels, the player's balance and history.
      let jackpot = false;
      if (cfg.jackpot && ctx.rng.int(cfg.jackpot.oneIn) === 0) {
        jackpot = true;
        wins.push({ kind: 'jackpot', sym: 'JACKPOT', count: 0, amount: cfg.jackpot.mult * bet, cells: [] });
      }
      const total = Math.floor(wins.reduce((t, w) => t + w.amount, 0));
      payout(s, total, `r${s.round}-win`);
      s.last = { stops, window, wins, bet, total, jackpot };
      pushHistory(s, { bet, total });
      return s;
    },
    isOver: () => false,
    result: (s) => ({ scores: { p1: s.totalReturned - s.totalStaked } }),
    view: (s) => ({ last: s.last, history: s.history, net: s.totalReturned - s.totalStaked, round: s.round }),
  };
}
