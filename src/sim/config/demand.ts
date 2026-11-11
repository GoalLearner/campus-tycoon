/**
 * [T] First-playable stand-ins for demand. One applicant pool, drawn by word
 * of mouth and by how pleasant the campus is. Layer 2 replaces this with the
 * three applicant tiers. See DESIGN.md sections 7 and 21.
 */

/** Students expected in the very first class. */
export const FOUNDING_CLASS = 400;

/** Fall applicants who would enrol, per student already on campus. */
export const WORD_OF_MOUTH = 0.9;

/** The spring class as a share of a fall class. */
export const SPRING_SHARE = 0.2;

/** No fall class is expected to be larger than this. Stand-in for demand ceilings. */
export const POOL_CEILING = 4_000;

/** Beds needed per student. Stand-in for the tier mix. */
export const BED_NEED = 0.6;

/** Share of each class that stays on at the end of a semester. Stand-in for approval. */
export const RETENTION_PER_SEMESTER = 0.97;

/** The pool is scaled by FLOOR + SPAN * (average desirability / 100). */
export const DESIRABILITY_DRAW_FLOOR = 0.6;
export const DESIRABILITY_DRAW_SPAN = 0.8;
