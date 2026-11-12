import type { CalendarEventKind } from './academicCalendar';
import { TICKS_PER_HOUR } from './time';

/**
 * Tuning for the academic year's pulse: who is on campus, Stress, the lift of
 * a break and the weather. All of it is small and capped, so no season can
 * run away with the year. See DESIGN.md sections 4.8, 27 and 28.
 */

// ------------------------------------------------------------- presence --

/** [T] The share of students on campus during a break, and through the summer term. */
export const BREAK_PRESENCE = 0.25;
export const SUMMER_PRESENCE = 0.15;
/** [T] On a one-day holiday the campus is closed: this share of the usual crowd is out on the paths. For show. */
export const HOLIDAY_WALKERS = 0.35;

// --------------------------------------------------------------- stress --

/**
 * The calendar's curve, from 0.1 on a break to 1.0 in finals week. An
 * ordinary week of term sits at TERM and climbs by RAMP over the game days
 * before the next exams begin.
 */
export const SEASON_CURVE = {
  break: 0.1,
  summer: 0.15,
  graduation: 0.12,
  founding: 0.2,
  term: 0.3,
  ramp: 0.3,
  midterms: 0.75,
  finals: 1,
} as const;
/** The climb toward exams begins this many ticks before them: about two game weeks of a fall. */
export const EXAM_RAMP_TICKS = Math.round(6.5 * TICKS_PER_HOUR);
/** stress = 100 * season * (BASE + PRESSURE * pressure) * (1 - RELIEF * relief). */
export const STRESS_BASE = 0.55;
export const STRESS_PRESSURE = 0.45;
export const STRESS_RELIEF = 0.5;
/**
 * Teaching at full funding reads as neither good nor bad: one member of
 * faculty to twenty students. The ratio moves it from 0 at its best to 1 at
 * its most stretched (config/staffing.ts).
 */
export const TEACHING_NEUTRAL = 0.5;
/** Classes feel crowded from this share of seats taken, and as crowded as they get when every seat is. */
export const CROWDING_FROM = 0.7;

/** [T] Stress below this costs no Happiness. From here to 100 it costs up to STRESS_HAPPINESS points. */
export const STRESS_CALM = 30;
export const STRESS_HAPPINESS = 10;
/** [T] The most a grade point average falls at Stress 100. */
export const STRESS_GPA = 0.2;
/**
 * [T] A semester's average Stress, from SUSTAINED up to WORST, loses up to
 * this share more of its students. A whole semester averages far below its
 * exam peak, because breaks and ordinary weeks are most of it: the worst
 * campus averages about 36.
 */
export const STRESS_SUSTAINED = 20;
export const STRESS_WORST = 36;
export const STRESS_RETENTION = 0.01;
/** [T] How hard each kind of student takes Stress, against 1 for most. */
export const STRESS_TILT: Partial<Record<string, number>> = { stressed: 1.6, scholar: 1.4, allNighter: 1.5, slacker: 0.3 };

/** Faculty Stress: the same calendar, and one more peak around the days grades are due. */
export const FACULTY_GRADES_CURVE = 0.85;
/** Grades weigh on the faculty for this many ticks before they close. */
export const FACULTY_GRADES_TICKS = 3 * TICKS_PER_HOUR;

// --------------------------------------------------------------- breaks --

/** [T] Points of Happiness a break adds while it lasts, and the small dip on the first day back. */
export const BREAK_LIFT = 4;
export const BACK_DIP = -1;
/** The dip lasts this long after a break ends: about one game day. */
export const BACK_DIP_TICKS = 30;

// -------------------------------------------------------------- weather --

export type WeatherKind = 'fair' | 'sunny' | 'rain' | 'snow' | 'heat';
export type YearSeason = 'fall' | 'winter' | 'spring' | 'summer';

/** A spell of weather lasts this long: three real hours, about six game days. */
export const SPELL_TICKS = 3 * TICKS_PER_HOUR;
/** [T] How often each kind of weather comes in each season, out of a hundred. One temperate climate. */
export const WEATHER_ODDS: Record<YearSeason, ReadonlyArray<readonly [WeatherKind, number]>> = {
  fall: [['fair', 45], ['sunny', 25], ['rain', 30]],
  winter: [['fair', 45], ['sunny', 15], ['snow', 25], ['rain', 15]],
  spring: [['fair', 35], ['sunny', 25], ['rain', 40]],
  summer: [['fair', 35], ['sunny', 45], ['heat', 15], ['rain', 5]],
};
/** [T] Points of Happiness each kind adds or takes, before any shelter. A few points at most. */
export const WEATHER_POINTS: Record<WeatherKind, number> = { fair: 0, sunny: 1.5, rain: -2, snow: -2, heat: -3 };
/** [T] Indoor places in reach soften a dip by up to this share. */
export const WEATHER_SHELTER = 0.6;
export const WEATHER_NAMES: Record<WeatherKind, string> = { fair: 'Fair weather', sunny: 'A sunny day', rain: 'Rain', snow: 'Snow', heat: 'A heat wave' };

// ---------------------------------------------------------------- lines --

/**
 * What the away list says when an entry of the calendar begins or ends.
 * `{name}` is the entry's own name. Nothing is said for a kind left out.
 */
export const CALENDAR_LINES: Partial<Record<CalendarEventKind, { begins?: string; ends?: string }>> = {
  holiday: { begins: '{name}. The campus is closed for the day.' },
  break: { begins: '{name} begins. Most students head home, and the campus is quiet.', ends: '{name} is over. The students are back.' },
  midterms: { begins: '{name} begins. The library and the coffee stands fill up.' },
  finals: { begins: '{name} begins. Stress is at its highest of the semester.' },
  classes: { begins: '{name}.' },
};
/** A term beginning already has its intake in the list. Only the summer term gets a line of its own. */
export const SUMMER_START_LINE = 'The summer term begins. About {share}% of students stay on campus.';

/** What each cause of Stress is called, and what would ease it. */
export const STRESS_CAUSES = {
  crowding: { name: 'crowded classes', fix: 'More Academic seats would have eased it.' },
  teaching: { name: 'too few faculty', fix: 'More faculty would have eased it. They arrive a semester after they are hired.' },
  unwind: { name: 'too few places to unwind', fix: 'Recreation, a quad or a pond in reach of the dorms would have eased it.' },
  support: { name: 'too little support', fix: 'A library and a Medical Center in reach, and staff at full strength, would have eased it.' },
  season: { name: 'the exams themselves', fix: 'The campus did all it could.' },
} as const;
export type StressCause = keyof typeof STRESS_CAUSES;
