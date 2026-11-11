import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';

/** Dots-and-boxes style territory game. Edges: h[r][c] (r 0..R, c 0..C-1), v[r][c] (r 0..R-1, c 0..C). */
export interface TWState {
  R: number; C: number; h: number[]; v: number[]; boxes: number[]; players: string[]; turn: number;
  scores: number[]; over: boolean; ai: number | null; aiLevel: string; last: { o: 'h' | 'v'; r: number; c: number } | null; resigned: number | null;
}
type A = { type: 'line'; o: 'h' | 'v'; r: number; c: number } | { type: 'resign' };
export const AI_ID = 'ai';

const hIdx = (s: TWState, r: number, c: number) => r * s.C + c;
const vIdx = (s: TWState, r: number, c: number) => r * (s.C + 1) + c;
function sides(s: TWState, r: number, c: number): number {
  return s.h[hIdx(s, r, c)] + s.h[hIdx(s, r + 1, c)] + s.v[vIdx(s, r, c)] + s.v[vIdx(s, r, c + 1)];
}
function adjBoxes(s: TWState, o: 'h' | 'v', r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  if (o === 'h') { if (r > 0) out.push([r - 1, c]); if (r < s.R) out.push([r, c]); }
  else { if (c > 0) out.push([r, c - 1]); if (c < s.C) out.push([r, c]); }
  return out;
}
function legal(s: TWState): { o: 'h' | 'v'; r: number; c: number }[] {
  const m: { o: 'h' | 'v'; r: number; c: number }[] = [];
  for (let r = 0; r <= s.R; r++) for (let c = 0; c < s.C; c++) if (!s.h[hIdx(s, r, c)]) m.push({ o: 'h', r, c });
  for (let r = 0; r < s.R; r++) for (let c = 0; c <= s.C; c++) if (!s.v[vIdx(s, r, c)]) m.push({ o: 'v', r, c });
  return m;
}
/** Draw a line; returns number of boxes completed. */
function draw(s: TWState, o: 'h' | 'v', r: number, c: number, who: number): number {
  if (o === 'h') s.h[hIdx(s, r, c)] = 1; else s.v[vIdx(s, r, c)] = 1;
  let made = 0;
  for (const [br, bc] of adjBoxes(s, o, r, c)) if (sides(s, br, bc) === 4 && s.boxes[br * s.C + bc] < 0) { s.boxes[br * s.C + bc] = who; made++; }
  return made;
}
const clone = (s: TWState): TWState => ({ ...s, h: s.h.slice(), v: s.v.slice(), boxes: s.boxes.slice() });

/** Greedy capture count the opponent would get after a move. */
function giveaway(s: TWState, m: { o: 'h' | 'v'; r: number; c: number }): number {
  const t = clone(s);
  draw(t, m.o, m.r, m.c, 0);
  let taken = 0;
  for (;;) {
    const cap = legal(t).find((x) => adjBoxes(t, x.o, x.r, x.c).some(([br, bc]) => sides(t, br, bc) === 3));
    if (!cap) break;
    taken += draw(t, cap.o, cap.r, cap.c, 1);
  }
  return taken;
}

function aiMove(s: TWState, rng: Rng) {
  const moves = legal(s);
  if (s.aiLevel === 'easy' && rng.next() < 0.35) return rng.pick(moves);
  const completing = moves.filter((m) => adjBoxes(s, m.o, m.r, m.c).some(([br, bc]) => sides(s, br, bc) === 3));
  if (completing.length) return rng.pick(completing);
  const safe = moves.filter((m) => adjBoxes(s, m.o, m.r, m.c).every(([br, bc]) => sides(s, br, bc) < 2));
  if (safe.length) return rng.pick(safe);
  let best = moves[0], bestG = Infinity;
  for (const m of rng.shuffle(moves.slice())) {
    const g = giveaway(s, m);
    if (g < bestG) { bestG = g; best = m; }
  }
  return best;
}

function doMove(s: TWState, m: { o: 'h' | 'v'; r: number; c: number }) {
  const made = draw(s, m.o, m.r, m.c, s.turn);
  s.scores[s.turn] += made;
  s.last = m;
  if (!made) s.turn = 1 - s.turn;
  if (s.boxes.every((b) => b >= 0)) s.over = true;
}

export const territoryWars: Engine<TWState, A> = {
  id: 'territory-wars', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 2 },
  init(o) {
    const size = o.difficulty === 'easy' ? 3 : o.difficulty === 'normal' ? 4 : 5;
    const players = o.players.length === 1 ? [o.players[0], AI_ID] : o.players.slice(0, 2);
    return {
      R: size, C: size, h: new Array((size + 1) * size).fill(0), v: new Array(size * (size + 1)).fill(0), boxes: new Array(size * size).fill(-1),
      players, turn: 0, scores: [0, 0], over: false, ai: o.players.length === 1 ? 1 : null, aiLevel: o.difficulty, last: null, resigned: null,
    };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Game over');
    const me = s.players.indexOf(ctx.player);
    if (me < 0) throw new GameError('Not in this game');
    if (a.type === 'resign') { s.resigned = me; s.over = true; return s; }
    if (me !== s.turn) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    const { o, r, c } = a;
    const valid = o === 'h' ? Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r <= s.R && c >= 0 && c < s.C && !s.h[hIdx(s, r, c)]
      : o === 'v' ? Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < s.R && c >= 0 && c <= s.C && !s.v[vIdx(s, r, c)] : false;
    if (!valid) throw new GameError('That border is not available');
    doMove(s, { o, r, c });
    while (!s.over && s.ai !== null && s.turn === s.ai) doMove(s, aiMove(s, ctx.rng));
    return s;
  },
  isOver: (s) => s.over,
  turn: (s) => (s.over ? null : s.players[s.turn]),
  result: (s) => {
    const [a, b] = s.players;
    let winner: string | null = null;
    if (s.resigned !== null) winner = s.players[1 - s.resigned];
    else if (s.scores[0] !== s.scores[1]) winner = s.scores[0] > s.scores[1] ? a : b;
    return { scores: { [a]: s.scores[0] * 10 + (winner === a ? 300 : 0), [b]: s.scores[1] * 10 + (winner === b ? 300 : 0) }, winner, summary: { boxes: s.scores } };
  },
  view: (s) => ({ ...s }),
};
