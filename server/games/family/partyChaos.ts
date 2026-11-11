import { Engine, GameError } from '../../../shared/engine';
import type { Rng } from '../../../shared/rng';
import { RoundsState, initRounds, advance, answer, roundsView, roundsResult, RoundQ } from './rounds';

/** Micro-game generators. Each returns a question with 4 options and a visual payload. */
const EMOJI_SETS = [
  ['🐶', '🐱'], ['🍎', '🍅'], ['🌕', '🌝'], ['😀', '😃'],
  ['🌵', '🌲'], ['🐟', '🐠'], ['⚽', '🏀'], ['🚗', '🚕'],
];
const DOT_COLOURS = [['Red', '#ff4d5e'], ['Blue', '#3d8bff'], ['Green', '#2fd66b'], ['Yellow', '#ffd23f']];

function opts(rng: Rng, correct: number, spread: number): { options: string[]; correct: number } {
  const set = new Set<number>([correct]);
  while (set.size < 4) {
    const c = correct + (rng.int(spread * 2 + 1) - spread);
    if (c >= 0 && c !== correct) set.add(c);
  }
  const arr = rng.shuffle([...set]);
  return { options: arr.map(String), correct: arr.indexOf(correct) };
}

const GENERATORS: ((rng: Rng) => RoundQ)[] = [
  (rng) => {
    const nums = new Set<number>();
    while (nums.size < 4) nums.add(100 + rng.int(900));
    const arr = [...nums];
    const max = Math.max(...arr);
    return { tag: 'Biggest Number', prompt: 'Tap the BIGGEST number!', options: arr.map(String), correct: arr.indexOf(max) };
  },
  (rng) => {
    const [a, b] = rng.pick(EMOJI_SETS);
    const odd = rng.int(4);
    return { tag: 'Odd One Out', prompt: 'Which one is different?', options: [0, 1, 2, 3].map((i) => (i === odd ? b : a)), correct: odd };
  },
  (rng) => {
    const x = 5 + rng.int(40), y = 5 + rng.int(40), z = rng.int(20);
    const o = opts(rng, x + y - z, 6);
    return { tag: 'Quick Sum', prompt: `${x} + ${y} - ${z} = ?`, ...o };
  },
  (rng) => {
    const target = rng.int(4);
    const dots = Array.from({ length: 16 }, () => rng.int(4));
    const count = dots.filter((d) => d === target).length;
    const o = opts(rng, count, 3);
    return { tag: 'Colour Count', prompt: `How many ${DOT_COLOURS[target][0].toUpperCase()} dots?`, ...o, visual: { dots: dots.map((d) => DOT_COLOURS[d][1]) } };
  },
  (rng) => {
    const start = rng.int(20), step = 2 + rng.int(7);
    const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
    const hole = 1 + rng.int(3);
    const ans = seq[hole];
    const shown = seq.map((v, i) => (i === hole ? '?' : String(v))).join(', ');
    const o = opts(rng, ans, step);
    return { tag: 'Missing Number', prompt: `Find the missing number: ${shown}`, ...o };
  },
  (rng) => {
    const words = ['PLAYZO', 'ROCKET', 'BANANA', 'GALAXY', 'PUZZLE', 'TIGER', 'MANGO', 'PLANET', 'CANDLE', 'SPIRAL'];
    const w = rng.pick(words);
    const rev = w.split('').reverse().join('');
    const wrong = new Set<string>();
    while (wrong.size < 3) {
      const arr = rev.split('');
      const i = rng.int(arr.length - 1);
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      const cand = arr.join('');
      if (cand !== rev) wrong.add(cand);
    }
    const all = rng.shuffle([rev, ...wrong]);
    return { tag: 'Mirror Word', prompt: `Which is "${w}" backwards?`, options: all, correct: all.indexOf(rev) };
  },
  (rng) => {
    const h = 1 + rng.int(12), m = rng.pick([0, 15, 30, 45]);
    const add = rng.pick([15, 30, 45, 60, 90]);
    const total = (h * 60 + m + add) % (12 * 60);
    const fmt = (t: number) => `${Math.floor(t / 60) || 12}:${String(t % 60).padStart(2, '0')}`;
    const correct = fmt(total);
    const set = new Set([correct]);
    while (set.size < 4) set.add(fmt((((total + rng.pick([-30, -15, 15, 30, 60])) % 720) + 720) % 720));
    const all = rng.shuffle([...set]);
    return { tag: 'Clock Hop', prompt: `It is ${fmt(h * 60 + m)}. What time is it ${add} minutes later?`, options: all, correct: all.indexOf(correct) };
  },
  (rng) => {
    const shapes = ['▲', '●', '■', '★'];
    const winner = rng.int(4);
    const counts = [0, 1, 2, 3].map((s) => (s === winner ? 5 + rng.int(2) : 1 + rng.int(4)));
    const grid = rng.shuffle(counts.flatMap((c, s) => Array(c).fill(s)));
    return { tag: 'Shape Swarm', prompt: 'Which shape appears the MOST?', options: shapes, correct: winner, visual: { shapes: grid.map((g) => shapes[g]) } };
  },
];

type A = { type: 'answer'; choice: number } | { type: 'tick' };

export const partyChaos: Engine<RoundsState, A> = {
  id: 'party-chaos', rulesVersion: '1.0.0', mode: 'server', players: { min: 1, max: 8 }, simultaneous: true, timed: true,
  init(o, ctx) {
    const order = ctx.rng.shuffle(GENERATORS.map((_, i) => i));
    const qs = order.slice(0, 8).map((i) => GENERATORS[i](ctx.rng));
    const limit = o.difficulty === 'easy' ? 12_000 : o.difficulty === 'normal' ? 9_000 : 7_000;
    return initRounds(o.players, qs, limit, ctx.now, (o.config?.teams as Record<string, number>) ?? null, 0);
  },
  apply(s, a, ctx) {
    if (a.type === 'tick') { advance(s, ctx.now); return s; }
    if (a.type === 'answer') { answer(s, ctx.player, a.choice, ctx.now, 100); return s; }
    throw new GameError('Unknown action');
  },
  isOver: (s) => s.phase === 'done',
  result: roundsResult,
  view: roundsView,
};
