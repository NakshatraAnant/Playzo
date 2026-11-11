import { describe, it, expect } from 'vitest';
import { REPLAY_ENGINES } from '../shared/games';
import { SeededRng } from '../shared/rng';
import { GameError } from '../shared/engine';
import { generateMaze, bfs } from '../shared/games/mindMaze';
import { makeGrid, countSolutions } from '../shared/games/gridGenius';
import { makeLock, minMoves } from '../shared/games/logicLock';
import { stepFrame, FRAME_MS, SprintState } from '../shared/games/obstacleSprint';
import { verifyReplay } from '../server/sessions';

const ctx = (now: number) => ({ rng: new SeededRng('x'), now, player: 'p1' });
const init = (id: string, seed = 'seed-1', difficulty: any = 'normal') => REPLAY_ENGINES[id].init({ players: ['p1'], difficulty, seed }, ctx(0));

describe('replay engines: determinism', () => {
  for (const id of Object.keys(REPLAY_ENGINES)) {
    it(`${id}: same seed => identical initial state; different seed => different`, () => {
      expect(JSON.stringify(init(id, 'a'))).toBe(JSON.stringify(init(id, 'a')));
      if (!['tower-tactics', 'sequence-master'].includes(id)) expect(JSON.stringify(init(id, 'a'))).not.toBe(JSON.stringify(init(id, 'b')));
    });
  }
});

describe('Mind Maze', () => {
  it('every generated maze is solvable from start to exit', () => {
    for (let i = 0; i < 30; i++) {
      const m = generateMaze(`s${i}`, i % 3, 5 + (i % 11));
      expect(bfs(m.walls, m.w, m.h, 0, m.w * m.h - 1)).toBe(m.optimal);
      expect(m.optimal).toBeGreaterThan(0);
    }
  });
  it('walking the shortest path clears a level with the full efficiency bonus', () => {
    const e = REPLAY_ENGINES['mind-maze'];
    const s: any = init('mind-maze', 'walk', 'easy');
    const { w, h, walls } = s.maze;
    // BFS path reconstruction
    const prev = new Map<number, [number, string]>(); const q = [0]; const seen = new Set([0]);
    const D: Record<string, [number, number, number]> = { N: [1, 0, -1], E: [2, 1, 0], S: [4, 0, 1], W: [8, -1, 0] };
    while (q.length) { const c = q.shift()!; for (const [d, [bit, dx, dy]] of Object.entries(D)) { if (walls[c] & bit) continue; const n = c + dy * w + dx; if (!seen.has(n)) { seen.add(n); prev.set(n, [c, d]); q.push(n); } } }
    const path: string[] = []; let c = w * h - 1; while (c !== 0) { const [p, d] = prev.get(c)!; path.unshift(d); c = p; }
    path.forEach((d, i) => e.apply(s, { t: i * 200, d }, ctx(i * 200)));
    expect(s.level).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(500);
  });
});

describe('Grid Genius', () => {
  it('puzzles have exactly one solution and givens match the solution', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const p = makeGrid(`g-${d}`, d);
      expect(countSolutions(p.givens, p.n, p.bh, p.bw, 2)).toBe(1);
      p.givens.forEach((v, i) => { if (v) expect(v).toBe(p.solution[i]); });
    }
  });
  it('entering the solution completes the puzzle and scores', () => {
    const e = REPLAY_ENGINES['grid-genius'];
    const s: any = init('grid-genius', 'solve', 'easy');
    let t = 1000;
    s.puzzle.givens.forEach((g: number, i: number) => { if (!g) e.apply(s, { t: (t += 500), i, v: s.puzzle.solution[i] }, ctx(t)); });
    expect(s.over).toBe(true);
    expect(s.score).toBeGreaterThan(100);
    expect(() => e.apply(s, { t: t + 1, i: 0, v: 1 }, ctx(t + 1))).toThrow(GameError);
  });
});

describe('Logic Lock', () => {
  it('generated locks are solvable and minMoves is consistent', () => {
    for (let i = 0; i < 5; i++) {
      const l = makeLock('lock-seed', i, 'normal');
      expect(minMoves(l.links, l.start, l.positions)).toBe(l.minMoves);
      expect(l.minMoves).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('anti-cheat plausibility', () => {
  it('Number Rush rejects answers faster than 250ms', () => {
    const e = REPLAY_ENGINES['number-rush'];
    const s: any = init('number-rush');
    expect(() => e.apply(s, { t: 100, a: 0 }, ctx(100))).toThrow(/Implausibly/);
  });
  it('Reflex Arena rejects hits before the human reaction floor', () => {
    const e = REPLAY_ENGINES['reflex-arena'];
    const s: any = init('reflex-arena');
    const tg = s.targets[0];
    expect(() => e.apply(s, { t: tg.spawn + 20, i: 0 }, ctx(tg.spawn + 20))).toThrow(/Implausibly/);
  });
  it('Sequence Master rejects input during playback', () => {
    const e = REPLAY_ENGINES['sequence-master'];
    const s: any = init('sequence-master');
    expect(() => e.apply(s, { t: 10, pad: s.seq[0] }, ctx(10))).toThrow(/playback/);
  });
  it('verifyReplay rejects out-of-order timestamps', () => {
    expect(() => verifyReplay(REPLAY_ENGINES['color-dash'], 's', 'normal', [{ t: 500, c: 0 }, { t: 400, c: 0 }])).toThrow(/out of order|Bad colour|Implausibly/i);
  });
});

describe('Obstacle Sprint: fixed-step replay reproduces the client run exactly', () => {
  it('client simulation == server replay', () => {
    const e = REPLAY_ENGINES['obstacle-sprint'];
    const client = init('obstacle-sprint', 'run-7') as SprintState;
    const log: any[] = [];
    const r = new SeededRng('inputs');
    while (!client.dead && client.frame < 60 * 120) {
      stepFrame(client);
      if (r.next() < 0.02 && client.y === 0) { const a = { t: client.frame * FRAME_MS, a: 'jump' as const }; e.apply(client, a, ctx(a.t)); log.push(a); }
    }
    log.push({ t: client.frame * FRAME_MS, a: 'end' });
    const server = verifyReplay(e, 'run-7', 'normal', log).state as SprintState;
    expect(server.score).toBe(client.score);
    expect(server.frame).toBe(client.frame);
  });
});

describe('Tower Tactics determinism', () => {
  it('same build plan => same battle result', () => {
    const plan = [{ t: 1, type: 'build', x: 2, y: 2, kind: 'spark' }, { t: 2, type: 'build', x: 4, y: 4, kind: 'frost' }, ...Array.from({ length: 10 }, (_, i) => ({ t: 10 + i, type: 'wave' }))];
    const a = verifyReplay(REPLAY_ENGINES['tower-tactics'], 'tt', 'easy', plan).state;
    const b = verifyReplay(REPLAY_ENGINES['tower-tactics'], 'tt', 'easy', plan).state;
    expect(a.score).toBe(b.score);
    expect(a.over).toBe(true);
  });
  it('cannot build on the path', () => {
    const e = REPLAY_ENGINES['tower-tactics'];
    const s: any = init('tower-tactics');
    expect(() => e.apply(s, { t: 1, type: 'build', x: 0, y: 1, kind: 'spark' }, ctx(1))).toThrow(GameError);
  });
});

describe('Block Battle', () => {
  it('placing all pieces clears lines and deals new hands', () => {
    const e = REPLAY_ENGINES['block-battle'];
    const s: any = init('block-battle', 'bb');
    let t = 0, placed = 0;
    outer: for (let k = 0; k < 60 && !s.over; k++) {
      for (let p = 0; p < 3; p++) {
        if (!s.hand[p]) continue;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          try { e.apply(s, { t: (t += 300), p, r, c }, ctx(t)); placed++; continue outer; } catch { /* try next */ }
        }
      }
    }
    expect(placed).toBeGreaterThan(5);
    expect(s.score).toBeGreaterThan(0);
  });
});
