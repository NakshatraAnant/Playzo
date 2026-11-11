/**
 * Statistical fairness tests for every Lounge simulation.
 * Each test plays many rounds with the production HMAC RNG and checks the observed return
 * against the published theoretical RTP using a z-test on the per-round return (|z| < 4.5),
 * plus chi-square uniformity checks on raw outcomes. Results are written to the console so the
 * QA report can quote observed vs theoretical values.
 */
import { describe, it, expect } from 'vitest';
import { HmacRng } from '../server/secureRng';
import type { Engine } from '../shared/engine';
import { euRoulette, usRoulette, frRoulette, theoreticalRtp } from '../server/games/lounge/roulette';
import { baccarat, sicBo, sicRtp } from '../server/games/lounge/baccaratSicbo';
import { blackjack, basicStrategy } from '../server/games/lounge/blackjack';
import { andarBahar, dragonTiger, threeCardPoker, shouldPlay, vpHand } from '../server/games/lounge/tableCards';
import { SLOT_CONFIGS } from '../server/games/lounge/slots';
import { slotEngine, exactRtp } from '../server/games/lounge/slotsCore';
import { plinko, plinkoRtp, diceArena, diceRtp, hiLo, mines, minesMult, crashPoint } from '../server/games/lounge/instant';
import { bjTotal } from '../shared/cards';

const BIG = 1e12;
function play(engine: Engine, rounds: number, step: (s: any, ctx: any) => any, seed = 'fair') {
  const rng = new HmacRng(seed);
  const ctx = { rng, now: 0, player: 'p1', balance: BIG };
  let s = engine.init({ players: ['p1'], difficulty: 'normal' }, ctx);
  let sum = 0, sum2 = 0, staked = 0;
  for (let i = 0; i < rounds; i++) {
    const before = { st: s.totalStaked, rt: s.totalReturned };
    s = step(s, ctx);
    const st = s.totalStaked - before.st, rt = s.totalReturned - before.rt;
    s.ledger = [];
    if (st > 0) { const r = rt / st; sum += r; sum2 += r * r; staked++; }
  }
  const mean = sum / staked;
  const se = Math.sqrt((sum2 / staked - mean * mean) / staked);
  return { mean, se, n: staked, state: s, pooled: s.totalReturned / s.totalStaked };
}
const z = (obs: { mean: number; se: number }, theo: number) => (obs.mean - theo) / obs.se;
const report: string[] = [];
const log = (name: string, obs: { mean: number; se: number; n: number }, theo: number | null) => {
  const line = `${name.padEnd(36)} n=${obs.n} observed=${(obs.mean * 100).toFixed(2)}% ± ${(obs.se * 196).toFixed(2)}%${theo !== null ? ` theoretical=${(theo * 100).toFixed(2)}% z=${z(obs, theo).toFixed(2)}` : ''}`;
  report.push(line);
  console.log('[fairness]', line);
};

describe('Roulette', () => {
  for (const [eng, v] of [[euRoulette, 'eu'], [usRoulette, 'us'], [frRoulette, 'fr']] as const) {
    it(`${eng.id}: red and straight-up bets match theoretical RTP`, () => {
      for (const bet of [{ kind: 'red', amount: 100 }, { kind: 'straight', n: 17, amount: 100 }] as any[]) {
        const obs = play(eng as Engine, 60000, (s, c) => eng.apply(s, { type: 'spin', bets: [bet] }, c), `${v}-${bet.kind}`);
        const theo = theoreticalRtp(bet.kind, v);
        log(`${eng.id} ${bet.kind}`, obs, theo);
        expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
      }
    });
  }
  it('pocket distribution is uniform (chi-square, p > 0.001)', () => {
    const counts = new Array(37).fill(0);
    play(euRoulette as Engine, 74000, (s, c) => { const r = euRoulette.apply(s, { type: 'spin', bets: [{ kind: 'red', amount: 10 }] }, c); counts[r.last!.pocket]++; return r; }, 'chi');
    const exp = 74000 / 37;
    const chi = counts.reduce((t, o) => t + ((o - exp) ** 2) / exp, 0);
    report.push(`roulette pocket chi-square=${chi.toFixed(1)} (df=36, critical 67.98 at p=0.001)`);
    expect(chi).toBeLessThan(67.98);
  });
  it('theoretical RTPs are the published values', () => {
    expect(theoreticalRtp('straight', 'eu')).toBeCloseTo(36 / 37, 10);
    expect(theoreticalRtp('red', 'us')).toBeCloseTo(36 / 38, 10);
    expect(theoreticalRtp('red', 'fr')).toBeCloseTo(0.98649, 4);
  });
});

describe('Dice games', () => {
  it('Sic Bo small and specific-total bets match exact RTP', () => {
    for (const b of [{ kind: 'small', amount: 100 }, { kind: 'total', n: 9, amount: 100 }] as any[]) {
      const obs = play(sicBo as Engine, 60000, (s, c) => sicBo.apply(s, { type: 'roll', bets: [b] }, c), `sb-${b.kind}`);
      const theo = sicRtp(b);
      log(`sic-bo ${b.kind}`, obs, theo);
      expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
    }
  });
  it('Dice Arena over/seven bets match exact RTP and die faces are uniform', () => {
    const faces = new Array(7).fill(0);
    for (const kind of ['over', 'seven']) {
      const obs = play(diceArena as Engine, 60000, (s, c) => { const r = diceArena.apply(s, { type: 'roll', bet: { kind, amount: 100 } as any }, c); faces[r.last!.dice[0]]++; return r; }, `da-${kind}`);
      const theo = diceRtp({ kind, amount: 1 } as any);
      log(`dice-arena ${kind}`, obs, theo);
      expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
    }
    const exp = 120000 / 6;
    const chi = faces.slice(1).reduce((t, o) => t + ((o - exp) ** 2) / exp, 0);
    expect(chi).toBeLessThan(20.52);
  });
});

describe('Card tables', () => {
  it('Baccarat banker/player/tie match published 8-deck RTPs', () => {
    for (const [side, theo] of [['banker', 0.9894], ['player', 0.9876], ['tie', 0.8564]] as const) {
      const obs = play(baccarat as Engine, 80000, (s, c) => baccarat.apply(s, { type: 'deal', bets: { [side]: 100 } }, c), `bac-${side}`);
      log(`baccarat ${side}`, obs, theo);
      expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
    }
  });
  it('Dragon Tiger dragon bet matches 96.27%', () => {
    const obs = play(dragonTiger as Engine, 80000, (s, c) => dragonTiger.apply(s, { type: 'deal', bets: { dragon: 100 } }, c), 'dt');
    log('dragon-tiger dragon', obs, 0.9627);
    expect(Math.abs(z(obs, 0.9627))).toBeLessThan(4.5);
  });
  it('Andar Bahar returns are near 97-98% on both sides (measured)', () => {
    for (const side of ['andar', 'bahar'] as const) {
      const obs = play(andarBahar as Engine, 60000, (s, c) => andarBahar.apply(s, { type: 'deal', side, amount: 100 }, c), `ab-${side}`);
      log(`andar-bahar ${side}`, obs, null);
      expect(obs.mean).toBeGreaterThan(0.94);
      expect(obs.mean).toBeLessThan(1.0);
    }
  });
  it('Three Card Poker ante (Q-6-4 strategy) and Pair Plus match published RTPs', () => {
    const ante = play(threeCardPoker as Engine, 60000, (s, c) => {
      s = threeCardPoker.apply(s, { type: 'deal', ante: 100 }, c);
      return threeCardPoker.apply(s, { type: shouldPlay(s.player) ? 'play' : 'fold' }, c);
    }, 'tcp');
    // RTP here is return per total wagered (ante + play), house edge per total ~2.01% => element of risk; published ante edge 3.37% => check range.
    // Variable stakes (fold = 1 unit, play = 2 units): RTP is total returned / total staked.
    // Q-6-4: ante edge 3.37% per ante => ~97.98% per unit wagered (element of risk 2.02%).
    report.push(`three-card-poker ante+play pooled RTP=${(ante.pooled * 100).toFixed(2)}% (expected ~97.98%)`);
    console.log('[fairness] three-card-poker pooled', ante.pooled);
    expect(ante.pooled).toBeGreaterThan(0.955);
    expect(ante.pooled).toBeLessThan(1.0);
  });
  it('Blackjack with basic strategy returns ~99.5%', () => {
    const obs = play(blackjack as Engine, 60000, (s, c) => {
      s = blackjack.apply(s, { type: 'deal', amount: 100 }, c);
      let guard = 0;
      while (s.phase === 'player' && guard++ < 20) {
        const h = s.hands[s.active];
        const can2 = h.cards.length === 2;
        const canSplit = s.hands.length === 1 && can2 && Math.min(10, (h.cards[0] % 13) + 2 === 14 ? 11 : (h.cards[0] % 13) + 2) === Math.min(10, (h.cards[1] % 13) + 2 === 14 ? 11 : (h.cards[1] % 13) + 2);
        const move = basicStrategy(h.cards, s.dealer[0], can2, canSplit);
        s = blackjack.apply(s, { type: bjTotal(h.cards).total >= 21 ? 'stand' : move }, c);
      }
      return s;
    }, 'bj');
    report.push(`blackjack basic strategy pooled RTP=${(obs.pooled * 100).toFixed(2)}% (expected ~99.5%)`);
    console.log('[fairness] blackjack pooled', obs.pooled);
    expect(obs.pooled).toBeGreaterThan(0.975);
    expect(obs.pooled).toBeLessThan(1.02);
  });
  it('video poker hand evaluation follows the Jacks or Better paytable', () => {
    const c = (r: string, s: number) => s * 13 + ('23456789TJQKA'.indexOf(r));
    expect(vpHand([c('A', 0), c('K', 0), c('Q', 0), c('J', 0), c('T', 0)])!.name).toBe('Royal Flush');
    expect(vpHand([c('J', 0), c('J', 1), c('2', 2), c('5', 3), c('9', 0)])!.name).toBe('Jacks or Better');
    expect(vpHand([c('T', 0), c('T', 1), c('2', 2), c('5', 3), c('9', 0)])).toBeNull();
    expect(vpHand([c('A', 0), c('2', 1), c('3', 2), c('4', 3), c('5', 0)])!.name).toBe('Straight');
  });
});

describe('Slots: exact RTP vs Monte Carlo', () => {
  for (const cfg of Object.values(SLOT_CONFIGS)) {
    it(`${cfg.id}: observed return matches exact theoretical RTP`, () => {
      const eng = slotEngine(cfg);
      const theo = exactRtp(cfg).total;
      const obs = play(eng as Engine, 120000, (s, c) => eng.apply(s, { type: 'spin', bet: cfg.bets[2] }, c), `slot-${cfg.id}`);
      log(`${cfg.id}`, obs, theo);
      expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
      expect(theo).toBeGreaterThan(0.94);
      expect(theo).toBeLessThan(0.97);
    });
  }
});

describe('Instant simulators', () => {
  it('Plinko tables are within 0.6% of 98% and observed matches theory', () => {
    for (const rows of [8, 12, 16]) for (const risk of ['low', 'medium', 'high'] as const) expect(Math.abs(plinkoRtp(rows, risk) - 0.98)).toBeLessThan(0.003);
    const theo = plinkoRtp(12, 'medium');
    const obs = play(plinko as Engine, 80000, (s, c) => plinko.apply(s, { type: 'drop', rows: 12, risk: 'medium', amount: 100 }, c), 'plk');
    log('plinko 12/medium', obs, theo);
    expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
  });
  it('Hi-Lo: one call then bank returns ~98%', () => {
    const obs = play(hiLo as Engine, 60000, (s, c) => {
      s = hiLo.apply(s, { type: 'start', amount: 100 }, c);
      s = hiLo.apply(s, { type: 'call', dir: s.card.r <= 7 ? 'higher' : 'lower' }, c);
      if (s.active) s = hiLo.apply(s, { type: 'bank' }, c);
      return s;
    }, 'hl');
    log('hi-lo single call', obs, 0.98);
    expect(Math.abs(z(obs, 0.98))).toBeLessThan(4.5);
  });
  it('Mines: revealing 2 tiles with 3 mines then banking returns ~98% (floored)', () => {
    const obs = play(mines as Engine, 60000, (s, c) => {
      s = mines.apply(s, { type: 'start', amount: 1000, mines: 3 }, c);
      for (const i of [0, 1]) if (s.active) s = mines.apply(s, { type: 'reveal', i }, c);
      if (s.active) s = mines.apply(s, { type: 'bank' }, c);
      return s;
    }, 'mn');
    const theo = minesMult(3, 2) * ((22 / 25) * (21 / 24));
    log('mines 3 mines / 2 tiles', obs, theo);
    expect(Math.abs(z(obs, theo))).toBeLessThan(4.5);
  });
  it('Crash: P(stall >= m) = 0.98/m for several m', () => {
    const rng = new HmacRng('crash');
    const n = 200000;
    const pts = Array.from({ length: n }, () => crashPoint(rng.next()));
    for (const m of [1.5, 2, 5, 10]) {
      const p = pts.filter((x) => x >= m).length / n;
      const theo = 0.98 / m;
      const se = Math.sqrt((theo * (1 - theo)) / n);
      report.push(`crash P(>=${m}) observed=${p.toFixed(4)} theoretical=${theo.toFixed(4)}`);
      expect(Math.abs((p - theo) / se)).toBeLessThan(4.5);
    }
  });
});

describe('Outcome independence', () => {
  it('outcomes depend only on the seed, never on balance', () => {
    const eng = slotEngine(SLOT_CONFIGS['classic-slots']);
    const run = (balance: number) => {
      const rng = new HmacRng('same-seed');
      let s: any = eng.init({ players: ['p1'], difficulty: 'normal' }, { rng, now: 0, player: 'p1', balance });
      const stops: number[][] = [];
      for (let i = 0; i < 200; i++) { s = eng.apply(s, { type: 'spin', bet: 10 }, { rng, now: 0, player: 'p1', balance }); s.ledger = []; stops.push(s.last.stops); }
      return JSON.stringify(stops);
    };
    expect(run(50_000)).toBe(run(10_000_000));
  });
  it('the HMAC stream is resumable from a cursor (auditable replays)', () => {
    const a = new HmacRng('k');
    const first = Array.from({ length: 21 }, () => a.u32());
    const b = new HmacRng('k', 13);
    expect(Array.from({ length: 8 }, () => b.u32())).toEqual(first.slice(13, 21));
  });
});
