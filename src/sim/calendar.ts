import { ACADEMIC_CALENDAR, type AcademicCalendar, type CalDate, type CalendarEntry } from './config/academicCalendar';
import {
  FIRST_INTAKE_TICK,
  GRADUATION_DAY,
  SPRING_INTAKE_DAY,
  TICK_MS,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  WAITLIST_TICKS,
  YEAR_END_DAY,
} from './config/time';
import type { Clock, Week } from './types';

/**
 * The academic week. One game year is one real week of whole days:
 * Fall days 1 to 3, Spring days 4 and 5, Graduation day 6, Summer day 7.
 *
 * Each day of the week begins at the anchor hour, which is two hours after
 * the player's day usually starts (DESIGN.md 4.2). The first class moves in
 * fifteen minutes after the game is made, at any hour, and a founding day of
 * up to twenty-four hours runs from then to the first anchor. The normal week
 * starts there. Moving the anchor later stretches one summer by up to a day
 * and never shortens anything.
 *
 * Where the year stands is kept in the clock as a `Week`: which year it is,
 * the tick its first day began, and how far its summer is stretched. Every
 * function here takes the clock. Given a bare tick it reads the plain week of
 * a game with no founding day and no stretch, which is what a game made
 * without an anchor has.
 */

export type Phase = 'moveIn' | 'founding' | 'fall' | 'spring' | 'graduation' | 'summer';

export interface CalendarPos {
  /** 1 for the first year. 0 during the minutes before the first intake. */
  year: number;
  /** 1 to 7. 0 before the first intake and during the founding day. */
  day: number;
  phase: Phase;
  /** Ticks since day 1 of this year began. 0 until it has. */
  tickInYear: number;
  /** Ticks since this day began. */
  tickInDay: number;
}

export type CalendarEvent =
  | 'dayStart'
  | 'fallIntake'
  | 'springIntake'
  | 'waitlistClose'
  | 'graduation'
  | 'yearEnd';

function phaseOfDay(day: number): Phase {
  if (day <= 3) return 'fall';
  if (day <= 5) return 'spring';
  if (day === 6) return 'graduation';
  return 'summer';
}

const dayStartTick = (day: number): number => (day - 1) * TICKS_PER_DAY;

export const SPRING_INTAKE_TICK_IN_YEAR = dayStartTick(SPRING_INTAKE_DAY);
export const GRADUATION_TICK_IN_YEAR = dayStartTick(GRADUATION_DAY);
export const YEAR_END_TICK_IN_YEAR = dayStartTick(YEAR_END_DAY);

/** The week of a game with no founding day and no stretched summer, at a tick. */
export function plainWeek(tick: number): Week {
  const year = tick < FIRST_INTAKE_TICK ? 1 : Math.floor((tick - FIRST_INTAKE_TICK) / TICKS_PER_YEAR) + 1;
  return { year, start: FIRST_INTAKE_TICK + (year - 1) * TICKS_PER_YEAR, extra: 0 };
}

type At = number | Pick<Clock, 'tick' | 'week'>;
const tickOf = (at: At): number => (typeof at === 'number' ? at : at.tick);
const weekOf = (at: At): Week => (typeof at === 'number' ? plainWeek(at) : at.week);

/** How long this year lasts, from its first day to the next fall anchor. */
export function yearLength(week: Week): number {
  return TICKS_PER_YEAR + week.extra;
}

/**
 * Move the clock's week on when a year has run out. Called once a tick,
 * before anything reads the calendar. Returns true on the tick a year begins.
 */
export function rollWeek(clock: Clock): boolean {
  const week = clock.week;
  if (clock.tick < week.start + yearLength(week)) return false;
  clock.week = { year: week.year + 1, start: week.start + yearLength(week), extra: 0 };
  return true;
}

export function calendarAt(at: At): CalendarPos {
  const tick = tickOf(at);
  if (tick < FIRST_INTAKE_TICK) return { year: 0, day: 0, phase: 'moveIn', tickInYear: 0, tickInDay: tick };
  const week = weekOf(at);
  if (tick < week.start) return { year: week.year, day: 0, phase: 'founding', tickInYear: 0, tickInDay: tick - FIRST_INTAKE_TICK };
  const tickInYear = tick - week.start;
  // A stretched summer is still day 7.
  const day = Math.min(7, Math.floor(tickInYear / TICKS_PER_DAY) + 1);
  return { year: week.year, day, phase: phaseOfDay(day), tickInYear, tickInDay: tickInYear - dayStartTick(day) };
}

/** The tick the fall class of this year moved in: the first intake in year one, the year's first day after that. */
function fallIntakeTick(week: Week): number {
  return week.year === 1 ? FIRST_INTAKE_TICK : week.start;
}

/** Calendar events that fire exactly on this tick, in the order they must run. */
export function eventsAt(at: At): CalendarEvent[] {
  const tick = tickOf(at);
  if (tick < FIRST_INTAKE_TICK) return [];
  const week = weekOf(at);
  const t = tick - week.start;
  const events: CalendarEvent[] = [];
  if (t >= 0 && t < TICKS_PER_YEAR && t % TICKS_PER_DAY === 0) events.push('dayStart');
  if (tick === fallIntakeTick(week)) events.push('fallIntake');
  if (tick === fallIntakeTick(week) + WAITLIST_TICKS) events.push('waitlistClose');
  if (t === SPRING_INTAKE_TICK_IN_YEAR) events.push('springIntake');
  if (t === SPRING_INTAKE_TICK_IN_YEAR + WAITLIST_TICKS) events.push('waitlistClose');
  if (t === GRADUATION_TICK_IN_YEAR) events.push('graduation');
  if (t === YEAR_END_TICK_IN_YEAR) events.push('yearEnd');
  return events;
}

export interface Upcoming {
  event: 'fallIntake' | 'springIntake' | 'graduation' | 'yearEnd';
  /** Ticks from `tick` until it fires. Always at least 1. */
  inTicks: number;
}

/** The next intake, graduation or year end after this tick. */
export function nextMilestone(at: At): Upcoming {
  const tick = tickOf(at);
  if (tick < FIRST_INTAKE_TICK) return { event: 'fallIntake', inTicks: FIRST_INTAKE_TICK - tick };
  const week = weekOf(at);
  const t = tick - week.start;
  const marks: Array<[Upcoming['event'], number]> = [
    ['springIntake', SPRING_INTAKE_TICK_IN_YEAR],
    ['graduation', GRADUATION_TICK_IN_YEAR],
    ['yearEnd', YEAR_END_TICK_IN_YEAR],
    ['fallIntake', yearLength(week)],
  ];
  for (const [event, mark] of marks) {
    if (mark > t) return { event, inTicks: mark - t };
  }
  return { event: 'fallIntake', inTicks: yearLength(week) - t };
}

/** Ticks from now until the next class moves in, fall or spring. Always at least 1. */
export function ticksToIntake(at: At): number {
  const tick = tickOf(at);
  if (tick < FIRST_INTAKE_TICK) return FIRST_INTAKE_TICK - tick;
  const week = weekOf(at);
  const t = tick - week.start;
  if (t < 0) return -t;
  return t < SPRING_INTAKE_TICK_IN_YEAR ? SPRING_INTAKE_TICK_IN_YEAR - t : Math.max(1, yearLength(week) - t);
}

// ------------------------------------------------------------- the anchor --

/** The real moment, in epoch ms, at which a tick happens or happened. */
export function timeOfTick(clock: Clock, tick: number): number {
  return clock.nextTickAt + (tick - clock.tick - 1) * TICK_MS;
}

/** The minute of the UTC day, 0 to 1439, at a real moment. */
export function minuteOfDay(ms: number): number {
  return ((Math.floor(ms / TICK_MS) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

/** Minutes from a real moment forward to the next time the UTC day reaches `anchor`. 0 when it is that minute now. */
export function minutesToAnchor(ms: number, anchor: number): number {
  return (((anchor - minuteOfDay(ms)) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

// ------------------------------------------------------------- the date --

/** Days since 1970-01-01 for a calendar date. Plain arithmetic: the sim never reads a clock. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day: dayOfYear - Math.floor((153 * mp + 2) / 5) + 1 };
}

/**
 * The real date of a moment on the game's own clock, by the UTC calendar.
 * Worked out from the number alone, so the sim never asks the device what
 * day it is.
 */
export function realDate(ms: number): { year: number; month: number; day: number } {
  return civilFromDays(Math.floor(ms / 86_400_000));
}

export interface GameDate {
  /** 1 to 12. */
  month: number;
  day: number;
  /** 0 is Sunday. */
  weekday: number;
}

/** The founding day shows the week before classes: move-in week, Aug 12 to Aug 18. */
const FOUNDING_DAYS = 7;
/**
 * The game's clock (DESIGN.md 84) opens the founding day at 8 AM on its first date, so a new campus is first seen in
 * the morning. The hour the first class arrives, and the hour before it while they are on their way.
 */
const FOUNDING_OPENS = 8 / 24;

const dayNumber = (calendar: AcademicCalendar, [month, day, year]: CalDate): number => daysFromCivil(calendar.startYear + year, month, day);

/**
 * The stretch of real time each phase takes in this year, in ticks from the
 * year's first day: the calendar's own hours, with the summer made longer by
 * whatever the anchor's shift added.
 */
function knotTicks(week: Week, calendar: AcademicCalendar): number[] {
  const last = calendar.knots.length - 1;
  return calendar.knots.map(([hours], i) => hours * 60 + (i === last ? week.extra : 0));
}

function toGameDate(days: number): GameDate {
  const { month, day } = civilFromDays(days);
  return { month, day, weekday: (((days + 4) % 7) + 7) % 7 };
}

/**
 * Where a moment stands in the game's days: a whole day number and how far past it, in days. The date is the whole
 * day of `base + offset` and the hour its fraction, so the two always turn over together at game midnight (DESIGN.md
 * 84). Kept as two parts so the date at a whole tick is worked out exactly as it always was.
 */
function placeAt(at: At, calendar: AcademicCalendar): { base: number; offset: number } {
  const tick = tickOf(at);
  const week = weekOf(at);
  const knots = calendar.knots;
  const first = dayNumber(calendar, knots[0]![1]);
  // Before the first class arrives: the morning of the first day of the fall.
  if (tick < FIRST_INTAKE_TICK) return { base: first, offset: FOUNDING_OPENS };
  if (tick < week.start) {
    // Move-in week, spread evenly over the founding day whatever its length: from 8 AM on its first date to midnight
    // at the end of its last.
    const length = week.start - FIRST_INTAKE_TICK;
    return { base: first - FOUNDING_DAYS, offset: FOUNDING_OPENS + ((tick - FIRST_INTAKE_TICK) / length) * (FOUNDING_DAYS - FOUNDING_OPENS) };
  }
  // A whole tick past the year's end reads its last tick, as it always has. A moment between ticks, which only the
  // map's clock asks for, runs on to the next year's first midnight.
  const t = Math.min(tick - week.start, Number.isInteger(tick) ? yearLength(week) - 1 : yearLength(week) - 1e-6);
  const ticks = knotTicks(week, calendar);
  for (let i = 0; i < knots.length - 1; i++) {
    if (t >= ticks[i]! && t < ticks[i + 1]!) {
      const from = dayNumber(calendar, knots[i]![1]);
      const to = dayNumber(calendar, knots[i + 1]![1]);
      return { base: from, offset: ((t - ticks[i]!) / (ticks[i + 1]! - ticks[i]!)) * (to - from) };
    }
  }
  return { base: first, offset: 0 };
}

/**
 * The date in the academic year at a tick. It moves steadily with the real
 * week, about two game days to a real hour, and every game year shows the
 * same dates on the same weekdays. Before the first class arrives it is the
 * first day of the fall semester. During a founding day it is move-in week.
 */
export function dateAt(at: At, calendar: AcademicCalendar = ACADEMIC_CALENDAR): GameDate {
  const { base, offset } = placeAt(at, calendar);
  return toGameDate(base + Math.floor(offset));
}

/**
 * The hour of the game's day at a moment, from 0 up to 24 (DESIGN.md 84): the game's own clock, read from the same
 * calendar as the date. A game day is about 28 real minutes in the fall, so a game hour is about 70 real seconds. A
 * tick may be fractional, for the map's clock between one real minute and the next.
 */
export function hourAt(at: At, calendar: AcademicCalendar = ACADEMIC_CALENDAR): number {
  const { offset } = placeAt(at, calendar);
  return (offset - Math.floor(offset)) * 24;
}

/**
 * The date and the hour of a moment together, so the map's clock never shows one a step ahead of the other, and the
 * day as a running count that goes up by one at each game midnight.
 */
export function momentAt(at: At, calendar: AcademicCalendar = ACADEMIC_CALENDAR): { date: GameDate; hour: number; index: number } {
  const { base, offset } = placeAt(at, calendar);
  const whole = Math.floor(offset);
  return { date: toGameDate(base + whole), hour: (offset - whole) * 24, index: base + whole };
}

/** The date of a day in the running count `dayIndexAt` and `momentAt` give. */
export function dateOfDay(index: number): GameDate {
  return toGameDate(index);
}

/** The game's day at a moment as a running count: one more at each game midnight, the same for a whole game day. */
export function dayIndexAt(at: At, calendar: AcademicCalendar = ACADEMIC_CALENDAR): number {
  const { base, offset } = placeAt(at, calendar);
  return base + Math.floor(offset);
}

/**
 * The tick, counted from the year's first day, at which a date of the
 * calendar begins in this year. The other way round from `dateAt`.
 */
export function tickOfDate(week: Week, date: CalDate, calendar: AcademicCalendar = ACADEMIC_CALENDAR): number {
  return tickOfMoment(week, date, 0, calendar);
}

/** The first tick, counted from the year's first day, at which the game's clock has reached an hour of a date. */
export function tickOfMoment(week: Week, date: CalDate, hour: number, calendar: AcademicCalendar = ACADEMIC_CALENDAR): number {
  const knots = calendar.knots;
  const ticks = knotTicks(week, calendar);
  const want = dayNumber(calendar, date) + hour / 24;
  for (let i = 0; i < knots.length - 1; i++) {
    const from = dayNumber(calendar, knots[i]![1]);
    const to = dayNumber(calendar, knots[i + 1]![1]);
    if (want >= from && want < to) {
      // The first tick whose date is this day (and hour): the same rounding as dateAt, turned round.
      return week.start + ticks[i]! + Math.ceil(((want - from) / (to - from)) * (ticks[i + 1]! - ticks[i]!) - 1e-9);
    }
  }
  return week.start + yearLength(week);
}

/** The ticks an entry of the calendar covers this year: from its first tick up to, and not including, `to`. */
export function entrySpan(week: Week, entry: CalendarEntry, calendar: AcademicCalendar = ACADEMIC_CALENDAR): { from: number; to: number } {
  const last = entry.to ?? entry.from;
  const next = civilFromDays(dayNumber(calendar, last) + 1);
  const after: CalDate = [next.month, next.day, (next.year - calendar.startYear) as 0 | 1];
  return { from: tickOfDate(week, entry.from, calendar), to: tickOfDate(week, after, calendar) };
}

export interface CalendarMark {
  entry: CalendarEntry;
  /** True on the tick it begins, false on the tick after its last. */
  begins: boolean;
}

/** Every entry's span, and what begins or ends on each tick, for one year. Built once for a year and kept. */
interface YearMarks {
  spans: Array<{ entry: CalendarEntry; from: number; to: number }>;
  byTick: Map<number, CalendarMark[]>;
}
let marksKey = '';
let marksKept: YearMarks = { spans: [], byTick: new Map() };

function marksFor(week: Week): YearMarks {
  const key = `${week.start}:${week.extra}`;
  if (key === marksKey) return marksKept;
  const spans = ACADEMIC_CALENDAR.events.map((entry) => ({ entry, ...entrySpan(week, entry) }));
  const byTick = new Map<number, CalendarMark[]>();
  const add = (tick: number, mark: CalendarMark): void => {
    const list = byTick.get(tick);
    if (list) list.push(mark);
    else byTick.set(tick, [mark]);
  };
  // Ends are listed before beginnings on a shared tick, so a break that follows finals reads in order.
  for (const span of spans) add(span.to, { entry: span.entry, begins: false });
  for (const span of spans) add(span.from, { entry: span.entry, begins: true });
  marksKey = key;
  marksKept = { spans, byTick };
  return marksKept;
}

const NO_MARKS: readonly CalendarMark[] = [];

/** The entries of the calendar that begin or end exactly on this tick. */
export function marksAt(clock: Pick<Clock, 'tick' | 'week'>): readonly CalendarMark[] {
  if (clock.tick < clock.week.start) return NO_MARKS;
  return marksFor(clock.week).byTick.get(clock.tick) ?? NO_MARKS;
}

/** The entries of the calendar that are going on at this tick. */
export function activeEntries(at: At): CalendarEntry[] {
  const tick = tickOf(at);
  const week = weekOf(at);
  if (tick < week.start) return [];
  const active: CalendarEntry[] = [];
  for (const span of marksFor(week).spans) if (tick >= span.from && tick < span.to) active.push(span.entry);
  return active;
}

/** The ticks one entry covers this year, by its id. null for an id the calendar does not have. */
export function spanOf(week: Week, id: string): { from: number; to: number } | null {
  for (const span of marksFor(week).spans) if (span.entry.id === id) return { from: span.from, to: span.to };
  return null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, Aug 24". */
export function formatDate(date: GameDate): string {
  return `${WEEKDAYS[date.weekday]}, ${MONTHS[date.month - 1]} ${date.day}`;
}

/** "Aug 24", for a list grouped by date. */
export function shortDate(date: GameDate): string {
  return `${MONTHS[date.month - 1]} ${date.day}`;
}
