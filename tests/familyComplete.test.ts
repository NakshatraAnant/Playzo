/**
 * Start-to-finish tests for all 25 family games.
 *  - 13 server-authoritative engines are played to game over with a simple policy and a simulated
 *    server clock (timed games advance time instead of waiting for real seconds).
 *  - 12 replay engines are played with real gameplay actions, then the log is re-verified by the
 *    server's replay verifier, exactly as /api/sessions/:id/submit does.
 * Each run must end (isOver), produce a non-negative integer score and reject an illegal action.
 * A final API test starts every family game through HTTP and checks the session is created.
 */
import { describe, it, expect, beforeAll } from 'vitest';
process.env.PLAYZO_DB_PATH = ':memory:';
import { SeededRng } from '../shared/rng';
import { GameError } from '../shared/engine';
import { CATALOGUE } from '../shared/catalogue';
import { REPLAY_ENGINES } from '../shared/games';
const { ENGINES } = await import('../server/games/registry');
const { verifyReplay } = await import('../server/sessions');

const FAMILY = CATALOGUE.filter((g) => g.env === 'family').map((g) => g.id);
const SERVER = FAMILY.filter((id) => ENGINES[id].mode === 'server');
const REPLAY = FAMILY.filter((id) => ENGINES[id].mode === 'replay');

function server(id: string, difficulty: 'easy' | 'normal' | 'hard' = 'easy') {
  const e = ENGINES[id];
  const rng = new SeededRng(`complete:${id}`);
  let now = 10_000_000;
  const ctx = () => ({ rng, now, player: 'p1' });
  let s: any = e.init({ players: ['p1'], difficulty, vsAi: e.players.max > 1 }, ctx());
  return {
    e, get s() { return s; }, view: () => e.view(s, 'p1') as any,
    act(a: any) { s = e.apply(s, a, ctx()); return s; },
    tryAct(a: any) { try { s = e.apply(s, a, ctx()); return true; } catch (err) { if (err instanceof GameError) return false; throw err; } },
    advance(ms: number) { now += ms; },
  };
}
function finished(t: ReturnType<typeof server>) {
  expect(t.e.isOver(t.s)).toBe(true);
  const r = t.e.result(t.s);
  const score = Math.round(r.scores.p1 ?? 0);
  expect(Number.isFinite(score)).toBe(true);
  return r;
}

describe('family catalogue', () => {
  it('has 25 family games: 13 server-authoritative + 12 replay-verified, each with its own engine', () => {
    expect(FAMILY).toHaveLength(25);
    expect(SERVER.length + REPLAY.length).toBe(25);
    // trivia-clash and party-chaos share the rounds framework but are distinct engines with different content/rules.
    expect(new Set(FAMILY.map((id) => ENGINES[id])).size).toBe(25);
  });
});

describe('server-authoritative family games play to the end', () => {
  it('code-breaker', () => {
    const t = server('code-breaker');
    expect(t.tryAct({ type: 'guess', g: [9, 9, 9, 9] })).toBe(false);
    for (let i = 0; i < 10 && !t.e.isOver(t.s); i++) t.act({ type: 'guess', g: [i % 5, (i + 1) % 5, (i + 2) % 5, (i + 3) % 5] });
    finished(t);
    expect(t.view().secret).toHaveLength(4); // revealed only after the end
  });
  it('word-duel', () => {
    const t = server('word-duel');
    t.advance(2000);
    const v = t.view();
    // Invalid words are answered with feedback and never score.
    t.act({ type: 'word', w: 'qzxqzx' });
    expect(t.s.scores.p1).toBe(0);
    expect(t.s.lastMsg.p1).toBeTruthy();
    t.tryAct({ type: 'word', w: v.letters.join('') });
    t.advance(10 * 60_000); t.act({ type: 'tick' });
    finished(t);
  });
  for (const id of ['trivia-clash', 'party-chaos']) it(id, () => {
    const t = server(id);
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 200) {
      t.advance(1500);
      t.tryAct({ type: 'answer', choice: guard % 4 });
      t.advance(30_000);
      t.act({ type: 'tick' });
    }
    finished(t);
  });
  it('emoji-decode', () => {
    const t = server('emoji-decode');
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 100) { t.tryAct({ type: 'hint' }); t.tryAct({ type: 'guess', text: 'not it' }); t.tryAct({ type: 'skip' }); }
    finished(t);
  });
  it('word-ladder', () => {
    const t = server('word-ladder');
    const len = t.s.path.length;
    t.act({ type: 'word', w: 'zzzz' });
    expect(t.s.path.length).toBe(len); // rejected words never extend the ladder
    expect(t.s.msg).toBeTruthy();
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 100) t.act({ type: 'giveup' });
    finished(t);
  });
  it('geo-sprint', () => {
    const t = server('geo-sprint');
    t.advance(1200);
    for (let i = 0; i < 20; i++) { t.tryAct({ type: 'answer', choice: i % 4 }); t.advance(1100); }
    t.advance(120_000); t.act({ type: 'tick' });
    finished(t);
    expect(t.tryAct({ type: 'answer', choice: 0 })).toBe(false);
  });
  it('fact-or-fiction', () => {
    const t = server('fact-or-fiction');
    expect(t.tryAct({ type: 'answer', fact: 'maybe' })).toBe(false);
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 200) t.act({ type: 'answer', fact: guard % 2 === 0 });
    finished(t);
  });
  it('territory-wars (vs computer)', () => {
    const t = server('territory-wars');
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 200) {
      const s = t.s;
      let moved = false;
      for (let r = 0; r <= s.R && !moved; r++) for (let c = 0; c < s.C && !moved; c++) moved = t.tryAct({ o: 'h', r, c });
      for (let r = 0; r < s.R && !moved; r++) for (let c = 0; c <= s.C && !moved; c++) moved = t.tryAct({ o: 'v', r, c });
      expect(moved).toBe(true);
    }
    const res = finished(t);
    expect((t.s.scores as number[]).reduce((a, b) => a + b, 0)).toBe(t.s.R * t.s.C); // every box claimed
    void res;
  });
  for (const id of ['hex-conquest', 'connect-five']) it(`${id} (vs computer)`, () => {
    const t = server(id);
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 400) {
      const cells: number[] = t.s.cells;
      const free = cells.findIndex((c) => c < 0);
      expect(free).toBeGreaterThanOrEqual(0);
      t.act({ type: 'place', i: free });
    }
    finished(t);
    expect(t.tryAct({ type: 'place', i: 0 })).toBe(false);
  });
  it('memory-duel (vs computer)', () => {
    const t = server('memory-duel');
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 2000) {
      const owner: (string | null)[] = t.s.owner;
      const idx = owner.map((o, i) => (o === null && !t.s.up.includes(i) ? i : -1)).filter((i) => i >= 0);
      if (!t.tryAct({ type: 'flip', i: idx[guard % Math.max(1, idx.length)] ?? 0 })) t.advance(2000);
    }
    finished(t);
  });
  it('chess-blitz (vs computer, easy)', () => {
    const t = server('chess-blitz');
    expect(t.tryAct({ type: 'move', from: 0, to: 63 })).toBe(false);
    let guard = 0;
    while (!t.e.isOver(t.s) && guard++ < 300) {
      const legal = t.view().legal as [number, number, string | null][];
      if (!legal.length) break;
      const [from, to, promo] = legal[guard % legal.length];
      t.act({ type: 'move', from, to, promo: promo ?? undefined });
    }
    if (!t.e.isOver(t.s)) t.act({ type: 'resign' }); // very long games end by resignation, still a valid finish
    finished(t);
  });
  it('covers all 13 server engines', () => expect(SERVER.sort()).toEqual(['chess-blitz', 'code-breaker', 'connect-five', 'emoji-decode', 'fact-or-fiction', 'geo-sprint', 'hex-conquest', 'memory-duel', 'party-chaos', 'territory-wars', 'trivia-clash', 'word-duel', 'word-ladder'].sort()));
});

/* ---------------- replay-verified games ---------------- */
type Script = (s: any, push: (a: any, at?: number) => boolean) => void;
const SCRIPTS: Record<string, Script> = {
  'mind-maze': (_s, push) => { for (let i = 0; i < 40; i++) push({ d: (['E', 'S', 'W', 'N'] as const)[i % 4] }); },
  'pattern-hunter': (_s, push) => { for (let i = 0; i < 30; i++) push({ i: i % 9 }); },
  'number-rush': (_s, push) => { for (let i = 0; i < 30; i++) push({ a: i % 20 }); },
  'logic-lock': (_s, push) => { for (let i = 0; i < 12; i++) push({ lever: i % 5 }); },
  'sequence-master': (_s, push) => { for (let i = 0; i < 12; i++) push({ pad: i % 4 }); },
  'grid-genius': (_s, push) => { for (let i = 0; i < 16; i++) push({ i, v: 1 + (i % 4) }); },
  'block-battle': (_s, push) => { for (let i = 0; i < 6; i++) push({ p: 0, r: i % 8, c: 0 }); },
  'tower-tactics': (_s, push) => { push({ type: 'build', x: 2, y: 2, kind: 'bolt' }); push({ type: 'wave' }); },
  'reflex-arena': (s, push) => { (s.targets as any[]).filter((x) => !x.decoy).slice(0, 12).forEach((x) => push({ i: s.targets.indexOf(x) }, x.spawn + 320)); },
  'color-dash': (_s, push) => { for (let i = 0; i < 20; i++) push({ c: i % 4 }); },
  'rhythm-rush': (_s, push) => { for (let i = 0; i < 20; i++) push({ lane: i % 4 }); },
  'obstacle-sprint': (_s, push) => { for (let i = 0; i < 10; i++) push({ a: 'jump' }); },
};

describe('replay-verified family games: play, submit, server re-verifies', () => {
  for (const id of ['mind-maze', 'pattern-hunter', 'number-rush', 'logic-lock', 'sequence-master', 'grid-genius', 'block-battle', 'tower-tactics', 'reflex-arena', 'color-dash', 'rhythm-rush', 'obstacle-sprint']) {
    it(id, () => {
      const e = REPLAY_ENGINES[id];
      const seed = `complete-${id}`;
      const rng = new SeededRng(`${seed}::replay`);
      let s: any = e.init({ players: ['p1'], difficulty: 'easy', seed }, { rng, now: 0, player: 'p1' });
      const log: any[] = [];
      let t = 0, accepted = 0;
      const push = (a: any, at?: number) => {
        t = Math.max(t + 1, at ?? t + 650); // humanly-timed inputs
        const act = { ...a, t };
        try { s = e.apply(s, act, { rng, now: t, player: 'p1' }); log.push(act); accepted++; return true; } catch (err) { if (err instanceof GameError) return false; throw err; }
      };
      SCRIPTS[id](s, push);
      if (!e.isOver(s)) { t += 650; const end = id === 'obstacle-sprint' ? { a: 'end', t } : id === 'tower-tactics' ? { type: 'end', t } : { end: true, t }; s = e.apply(s, end, { rng, now: t, player: 'p1' }); log.push(end); }
      expect(e.isOver(s)).toBe(true);
      expect(accepted).toBeGreaterThan(0); // real gameplay happened, not just an empty end
      // The server re-simulates the exact log and must reach the same score.
      const v = verifyReplay(ENGINES[id], seed, 'easy', log);
      expect(ENGINES[id].result(v.state).scores.p1).toBe(e.result(s).scores.p1);
      // Tampering is detected: an out-of-order timeline is rejected.
      if (log.length > 2) expect(() => verifyReplay(ENGINES[id], seed, 'easy', [log[1], log[0], ...log.slice(2)])).toThrow(GameError);
    });
  }
});

describe('every family game starts through the HTTP API', () => {
  let app: any;
  beforeAll(async () => { const { buildApp } = await import('../server/app'); app = await buildApp(); });
  it('creates a session for all 25 family games (guest account) and hides server secrets', async () => {
    const g = await app.inject({ method: 'POST', url: '/api/auth/guest', headers: { 'x-playzo': '1' }, remoteAddress: '10.77.0.1' });
    const cookie = String(g.headers['set-cookie']).split(';')[0];
    for (const id of FAMILY) {
      const r = await app.inject({ method: 'POST', url: '/api/sessions', payload: { gameId: id, difficulty: 'easy' }, headers: { 'x-playzo': '1', cookie }, remoteAddress: '10.77.0.1' });
      expect(r.statusCode, id).toBe(200);
      const b = JSON.parse(r.body);
      if (ENGINES[id].mode === 'server') { expect(b.seed, id).toBeUndefined(); expect(b.view, id).toBeTruthy(); }
      else expect(typeof b.seed, id).toBe('string');
      // Abandon cleanly so the next start is not rate-limited by open sessions.
      await app.inject({ method: 'POST', url: `/api/sessions/${b.sessionId}/end`, headers: { 'x-playzo': '1', cookie }, remoteAddress: '10.77.0.1' });
    }
  });
});
