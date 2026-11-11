import { Engine, GameError } from '../../../shared/engine';

export const CRITTERS = [
  ['🦊', 'Fox'], ['🐼', 'Panda'], ['🦉', 'Owl'], ['🐢', 'Turtle'], ['🦄', 'Unicorn'], ['🐙', 'Octopus'],
  ['🦜', 'Parrot'], ['🐨', 'Koala'], ['🦔', 'Hedgehog'], ['🐯', 'Tiger'], ['🦚', 'Peacock'], ['🐧', 'Penguin'],
  ['🦒', 'Giraffe'], ['🐘', 'Elephant'], ['🦈', 'Shark'], ['🐝', 'Bee'],
];
interface MDState {
  players: string[]; cards: number[]; owner: (string | null)[]; up: number[]; pendingHide: number[];
  turn: number; flips: number; pairs: Record<string, number>; over: boolean; lastMatch: boolean | null;
}
type A = { type: 'flip'; i: number };

export const memoryDuel: Engine<MDState, A> = {
  id: 'memory-duel', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 2 },
  init(o, ctx) {
    const pairs = o.difficulty === 'easy' ? 6 : o.difficulty === 'normal' ? 8 : 12;
    const kinds = ctx.rng.shuffle([...Array(CRITTERS.length).keys()]).slice(0, pairs);
    const cards = ctx.rng.shuffle([...kinds, ...kinds]);
    return { players: o.players, cards, owner: cards.map(() => null), up: [], pendingHide: [], turn: 0, flips: 0, pairs: Object.fromEntries(o.players.map((p) => [p, 0])), over: false, lastMatch: null };
  },
  apply(s, a, ctx) {
    if (s.over) throw new GameError('Game over');
    if (s.players[s.turn] !== ctx.player) throw new GameError('Not your turn', 'NOT_YOUR_TURN');
    if (a.type !== 'flip' || !Number.isInteger(a.i) || a.i < 0 || a.i >= s.cards.length) throw new GameError('Bad card');
    if (s.pendingHide.length) s.pendingHide = [];
    if (s.owner[a.i] !== null || s.up.includes(a.i)) throw new GameError('Card already face up');
    s.up.push(a.i);
    s.flips++;
    s.lastMatch = null;
    if (s.up.length === 2) {
      const [x, y] = s.up;
      if (s.cards[x] === s.cards[y]) {
        s.owner[x] = s.owner[y] = ctx.player;
        s.pairs[ctx.player]++;
        s.lastMatch = true;
      } else {
        s.pendingHide = [x, y];
        s.lastMatch = false;
        s.turn = (s.turn + 1) % s.players.length;
      }
      s.up = [];
      if (s.owner.every((o) => o !== null)) s.over = true;
    }
    return s;
  },
  isOver: (s) => s.over,
  turn: (s) => (s.over ? null : s.players[s.turn]),
  result: (s) => {
    const solo = s.players.length === 1;
    if (solo) {
      const total = s.cards.length / 2;
      return { scores: { [s.players[0]]: Math.max(100, 1000 - 10 * (s.flips - 2 * total)) }, winner: s.players[0], summary: { flips: s.flips } };
    }
    const [a, b] = s.players;
    const winner = s.pairs[a] === s.pairs[b] ? null : s.pairs[a] > s.pairs[b] ? a : b;
    return { scores: { [a]: s.pairs[a] * 100, [b]: s.pairs[b] * 100 }, winner, ranking: winner ? [winner, winner === a ? b : a] : [a, b], summary: { pairs: s.pairs } };
  },
  view: (s) => ({
    n: s.cards.length,
    faces: s.cards.map((c, i) => (s.owner[i] !== null || s.up.includes(i) || s.pendingHide.includes(i) ? c : -1)),
    owner: s.owner, up: s.up, pendingHide: s.pendingHide, turn: s.over ? null : s.players[s.turn], players: s.players,
    pairs: s.pairs, flips: s.flips, over: s.over, lastMatch: s.lastMatch,
  }),
};
