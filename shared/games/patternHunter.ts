import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

export type OddKind = 'rotation' | 'hue' | 'shape';
export interface PatternRound { n: number; kind: OddKind; odd: number; glyph: number; hue: number; rot: number; delta: number; altGlyph: number }
export interface PatternState {
  seed: string; difficulty: Difficulty; round: number; roundStart: number; penalty: number;
  score: number; found: number; wrong: number; over: boolean; current: PatternRound; colourMode: boolean;
}
export type PatternAction = { t: number; i: number } | { t: number; end: true };

export const PATTERN_DURATION = 60_000;
export const MIN_REACTION_MS = 150;
export const GLYPH_COUNT = 8;

export function patternRound(seed: string, round: number, difficulty: Difficulty, colourMode: boolean): PatternRound {
  const rng = subRng(seed, `pr-${round}`);
  const base = difficulty === 'easy' ? 3 : difficulty === 'normal' ? 4 : 5;
  const n = Math.min(base + Math.floor(round / 3), 8);
  const kinds: OddKind[] = colourMode ? ['rotation', 'hue', 'shape'] : ['rotation', 'shape'];
  const kind = kinds[rng.int(kinds.length)];
  const glyph = rng.int(GLYPH_COUNT);
  let altGlyph = rng.int(GLYPH_COUNT - 1);
  if (altGlyph >= glyph) altGlyph++;
  // Differences shrink as rounds progress (harder to spot).
  const shrink = Math.min(round, 15);
  const delta = kind === 'rotation' ? Math.max(12, 45 - shrink * 2) : kind === 'hue' ? Math.max(14, 50 - shrink * 2.5) : 0;
  return { n, kind, odd: rng.int(n * n), glyph, hue: rng.int(360), rot: rng.int(4) * 90, delta, altGlyph };
}

export const patternHunter: Engine<PatternState, PatternAction> = {
  id: 'pattern-hunter', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const colourMode = o.config?.colourMode !== false;
    return {
      seed, difficulty: o.difficulty, round: 0, roundStart: 0, penalty: 0, score: 0, found: 0, wrong: 0,
      over: false, colourMode, current: patternRound(seed, 0, o.difficulty, colourMode),
    };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    const deadline = PATTERN_DURATION - s.penalty;
    if (ctx.now >= deadline || 'end' in a) { s.over = true; return s; }
    if (ctx.now < s.roundStart) throw new GameError('Out-of-order action', 'IMPLAUSIBLE');
    const n2 = s.current.n * s.current.n;
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= n2) throw new GameError('Bad tile');
    if (a.i === s.current.odd) {
      const took = ctx.now - s.roundStart;
      if (took < MIN_REACTION_MS) throw new GameError('Implausibly fast tap', 'IMPLAUSIBLE');
      s.score += 100 + Math.max(0, 50 - Math.floor(took / 100));
      s.found++;
      s.round++;
      s.roundStart = ctx.now;
      s.current = patternRound(s.seed, s.round, s.difficulty, s.colourMode);
    } else {
      s.wrong++;
      s.penalty += 3000;
      if (ctx.now >= PATTERN_DURATION - s.penalty) s.over = true;
    }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { found: s.found, wrong: s.wrong } }),
  view: (s) => s,
  maxDurationMs: () => PATTERN_DURATION + 2000,
};
