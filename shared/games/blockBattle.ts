import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

/** Shapes as [row, col] cell offsets. */
export const SHAPES: number[][][] = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
];
export const SIZE = 8;
export interface Piece { shape: number; hue: number }
export interface BlockState {
  seed: string; difficulty: Difficulty; board: number[]; hand: (Piece | null)[]; dealt: number;
  score: number; lines: number; bestCombo: number; over: boolean; lastClear: number;
}
export type BlockAction = { t: number; p: number; r: number; c: number } | { t: number; end: true };

function deal(s: BlockState) {
  const rng = subRng(s.seed, `deal-${s.dealt}`);
  const pool = s.difficulty === 'easy' ? SHAPES.length - 3 : SHAPES.length;
  s.hand = [0, 1, 2].map(() => ({ shape: rng.int(pool), hue: rng.int(6) }));
  s.dealt++;
}

export function fits(board: number[], shape: number, r: number, c: number): boolean {
  return SHAPES[shape].every(([dr, dc]) => {
    const y = r + dr, x = c + dc;
    return y >= 0 && x >= 0 && y < SIZE && x < SIZE && !board[y * SIZE + x];
  });
}
export function anyFit(board: number[], shape: number): boolean {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (fits(board, shape, r, c)) return true;
  return false;
}

export const blockBattle: Engine<BlockState, BlockAction> = {
  id: 'block-battle', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const s: BlockState = { seed: o.seed ?? 'local', difficulty: o.difficulty, board: new Array(SIZE * SIZE).fill(0), hand: [], dealt: 0, score: 0, lines: 0, bestCombo: 0, over: false, lastClear: 0 };
    deal(s);
    return s;
  },
  apply(s, a) {
    if (s.over) throw new GameError('Game over');
    if ('end' in a) { s.over = true; return s; }
    // Whole cells only: fractional positions would miss the board and always "fit".
    if (![a.p, a.r, a.c].every(Number.isInteger)) throw new GameError('Bad placement');
    const piece = s.hand[a.p];
    if (!piece) throw new GameError('No piece in that slot');
    if (!fits(s.board, piece.shape, a.r, a.c)) throw new GameError('Piece does not fit there');
    for (const [dr, dc] of SHAPES[piece.shape]) s.board[(a.r + dr) * SIZE + (a.c + dc)] = piece.hue + 1;
    s.score += SHAPES[piece.shape].length;
    s.hand[a.p] = null;
    const rows: number[] = [], cols: number[] = [];
    for (let i = 0; i < SIZE; i++) {
      if ([...Array(SIZE).keys()].every((k) => s.board[i * SIZE + k])) rows.push(i);
      if ([...Array(SIZE).keys()].every((k) => s.board[k * SIZE + i])) cols.push(i);
    }
    for (const r of rows) for (let k = 0; k < SIZE; k++) s.board[r * SIZE + k] = 0;
    for (const c of cols) for (let k = 0; k < SIZE; k++) s.board[k * SIZE + c] = 0;
    const cleared = rows.length + cols.length;
    s.lastClear = cleared;
    if (cleared) {
      s.lines += cleared;
      s.score += 10 * cleared * cleared;
      s.bestCombo = Math.max(s.bestCombo, cleared);
    }
    if (s.hand.every((h) => !h)) deal(s);
    if (!s.hand.some((h) => h && anyFit(s.board, h.shape))) s.over = true;
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { lines: s.lines, bestCombo: s.bestCombo } }),
  view: (s) => s,
  maxDurationMs: () => 60 * 60_000,
};
