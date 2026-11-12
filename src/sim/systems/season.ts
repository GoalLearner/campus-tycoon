import { activeEntries, calendarAt, dateAt, marksAt, spanOf, type CalendarMark } from '../calendar';
import { ACADEMIC_CALENDAR, type CalendarEntry } from '../config/academicCalendar';
import { PLACED } from '../config/placed';
import {
  BACK_DIP,
  BACK_DIP_TICKS,
  BREAK_LIFT,
  BREAK_PRESENCE,
  CALENDAR_LINES,
  CROWDING_FROM,
  EXAM_RAMP_TICKS,
  FACULTY_GRADES_CURVE,
  FACULTY_GRADES_TICKS,
  HOLIDAY_WALKERS,
  SEASON_CURVE,
  SPELL_TICKS,
  STRESS_BASE,
  STRESS_CALM,
  STRESS_CAUSES,
  STRESS_HAPPINESS,
  STRESS_PRESSURE,
  STRESS_RELIEF,
  STRESS_RETENTION,
  STRESS_SUSTAINED,
  STRESS_WORST,
  SUMMER_PRESENCE,
  SUMMER_START_LINE,
  TEACHING_NEUTRAL,
  WEATHER_NAMES,
  WEATHER_ODDS,
  WEATHER_POINTS,
  WEATHER_SHELTER,
  type StressCause,
  type WeatherKind,
  type YearSeason,
} from '../config/season';
import { TICKS_PER_HOUR } from '../config/time';
import { stageSpec } from '../config/buildings';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { Clock, GameState, LogEntry } from '../types';
import { markRatesDirty } from './money';

/**
 * The pulse of the academic year (DESIGN.md sections 4.8, 27 and 28): who is
 * on campus, how stressed they are, the lift of a break, and the weather.
 *
 * Almost nothing here is stored. Stress is worked out from the date and the
 * campus whenever it is asked for, so it cannot build up or stay pinned: when
 * the season eases, so does Stress. The only things kept are the semester's
 * running average, the peak of the exam period in progress, and the year the
 * first snow was last reported. Weather is read from the seed and the tick.
 */

/** What the campus offers against Stress and bad weather, each from 0 to 1. Read from the causes of Happiness. */
export interface CampusLevels {
  recreation: number;
  green: number;
  safety: number;
  dining: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const EXAM_KINDS = ['midterms', 'finals'] as const;
const EXAMS: readonly CalendarEntry[] = ACADEMIC_CALENDAR.events.filter((entry) => entry.kind === 'midterms' || entry.kind === 'finals');
const GRADES: readonly CalendarEntry[] = ACADEMIC_CALENDAR.events.filter((entry) => entry.kind === 'grades');

// --------------------------------------------------------------- the day --

export type CampusDay = 'moveIn' | 'founding' | 'term' | 'holiday' | 'break' | 'midterms' | 'finals' | 'commencement' | 'summer';

export interface DayRead {
  kind: CampusDay;
  /** The calendar's own name for what is going on: "Thanksgiving break". null on an ordinary day of term. */
  name: string | null;
  /** The share of students on campus, which food and the campus stores earn by. */
  presence: number;
  /** The share of the usual crowd out on the paths. For show. */
  walkers: number;
}

/** What kind of day it is on campus, from the calendar alone. */
export function dayRead(clock: Pick<Clock, 'tick' | 'week'>): DayRead {
  const pos = calendarAt(clock);
  if (pos.phase === 'moveIn') return { kind: 'moveIn', name: null, presence: 1, walkers: 1 };
  if (pos.phase === 'founding') return { kind: 'founding', name: 'Move-in week', presence: 1, walkers: 1 };
  const active = activeEntries(clock);
  const of = (kind: CalendarEntry['kind']): CalendarEntry | undefined => active.find((entry) => entry.kind === kind);
  const rest = of('break');
  if (rest) return { kind: 'break', name: rest.name, presence: BREAK_PRESENCE, walkers: BREAK_PRESENCE };
  const finals = of('finals');
  if (finals) return { kind: 'finals', name: finals.name, presence: 1, walkers: 1 };
  const midterms = of('midterms');
  if (midterms) return { kind: 'midterms', name: midterms.name, presence: 1, walkers: 1 };
  if (pos.phase === 'summer') {
    const holiday = of('holiday');
    return { kind: 'summer', name: holiday?.name ?? 'Summer term', presence: SUMMER_PRESENCE, walkers: SUMMER_PRESENCE * (holiday ? HOLIDAY_WALKERS : 1) };
  }
  const holiday = of('holiday');
  if (holiday) return { kind: 'holiday', name: holiday.name, presence: 1, walkers: HOLIDAY_WALKERS };
  const commencement = of('commencement');
  if (commencement) return { kind: 'commencement', name: commencement.name, presence: 1, walkers: 1 };
  return { kind: 'term', name: null, presence: 1, walkers: 1 };
}

/** The share of students on campus now. Food places and campus stores earn by it. */
export function presence(state: GameState): number {
  return dayRead(state.clock).presence;
}

// ---------------------------------------------------------------- stress --

/** The first tick of the next exam period this year, or null when the year has none left. */
function nextExam(clock: Pick<Clock, 'tick' | 'week'>): number | null {
  let best: number | null = null;
  for (const entry of EXAMS) {
    const span = spanOf(clock.week, entry.id);
    if (span && span.from > clock.tick && (best === null || span.from < best)) best = span.from;
  }
  return best;
}

/**
 * The calendar's curve for Stress: low on a break and through the summer, an
 * even hum in an ordinary week, climbing over the two game weeks before
 * exams, high at midterms and at its highest in finals week.
 */
export function seasonCurve(clock: Pick<Clock, 'tick' | 'week'>): number {
  const day = dayRead(clock);
  switch (day.kind) {
    case 'moveIn':
    case 'founding':
      return SEASON_CURVE.founding;
    case 'break':
      return SEASON_CURVE.break;
    case 'summer':
      return SEASON_CURVE.summer;
    case 'commencement':
      return SEASON_CURVE.graduation;
    case 'finals':
      return SEASON_CURVE.finals;
    case 'midterms':
      return SEASON_CURVE.midterms;
    default:
      break;
  }
  if (calendarAt(clock).phase === 'graduation') return SEASON_CURVE.graduation;
  const exam = nextExam(clock);
  const near = exam === null ? 0 : clamp01(1 - (exam - clock.tick) / EXAM_RAMP_TICKS);
  return SEASON_CURVE.term + SEASON_CURVE.ramp * near;
}

/** The same curve for the faculty, with one more peak in the hours before grades are due. */
export function facultyCurve(clock: Pick<Clock, 'tick' | 'week'>): number {
  let curve = seasonCurve(clock);
  for (const entry of GRADES) {
    const span = spanOf(clock.week, entry.id);
    if (span && clock.tick < span.to && clock.tick >= span.from - FACULTY_GRADES_TICKS) curve = Math.max(curve, FACULTY_GRADES_CURVE);
  }
  return curve;
}

/** The share of students with a library or a computer lab in reach of where they live or study. */
export function libraryShare(state: GameState): number {
  const map = state.map;
  const ids = map.care.byFamily?.library ?? [];
  let people = 0;
  let served = 0;
  for (const building of map.buildings) {
    if (!building || building.stage < 1) continue;
    const size = stageSpec(building.zone, building.stage).capacity;
    people += size;
    for (const id of ids) {
      const placed = map.placed[id];
      if (!placed) continue;
      const reach = PLACED[placed.type].radius;
      const dx = Math.max(placed.x - building.x, 0, building.x - (placed.x + placed.w - 1));
      const dy = Math.max(placed.y - building.y, 0, building.y - (placed.y + placed.h - 1));
      if (Math.max(dx, dy) <= reach) {
        served += size;
        break;
      }
    }
  }
  return people > 0 ? served / people : 0;
}

export interface StressRead {
  /** 0 to 100. */
  score: number;
  /** The calendar's part, 0.1 to 1. */
  season: number;
  /** How hard the campus makes the season land: 0 to 1. Crowded classes, and teaching once it exists. */
  pressure: number;
  /** How much the campus eases it: 0 to 1. Places to unwind, and support. */
  relief: number;
  crowding: number;
  unwind: number;
  support: number;
  /** The thing whose fix would lower Stress most. 'season' when the campus is doing all it can. */
  cause: StressCause;
  /** The campus's part alone, before the calendar: what Stress would be at a season of 1, out of 1. */
  factor: number;
}

/** How crowded classes are, 0 to 1: nothing until seven seats in ten are taken, everything when all are. */
export function crowding(state: GameState): number {
  const seats = openCapacity(state, 'academic');
  if (seats <= 0) return enrollment(state) > 0 ? 1 : 0;
  return clamp01((enrollment(state) / seats - CROWDING_FROM) / (1 - CROWDING_FROM));
}

/** Stress now, with what is behind it. Worked out, never stored. */
export function stressRead(state: GameState, levels: CampusLevels, season = seasonCurve(state.clock)): StressRead {
  const crowded = crowding(state);
  const unwind = (levels.recreation + levels.green) / 2;
  const support = (libraryShare(state) + levels.safety) / 2;
  // Teaching joins crowding when Instruction funding exists. Until then it is neutral.
  const pressure = (crowded + TEACHING_NEUTRAL) / 2;
  const relief = (unwind + support) / 2;
  const factor = (STRESS_BASE + STRESS_PRESSURE * pressure) * (1 - STRESS_RELIEF * relief);
  // What each fix would take off, at this season.
  const gains: Array<[StressCause, number]> = [
    ['crowding', STRESS_PRESSURE * (crowded / 2) * (1 - STRESS_RELIEF * relief)],
    ['unwind', (STRESS_BASE + STRESS_PRESSURE * pressure) * STRESS_RELIEF * ((1 - unwind) / 2)],
    ['support', (STRESS_BASE + STRESS_PRESSURE * pressure) * STRESS_RELIEF * ((1 - support) / 2)],
  ];
  let cause: StressCause = 'season';
  let most = 0.02;
  for (const [id, gain] of gains) {
    if (gain > most) {
      most = gain;
      cause = id;
    }
  }
  return { score: Math.round(100 * season * factor), season, pressure, relief, crowding: crowded, unwind, support, cause, factor };
}

/** Faculty Stress, 0 to 100: their own calendar, and how crowded classes are. */
export function facultyStress(state: GameState): number {
  return Math.round(100 * facultyCurve(state.clock) * (0.6 + 0.4 * crowding(state)));
}

// --------------------------------------------------------------- weather --

/** The season of a month of the game's own date. */
export function yearSeason(month: number): YearSeason {
  if (month >= 9 && month <= 11) return 'fall';
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  return 'summer';
}

/**
 * The weather at this moment. It comes in spells of three real hours. Each is
 * picked from the seed and the spell's number, by the odds of the season the
 * date is in, so it is the same however the time was reached and nothing is
 * stored.
 */
export function weatherAt(seed: number, clock: Pick<Clock, 'tick' | 'week'>): WeatherKind {
  const pos = calendarAt(clock);
  if (pos.phase === 'moveIn') return 'fair';
  const odds = WEATHER_ODDS[yearSeason(dateAt(clock).month)];
  const total = odds.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = (hashInts(seed, 977, Math.floor(clock.tick / SPELL_TICKS)) / 4294967296) * total;
  for (const [kind, weight] of odds) {
    roll -= weight;
    if (roll < 0) return kind;
  }
  return 'fair';
}

/** The share of students with somewhere indoors in reach: food, a library. It softens bad weather. */
export function shelter(state: GameState, levels: CampusLevels): number {
  return (levels.dining + libraryShare(state)) / 2;
}

// ---------------------------------------------------------- "this week" --

export interface SeasonPart {
  id: 'exams' | 'break' | 'back' | 'weather';
  label: string;
  /** Points of Happiness, signed. */
  points: number;
}

export interface SeasonLine {
  /** Everything the calendar and the sky add to or take from Happiness now, in points. */
  delta: number;
  parts: SeasonPart[];
  stress: StressRead;
  faculty: number;
  weather: WeatherKind;
  day: DayRead;
}

/** True within a game day of a break or the summer ending. */
function justBack(clock: Pick<Clock, 'tick' | 'week'>): boolean {
  const pos = calendarAt(clock);
  if (pos.phase === 'fall' && pos.year > 1 && pos.tickInYear < BACK_DIP_TICKS) return true;
  for (const entry of ACADEMIC_CALENDAR.events) {
    if (entry.kind !== 'break') continue;
    const span = spanOf(clock.week, entry.id);
    if (span && clock.tick >= span.to && clock.tick < span.to + BACK_DIP_TICKS) return true;
  }
  return false;
}

/**
 * The one signed line the Happiness panel shows beside the four causes: the
 * exam dip, the lift of a break, the first day back, and the weather while it
 * is doing anything.
 */
export function seasonLine(state: GameState, levels: CampusLevels): SeasonLine {
  const clock = state.clock;
  const day = dayRead(clock);
  const stress = stressRead(state, levels);
  const weather = weatherAt(state.seed, clock);
  const parts: SeasonPart[] = [];
  const dip = -STRESS_HAPPINESS * clamp01((stress.score - STRESS_CALM) / (100 - STRESS_CALM));
  if (dip <= -0.5) parts.push({ id: 'exams', label: day.kind === 'finals' || day.kind === 'midterms' ? (day.name ?? 'Exams') : 'Exams ahead', points: dip });
  if (day.kind === 'break' || day.kind === 'summer') parts.push({ id: 'break', label: day.kind === 'summer' ? 'Summer' : (day.name ?? 'Break'), points: BREAK_LIFT });
  else if (justBack(clock)) parts.push({ id: 'back', label: 'First day back', points: BACK_DIP });
  const sky = WEATHER_POINTS[weather];
  if (sky !== 0 && day.kind !== 'moveIn') {
    const points = sky < 0 ? sky * (1 - WEATHER_SHELTER * shelter(state, levels)) : sky;
    parts.push({ id: 'weather', label: WEATHER_NAMES[weather], points });
  }
  const delta = parts.reduce((sum, part) => sum + part.points, 0);
  return { delta, parts, stress, faculty: facultyStress(state), weather, day };
}

// ------------------------------------------------------------ each tick --

/** Bring the semester's running total of Stress up to this tick. */
function integrate(state: GameState): void {
  const term = state.term;
  const tick = state.clock.tick;
  if (tick > term.lastTick) {
    term.stressSum += term.lastStress * (tick - term.lastTick);
    term.lastTick = tick;
  }
}

/** The average Stress of the semester so far. */
export function semesterStress(state: GameState): number {
  const term = state.term;
  const span = state.clock.tick - term.since;
  if (span <= 0) return term.lastStress;
  return (term.stressSum + term.lastStress * (state.clock.tick - term.lastTick)) / span;
}

/** A semester ends: its average Stress is kept, and the next one starts from nothing. */
export function closeSemester(state: GameState): number {
  const average = semesterStress(state);
  const term = state.term;
  term.lastAverage = average;
  term.stressSum = 0;
  term.since = state.clock.tick;
  term.lastTick = state.clock.tick;
  return average;
}

/** How much of a class a semester's Stress costs: nothing up to a middling average, a hundredth at the very worst. */
export function stressLoss(average: number): number {
  return STRESS_RETENTION * clamp01((average - STRESS_SUSTAINED) / (STRESS_WORST - STRESS_SUSTAINED));
}

const line = (template: string, name: string): string => template.replace('{name}', name);

function onMark(state: GameState, mark: CalendarMark, log: LogEntry[], levels: () => CampusLevels): void {
  const { entry, begins } = mark;
  const tick = state.clock.tick;
  const term = state.term;
  const words = CALENDAR_LINES[entry.kind];
  const text = begins ? words?.begins : words?.ends;
  if (text) log.push({ tick, kind: 'calendar', text: line(text, entry.name), data: { id: entry.id, begins: begins ? 1 : 0 } });
  if (entry.id === 'summerStart' && begins) {
    log.push({ tick, kind: 'calendar', text: SUMMER_START_LINE.replace('{share}', String(Math.round(SUMMER_PRESENCE * 100))), data: { id: entry.id, begins: 1 } });
  }

  // A break or the summer changes who is on campus, and so what food and the stores earn.
  if (entry.kind === 'break' || entry.kind === 'start') markRatesDirty(state);

  const exam = (EXAM_KINDS as readonly string[]).includes(entry.kind);
  if (!exam) return;
  // The campus's part is read afresh as exams begin and as they end, and the peak is the higher of the two.
  const read = stressRead(state, levels(), begins ? undefined : entry.kind === 'finals' ? SEASON_CURVE.finals : SEASON_CURVE.midterms);
  term.factor = read.factor;
  const faculty = Math.round(100 * (entry.kind === 'finals' ? SEASON_CURVE.finals : SEASON_CURVE.midterms) * (0.6 + 0.4 * read.crowding));
  if (begins) {
    term.examPeak = read.score;
    term.examCause = read.cause;
    term.facultyPeak = faculty;
    return;
  }
  if (read.score >= term.examPeak) {
    term.examPeak = read.score;
    term.examCause = read.cause;
  }
  term.facultyPeak = Math.max(term.facultyPeak, faculty);
  const cause = STRESS_CAUSES[term.examCause as StressCause] ?? STRESS_CAUSES.season;
  const happy = Math.round(STRESS_HAPPINESS * clamp01((term.examPeak - STRESS_CALM) / (100 - STRESS_CALM)));
  log.push({
    tick,
    kind: 'exam',
    text:
      `${entry.name} is over. Stress peaked at ${term.examPeak}` +
      (happy > 0 ? `, which took ${happy} ${happy === 1 ? 'point' : 'points'} off Happiness while it lasted` : '') +
      `. Its main cause was ${cause.name}. ${cause.fix} Faculty Stress peaked at ${term.facultyPeak}.`,
    data: { id: entry.id, peak: term.examPeak, cause: term.examCause, faculty: term.facultyPeak },
  });
  term.examPeak = 0;
  term.examCause = 'season';
  term.facultyPeak = 0;
}

/**
 * One tick of the academic year: say what begins and ends, keep the
 * semester's Stress up to date, and note the first snow.
 *
 * `levels` reads the campus, and is only called on the few ticks a year that
 * need it, so a long catch-up pays almost nothing for this.
 */
export function stepSeason(state: GameState, log: LogEntry[], levels: () => CampusLevels): void {
  const clock = state.clock;
  const term = state.term;
  const marks = marksAt(clock);
  for (const mark of marks) onMark(state, mark, log, levels);

  // Once an hour the calendar's part of Stress is read again. The campus's part is refreshed once a day.
  const pos = calendarAt(clock);
  if (pos.phase !== 'moveIn' && (pos.tickInDay % TICKS_PER_HOUR === 0 || marks.length > 0)) {
    integrate(state);
    if (pos.tickInDay === 0 && pos.phase !== 'founding') term.factor = stressRead(state, levels()).factor;
    term.lastStress = 100 * seasonCurve(clock) * term.factor;
  }

  // The first snow of each game year gets a line. Weather changes on the hour of a spell.
  if (clock.tick % SPELL_TICKS === 0 && term.snowYear !== clock.week.year && weatherAt(state.seed, clock) === 'snow') {
    term.snowYear = clock.week.year;
    log.push({ tick: clock.tick, kind: 'weather', text: 'The first snow of the year fell on campus.', data: { weather: 'snow' } });
  }
}
