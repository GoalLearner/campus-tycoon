/**
 * Grades and going to class (DESIGN.md 65.4). Every size marked [T] is tuning.
 */

/**
 * The spread of grade point averages at public doctoral universities, NPSAS:16 (NCES): 13% at 3.75 and up, 27% from
 * 3.25, 29% from 2.75, 19% from 2.25, 8% from 1.75 and 4% below. As points of the share of students below each grade,
 * with the lowest and highest a card shows at the ends.
 */
export const GPA_QUANTILES: ReadonlyArray<readonly [number, number]> = [
  [0, 0.8],
  [0.04, 1.75],
  [0.12, 2.25],
  [0.31, 2.75],
  [0.6, 3.25],
  [0.87, 3.75],
  [1, 4.0],
];

/** The lowest grade point average a card shows. */
export const GPA_FLOOR = 0.8;

/**
 * [T] Academic probation is an average below 2.0, which is 8% of students at the real spread; the Dean's list is a
 * semester at 3.5 and up, about a quarter of them. Each school sets its own lines; these are the common ones.
 */
export const PROBATION_BELOW = 2.0;
export const DEANS_LIST_FROM = 3.5;

/**
 * [T] Where a student sits in the spread, in standard steps: how some natures study and others do not (the old
 * grade tilts, as steps), a little lower in the first year and higher by the last, and fifth- and sixth-year seniors
 * lower. Weighed by how common each nature is, the tilts come to nearly nothing, so the campus keeps the real spread.
 */
export const GPA_Z_TILT: Partial<Record<string, number>> = {
  scholar: 0.6,
  stressed: 0.25,
  superfan: -0.1,
  lost: -0.1,
  clown: -0.25,
  party: -0.35,
  superSenior: -0.3,
  slacker: -0.6,
};
export const GPA_Z_CLASS_YEAR: readonly number[] = [-0.12, 0, 0.06, 0.12, -0.1, -0.15];

/**
 * [T] Teaching moves the whole campus: this many steps for all of the range from the worst taught to the best, from
 * a typical campus's teaching, where the campus has the real spread. Tutoring (83.4) lifts a student this
 * many steps. GPA_CENTRE is set so a typical model campus, with its tutoring and its natures, sits on the real spread.
 */
export const TEACH_Z = 0.6;
export const TEACH_TYPICAL = 0.75;
export const TUTOR_Z = 0.25;
export const GPA_CENTRE = 0.08;

/** [T] How much a semester's grades wander from a student's usual: a share of the spread. */
export const TERM_NOISE = 0.55;

/**
 * Going to class (DESIGN.md 65.4). About a third of seats are empty on a typical day at a large public university
 * (Romer, Journal of Economic Perspectives, 1993; a small, older study: judgement fills in). [T] The typical student
 * goes to this share of their classes, the spread around it, and how each nature leans; then a week's own luck, what
 * Friday, wet weather and the morning after a party take, of a week of this many classes, two of them on Friday.
 */
export const ATTEND_MEAN = 0.76;
export const ATTEND_SPREAD = 0.1;
export const ATTEND_TILT: Partial<Record<string, number>> = { scholar: 0.1, stressed: 0.05, slacker: -0.18, party: -0.08, clown: -0.05, allNighter: -0.06, superSenior: -0.08 };
export const ATTEND_WEEK = 0.05;
export const ATTEND_FRIDAY = 0.15;
export const ATTEND_WEATHER = 0.05;
export const ATTEND_PARTY = 0.2;
export const ATTEND_CLASSES = { week: 12, friday: 2 } as const;
