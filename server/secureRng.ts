import { createHmac, randomBytes, createHash } from 'node:crypto';
import { BaseRng } from '../shared/rng';

/**
 * Cryptographic, resumable RNG for chance outcomes.
 * Stream = HMAC-SHA256(serverSeed, blockIndex) -> 8 x u32 per block.
 * The server seed is secret during play; its SHA-256 commitment is published at session
 * start and the seed is revealed when the session ends, so any outcome can be audited.
 */
export class HmacRng extends BaseRng {
  private block = -1;
  private words: number[] = [];
  private pos = 0;
  constructor(private seed: string, skip = 0) {
    super();
    if (skip > 0) {
      this.loadBlock(Math.floor(skip / 8));
      this.pos = skip % 8;
      this.drawn = skip;
    }
  }
  private loadBlock(b: number) {
    const buf = createHmac('sha256', this.seed).update(String(b)).digest();
    this.words = [];
    for (let i = 0; i < 8; i++) this.words.push(buf.readUInt32BE(i * 4));
    this.block = b;
    this.pos = 0;
  }
  protected raw(): number {
    const index = this.drawn - 1; // BaseRng increments `drawn` before calling raw()
    const b = Math.floor(index / 8);
    if (b !== this.block) this.loadBlock(b);
    this.pos = index % 8;
    return this.words[this.pos];
  }
}

export const newServerSeed = () => randomBytes(32).toString('hex');
export const commitOf = (seed: string) => createHash('sha256').update(seed).digest('hex');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const newId = (prefix = '') => prefix + randomBytes(12).toString('base64url');
