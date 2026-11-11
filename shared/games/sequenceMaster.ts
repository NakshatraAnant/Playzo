import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng } from '../rng';

export interface SeqState {
  seed: string; difficulty: Difficulty; seq: number[]; length: number; inputIdx: number;
  inputOpensAt: number; score: number; rounds: number; over: boolean; stepMs: number;
}
export type SeqAction = { t: number; pad: number } | { t: number; end: true };

export const STEP_MS: Record<Difficulty, number> = { easy: 700, normal: 550, hard: 420 };
export const ROUND_GAP_MS = 800;
const START_LEN: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4 };

/** Time (ms after a round completes) when the next round's input window opens. */
export const showDuration = (len: number, stepMs: number) => ROUND_GAP_MS + len * stepMs;

export const sequenceMaster: Engine<SeqState, SeqAction> = {
  id: 'sequence-master', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    const seed = o.seed ?? 'local';
    const rng = new SeededRng(`${seed}::seq`);
    const seq = Array.from({ length: 64 }, () => rng.int(4));
    const stepMs = STEP_MS[o.difficulty];
    const length = START_LEN[o.difficulty];
    return { seed, difficulty: o.difficulty, seq, length, inputIdx: 0, inputOpensAt: showDuration(length, stepMs), score: 0, rounds: 0, over: false, stepMs };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Run is over');
    if ('end' in a) { s.over = true; return s; }
    if (ctx.now < s.inputOpensAt - 50) throw new GameError('Input during playback', 'IMPLAUSIBLE');
    if (!Number.isInteger(a.pad) || a.pad < 0 || a.pad > 3) throw new GameError('Bad pad');
    if (a.pad !== s.seq[s.inputIdx]) { s.over = true; return s; }
    s.inputIdx++;
    if (s.inputIdx === s.length) {
      s.score += 10 * s.length;
      s.rounds++;
      s.length++;
      s.inputIdx = 0;
      if (s.length > s.seq.length) { s.over = true; return s; }
      s.inputOpensAt = ctx.now + showDuration(s.length, s.stepMs);
    }
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { rounds: s.rounds, longest: s.length - 1 } }),
  view: (s) => s,
  maxDurationMs: () => 20 * 60_000,
};
