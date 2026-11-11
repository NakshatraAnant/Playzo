import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

export interface Problem { text: string; options: number[]; answer: number }
export interface RushState {
  seed: string; difficulty: Difficulty; idx: number; streak: number; best: number; correct: number; wrong: number;
  score: number; over: boolean; shownAt: number; problem: Problem;
}
export type RushAction = { t: number; a: number } | { t: number; end: true };
export const RUSH_DURATION = 60_000;

export function makeProblem(seed: string, idx: number, tier: number): Problem {
  const rng = subRng(seed, `nr-${idx}`);
  const r = (lo: number, hi: number) => lo + rng.int(hi - lo + 1);
  let text = '', answer = 0;
  const op = tier <= 1 ? rng.pick(['+', '-']) : tier <= 3 ? rng.pick(['+', '-', 'x']) : rng.pick(['+', '-', 'x', '/']);
  const scale = [9, 20, 50, 99, 150, 250][Math.min(tier, 5)];
  if (op === '+') { const x = r(1, scale), y = r(1, scale); text = `${x} + ${y}`; answer = x + y; }
  else if (op === '-') { const x = r(2, scale), y = r(1, x); text = `${x} - ${y}`; answer = x - y; }
  else if (op === 'x') { const m = Math.min(12, 4 + tier * 2); const x = r(2, m), y = r(2, m + 3); text = `${x} x ${y}`; answer = x * y; }
  else { const y = r(2, 12), q = r(2, 12); text = `${y * q} / ${y}`; answer = q; }
  const opts = new Set<number>([answer]);
  const spreads = [1, 2, 10, -1, -2, -10, 3, 5];
  while (opts.size < 4) {
    const cand = answer + rng.pick(spreads) * (1 + rng.int(2));
    if (cand >= 0) opts.add(cand);
  }
  return { text, options: rng.shuffle([...opts]), answer };
}

const tierOf = (s: Pick<RushState, 'streak' | 'difficulty'>) =>
  Math.floor(s.streak / 3) + (s.difficulty === 'easy' ? 0 : s.difficulty === 'normal' ? 1 : 2);

export const numberRush: Engine<RushState, RushAction> = {
  id: 'number-rush', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const s: RushState = { seed, difficulty: o.difficulty, idx: 0, streak: 0, best: 0, correct: 0, wrong: 0, score: 0, over: false, shownAt: 0, problem: null as any };
    s.problem = makeProblem(seed, 0, tierOf(s));
    return s;
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    if (ctx.now >= RUSH_DURATION || 'end' in a) { s.over = true; return s; }
    if (ctx.now - s.shownAt < 250) throw new GameError('Implausibly fast answer', 'IMPLAUSIBLE');
    if (!Number.isInteger(a.a) || a.a < 0 || a.a > 3) throw new GameError('Bad option');
    if (s.problem.options[a.a] === s.problem.answer) {
      s.streak++;
      s.correct++;
      s.best = Math.max(s.best, s.streak);
      s.score += 10 * Math.min(5, 1 + Math.floor(s.streak / 3));
    } else {
      s.streak = 0;
      s.wrong++;
    }
    s.idx++;
    s.shownAt = ctx.now;
    s.problem = makeProblem(s.seed, s.idx, tierOf(s));
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { correct: s.correct, wrong: s.wrong, bestStreak: s.best } }),
  view: (s) => s,
  maxDurationMs: () => RUSH_DURATION + 2000,
};
