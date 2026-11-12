/**
 * [T] First-playable stand-ins for demand. One applicant pool, drawn by word
 * of mouth and by how pleasant the campus is. Layer 2 replaces this with the
 * three applicant tiers. See DESIGN.md sections 7 and 21.
 */

/** Students expected in the very first class. */
export const FOUNDING_CLASS = 400;

/**
 * A campus opens with all four class years, not only freshmen (the owner,
 * 2026-11-11). The founding class is split in these shares: freshmen,
 * sophomores, juniors, seniors. Slightly fewer seniors.
 */
export const FOUNDING_SHARES: readonly [number, number, number, number] = [0.27, 0.26, 0.25, 0.22];

/** Fall applicants who would enrol, per student already on campus. */
export const WORD_OF_MOUTH = 1.0;

/** The spring class as a share of a fall class. */
export const SPRING_SHARE = 0.2;

/** No fall class is expected to be larger than this. Stand-in for demand ceilings. */
export const POOL_CEILING = 4_000;

/** Beds needed per student. Stand-in for the tier mix. */
export const BED_NEED = 0.6;

/**
 * Share of each class that stays on at the end of a semester. It follows
 * happiness: the floor at none, the floor plus the span at full. A campus with
 * no dining or recreation sits near the old flat 0.97.
 */
export const RETENTION_FLOOR = 0.95;
export const RETENTION_SPAN = 0.045;

/** The pool is scaled by FLOOR + SPAN * (average desirability / 100). */
export const DESIRABILITY_DRAW_FLOOR = 0.6;
export const DESIRABILITY_DRAW_SPAN = 0.8;
