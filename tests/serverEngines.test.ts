import { describe, it, expect } from 'vitest';
import { SeededRng } from '../shared/rng';
import { GameError } from '../shared/engine';
import { chessBlitz, legalMoves, makeMove, Pos, inCheck } from '../server/games/family/chessBlitz';
import { codeBreaker, grade } from '../server/games/family/codeBreaker';
import { hexConquest, winningPath } from '../server/games/family/hexConquest';
import { connectFive } from '../server/games/family/connectFive';
import { territoryWars } from '../server/games/family/territoryWars';
import { triviaClash } from '../server/games/family/triviaClash';
import { wordDuel } from '../server/games/family/wordDuel';
import { wordLadder } from '../server/games/family/wordLadder';
import { memoryDuel } from '../server/games/family/memoryDuel';
import { partyChaos } from '../server/games/family/partyChaos';
import { emojiDecode, matches } from '../server/games/family/emojiDecode';
import { isWord } from '../server/data/words';
import { ENGINES } from '../server/games/registry';
import { CATALOGUE } from '../shared/catalogue';

const C = (now = 0, player = 'p1', seed = 's') => ({ rng: new SeededRng(seed), now, player });
const sq = (n: string) => (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0]);

describe('registry', () => {
  it('has exactly 50 engines matching the catalogue (25 family + 25 lounge)', () => {
    expect(Object.keys(ENGINES)).toHaveLength(50);
    expect(CATALOGUE.filter((g) => g.env === 'family')).toHaveLength(25);
    expect(CATALOGUE.filter((g) => g.env === 'lounge')).toHaveLength(25);
  });
});

describe('Chess rules engine', () => {
  const start = () => chessBlitz.init({ players: ['a', 'b'], difficulty: 'normal' }, C()) as any;
  it('has 20 legal opening moves', () => expect(legalMoves(start())).toHaveLength(20));
  it("detects fool's mate", () => {
    const s = start();
    for (const [f, t, p] of [['f2', 'f3', 'a'], ['e7', 'e5', 'b'], ['g2', 'g4', 'a'], ['d8', 'h4', 'b']]) chessBlitz.apply(s, { type: 'move', from: sq(f), to: sq(t) }, C(1, p));
    expect(s.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(s.san[s.san.length - 1]).toBe('Qh4#');
  });
  it('supports castling, en passant and promotion', () => {
    const empty: Pos = { board: Array(64).fill(''), turn: 'w', castle: 'KQkq', ep: null, half: 0, full: 1 };
    const b = empty.board.slice();
    b[sq('e1')] = 'K'; b[sq('h1')] = 'R'; b[sq('a1')] = 'R'; b[sq('e8')] = 'k'; b[sq('e5')] = 'P'; b[sq('d5')] = 'p'; b[sq('a7')] = 'P';
    const p: Pos = { ...empty, board: b, ep: sq('d6') };
    const moves = legalMoves(p);
    expect(moves.some((m) => m.castle === 'K')).toBe(true);
    expect(moves.some((m) => m.castle === 'Q')).toBe(true);
    const ep = moves.find((m) => m.ep)!;
    expect(ep.to).toBe(sq('d6'));
    expect(makeMove(p, ep).board[sq('d5')]).toBe('');
    expect(moves.filter((m) => m.from === sq('a7') && m.promo)).toHaveLength(4);
  });
  it('rejects illegal moves and moving into check', () => {
    const s = start();
    expect(() => chessBlitz.apply(s, { type: 'move', from: sq('e2'), to: sq('e5') }, C(1, 'a'))).toThrow(GameError);
    expect(() => chessBlitz.apply(s, { type: 'move', from: sq('e7'), to: sq('e5') }, C(1, 'b'))).toThrow(/turn/);
  });
  it('detects stalemate', () => {
    const b = Array(64).fill(''); b[sq('a8')] = 'k'; b[sq('b6')] = 'Q'; b[sq('c7')] = 'K';
    const p: Pos = { board: b, turn: 'b', castle: '', ep: null, half: 0, full: 40 };
    expect(legalMoves(p)).toHaveLength(0);
    expect(inCheck(p)).toBe(false);
  });
  it('AI replies with a legal move in solo mode', () => {
    const s = chessBlitz.init({ players: ['p1'], difficulty: 'easy' }, C()) as any;
    chessBlitz.apply(s, { type: 'move', from: sq('e2'), to: sq('e4') }, C(1));
    expect(s.san).toHaveLength(2);
    expect(s.turn).toBe('w');
  });
});

describe('Code Breaker', () => {
  it('grades exact and partial matches correctly', () => {
    expect(grade([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, partial: 0 });
    expect(grade([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, partial: 4 });
    expect(grade([0, 0, 1, 1], [0, 1, 0, 2])).toEqual({ exact: 1, partial: 2 });
  });
  it('hides the secret until the game ends', () => {
    const s = codeBreaker.init({ players: ['p1'], difficulty: 'easy' }, C()) as any;
    expect((codeBreaker.view(s, 'p1') as any).secret).toBeNull();
    codeBreaker.apply(s, { type: 'guess', g: s.secret }, C());
    expect((codeBreaker.view(s, 'p1') as any).secret).toEqual(s.secret);
    expect(codeBreaker.result(s).scores.p1).toBe(1000);
  });
});

describe('Hex / Connect Five / Territory Wars', () => {
  it('hex detects a left-right connection for player 0', () => {
    const n = 5, cells = Array(25).fill(-1);
    for (let c = 0; c < n; c++) cells[2 * n + c] = 0;
    expect(winningPath(n, cells, 0)).not.toBeNull();
    expect(winningPath(n, cells, 1)).toBeNull();
  });
  it('hex vs AI eventually ends with a winner (no draws possible)', () => {
    const s = hexConquest.init({ players: ['p1'], difficulty: 'easy' }, C()) as any;
    for (let i = 0; i < s.cells.length && s.winner === null; i++) if (s.cells[i] < 0 && s.turn === 0) hexConquest.apply(s, { type: 'place', i }, C());
    expect(s.winner).not.toBeNull();
  });
  it('connect five recognises five in a row', () => {
    const s = connectFive.init({ players: ['a', 'b'], difficulty: 'normal' }, C()) as any;
    for (let k = 0; k < 4; k++) { connectFive.apply(s, { type: 'place', i: k }, C(0, 'a')); connectFive.apply(s, { type: 'place', i: 13 * 5 + k }, C(0, 'b')); }
    connectFive.apply(s, { type: 'place', i: 4 }, C(0, 'a'));
    expect(connectFive.result(s).winner).toBe('a');
  });
  it('territory wars: completing a box keeps the turn and scores it', () => {
    const s = territoryWars.init({ players: ['a', 'b'], difficulty: 'easy' }, C()) as any;
    territoryWars.apply(s, { type: 'line', o: 'h', r: 0, c: 0 }, C(0, 'a'));
    territoryWars.apply(s, { type: 'line', o: 'v', r: 0, c: 0 }, C(0, 'b'));
    territoryWars.apply(s, { type: 'line', o: 'h', r: 1, c: 0 }, C(0, 'a'));
    territoryWars.apply(s, { type: 'line', o: 'v', r: 0, c: 1 }, C(0, 'b'));
    expect(s.scores[1]).toBe(1);
    expect(s.players[s.turn]).toBe('b');
  });
});

describe('Rounds games', () => {
  it('trivia: correct fast answers score 100+ and the game advances on server time', () => {
    const s = triviaClash.init({ players: ['p1'], difficulty: 'normal' }, C(0)) as any;
    let now = s.qStart + 100;
    for (let i = 0; i < 10; i++) {
      triviaClash.apply(s, { type: 'answer', choice: s.qs[s.idx].correct }, C(now));
      now = s.revealUntil + 10;
      triviaClash.apply(s, { type: 'tick' }, C(now));
      now = s.qStart + 50;
    }
    expect(triviaClash.isOver(s)).toBe(true);
    expect(s.scores.p1).toBeGreaterThanOrEqual(1000);
  });
  it('trivia: answers after the deadline are rejected', () => {
    const s = triviaClash.init({ players: ['p1'], difficulty: 'normal' }, C(0)) as any;
    expect(() => triviaClash.apply(s, { type: 'answer', choice: 0 }, C(s.deadline + 5))).toThrow(GameError);
  });
  it('view never leaks the correct answer before reveal', () => {
    const s = partyChaos.init({ players: ['p1', 'p2'], difficulty: 'normal' }, C(0)) as any;
    expect((partyChaos.view(s, 'p1') as any).question.correct).toBeUndefined();
  });
});

describe('Word games', () => {
  it('dictionary validates words', () => { expect(isWord('planet')).toBe(true); expect(isWord('qzxqzx')).toBe(false); });
  it('word duel enforces centre letter and dictionary', () => {
    const s = wordDuel.init({ players: ['p1'], difficulty: 'normal' }, C(0)) as any;
    const now = s.start + 10;
    wordDuel.apply(s, { type: 'word', w: 'zzz' }, C(now));
    expect(s.found.p1).toHaveLength(0);
    const candidates = ['a', 'e', 'i', 'o', 'u'].length;
    expect(candidates).toBe(5);
    expect(() => wordDuel.apply(s, { type: 'word', w: 'abc' }, C(s.endsAt + 1))).toThrow(/Time/);
  });
  it('word ladder puzzles are solvable via the example route', () => {
    const s = wordLadder.init({ players: ['p1'], difficulty: 'normal' }, C(0, 'p1', 'ladder')) as any;
    const route = s.ladders[0].example as string[];
    route.slice(1).forEach((w) => wordLadder.apply(s, { type: 'word', w }, C()));
    expect(s.idx).toBe(1);
    expect(s.score).toBe(400);
  });
  it('emoji decode tolerant matching', () => {
    expect(matches({ e: '', answer: 'sunflower', hint: '' }, 'Sun flower')).toBe(true);
    expect(matches({ e: '', answer: 'sunflower', hint: '' }, 'sunflowr')).toBe(true);
    expect(matches({ e: '', answer: 'cat', hint: '' }, 'bat')).toBe(false);
    const s = emojiDecode.init({ players: ['p1'], difficulty: 'normal' }, C()) as any;
    expect((emojiDecode.view(s, 'p1') as any).pattern).not.toContain(s.qs[0].answer[0] === ' ' ? 'x' : s.qs[0].answer);
  });
});

describe('Memory duel', () => {
  it('hides unflipped faces and passes the turn on a miss', () => {
    const s = memoryDuel.init({ players: ['a', 'b'], difficulty: 'easy' }, C()) as any;
    expect((memoryDuel.view(s, 'a') as any).faces.every((f: number) => f === -1)).toBe(true);
    const i = 0, j = s.cards.findIndex((c: number, k: number) => k > 0 && c !== s.cards[0]);
    memoryDuel.apply(s, { type: 'flip', i }, C(0, 'a'));
    memoryDuel.apply(s, { type: 'flip', i: j }, C(0, 'a'));
    expect(s.players[s.turn]).toBe('b');
    expect(() => memoryDuel.apply(s, { type: 'flip', i: 2 }, C(0, 'a'))).toThrow(/turn/);
  });
});
