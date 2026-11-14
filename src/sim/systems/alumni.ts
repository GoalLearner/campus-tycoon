import {
  AFFINITY_PARTS,
  AGE_LIFT,
  AGE_MOST,
  ALUMNI_HOUSE_LIFT,
  ENDOWED_SHARE,
  GIFT,
  GREEK_FULL,
  GREEK_GIVING,
  OPENING_AFFINITY,
  OPENING_AGE,
  OPENING_CLASSES,
  OPENING_SUCCESS,
  PARTICIPATION,
  PLACEMENT,
  SUCCESS_CLASSES,
  SUCCESS_PARTS,
  TRADITIONS_FULL,
  WIN_LIFT,
} from '../config/alumni';
import { SENIOR_SHARE } from '../config/greek';
import { dollars, headCount } from '../format';
import type { Alumni, AlumniDrive, AlumniYear, ClassRecord, GameState, LogEntry } from '../types';
import { academicRating } from './field';
import { greekMembers } from './greek';
import { markRatesDirty } from './money';

/**
 * Alumni giving (DESIGN.md 54, as built in section 56). Every graduate joins
 * the alumni pool and nobody leaves it. Each graduating class gets two numbers
 * the day it graduates, kept on its record for good: its success (the rating
 * that year, its on-time share and its job placement) and its affinity (how
 * happy it was, the traditions kept, its share in chapters and the football
 * record in its years). Once a year, at commencement, a drive asks every
 * class: so many give, by affinity, and give so much, by success. Most of it
 * goes to the endowment for good, and the rest is cash paid over the year.
 *
 * Only a game with goals has a drive, so the small campus is untouched.
 */

export function newAlumni(): Alumni {
  return { opening: null, years: [], last: null, totals: { raised: 0, endowed: 0, drives: 0 }, scorecard: null };
}

/** True on a campus with a drive: a game with goals. */
export function alumniOn(state: GameState): boolean {
  return state.goals !== null && state.goals !== undefined && !!state.alumni;
}

/**
 * The classes that graduated before the player arrived, as one, for a model campus: so many classes the size of its
 * senior class, at middling success and affinity. An older save adds the graduates it has had since.
 */
export function openingPool(state: GameState, since = 0): Alumni['opening'] {
  if (!state.goals) return null;
  const seniors = Math.max(state.cohorts[3], Math.round(state.cohorts.reduce((sum, n) => sum + n, 0) / 4));
  return { size: OPENING_CLASSES * seniors + since, success: OPENING_SUCCESS, affinity: OPENING_AFFINITY };
}

/** Every class that has graduated with its numbers fixed, oldest first. */
export function alumniClasses(state: GameState): ClassRecord[] {
  return state.classes.filter((record) => record.success !== undefined && record.finishedOnTime + record.finishedLate > 0);
}

/** How many alumni there are: the opening pool and every class since. It only grows. */
export function alumniPool(state: GameState): number {
  if (!state.alumni) return 0;
  let sum = state.alumni.opening?.size ?? 0;
  for (const record of alumniClasses(state)) sum += record.finishedOnTime + record.finishedLate;
  return sum;
}

// ------------------------------------------------------------ each year --

const YEARS_KEPT = 6;

function yearOf(state: GameState, year: number): AlumniYear {
  let one = state.alumni.years.find((entry) => entry.year === year);
  if (!one) {
    one = { year, happy: 0, semesters: 0, kept: 0, wins: 0, games: 0 };
    state.alumni.years.push(one);
    if (state.alumni.years.length > YEARS_KEPT) state.alumni.years.splice(0, state.alumni.years.length - YEARS_KEPT);
  }
  return one;
}

/** A semester has closed: its Happiness is part of this school year's, for the classes enrolled in it. */
export function alumniOnSemester(state: GameState, year: number, happiness: number): void {
  if (!alumniOn(state)) return;
  const one = yearOf(state, year);
  one.happy += happiness;
  one.semesters += 1;
}

// ------------------------------------------------------- a class's numbers --

export interface ClassNumbers {
  success: number;
  affinity: number;
  /** Each number's parts, 0 to 1, for the "why". */
  parts: { rating: number; onTime: number; placement: number; happiness: number; traditions: number; greek: number; football: number };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Job placement: the share of a class with a job, from the academic rating. */
export function placement(rating: number): number {
  return PLACEMENT.floor + PLACEMENT.span * clamp01(rating / 100);
}

/**
 * A class's two numbers, as they would be fixed if it graduated now: its success from the rating, its on-time share
 * and its placement, and its affinity from its four years. Years the game has no record of read as middling.
 */
export function classNumbers(state: GameState, record: ClassRecord, greekShare: number, graduating: number): ClassNumbers {
  const rating = clamp01(academicRating(state) / 100);
  const onTime = record.entered > 0 ? clamp01(record.finishedOnTime / record.entered) : SUCCESS_PARTS.onTimeMiddle;
  const placed = placement(rating * 100);
  const success = Math.max(0, Math.min(100, 100 * rating + SUCCESS_PARTS.onTime * (onTime - SUCCESS_PARTS.onTimeMiddle) + SUCCESS_PARTS.placement * (placed - SUCCESS_PARTS.placementMiddle)));
  const years = state.alumni.years.filter((one) => one.year >= graduating - 3 && one.year <= graduating);
  const happyYears = years.filter((one) => one.semesters > 0);
  const happiness = happyYears.length > 0 ? clamp01(happyYears.reduce((sum, one) => sum + one.happy / one.semesters, 0) / happyYears.length / 100) : OPENING_AFFINITY / 100;
  const traditions = years.length > 0 ? clamp01(years.reduce((sum, one) => sum + one.kept, 0) / years.length / TRADITIONS_FULL) : 0;
  const games = years.reduce((sum, one) => sum + one.games, 0);
  const football = games > 0 ? years.reduce((sum, one) => sum + one.wins, 0) / games : 0.5;
  const greek = clamp01(greekShare / GREEK_FULL);
  const affinity = 100 * (AFFINITY_PARTS.happiness * happiness + AFFINITY_PARTS.traditions * traditions + AFFINITY_PARTS.greek * greek + AFFINITY_PARTS.football * football);
  return { success: Math.round(success * 10) / 10, affinity: Math.round(affinity * 10) / 10, parts: { rating, onTime, placement: placed, happiness, traditions, greek, football } };
}

// ----------------------------------------------------------------- the drive --

/** The share of a class that gives: by its affinity, more for its chapter members, more with an Alumni House. */
export function participation(affinity: number, greek: number, house: boolean): number {
  const base = PARTICIPATION.floor + PARTICIPATION.span * clamp01(affinity / 100);
  return base * (1 + (GREEK_GIVING - 1) * clamp01(greek)) * (house ? 1 + ALUMNI_HOUSE_LIFT : 1);
}

/** A donor's gift: by the class's success, and a little more each year since it graduated. */
export function giftSize(success: number, age: number): number {
  return (GIFT.floor + GIFT.span * clamp01(success / 100)) * (1 + Math.min(AGE_MOST, AGE_LIFT * Math.max(0, age)));
}

function hasAlumniHouse(state: GameState): boolean {
  return state.map.placed.some((placed) => placed?.type === 'alumniHouse');
}

/** What a drive would raise now, class by class, and in all. `year` is the school year of the drive. */
export function driveNow(state: GameState, year: number): { raised: number; donors: number; classes: Array<{ year: number; size: number; rate: number; raised: number }>; win: number } {
  const house = hasAlumniHouse(state);
  const classes: Array<{ year: number; size: number; rate: number; raised: number }> = [];
  const opening = state.alumni.opening;
  if (opening && opening.size > 0) {
    const rate = participation(opening.affinity, 0, house);
    classes.push({ year: 0, size: opening.size, rate, raised: opening.size * rate * giftSize(opening.success, OPENING_AGE + year) });
  }
  for (const record of alumniClasses(state)) {
    const size = record.finishedOnTime + record.finishedLate;
    const graduated = record.entryYear + 3;
    const rate = participation(record.affinity ?? OPENING_AFFINITY, record.greek ?? 0, house);
    classes.push({ year: graduated, size, rate, raised: size * rate * giftSize(record.success ?? OPENING_SUCCESS, year - graduated) });
  }
  const now = state.alumni.years.find((one) => one.year === year);
  const win = now && now.games > 0 ? now.wins / now.games : 0;
  const lift = 1 + WIN_LIFT * win;
  let raised = 0;
  let donors = 0;
  for (const one of classes) {
    one.raised *= lift;
    raised += one.raised;
    donors += one.size * one.rate;
  }
  return { raised, donors, classes, win };
}

/** What a class gave at, in words: "18%". */
const percent = (rate: number): string => `${Math.round(rate * 100)}%`;
const className = (year: number): string => (year === 0 ? 'the classes before your time' : `the Class of Year ${year}`);

/**
 * Commencement (DESIGN.md 54.2): this year's numbers are noted, the graduating class's two numbers are fixed on its
 * record, and the drive is held. Called before the seniors leave Greek Row, so its share in chapters is read.
 */
export function alumniOnGraduation(state: GameState, year: number, seniors: number, log: LogEntry[]): void {
  if (!alumniOn(state)) return;
  const now = yearOf(state, year);
  now.kept = state.traditions?.chosen.reduce((sum, one) => sum + one.years.filter(([y, kept]) => y === year && kept === 1).length, 0) ?? 0;
  const last = state.football?.last;
  if (last && last.year === year) {
    now.wins = last.w;
    now.games = last.w + last.l;
  }
  const record = state.classes.find((one) => one.entryYear === year - 3);
  if (record && seniors > 0 && record.success === undefined) {
    const greek = Math.min(1, (greekMembers(state) * SENIOR_SHARE) / seniors);
    const numbers = classNumbers(state, record, greek, year);
    record.success = numbers.success;
    record.affinity = numbers.affinity;
    record.greek = Math.round(greek * 1000) / 1000;
  }
  const drive = driveNow(state, year);
  if (drive.raised <= 0) return;
  const endowed = Math.round(drive.raised * ENDOWED_SHARE);
  const cash = Math.round(drive.raised) - endowed;
  const ranked = drive.classes.filter((one) => one.size > 0).sort((a, b) => b.rate - a.rate);
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1]! : null;
  const result: AlumniDrive = {
    year,
    raised: Math.round(drive.raised),
    endowed,
    cash,
    donors: Math.round(drive.donors),
    best: best ? { year: best.year, rate: best.rate } : null,
    worst: worst ? { year: worst.year, rate: worst.rate } : null,
  };
  state.alumni.last = result;
  state.alumni.totals.raised += result.raised;
  state.alumni.totals.endowed += endowed;
  state.alumni.totals.drives += 1;
  state.money.endowment += endowed;
  markRatesDirty(state);
  log.push({
    tick: state.clock.tick,
    kind: 'alumni',
    text: `${driveLine(result, alumniPool(state))} ${whyLine(result, drive.win)}`.trim(),
    data: { year, raised: result.raised, endowed, cash, pool: alumniPool(state), headline: `Alumni Give ${dollars(result.raised)}; Development Office Asks Again Immediately` },
  });
}

/** The drive in one line, for the paper and the Money panel. */
export function driveLine(drive: AlumniDrive, pool: number): string {
  return `The alumni drive raised ${dollars(drive.raised)} from ${headCount(drive.donors)} of ${headCount(pool)} alumni: ${dollars(drive.endowed)} to the endowment, and ${dollars(drive.cash)} in cash over the year.`;
}

/** What lifted it, named: happier classes give more. */
export function whyLine(drive: AlumniDrive, win: number): string {
  const parts: string[] = [];
  if (drive.best && drive.worst && drive.best.rate - drive.worst.rate >= 0.005) {
    parts.push(`Happier classes give more: ${className(drive.best.year)} gave at ${percent(drive.best.rate)}, ${className(drive.worst.year)} at ${percent(drive.worst.rate)}.`);
  }
  if (win > 0.5) parts.push(`A winning season added ${Math.round(WIN_LIFT * win * 100)} in a hundred.`);
  const text = parts.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// -------------------------------------------------------- the rating input --

/** The alumni success input's line on the Rankings page: the latest classes, and the opening pool while it fills in. */
export function alumniDetail(state: GameState): string {
  const classes = alumniClasses(state).slice(-SUCCESS_CLASSES);
  if (classes.length === 0) return 'The classes before your time, at middling success, until your first class graduates';
  const latest = classes[classes.length - 1]!;
  const filling = classes.length < SUCCESS_CLASSES ? ', with the classes before your time filling in' : '';
  return `The Class of Year ${latest.entryYear + 3} scored ${Math.round(latest.success ?? 0)} of 100: the rating, finishing on time and jobs${filling}`;
}

/**
 * The academic rating's input from alumni success (DESIGN.md 24.4), 0 to 100: the latest classes' success, the
 * opening pool filling in until there are enough. null on a game with no drive.
 */
export function alumniSuccess(state: GameState): number | null {
  if (!alumniOn(state)) return null;
  const latest = alumniClasses(state).slice(-SUCCESS_CLASSES).map((record) => record.success ?? OPENING_SUCCESS);
  const opening = state.alumni.opening?.success ?? OPENING_SUCCESS;
  while (latest.length < SUCCESS_CLASSES) latest.unshift(opening);
  return latest.reduce((sum, n) => sum + n, 0) / latest.length;
}
