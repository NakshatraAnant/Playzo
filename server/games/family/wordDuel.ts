import { Engine, GameError } from '../../../shared/engine';
import { PANGRAMS, isWord, isBlocked } from '../../data/words';

interface WDState {
  players: string[]; letters: string[]; centre: string; start: number; endsAt: number;
  found: Record<string, string[]>; scores: Record<string, number>; over: boolean; lastMsg: Record<string, string>;
}
type A = { type: 'word'; w: string } | { type: 'tick' };

export function wordPoints(w: string, letters: string[]): number {
  const pangram = letters.every((l) => w.includes(l));
  return w.length + (pangram ? 10 : 0);
}

export const wordDuel: Engine<WDState, A> = {
  id: 'word-duel', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 6 }, simultaneous: true, timed: true,
  shiftTime: (s, dt) => { s.start += dt; s.endsAt += dt; return s; },
  init(o, ctx) {
    const seedWord = ctx.rng.pick(PANGRAMS);
    const letters = ctx.rng.shuffle([...new Set(seedWord.split(''))]);
    const vowels = letters.filter((l) => 'aeiou'.includes(l));
    const centre = ctx.rng.next() < 0.6 && vowels.length ? ctx.rng.pick(letters.filter((l) => !'aeiou'.includes(l))) : ctx.rng.pick(letters);
    const duration = o.difficulty === 'easy' ? 120_000 : 90_000;
    const start = ctx.now + 1500;
    return {
      players: o.players, letters, centre, start, endsAt: start + duration,
      found: Object.fromEntries(o.players.map((p) => [p, []])), scores: Object.fromEntries(o.players.map((p) => [p, 0])), over: false, lastMsg: {},
    };
  },
  apply(s, a, ctx) {
    if (ctx.now >= s.endsAt) s.over = true;
    if (a.type === 'tick') return s;
    if (s.over) throw new GameError('Time is up');
    if (ctx.now < s.start) throw new GameError('Not started yet');
    if (a.type !== 'word' || typeof a.w !== 'string') throw new GameError('Bad word');
    const w = a.w.toLowerCase().trim();
    const reject = (m: string) => { s.lastMsg[ctx.player] = m; return s; };
    if (w.length < 3) return reject('Too short');
    if (!w.includes(s.centre)) return reject(`Must use "${s.centre.toUpperCase()}"`);
    if (![...w].every((ch) => s.letters.includes(ch))) return reject('Uses a letter not in the hive');
    if (s.found[ctx.player].includes(w)) return reject('Already found');
    if (isBlocked(w) || !isWord(w)) return reject('Not in the word list');
    s.found[ctx.player].push(w);
    const pts = wordPoints(w, s.letters);
    s.scores[ctx.player] += pts;
    s.lastMsg[ctx.player] = pts > w.length ? `Pangram! +${pts}` : `+${pts}`;
    return s;
  },
  isOver: (s) => s.over,
  result: (s) => {
    const ranking = [...s.players].sort((a, b) => s.scores[b] - s.scores[a]);
    const winner = s.players.length === 1 ? ranking[0] : s.scores[ranking[0]] !== s.scores[ranking[1]] ? ranking[0] : null;
    return { scores: { ...s.scores }, ranking, winner, summary: { words: Object.fromEntries(s.players.map((p) => [p, s.found[p].length])) } };
  },
  view: (s, p) => ({
    letters: s.letters, centre: s.centre, start: s.start, endsAt: s.endsAt, over: s.over,
    mine: s.found[p] ?? [], scores: s.scores, msg: s.lastMsg[p] ?? '',
    counts: Object.fromEntries(s.players.map((x) => [x, s.found[x].length])),
    // Rivals' words are only revealed after the duel.
    all: s.over ? s.found : undefined,
  }),
};
