import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';

/** Hex connection game. Player 0 connects left<->right, player 1 connects top<->bottom. */
export interface HexState { n: number; cells: number[]; players: string[]; turn: number; winner: number | null; ai: number | null; aiLevel: string; last: number | null; moves: number; path: number[] }
type A = { type: 'place'; i: number } | { type: 'resign' };
const AI_ID = 'ai';

export function neighbours(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n;
  const out: number[] = [];
  for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc);
  }
  return out;
}

/** 0-1 BFS: minimum empty cells player p still needs to connect their sides (Infinity if blocked). */
export function distance(n: number, cells: number[], p: number): number {
  const dist = new Array(n * n).fill(Infinity);
  const dq: number[] = [];
  const startCells = [...Array(n).keys()].map((k) => (p === 0 ? k * n : k));
  for (const s of startCells) {
    if (cells[s] === 1 - p) continue;
    const cost = cells[s] === p ? 0 : 1;
    if (cost < dist[s]) { dist[s] = cost; cost ? dq.push(s) : dq.unshift(s); }
  }
  while (dq.length) {
    const cur = dq.shift()!;
    for (const nb of neighbours(n, cur)) {
      if (cells[nb] === 1 - p) continue;
      const nd = dist[cur] + (cells[nb] === p ? 0 : 1);
      if (nd < dist[nb]) { dist[nb] = nd; cells[nb] === p ? dq.unshift(nb) : dq.push(nb); }
    }
  }
  let best = Infinity;
  for (let k = 0; k < n; k++) best = Math.min(best, dist[p === 0 ? k * n + (n - 1) : (n - 1) * n + k]);
  return best;
}

export function winningPath(n: number, cells: number[], p: number): number[] | null {
  const prev = new Map<number, number>();
  const q: number[] = [];
  for (let k = 0; k < n; k++) { const s = p === 0 ? k * n : k; if (cells[s] === p) { prev.set(s, -1); q.push(s); } }
  while (q.length) {
    const cur = q.shift()!;
    const r = Math.floor(cur / n), c = cur % n;
    if ((p === 0 && c === n - 1) || (p === 1 && r === n - 1)) {
      const path: number[] = [];
      let x = cur;
      while (x !== -1) { path.push(x); x = prev.get(x)!; }
      return path;
    }
    for (const nb of neighbours(n, cur)) if (cells[nb] === p && !prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
  }
  return null;
}

function aiPick(s: HexState, rng: Rng): number {
  const me = s.ai!, opp = 1 - me;
  const empties = s.cells.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
  const centre = (s.n - 1) / 2;
  if (s.moves <= 1) {
    const c = Math.round(centre) * s.n + Math.round(centre);
    if (s.cells[c] < 0) return c;
  }
  const scored = empties.map((i) => {
    s.cells[i] = me;
    const mine = distance(s.n, s.cells, me);
    const theirs = distance(s.n, s.cells, opp);
    s.cells[i] = -1;
    const r = Math.floor(i / s.n), c = i % s.n;
    const central = -(Math.abs(r - centre) + Math.abs(c - centre)) * 0.05;
    const noise = s.aiLevel === 'easy' ? rng.next() * 3 : s.aiLevel === 'normal' ? rng.next() * 0.6 : rng.next() * 0.1;
    return { i, v: (mine === 0 ? 1000 : 0) + theirs * 1.1 - mine + central + noise };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].i;
}

function place(s: HexState, i: number) {
  s.cells[i] = s.turn;
  s.last = i;
  s.moves++;
  const path = winningPath(s.n, s.cells, s.turn);
  if (path) { s.winner = s.turn; s.path = path; return; }
  s.turn = 1 - s.turn;
}

export const hexConquest: Engine<HexState, A> = {
  id: 'hex-conquest', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 2 },
  init(o) {
    const n = o.difficulty === 'easy' ? 7 : o.difficulty === 'normal' ? 9 : 11;
    const players = o.players.length === 1 ? [o.players[0], AI_ID] : o.players.slice(0, 2);
    return { n, cells: new Array(n * n).fill(-1), players, turn: 0, winner: null, ai: o.players.length === 1 ? 1 : null, aiLevel: o.difficulty, last: null, moves: 0, path: [] };
  },
  apply(s, a, ctx) {
    if (s.winner !== null) throw new GameError('Game over');
    const me = s.players.indexOf(ctx.player);
    if (me < 0) throw new GameError('Not in this game');
    if (a.type === 'resign') { s.winner = 1 - me; return s; }
    if (me !== s.turn) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.n * s.n || s.cells[a.i] >= 0) throw new GameError('Cell not available');
    place(s, a.i);
    if (s.winner === null && s.ai !== null && s.turn === s.ai) place(s, aiPick(s, ctx.rng));
    return s;
  },
  isOver: (s) => s.winner !== null,
  turn: (s) => (s.winner !== null ? null : s.players[s.turn]),
  result: (s) => {
    const w = s.winner !== null ? s.players[s.winner] : null;
    const speed = Math.max(0, 200 - s.moves * 3);
    return { scores: Object.fromEntries(s.players.map((p) => [p, p === w ? 300 + speed : 0])), winner: w, summary: { moves: s.moves } };
  },
  view: (s) => s,
};
