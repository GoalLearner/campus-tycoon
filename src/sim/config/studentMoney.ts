import type { MajorGroup } from './students';

/**
 * [T] Money and daily life, R3 of the realism pass (DESIGN.md 67): each student's own money, at the real shares. The
 * sources, by name: NCES Digest table 331.10 and the College Board's Trends in Student Aid 2026 for aid and debt; NCES's
 * Condition of Education (college student employment, 2020) for jobs; GAO-24-107074 (2024) for running short of food;
 * NACS Student Watch 2025-26 for course materials; Yardi Matrix's 2026 student housing report for rent near big campuses.
 * Every figure is a draw for each student from the seed, against shares that land the campus on these; nothing is saved.
 */

/** Of full-time students, the share with each part of an aid package in a year: grants, federal loans, work-study. */
export const AID_SHARE = { grant: 0.73, loan: 0.44, workStudy: 0.09 } as const;

/**
 * A year's grant (Pell, the state's and the university's own together), in dollars: from this much to this much, more
 * for those with more need. A year's federal loan is the yearly limit for a dependent undergraduate by class year
 * ($5,500, $6,500, then $7,500), times a draw of the student's own, so those who borrow end their four years owing about
 * the real average with private loans counted. Work-study is about this much a year.
 */
export const GRANT_RANGE = [1_500, 11_000] as const;
export const LOAN_LIMIT_BY_YEAR: readonly number[] = [5_500, 6_500, 7_500, 7_500, 7_500, 7_500];
export const LOAN_TIMES = [0.72, 1.68] as const;
export const WORK_STUDY_PER_YEAR = 2_400;

/** Who has graduated owing anything, and what the borrowers owe on average (College Board 2026: 47%, $30,220). */
export const BORROWED_BY_GRADUATION = 0.47;
export const DEBT_AVERAGE = 30_220;

/** Of full-time students: the share with a job, and the share working 20 hours a week or more (NCES 2020). */
export const WORKING = 0.4;
export const WORKING_20_PLUS = 0.25;

/** Hours a week: below 20, and 20 or more. */
export const HOURS_UNDER_20 = [6, 18] as const;
export const HOURS_20_PLUS = [20, 30] as const;

/**
 * Where students work. On campus first with the Campus jobs program (half again as likely) and always for work-study;
 * in town otherwise. Plain places, never a real company.
 */
export const CAMPUS_JOBS = ['the library desk', 'a dining hall', 'the rec center front desk', 'the mailroom', 'a lab', 'the campus store', 'the tutoring center'] as const;
export const TOWN_JOBS = ['a coffee shop in town', 'a pizza place in town', 'a grocery store', 'a clothing store', 'a restaurant in town', 'a delivery app'] as const;
export const ON_CAMPUS_SHARE = 0.45;
export const CAMPUS_JOBS_TIMES = 1.5;

/** Running short of food money in a month (GAO 2024: 23% food insecure). Each policy multiplies the chance. */
export const RUNNING_SHORT = 0.23;
export const SHORT_EASE = { campusJobs: 0.8, needScholarships: 0.6 } as const;
/** The weeks after spring break, when a trip has emptied the account: this much more likely, for those who went. */
export const AFTER_SPRING_BREAK = 1.5;
/** Of students, the share who travel at spring break: the rest go home, stay, or work. */
export const SPRING_TRIP = 0.3;

/** Course materials for a year, on average (NACS 2025-26), by field: the sciences and engineering more, the arts less. */
export const TEXTBOOKS_PER_YEAR = 338;
export const TEXTBOOK_TILT: Readonly<Record<MajorGroup, number>> = {
  engineering: 1.35,
  sciences: 1.3,
  health: 1.25,
  business: 1,
  letters: 0.8,
  education: 0.9,
  music: 0.7,
  arts: 0.75,
};

/** Rent for a bed in town near a big campus, a month (Yardi Matrix 2026), and how far one student's is from it. */
export const RENT_PER_BED_MONTH = 928;
export const RENT_SPREAD = [0.82, 1.22] as const;
