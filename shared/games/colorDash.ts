import { Engine, GameError, Difficulty } from '../engine';
import { subRng } from '../rng';

export const DASH_COLOURS = [
  { name: 'RED', hex: '#ff4d5e', symbol: '▲' },
  { name: 'BLUE', hex: '#3d8bff', symbol: '●' },
  { name: 'GREEN', hex: '#2fd66b', symbol: '■' },
  { name: 'YELLOW', hex: '#ffd23f', symbol: '★' },
  { name: 'PURPLE', hex: '#b06bff', symbol: '◆' },
];
export interface Prompt { word: number; ink: number; options: number[] }
export interface DashState {
  seed: string; difficulty: Difficulty; idx: number; prompt: Prompt; shownAt: number; streak: number; best: number;
  correct: number; wrong: number; score: number; over: boolean;
}
export type DashAction = { t: number; c: number } | { t: number; end: true };
export const DASH_DURATION = 45_000;

export function makePrompt(seed: string, idx: number, difficulty: Difficulty): Prompt {
  const rng = subRng(seed, `cd-${idx}`);
  const k = difficulty === 'easy' ? 3 : difficulty === 'normal' ? 4 : 5;
  const palette = rng.shuffle([...Array(DASH_COLOURS.length).keys()]).slice(0, k);
  const ink = palette[rng.int(k)];
  let word = palette[rng.int(k)];
  if (rng.next() < 0.75) while (word === ink) word = palette[rng.int(k)];
  return { word, ink, options: rng.shuffle(palette.slice()) };
}

export const colorDash: Engine<DashState, DashAction> = {
  id: 'color-dash', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    return { seed, difficulty: o.difficulty, idx: 0, prompt: makePrompt(seed, 0, o.difficulty), shownAt: 0, streak: 0, best: 0, correct: 0, wrong: 0, score: 0, over: false };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    if ('end' in a || ctx.now >= DASH_DURATION) { s.over = true; return s; }
    if (ctx.now - s.shownAt < 150) throw new GameError('Implausibly fast', 'IMPLAUSIBLE');
    if (!s.prompt.options.includes(a.c)) throw new GameError('Bad colour');
    if (a.c === s.prompt.ink) {
      s.streak++; s.correct++; s.best = Math.max(s.best, s.streak);
      s.score += 20 * Math.min(5, 1 + Math.floor(s.streak / 4));
    } else { s.streak = 0; s.wrong++; }
    s.idx++;
    s.shownAt = ctx.now;
    s.prompt = makePrompt(s.seed, s.idx, s.difficulty);
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { correct: s.correct, wrong: s.wrong, bestStreak: s.best } }),
  view: (s) => s,
  maxDurationMs: () => DASH_DURATION + 2000,
};
