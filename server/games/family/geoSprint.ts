import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';
import { COUNTRIES, CONTINENTS } from '../../data/geo';

interface GeoQ { kind: 'capital' | 'continent' | 'flag'; prompt: string; flag?: string; options: string[]; correct: number; country: string; continent: string }
interface GeoState {
  start: number; endsAt: number; q: GeoQ; n: number; score: number; correct: number; wrong: number; lockedUntil: number;
  missedRegions: Record<string, number>; over: boolean; last: { correct: boolean; answer: string; country: string; flag: string } | null;
}
type A = { type: 'answer'; choice: number } | { type: 'tick' };
const DURATION = 60_000;

function makeQ(rng: Rng, difficulty: string): GeoQ {
  const kinds: GeoQ['kind'][] = difficulty === 'easy' ? ['continent', 'flag', 'capital'] : ['capital', 'flag', 'continent', 'capital'];
  const kind = rng.pick(kinds);
  const c = rng.pick(COUNTRIES);
  if (kind === 'continent') {
    const options = rng.shuffle(rng.shuffle(CONTINENTS.filter((x) => x !== c[2])).slice(0, 3).concat(c[2]));
    return { kind, prompt: `Which continent is ${c[0]} in?`, options, correct: options.indexOf(c[2]), country: c[0], continent: c[2] };
  }
  const others = rng.shuffle(COUNTRIES.filter((x) => x[0] !== c[0])).slice(0, 3);
  if (kind === 'capital') {
    const options = rng.shuffle([c[1], ...others.map((o) => o[1])]);
    return { kind, prompt: `What is the capital of ${c[0]}?`, options, correct: options.indexOf(c[1]), country: c[0], continent: c[2] };
  }
  const options = rng.shuffle([c[0], ...others.map((o) => o[0])]);
  return { kind, prompt: 'Which country has this flag?', flag: c[3], options, correct: options.indexOf(c[0]), country: c[0], continent: c[2] };
}

export const geoSprint: Engine<GeoState, A> = {
  id: 'geo-sprint', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 }, timed: true,
  shiftTime: (s, dt) => { s.start += dt; s.endsAt += dt; if (s.lockedUntil) s.lockedUntil += dt; return s; },
  init(o, ctx) {
    const start = ctx.now + 1000;
    const s: GeoState = { start, endsAt: start + DURATION, q: makeQ(ctx.rng, o.difficulty), n: 0, score: 0, correct: 0, wrong: 0, lockedUntil: 0, missedRegions: {}, over: false, last: null };
    (s as any).difficulty = o.difficulty;
    return s;
  },
  apply(s, a, ctx) {
    if (ctx.now >= s.endsAt) s.over = true;
    if (s.over) { if (a.type === 'tick') return s; throw new GameError('Sprint finished'); }
    if (a.type === 'tick') return s;
    if (ctx.now < s.start) throw new GameError('Not started');
    if (ctx.now < s.lockedUntil) throw new GameError('Locked for a moment');
    if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice > 3) throw new GameError('Bad option');
    const ok = a.choice === s.q.correct;
    if (ok) { s.score += 100; s.correct++; }
    else {
      s.score = Math.max(0, s.score - 25); s.wrong++; s.lockedUntil = ctx.now + 1000;
      s.missedRegions[s.q.continent] = (s.missedRegions[s.q.continent] ?? 0) + 1;
    }
    const c = COUNTRIES.find((x) => x[0] === s.q.country)!;
    s.last = { correct: ok, answer: s.q.options[s.q.correct], country: c[0], flag: c[3] };
    s.n++;
    s.q = makeQ(ctx.rng, (s as any).difficulty);
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { correct: s.correct, wrong: s.wrong, missedRegions: s.missedRegions } }),
  view: (s) => ({ start: s.start, endsAt: s.endsAt, q: { kind: s.q.kind, prompt: s.q.prompt, flag: s.q.flag, options: s.q.options }, score: s.score, correct: s.correct, wrong: s.wrong, lockedUntil: s.lockedUntil, last: s.last, over: s.over, missedRegions: s.over ? s.missedRegions : undefined }),
};
