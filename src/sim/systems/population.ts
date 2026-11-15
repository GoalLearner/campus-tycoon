import { calendarAt, GRADUATION_TICK_IN_YEAR } from '../calendar';
import {
  ANCHORS,
  CLASS_YEARS,
  FALL_SHARE,
  HAPPY_ALL,
  HAPPY_NONE,
  LATE_FROM,
  LEAVE_WEIGHTS,
  LEAVE_WHYS,
  RANK_ALL,
  RANK_NONE,
  RANK_UNRANKED,
  RATE_CLASSES,
  STANDING_RANK_WEIGHT,
  TRANSFER_RANK_EASE,
  YEARS_TO_FINISH,
  type Anchor,
  type LeaveWhy,
} from '../config/population';
import type { ClassRecord, GameState } from '../types';
import { friendsStay } from './friends';
import { moneyLeavingEase } from './policies';

/**
 * Who stays, who finishes and when, and why the others leave (DESIGN.md 65.2). Students are counts by class year, as
 * they always were; this is the arithmetic of those counts. A campus's standing, from its rank and its Happiness,
 * places it between a weak campus, a selective public flagship and the most selective, and every share is read
 * along that line, so the campus totals land on the real figures.
 */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface Standing {
  /** 0 to 1: the weak anchor at 0, the flagship at 0.5, the best at 1. */
  q: number;
  /** 0 to 1: the rank's part, before weighing. */
  rank: number;
  /** 0 to 1: Happiness's part, before weighing. */
  happy: number;
}

/** Standing from a rank (0 for none yet) and the campus's Happiness without the season (0 to 100). */
export function standingOf(rank: number, happiness: number): Standing {
  const rankPart = rank > 0 ? clamp01((Math.log(RANK_NONE) - Math.log(rank)) / (Math.log(RANK_NONE) - Math.log(RANK_ALL))) : RANK_UNRANKED;
  const happy = clamp01((happiness - HAPPY_NONE) / (HAPPY_ALL - HAPPY_NONE));
  return { q: STANDING_RANK_WEIGHT * rankPart + (1 - STANDING_RANK_WEIGHT) * happy, rank: rankPart, happy };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The shares at a standing: along the line from the weak anchor to the flagship, or from the flagship to the best. */
export function anchorAt(q: number): Anchor {
  const at = clamp01(q);
  const [from, to, t] = at <= 0.5 ? [ANCHORS.weak, ANCHORS.flagship, at / 0.5] : [ANCHORS.flagship, ANCHORS.best, (at - 0.5) / 0.5];
  return {
    leave: from.leave.map((x, i) => mix(x, to.leave[i]!, t)) as unknown as Anchor['leave'],
    finish: from.finish.map((x, i) => mix(x, to.finish[i]!, t)) as unknown as Anchor['finish'],
  };
}

/** A class's path at these shares, from the day it enters: back for a second year, and finished in four, five and six years. */
export function classPath(a: Anchor): { second: number; four: number; five: number; six: number } {
  let n = 1;
  for (let y = 0; y < 4; y++) n *= 1 - a.leave[y]!;
  const four = n * a.finish[0];
  n = (n - four) * (1 - a.leave[4]);
  const five = n * a.finish[1];
  n = (n - five) * (1 - a.leave[5]);
  const six = n * a.finish[2];
  return { second: 1 - a.leave[0], four, five: four + five, six: four + five + six };
}

/** The share of a class year still enrolled after the fall ends, or after the spring ends, before anything else. */
export function semesterStays(a: Anchor, classYear: number, fall: boolean): number {
  const year = a.leave[Math.min(CLASS_YEARS - 1, classYear)]!;
  const inFall = year * FALL_SHARE[classYear]!;
  return fall ? 1 - inFall : (1 - year) / (1 - inFall);
}

/** The share of a class that has stayed to the start of each class year, and finished before it, at these shares. */
export function survivalTo(a: Anchor, classYear: number): { enrolled: number; onTime: number; inFive: number } {
  let n = 1;
  let onTime = 0;
  let inFive = 0;
  for (let y = 0; y < classYear; y++) {
    n *= 1 - a.leave[y]!;
    if (y === 3) {
      onTime = n * a.finish[0];
      n -= onTime;
    } else if (y === 4) {
      inFive = n * a.finish[1];
      n -= inFive;
    }
  }
  return { enrolled: n, onTime, inFive };
}

/**
 * How a class year's leavers split by reason, as shares summing to 1: transferring is the most common way out, less
 * so from a school near the top; homesickness is a first-year reason, and fades as Happiness rises; money leans on
 * the policies that help with it (DESIGN.md 65.2).
 */
export function leaveShares(state: GameState, standing: Standing, classYear: number): number[] {
  const first = classYear === 0 ? 0 : 1;
  const weights: Record<Exclude<LeaveWhy, 'housing'>, number> = {
    transfer: LEAVE_WEIGHTS.transfer[first] * (1 - TRANSFER_RANK_EASE * standing.rank + TRANSFER_RANK_EASE / 2),
    stoppedOut: LEAVE_WEIGHTS.stoppedOut[first],
    money: LEAVE_WEIGHTS.money[first] * moneyLeavingEase(state),
    grades: LEAVE_WEIGHTS.grades[first],
    homesick: LEAVE_WEIGHTS.homesick[first] * (1.5 - standing.happy),
  };
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return LEAVE_WHYS.map((why) => (why === 'housing' || total <= 0 ? 0 : weights[why] / total));
}

/** Whole counts for `count` leavers at these shares, summing to `count`: the largest remainders round up. */
export function splitCount(count: number, shares: readonly number[]): number[] {
  const exact = shares.map((share) => share * count);
  const out = exact.map(Math.floor);
  let left = count - out.reduce((sum, n) => sum + n, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k]!.i]! += 1;
  return out;
}

/** Add counts of leavers by reason to a record's tally. */
export function addWhy(into: { why?: number[] }, counts: readonly number[]): void {
  const why = into.why ?? LEAVE_WHYS.map(() => 0);
  for (let i = 0; i < LEAVE_WHYS.length; i++) why[i] = (why[i] ?? 0) + (counts[i] ?? 0);
  into.why = why;
}

/** Where a class's late seniors start among its places, given how many seniors it had and how many stay on. */
export function lateFrom(seniors: number, late: number): number {
  return Math.max(0, Math.min(LATE_FROM, seniors - late));
}

/** True when a class has had every year it is counted over: its sixth commencement has passed. */
export function hadItsYears(state: GameState, record: ClassRecord, years = YEARS_TO_FINISH): boolean {
  const { year, tickInYear } = calendarAt(state.clock);
  const last = record.entryYear + years - 1;
  return last < year || (last === year && tickInYear >= GRADUATION_TICK_IN_YEAR);
}

export interface Rates {
  /** Back for a second year, of those who entered. null before any class has begun its second. */
  second: number | null;
  /** Finished in four years, and in six. null before any class has had its years. */
  four: number | null;
  six: number | null;
}

/**
 * The campus's rates, each over its latest classes that have had their years (RATE_CLASSES of them), as the real
 * figures are measured. `counts` says which records count: those begun here, or every record on a model campus.
 */
export function ratesOf(state: GameState, counts: (record: ClassRecord) => boolean): Rates {
  const latest = (pick: (record: ClassRecord) => boolean): ClassRecord[] => state.classes.filter((record) => counts(record) && record.entered > 0 && pick(record)).slice(-RATE_CLASSES);
  const share = (records: ClassRecord[], part: (record: ClassRecord) => number): number | null => {
    const entered = records.reduce((sum, record) => sum + record.entered, 0);
    return entered > 0 ? records.reduce((sum, record) => sum + part(record), 0) / entered : null;
  };
  return {
    second: share(latest((record) => record.second !== undefined), (record) => record.second ?? 0),
    four: share(latest((record) => hadItsYears(state, record, 4)), (record) => record.finishedOnTime + (record.history?.onTime ?? 0)),
    six: share(latest((record) => hadItsYears(state, record)), (record) => record.finishedOnTime + record.finishedLate + (record.history?.onTime ?? 0) + (record.history?.inFive ?? 0)),
  };
}

/**
 * Standing as it stood at the last semester's end: the rank, and Happiness as the semester closed. Cheap, for
 * forecasts read often; what happens at a semester's end reads the campus afresh.
 */
export function standingLately(state: GameState): Standing {
  return standingOf(state.field.rank, state.admissions.lastSemester?.happiness ?? HAPPY_ALL);
}

/**
 * Who leaves at the coming commencement, as a forecast: seniors, fifth- and sixth-year seniors who finish, and the
 * sixth-years who stop out unfinished. With those of them who live in town.
 */
export function commencementLeavers(state: GameState): { students: number; offCampus: number; graduates: number } {
  const a = anchorAt(standingLately(state).q);
  const spring = (classYear: number): number => semesterStays(a, classYear, false);
  const c = state.cohorts;
  const o = state.offCampus;
  const finish = (classYear: 3 | 4 | 5, n: number): number => Math.round(n * spring(classYear) * a.finish[classYear - 3]!);
  const graduates = finish(3, c[3]) + finish(4, c[4]) + finish(5, c[5]);
  return {
    students: finish(3, c[3]) + finish(4, c[4]) + c[5],
    offCampus: finish(3, o[3]) + finish(4, o[4]) + o[5],
    graduates,
  };
}

/** Graduates the coming commencement should see, as a forecast. */
export function expectedGraduates(state: GameState): number {
  return commencementLeavers(state).graduates;
}

/** The path a class entering today would take at today's standing: back for a second year, finished in four and six. */
export function projectedPath(state: GameState, happiness: number): { second: number; four: number; six: number } {
  const path = classPath(anchorAt(standingOf(state.field.rank, happiness).q));
  return { second: path.second, four: path.four, six: path.six };
}

/**
 * The share of the campus that stays on through a semester at today's standing, the fall and the spring alike: its
 * class years weighed by their size, with what friends add to each (DESIGN.md 63.10).
 */
export function semesterStay(state: GameState, happiness: number): number {
  const a = anchorAt(standingOf(state.field.rank, happiness).q);
  let students = 0;
  let staying = 0;
  for (let classYear = 0; classYear < CLASS_YEARS; classYear++) {
    const n = state.cohorts[classYear]!;
    if (n <= 0) continue;
    const plain = (semesterStays(a, classYear, true) + semesterStays(a, classYear, false)) / 2;
    students += n;
    staying += n * Math.min(1, plain + friendsStay(state, plain));
  }
  // An empty campus reads as a class of freshmen would.
  if (students === 0) {
    const plain = (semesterStays(a, 0, true) + semesterStays(a, 0, false)) / 2;
    return Math.min(1, plain + friendsStay(state, plain));
  }
  return staying / students;
}

/** What friends add to the share who stay through a semester, on average over the campus. */
export function friendsKeep(state: GameState, happiness: number): number {
  const a = anchorAt(standingOf(state.field.rank, happiness).q);
  let students = 0;
  let kept = 0;
  for (let classYear = 0; classYear < CLASS_YEARS; classYear++) {
    const n = state.cohorts[classYear]!;
    if (n <= 0) continue;
    students += n;
    kept += n * friendsStay(state, (semesterStays(a, classYear, true) + semesterStays(a, classYear, false)) / 2);
  }
  return students > 0 ? kept / students : 0;
}
