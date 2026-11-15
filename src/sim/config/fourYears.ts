import type { MajorGroup } from './students';

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

// ------------------------------------------------- the milestones of four years --


/**
 * By senior year, the share who did each (NSSE 2025's high-impact practices for seniors: an internship or field
 * placement about half, research with faculty 22-24%, a culminating senior experience 42-43%; Open Doors 2025: about one
 * graduate in nine studied abroad, most of them for a summer or less).
 */
export const BY_SENIOR_YEAR = { internship: 0.5, research: 0.23, capstone: 0.42, abroad: 0.12 } as const;
export type Practice = keyof typeof BY_SENIOR_YEAR;

/** How much more or less often a field's students do each, against the campus as a whole. [T, the shape from NSSE by field] */
export const PRACTICE_TILT: Readonly<Record<MajorGroup, Readonly<Record<Practice, number>>>> = {
  engineering: { internship: 1.3, research: 1.4, capstone: 1.6, abroad: 0.6 },
  sciences: { internship: 0.8, research: 1.8, capstone: 1.1, abroad: 0.9 },
  letters: { internship: 0.9, research: 0.8, capstone: 1, abroad: 1.4 },
  business: { internship: 1.4, research: 0.4, capstone: 0.8, abroad: 1.1 },
  education: { internship: 1.3, research: 0.5, capstone: 1.1, abroad: 0.6 },
  music: { internship: 0.6, research: 0.5, capstone: 1.4, abroad: 1.1 },
  arts: { internship: 0.8, research: 0.5, capstone: 1.4, abroad: 1.3 },
  health: { internship: 1.2, research: 0.9, capstone: 0.8, abroad: 0.5 },
};

/** Of those who study abroad, the share away for a semester (spring of their third year); the rest go for a summer. */
export const ABROAD_SEMESTER = 0.4;
/** Of interns, the share whose internship is the summer after their second year; the rest after their third. */
export const INTERN_EARLY = 0.3;

/** Where students study abroad: the most chosen places (Open Doors 2025). */
export const ABROAD_PLACES: readonly string[] = ['the United Kingdom', 'Italy', 'Spain', 'France', 'Germany', 'Ireland', 'Japan', 'Costa Rica', 'Australia', 'South Korea', 'Mexico', 'Greece'];

/** Where a field's students intern, in plain words, never a real company. */
export const INTERN_PLACES: Readonly<Record<MajorGroup, readonly string[]>> = {
  engineering: ['an engineering firm', 'a power company', 'a robotics startup'],
  sciences: ['a research lab in the city', 'a biotech company', 'the state parks service'],
  letters: ['a nonprofit', 'a newspaper', 'the state legislature'],
  business: ['a bank in the city', 'an accounting firm', 'a marketing agency'],
  education: ['a school district', 'an after-school program'],
  music: ['a recording studio', 'the city orchestra'],
  arts: ['a design studio', 'a museum'],
  health: ['a hospital', 'a clinic', 'the county health department'],
};

/** What a field's culminating senior work is called. */
export const CAPSTONE_NAME: Readonly<Record<MajorGroup, string>> = {
  engineering: 'a senior design project',
  sciences: 'a senior thesis',
  letters: 'a senior thesis',
  business: 'a capstone project',
  education: 'student teaching',
  music: 'a senior recital',
  arts: 'a senior show',
  health: 'a capstone placement',
};

// ---------------------------------------------------------- after four years --

/**
 * Of seniors, the share with a job offer by commencement (NACE's 2026 student survey: 43%), and the share who start
 * graduate school within a year (NCES B&B:16/17: about 17%). A class's placement within six months (`PLACEMENT` in
 * alumni.ts: a job or more school, 55-95% with the rating) is as before, and matches first-destination surveys.
 */
export const OFFER_BY_COMMENCEMENT = 0.43;
export const GRAD_SCHOOL = 0.17;
/** How a field's seniors differ, against the class as a whole: offers come sooner in engineering and business, more go on to graduate school from the sciences and health. [T] */
export const OUTCOME_TILT: Readonly<Record<MajorGroup, { offer: number; grad: number }>> = {
  engineering: { offer: 1.45, grad: 0.9 },
  sciences: { offer: 0.75, grad: 1.9 },
  letters: { offer: 0.8, grad: 1 },
  business: { offer: 1.35, grad: 0.6 },
  education: { offer: 1.2, grad: 0.8 },
  music: { offer: 0.55, grad: 0.9 },
  arts: { offer: 0.6, grad: 0.7 },
  health: { offer: 1.1, grad: 1.5 },
};
/** Of the offers made by commencement, the share made in the fall; the rest come from January to May. [T] */
export const OFFERS_IN_FALL = 0.3;
/** Graduate schools say yes from mid-March. */
export const GRAD_ADMIT_FROM: readonly [number, number] = [3, 15];
