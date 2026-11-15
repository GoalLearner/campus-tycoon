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
 * sophomores, juniors, seniors, and since R1 the fifth- and sixth-year seniors
 * a standing school has (DESIGN.md 65.2): a flagship's classes as they stand.
 */
export const FOUNDING_SHARES: readonly [number, number, number, number, number, number] = [0.255, 0.235, 0.22, 0.21, 0.06, 0.02];

/** Fall applicants who would enrol, per student already on campus. */
export const WORD_OF_MOUTH = 1.0;

/** The spring class as a share of a fall class. */
export const SPRING_SHARE = 0.2;

/** No fall class is expected to be larger than this. Stand-in for demand ceilings. */
export const POOL_CEILING = 4_000;

/** Beds needed per student. Stand-in for the tier mix. */
export const BED_NEED = 0.6;

/** The pool is scaled by FLOOR + SPAN * (average desirability / 100). */
export const DESIRABILITY_DRAW_FLOOR = 0.6;
export const DESIRABILITY_DRAW_SPAN = 0.8;
