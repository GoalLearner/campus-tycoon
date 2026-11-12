import { ROAD_COST } from './town';

/** [T] Every number here is a tuning target for the first playable. */

export const START_CASH = 400_000;

/**
 * Stand-ins for the three price levers, which arrive in layer 2. Every student
 * pays tuition. A student in a dorm pays the room fee as well. With six in ten
 * in a dorm the two come to the flat $10,000 a student they replaced.
 */
export const TUITION_PER_STUDENT_PER_YEAR = 8_200;
/**
 * [T] Tuition at a school that was already standing: a game begun on the
 * model campus (DESIGN.md 37.11). Its size is held by its applicants, so it
 * cannot outgrow its costs as a small campus does, and it is tuned to keep
 * $12 to $17 of every $100 when it is run well.
 */
export const TUITION_ESTABLISHED_PER_YEAR = 8_750;
/**
 * On such a game marketing is priced by the school's reach and not by its
 * head count, since reach is what it lifts: so much for each student of the
 * size a model campus opens at.
 */
export const MARKETING_PRICED_FOR_STUDENTS = 46_000;
export const ROOM_FEE_PER_BED_PER_YEAR = 3_000;

/**
 * What the money buys (DESIGN.md section 31). Every line is at full funding:
 * the five sliders that will set pay and funding arrive in layer 2. The
 * numbers are tuned to a margin, not to a real university's books: about 15
 * of every 100 dollars is left for projects in mid-game, and payroll is more
 * than half of what is spent.
 */

/** Faculty: one for every this many students, the class-size target. */
export const CLASS_SIZE = 20;
export const FACULTY_PAY = 58_000;
/** Staff: admissions, advisors, administration, IT and dining. */
export const STUDENTS_PER_STAFF = 40;
export const STAFF_PAY = 42_000;
/** Medical Center and Campus Safety staff: one for every this many students in the building's circle. */
export const STUDENTS_PER_CARE_STAFF = 800;
export const CARE_STAFF_PAY = 42_000;
/** Paid on top of all pay: faculty, staff, safety and medical staff, and maintenance workers. */
export const BENEFITS_SHARE = 0.3;

/** Utilities for a hand-placed building, by the cells it stands on. Courts and fields have lights and little else. */
export const UTILITIES_PER_CELL = 1_500;
export const UTILITIES_PER_OPEN_CELL = 400;

export const SUPPLIES_PER_STUDENT = 650;
export const PROGRAMS_PER_STUDENT = 500;
export const INSURANCE_PER_STUDENT = 220;

/**
 * Recruiting and marketing: five steps, from off. A step costs more on a
 * bigger campus, because it is paid by the student, and each lifts
 * applications by less than the one before.
 */
export const MARKETING_LIFT: readonly number[] = [0, 0.05, 0.09, 0.12, 0.14];
export const MARKETING_COST_PER_STUDENT: readonly number[] = [0, 60, 120, 180, 240];

/** Cash paid into the endowment never comes back out. It earns this share of itself every game year, for good. */
export const ENDOWMENT_YIELD = 0.02;

/**
 * The single flat cost the game ran on until play stop 5, and the wage of the
 * time. A save from before then starts from these and climbs to the lines
 * above in this many daily steps: one game year.
 */
export const LEGACY_COST_PER_STUDENT_PER_YEAR = 6_500;
export const LEGACY_WAGE_PER_YEAR = 6_000;
export const PHASE_STEPS = 7;

/** One-off costs the player pays for permission and conditions, in the small game. Read them through `paintCost`. */
export const COST = {
  path: 2_000,
  /** A cell of road. Its upkeep is in config/town.ts. */
  road: ROAD_COST,
  quad: 15_000,
  /** One tree on one cell. Three trees lift nearby lots about as much as one quad cell, for a little more money. */
  tree: 6_000,
  zoneLot: 15_000,
  /** Clearing is free. What comes back is set by the refund rule below. */
  clear: 0,
} as const;

/** What laying one cell costs on a campus of a given scale (DESIGN.md 35.7). */
export function paintCost(what: keyof typeof COST, scale: number): number {
  return COST[what] * scale;
}

/**
 * Refunds. Clearing something within this many ticks of paying for it is an
 * undo: the whole price comes back. A tick is a minute, so the player always
 * has at least one full minute. After that, clearing returns a share.
 */
export const UNDO_TICKS = 1;
export const REFUND_SHARE = 0.5;
