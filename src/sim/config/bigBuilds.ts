/**
 * The big builds the eras open (DESIGN.md 41.3 and 41.4, as built in section
 * 45). Each is one of a kind, bought once its era has come, and built over
 * real days. Each moves one number the game already has, through the cause it
 * belongs to. Their prices and upkeep are rows of `PLACED`. Every number is a
 * tuning target [T].
 */
import type { PlacedType } from '../types';

export interface BigBuildSpec {
  type: PlacedType;
  /** The era that opens it: 2 is Flagship, 3 is Legacy (config/goals.ts). */
  era: number;
  /** Real hours it takes to go up once bought. */
  hours: number;
  /** What it does, in a few words for the paper and the Goals page. */
  does: string;
}

export const BIG_BUILDS: readonly BigBuildSpec[] = [
  { type: 'studentUnion', era: 2, hours: 24, does: 'things to do and somewhere to meet over a wide circle' },
  { type: 'honorsCollege', era: 2, hours: 24, does: 'a higher graduation rate across the campus' },
  { type: 'welcomeCenter', era: 2, hours: 24, does: 'more from every step of marketing' },
  { type: 'foundersCommons', era: 3, hours: 72, does: 'better Grounds for every student' },
];

/**
 * Planned for the Legacy era and not built: no drawing in the owner's packs
 * honestly fits either (DESIGN.md 45.3). Each waits for art, with no stand-in.
 */
export const BIG_BUILDS_WAITING: ReadonlyArray<{ name: string; does: string }> = [
  { name: 'Grand Library', does: 'softer finals for every student' },
  { name: 'Hall of Champions', does: 'bigger home crowds, and more applicants from football' },
];

/** Gold Seals for a second builder, bought once: two big builds can then go up at once (DESIGN.md 42.7). */
export const SECOND_BUILDER_SEALS = 20;

/** The Student Union counts as this much recreation at every lot within its reach: Food & fun, never past full. */
export const UNION_STRENGTH = 0.5;
/** Cells from its wall. A gym reaches 8. */
export const UNION_REACH = 16;

/** Points of graduation rate the Honors College adds to what the academic rating reads, never past all of a class. */
export const HONORS_RATE = 0.02;

/** How much more every step of marketing brings with the Welcome Center open: a share of its own lift. */
export const WELCOME_MORE = 0.25;

/** Points of Grounds Founders' Commons adds at every lot, never past full. */
export const COMMONS_POINTS = 5;
