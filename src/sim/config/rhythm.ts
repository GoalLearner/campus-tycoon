/**
 * The daily and seasonal rhythm (DESIGN.md 42.8, as built in section 44):
 * the daily gift, the goals for the year and the moments of the calendar.
 * Everything here is data. A box of the card, a kind of goal or a moment is
 * one more entry.
 */

// --------------------------------------------------------------- the gift --

/**
 * One box of the seven-day card. Cash is on the small campus's count and
 * follows the campus scale, out of the same yearly allowance as the orders'
 * grants. A decoration is one the Decor shelf has opened, the kind the campus
 * holds fewest of: chosen, never drawn by chance.
 */
export interface GiftBox {
  xp: number;
  cash?: number;
  seals?: number;
  decor?: boolean;
}

/**
 * The card, in the order its boxes fill. The seventh is the better gift. Then a fresh card begins. A card is a real
 * week, so its Seal is a week's: about a tenth of what a free player earns (DESIGN.md 44.2).
 */
export const GIFT_CARD: readonly GiftBox[] = [
  { xp: 50 },
  { xp: 30, cash: 1_500 },
  { xp: 60 },
  { xp: 30, decor: true },
  { xp: 30, cash: 2_500 },
  { xp: 80 },
  { xp: 120, seals: 1, decor: true },
];

/** The player's own day starts this many minutes before the anchor (DESIGN.md 36.4): the gift comes with the morning. */
export const GIFT_DAY_EARLY = 120;

// ----------------------------------------------------- goals for the year --

export type YearLevel = 'easy' | 'medium' | 'stretch';

/** What a goal for the year asks. Counted from the day it was set, or read at commencement. */
export type YearMeasure =
  /** A running count of the orders board's, from the day the goal was set: orders claimed, buildings collected. */
  | { kind: 'counted'; what: 'claimed' | 'collects' | 'homeWins' | 'decorPlaced' | 'crafts' }
  /** The University Level, which only rises. */
  | { kind: 'level' }
  /** Read when commencement comes. */
  | { kind: 'happiness' }
  | { kind: 'kept' };

export type YearWhen = 'always' | 'decorShelf' | 'workshop' | 'collects';

export interface YearKind {
  id: string;
  /** The goal in words. {n} is the number to reach, or the number to do this year for a count. */
  words: string;
  /** The same, for one. */
  one?: string;
  measure: YearMeasure;
  /** The number to reach for an easy, a medium and a stretch goal: added to where it stands, or taken as it is. */
  steps: readonly [number, number, number];
  /** True when `steps` are added to where the number stands when the goal is set. */
  more: boolean;
  /** When this kind can be asked. */
  when: YearWhen;
}

export const YEAR_KINDS: readonly YearKind[] = [
  { id: 'orders', words: 'Finish {n} orders on the board', one: 'Finish {n} order on the board', measure: { kind: 'counted', what: 'claimed' }, steps: [4, 7, 11], more: true, when: 'always' },
  { id: 'collects', words: 'Collect from {n} buildings', one: 'Collect from {n} building', measure: { kind: 'counted', what: 'collects' }, steps: [30, 60, 100], more: true, when: 'collects' },
  { id: 'levels', words: 'Reach level {n}', measure: { kind: 'level' }, steps: [2, 4, 7], more: true, when: 'always' },
  { id: 'homeWins', words: 'Win {n} home games', one: 'Win {n} home game', measure: { kind: 'counted', what: 'homeWins' }, steps: [1, 2, 4], more: true, when: 'always' },
  { id: 'happiness', words: 'End the year with Happiness of {n} or more', measure: { kind: 'happiness' }, steps: [-2, 0, 2], more: true, when: 'always' },
  { id: 'kept', words: 'Keep ${n} of every $100 at commencement', measure: { kind: 'kept' }, steps: [12, 13.5, 15], more: false, when: 'always' },
  { id: 'decor', words: 'Set out {n} decorations', one: 'Set out {n} decoration', measure: { kind: 'counted', what: 'decorPlaced' }, steps: [3, 6, 10], more: true, when: 'decorShelf' },
  { id: 'crafts', words: 'Make {n} things at the Workshop', one: 'Make {n} thing at the Workshop', measure: { kind: 'counted', what: 'crafts' }, steps: [2, 4, 6], more: true, when: 'workshop' },
];

/**
 * What a goal for the year pays at commencement, by how hard it was. Never rank points. A school year is a real week,
 * so these come every week: a Seal for the stretch goal alone keeps the Seals at about one special thing a week.
 */
export const YEAR_PAY: Record<YearLevel, { xp: number; seals: number }> = {
  easy: { xp: 100, seals: 0 },
  medium: { xp: 150, seals: 0 },
  stretch: { xp: 250, seals: 1 },
};

/** Goals are set only while commencement is at least this far off, in hours: every window is a day and a half or more. */
export const YEAR_LEAST_HOURS = 36;

// ------------------------------------------------- moments of the calendar --

export type MomentKind = 'homecoming' | 'rivalry' | 'finals' | 'commencement';

export type MomentReward = { kind: 'xp'; amount: number } | { kind: 'seals'; amount: number } | { kind: 'cash'; amount: number };

export interface MomentSpec {
  kind: MomentKind;
  /** The name the board and the paper use. */
  name: string;
  /** What it pays when the moment goes well: more than an ordinary order. Cash on the small campus's count. */
  pays: readonly MomentReward[];
}

/**
 * Five moments come in a school year, which is a real week. Each pays more experience than most orders (60 to 160) and
 * a grant besides, out of the orders' yearly allowance. No Seals: the gift and the year's goals carry those.
 */
export const MOMENTS: Record<MomentKind, MomentSpec> = {
  homecoming: { kind: 'homecoming', name: 'Homecoming', pays: [{ kind: 'xp', amount: 160 }, { kind: 'cash', amount: 3_000 }] },
  rivalry: { kind: 'rivalry', name: 'The rivalry', pays: [{ kind: 'xp', amount: 160 }, { kind: 'cash', amount: 3_000 }] },
  finals: { kind: 'finals', name: 'Finals week', pays: [{ kind: 'xp', amount: 120 }, { kind: 'cash', amount: 2_000 }] },
  commencement: { kind: 'commencement', name: 'Commencement', pays: [{ kind: 'xp', amount: 200 }, { kind: 'cash', amount: 4_000 }] },
};

/**
 * A moment opens at the first start of a day that is no more than this many
 * hours before it. Days start a day apart, so it is always open a day and a
 * half or more before the moment comes.
 */
export const MOMENT_OPEN_HOURS = 60;
export const MOMENT_LEAST_HOURS = 36;
/** Finals week is measured this many minutes before it ends: its Stress, as the last exams are sat. */
export const FINALS_MEASURE_BEFORE = 60;
/** How far over the Stress finals would bring a campus that changes nothing the ask may go: it rewards holding steady. */
export const FINALS_ROOM = 3;
/** The share of the seniors, as they stand when the moment opens, that commencement asks to see graduate. */
export const COMMENCEMENT_SHARE = 0.95;
/** A moment that went by unmet leaves the board this long after: nothing is lost, and the next comes next year. */
export const MOMENT_MISSED_HOURS = 24;
