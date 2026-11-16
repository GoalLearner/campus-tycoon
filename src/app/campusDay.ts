import { dateAt, dayRead, weatherAt, type GameState } from '../sim';
import { IN_TERM_FROM } from '../sim/config/season';
import { partiesOn } from '../sim/systems/parties';
import { seasonCurve } from '../sim/systems/season';
import { clockText } from './clockText';

/**
 * The campus's day (DESIGN.md 75): when classes start and let out, the meal rushes, the afternoon's games, the
 * evening's clubs, the gym and Greek Row, a quiet night, and a weekend that starts late. It sets how busy the paths
 * are, where the people on them are heading, how long the lines are, and what the "Today on campus" strip says.
 *
 * All of it is for show. The hour is the player's own (DESIGN.md 28.1), or the hour the "View at" slider shows; the
 * kind of day (a weekday, the weekend, finals, a break) is the game's. Nothing here is saved, and the simulation never
 * reads it, so what a campus earns is the same at every hour and catch-up stays exact.
 */

/** The kind of day it is in the game, as the map reads it. */
export interface DayFacts {
  /** Saturday or Sunday in the game's calendar. */
  weekend: boolean;
  /** Classes meet: a weekday in term, and not finals, a break or the summer. */
  classes: boolean;
  /** Finals week: exams in blocks, and the library busy all day and late. */
  finals: boolean;
  /** Thursday to Saturday in term (63.11): the parties fill from 9 PM. */
  partyNight: boolean;
  /** A break or the summer: most students are away. */
  away: boolean;
}

export const ORDINARY_DAY: DayFacts = { weekend: false, classes: true, finals: false, partyNight: false, away: false };

/**
 * The kind of day from the calendar's own reading of it: classes on a weekday of term or midterms; finals; a break or
 * the summer; and a party night (Thursday to Saturday in term, in fine weather, on a game with parties, as the parties
 * of 63.11 are).
 */
export function dayFactsOf(kind: string, weekend: boolean, partyNight: boolean): DayFacts {
  const away = kind === 'break' || kind === 'summer';
  return { weekend, classes: !weekend && (kind === 'term' || kind === 'midterms'), finals: !weekend && kind === 'finals', partyNight: partyNight && !away, away };
}

/** The kind of day it is on a campus now (`weekend` and `weather` for the dev page's held ones). */
export function todayOf(state: GameState, over: { weekend?: boolean; weather?: string } = {}): DayFacts {
  const date = dateAt(state.clock);
  const weekend = over.weekend ?? (date.weekday === 0 || date.weekday === 6);
  const sky = over.weather ?? weatherAt(state.seed, state.clock);
  const party = date.weekday >= 4 && date.weekday <= 6 && sky === 'clear' && seasonCurve(state.clock) >= IN_TERM_FROM && partiesOn(state);
  return dayFactsOf(dayRead(state.clock).kind, weekend, party);
}

// ---------------------------------------------------------------- classes --

/** [T] A class lasts 50 minutes, and a class change, between one class and the next, 10. */
export const CLASS_LENGTH = 50 / 60;
export const PASSING = 10 / 60;

/**
 * [T] Classes on the hour, 8 AM to 8 PM, and how many start at each against the busiest hour: most mid-morning and
 * early afternoon, fewer at lunch, few in the evening. The last lets out at 8:50 PM.
 */
export const ON_THE_HOUR: ReadonlyArray<readonly [number, number]> = [
  [8, 0.7],
  [9, 0.9],
  [10, 1],
  [11, 1],
  [12, 0.6],
  [13, 0.85],
  [14, 0.9],
  [15, 0.75],
  [16, 0.55],
  [17, 0.35],
  [18, 0.3],
  [19, 0.25],
  [20, 0.15],
];

/** [T] Some classes start on the half hour, 9:30 AM to 7:30 PM: about a third as many as on the hour. */
export const HALF_SHARE = 0.35;
export const ON_THE_HALF: ReadonlyArray<readonly [number, number]> = ON_THE_HOUR.filter(([at]) => at >= 9 && at <= 19).map(([at, load]) => [at + 0.5, load * HALF_SHARE] as const);

/** [T] Finals week: exams of two hours from these starts, each as big as a class change of that size. */
export const EXAM_LENGTH = 2;
export const EXAMS: ReadonlyArray<readonly [number, number]> = [
  [8, 0.6],
  [10.5, 0.7],
  [13, 0.7],
  [15.5, 0.6],
  [18.5, 0.45],
];

/** A class change: from when the last class lets out to when the next starts. `starts` is null for the last letting out. */
export interface ClassChange {
  from: number;
  to: number;
  /** How big, from 0 to 1: the larger of the classes letting out and those starting. */
  size: number;
  starts: number | null;
  exams: boolean;
}

function changesOf(track: ReadonlyArray<readonly [number, number]>, length: number, exams: boolean): ClassChange[] {
  const out: ClassChange[] = [];
  track.forEach(([at, load], i) => {
    // Those letting out of the class before, and those going in to this one.
    const before = i > 0 && Math.abs(track[i - 1]![0] + length + PASSING - at) < 1e-6 ? track[i - 1]![1] : 0;
    out.push({ from: at - PASSING, to: at, size: Math.max(load, before), starts: at, exams });
    // The last of the day, or the last before a gap: out they come.
    const next = track[i + 1];
    if (!next || Math.abs(at + length + PASSING - next[0]) > 1e-6) out.push({ from: at + length, to: at + length + PASSING, size: load * (exams ? 0.8 : 1), starts: null, exams });
  });
  return out;
}

const WEEKDAY_CHANGES = [...changesOf(ON_THE_HOUR, CLASS_LENGTH, false), ...changesOf(ON_THE_HALF, CLASS_LENGTH, false)].sort((a, b) => a.from - b.from);
const FINALS_CHANGES = changesOf(EXAMS, EXAM_LENGTH, true);

/** The day's class changes in order, or none on a day without classes. */
export function classChanges(facts: DayFacts): readonly ClassChange[] {
  if (facts.away || facts.weekend) return [];
  if (facts.finals) return FINALS_CHANGES;
  return facts.classes ? WEEKDAY_CHANGES : [];
}

/** How a class change swells and ebbs: everyone out within two minutes, the last few hurrying in just before the hour. */
function swell(t: number): number {
  return Math.max(0, Math.min(1, t / 0.2, (1 - t) / 0.3));
}

const clockOf = (hour: number): number => ((hour % 24) + 24) % 24;

/** How full of a class change the paths are at an hour, from 0 to 1: 0 outside one, 1 at the busiest change of the day. */
export function passingAt(hour: number, facts: DayFacts): number {
  const h = clockOf(hour);
  let most = 0;
  for (const change of classChanges(facts)) {
    if (h >= change.from && h < change.to) most = Math.max(most, change.size * swell((h - change.from) / (change.to - change.from)));
  }
  return most;
}

/** The class change going on at an hour, if one is. */
export function changeAt(hour: number, facts: DayFacts): ClassChange | null {
  const h = clockOf(hour);
  return classChanges(facts).find((change) => h >= change.from && h < change.to) ?? null;
}

/** The next class change to begin after an hour, today. */
export function nextChange(hour: number, facts: DayFacts): ClassChange | null {
  const h = clockOf(hour);
  return classChanges(facts).find((change) => change.from > h) ?? null;
}

/** The class in session at an hour: when it started and when it lets out. */
export function classOn(hour: number, facts: DayFacts): { from: number; to: number } | null {
  if (facts.away || facts.weekend || !facts.classes || facts.finals) return null;
  const h = clockOf(hour);
  for (const [at] of ON_THE_HOUR) if (h >= at && h < at + CLASS_LENGTH) return { from: at, to: at + CLASS_LENGTH };
  return null;
}

// --------------------------------------------------------------- the paths --

type Points = ReadonlyArray<readonly [number, number]>;

function along(points: Points, hour: number): number {
  const h = clockOf(hour);
  let i = 1;
  while (i < points.length - 1 && points[i]![0] <= h) i += 1;
  const a = points[i - 1]!;
  const b = points[i]!;
  const t = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * t;
}

/**
 * [T] How busy the paths are on a weekday with classes, between class changes, as a share of the busiest class
 * change. Up from 7, a little more at lunch, the afternoon's games and dinner, the evening's clubs, and a quiet night.
 */
export const WEEKDAY_PATHS: Points = [
  [0, 0.14],
  [1, 0.11],
  [2, 0.06],
  [5.5, 0.05],
  [7, 0.18],
  [7.75, 0.35],
  [8, 0.42],
  [11.5, 0.45],
  [12, 0.6],
  [12.75, 0.6],
  [13.25, 0.45],
  [15, 0.45],
  [16, 0.55],
  [17.5, 0.55],
  [18.25, 0.6],
  [19.25, 0.5],
  [21, 0.36],
  [22.5, 0.22],
  [24, 0.14],
];

/** [T] A weekend, a break or the summer: up late, out on the lawns and at the games in the afternoon. */
export const WEEKEND_PATHS: Points = [
  [0, 0.22],
  [1, 0.16],
  [2.5, 0.07],
  [8, 0.04],
  [9.5, 0.14],
  [11, 0.42],
  [13, 0.5],
  [14, 0.58],
  [17, 0.58],
  [18.5, 0.5],
  [20, 0.38],
  [22, 0.3],
  [24, 0.22],
];

/** [T] What a class change adds at its fullest, so the busiest change of the day fills the paths. */
export const FLOOD = 0.55;
/** [T] A party night: out from 9 PM, home after 1. */
export const PARTY_OUT = 0.15;
/** [T] Finals: the library busy late, and people about past midnight. */
export const FINALS_LATE = 0.1;

/** A window of the day, from 0 to 1, with half an hour's ramp at each end. Hours past midnight count on (25 is 1 AM). */
function windowAt(hour: number, from: number, to: number, ramp = 0.5): number {
  const h = clockOf(hour);
  let best = 0;
  for (const at of [h, h + 24]) best = Math.max(best, Math.max(0, Math.min(1, (at - from) / ramp + 1, (to - at) / ramp + 1)));
  return best;
}

/**
 * How busy the paths are at an hour, as a share of the busiest class change: 1 at the change before 11 AM on a weekday,
 * about a half in class, a twentieth in the small hours.
 */
export function pathsAt(hour: number, facts: DayFacts): number {
  const quiet = facts.weekend || facts.away || (!facts.classes && !facts.finals);
  let level = along(quiet ? WEEKEND_PATHS : WEEKDAY_PATHS, hour) + FLOOD * passingAt(hour, facts);
  if (facts.partyNight && !facts.away) level += PARTY_OUT * windowAt(hour, 21, 25);
  if (facts.finals) level += FINALS_LATE * windowAt(hour, 22, 26);
  return Math.max(0, Math.min(1, level));
}

// ------------------------------------------------------- food and the games --

/** The meal rushes, as windows of the day: breakfast, lunch, dinner, a late bite, and the daytime between. */
type Rush = 'breakfast' | 'lunch' | 'dinner' | 'late' | 'day';
const RUSHES: Record<Rush, readonly [number, number]> = {
  breakfast: [7.5, 9],
  lunch: [11.75, 13],
  dinner: [17.5, 19],
  late: [22, 24.5],
  day: [9, 17],
};
/** On a weekend breakfast is brunch, late in the morning. */
const WEEKEND_RUSHES: Record<Rush, readonly [number, number]> = { ...RUSHES, breakfast: [10.5, 12.5], lunch: [12.5, 13.5], late: [22.5, 25.5] };

/**
 * [T] How busy each kind of food is at each rush, against its busiest (DESIGN.md 30.2, 75.2): the dining hall at
 * every meal, coffee in the morning and on through the day, burgers and tacos at lunch, pizza at dinner and late, the
 * diner and the corner store late. A kind with no entry is steady.
 */
export const MEAL_RUSH: Record<string, Partial<Record<Rush, number>> & { floor: number }> = {
  dining: { breakfast: 0.7, lunch: 1, dinner: 0.95, late: 0.1, day: 0.25, floor: 0.05 },
  foodcourt: { breakfast: 0.4, lunch: 1, dinner: 0.9, late: 0.15, day: 0.3, floor: 0.05 },
  diner: { breakfast: 0.6, lunch: 0.35, dinner: 0.6, late: 1, day: 0.3, floor: 0.15 },
  burger: { breakfast: 0.1, lunch: 1, dinner: 0.6, late: 0.25, day: 0.3, floor: 0.05 },
  pizza: { breakfast: 0.05, lunch: 0.45, dinner: 1, late: 0.9, day: 0.2, floor: 0.05 },
  taco: { breakfast: 0.1, lunch: 1, dinner: 0.5, late: 0.15, day: 0.3, floor: 0.05 },
  coffee: { breakfast: 1, lunch: 0.6, dinner: 0.3, late: 0.05, day: 0.6, floor: 0.02 },
  smoothie: { breakfast: 0.5, lunch: 1, dinner: 0.5, late: 0, day: 0.45, floor: 0 },
  convenience: { breakfast: 0.3, lunch: 0.5, dinner: 0.8, late: 1, day: 0.45, floor: 0.2 },
  truck: { breakfast: 0.2, lunch: 1, dinner: 0.6, late: 0.1, day: 0.3, floor: 0.02 },
};

/** How busy a kind of food is at an hour, from 0 to 1. A kind with no entry is steady at 0.6 from 7 AM to midnight. */
export function mealAt(kind: string, hour: number, weekend = false): number {
  const rush = MEAL_RUSH[kind];
  if (!rush) return windowAt(hour, 7, 24) * 0.6;
  const windows = weekend ? WEEKEND_RUSHES : RUSHES;
  let most = rush.floor;
  for (const name of Object.keys(windows) as Rush[]) {
    const weight = rush[name];
    if (weight === undefined) continue;
    const [from, to] = windows[name];
    most = Math.max(most, weight * windowAt(hour, from, to));
  }
  return most;
}

/** [T] The courts, fields, pools and the gym against their busiest (75.2): the afternoon's games, the evening gym, early lifters. */
export const PLAY_TIMES: Points = [
  [0, 0.04],
  [5.5, 0.04],
  [6.5, 0.4],
  [8, 0.35],
  [11, 0.6],
  [14.5, 0.65],
  [15.5, 1],
  [18, 1],
  [19, 0.85],
  [21.5, 0.8],
  [22.5, 0.3],
  [24, 0.04],
];
/** [T] A weekend starts later and plays all afternoon. */
export const WEEKEND_PLAY: Points = [
  [0, 0.04],
  [8, 0.04],
  [10, 0.6],
  [12, 1],
  [18, 1],
  [21, 0.6],
  [22.5, 0.25],
  [24, 0.04],
];

/** How busy the places to play are at an hour, from 0 to 1. */
export function playAt(hour: number, weekend = false): number {
  return along(weekend ? WEEKEND_PLAY : PLAY_TIMES, hour);
}

// ------------------------------------------------------- where people head --

/** Where someone setting out is heading, as the map knows places. `greek` is a chapter house. */
export type Heading = 'class' | 'food' | 'play' | 'seat' | 'quad' | 'home' | 'greek';
/** Where they set out from: their hall, a lecture hall, or anywhere else. */
export type Origin = 'home' | 'class' | 'out';

/**
 * How likely someone setting out is to head for each kind of place at an hour, as weights (DESIGN.md 75.2). In a class
 * change nearly everyone heads to class; at lunch and dinner to food; in the afternoon to the courts and the lawns; in
 * the evening to the gym, clubs and Greek Row; at night home, with a few to the library or a late bite.
 */
export function headingsAt(hour: number, facts: DayFacts, from: Origin): Record<Heading, number> {
  const h = clockOf(hour);
  const passing = passingAt(h, facts);
  const quiet = facts.weekend || facts.away;
  const day = h >= 8 && h < 22;
  const night = h < 6 || h >= 23;
  const lawns = quiet ? windowAt(h, 11, 19) * 24 : windowAt(h, 11, 19) * 10;
  const weights: Record<Heading, number> = {
    class: (facts.classes || facts.finals) && !quiet ? (h >= 7.75 && h < 21 ? 4 : 0) + 90 * passing : 0,
    food: 5 + 35 * mealAt('dining', h, quiet),
    play: 3 + 25 * playAt(h, quiet),
    seat: (day ? 12 : 3) * (facts.finals ? 3 : 1) + (facts.finals && night ? 8 : 0),
    quad: night ? 0 : lawns,
    home: night ? 70 : h < 9 ? 8 : h < 17 ? 12 : h < 21 ? 25 : 45,
    greek: (h >= 19 || h < 2 ? 5 : 0) + (facts.partyNight && windowAt(h, 21, 26) > 0 ? 12 : 0),
  };
  if (from === 'home') weights.home = 0;
  // Out of one class, most go on to the next; between changes, few walk from one lecture hall to another.
  if (from === 'class' && passing < 0.15) weights.class *= 0.2;
  return weights;
}

// --------------------------------------------------- the "Today" strip --

/** Something on the day's list, from an hour: "Lunch rush at 12 PM". */
export interface DayEvent {
  at: number;
  /** Until when it lasts, for the now line. Hours past midnight count on. */
  until: number;
  words: string;
  /** "at" a time, or "from" a time. */
  from: boolean;
}

/** The day's list, in order, by the kind of day. */
export function dayEvents(facts: DayFacts): DayEvent[] {
  const out: DayEvent[] = [];
  const add = (at: number, until: number, words: string, from = false): void => {
    out.push({ at, until, words, from });
  };
  if (facts.away) {
    add(12, 13.5, 'Lunch');
    add(17.5, 19, 'Dinner');
    return out;
  }
  if (facts.weekend) {
    add(10.5, 12.5, 'Brunch', true);
    add(13, 18, 'Out on the lawns', true);
    add(17.5, 19, 'Dinner');
  } else if (facts.finals) {
    for (const [at] of EXAMS) add(at, at + EXAM_LENGTH, 'Exams');
    add(12, 13, 'Lunch rush');
    add(22, 26, 'The library open late', true);
  } else {
    add(8 - PASSING, 8, 'Morning rush');
    add(12, 13, 'Lunch rush');
    add(15, 18, 'Games on the courts', true);
    add(17.5, 19, 'Dinner rush');
    add(19, 22, 'Clubs and the gym', true);
    if (facts.classes) add(20 + CLASS_LENGTH, 21, 'Last classes out');
  }
  if (facts.partyNight) add(21, 25, 'Party night', true);
  add(facts.partyNight ? 25 : 23, 30, 'Quiet night', true);
  return out.sort((a, b) => a.at - b.at);
}

/** True when an hour falls in a stretch of the day; hours past midnight count on. */
function inside(hour: number, from: number, until: number): boolean {
  return (hour >= from && hour < until) || (hour + 24 >= from && hour + 24 < until);
}

/** [T] A class change is called this far ahead, in hours: five minutes. */
export const SOON = 5 / 60;

function inWords(minutes: number): string {
  return minutes <= 1 ? 'in 1 minute' : `in ${minutes} minutes`;
}

/**
 * What is happening now, in a line: "Class change in 2 minutes", "Class change: classes start at 11 AM", "Lunch rush",
 * "Classes until 10:50 AM", "Quiet night: a few night owls".
 */
export function nowLine(hour: number, facts: DayFacts): string {
  const h = clockOf(hour);
  if (facts.away) return 'Most students are away';
  const change = changeAt(h, facts);
  if (change) {
    if (change.starts === null) return change.exams ? 'Exams letting out' : 'Last classes letting out';
    return change.exams ? `Exams start at ${clockText(change.starts, true)}` : `Class change: classes start at ${clockText(change.starts, true)}`;
  }
  const next = nextChange(h, facts);
  if (next && next.starts !== null && next.from - h <= SOON) return `${next.exams ? 'Exams start' : 'Class change'} ${inWords(Math.ceil((next.from - h) * 60 - 1e-6))}`;
  const exam = facts.finals ? EXAMS.find(([from]) => h >= from && h < from + EXAM_LENGTH) : undefined;
  if (exam) return `Exams until ${clockText(exam[0] + EXAM_LENGTH, true)}`;
  const on = dayEvents(facts).find((one) => one.words !== 'Quiet night' && one.words !== 'Exams' && inside(h, one.at, one.until));
  if (on) return on.words;
  const lecture = classOn(h, facts);
  if (lecture) return `Classes until ${clockText(lecture.to)}`;
  if (h < 6 || h >= 23) return 'Quiet night: a few night owls';
  if (h < 10 && (facts.weekend || !facts.classes)) return 'A slow morning';
  if (h < 8) return 'Early: the first classes at 8';
  return h >= 21 ? 'A quiet evening' : 'A steady day';
}

/** What comes next today, up to `count` lines: "Lunch rush at 12 PM", "Party night from 9 PM". */
export function nextLines(hour: number, facts: DayFacts, count = 2): string[] {
  const h = clockOf(hour);
  // The small hours belong to the day before: its list runs on past midnight.
  let at = h < 5 ? h + 24 : h;
  // What starts with the class change going on now is already the now line.
  const change = changeAt(h, facts);
  if (change && change.starts !== null) at = Math.max(at, change.starts);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const one of dayEvents(facts)) {
    if (one.at <= at || seen.has(one.words)) continue;
    seen.add(one.words);
    out.push(`${one.words} ${one.from ? 'from' : 'at'} ${clockText(one.at, true)}`);
    if (out.length >= count) break;
  }
  return out;
}

/** The day's curve for the strip: how busy the paths are, every five minutes from midnight. */
export function dayCurve(facts: DayFacts, stepMinutes = 5): number[] {
  const out: number[] = [];
  for (let m = 0; m < 24 * 60; m += stepMinutes) out.push(pathsAt(m / 60, facts));
  return out;
}
