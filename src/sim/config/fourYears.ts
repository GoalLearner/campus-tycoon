/**
 * Four years, R2 of the realism pass (DESIGN.md 66, approved 2026-11-14, "Yes, all ten"): the figures for move-in and
 * welcome week, parents' weekend, the year's rhythm, birthdays and turning 21, where students live by class year, the
 * milestones of four years, what seniors go on to, and family. Each figure names its source in DESIGN.md 66.
 */

// ------------------------------------------------------------- the year --

/** Of students, the share whose family visits on parents' weekend. [T] */
export const PARENTS_VISITING = 0.4;

/**
 * The year's stretches as students feel them (the day line names them): of students, the share each is felt by, its
 * feeling and its weight among a card's feelings. Finals crunch weighs more with Stress.
 */
export const RHYTHM_FEELINGS: Readonly<Record<string, { share: number; emotion: 'happy' | 'excited' | 'sad' | 'tense'; label: string; weight: number }>> = {
  fallStartWeeks: { share: 0.7, emotion: 'excited', label: 'Fall energy', weight: 0.9 },
  midtermSlump: { share: 0.6, emotion: 'sad', label: 'Midterm slump', weight: 1 },
  fallCrunch: { share: 0.8, emotion: 'tense', label: 'Finals crunch', weight: 1.1 },
  springStartWeeks: { share: 0.6, emotion: 'happy', label: 'A new semester', weight: 0.8 },
  springFatigue: { share: 0.55, emotion: 'sad', label: 'Spring fatigue', weight: 0.9 },
  springFatigueLate: { share: 0.55, emotion: 'sad', label: 'Spring fatigue', weight: 0.9 },
  springCrunch: { share: 0.8, emotion: 'tense', label: 'Finals crunch', weight: 1.1 },
};

// -------------------------------------------------------- birthdays, 21 --

/**
 * A student is this old at their first fall and has a birthday spread evenly through the year, so most turn 19 in
 * their first year and 21 in their third; a few took a year out first and are a year older (about 6%, NCES's
 * delayed entry). [T for the share]
 */
export const ENTRY_AGE = 18;
export const GAP_YEAR_SHARE = 0.06;
/** The drinking age. */
export const DRINKING_AGE = 21;

/**
 * Under-21 drinking is counted (the owner's decision 8): it happens in the numbers and is caught as a rule broken.
 * Liquor-law write-ups at about 7 a year for every 1,000 students, 93% of them in the dorms (NCES Digest 329.10, Clery
 * figures for 2021), moved by the party scene and the party policies as calls from parties are.
 */
export const WRITE_UPS_PER_THOUSAND = 7;
export const WRITE_UPS_IN_DORMS = 0.93;
/** Of students under 21, the share who drank in the past month (NIAAA from NSDUH: about half of full-time students drank, fewer under 21). [T] */
export const UNDER_21_DRINKING = 0.35;

// ------------------------------------------------------ where they live --

/**
 * Of each class year (first-year to sixth-year), the share living on campus: nearly every first-year in a hall, and
 * most juniors and seniors moved into town (example flagships' Common Data Sets: first-years 58-89% on campus, all
 * students 18-50%). Each student's home follows these by class year, so moving off campus is a milestone of the
 * second and third years. Weighted by a campus's class sizes they come to about the 60% the beds and the town's places
 * are counted by (BED_NEED), which are as before: the balance does not move.
 */
export const ON_CAMPUS_BY_YEAR: readonly [number, number, number, number, number, number] = [0.88, 0.7, 0.45, 0.38, 0.3, 0.25];
