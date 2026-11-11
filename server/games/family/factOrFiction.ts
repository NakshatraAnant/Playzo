import { Engine, GameError } from '../../../shared/engine';
import { FACTS, FactQ } from '../../data/facts';

interface FFState { qs: FactQ[]; idx: number; score: number; streak: number; best: number; correct: number; last: { fact: boolean; why: string; correct: boolean; s: string } | null; over: boolean }
type A = { type: 'answer'; fact: boolean };

export const factOrFiction: Engine<FFState, A> = {
  id: 'fact-or-fiction', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init(_o, ctx) {
    return { qs: ctx.rng.shuffle(FACTS.slice()).slice(0, 12), idx: 0, score: 0, streak: 0, best: 0, correct: 0, last: null, over: false };
  },
  apply(s, a) {
    if (s.over) throw new GameError('Game over');
    if (a.type !== 'answer' || typeof a.fact !== 'boolean') throw new GameError('Answer fact or fiction');
    const q = s.qs[s.idx];
    const ok = a.fact === q.fact;
    if (ok) { s.streak++; s.correct++; s.best = Math.max(s.best, s.streak); s.score += 100 + 20 * (s.streak - 1); }
    else s.streak = 0;
    s.last = { fact: q.fact, why: q.why, correct: ok, s: q.s };
    s.idx++;
    if (s.idx >= s.qs.length) s.over = true;
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { correct: s.correct, total: s.qs.length, bestStreak: s.best } }),
  view: (s) => ({ idx: s.idx, total: s.qs.length, statement: s.over ? null : s.qs[s.idx].s, score: s.score, streak: s.streak, last: s.last, over: s.over }),
};
