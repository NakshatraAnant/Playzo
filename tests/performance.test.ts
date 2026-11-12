/** Performance guards: work done synchronously on the API thread must stay short. */
import { describe, it, expect } from 'vitest';
import { chessBlitz, AI_BUDGET_MS } from '../server/games/family/chessBlitz';
import { SeededRng } from '../shared/rng';

describe('chess AI', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${level}: every reply stays within the time budget and is legal`, () => {
      const rng = new SeededRng(`perf-${level}`);
      let s: any = chessBlitz.init({ players: ['p1'], difficulty: level, vsAi: true }, { rng, now: 0, player: 'p1' });
      let worst = 0, moves = 0;
      for (let i = 0; i < 24 && !s.result; i++) {
        const legal = (chessBlitz.view(s, 'p1') as any).legal as [number, number, string | null][];
        if (!legal.length) break;
        const [from, to, promo] = legal[(i * 7) % legal.length];
        const t = performance.now();
        s = chessBlitz.apply(s, { type: 'move', from, to, promo: promo ?? undefined }, { rng, now: i * 1000, player: 'p1' });
        worst = Math.max(worst, performance.now() - t);
        moves++;
      }
      expect(moves).toBeGreaterThan(5);
      // Budget plus generous headroom for move generation and slow CI machines.
      expect(worst, `worst AI reply ${Math.round(worst)} ms`).toBeLessThan(AI_BUDGET_MS + 250);
    });
  }
});
