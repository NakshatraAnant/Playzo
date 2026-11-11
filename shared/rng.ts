/**
 * PLAYZO randomness primitives.
 *
 * - `Rng` is the only interface game engines depend on.
 * - `SeededRng` (sfc32) is deterministic and used for *replay-verified* skill games,
 *   where client and server must produce identical sequences from a shared seed.
 * - Chance outcomes (Lounge simulations) never use SeededRng: the server injects a
 *   cryptographic HMAC-SHA256 generator (see server/secureRng.ts).
 *
 * `int(n)` is unbiased (rejection sampling) for every implementation.
 */
export interface Rng {
  /** Next uniformly-distributed unsigned 32-bit integer. */
  u32(): number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). Unbiased. */
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
  /** Number of u32 draws consumed so far (allows resumable/auditable streams). */
  cursor(): number;
}

export abstract class BaseRng implements Rng {
  protected drawn = 0;
  protected abstract raw(): number;
  u32(): number {
    this.drawn++;
    return this.raw() >>> 0;
  }
  next(): number {
    return this.u32() / 4294967296;
  }
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`int(n) requires a positive integer, got ${n}`);
    if (n === 1) return 0;
    const limit = Math.floor(4294967296 / n) * n;
    for (;;) {
      const v = this.u32();
      if (v < limit) return v % n;
    }
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  cursor(): number {
    return this.drawn;
  }
}

/** cyrb128 string hash -> four 32-bit seeds. */
export function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Deterministic sfc32 PRNG - for skill games only, never for chance outcomes. */
export class SeededRng extends BaseRng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: string, skip = 0) {
    super();
    [this.a, this.b, this.c, this.d] = hashSeed(seed);
    for (let i = 0; i < 12; i++) this.raw();
    for (let i = 0; i < skip; i++) this.u32();
  }
  protected raw(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
}

/** Convenience: build a deterministic RNG for a sub-stream (e.g. per level). */
export function subRng(seed: string, label: string | number): SeededRng {
  return new SeededRng(`${seed}::${label}`);
}
