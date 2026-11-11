import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';

export interface C5State { n: number; cells: number[]; players: string[]; turn: number; winner: number | null; draw: boolean; ai: number | null; aiLevel: string; last: number | null; line: number[]; moves: number }
type A = { type: 'place'; i: number } | { type: 'resign' };
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function fiveLine(s: { n: number; cells: number[] }, i: number): number[] | null {
  const p = s.cells[i];
  const r0 = Math.floor(i / s.n), c0 = i % s.n;
  for (const [dr, dc] of DIRS) {
    const line = [i];
    for (const sgn of [1, -1]) {
      let r = r0 + dr * sgn, c = c0 + dc * sgn;
      while (r >= 0 && c >= 0 && r < s.n && c < s.n && s.cells[r * s.n + c] === p) { line.push(r * s.n + c); r += dr * sgn; c += dc * sgn; }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function lineScore(s: C5State, i: number, p: number): number {
  const r0 = Math.floor(i / s.n), c0 = i % s.n;
  let total = 0;
  for (const [dr, dc] of DIRS) {
    let count = 1, open = 0;
    for (const sgn of [1, -1]) {
      let r = r0 + dr * sgn, c = c0 + dc * sgn;
      while (r >= 0 && c >= 0 && r < s.n && c < s.n && s.cells[r * s.n + c] === p) { count++; r += dr * sgn; c += dc * sgn; }
      if (r >= 0 && c >= 0 && r < s.n && c < s.n && s.cells[r * s.n + c] < 0) open++;
    }
    if (count >= 5) total += 1_000_000;
    else if (count === 4) total += open === 2 ? 100_000 : open === 1 ? 10_000 : 0;
    else if (count === 3) total += open === 2 ? 5_000 : open === 1 ? 400 : 0;
    else if (count === 2) total += open === 2 ? 200 : open === 1 ? 40 : 0;
    else total += open * 2;
  }
  return total;
}

function aiPick(s: C5State, rng: Rng): number {
  const me = s.ai!, opp = 1 - me;
  const centre = Math.floor(s.n / 2) * s.n + Math.floor(s.n / 2);
  if (s.moves === 0) return centre;
  const near = (i: number) => {
    const r = Math.floor(i / s.n), c = i % s.n;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < s.n && cc < s.n && s.cells[rr * s.n + cc] >= 0) return true;
    }
    return false;
  };
  const defW = s.aiLevel === 'easy' ? 0.5 : s.aiLevel === 'normal' ? 0.85 : 0.95;
  let best = -1, bestV = -Infinity;
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i] >= 0 || !near(i)) continue;
    const v = lineScore(s, i, me) + defW * lineScore(s, i, opp) + rng.next() * (s.aiLevel === 'easy' ? 300 : 5);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best >= 0 ? best : s.cells.findIndex((c) => c < 0);
}

function place(s: C5State, i: number) {
  s.cells[i] = s.turn;
  s.last = i;
  s.moves++;
  const line = fiveLine(s, i);
  if (line) { s.winner = s.turn; s.line = line; return; }
  if (s.cells.every((c) => c >= 0)) { s.draw = true; return; }
  s.turn = 1 - s.turn;
}

export const connectFive: Engine<C5State, A> = {
  id: 'connect-five', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 2 },
  init(o) {
    const n = o.difficulty === 'easy' ? 11 : 13;
    const players = o.players.length === 1 ? [o.players[0], 'ai'] : o.players.slice(0, 2);
    return { n, cells: new Array(n * n).fill(-1), players, turn: 0, winner: null, draw: false, ai: o.players.length === 1 ? 1 : null, aiLevel: o.difficulty, last: null, line: [], moves: 0 };
  },
  apply(s, a, ctx) {
    if (s.winner !== null || s.draw) throw new GameError('Game over');
    const me = s.players.indexOf(ctx.player);
    if (me < 0) throw new GameError('Not in this game');
    if (a.type === 'resign') { s.winner = 1 - me; return s; }
    if (me !== s.turn) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.cells.length || s.cells[a.i] >= 0) throw new GameError('Point taken');
    place(s, a.i);
    if (s.winner === null && !s.draw && s.ai !== null && s.turn === s.ai) place(s, aiPick(s, ctx.rng));
    return s;
  },
  isOver: (s) => s.winner !== null || s.draw,
  turn: (s) => (s.winner !== null || s.draw ? null : s.players[s.turn]),
  result: (s) => {
    const w = s.winner !== null ? s.players[s.winner] : null;
    return { scores: Object.fromEntries(s.players.map((p) => [p, p === w ? 300 : s.draw ? 100 : 0])), winner: w, summary: { moves: s.moves, draw: s.draw } };
  },
  view: (s) => s,
};
