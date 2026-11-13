import { TICKS_PER_HOUR } from './time';
import type { PlacedFamily } from './placed';

/**
 * The daily layer (DESIGN.md section 42), its first stop: the University
 * Level, Gold Seals and collecting. Only a game with goals has it, as only
 * such a game has the cap and the policies.
 *
 * Everything here is a bonus. Nothing below can hurt a campus, nothing needs
 * a tap to keep, and nothing is lost by being away for up to 36 hours.
 *
 * Every size is [T].
 */

// ------------------------------------------------------------ experience --

/**
 * What earns experience. Each is one entry, so a later stop adds its own
 * (an order done, the daily gift) with no new code on the Level page.
 * `itself` is true for what happens with nobody tapping: a once-a-day player
 * earns those too.
 */
export interface XpSource {
  /** As the Level page says it. */
  name: string;
  /** Experience each time, or 0 where the amount is worked out (collecting pays what the building held). */
  xp: number;
  itself: boolean;
  /** Said after the amount on the Level page, for the ones that are worked out. */
  note?: string;
}

export const XP_SOURCES = {
  collect: { name: 'Collecting from a building', xp: 0, itself: false, note: 'by how long it has filled' },
  order: { name: 'An order done on the board', xp: 0, itself: false, note: 'what the order pays' },
  placed: { name: 'A building you place opens', xp: 40, itself: false },
  opened: { name: 'A dorm or lecture hall opens', xp: 15, itself: false },
  homeGame: { name: 'A home game, collected at the stadium', xp: 40, itself: false },
  grew: { name: 'A dorm or lecture hall grows', xp: 10, itself: true },
  classIn: { name: 'A class moves in', xp: 80, itself: true },
  homeWin: { name: 'A home win', xp: 60, itself: true },
  graduation: { name: 'Graduation', xp: 200, itself: true },
  rankGoal: { name: 'A rank goal reached', xp: 300, itself: true },
  sizeGoal: { name: 'A full campus', xp: 300, itself: true },
  era: { name: 'An era begins', xp: 500, itself: true },
} as const satisfies Record<string, XpSource>;

export type XpSourceId = keyof typeof XP_SOURCES;

// ----------------------------------------------------------------- levels --

/** Experience to go from level 1 to level 2, how much more each level asks, and the most any level asks. */
export const LEVEL_FIRST = 60;
export const LEVEL_STEP = 40;
export const LEVEL_MOST = 800;

/**
 * What a level gives. Seals now. A decoration, a workshop recipe or a kind
 * of order comes with a later stop: each is one more kind here, and one more
 * entry in `LEVEL_UNLOCKS`.
 */
export type LevelGift = { kind: 'seals'; count: number } | { kind: 'unlock'; what: 'decoration' | 'recipe' | 'order' | 'slot'; id: string; name: string };

/** Gold Seals for every level reached, and for every fifth level. */
export const SEALS_PER_LEVEL = 1;
export const SEALS_FIFTH_LEVEL = 3;

const order = (id: string, name: string): LevelGift => ({ kind: 'unlock', what: 'order', id, name });
const slot = (name: string): LevelGift => ({ kind: 'unlock', what: 'slot', id: 'orders', name });

/**
 * What a level opens besides its Seals, by the level reached. The orders
 * board (42.3) gave the levels their first: a fourth and a fifth order open
 * at once, and kinds of order by their id in `ORDER_KINDS`. A kind not
 * listed here is open from the start. Decorations and recipes come with the
 * stops that have them.
 */
export const LEVEL_UNLOCKS: Readonly<Record<number, readonly LevelGift[]>> = {
  3: [order('safer', 'orders about Safety & health')],
  4: [order('fedAndBusy', 'orders about Food & fun')],
  5: [slot('a fourth order on the board')],
  7: [order('benches', 'orders about benches')],
  9: [order('cleaner', 'orders about litter')],
  11: [order('homeWin', 'orders about home wins')],
  13: [order('sellOuts', 'orders about a full stadium')],
  16: [order('keepStudents', 'orders about students who stay')],
  20: [slot('a fifth order on the board')],
  23: [order('noWaitlist', 'orders about the waitlist')],
  26: [order('parkingOk', 'orders about parking')],
};

// ------------------------------------------------------------- Gold Seals --

/** Seals for a rank goal, for a full campus, and for an era, on the day each is reached. */
export const SEALS_RANK_GOAL = 5;
export const SEALS_SIZE_GOAL = 5;
export const SEALS_ERA = 10;

/** "Finish now" costs one Seal for each of these hours left, and never less than one. */
export const SEAL_HOURS = 6;

// ------------------------------------------------------------- collecting --

/**
 * A building holds what this many hours fill and no more, and shows its marker once it has filled for this many.
 * The most is counted in time, so a store that fills faster after a win holds more, and a player who comes once
 * a day never finds one that has stopped filling.
 */
export const COLLECT_HOURS = 36;
export const COLLECT_READY_HOURS = 6;

/**
 * Which buildings fill, by family, and what an hour is worth: experience,
 * and a little cash on the small campus's count. The cash is a rate with a
 * cap, so a year of it is a known small sum whatever the player does.
 */
export const COLLECT: Partial<Record<PlacedFamily, { xpPerHour: number; cashPerHour: number }>> = {
  dining: { xpPerHour: 0.8, cashPerHour: 2 },
  store: { xpPerHour: 1.2, cashPerHour: 3 },
};

/** The campus store fills this many times as fast for this long after a home win. */
export const STORE_WIN_TIMES = 2;
export const STORE_WIN_TICKS = 24 * TICKS_PER_HOUR;

/** The stadium after a home game: a little cash for each on the small campus's count, and how many games it holds. */
export const GAME_CASH = 150;
export const GAMES_HELD = 3;

/** How many opening bonuses a real day gives at most, so building and clearing is not a way to level. */
export const OPENINGS_PER_DAY = 12;

/** A game new to the layer finds its buildings holding this many hours' worth: full, so the first sitting has something to tap. */
export const HEAD_START_HOURS = 36;
