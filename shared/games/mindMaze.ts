import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

/** Wall bits */
export const N = 1, E = 2, S = 4, W = 8;
const DIRS: Record<string, { bit: number; dx: number; dy: number; opp: number }> = {
  N: { bit: N, dx: 0, dy: -1, opp: S },
  E: { bit: E, dx: 1, dy: 0, opp: W },
  S: { bit: S, dx: 0, dy: 1, opp: N },
  W: { bit: W, dx: -1, dy: 0, opp: E },
};

export interface Maze { w: number; h: number; walls: number[]; orbs: number[]; optimal: number }
export interface MazeState {
  seed: string; difficulty: Difficulty; level: number; levels: number;
  maze: Maze; pos: number; collected: number[]; steps: number;
  score: number; orbsTotal: number; over: boolean; lastT: number;
  log: { level: number; steps: number; optimal: number }[];
}
export type MazeAction = { t: number; d: 'N' | 'E' | 'S' | 'W' } | { t: number; end: true };

const SIZES: Record<Difficulty, number[]> = { easy: [5, 6, 7], normal: [7, 9, 11], hard: [9, 12, 15] };

export function generateMaze(seed: string, level: number, size: number): Maze {
  const rng = subRng(seed, `maze-${level}`);
  const w = size, h = size;
  const walls = new Array(w * h).fill(N | E | S | W);
  const seen = new Array(w * h).fill(false);
  const stack = [0];
  seen[0] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const x = cur % w, y = Math.floor(cur / w);
    const opts = Object.values(DIRS).filter((d) => {
      const nx = x + d.dx, ny = y + d.dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const d = rng.pick(opts);
    const nxt = (y + d.dy) * w + (x + d.dx);
    walls[cur] &= ~d.bit;
    walls[nxt] &= ~d.opp;
    seen[nxt] = true;
    stack.push(nxt);
  }
  // Braid a few dead ends on larger mazes so there are route choices.
  const extra = Math.floor((w * h) / 18);
  for (let i = 0; i < extra; i++) {
    const c = rng.int(w * h);
    const x = c % w, y = Math.floor(c / w);
    const d = rng.pick(Object.values(DIRS));
    const nx = x + d.dx, ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    walls[c] &= ~d.bit;
    walls[ny * w + nx] &= ~d.opp;
  }
  const orbCount = Math.max(2, Math.floor(size / 2));
  const orbs = new Set<number>();
  while (orbs.size < orbCount) {
    const c = 1 + rng.int(w * h - 2);
    orbs.add(c);
  }
  const optimal = bfs(walls, w, h, 0, w * h - 1);
  return { w, h, walls, orbs: [...orbs], optimal };
}

export function bfs(walls: number[], w: number, h: number, from: number, to: number): number {
  const dist = new Array(w * h).fill(-1);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) return dist[c];
    const x = c % w, y = Math.floor(c / w);
    for (const d of Object.values(DIRS)) {
      if (walls[c] & d.bit) continue;
      const n = (y + d.dy) * w + (x + d.dx);
      if (dist[n] === -1) { dist[n] = dist[c] + 1; q.push(n); }
    }
  }
  return -1;
}

export const mindMaze: Engine<MazeState, MazeAction> = {
  id: 'mind-maze', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const sizes = SIZES[o.difficulty];
    return {
      seed, difficulty: o.difficulty, level: 0, levels: sizes.length,
      maze: generateMaze(seed, 0, sizes[0]), pos: 0, collected: [], steps: 0,
      score: 0, orbsTotal: 0, over: false, lastT: 0, log: [],
    };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    s.lastT = ctx.now;
    if ('end' in a) { s.over = true; return s; }
    const d = DIRS[a.d];
    if (!d) throw new GameError('Bad direction');
    const { w, walls } = s.maze;
    if (walls[s.pos] & d.bit) return s; // bumping a wall is a no-op
    const x = s.pos % w, y = Math.floor(s.pos / w);
    s.pos = (y + d.dy) * w + (x + d.dx);
    s.steps++;
    if (s.maze.orbs.includes(s.pos) && !s.collected.includes(s.pos)) {
      s.collected.push(s.pos);
      s.score += 50;
      s.orbsTotal++;
    }
    if (s.pos === s.maze.w * s.maze.h - 1) {
      const eff = Math.max(0, 200 - Math.max(0, s.steps - s.maze.optimal) * 5);
      s.score += 300 + eff;
      s.log.push({ level: s.level, steps: s.steps, optimal: s.maze.optimal });
      s.level++;
      if (s.level >= s.levels) { s.over = true; return s; }
      s.maze = generateMaze(s.seed, s.level, SIZES[s.difficulty][s.level]);
      s.pos = 0; s.collected = []; s.steps = 0;
    }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { levelsCleared: s.log.length, orbs: s.orbsTotal, log: s.log } }),
  view: (s) => s,
  maxDurationMs: () => 15 * 60_000,
};
