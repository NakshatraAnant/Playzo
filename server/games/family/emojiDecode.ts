import { Engine, GameError } from '../../../shared/engine';
import { EMOJI, EmojiQ } from '../../data/emoji';

interface EDState { qs: EmojiQ[]; idx: number; hints: number; score: number; solved: number; last: { answer: string; correct: boolean; points: number } | null; over: boolean }
type A = { type: 'guess'; text: string } | { type: 'hint' } | { type: 'skip' };

export const normalise = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function matches(q: EmojiQ, text: string): boolean {
  const g = normalise(text);
  if (!g) return false;
  return [q.answer, ...(q.alt ?? [])].some((ans) => {
    const n = normalise(ans);
    if (n === g || n.replace(/ /g, '') === g.replace(/ /g, '')) return true;
    return n.length >= 6 && lev(n, g) <= 1;
  });
}

export const emojiDecode: Engine<EDState, A> = {
  id: 'emoji-decode', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 1 },
  init(_o, ctx) {
    return { qs: ctx.rng.shuffle(EMOJI.slice()).slice(0, 8), idx: 0, hints: 0, score: 0, solved: 0, last: null, over: false };
  },
  apply(s, a) {
    if (s.over) throw new GameError('Game over');
    const q = s.qs[s.idx];
    if (a.type === 'hint') {
      if (s.hints >= q.answer.replace(/ /g, '').length - 1) throw new GameError('No more hints');
      s.hints++;
      return s;
    }
    if (a.type === 'guess') {
      if (typeof a.text !== 'string' || a.text.length > 60) throw new GameError('Bad guess');
      if (!matches(q, a.text)) { s.last = { answer: '', correct: false, points: 0 }; return s; }
      const pts = Math.max(30, 150 - 30 * s.hints);
      s.score += pts; s.solved++;
      s.last = { answer: q.answer, correct: true, points: pts };
    } else if (a.type === 'skip') {
      s.last = { answer: q.answer, correct: false, points: 0 };
    } else throw new GameError('Unknown action');
    s.idx++; s.hints = 0;
    if (s.idx >= s.qs.length) s.over = true;
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { solved: s.solved, total: s.qs.length } }),
  view: (s) => {
    const q = s.qs[s.idx];
    let revealed = '';
    if (q) {
      let shown = 0;
      revealed = q.answer.split('').map((ch) => (ch === ' ' ? ' ' : shown++ < s.hints ? ch : '_')).join('');
    }
    return { idx: s.idx, total: s.qs.length, emoji: q?.e ?? null, hint: q?.hint ?? null, pattern: revealed, hints: s.hints, score: s.score, last: s.last, over: s.over };
  },
};
