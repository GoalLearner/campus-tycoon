/**
 * Capacity and faculty (DESIGN.md section 38): the people a campus employs
 * for its students, and what each need of a student asks of the campus.
 * Every number marked [T] is a tuning target.
 */

/**
 * [T] The Instruction slider: how many students the campus hires one member
 * of faculty for, at each step. A step is one student more or fewer to a
 * member of faculty, from 25, which is underfunded, to 15, which is well
 * funded. The middle step is full funding, and is the class-size target
 * every campus ran on before the slider existed (`CLASS_SIZE` in
 * config/money.ts).
 */
export const INSTRUCTION_RATIOS: readonly number[] = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15];
/** The step a campus opens on, and the step every older save loads on. */
export const INSTRUCTION_FULL = 5;

/**
 * [T] How a class's size is felt. At RATIO_BEST students to a member of
 * faculty teaching is as good as it gets, and at RATIO_WORST as stretched as
 * it gets: no ratio beyond either end counts for more, so a term of very
 * large classes is bounded. Half way between is full funding, and reads as
 * neither good nor bad.
 */
export const RATIO_BEST = 15;
export const RATIO_WORST = 25;

/**
 * [T] Staff are advisors as well as administration. Short of staff, the
 * support a campus gives against Stress is worth this much less at the very
 * worst: with half the staff it needs, or fewer.
 */
export const STAFF_SUPPORT_LOSS = 0.3;
export const STAFF_WORST_SHARE = 0.5;

/** [T] Of the students a place to eat feeds, this share want a meal there at the busiest hour of the day. */
export const MEAL_SHARE = 0.1;

/**
 * [T] How full a need is before the Capacity page calls it tight. A need
 * with less than it requires is short.
 */
export const TIGHT_FROM = 0.9;
/** [T] The share of students inside a Medical Center's or a Campus Safety circle, under which coverage is tight, and short. */
export const COVER_OK = 0.9;
export const COVER_SHORT = 0.6;
/** [T] A ratio this far over its target is tight: a twentieth. Twice that is short. */
export const RATIO_TIGHT = 0.02;
export const RATIO_SHORT = 0.1;

/**
 * Faculty and staff are hired and leave a semester behind the students on a
 * game with goals. Set, every game would do the same. It is not: the small
 * campus is the base the long runs at scale 1 were tuned on, it doubles in
 * size each year, and no player is offered it (DESIGN.md 38.5).
 */
export const LAG_EVERY_GAME = false;
