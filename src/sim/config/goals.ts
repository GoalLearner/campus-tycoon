/**
 * The cap on enrollment, the goals and the eras of a game begun on the model
 * campus (DESIGN.md sections 37 and 38.4). Every number marked [T] is a
 * tuning target.
 */

/** The campus scale these head counts are written for: the model campus's own (35.7). At another scale they follow it. */
export const GOAL_SCALE = 28;

/**
 * The most students a game with goals may enrol, however much is built (the
 * owner, 2026-11-12; DESIGN.md 38.4). A head count, so it follows the campus
 * scale.
 */
export const ENROLLMENT_CAP = 50_000;

/** The one size goal: a full campus. It lands only at an intake, and is kept for good. */
export const SIZE_GOALS: readonly number[] = [ENROLLMENT_CAP];
/**
 * The eight size goals there were before the cap. A save from then may have
 * reached some above 50,000: it keeps them, and this is what they are called.
 */
export const SIZE_GOALS_ONCE: readonly number[] = [50_000, 55_000, 60_000, 66_000, 73_000, 81_000, 90_000, 100_000];

/** The eight rank goals: Top 175 down to Top 10 of the 200. One lands only on rankings day, and is kept for good. */
export const RANK_GOALS: readonly number[] = [175, 150, 125, 100, 75, 50, 25, 10];

/** The four eras. The first is the start. */
export const ERAS: readonly string[] = ['Arrival', 'Growth', 'Flagship', 'Legacy'];
/**
 * How many rank goals open each later era: Top 125, Top 75 and Top 25. The
 * rank alone opens an era now. One a save opened by its size, before the
 * cap, stays open.
 */
export const ERA_AT_RANK: readonly number[] = [3, 5, 7];

/**
 * [T] The school's reach: the fall applicants a model campus draws before
 * its four causes are counted. A head count, so it follows the campus scale.
 */
export const REACH = 11_000;

/**
 * [T] The most a rank adds to applicants: nothing at 200th, this much at 1st.
 * It was 0.55 while the top size goal was 100,000 students and needed it.
 * With the cap it is the quarter the owner approved (37.9).
 */
export const RANK_LIFT = 0.25;

/** [T] A model campus's first rank lands near here: the ladder is there to climb. */
export const OPENING_RANK = 150;
/**
 * [T] How far the published rating moves toward this year's measure, each
 * rankings day. A school's standing follows what it does, a little a year.
 */
export const RANK_PULL = 0.08;
/**
 * [T] The most the published rating moves in one year, up or down, in points
 * of the field's 0 to 100. With the cap every full campus turns applicants
 * away, and the rank goals are the long climb: this is what makes the best
 * run campus take months to reach the last of them.
 */
export const RANK_STEP = 1;
