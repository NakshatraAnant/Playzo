import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng } from '../rng';

/** Fixed-timestep rooftop runner. Every run is reproducible from (seed, inputs). */
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;
const DT = 1 / FPS;
const GRAVITY = -34;
const JUMP_V = 12.2;
export const PLAYER_W = 0.6;
export const STAND_H = 1.0;
export const DUCK_H = 0.5;

export type ObKind = 'vent' | 'tall' | 'drone';
export interface Obstacle { x: number; kind: ObKind; w: number; y0: number; y1: number }
export interface Orb { x: number; y: number; taken: boolean }
export interface SprintState {
  seed: string; difficulty: Difficulty; frame: number; dist: number; speed: number;
  y: number; vy: number; ducking: boolean; dead: boolean; over: boolean;
  obstacles: Obstacle[]; orbs: Orb[]; genX: number; genIdx: number; orbsTaken: number; score: number;
}
export type SprintAction = { t: number; a: 'jump' | 'duck' | 'unduck' | 'end' };

const START_SPEED: Record<Difficulty, number> = { easy: 6, normal: 7.5, hard: 9 };
const ACCEL: Record<Difficulty, number> = { easy: 0.06, normal: 0.09, hard: 0.12 };

function generate(s: SprintState) {
  while (s.genX < s.dist + 60) {
    const rng = new SeededRng(`${s.seed}::seg-${s.genIdx++}`);
    const speedHere = Math.min(20, s.speed + 2);
    const gap = 7 + speedHere * 0.55 + rng.next() * 7;
    const x = s.genX + gap;
    const roll = rng.next();
    let ob: Obstacle;
    if (roll < 0.5) ob = { x, kind: 'vent', w: 0.7, y0: 0, y1: 0.75 };
    else if (roll < 0.8 || s.difficulty === 'easy') ob = { x, kind: 'drone', w: 0.9, y0: 0.62, y1: 1.4 };
    else ob = { x, kind: 'tall', w: 0.55, y0: 0, y1: 1.15 };
    s.obstacles.push(ob);
    if (rng.next() < 0.45) s.orbs.push({ x: x + gap / 2, y: rng.next() < 0.5 ? 0.35 : 1.9, taken: false });
    s.genX = x;
  }
  // drop far-behind items to keep state small
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > s.dist - 5);
  s.orbs = s.orbs.filter((o) => o.x > s.dist - 5);
}

/** Advance exactly one physics frame. */
export function stepFrame(s: SprintState): void {
  if (s.dead) return;
  s.frame++;
  s.speed = Math.min(20, START_SPEED[s.difficulty] + ACCEL[s.difficulty] * (s.frame / FPS));
  s.dist += s.speed * DT;
  if (s.y > 0 || s.vy > 0) {
    s.vy += GRAVITY * DT;
    s.y += s.vy * DT;
    if (s.y <= 0) { s.y = 0; s.vy = 0; }
  }
  const h = s.ducking && s.y === 0 ? DUCK_H : STAND_H;
  const px0 = s.dist, px1 = s.dist + PLAYER_W, py0 = s.y, py1 = s.y + h;
  for (const o of s.obstacles) {
    if (o.x > px1 || o.x + o.w < px0) continue;
    if (py1 > o.y0 && py0 < o.y1) { s.dead = true; s.over = true; break; }
  }
  for (const orb of s.orbs) {
    if (orb.taken) continue;
    if (orb.x >= px0 - 0.3 && orb.x <= px1 + 0.3 && orb.y >= py0 - 0.3 && orb.y <= py1 + 0.3) { orb.taken = true; s.orbsTaken++; }
  }
  if (s.frame % 30 === 0) generate(s);
  s.score = Math.floor(s.dist * 1) + s.orbsTaken * 25;
}

const MAX_FRAMES = FPS * 60 * 20;

export const obstacleSprint: Engine<SprintState, SprintAction> = {
  id: 'obstacle-sprint', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const s: SprintState = {
      seed: o.seed ?? 'local', difficulty: o.difficulty, frame: 0, dist: 0, speed: START_SPEED[o.difficulty],
      y: 0, vy: 0, ducking: false, dead: false, over: false, obstacles: [], orbs: [], genX: 8, genIdx: 0, orbsTaken: 0, score: 0,
    };
    generate(s);
    return s;
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    const target = Math.round(ctx.now / FRAME_MS);
    if (target < s.frame) throw new GameError('Out of order', 'IMPLAUSIBLE');
    while (s.frame < target && !s.dead) stepFrame(s);
    if (s.dead) return s;
    if (a.a === 'end') {
      while (!s.dead && s.frame < MAX_FRAMES) stepFrame(s);
      s.over = true;
      return s;
    }
    if (a.a === 'jump') { if (s.y === 0) { s.vy = JUMP_V; s.ducking = false; } }
    else if (a.a === 'duck') s.ducking = true;
    else if (a.a === 'unduck') s.ducking = false;
    else throw new GameError('Bad input');
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { distance: Math.floor(s.dist), orbs: s.orbsTaken, seconds: Math.round(s.frame / FPS) } }),
  view: (s) => s,
  maxDurationMs: () => MAX_FRAMES * FRAME_MS,
};
