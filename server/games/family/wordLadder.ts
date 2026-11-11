import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';
import { LADDER3, LADDER4, isWord, isBlocked } from '../../data/words';

interface Ladder { start: string; target: string; optimal: number; example: string[] }
interface WLState { ladders: Ladder[]; idx: number; path: string[]; score: number; done: { steps: number; optimal: number; gaveUp: boolean }[]; over: boolean; msg: string }
type A = { type: 'word'; w: string } | { type: 'undo' } | { type: 'giveup' };

const oneApart = (a: string, b: string) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;

function bfsPath(words: string[], from: string): Map<string, string | null> {
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const w of words) if (!prev.has(w) && oneApart(cur, w)) { prev.set(w, cur); q.push(w); }
  }
  return prev;
}

export function makeLadder(rng: Rng, len: 3 | 4, minD: number, maxD: number): Ladder {
  const words = [...new Set(len === 3 ? LADDER3 : LADDER4)].filter((w) => w.length === len);
  for (let tries = 0; tries < 200; tries++) {
    const start = rng.pick(words);
    const prev = bfsPath(words, start);
    const cands: string[] = [];
    for (const w of prev.keys()) {
      let d = 0, c: string | null = w;
      while (prev.get(c!) !== null) { c = prev.get(c!)!; d++; }
      if (d >= minD && d <= maxD) cands.push(w);
    }
    if (!cands.length) continue;
    const target = rng.pick(cands);
    const example: string[] = [];
    let c: string | null = target;
    while (c) { example.unshift(c); c = prev.get(c) ?? null; }
    return { start, target, optimal: example.length - 1, example };
  }
  throw new Error('Could not build ladder');
}

export const wordLadder: Engine<WLState, A> = {
  id: 'word-ladder', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init(o, ctx) {
    const cfg = o.difficulty === 'easy' ? { len: 3 as const, min: 2, max: 3 } : o.difficulty === 'normal' ? { len: 4 as const, min: 3, max: 4 } : { len: 4 as const, min: 4, max: 6 };
    const ladders = [0, 1, 2].map(() => makeLadder(ctx.rng, cfg.len, cfg.min, cfg.max));
    return { ladders, idx: 0, path: [ladders[0].start], score: 0, done: [], over: false, msg: '' };
  },
  apply(s, a) {
    if (s.over) throw new GameError('All ladders done');
    const L = s.ladders[s.idx];
    const next = (gaveUp: boolean) => {
      const steps = s.path.length - 1;
      s.done.push({ steps, optimal: L.optimal, gaveUp });
      if (!gaveUp) s.score += 300 + (steps === L.optimal ? 100 : 0) - 20 * Math.max(0, steps - L.optimal);
      s.idx++;
      if (s.idx >= s.ladders.length) s.over = true;
      else s.path = [s.ladders[s.idx].start];
    };
    if (a.type === 'undo') { if (s.path.length > 1) s.path.pop(); s.msg = ''; return s; }
    if (a.type === 'giveup') { s.msg = `One route: ${L.example.join(' > ')}`; next(true); return s; }
    if (a.type !== 'word' || typeof a.w !== 'string') throw new GameError('Bad word');
    const w = a.w.toLowerCase().trim();
    const cur = s.path[s.path.length - 1];
    if (!oneApart(cur, w)) { s.msg = 'Change exactly one letter'; return s; }
    if (s.path.includes(w)) { s.msg = 'Already on your ladder'; return s; }
    if (isBlocked(w) || !isWord(w)) { s.msg = 'Not in the word list'; return s; }
    if (s.path.length > 25) { s.msg = 'Ladder too long. Try undo or give up'; return s; }
    s.path.push(w);
    s.msg = '';
    if (w === L.target) { s.msg = s.path.length - 1 === L.optimal ? 'Perfect climb!' : 'Reached it!'; next(false); }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: Math.max(0, s.score) }, summary: { ladders: s.done } }),
  view: (s) => {
    const L = s.ladders[Math.min(s.idx, s.ladders.length - 1)];
    return { idx: s.idx, total: s.ladders.length, start: L.start, target: L.target, optimal: L.optimal, path: s.path, score: s.score, msg: s.msg, over: s.over, done: s.done };
  },
};
