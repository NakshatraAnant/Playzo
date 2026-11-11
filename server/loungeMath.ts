/** Published mathematics for every Lounge simulation, computed from the live engine code. */
import { theoreticalRtp, BetKind, PAYS } from './games/lounge/roulette';
import { sicRtp, TOTAL_PAYS, SicBet } from './games/lounge/baccaratSicbo';
import { SLOT_CONFIGS } from './games/lounge/slots';
import { exactRtp } from './games/lounge/slotsCore';
import { PLINKO_TABLES, PLINKO_ROWS, plinkoRtp, binom, diceRtp, DICE_PAYS, minesMult, GROWTH } from './games/lounge/instant';
import { VP_TABLE, ANTE_BONUS, PAIR_PLUS, AB_PAYS } from './games/lounge/tableCards';

const pct = (x: number) => Math.round(x * 100000) / 1000;

export function loungeMath(id: string): Record<string, unknown> | null {
  if (id.endsWith('roulette')) {
    const v = id.startsWith('eu') ? 'eu' : id.startsWith('us') ? 'us' : 'fr';
    return {
      kind: 'roulette', pockets: v === 'us' ? 38 : 37, note: v === 'fr' ? 'La Partage: half of even-money bets returned on zero.' : undefined,
      bets: (Object.keys(PAYS) as BetKind[]).map((k) => ({ bet: k, pays: `${PAYS[k]}:1`, rtp: pct(theoreticalRtp(k, v)) })),
    };
  }
  if (SLOT_CONFIGS[id]) {
    const c = SLOT_CONFIGS[id];
    const r = exactRtp(c);
    const counts = c.reels.map((strip) => strip.reduce<Record<string, number>>((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {}));
    return { kind: 'slot', rtp: pct(r.total), breakdown: { lines: pct(r.base), scatter: pct(r.scatter), jackpot: pct(r.jackpot) }, layout: `${c.reels.length}x${c.rows}`, mode: c.mode, lines: c.lines?.length, paytable: c.pays, scatter: c.scatter ?? null, wild: c.wild ?? null, jackpot: c.jackpot ?? null, reelCounts: counts, reelLengths: c.reels.map((x) => x.length) };
  }
  switch (id) {
    case 'sic-bo': {
      const bets: [string, SicBet][] = [['Small', { kind: 'small', amount: 1 }], ['Big', { kind: 'big', amount: 1 }], ['Any triple (30:1)', { kind: 'anyTriple', amount: 1 }], ['Specific double (10:1)', { kind: 'double', n: 3, amount: 1 }], ['Specific triple (150:1)', { kind: 'triple', n: 3, amount: 1 }], ['Single number (1-3:1)', { kind: 'single', n: 3, amount: 1 }]];
      return { kind: 'sicbo', outcomes: 216, bets: bets.map(([name, b]) => ({ bet: name, rtp: pct(sicRtp(b)) })), totals: Object.entries(TOTAL_PAYS).map(([t, p]) => ({ total: +t, pays: `${p}:1`, rtp: pct(sicRtp({ kind: 'total', n: +t, amount: 1 })) })) };
    }
    case 'plinko':
      return { kind: 'plinko', tables: PLINKO_ROWS.flatMap((n) => (['low', 'medium', 'high'] as const).map((risk) => ({ rows: n, risk, multipliers: PLINKO_TABLES[`${n}-${risk}`], probabilities: Array.from({ length: n + 1 }, (_, k) => binom(n, k) / Math.pow(2, n)), rtp: pct(plinkoRtp(n, risk)) }))) };
    case 'dice-arena':
      return { kind: 'dice', bets: [{ bet: 'Under 7', pays: `${DICE_PAYS.under}x`, rtp: pct(diceRtp({ kind: 'under', amount: 1 })) }, { bet: 'Over 7', pays: `${DICE_PAYS.over}x`, rtp: pct(diceRtp({ kind: 'over', amount: 1 })) }, { bet: 'Exactly 7', pays: `${DICE_PAYS.seven}x`, rtp: pct(diceRtp({ kind: 'seven', amount: 1 })) }, { bet: 'Specific double', pays: `${DICE_PAYS.double}x`, rtp: pct(diceRtp({ kind: 'double', n: 4, amount: 1 })) }] };
    case 'hi-lo': return { kind: 'hilo', rule: 'Each correct call multiplies by 0.98 / P(win). Ranks 1-13 drawn with replacement; ties lose.', rtp: 98 };
    case 'mines': return { kind: 'mines', rule: 'Multiplier after k safe tiles = 0.98 x product (25-i)/(25-m-i).', rtp: 98, examples: [1, 3, 5, 10].map((m) => ({ mines: m, after: [1, 2, 3, 5].map((k) => (k <= 25 - m ? minesMult(m, k) : null)) })) };
    case 'crash-flight': return { kind: 'crash', rule: 'P(stall >= m) = 0.98/m. Multiplier(t) = e^(g t).', growthPerMs: GROWTH, rtp: 98 };
    case 'baccarat': return { kind: 'table', bets: [{ bet: 'Banker (0.95:1)', rtp: 98.94 }, { bet: 'Player (1:1)', rtp: 98.76 }, { bet: 'Tie (8:1)', rtp: 85.64 }], source: 'Standard 8-deck Punto Banco results; verified by simulation in tests.' };
    case 'dragon-tiger': return { kind: 'table', bets: [{ bet: 'Dragon / Tiger (1:1, half back on tie)', rtp: 96.27 }, { bet: 'Tie (8:1)', rtp: 89.64 }], source: '8-deck values; verified by simulation in tests.' };
    case 'andar-bahar': return { kind: 'table', bets: [{ bet: `Andar (${AB_PAYS.andar - 1}:1)` }, { bet: `Bahar (${AB_PAYS.bahar - 1}:1)` }], rtp: 'approximately 97-98% per side; measured by simulation in tests (see QA_TEST_REPORT.md)' };
    case 'blackjack': return { kind: 'table', rules: '6 decks, S17, 3:2, DAS, one split, peek', rtp: 'about 99.5% with basic strategy (simulation in tests)' };
    case 'blackjack-duel': return { kind: 'table', rules: 'Rival hits below 17. Both bust = push. Natural 21 pays 3:2.', rtp: 'depends on decisions; simulation for a hit-below-17 strategy in tests' };
    case 'three-card-poker': return { kind: 'table', anteBonus: ANTE_BONUS, pairPlus: PAIR_PLUS, rtp: 'Ante/Play ~96.6% (Q-6-4 strategy); Pair Plus ~97.7%' };
    case 'video-poker': return { kind: 'vp', paytable: VP_TABLE, royalAtMax: 800, rtp: 99.54, note: '99.54% requires optimal hold strategy at 5 coins' };
    case 'holdem': case 'omaha': case 'teen-patti': return { kind: 'pvp', rtp: null, note: 'Player-versus-bot table with no rake. Bots use documented strategies and never see your cards.' };
  }
  return null;
}
