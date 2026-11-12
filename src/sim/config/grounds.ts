import type { PlacedFamily } from './placed';
import { MIN_WINDOW_TICKS } from './time';

/**
 * Grounds: litter, bins, seating and the workers of a Facilities Yard.
 * Every number is a tuning target [T]. See DESIGN.md section 29.
 */

/** Litter, bins and workers are worked out this often, on the beat incidents already use. */
export const GROUNDS_EVAL_TICKS = 20;

/** The most litter that can lie around one spot. At the ceiling the spot is DIRT_AT_CEILING dirty. */
export const LITTER_CEILING = 100;
/** A spot at its ceiling is about 30% clean. */
export const DIRT_AT_CEILING = 0.7;
/** The thin litter along paths nobody sweeps. Alone it never takes a lot below 85% clean. */
export const PATH_DIRT = 0.15;

/** Litter a full, busy spot drops at each check, before its kind is counted. */
export const DROP_BUSY = 4;
/** Students in a spot's reach at which it is as busy as it gets. */
export const SPOT_FULL_AT = 250;
/** How much litter each kind of place makes: food high, the store medium, recreation low. */
export const LITTER_STRENGTH: Partial<Record<PlacedFamily, number>> = { dining: 1, store: 0.6, recreation: 0.35 };
/** Dirt invites dirt: a spot at its ceiling draws this much more. */
export const DIRT_INVITES = 0.5;
/** A mess spot's litter is felt by the lots this near it, when its own reach is smaller. */
export const MESS_REACH_MIN = 3;

/** A bin catches this share of what is dropped within BIN_REACH cells of it. */
export const BIN_CATCH = 0.85;
export const BIN_REACH = 3;
/** What a bin holds. A full bin catches nothing until it is emptied. */
export const BIN_CAPACITY = 40;

/** What one worker gets done at each check: this much litter swept, or its worth in bins emptied and things fixed. */
export const WORK_PER_WORKER = 2.2;
/** Bin contents one unit of work empties. Emptying a whole bin is about six units. */
export const BIN_PER_WORK = BIN_CAPACITY / 6;
/** The work it takes to fix one broken thing: about half an hour of one worker's time. */
export const FIX_WORK = 3.3;
/** A yard opens with this many workers and holds at most this many. */
export const YARD_START_WORKERS = 1;
export const YARD_MAX_WORKERS = 4;
/** A worker's wage for a game year: about $36 a real hour. */
export const WAGE_PER_YEAR = 6_000;

/** Above this much litter, something near the spot may get broken. */
export const BREAK_AT = 0.7 * LITTER_CEILING;
/** The chance at each check, for a campus of middling happiness, outside any Campus Safety circle. */
export const BREAK_RATE = 0.04;
/** Inside a Campus Safety circle it is a quarter as likely. */
export const BREAK_SAFETY_SHARE = 0.25;
/** A spot loses at most one thing in this long. */
export const BREAK_EVERY_TICKS = 24 * 60;
/** Things this near a dirty spot can be the one that breaks. */
export const BREAK_REACH = 4;

/** A lamp's panel says when a worker will have fixed it, looking this many checks ahead: three days. */
export const FIX_LOOKAHEAD_CHECKS = (3 * 24 * 60) / GROUNDS_EVAL_TICKS;

/** Seating: what each thing is worth to the lots within SEAT_REACH cells, and how much is plenty. */
export const SEAT_REACH = 3;
export const SEAT_UNITS = { quad: 0.5, bench: 1, table: 1.5 } as const;
export const SEATS_PLENTY = 1.5;
/** A picnic table near a dining building or an Academic lot adds this many social spots. */
export const SOCIAL_SPOTS_PER_TABLE = 2;

/** On an upgraded save no litter falls for this long, so the player reads about it first. */
export const GROUNDS_QUIET_TICKS = MIN_WINDOW_TICKS;

/** Told as jokes. Mischief, never crime: nobody is caught, and a worker fixes it. */
export const BREAK_LINES: Record<'bin' | 'bench' | 'table' | 'lamp', readonly string[]> = {
  bin: ['A trash bin has been used as a goal, and lost.', 'A trash bin was seen rolling down the path by itself.'],
  bench: ['A bench has lost an argument with a skateboard.', 'A bench has a leg missing. Nobody saw anything.'],
  table: ['A picnic table hosted one tug-of-war too many.', 'A picnic table has been stacked on by too many people at once.'],
  lamp: ['A street lamp met a stray frisbee and went dark.', 'A street lamp has stopped working after a very ambitious kick.'],
};

/** The same two stories about a street lamp, as its own panel tells them. In the order of BREAK_LINES.lamp. */
export const LAMP_BROKE_BY: readonly string[] = ['A stray frisbee hit it', 'Somebody tried a very ambitious kick'];
