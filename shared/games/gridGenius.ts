import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng, Rng } from '../rng';

export interface GridPuzzle { n: number; bh: number; bw: number; givens: number[]; solution: number[] }
export interface GridState {
  seed: string; difficulty: Difficulty; puzzle: GridPuzzle; cells: number[]; mistakes: number; score: number; over: boolean; solvedAt: number | null;
}
export type GridAction = { t: number; i: number; v: number } | { t: number; end: true };

const DIMS: Record<Difficulty, { n: number; bh: number; bw: number; mult: number }> = {
  easy: { n: 4, bh: 2, bw: 2, mult: 1 },
  normal: { n: 6, bh: 2, bw: 3, mult: 1.5 },
  hard: { n: 9, bh: 3, bw: 3, mult: 2.5 },
};

export function conflicts(cells: number[], n: number, bh: number, bw: number, i: number, v: number): boolean {
  if (!v) return false;
  const r = Math.floor(i / n), c = i % n;
  for (let k = 0; k < n; k++) {
    if (k !== c && cells[r * n + k] === v) return true;
    if (k !== r && cells[k * n + c] === v) return true;
  }
  const br = Math.floor(r / bh) * bh, bc = Math.floor(c / bw) * bw;
  for (let y = br; y < br + bh; y++) for (let x = bc; x < bc + bw; x++) {
    const j = y * n + x;
    if (j !== i && cells[j] === v) return true;
  }
  return false;
}

/** Counts solutions up to `limit` (backtracking). */
export function countSolutions(cells: number[], n: number, bh: number, bw: number, limit = 2): number {
  const g = cells.slice();
  let count = 0;
  const rec = (): boolean => {
    let best = -1, bestOpts: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (g[i]) continue;
      const opts: number[] = [];
      for (let v = 1; v <= n; v++) if (!conflicts(g, n, bh, bw, i, v)) opts.push(v);
      if (!opts.length) return false;
      if (best === -1 || opts.length < bestOpts.length) { best = i; bestOpts = opts; }
      if (opts.length === 1) break;
    }
    if (best === -1) { count++; return count >= limit; }
    for (const v of bestOpts) {
      g[best] = v;
      if (rec()) return true;
      g[best] = 0;
    }
    return false;
  };
  rec();
  return count;
}

export function makeGrid(seed: string, difficulty: Difficulty): GridPuzzle {
  const { n, bh, bw } = DIMS[difficulty];
  const rng: Rng = new SeededRng(`${seed}::grid`);
  const bands = n / bh, stacks = n / bw;
  const rowOrder: number[] = [];
  for (const b of rng.shuffle([...Array(bands).keys()])) for (const r of rng.shuffle([...Array(bh).keys()])) rowOrder.push(b * bh + r);
  const colOrder: number[] = [];
  for (const s of rng.shuffle([...Array(stacks).keys()])) for (const c of rng.shuffle([...Array(bw).keys()])) colOrder.push(s * bw + c);
  const digits = rng.shuffle([...Array(n).keys()].map((d) => d + 1));
  const solution = new Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const rr = rowOrder[r], cc = colOrder[c];
    solution[r * n + c] = digits[(bw * (rr % bh) + Math.floor(rr / bh) + cc) % n];
  }
  const givens = solution.slice();
  const target = difficulty === 'easy' ? 6 : difficulty === 'normal' ? 14 : 30; // remaining clue goal
  for (const i of rng.shuffle([...Array(n * n).keys()])) {
    if (givens.filter(Boolean).length <= target) break;
    const keep = givens[i];
    givens[i] = 0;
    if (countSolutions(givens, n, bh, bw, 2) !== 1) givens[i] = keep;
  }
  return { n, bh, bw, givens, solution };
}

export const gridGenius: Engine<GridState, GridAction> = {
  id: 'grid-genius', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const puzzle = makeGrid(seed, o.difficulty);
    return { seed, difficulty: o.difficulty, puzzle, cells: puzzle.givens.slice(), mistakes: 0, score: 0, over: false, solvedAt: null };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Puzzle finished');
    if ('end' in a) { s.over = true; return s; }
    const { n, bh, bw, givens } = s.puzzle;
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= n * n) throw new GameError('Bad cell');
    if (!Number.isInteger(a.v) || a.v < 0 || a.v > n) throw new GameError('Bad value');
    if (givens[a.i]) throw new GameError('That cell is a given');
    if (a.v && conflicts(s.cells, n, bh, bw, a.i, a.v)) s.mistakes++;
    s.cells[a.i] = a.v;
    const full = s.cells.every(Boolean);
    if (full && s.cells.every((v, i) => !conflicts(s.cells, n, bh, bw, i, v))) {
      const mult = DIMS[s.difficulty].mult;
      const base = Math.max(100, 1000 - Math.floor(ctx.now / 1000) * 2 - 50 * s.mistakes);
      s.score = Math.round(base * mult);
      s.solvedAt = ctx.now;
      s.over = true;
    }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { solved: s.solvedAt !== null, mistakes: s.mistakes, seconds: s.solvedAt ? Math.round(s.solvedAt / 1000) : null } }),
  view: (s) => ({ ...s, puzzle: { ...s.puzzle, solution: s.over ? s.puzzle.solution : undefined } }),
  maxDurationMs: () => 60 * 60_000,
};
