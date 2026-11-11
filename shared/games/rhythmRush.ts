import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng } from '../rng';

export interface Note { id: number; t: number; lane: number }
export interface RhythmState {
  seed: string; difficulty: Difficulty; bpm: number; notes: Note[]; judged: Record<number, 'perfect' | 'great' | 'good' | 'miss'>;
  score: number; combo: number; maxCombo: number; counts: { perfect: number; great: number; good: number; miss: number };
  over: boolean; checkedUntil: number; lastT: number;
}
export type RhythmAction = { t: number; lane: number } | { t: number; end: true };
export const RHYTHM_DURATION = 60_000;
export const LEAD_IN = 2000;
export const WINDOWS = { perfect: 60, great: 120, good: 180 };
const POINTS = { perfect: 300, great: 150, good: 50 };

export function chart(seed: string, difficulty: Difficulty): { bpm: number; notes: Note[] } {
  const rng = new SeededRng(`${seed}::chart`);
  const bpm = difficulty === 'easy' ? 96 : difficulty === 'normal' ? 116 : 136;
  const beat = 60000 / bpm;
  const density = difficulty === 'easy' ? 0.55 : difficulty === 'normal' ? 0.7 : 0.85;
  const notes: Note[] = [];
  let id = 0, lastLane = 0;
  for (let b = 0; LEAD_IN + b * beat / 2 < RHYTHM_DURATION - 1500; b++) {
    const onBeat = b % 2 === 0;
    const p = onBeat ? density : density * (difficulty === 'easy' ? 0.15 : 0.45);
    if (rng.next() < p) {
      let lane = rng.int(4);
      if (lane === lastLane && rng.next() < 0.5) lane = (lane + 1 + rng.int(3)) % 4;
      lastLane = lane;
      notes.push({ id: id++, t: Math.round(LEAD_IN + (b * beat) / 2), lane });
    }
  }
  return { bpm, notes };
}

function settle(s: RhythmState, until: number) {
  for (const n of s.notes) {
    if (n.t + WINDOWS.good < until && n.t + WINDOWS.good >= s.checkedUntil && !s.judged[n.id]) {
      s.judged[n.id] = 'miss'; s.counts.miss++; s.combo = 0;
    }
  }
  s.checkedUntil = Math.max(s.checkedUntil, until);
}

export const rhythmRush: Engine<RhythmState, RhythmAction> = {
  id: 'rhythm-rush', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const { bpm, notes } = chart(seed, o.difficulty);
    return { seed, difficulty: o.difficulty, bpm, notes, judged: {}, score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, over: false, checkedUntil: 0, lastT: 0 };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Song finished');
    if (ctx.now < s.lastT) throw new GameError('Out of order', 'IMPLAUSIBLE');
    s.lastT = ctx.now;
    if ('end' in a || ctx.now >= RHYTHM_DURATION) { settle(s, RHYTHM_DURATION + 1000); s.over = true; return s; }
    settle(s, ctx.now);
    if (!Number.isInteger(a.lane) || a.lane < 0 || a.lane > 3) throw new GameError('Bad lane');
    let best: Note | null = null;
    for (const n of s.notes) {
      if (n.lane !== a.lane || s.judged[n.id]) continue;
      const d = Math.abs(n.t - ctx.now);
      if (d <= WINDOWS.good && (!best || d < Math.abs(best.t - ctx.now))) best = n;
    }
    if (!best) return s; // stray tap - no note nearby, no penalty
    const d = Math.abs(best.t - ctx.now);
    const j = d <= WINDOWS.perfect ? 'perfect' : d <= WINDOWS.great ? 'great' : 'good';
    s.judged[best.id] = j;
    s.counts[j]++;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.score += Math.round(POINTS[j] * (1 + Math.min(0.5, s.combo / 100)));
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { ...s.counts, maxCombo: s.maxCombo, notes: s.notes.length } }),
  view: (s) => s,
  maxDurationMs: () => RHYTHM_DURATION + 3000,
};
