import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

export interface Lock { dials: number; positions: number; links: number[][]; start: number[]; minMoves: number }
export interface LockState {
  seed: string; difficulty: Difficulty; index: number; total: number; lock: Lock; dials: number[];
  moves: number[]; score: number; solved: { moves: number; min: number }[]; over: boolean;
}
export type LockAction = { t: number; lever: number } | { t: number; undo: true } | { t: number; end: true };

const CFG: Record<Difficulty, { dials: number[]; positions: number; levers: number[] }> = {
  easy: { dials: [3, 3, 4, 4, 4], positions: 4, levers: [3, 3, 3, 4, 4] },
  normal: { dials: [4, 4, 5, 5, 5], positions: 6, levers: [4, 4, 4, 5, 5] },
  hard: { dials: [5, 5, 6, 6, 6], positions: 6, levers: [5, 5, 5, 6, 6] },
};

/** Minimum total presses solving A x = -d (mod P), by exhaustive search over press counts. */
export function minMoves(links: number[][], start: number[], P: number): number {
  const L = links.length;
  let best = Infinity;
  const x = new Array(L).fill(0);
  const total = Math.pow(P, L);
  for (let k = 0; k < total; k++) {
    let v = k, sum = 0;
    for (let i = 0; i < L; i++) { x[i] = v % P; v = Math.floor(v / P); sum += x[i]; }
    if (sum >= best) continue;
    let ok = true;
    for (let d = 0; d < start.length && ok; d++) {
      let pos = start[d];
      for (let i = 0; i < L; i++) if (links[i].includes(d)) pos += x[i];
      if (pos % P !== 0) ok = false;
    }
    if (ok) best = sum;
  }
  return best;
}

export function makeLock(seed: string, index: number, difficulty: Difficulty): Lock {
  const rng = subRng(seed, `lock-${index}`);
  const c = CFG[difficulty];
  const dials = c.dials[index], levers = c.levers[index], P = c.positions;
  for (;;) {
    const links: number[][] = [];
    for (let l = 0; l < levers; l++) {
      const k = 1 + rng.int(Math.min(3, dials));
      const set = new Set<number>();
      while (set.size < k) set.add(rng.int(dials));
      links.push([...set].sort());
    }
    // every dial must be reachable by some lever
    if (!Array.from({ length: dials }, (_, d) => links.some((l) => l.includes(d))).every(Boolean)) continue;
    const presses = links.map(() => rng.int(P));
    const start = new Array(dials).fill(0);
    links.forEach((l, i) => l.forEach((d) => { start[d] = (start[d] - presses[i] + P * 10) % P; }));
    if (start.every((v) => v === 0)) continue;
    const m = minMoves(links, start, P);
    if (m < 3) continue;
    return { dials, positions: P, links, start, minMoves: m };
  }
}

export const logicLock: Engine<LockState, LockAction> = {
  id: 'logic-lock', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const lock = makeLock(seed, 0, o.difficulty);
    return { seed, difficulty: o.difficulty, index: 0, total: 5, lock, dials: lock.start.slice(), moves: [], score: 0, solved: [], over: false };
  },
  apply(s, a, _ctx) {
    if (s.over) throw new GameError('Run is over');
    if ('end' in a) { s.over = true; return s; }
    const P = s.lock.positions;
    if ('undo' in a) {
      const last = s.moves.pop();
      if (last === undefined) return s;
      s.lock.links[last].forEach((d) => { s.dials[d] = (s.dials[d] - 1 + P) % P; });
      return s;
    }
    if (!Number.isInteger(a.lever) || a.lever < 0 || a.lever >= s.lock.links.length) throw new GameError('Bad lever');
    s.lock.links[a.lever].forEach((d) => { s.dials[d] = (s.dials[d] + 1) % P; });
    s.moves.push(a.lever);
    if (s.dials.every((v) => v === 0)) {
      const used = s.moves.length;
      s.score += 200 + Math.max(0, 100 - 20 * (used - s.lock.minMoves));
      s.solved.push({ moves: used, min: s.lock.minMoves });
      s.index++;
      if (s.index >= s.total) { s.over = true; return s; }
      s.lock = makeLock(s.seed, s.index, s.difficulty);
      s.dials = s.lock.start.slice();
      s.moves = [];
    }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { solved: s.solved.length, detail: s.solved } }),
  view: (s) => s,
  maxDurationMs: () => 30 * 60_000,
};
