import { calendarAt, dateAt } from '../calendar';
import { FLU, HOMESICK, LONELY } from '../config/wellbeing';
import { hashInts } from '../rng';
import type { Clock } from '../types';

/**
 * Homesickness, loneliness and flu season (DESIGN.md 65.5): how common each is on a campus right now, and whether one
 * student has it, from the seed and the date. Nothing is stored. The campus numbers are the shares; a card is one
 * student's draw against them, so the cards across a campus come out at the shares.
 */

interface Ref {
  entryYear: number;
  index: number;
}

/** One salt per draw, apart from the card's, the majors' and the grades'. */
const SALT = { homesick: 71, strong: 72, lonely: 73, flu: 74, onset: 75, length: 76 } as const;

const unit = (seed: number, ref: Ref, salt: number, more: number): number => hashInts(seed, ref.entryYear, ref.index, salt, more) / 4294967296;

/** Days in each month from August, the academic year's first. */
const MONTH_DAYS = [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31];

/** Days since August 1 of the academic year: 0 on August 1, 364 on July 31. */
export function dayOfAcademicYear(month: number, day: number): number {
  const from = (month + 12 - 8) % 12;
  let days = 0;
  for (let m = 0; m < from; m++) days += MONTH_DAYS[m]!;
  return days + day - 1;
}

/** Move-in (August 19), two weeks before Thanksgiving (November 11), winter break (December 19) and the first day back (January 19). */
const MOVE_IN = dayOfAcademicYear(8, 19);
const THANKSGIVING = dayOfAcademicYear(11, 25);
const WINTER = dayOfAcademicYear(12, 19);
const BACK = dayOfAcademicYear(1, 19);

/**
 * The share of first-years who moved away from home who feel some homesickness now: most of them at move-in, fading
 * over the fall, a bump in the two weeks before Thanksgiving, a smaller one coming back from winter break.
 */
export function homesickShare(clock: Pick<Clock, 'tick' | 'week'>): number {
  const date = dateAt(clock);
  const d = dayOfAcademicYear(date.month, date.day);
  if (d < MOVE_IN) return HOMESICK.moveIn;
  if (d < WINTER) {
    const fading = HOMESICK.floor + (HOMESICK.moveIn - HOMESICK.floor) * Math.exp(-HOMESICK.fadePerDay * (d - MOVE_IN));
    const before = THANKSGIVING - d;
    return Math.min(1, fading + (before > 0 && before <= 14 ? HOMESICK.thanksgiving * (1 - before / 14) : 0));
  }
  if (d < BACK) return HOMESICK.spring;
  return HOMESICK.spring + HOMESICK.backFromBreak * Math.exp(-(d - BACK) / 10);
}

/**
 * Whether a first-year who moved away misses home now, and whether enough to read as Homesick. Each student's draw is
 * kept for the year, so as the share fades, students stop missing home one by one and none start again until the bump.
 */
export function homesickOf(seed: number, ref: Ref, clock: Pick<Clock, 'tick' | 'week'>): { missesHome: boolean; strong: boolean } {
  const share = homesickShare(clock);
  const year = calendarAt(clock).year;
  const draw = unit(seed, ref, SALT.homesick, year);
  const missesHome = draw < share;
  return { missesHome, strong: missesHome && draw < share * HOMESICK.strong };
}

export interface LonelyFacts {
  /** Ties close enough to count: friends, best friends, roommates and partners at LONELY_CLOSE_AT and up. */
  close: number;
  partnered: boolean;
  /** In a group of friends. */
  group: boolean;
  firstYear: boolean;
  /** Living in town: commuters are lonelier. */
  commuter: boolean;
}

/** The chance a student with these ties feels lonely: about half across a campus (DESIGN.md 65.5). */
export function lonelyChance(facts: LonelyFacts): number {
  const chance =
    LONELY.base +
    (facts.close === 0 ? LONELY.nobodyClose : facts.close === 1 ? LONELY.oneClose : 0) +
    (facts.firstYear ? LONELY.firstYear : 0) +
    (facts.commuter ? LONELY.commuter : 0) +
    (facts.partnered ? LONELY.partner : 0) +
    (facts.group ? LONELY.group : 0);
  return Math.max(0.03, Math.min(0.95, chance));
}

/** Whether a student feels lonely this semester, at their chance. */
export function lonelyOf(seed: number, ref: Ref, semester: number, facts: LonelyFacts): boolean {
  return unit(seed, ref, SALT.lonely, semester) < lonelyChance(facts);
}

/** Days into the flu season (December 1 is 0), or -1 outside it. */
export function fluSeasonDay(clock: Pick<Clock, 'tick' | 'week'>): number {
  const date = dateAt(clock);
  const d = dayOfAcademicYear(date.month, date.day) - dayOfAcademicYear(FLU.from[0], FLU.from[1]);
  return d >= 0 && d < FLU.days ? d : -1;
}

/** Where in the season a student falls ill, by a number in [0, 1): most of them late, around the season's height. */
function onsetAt(u: number): number {
  const c = FLU.peak;
  const share = u < c ? Math.sqrt(u * c) : 1 - Math.sqrt((1 - u) * (1 - c));
  return Math.floor(share * FLU.days);
}

/** Whether a student is down with the flu now, and how many days of it are left. */
export function fluOf(seed: number, ref: Ref, clock: Pick<Clock, 'tick' | 'week'>): { sick: boolean; daysLeft: number } {
  const day = fluSeasonDay(clock);
  if (day < 0) return { sick: false, daysLeft: 0 };
  const year = calendarAt(clock).year;
  if (unit(seed, ref, SALT.flu, year) >= FLU.share) return { sick: false, daysLeft: 0 };
  const onset = onsetAt(unit(seed, ref, SALT.onset, year));
  const length = FLU.shortest + Math.floor(unit(seed, ref, SALT.length, year) * (FLU.longest - FLU.shortest + 1));
  const sick = day >= onset && day < onset + length;
  return { sick, daysLeft: sick ? onset + length - day : 0 };
}

/** The share of a campus down with the flu now: zero outside the season, a few in a hundred at its height. */
export function fluShare(clock: Pick<Clock, 'tick' | 'week'>): number {
  const day = fluSeasonDay(clock);
  if (day < 0) return 0;
  // The onset spread over the season's days, each bout as long as the days it can last.
  const lengths = FLU.longest - FLU.shortest + 1;
  let p = 0;
  for (let length = FLU.shortest; length <= FLU.longest; length++) {
    const from = Math.max(0, day - length + 1);
    const at = (d: number): number => {
      // The share whose onset falls before day d.
      const x = Math.max(0, Math.min(1, d / FLU.days));
      return x < FLU.peak ? (x * x) / FLU.peak : 1 - ((1 - x) * (1 - x)) / (1 - FLU.peak);
    };
    p += (at(day + 1) - at(from)) / lengths;
  }
  return FLU.share * p;
}
