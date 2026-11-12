import type { Rng } from './rng';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * Execution mode:
 *  - 'server': state lives only on the server; the client sends one action at a time and
 *    receives a redacted `view`. Used for hidden-information and all chance games.
 *  - 'replay': the client plays locally from a shared seed with the same deterministic
 *    engine and submits the timestamped action log; the server replays it to compute the
 *    authoritative score. Used for real-time skill games.
 */
export type EngineMode = 'server' | 'replay';

export interface Ctx {
  rng: Rng;
  /** Milliseconds. Server mode: server clock. Replay mode: action timestamp since start. */
  now: number;
  /** Acting player id. */
  player: string;
  /** Lounge only: player's current Fun Chips balance (server-provided, never client). */
  balance?: number;
}

export interface InitOpts {
  players: string[];
  difficulty: Difficulty;
  /** Solo games against a computer opponent. */
  vsAi?: boolean;
  config?: Record<string, unknown>;
  /** Shared seed (replay games, races, challenges, daily puzzles). */
  seed?: string;
}

export interface LedgerIntent {
  kind: 'stake' | 'payout';
  amount: number;
  ref: string;
}

export interface GameResult {
  scores: Record<string, number>;
  winner?: string | null;
  ranking?: string[];
  summary?: Record<string, unknown>;
}

export interface Engine<S = any, A = any> {
  id: string;
  rulesVersion: string;
  mode: EngineMode;
  players: { min: number; max: number };
  /** Simultaneous-play engines accept actions from any player at any time. */
  simultaneous?: boolean;
  /**
   * Timed server engines accept `{ type: 'tick' }`, which only advances state using the
   * server clock (ctx.now). Rooms send ticks every 500ms; solo clients may request one.
   */
  timed?: boolean;
  init(opts: InitOpts, ctx: Ctx): S;
  /** Apply an action. Must throw GameError for illegal actions. May mutate and return `s`. */
  apply(s: S, a: A, ctx: Ctx): S;
  isOver(s: S): boolean;
  result(s: S): GameResult;
  /** Player-specific redacted view (never leaks hidden information). */
  view(s: S, player: string): unknown;
  /** Whose turn it is (turn-based games). */
  turn?(s: S): string | null;
  /** Replay mode: hard upper bound on legitimate session length, in ms. */
  maxDurationMs?(s: S): number;
  /**
   * Lounge: called when a session is closed while a round is in progress, so the round is
   * resolved by fixed published rules (e.g. table chips returned). Never randomises in the
   * house's favour.
   */
  finalize?(s: S, ctx: Ctx): S;
  /** Server-timed engines: move every server deadline forward by dt ms (used when a solo game is paused). */
  shiftTime?(s: S, dt: number): S;
}

export class GameError extends Error {
  constructor(message: string, public code = 'ILLEGAL_ACTION') {
    super(message);
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new GameError(msg);
}

export function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) throw new GameError('Expected a number');
  if (n < min || n > max) throw new GameError(`Value must be between ${min} and ${max}`);
  return n;
}

/** Shared shape for Lounge (chance) engines: queued ledger intents settled by the server. */
export interface ChanceState {
  ledger: LedgerIntent[];
  round: number;
  history: unknown[];
  totalStaked: number;
  totalReturned: number;
}

export function newChanceState(): ChanceState {
  return { ledger: [], round: 0, history: [], totalStaked: 0, totalReturned: 0 };
}

export function stake(s: ChanceState, amount: number, ctx: Ctx, ref: string, min = 10, max = 5000): void {
  const a = clampInt(amount, min, max);
  const available = (ctx.balance ?? 0) - s.ledger.filter((l) => l.kind === 'stake').reduce((t, l) => t + l.amount, 0);
  if (a > available) throw new GameError('Not enough Fun Chips for this play', 'INSUFFICIENT_CHIPS');
  s.ledger.push({ kind: 'stake', amount: a, ref });
  s.totalStaked += a;
}

export function payout(s: ChanceState, amount: number, ref: string): void {
  const a = Math.floor(amount);
  if (a <= 0) return;
  s.ledger.push({ kind: 'payout', amount: a, ref });
  s.totalReturned += a;
}

export function pushHistory(s: ChanceState, entry: unknown, keep = 20): void {
  s.history.unshift(entry);
  if (s.history.length > keep) s.history.length = keep;
}
