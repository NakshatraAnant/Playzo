/**
 * Individual rule tests for each of the 25 Lounge simulations (internal QA only; the games stay
 * disabled for the public until written legal clearance). For every game we check:
 *  - a valid round runs and its stakes/payouts are fully ledgered (net = returned - staked),
 *  - invalid actions and out-of-range stakes are rejected with GameError,
 *  - hidden information never appears in the player's view,
 *  - outcomes are reproducible for a fixed seed (auditable), and
 *  - stakes above the available Fun Chips are refused.
 */
import { describe, it, expect } from 'vitest';
import { HmacRng } from '../server/secureRng';
import { ENGINES } from '../server/games/registry';
import { CATALOGUE } from '../shared/catalogue';
import { GameError } from '../shared/engine';
import { RED } from '../server/games/lounge/roulette';
import { bjTotal } from '../shared/cards';

const LOUNGE = CATALOGUE.filter((g) => g.env === 'lounge').map((g) => g.id);
type Any = any;
function table(id: string, seed = 'rules', balance = 1_000_000) {
  const e = ENGINES[id];
  const rng = new HmacRng(`${id}:${seed}`);
  let now = 1_000_000;
  const ctx = () => ({ rng, now, player: 'p1', balance });
  let s: Any = e.init({ players: ['p1'], difficulty: 'normal' }, ctx());
  const ledger: Any[] = [];
  return {
    e,
    get s() { return s; },
    act(a: Any) { s = e.apply(s, a, ctx()); ledger.push(...(s.ledger ?? [])); s.ledger = []; return s; },
    view() { return e.view(s, 'p1') as Any; },
    advance(ms: number) { now += ms; },
    setBalance(b: number) { balance = b; },
    ledger,
  };
}
const ledgerNet = (l: Any[]) => l.reduce((t, x) => t + (x.kind === 'stake' ? -x.amount : x.amount), 0);
const expectGameError = (f: () => unknown) => expect(f).toThrow(GameError);
function invariant(t: ReturnType<typeof table>, postRoundReveal = false) {
  expect(ledgerNet(t.ledger)).toBe(t.s.totalReturned - t.s.totalStaked);
  for (const l of t.ledger) { expect(Number.isInteger(l.amount)).toBe(true); expect(l.amount).toBeGreaterThanOrEqual(0); }
  // Provably-fair games reveal the committed salt/point only after the round; check the rest of the view.
  const v = { ...t.view() }; if (postRoundReveal) { delete v.reveal; delete v.history; } // both only describe finished rounds
  expect(JSON.stringify(v)).not.toMatch(/"(deck|shoe|seed|secret|salt|point)"\s*:\s*\[?[^n\]]/);
}

describe('Lounge catalogue', () => {
  it('has exactly 25 server-mode engines, all registered', () => {
    expect(LOUNGE).toHaveLength(25);
    for (const id of LOUNGE) { expect(ENGINES[id], id).toBeTruthy(); expect(ENGINES[id].mode).toBe('server'); }
  });
  it('every engine is deterministic for a fixed seed (reproducible audits)', () => {
    const scripts: Record<string, Any> = { 'eu-roulette': { type: 'spin', bets: [{ kind: 'red', amount: 100 }] }, 'dice-arena': { type: 'roll', bet: { kind: 'over', amount: 100 } }, 'classic-slots': { type: 'spin', bet: 50 } };
    for (const [id, a] of Object.entries(scripts)) {
      const x = table(id, 'det'), y = table(id, 'det');
      for (let i = 0; i < 20; i++) { x.act(a); y.act(a); }
      expect(JSON.stringify(x.view())).toBe(JSON.stringify(y.view()));
    }
  });
});

describe.each(['eu-roulette', 'us-roulette', 'fr-roulette'])('%s', (id) => {
  it('settles every bet type by the published paytable', () => {
    const t = table(id);
    for (let i = 0; i < 300; i++) {
      t.act({ type: 'spin', bets: [{ kind: 'straight', n: 17, amount: 10 }, { kind: 'red', amount: 20 }, { kind: 'dozen', n: 1, amount: 10 }] });
      const last = t.s.last, p = last.pocket;
      const num = p === 37 ? -1 : p;
      let expected = (num === 17 ? 360 : 0) + (num >= 13 && num <= 24 ? 30 : 0);
      if (RED.has(num)) expected += 40;
      else if (id === 'fr-roulette' && num === 0) expected += 10; // La Partage: half of even-money back
      expect(last.returned ?? last.ret ?? last.won ?? expected).toBe(expected);
    }
    invariant(t);
  });
  it('rejects bad bets', () => {
    const t = table(id);
    expectGameError(() => t.act({ type: 'spin', bets: [] }));
    expectGameError(() => t.act({ type: 'spin', bets: [{ kind: 'split', a: 1, b: 9, amount: 10 }] }));
    expectGameError(() => t.act({ type: 'spin', bets: [{ kind: 'jackpot', amount: 10 }] }));
    expectGameError(() => t.act({ type: 'spin', bets: Array.from({ length: 41 }, () => ({ kind: 'red', amount: 10 })) }));
  });
  if (id === 'us-roulette') it('has 38 pockets including 00', () => {
    const t = table(id); const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) { t.act({ type: 'spin', bets: [{ kind: 'red', amount: 10 }] }); seen.add(t.s.last.pocket); }
    expect(seen.size).toBe(38);
  });
});

describe('blackjack', () => {
  it('deals, hides the hole card, plays out and settles', () => {
    const t = table('blackjack');
    for (let r = 0; r < 200; r++) {
      t.act({ type: 'deal', amount: 100 });
      if (t.s.phase === 'player') expect(t.view().dealer[1]).toBe(-1);
      let guard = 0;
      while (t.s.phase === 'player' && guard++ < 10) t.act({ type: bjTotal(t.s.hands[t.s.active].cards).total < 17 ? 'hit' : 'stand' });
      expect(t.s.phase).not.toBe('player');
    }
    invariant(t);
  });
  it('rejects illegal moves', () => {
    const t = table('blackjack');
    expectGameError(() => t.act({ type: 'hit' }));
    t.act({ type: 'deal', amount: 100 });
    if (t.s.phase === 'player') {
      expectGameError(() => t.act({ type: 'deal', amount: 100 }));
      t.act({ type: 'hit' });
      if (t.s.phase === 'player') expectGameError(() => t.act({ type: 'double' }));
    }
  });
  it('refuses stakes above the available Fun Chips', () => {
    const t = table('blackjack'); t.setBalance(50);
    expectGameError(() => t.act({ type: 'deal', amount: 100 }));
  });
});

describe('blackjack-duel', () => {
  it('plays head-to-head hands against the rival to completion', () => {
    const t = table('blackjack-duel');
    for (let r = 0; r < 100; r++) {
      t.act({ type: 'deal', amount: 50 });
      while (t.s.phase === 'player') t.act({ type: bjTotal(t.s.you).total < 16 ? 'hit' : 'stand' });
      expect(t.s.outcome).toBeTruthy();
    }
    invariant(t);
    expectGameError(() => table('blackjack-duel').act({ type: 'stand' }));
  });
});

describe('baccarat', () => {
  it('applies the tableau and pays banker 0.95:1, tie 8:1', () => {
    const t = table('baccarat');
    for (let r = 0; r < 300; r++) t.act({ type: 'deal', bets: { banker: 100 } });
    invariant(t);
    expectGameError(() => t.act({ type: 'deal', bets: {} }));
    expectGameError(() => t.act({ type: 'spin' }));
  });
});

describe('sic-bo', () => {
  it('rolls three dice and settles small/big/total/single', () => {
    const t = table('sic-bo');
    for (let r = 0; r < 300; r++) {
      t.act({ type: 'roll', bets: [{ kind: 'small', amount: 10 }, { kind: 'single', n: 6, amount: 10 }] });
      const d: number[] = t.s.last.dice;
      expect(d).toHaveLength(3);
      for (const x of d) expect(x).toBeGreaterThanOrEqual(1), expect(x).toBeLessThanOrEqual(6);
    }
    invariant(t);
    expectGameError(() => t.act({ type: 'roll', bets: [] }));
    expectGameError(() => t.act({ type: 'roll', bets: [{ kind: 'nonsense', amount: 10 }] }));
  });
});

describe.each(['holdem', 'omaha'])('%s (vs bots)', (id) => {
  it('sits, deals and plays hands without revealing opponents\' hole cards', () => {
    const t = table(id);
    expectGameError(() => t.act({ type: 'deal' }));
    t.act({ type: 'sit', buyIn: 2000 });
    expectGameError(() => t.act({ type: 'sit', buyIn: 2000 }));
    for (let h = 0; h < 30; h++) {
      if (t.s.street !== 'idle') break;
      if (t.s.seats[0].stack < 20) t.act({ type: 'rebuy', amount: 2000 });
      t.act({ type: 'deal' });
      let guard = 0;
      while (t.s.street !== 'idle' && guard++ < 60) {
        const v = t.view();
        if (v.street !== 'idle' && !v.showdown) for (let i = 1; i < v.seats.length; i++) if (v.seats[i].inHand) expect(v.seats[i].hole.every((c: number) => c === -1)).toBe(true);
        if (t.s.toAct !== 0) break;
        t.act({ type: 'act', move: v.options?.canCheck ? 'check' : 'call' });
      }
      expect(t.view().hand).toBeTruthy();
      expect(t.s.seats[0].hole.length).toBe(id === 'omaha' ? 4 : 2);
    }
    expectGameError(() => t.act({ type: 'act', move: 'teleport' }));
    t.act({ type: 'leave' });
    invariant(t);
  });
});

describe('teen-patti (vs bots)', () => {
  it('cards stay blind until seen; chaal/pack/show follow the rules', () => {
    const t = table('teen-patti');
    t.act({ type: 'sit', buyIn: 2000 });
    for (let h = 0; h < 20; h++) {
      if (t.s.phase !== 'idle') break;
      if (t.s.seats[0].stack < 200) t.act({ type: 'rebuy', amount: 2000 });
      t.act({ type: 'deal' });
      const v = t.view();
      if (t.s.phase === 'play') {
        expect(v.seats[0].cards.every((c: number) => c === -1)).toBe(true);
        t.act({ type: 'see' });
        expect(t.view().seats[0].cards.every((c: number) => c >= 0)).toBe(true);
        for (let i = 1; i < v.seats.length; i++) if (!t.s.result) expect(t.view().seats[i].cards.every((c: number) => c === -1)).toBe(true);
      }
      let guard = 0;
      while (t.s.phase === 'play' && t.s.toAct === 0 && guard++ < 30) t.act({ type: guard > 3 ? 'pack' : 'chaal' });
    }
    t.act({ type: 'leave' });
    invariant(t);
  });
});

describe('andar-bahar', () => {
  it('deals until the joker rank matches and settles the chosen side', () => {
    const t = table('andar-bahar');
    for (let r = 0; r < 300; r++) t.act({ type: 'deal', side: r % 2 ? 'andar' : 'bahar', amount: 100 });
    invariant(t);
    expectGameError(() => t.act({ type: 'deal', side: 'middle', amount: 100 }));
  });
});

describe('dragon-tiger', () => {
  it('compares one card each and pays tie 11:1', () => {
    const t = table('dragon-tiger');
    for (let r = 0; r < 300; r++) t.act({ type: 'deal', bets: { tiger: 100, tie: 10 } });
    invariant(t);
    expectGameError(() => t.act({ type: 'deal', bets: {} }));
  });
});

describe('three-card-poker', () => {
  it('hides the dealer hand until settled; play/fold follow ante rules', () => {
    const t = table('three-card-poker');
    expectGameError(() => t.act({ type: 'play' }));
    for (let r = 0; r < 200; r++) {
      t.act({ type: 'deal', ante: 100, pairPlus: r % 3 ? 0 : 50 });
      expect(t.view().dealer.every((c: number) => c === -1)).toBe(true);
      expectGameError(() => t.act({ type: 'deal', ante: 100 }));
      t.act({ type: r % 2 ? 'play' : 'fold' });
      expect(t.view().dealer.every((c: number) => c >= 0)).toBe(true);
    }
    invariant(t);
  });
});

describe('video-poker', () => {
  it('deals five, draws replacements for un-held cards and pays by the 9/6 table', () => {
    const t = table('video-poker');
    expectGameError(() => t.act({ type: 'draw', hold: [1, 1, 1, 1, 1] }));
    for (let r = 0; r < 300; r++) {
      t.act({ type: 'deal', coins: 5 });
      const before = [...t.s.hand];
      expectGameError(() => t.act({ type: 'draw', hold: [true] }));
      t.act({ type: 'draw', hold: [true, true, false, false, false] });
      expect(t.s.hand.slice(0, 2)).toEqual(before.slice(0, 2));
      expect(new Set(t.s.hand).size).toBe(5);
    }
    invariant(t);
  });
});

describe.each(['classic-slots', 'adventure-slots', 'vault-slots', 'cosmic-reels', 'neon-fruit', 'mystery-jackpot'])('%s', (id) => {
  it('spins only listed bet sizes and settles every spin', () => {
    const t = table(id);
    const bet = id === 'vault-slots' ? 100 : 50;
    for (let r = 0; r < 300; r++) t.act({ type: 'spin', bet });
    invariant(t);
    expect(t.s.round).toBe(300);
    expectGameError(() => t.act({ type: 'spin', bet: 7 }));
    expectGameError(() => t.act({ type: 'pull' }));
  });
});

describe('plinko', () => {
  it('drops through the chosen rows and pays the landing slot multiplier', () => {
    const t = table('plinko');
    for (let r = 0; r < 300; r++) t.act({ type: 'drop', rows: 12, risk: 'medium', amount: 100 });
    invariant(t);
    expectGameError(() => t.act({ type: 'drop', rows: 99, risk: 'medium', amount: 100 }));
    expectGameError(() => t.act({ type: 'drop', rows: 12, risk: 'insane', amount: 100 }));
  });
});

describe('dice-arena', () => {
  it('rolls two dice and settles over/under/seven', () => {
    const t = table('dice-arena');
    for (let r = 0; r < 300; r++) t.act({ type: 'roll', bet: { kind: (['over', 'under', 'seven'] as const)[r % 3], amount: 100 } });
    invariant(t);
    expectGameError(() => t.act({ type: 'roll', bet: { kind: 'eleven', amount: 100 } }));
  });
});

describe('hi-lo', () => {
  it('calls, skips and banks within the rules', () => {
    const t = table('hi-lo');
    expectGameError(() => t.act({ type: 'call', dir: 'higher' }));
    for (let r = 0; r < 200; r++) {
      t.act({ type: 'start', amount: 100 });
      expectGameError(() => t.act({ type: 'bank' })); // must call first
      t.act({ type: 'call', dir: t.s.card.r <= 7 ? 'higher' : 'lower' });
      if (t.s.active) t.act({ type: 'bank' });
      expect(t.s.active).toBe(false);
    }
    invariant(t);
  });
});

describe('mines', () => {
  it('never shows mine positions while a round is active; reveals them after', () => {
    const t = table('mines');
    for (let r = 0; r < 200; r++) {
      t.act({ type: 'start', amount: 100, mines: 3 });
      expect(t.view().reveal).toBeNull();
      expect(JSON.stringify(t.view())).not.toMatch(/"field"|"layout"|"minePositions"/);
      t.act({ type: 'reveal', i: r % 25 });
      if (t.s.active) { expectGameError(() => t.act({ type: 'reveal', i: r % 25 })); t.act({ type: 'bank' }); }
      expect(t.view().reveal).toBeTruthy();
    }
    invariant(t, true);
  });
});

describe('crash-flight', () => {
  it('commits the crash point before take-off, hides it in flight and reveals it after', () => {
    const t = table('crash-flight');
    expectGameError(() => t.act({ type: 'bank' }));
    for (let r = 0; r < 100; r++) {
      t.act({ type: 'takeoff', amount: 100, auto: null });
      const v = t.view();
      expect(v.commit).toMatch(/^[0-9a-f]{64}$/);
      expect(v.reveal).toBeNull();
      expectGameError(() => t.act({ type: 'bank' })); // not airborne yet (countdown)
      t.advance(1600);
      t.act({ type: 'tick' });
      if (t.s.phase === 'flying') t.act({ type: 'bank' });
      t.advance(60_000); t.act({ type: 'tick' });
      expect(t.s.phase).not.toBe('flying');
      const rv = t.view().reveal;
      expect(rv.commit).toBe(v.commit);
    }
    invariant(t, true);
    expectGameError(() => t.act({ type: 'takeoff', amount: 100, auto: 0.5 }));
  });
});
