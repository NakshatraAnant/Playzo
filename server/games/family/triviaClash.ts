import { Engine, GameError } from '../../../shared/engine';
import { TRIVIA } from '../../data/trivia';
import { RoundsState, initRounds, advance, answer, fifty, roundsView, roundsResult, RoundQ } from './rounds';

type A = { type: 'answer'; choice: number } | { type: 'fifty' } | { type: 'tick' };

export const triviaClash: Engine<RoundsState, A> = {
  id: 'trivia-clash', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 8 }, simultaneous: true, timed: true,
  init(o, ctx) {
    const level = o.difficulty === 'easy' ? [1, 2] : o.difficulty === 'normal' ? [1, 2, 3] : [2, 3];
    const pool = TRIVIA.filter((q) => level.includes(q.d));
    const picked = ctx.rng.shuffle(pool.slice()).slice(0, 10);
    const qs: RoundQ[] = picked.map((q) => {
      const order = ctx.rng.shuffle([0, 1, 2, 3]);
      return { prompt: q.q, options: order.map((i) => q.a[i]), correct: order.indexOf(0), tag: q.cat };
    });
    const limit = o.difficulty === 'easy' ? 20_000 : 15_000;
    const teams = (o.config?.teams as Record<string, number>) ?? null;
    return initRounds(o.players, qs, limit, ctx.now, teams, o.players.length === 1 ? 1 : 0);
  },
  apply(s, a, ctx) {
    if (a.type === 'tick') { advance(s, ctx.now); return s; }
    if (a.type === 'answer') { answer(s, ctx.player, a.choice, ctx.now); return s; }
    if (a.type === 'fifty') { fifty(s, ctx.player, ctx.now, (w) => ctx.rng.shuffle(w)); return s; }
    throw new GameError('Unknown action');
  },
  isOver: (s) => s.phase === 'done',
  result: roundsResult,
  view: roundsView,
};
