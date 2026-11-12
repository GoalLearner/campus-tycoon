import type { RngState, RngStream } from './types';

/**
 * Seeded randomness. Each system draws from its own stream, so adding a draw
 * in one system never shifts the numbers another system sees. The stream
 * values live in the game state and are saved with it.
 */

// New streams are added at the end: each takes its start from the one before, so the earlier ones never move.
const STREAMS: readonly RngStream[] = ['growth', 'intake', 'names', 'events', 'football'];

/** One step of mulberry32. Returns the next state and a 32-bit output. */
function step(a: number): { next: number; out: number } {
  const next = (a + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { next, out: (t ^ (t >>> 14)) >>> 0 };
}

/** Derive one independent starting value per stream from a single seed. */
export function seedStreams(seed: number): RngState {
  let a = seed >>> 0;
  const out = {} as RngState;
  for (const name of STREAMS) {
    const s = step(a);
    a = s.next;
    // Mix again so neighbouring seeds do not give neighbouring streams.
    out[name] = step(s.out).out;
  }
  return out;
}

/** A whole number from 0 to 2^32 - 1. Advances the stream. */
export function nextU32(rng: RngState, stream: RngStream): number {
  const s = step(rng[stream]);
  rng[stream] = s.next;
  return s.out;
}

/** A number in [0, 1). Advances the stream. */
export function nextFloat(rng: RngState, stream: RngStream): number {
  return nextU32(rng, stream) / 4294967296;
}

/** A whole number in [0, n). Advances the stream. */
export function nextInt(rng: RngState, stream: RngStream, n: number): number {
  return Math.floor(nextFloat(rng, stream) * n);
}

/**
 * A stable hash of whole numbers to a u32. For cosmetic choices that must not
 * touch any stream, such as which look a building gets.
 */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
  }
  return (h ^ (h >>> 15)) >>> 0;
}
