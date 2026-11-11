/** Server registry of all 50 game engines. */
import type { Engine, Ctx } from '../../shared/engine';
import { payout } from '../../shared/engine';
import { REPLAY_ENGINES } from '../../shared/games';
import { CATALOGUE } from '../../shared/catalogue';
import { codeBreaker } from './family/codeBreaker';
import { wordDuel } from './family/wordDuel';
import { triviaClash } from './family/triviaClash';
import { emojiDecode } from './family/emojiDecode';
import { wordLadder } from './family/wordLadder';
import { geoSprint } from './family/geoSprint';
import { factOrFiction } from './family/factOrFiction';
import { territoryWars } from './family/territoryWars';
import { hexConquest } from './family/hexConquest';
import { connectFive } from './family/connectFive';
import { chessBlitz } from './family/chessBlitz';
import { memoryDuel } from './family/memoryDuel';
import { partyChaos } from './family/partyChaos';
import { euRoulette, usRoulette, frRoulette } from './lounge/roulette';
import { blackjack, blackjackDuel } from './lounge/blackjack';
import { baccarat, sicBo } from './lounge/baccaratSicbo';
import { andarBahar, dragonTiger, threeCardPoker, videoPoker } from './lounge/tableCards';
import { holdem, omaha, teenPatti } from './lounge/poker';
import { SLOT_ENGINES } from './lounge/slots';
import { plinko, diceArena, hiLo, mines, crashFlight } from './lounge/instant';

/** Close-out rules for rounds left in progress (published in docs/LOUNGE_MATH.md). */
const closeOut: Record<string, (e: Engine, s: any, ctx: Ctx) => any> = {
  blackjack: (e, s, ctx) => { while (s.phase === 'player') s = e.apply(s, { type: 'stand' }, ctx); return s; },
  'blackjack-duel': (e, s, ctx) => (s.phase === 'player' ? e.apply(s, { type: 'stand' }, ctx) : s),
  'three-card-poker': (e, s, ctx) => (s.phase === 'decide' ? e.apply(s, { type: 'fold' }, ctx) : s),
  'video-poker': (e, s, ctx) => (s.phase === 'hold' ? e.apply(s, { type: 'draw', hold: [true, true, true, true, true] }, ctx) : s),
  'hi-lo': (e, s, ctx) => {
    if (!s.active) return s;
    if (s.steps > 0) return e.apply(s, { type: 'bank' }, ctx);
    payout(s, s.stakeAmt, `r${s.round}-refund`); s.active = false; return s;
  },
  mines: (e, s, ctx) => {
    if (!s.active) return s;
    if (s.revealed.length > 0) return e.apply(s, { type: 'bank' }, ctx);
    payout(s, s.stakeAmt, `r${s.round}-refund`); s.active = false; return s;
  },
  'crash-flight': (e, s, ctx) => {
    if (s.phase !== 'flying') return s;
    if (ctx.now < s.start) { payout(s, s.stakeAmt, `r${s.round}-refund`); s.phase = 'done'; return s; }
    return e.apply(s, { type: 'bank' }, ctx);
  },
};

const ALL: Engine[] = [
  ...Object.values(REPLAY_ENGINES),
  codeBreaker, wordDuel, triviaClash, emojiDecode, wordLadder, geoSprint, factOrFiction, territoryWars, hexConquest, connectFive, chessBlitz, memoryDuel, partyChaos,
  euRoulette, usRoulette, frRoulette, blackjack, blackjackDuel, baccarat, sicBo, andarBahar, dragonTiger, threeCardPoker, videoPoker, holdem, omaha, teenPatti,
  ...SLOT_ENGINES, plinko, diceArena, hiLo, mines, crashFlight,
] as Engine[];

export const ENGINES: Record<string, Engine> = {};
for (const e of ALL) {
  const co = closeOut[e.id] as ((e: Engine, s: any, ctx: Ctx) => any) | undefined;
  ENGINES[e.id] = co && typeof e.finalize !== 'function' ? { ...e, finalize: (s, ctx) => co(e, s, ctx) } : e;
}

// Integrity: every catalogue game must have exactly one engine.
const missing = CATALOGUE.filter((g) => !ENGINES[g.id]).map((g) => g.id);
const extra = Object.keys(ENGINES).filter((id) => !CATALOGUE.some((g) => g.id === id));
if (missing.length || extra.length) throw new Error(`Engine registry mismatch. Missing: ${missing.join(',')} Extra: ${extra.join(',')}`);
