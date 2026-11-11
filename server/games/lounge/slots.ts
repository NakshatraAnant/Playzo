import { SlotConfig, slotEngine } from './slotsCore';

/** Deterministically spread symbols evenly around a strip (published, fixed layout). */
export function buildStrip(spec: [string, number][]): string[] {
  const len = spec.reduce((t, [, n]) => t + n, 0);
  const out: (string | null)[] = new Array(len).fill(null);
  const sorted = [...spec].sort((a, b) => a[1] - b[1]);
  sorted.forEach(([sym, n], k) => {
    for (let i = 0; i < n; i++) {
      let pos = Math.floor(((i + (k * 0.37) % 1) * len) / n) % len;
      while (out[pos] !== null) pos = (pos + 1) % len;
      out[pos] = sym;
    }
  });
  return out as string[];
}

const LINES_10 = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
];
const LINES_20 = [
  ...LINES_10,
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0],
];

export const SLOT_CONFIGS: Record<string, SlotConfig> = {
  'classic-slots': {
    id: 'classic-slots', rows: 1, mode: 'lines', lines: [[0, 0, 0]],
    reels: [0, 1, 2].map(() => buildStrip([['SEVEN', 2], ['BAR3', 3], ['BAR2', 4], ['BAR', 5], ['CHERRY', 4], ['BLANK', 14]])),
    pays: { SEVEN: { 3: 700 }, BAR3: { 3: 140 }, BAR2: { 3: 70 }, BAR: { 3: 35 }, CHERRY: { 1: 2, 2: 6, 3: 45 } },
    bets: [10, 20, 50, 100, 200, 500],
  },
  'adventure-slots': {
    id: 'adventure-slots', rows: 3, mode: 'lines', lines: LINES_10, wild: 'COMPASS', scatter: { sym: 'IDOL', pays: { 3: 2, 4: 8, 5: 40 } },
    reels: [0, 1, 2, 3, 4].map((r) => buildStrip([['COMPASS', r === 0 ? 1 : 2], ['IDOL', 2], ['MASK', 2], ['SNAKE', 3], ['HAT', 3], ['GEM', 4], ['TORCH', 4], ['ROPE', 5], ['COIN', 5]])),
    pays: { COMPASS: { 5: 800 }, MASK: { 3: 40, 4: 150, 5: 500 }, SNAKE: { 3: 25, 4: 85, 5: 340 }, HAT: { 3: 16, 4: 60, 5: 200 }, GEM: { 3: 10, 4: 30, 5: 100 }, TORCH: { 3: 8, 4: 22, 5: 75 }, ROPE: { 3: 7, 4: 17, 5: 50 }, COIN: { 3: 5, 4: 13, 5: 40 } },
    bets: [10, 20, 50, 100, 200, 500],
  },
  'vault-slots': {
    id: 'vault-slots', rows: 3, mode: 'lines', lines: LINES_20, wild: 'GOLDBAR', scatter: { sym: 'KEY', pays: { 3: 2, 4: 10, 5: 50 } },
    reels: [0, 1, 2, 3, 4].map((r) => buildStrip([['GOLDBAR', r === 0 ? 1 : 2], ['KEY', 2], ['CROWN', 2], ['RUBY', 3], ['PEARL', 3], ['DIAL', 4], ['COINS', 5], ['NOTE', 6], ['LOCK', 6]])),
    pays: { GOLDBAR: { 5: 1800 }, CROWN: { 3: 45, 4: 180, 5: 750 }, RUBY: { 3: 28, 4: 110, 5: 360 }, PEARL: { 3: 22, 4: 75, 5: 275 }, DIAL: { 3: 12, 4: 36, 5: 150 }, COINS: { 3: 9, 4: 28, 5: 90 }, NOTE: { 3: 7, 4: 18, 5: 55 }, LOCK: { 3: 5, 4: 15, 5: 45 } },
    bets: [20, 40, 100, 200, 500, 1000],
  },
  'cosmic-reels': {
    id: 'cosmic-reels', rows: 3, mode: 'ways', waysDivisor: 25, wild: 'STAR',
    reels: [0, 1, 2, 3, 4].map((r) => buildStrip([['STAR', r >= 1 && r <= 3 ? 2 : 0], ['NOVA', 2], ['ALIEN', 3], ['RINGED', 3], ['COMET', 4], ['MOON', 5], ['ROCKET', 5], ['ASTEROID', 6]].filter(([, n]) => (n as number) > 0) as [string, number][])),
    pays: { STAR: {}, NOVA: { 3: 20, 4: 60, 5: 200 }, ALIEN: { 3: 12, 4: 36, 5: 120 }, RINGED: { 3: 10, 4: 28, 5: 90 }, COMET: { 3: 6, 4: 16, 5: 50 }, MOON: { 3: 4, 4: 10, 5: 30 }, ROCKET: { 3: 4, 4: 10, 5: 30 }, ASTEROID: { 3: 2, 4: 6, 5: 20 } },
    bets: [25, 50, 100, 250, 500, 1000],
  },
  'neon-fruit': {
    id: 'neon-fruit', rows: 3, mode: 'lines', lines: [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]], wild: 'NEON', scatter: { sym: 'MELON', pays: { 3: 4 } },
    reels: [0, 1, 2].map(() => buildStrip([['NEON', 1], ['MELON', 2], ['SEVEN', 1], ['BELL', 2], ['GRAPE', 3], ['ORANGE', 4], ['LEMON', 4], ['CHERRY', 4]])),
    pays: { NEON: { 3: 270 }, SEVEN: { 3: 110 }, BELL: { 3: 45 }, GRAPE: { 3: 22 }, ORANGE: { 3: 13 }, LEMON: { 3: 11 }, CHERRY: { 2: 1, 3: 9 } },
    bets: [10, 20, 50, 100, 250, 500],
  },
  'mystery-jackpot': {
    id: 'mystery-jackpot', rows: 1, mode: 'lines', lines: [[0, 0, 0]], jackpot: { oneIn: 4000, mult: 400 },
    reels: [0, 1, 2].map(() => buildStrip([['METEOR', 2], ['PLANET', 3], ['SATURN', 4], ['ORBIT', 5], ['SPARK', 4], ['VOID', 14]])),
    pays: { METEOR: { 3: 600 }, PLANET: { 3: 120 }, SATURN: { 3: 60 }, ORBIT: { 3: 30 }, SPARK: { 1: 2, 2: 6, 3: 40 } },
    bets: [10, 20, 50, 100, 200, 500],
  },
};

export const SLOT_ENGINES = Object.values(SLOT_CONFIGS).map(slotEngine);
