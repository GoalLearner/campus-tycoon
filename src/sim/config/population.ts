/**
 * Who stays, who finishes and when, and why the others leave (DESIGN.md 65.2). The figures are real, from:
 *
 * - NCES Digest of Education Statistics, table 326.30 (first-year retention, fall 2022 to fall 2023): 82% at all
 *   four-year publics, about 92% at selective publics (25-50% admitted), about 96% at the most selective.
 * - NCES Digest table 326.10 (graduation at the same school, 2017 starting cohort): 46% in four years and 63% in six
 *   at all publics; about 76% in six years at selective publics; about 91% at the most selective.
 * - NCES Beginning Postsecondary Students, BPS:12/17: about a quarter of public doctoral starters transfer out
 *   within six years, and stopping out (leaving and coming back) is common.
 *
 * A campus's standing (0 to 1) places it between three anchors: a weak campus, a selective public flagship, and the
 * most selective. Every share in between is read along the line between the two anchors either side.
 */

/** Class years held: freshman, sophomore, junior, senior, then fifth- and sixth-year seniors. */
export const CLASS_YEARS = 6;

/** The years a class has to finish in before it is counted: six, as the real figures are. */
export const YEARS_TO_FINISH = 6;

/**
 * A class's fifth- and sixth-year seniors are a run of its students from this place in the class. The named
 * regulars are chosen from the first 150 of a class (systems/regulars.ts), so they finish on time.
 */
export const LATE_FROM = 150;

export interface Anchor {
  /** Share of each class year (freshman to sixth-year) that leaves over a year. */
  leave: readonly [number, number, number, number, number, number];
  /** Share of those still enrolled at commencement who finish: seniors, fifth-year seniors, sixth-year seniors. */
  finish: readonly [number, number, number];
}

/**
 * [T] The three anchors, fitted so a class's path gives the real figures:
 * - weak: 82% back for a second year, 46% finish in four years, 58% in five, 63% in six;
 * - flagship: 92%, 57%, 72%, 76%;
 * - best: 96%, 80%, 90%, 91%.
 */
export const ANCHORS: { weak: Anchor; flagship: Anchor; best: Anchor } = {
  weak: { leave: [0.18, 0.1, 0.06, 0.025, 0.08, 0.1], finish: [0.68, 0.62, 0.65] },
  flagship: { leave: [0.08, 0.065, 0.035, 0.02, 0.06, 0.1], finish: [0.7, 0.66, 0.6] },
  best: { leave: [0.04, 0.025, 0.012, 0.006, 0.04, 0.08], finish: [0.87, 0.85, 0.8] },
};

/** [T] The share of a year's leavers who go at the end of the fall: most first-years finish their first year. */
export const FALL_SHARE: readonly number[] = [0.35, 0.45, 0.45, 0.45, 0.5, 0.5];

/**
 * [T] Standing is half the academic rank and half Happiness. Rank counts on a log scale from No. 200 (nothing) to
 * No. 5 (all of it); a campus not yet ranked counts as this. Happiness counts from 40 (nothing) to 90 (all of it).
 */
export const STANDING_RANK_WEIGHT = 0.5;
export const RANK_NONE = 200;
export const RANK_ALL = 5;
export const RANK_UNRANKED = 0.1;
export const HAPPY_NONE = 40;
export const HAPPY_ALL = 90;

/** Why a student left. */
export type LeaveWhy = 'transfer' | 'stoppedOut' | 'money' | 'grades' | 'homesick' | 'housing';
export const LEAVE_WHYS: readonly LeaveWhy[] = ['transfer', 'stoppedOut', 'money', 'grades', 'homesick', 'housing'];

/**
 * [T] How a semester's leavers split by reason, for first-years and for everyone after, before the campus moves
 * them: transferring is the most common way out (BPS:12/17), homesickness is a first-year reason, and a dorm student
 * with no bed is counted apart.
 */
export const LEAVE_WEIGHTS: Record<Exclude<LeaveWhy, 'housing'>, readonly [number, number]> = {
  transfer: [38, 45],
  stoppedOut: [17, 27],
  money: [15, 15],
  grades: [15, 13],
  homesick: [15, 0],
};

/** [T] How much of the transfer share a top rank takes away: a school near the top loses fewer to other schools. */
export const TRANSFER_RANK_EASE = 0.6;

/** [T] Of those who stop out, the share who come back, at the next fall intake, to their own class. */
export const RETURN_SHARE = 0.3;

/** What each reason is called, in a sentence about how many left: "{n} transferred". */
export const LEAVE_WORDS: Record<LeaveWhy, { verb: string; short: string }> = {
  transfer: { verb: 'transferred to other schools', short: 'transferred' },
  stoppedOut: { verb: 'stopped out, some to come back', short: 'stopped out' },
  money: { verb: 'left for money', short: 'money' },
  grades: { verb: 'were suspended for grades', short: 'grades' },
  homesick: { verb: 'went home homesick', short: 'homesick' },
  housing: { verb: 'had no bed to come back to', short: 'no bed' },
};

/** What would keep more of those who leave for each reason, for the Scorecard. */
export const LEAVE_FIX: Record<LeaveWhy, string> = {
  transfer: 'a better rank and a happier campus keep more of them',
  stoppedOut: 'a happier campus, and lower Stress, keep more of them',
  money: 'campus jobs and need-based scholarships keep more of them',
  grades: 'better teaching and tutoring keep more of them',
  homesick: 'friends and a happier first year keep more of them',
  housing: 'more beds keep them',
};

/**
 * [T] The rating's graduation input reads the six-year rate: nothing at 45% and all of it at 82%. Its retention input
 * reads first-year retention: nothing at 78% and all of it at 96%. Set so a campus reads about as it did before R1 at
 * each point of its climb (his decision 3, Hold): the rank goals keep their pace, and a weak campus reads well below.
 */
export const GRADUATION_LEVEL = { none: 0.45, all: 0.82 };
export const RETENTION_LEVEL = { none: 0.78, all: 0.96 };

/** The rates are an average over this many of the latest classes that have had their years. */
export const RATE_CLASSES = 3;
