import { calendarAt, dateAt } from '../calendar';
import { DRINKING_AGE, ENTRY_AGE, GAP_YEAR_SHARE, UNDER_21_DRINKING } from '../config/fourYears';
import { partiesOn, partyScene } from './parties';
import { hashInts } from '../rng';
import type { Clock, GameState } from '../types';
import type { StudentRef } from './students';

/**
 * Birthdays and turning 21 (R2, DESIGN.md 66.2). Each student's birthday is theirs from the seed, nothing is saved, and
 * their age follows the calendar: 18 at their first fall (a few a year older, from a year out first), a year older at
 * each birthday. So most turn 19 in their first year and 21 in their third, and who may drink is who is 21.
 */

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** The academic year begins on the fall's first day, Aug 19: a birthday on or after it this year has not passed yet. */
const YEAR_STARTS: readonly [number, number] = [8, 19];

const roll = (seed: number, ref: StudentRef, salt: number): number => (hashInts(seed, 4811, ref.entryYear, ref.index, salt) >>> 0) / 4294967296;

/** A student's birthday, month 1 to 12 and day: any day of the year as likely as another. */
export function birthdayOf(seed: number, ref: StudentRef): { month: number; day: number } {
  let left = Math.floor(roll(seed, ref, 1) * 365);
  for (let m = 0; m < 12; m++) {
    if (left < MONTH_DAYS[m]!) return { month: m + 1, day: left + 1 };
    left -= MONTH_DAYS[m]!;
  }
  return { month: 12, day: 31 };
}

/** Days from the year's start (Aug 19) to a date, 0 to 364. */
export function dayOfYear(month: number, day: number): number {
  const ordinal = (m: number, d: number): number => MONTH_DAYS.slice(0, m - 1).reduce((sum, n) => sum + n, 0) + d - 1;
  return (ordinal(month, day) - ordinal(YEAR_STARTS[0], YEAR_STARTS[1]) + 365) % 365;
}

export interface Age {
  age: number;
  /** "Mar 3". */
  birthday: string;
  /** Today is their birthday, and the one that made them 21. */
  today: boolean;
  turned21Today: boolean;
  over21: boolean;
}

/** How old a student is today, and their birthday. */
export function ageOf(seed: number, ref: StudentRef, clock: Pick<Clock, 'tick' | 'week'>): Age {
  const birthday = birthdayOf(seed, ref);
  const date = dateAt(clock);
  const years = Math.max(0, calendarAt(clock).year - ref.entryYear);
  const passed = dayOfYear(birthday.month, birthday.day) <= dayOfYear(date.month, date.day);
  const gap = roll(seed, ref, 2) < GAP_YEAR_SHARE ? 1 : 0;
  const age = ENTRY_AGE + gap + years + (passed ? 1 : 0);
  const today = birthday.month === date.month && birthday.day === date.day;
  return { age, birthday: `${MONTH_SHORT[birthday.month - 1]} ${birthday.day}`, today, turned21Today: today && age === DRINKING_AGE, over21: age >= DRINKING_AGE };
}

/**
 * Of a class year, the share who are 21 or over today, worked out from the calendar, not by drawing: a student's day of
 * birth is even through the year. Used for the campus's figures; a card reads the student's own.
 */
export function over21Share(classYear: number, clock: Pick<Clock, 'tick' | 'week'>): number {
  const date = dateAt(clock);
  const passedShare = (dayOfYear(date.month, date.day) + 1) / 365;
  const share = (base: number): number => (base >= DRINKING_AGE ? 1 : base === DRINKING_AGE - 1 ? passedShare : 0);
  return (1 - GAP_YEAR_SHARE) * share(ENTRY_AGE + classYear) + GAP_YEAR_SHARE * share(ENTRY_AGE + 1 + classYear);
}

/**
 * The campus's drinking figures (R2, the owner's decision 8): the share of students 21 or over, how many under 21 drank
 * in the past month, and last semester's write-ups. A game with no parties has none of them.
 */
export function drinkingFigures(state: GameState): { over21: number; under21Drank: number; writeUps: number | null } | null {
  if (!partiesOn(state)) return null;
  let students = 0;
  let over = 0;
  state.cohorts.forEach((n, classYear) => {
    students += n;
    over += n * over21Share(classYear, state.clock);
  });
  if (students <= 0) return null;
  const under = students - over;
  return { over21: over / students, under21Drank: Math.round(under * Math.min(1, UNDER_21_DRINKING * partyScene(state))), writeUps: state.admissions.lastSemester?.writeUps ?? null };
}
