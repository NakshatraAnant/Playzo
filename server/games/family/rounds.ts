/**
 * Shared timing core for simultaneous, round-based answer games (Trivia Clash, Party Chaos).
 * The server clock decides deadlines; answers after a deadline are rejected.
 */
import { GameError, GameResult } from '../../../shared/engine';

export interface RoundQ { prompt: string; options: string[]; correct: number; tag?: string; visual?: unknown }
export interface RoundsState {
  players: string[];
  teams: Record<string, number> | null;
  qs: RoundQ[];
  idx: number;
  phase: 'question' | 'reveal' | 'done';
  qStart: number;
  deadline: number;
  revealUntil: number;
  limitMs: number;
  answers: Record<string, { choice: number; at: number; pts: number }>[];
  scores: Record<string, number>;
  correctCount: Record<string, number>;
  removed: Record<string, number[]>;
  lifelines: Record<string, number>;
}

export const REVEAL_MS = 2200;

export function initRounds(players: string[], qs: RoundQ[], limitMs: number, now: number, teams: Record<string, number> | null, lifelines = 0): RoundsState {
  return {
    players, teams, qs, idx: 0, phase: 'question', qStart: now + 1200, deadline: now + 1200 + limitMs, revealUntil: 0, limitMs,
    answers: qs.map(() => ({})), scores: Object.fromEntries(players.map((p) => [p, 0])),
    correctCount: Object.fromEntries(players.map((p) => [p, 0])), removed: {}, lifelines: Object.fromEntries(players.map((p) => [p, lifelines])),
  };
}

/** Pause support: move every server deadline forward by dt ms. */
export function shiftRounds<S extends RoundsState>(s: S, dt: number): S {
  s.qStart += dt; s.deadline += dt; if (s.revealUntil) s.revealUntil += dt;
  return s;
}

export function advance(s: RoundsState, now: number): void {
  for (let guard = 0; guard < 4; guard++) {
    if (s.phase === 'question') {
      const all = s.players.every((p) => s.answers[s.idx][p]);
      if (all || now >= s.deadline) {
        s.phase = 'reveal';
        s.revealUntil = now + REVEAL_MS;
        s.removed = {};
      } else return;
    } else if (s.phase === 'reveal') {
      if (now < s.revealUntil) return;
      s.idx++;
      if (s.idx >= s.qs.length) { s.phase = 'done'; return; }
      s.phase = 'question';
      s.qStart = now + 300;
      s.deadline = s.qStart + s.limitMs;
    } else return;
  }
}

export function answer(s: RoundsState, player: string, choice: number, now: number, speedBonus = 50): void {
  advance(s, now);
  if (s.phase !== 'question') throw new GameError('Not accepting answers right now');
  if (now < s.qStart) throw new GameError('Question not shown yet');
  if (!s.players.includes(player)) throw new GameError('Not in this game');
  if (s.answers[s.idx][player]) throw new GameError('Already answered');
  const q = s.qs[s.idx];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new GameError('Bad option');
  if ((s.removed[player] ?? []).includes(choice)) throw new GameError('That option was removed');
  let pts = 0;
  if (choice === q.correct) {
    const left = Math.max(0, s.deadline - now) / s.limitMs;
    pts = 100 + Math.round(speedBonus * left);
    s.correctCount[player]++;
  }
  s.answers[s.idx][player] = { choice, at: now - s.qStart, pts };
  s.scores[player] += pts;
  advance(s, now);
}

export function fifty(s: RoundsState, player: string, now: number, pickWrong: (wrong: number[]) => number[]): void {
  advance(s, now);
  if (s.phase !== 'question') throw new GameError('Not now');
  if ((s.lifelines[player] ?? 0) <= 0) throw new GameError('No lifelines left');
  if (s.removed[player]) throw new GameError('Already used on this question');
  const q = s.qs[s.idx];
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correct);
  s.removed[player] = pickWrong(wrong).slice(0, 2);
  s.lifelines[player]--;
}

export function roundsView(s: RoundsState, player: string) {
  const q = s.qs[s.idx];
  const revealing = s.phase === 'reveal' || s.phase === 'done';
  return {
    phase: s.phase, idx: s.idx, total: s.qs.length, qStart: s.qStart, deadline: s.deadline, limitMs: s.limitMs, revealUntil: s.revealUntil,
    question: q ? { prompt: q.prompt, options: q.options, tag: q.tag, visual: q.visual, correct: revealing ? q.correct : undefined } : null,
    myAnswer: q ? s.answers[s.idx][player] ?? null : null,
    answered: q ? Object.keys(s.answers[s.idx]) : [],
    revealAnswers: revealing && q ? s.answers[s.idx] : null,
    removed: s.removed[player] ?? [], lifelines: s.lifelines[player] ?? 0,
    scores: s.scores, teams: s.teams, correctCount: s.correctCount,
  };
}

export function roundsResult(s: RoundsState): GameResult {
  const ranking = [...s.players].sort((a, b) => s.scores[b] - s.scores[a]);
  const summary: Record<string, unknown> = { correct: s.correctCount };
  let winner: string | null = s.players.length > 1 && s.scores[ranking[0]] !== s.scores[ranking[1]] ? ranking[0] : s.players.length === 1 ? ranking[0] : null;
  if (s.teams) {
    const team = [0, 0];
    for (const p of s.players) team[s.teams[p] ?? 0] += s.scores[p];
    summary.teamScores = team;
    summary.winningTeam = team[0] === team[1] ? null : team[0] > team[1] ? 0 : 1;
    winner = null;
  }
  return { scores: { ...s.scores }, ranking, winner, summary };
}
