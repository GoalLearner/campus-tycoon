/**
 * Size goals, rank goals and eras for a game begun on the model campus
 * (DESIGN.md section 37). Every number marked [T] is a tuning target.
 */

/** The campus scale these head counts are written for: the model campus's own (35.7). At another scale they follow it. */
export const GOAL_SCALE = 28;

/** [T] The eight size goals, in students. One lands only at an intake, and is kept for good. */
export const SIZE_GOALS: readonly number[] = [50_000, 55_000, 60_000, 66_000, 73_000, 81_000, 90_000, 100_000];

/** The eight rank goals: Top 175 down to Top 10 of the 200. One lands only on rankings day, and is kept for good. */
export const RANK_GOALS: readonly number[] = [175, 150, 125, 100, 75, 50, 25, 10];

/** The four eras. The first is the start. */
export const ERAS: readonly string[] = ['Arrival', 'Growth', 'Flagship', 'Legacy'];
/** How many size goals open each later era: 55,000, 66,000 and 81,000 students. */
export const ERA_AT_SIZE: readonly number[] = [2, 4, 6];
/** How many rank goals open each later era: Top 125, Top 75 and Top 25. Either ladder opens one. */
export const ERA_AT_RANK: readonly number[] = [3, 5, 7];

/**
 * [T] The school's reach: the fall applicants a model campus draws before
 * its four causes are counted. A head count, so it follows the campus scale.
 */
export const REACH = 11_000;

/** [T] The most a rank adds to applicants: nothing at 200th, this much at 1st. */
export const RANK_LIFT = 0.55;

/** [T] A model campus's first rank lands near here: the ladder is there to climb. */
export const OPENING_RANK = 150;
/**
 * [T] How far the published rating moves toward this year's measure, each
 * rankings day. A school's standing follows what it does, a little a year.
 */
export const RANK_PULL = 0.08;
