import { reshareAmenities } from '../src/sim/save';
import { newChaos } from '../src/sim/systems/chaos';
import { cleanUpGoals } from '../src/sim/systems/cleanup';
import { paintWalks } from '../src/sim/systems/walkLanes';
import { seedStreams } from '../src/sim/rng';
import { advance, newGame, TICK_MS, type GameState, type LogEntry } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { ERA_AT_RANK } from '../src/sim/config/goals';
import { SWITCHED_OFF, type SwitchedOff } from '../src/sim/config/cleanup';

/**
 * The eras a rank opened before the goals clean-up (DESIGN.md 85.1), written down as a save from before keeps them. For
 * a test that reaches an era by its rank, as it was written. The University Level opens them in play now.
 */
export function erasByRank<T extends GameState>(state: T): T {
  const goals = state.goals;
  if (!goals) return state;
  let era = 0;
  for (let n = 0; n < ERA_AT_RANK.length; n++) if (goals.rank >= ERA_AT_RANK[n]!) era = n + 1;
  const have = new Set(goals.reached.filter((entry) => entry.ladder === 'era').map((entry) => entry.n));
  for (let n = 1; n <= era; n++) if (!have.has(n)) goals.reached.push({ ladder: 'era', n, year: Math.max(1, state.clock.week.year) });
  return state;
}

/**
 * Run with things the goals clean-up switched off switched back on (DESIGN.md 85): for the tests of what they did, which
 * show the code kept still works. Each is put back as it was afterwards.
 */
export function switchedOn<T>(what: SwitchedOff | readonly SwitchedOff[], run: () => T): T {
  const list = typeof what === 'string' ? [what] : what;
  const was = list.map((one) => SWITCHED_OFF[one]);
  for (const one of list) SWITCHED_OFF[one] = false;
  try {
    return run();
  } finally {
    list.forEach((one, n) => (SWITCHED_OFF[one] = was[n]!));
  }
}

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

/**
 * A web record (version 4, six rings) written again as an older version wrote it (DESIGN.md 65.2): four rings, each
 * class in the ring its entry year had then, and every tie's other end with it. `version` 3 keeps the posts, 2 drops
 * them, and 1 drops the kept weeks too. Rings with nobody in them are left out; a web of more than four classes has
 * no older record.
 */
export function olderWebRecord(bytes: Uint8Array, version: 1 | 2 | 3): Uint8Array {
  const SLOTS = 12;
  const head = new Int32Array(bytes.slice(0, 64).buffer);
  const slot = head[4]!;
  const ring6 = [head[5]!, head[6]!, head[7]!, head[8]!, head[14]!, head[15]!];
  const kinds = head[10]!;
  const kept = head[11]!;
  const weeksKept = head[12]!;
  const fields = 10;
  const counts = 64 + kinds * 8;
  const weeks = weeksKept * kinds * 8 + kept * 4 + weeksKept * 8 + fields * 4;
  const n6 = slot * 6;
  const slots6 = n6 * SLOTS;
  const at = counts + weeks;
  const other6 = new Int32Array(bytes.slice(at, at + slots6 * 4).buffer);
  const rest6 = bytes.subarray(at + slots6 * 4, at + slots6 * 9);
  const posts = bytes.subarray(at + slots6 * 9);
  // Which rings hold anyone, and where each goes among four.
  const used = new Set<number>();
  for (let id = 0; id < n6; id++) {
    for (let k = 0; k < SLOTS; k++) {
      if (other6[id * SLOTS + k]! >= 0) used.add(Math.floor(id / slot));
    }
  }
  const ring4 = [-1, -1, -1, -1];
  for (const r of used) ring4[((ring6[r]! % 4) + 4) % 4] = ring6[r]!;
  const move = (id: number): number => (id < 0 ? -1 : ((((ring6[Math.floor(id / slot)]! % 4) + 4) % 4) * slot + (id % slot)));
  const n4 = slot * 4;
  const slots4 = n4 * SLOTS;
  const other4 = new Int32Array(slots4).fill(-1);
  const seen4 = new Uint16Array(slots4);
  const bytes4 = [new Uint8Array(slots4), new Uint8Array(slots4), new Uint8Array(slots4)];
  const seen6 = new Uint16Array(rest6.slice(0, slots6 * 2).buffer);
  for (let id = 0; id < n6; id++) {
    if (!used.has(Math.floor(id / slot))) continue;
    const to = move(id);
    for (let k = 0; k < SLOTS; k++) {
      const s = id * SLOTS + k;
      const t = to * SLOTS + k;
      other4[t] = move(other6[s]!);
      seen4[t] = seen6[s]!;
      for (let b = 0; b < 3; b++) bytes4[b]![t] = rest6[slots6 * 2 + b * slots6 + s]!;
    }
  }
  const head4 = new Int32Array(16);
  head4.set([head[0]!, version, head[2]!, head[3]!, slot, ...ring4, head[9]!, kinds, kept, weeksKept, head[13]!, 0, 0]);
  const parts: Uint8Array[] = [new Uint8Array(head4.buffer), bytes.subarray(64, counts)];
  if (version >= 2) parts.push(bytes.subarray(counts, at));
  parts.push(new Uint8Array(other4.buffer), new Uint8Array(seen4.buffer), ...bytes4);
  if (version === 3) parts.push(posts);
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let to = 0;
  for (const part of parts) {
    out.set(part, to);
    to += part.byteLength;
  }
  return out;
}

/** What the version 31 upgrade (DESIGN.md 65.2) does to a save: two more class years, empty. */
export function sixClassYears(state: GameState): void {
  state.cohorts = [0, 1, 2, 3, 4, 5].map((classYear) => Number(state.cohorts[classYear] ?? 0)) as GameState['cohorts'];
  state.offCampus = [0, 1, 2, 3, 4, 5].map((classYear) => Number(state.offCampus[classYear] ?? 0)) as GameState['offCampus'];
}

/** What version 33 adds to an older save (DESIGN.md 68): the Chaos meter, and chaos's own random stream. */
export function withChaos(state: GameState): void {
  if (!state.chaos) state.chaos = newChaos();
  if (typeof state.rng.chaos !== 'number') state.rng.chaos = seedStreams(state.seed).chaos;
}

/** What version 43 does to an older save (DESIGN.md 85.9): the goals clean-up, with nothing earned lost. */
export function withCleanUp(state: GameState): void {
  cleanUpGoals(state);
}

/** What version 40 adds to an older save (DESIGN.md 80): registration's records, none yet. */
export function withRegistration(state: GameState): void {
  if (!state.registration) state.registration = { records: [] };
}

/** What version 37 does to an older save (DESIGN.md 74.5): a lane painted on every walk, once, free. */
export function withLanes(state: GameState): void {
  paintWalks(state.map);
}

/**
 * What version 42 does to an older save (DESIGN.md 83): who goes to which place to play and eat is worked out again.
 */
export function withAmenities(state: GameState): void {
  reshareAmenities(state.map);
}

/** A copy of a state as version 37 leaves it: every walk painted, nothing else changed. */
export function painted<T extends { map: GameState['map'] }>(state: T): T {
  const copy = structuredClone(state);
  paintWalks(copy.map);
  return copy;
}
