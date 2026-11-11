import { Engine, GameError } from '../../../shared/engine';

interface CBState { secret: number[]; len: number; colours: number; guesses: { g: number[]; exact: number; partial: number }[]; max: number; solved: boolean; over: boolean }
type A = { type: 'guess'; g: number[] };

export function grade(secret: number[], g: number[]): { exact: number; partial: number } {
  let exact = 0;
  const sc: Record<number, number> = {}, gc: Record<number, number> = {};
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === g[i]) exact++;
    else { sc[secret[i]] = (sc[secret[i]] ?? 0) + 1; gc[g[i]] = (gc[g[i]] ?? 0) + 1; }
  }
  let partial = 0;
  for (const k of Object.keys(gc)) partial += Math.min(gc[+k], sc[+k] ?? 0);
  return { exact, partial };
}

export const codeBreaker: Engine<CBState, A> = {
  id: 'code-breaker', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init(o, ctx) {
    const len = o.difficulty === 'hard' ? 5 : 4;
    const colours = o.difficulty === 'easy' ? 5 : 6;
    return { secret: Array.from({ length: len }, () => ctx.rng.int(colours)), len, colours, guesses: [], max: 10, solved: false, over: false };
  },
  apply(s, a) {
    if (s.over) throw new GameError('Code already resolved');
    if (a.type !== 'guess' || !Array.isArray(a.g) || a.g.length !== s.len) throw new GameError(`Guess must have ${s.len} gems`);
    if (!a.g.every((x) => Number.isInteger(x) && x >= 0 && x < s.colours)) throw new GameError('Unknown gem');
    const r = grade(s.secret, a.g);
    s.guesses.push({ g: a.g.slice(), ...r });
    if (r.exact === s.len) { s.solved = true; s.over = true; }
    else if (s.guesses.length >= s.max) s.over = true;
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.solved ? 100 * (11 - s.guesses.length) : 0 }, summary: { solved: s.solved, guesses: s.guesses.length } }),
  view: (s) => ({ len: s.len, colours: s.colours, guesses: s.guesses, max: s.max, solved: s.solved, over: s.over, secret: s.over ? s.secret : null }),
};
