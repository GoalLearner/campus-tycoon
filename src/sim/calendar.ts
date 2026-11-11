import { ACADEMIC_CALENDAR, type AcademicCalendar, type CalDate } from './config/academicCalendar';
import {
  FIRST_INTAKE_TICK,
  GRADUATION_DAY,
  SPRING_INTAKE_DAY,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  WAITLIST_TICKS,
  YEAR_END_DAY,
} from './config/time';

/**
 * The academic week. One game year is one real week of whole days:
 * Fall days 1 to 3, Spring days 4 and 5, Graduation day 6, Summer day 7.
 *
 * First playable: the week is anchored to the moment the game was created.
 * Year 1 begins at the first intake. The waking-hours anchor arrives in layer 1.
 */

export type Phase = 'moveIn' | 'fall' | 'spring' | 'graduation' | 'summer';

export interface CalendarPos {
  /** 1 for the first year. 0 during the minutes before the first intake. */
  year: number;
  /** 1 to 7. 0 before the first intake. */
  day: number;
  phase: Phase;
  /** Ticks since this year began. */
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

export function calendarAt(tick: number): CalendarPos {
  if (tick < FIRST_INTAKE_TICK) {
    return { year: 0, day: 0, phase: 'moveIn', tickInYear: 0, tickInDay: tick };
  }
  const since = tick - FIRST_INTAKE_TICK;
  const tickInYear = since % TICKS_PER_YEAR;
  const day = Math.floor(tickInYear / TICKS_PER_DAY) + 1;
  return {
    year: Math.floor(since / TICKS_PER_YEAR) + 1,
    day,
    phase: phaseOfDay(day),
    tickInYear,
    tickInDay: tickInYear % TICKS_PER_DAY,
  };
}

/** Calendar events that fire exactly on this tick, in the order they must run. */
export function eventsAt(tick: number): CalendarEvent[] {
  if (tick < FIRST_INTAKE_TICK) return [];
  const t = (tick - FIRST_INTAKE_TICK) % TICKS_PER_YEAR;
  const events: CalendarEvent[] = [];
  if (t % TICKS_PER_DAY === 0) events.push('dayStart');
  if (t === 0) events.push('fallIntake');
  if (t === WAITLIST_TICKS) events.push('waitlistClose');
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
export function nextMilestone(tick: number): Upcoming {
  if (tick < FIRST_INTAKE_TICK) {
    return { event: 'fallIntake', inTicks: FIRST_INTAKE_TICK - tick };
  }
  const t = (tick - FIRST_INTAKE_TICK) % TICKS_PER_YEAR;
  const marks: Array<[Upcoming['event'], number]> = [
    ['springIntake', SPRING_INTAKE_TICK_IN_YEAR],
    ['graduation', GRADUATION_TICK_IN_YEAR],
    ['yearEnd', YEAR_END_TICK_IN_YEAR],
    ['fallIntake', TICKS_PER_YEAR],
  ];
  for (const [event, at] of marks) {
    if (at > t) return { event, inTicks: at - t };
  }
  return { event: 'fallIntake', inTicks: TICKS_PER_YEAR - t };
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

export interface GameDate {
  /** 1 to 12. */
  month: number;
  day: number;
  /** 0 is Sunday. */
  weekday: number;
}

/**
 * The date in the academic year at a tick. It moves steadily with the real
 * week, about two game days to a real hour, and every game year shows the
 * same dates on the same weekdays. Before the first class arrives it is the
 * first day of the fall semester.
 */
export function dateAt(tick: number, calendar: AcademicCalendar = ACADEMIC_CALENDAR): GameDate {
  const hours = tick < FIRST_INTAKE_TICK ? 0 : ((tick - FIRST_INTAKE_TICK) % TICKS_PER_YEAR) / 60;
  const dayOf = ([month, day, year]: CalDate): number => daysFromCivil(calendar.startYear + year, month, day);
  const knots = calendar.knots;
  let days = dayOf(knots[0]![1]);
  for (let i = 0; i < knots.length - 1; i++) {
    const [fromHour, fromDate] = knots[i]!;
    const [toHour, toDate] = knots[i + 1]!;
    if (hours >= fromHour && hours < toHour) {
      days = dayOf(fromDate) + Math.floor(((hours - fromHour) / (toHour - fromHour)) * (dayOf(toDate) - dayOf(fromDate)));
      break;
    }
  }
  const { month, day } = civilFromDays(days);
  return { month, day, weekday: (((days + 4) % 7) + 7) % 7 };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, Aug 24". */
export function formatDate(date: GameDate): string {
  return `${WEEKDAYS[date.weekday]}, ${MONTHS[date.month - 1]} ${date.day}`;
}

