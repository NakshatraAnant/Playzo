import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';

/**
 * Complete chess rules engine. Squares 0..63, index = row*8 + col, row 0 = rank 8.
 * White pieces uppercase, black lowercase.
 */
export type Colour = 'w' | 'b';
export interface Move { from: number; to: number; promo?: string; capture?: boolean; ep?: boolean; castle?: 'K' | 'Q' }
export interface Pos { board: string[]; turn: Colour; castle: string; ep: number | null; half: number; full: number }
export interface ChessState extends Pos {
  players: string[]; // [white, black]
  ai: Colour | null; aiLevel: string; san: string[]; keys: Record<string, number>;
  result: null | { winner: Colour | null; reason: string };
  clock: { w: number; b: number } | null; lastAt: number; lastMove: Move | null;
}
type A = { type: 'move'; from: number; to: number; promo?: string } | { type: 'resign' } | { type: 'tick' } | { type: 'draw-claim' };

const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
const isWhite = (p: string) => p !== '' && p === p.toUpperCase();
const colourOf = (p: string): Colour | null => (p ? (isWhite(p) ? 'w' : 'b') : null);
const row = (i: number) => i >> 3, col = (i: number) => i & 7;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const sqName = (i: number) => 'abcdefgh'[col(i)] + (8 - row(i));

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function attacked(board: string[], sq: number, by: Colour): boolean {
  const r = row(sq), c = col(sq);
  const own = (p: string, t: string) => p === (by === 'w' ? t.toUpperCase() : t);
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (on(pr, c + dc) && own(board[pr * 8 + c + dc], 'p')) return true;
  for (const [dr, dc] of KN) if (on(r + dr, c + dc) && own(board[(r + dr) * 8 + c + dc], 'n')) return true;
  for (const [dr, dc] of KG) if (on(r + dr, c + dc) && own(board[(r + dr) * 8 + c + dc], 'k')) return true;
  for (const [dirs, pcs] of [[DIAG, 'bq'], [ORTH, 'rq']] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (on(rr, cc)) {
        const p = board[rr * 8 + cc];
        if (p) { if (colourOf(p) === by && pcs.includes(p.toLowerCase())) return true; break; }
        rr += dr; cc += dc;
      }
    }
  }
  return false;
}
const kingSq = (board: string[], c: Colour) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (p: Pos, c: Colour = p.turn) => attacked(p.board, kingSq(p.board, c), c === 'w' ? 'b' : 'w');

function pseudo(p: Pos): Move[] {
  const out: Move[] = [];
  const me = p.turn, them: Colour = me === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const pc = p.board[i];
    if (!pc || colourOf(pc) !== me) continue;
    const r = row(i), c = col(i), t = pc.toLowerCase();
    const add = (to: number, extra: Partial<Move> = {}) => out.push({ from: i, to, capture: !!p.board[to], ...extra });
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1, startRow = me === 'w' ? 6 : 1, lastRow = me === 'w' ? 0 : 7;
      const pushPromo = (to: number, cap: boolean) => {
        if (row(to) === lastRow) for (const pr of 'qrbn') out.push({ from: i, to, promo: pr, capture: cap });
        else out.push({ from: i, to, capture: cap });
      };
      if (on(r + dir, c) && !p.board[(r + dir) * 8 + c]) {
        pushPromo((r + dir) * 8 + c, false);
        if (r === startRow && !p.board[(r + 2 * dir) * 8 + c]) add((r + 2 * dir) * 8 + c);
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (p.board[to] && colourOf(p.board[to]) === them) pushPromo(to, true);
        else if (p.ep === to) out.push({ from: i, to, capture: true, ep: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KN : KG) {
        if (!on(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (colourOf(p.board[to]) !== me) add(to);
      }
      if (t === 'k') {
        const home = me === 'w' ? 60 : 4;
        if (i === home && !inCheck(p)) {
          const K = me === 'w' ? 'K' : 'k', Q = me === 'w' ? 'Q' : 'q';
          if (p.castle.includes(K) && !p.board[home + 1] && !p.board[home + 2] && p.board[home + 3] === (me === 'w' ? 'R' : 'r') && !attacked(p.board, home + 1, them) && !attacked(p.board, home + 2, them)) out.push({ from: i, to: home + 2, castle: 'K' });
          if (p.castle.includes(Q) && !p.board[home - 1] && !p.board[home - 2] && !p.board[home - 3] && p.board[home - 4] === (me === 'w' ? 'R' : 'r') && !attacked(p.board, home - 1, them) && !attacked(p.board, home - 2, them)) out.push({ from: i, to: home - 2, castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (on(rr, cc)) {
          const to = rr * 8 + cc;
          if (p.board[to]) { if (colourOf(p.board[to]) === them) add(to); break; }
          add(to);
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

export function makeMove(p: Pos, m: Move): Pos {
  const b = p.board.slice();
  const pc = b[m.from];
  const me = p.turn;
  b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : pc;
  b[m.from] = '';
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = '';
  if (m.castle) {
    const home = me === 'w' ? 60 : 4;
    if (m.castle === 'K') { b[home + 1] = b[home + 3]; b[home + 3] = ''; }
    else { b[home - 1] = b[home - 4]; b[home - 4] = ''; }
  }
  let castle = p.castle;
  const strip = (chars: string) => { for (const ch of chars) castle = castle.replace(ch, ''); };
  if (pc === 'K') strip('KQ');
  if (pc === 'k') strip('kq');
  for (const sq of [m.from, m.to]) {
    if (sq === 63) strip('K'); if (sq === 56) strip('Q'); if (sq === 7) strip('k'); if (sq === 0) strip('q');
  }
  const ep = pc.toLowerCase() === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null;
  const half = pc.toLowerCase() === 'p' || m.capture ? 0 : p.half + 1;
  return { board: b, turn: me === 'w' ? 'b' : 'w', castle, ep, half, full: p.full + (me === 'b' ? 1 : 0) };
}

export function legalMoves(p: Pos): Move[] {
  return pseudo(p).filter((m) => !inCheck(makeMove(p, m), p.turn));
}

export const posKey = (p: Pos) => p.board.map((x) => x || '.').join('') + p.turn + p.castle + (p.ep ?? '-');

function insufficient(board: string[]): boolean {
  const pcs = board.filter((x) => x && x.toLowerCase() !== 'k');
  if (pcs.length === 0) return true;
  if (pcs.length === 1 && 'nb'.includes(pcs[0].toLowerCase())) return true;
  return false;
}

export function toSan(p: Pos, m: Move, legal: Move[]): string {
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
  const pc = p.board[m.from].toLowerCase();
  let s = '';
  if (pc !== 'p') {
    s = pc.toUpperCase();
    const twins = legal.filter((x) => x.to === m.to && x.from !== m.from && p.board[x.from].toLowerCase() === pc);
    if (twins.length) {
      if (twins.every((x) => col(x.from) !== col(m.from))) s += 'abcdefgh'[col(m.from)];
      else if (twins.every((x) => row(x.from) !== row(m.from))) s += String(8 - row(m.from));
      else s += sqName(m.from);
    }
  } else if (m.capture) s = 'abcdefgh'[col(m.from)];
  if (m.capture) s += 'x';
  s += sqName(m.to);
  if (m.promo) s += '=' + m.promo.toUpperCase();
  const next = makeMove(p, m);
  if (inCheck(next)) s += legalMoves(next).length ? '+' : '#';
  return s;
}

/* ---------------- AI: alpha-beta over material + piece-square heuristics ---------------- */
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate(p: Pos): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const pc = p.board[i];
    if (!pc) continue;
    const t = pc.toLowerCase(), w = isWhite(pc);
    const r = w ? row(i) : 7 - row(i), c = col(i);
    let v = VAL[t];
    const centre = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - c));
    if (t === 'p') v += (6 - r) * 8 + (c >= 2 && c <= 5 ? centre * 4 : 0);
    else if (t === 'n' || t === 'b') v += centre * 10;
    else if (t === 'q') v += centre * 3;
    else if (t === 'k') v += r === 7 ? 15 : -10 * (7 - r);
    s += w ? v : -v;
  }
  return p.turn === 'w' ? s : -s;
}
function search(p: Pos, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(p);
  if (!moves.length) return inCheck(p) ? -100000 - depth : 0;
  if (depth === 0) return evaluate(p);
  moves.sort((a, b) => (b.capture ? VAL[p.board[b.to]?.toLowerCase() || 'p'] : 0) - (a.capture ? VAL[p.board[a.to]?.toLowerCase() || 'p'] : 0));
  for (const m of moves) {
    const v = -search(makeMove(p, m), depth - 1, -beta, -alpha);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
export function bestMove(p: Pos, level: string, rng: Rng): Move {
  const moves = legalMoves(p);
  const depth = level === 'easy' ? 1 : level === 'normal' ? 2 : 3;
  let best: Move[] = [], bestV = -Infinity;
  for (const m of rng.shuffle(moves.slice())) {
    let v = -search(makeMove(p, m), depth - 1, -Infinity, Infinity);
    if (level === 'easy') v += rng.next() * 120;
    if (v > bestV) { bestV = v; best = [m]; } else if (v === bestV) best.push(m);
  }
  return best[0];
}

function finishCheck(s: ChessState) {
  const legal = legalMoves(s);
  if (!legal.length) {
    s.result = inCheck(s) ? { winner: s.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  } else if (insufficient(s.board)) s.result = { winner: null, reason: 'insufficient material' };
  else if (s.half >= 100) s.result = { winner: null, reason: '50-move rule' };
  else if ((s.keys[posKey(s)] ?? 0) >= 3) s.result = { winner: null, reason: 'threefold repetition' };
}

function play(s: ChessState, m: Move) {
  const legal = legalMoves(s);
  s.san.push(toSan(s, m, legal));
  Object.assign(s, makeMove(s, m));
  s.lastMove = m;
  const k = posKey(s);
  s.keys[k] = (s.keys[k] ?? 0) + 1;
  finishCheck(s);
}

function chargeClock(s: ChessState, now: number) {
  if (!s.clock) return;
  s.clock[s.turn] -= Math.max(0, now - s.lastAt);
  s.lastAt = now;
  if (s.clock[s.turn] <= 0) {
    s.clock[s.turn] = 0;
    const opp: Colour = s.turn === 'w' ? 'b' : 'w';
    const oppMaterial = s.board.some((x) => x && colourOf(x) === opp && x.toLowerCase() !== 'k');
    s.result = { winner: oppMaterial ? opp : null, reason: 'time' };
  }
}

export const chessBlitz: Engine<ChessState, A> = {
  id: 'chess-blitz', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 2 }, timed: true,
  shiftTime: (s, dt) => { s.lastAt += dt; return s; },
  init(o, ctx) {
    const solo = o.players.length === 1;
    const players = solo ? [o.players[0], 'ai'] : o.players.slice(0, 2);
    const clockMs = solo ? null : Number(o.config?.clockMs ?? 300_000);
    const s: ChessState = {
      board: START.split('').map((c) => (c === '.' ? '' : c)), turn: 'w', castle: 'KQkq', ep: null, half: 0, full: 1,
      players, ai: solo ? 'b' : null, aiLevel: o.difficulty, san: [], keys: {}, result: null,
      clock: clockMs ? { w: clockMs, b: clockMs } : null, lastAt: ctx.now, lastMove: null,
    };
    s.keys[posKey(s)] = 1;
    return s;
  },
  apply(s, a, ctx) {
    if (s.result) { if (a.type === 'tick') return s; throw new GameError('Game over'); }
    if (a.type === 'tick') { chargeClock(s, ctx.now); return s; }
    const idx = s.players.indexOf(ctx.player);
    if (idx < 0) throw new GameError('Not in this game');
    const mine: Colour = idx === 0 ? 'w' : 'b';
    if (a.type === 'resign') { s.result = { winner: mine === 'w' ? 'b' : 'w', reason: 'resignation' }; return s; }
    if (a.type === 'draw-claim') {
      if (s.half >= 100 || (s.keys[posKey(s)] ?? 0) >= 3) { s.result = { winner: null, reason: 'draw claimed' }; return s; }
      throw new GameError('No draw available to claim');
    }
    if (mine !== s.turn) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    chargeClock(s, ctx.now);
    if (s.result) return s;
    const m = legalMoves(s).find((x) => x.from === a.from && x.to === a.to && (x.promo ?? null) === (x.promo ? a.promo ?? 'q' : null));
    if (!m) throw new GameError('Illegal move');
    play(s, m);
    if (!s.result && s.ai && s.turn === s.ai) play(s, bestMove(s, s.aiLevel, ctx.rng));
    s.lastAt = ctx.now;
    return s;
  },
  isOver: (s) => !!s.result,
  turn: (s) => (s.result ? null : s.players[s.turn === 'w' ? 0 : 1]),
  result: (s) => {
    const w = s.result?.winner ? s.players[s.result.winner === 'w' ? 0 : 1] : null;
    return { scores: Object.fromEntries(s.players.map((p) => [p, p === w ? 300 : w ? 0 : 100])), winner: w, summary: { reason: s.result?.reason, moves: s.san.length } };
  },
  view: (s, player) => {
    const idx = s.players.indexOf(player);
    const mine = idx === 1 ? 'b' : 'w';
    const legal = !s.result && s.turn === mine ? legalMoves(s).map((m) => [m.from, m.to, m.promo ?? null]) : [];
    return {
      board: s.board, turn: s.turn, me: mine, players: s.players, san: s.san, result: s.result, check: inCheck(s),
      clock: s.clock, lastAt: s.lastAt, lastMove: s.lastMove, legal: legal.filter((l) => !l[2] || l[2] === 'q').concat(legal.filter((l) => l[2] && l[2] !== 'q')),
    };
  },
};
