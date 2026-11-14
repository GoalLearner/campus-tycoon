import { advance, newGame, TICK_MS, type GameState, type LogEntry } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';

/** A fixed moment to start every test from: 2026-11-11 12:00 UTC. */
export const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);

export const MIN = TICK_MS;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function freshGame(seed = 42): GameState {
  return newGame({ seed, name: 'Test University', now: T0 });
}

/** A small seeded generator for tests, separate from the game's own streams. */
export function testRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
    t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
}

/** Advance through a span in `steps` uneven pieces. Returns the final state and the joined log. */
export function advanceInSteps(
  start: GameState,
  to: number,
  steps: number,
  seed = 7,
): { state: GameState; log: LogEntry[] } {
  const rand = testRandom(seed);
  const from = start.clock.lastSimulatedAt;
  const cuts: number[] = [];
  for (let i = 0; i < steps - 1; i++) cuts.push(from + Math.floor(rand() * (to - from)));
  cuts.sort((a, b) => a - b);
  cuts.push(to);

  let state = start;
  const log: LogEntry[] = [];
  for (const cut of cuts) {
    const result = advance(state, state.clock.lastSimulatedAt, cut);
    state = result.state;
    log.push(...result.log);
  }
  return { state, log };
}

/** Every number in a value, with its path, for checking that none is NaN or infinite. */
export function badNumbers(value: unknown, path = 'state'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => badNumbers(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => badNumbers(v, `${path}.${k}`));
  }
  return [];
}

/**
 * What an older save gains at version 30 (DESIGN.md 63.5): the web's note of where the new names begin, after the
 * freshmen enrolled when it was opened. For the tests that check an upgrade moved nothing else.
 */
export function webMetaFor(state: GameState): GameState['web'] {
  return { namesFrom: { entryYear: calendarAt(state.clock).year, index: state.cohorts[0] ?? 0 } };
}
