import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng } from '../rng';

export interface Target { id: number; spawn: number; life: number; x: number; y: number; r: number; decoy: boolean }
export interface ReflexState {
  seed: string; difficulty: Difficulty; targets: Target[]; hit: number[]; score: number; combo: number; bestCombo: number;
  hits: number; misses: number; decoys: number; over: boolean; checkedUntil: number;
}
export type ReflexAction = { t: number; i: number } | { t: number; end: true };
export const REFLEX_DURATION = 45_000;
export const REFLEX_MIN_MS = 120;

export function schedule(seed: string, difficulty: Difficulty): Target[] {
  const rng = new SeededRng(`${seed}::reflex`);
  const out: Target[] = [];
  let t = 800;
  const baseLife = difficulty === 'easy' ? 1700 : difficulty === 'normal' ? 1300 : 1000;
  const radius = difficulty === 'easy' ? 9 : difficulty === 'normal' ? 7.5 : 6;
  let id = 0;
  while (t < REFLEX_DURATION - 600) {
    const progress = t / REFLEX_DURATION;
    const gap = Math.max(260, 900 - progress * 600) * (0.7 + rng.next() * 0.6);
    const life = Math.max(600, baseLife - progress * 400);
    out.push({ id: id++, spawn: Math.round(t), life: Math.round(life), x: 10 + rng.int(80), y: 12 + rng.int(76), r: radius, decoy: rng.next() < 0.14 + progress * 0.1 });
    t += gap;
  }
  return out;
}

function settleMisses(s: ReflexState, until: number) {
  for (const tg of s.targets) {
    const end = tg.spawn + tg.life;
    if (end > s.checkedUntil && end <= until && !tg.decoy && !s.hit.includes(tg.id)) {
      s.misses++;
      s.combo = 0;
    }
  }
  s.checkedUntil = Math.max(s.checkedUntil, until);
}

export const reflexArena: Engine<ReflexState, ReflexAction> = {
  id: 'reflex-arena', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    return { seed, difficulty: o.difficulty, targets: schedule(seed, o.difficulty), hit: [], score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0, decoys: 0, over: false, checkedUntil: 0 };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    if ('end' in a || ctx.now >= REFLEX_DURATION) { settleMisses(s, REFLEX_DURATION); s.over = true; return s; }
    settleMisses(s, ctx.now);
    const tg = s.targets[a.i];
    if (!tg) throw new GameError('Unknown target');
    if (s.hit.includes(tg.id)) throw new GameError('Already hit');
    if (ctx.now < tg.spawn + REFLEX_MIN_MS) throw new GameError('Implausibly fast hit', 'IMPLAUSIBLE');
    if (ctx.now > tg.spawn + tg.life) throw new GameError('Target already gone');
    s.hit.push(tg.id);
    if (tg.decoy) { s.score = Math.max(0, s.score - 100); s.decoys++; s.combo = 0; return s; }
    s.hits++;
    s.combo++;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const frac = 1 - (ctx.now - tg.spawn) / tg.life;
    s.score += 50 + Math.round(30 * frac) + Math.min(50, s.combo * 2);
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { hits: s.hits, misses: s.misses, decoys: s.decoys, bestCombo: s.bestCombo } }),
  view: (s) => s,
  maxDurationMs: () => REFLEX_DURATION + 2000,
};
