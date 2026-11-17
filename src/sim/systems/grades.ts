import {
  ATTEND_CLASSES,
  ATTEND_FRIDAY,
  ATTEND_MEAN,
  ATTEND_PARTY,
  ATTEND_SPREAD,
  ATTEND_TILT,
  ATTEND_WEATHER,
  ATTEND_WEEK,
  DEANS_LIST_FROM,
  GPA_CENTRE,
  GPA_FLOOR,
  GPA_QUANTILES,
  GPA_Z_CLASS_YEAR,
  GPA_Z_TILT,
  PROBATION_BELOW,
  TEACH_TYPICAL,
  TEACH_Z,
  TERM_NOISE,
  TUTOR_Z,
} from '../config/grades';
import { hashInts } from '../rng';

/**
 * Grades and classes (DESIGN.md 65.4): a student's grade point average at the real spread of a public doctoral
 * university (NPSAS:16), from who they are, how well they are taught and how often they go to class; the Dean's list
 * and academic probation from it; and how many of this week's classes they went to. Pure: the card asks, nothing is
 * stored.
 */

interface Ref {
  entryYear: number;
  index: number;
}

/** One salt per draw, apart from the card's and the majors'. */
const SALT = { ability: 61, attend: 62, term: 63, week: 64, termBefore: 65 } as const;

const unit = (seed: number, ref: Ref, salt: number, more?: number): number =>
  ((more === undefined ? hashInts(seed, ref.entryYear, ref.index, salt) : hashInts(seed, ref.entryYear, ref.index, salt, more)) + 0.5) / 4294967297;

/** The standard normal's inverse (Acklam's), to nine places: a number in (0, 1) as a z. */
export function normalInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** The standard normal's distribution: a z as a share below it (Abramowitz and Stegun 7.1.26, to seven places). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** A share of students below, as the grade point average at that point of the real spread. */
export function gpaAt(share: number): number {
  const p = Math.max(0, Math.min(1, share));
  for (let i = 1; i < GPA_QUANTILES.length; i++) {
    const [p1, g1] = GPA_QUANTILES[i]!;
    if (p <= p1) {
      const [p0, g0] = GPA_QUANTILES[i - 1]!;
      return g0 + ((g1 - g0) * (p - p0)) / Math.max(1e-12, p1 - p0);
    }
  }
  return GPA_QUANTILES[GPA_QUANTILES.length - 1]![1];
}

/** The share of students below a grade point average, at the real spread: the inverse of `gpaAt`. */
export function shareBelow(gpa: number): number {
  for (let i = 1; i < GPA_QUANTILES.length; i++) {
    const [p1, g1] = GPA_QUANTILES[i]!;
    if (gpa <= g1) {
      const [p0, g0] = GPA_QUANTILES[i - 1]!;
      return Math.max(0, p0 + ((p1 - p0) * (gpa - g0)) / Math.max(1e-12, g1 - g0));
    }
  }
  return 1;
}

export interface GradeInputs {
  /** The phase or nature the card reads them as. */
  archetype: string;
  classYear: number;
  /** How good the campus's teaching is, 0 to 1. */
  teaching: number;
  /** Points a study center in reach would add, as the card has always read it. */
  tutoring: number;
}

/** Where a student sits in the spread, before this term's luck: who they are, how often they go, how they are taught. */
export function standingZ(seed: number, ref: Ref, inputs: GradeInputs): number {
  const ability = normalInv(unit(seed, ref, SALT.ability));
  const attend = normalInv(unit(seed, ref, SALT.attend));
  return (
    GPA_CENTRE +
    0.8 * ability +
    0.5 * attend +
    (GPA_Z_TILT[inputs.archetype] ?? 0) +
    (GPA_Z_CLASS_YEAR[inputs.classYear] ?? 0) +
    TEACH_Z * (inputs.teaching - TEACH_TYPICAL) +
    TUTOR_Z * (inputs.tutoring > 0 ? 1 : 0)
  );
}

export interface Grades {
  /** Their grade point average over their semesters, on a 4.0 scale. */
  gpa: number;
  /** Last semester's, on its own. */
  term: number;
  /** On the Dean's list for last semester's grades: 3.5 and up. */
  deansList: boolean;
  /** On academic probation: their average below 2.0. */
  probation: boolean;
}

/** A student's grades: their average and last semester's, and what those put them on. `semester` is the game's. */
export function gradesOf(seed: number, ref: Ref, inputs: GradeInputs, semester: number): Grades {
  const z = standingZ(seed, ref, inputs);
  const luck = normalInv(unit(seed, ref, SALT.term, Math.max(0, semester - 1)));
  const gpa = Math.max(GPA_FLOOR, gpaAt(normalCdf(z)));
  const term = Math.max(GPA_FLOOR, gpaAt(normalCdf(Math.sqrt(1 - TERM_NOISE * TERM_NOISE) * z + TERM_NOISE * luck)));
  return { gpa, term, deansList: term >= DEANS_LIST_FROM, probation: gpa < PROBATION_BELOW };
}

/**
 * A term's grade point average for any semester (R4b, DESIGN.md 81.1), the game's `semester` as `gradesOf` takes it: R1's
 * own term for the game's semesters, and for each before the campus's first (a student who entered before it began)
 * its own luck, where R1's would be the first's every time.
 */
export function termAt(seed: number, ref: Ref, inputs: GradeInputs, semester: number): number {
  if (semester >= 1) return gradesOf(seed, ref, inputs, semester).term;
  const luck = normalInv(unit(seed, ref, SALT.termBefore, 1 - semester));
  return Math.max(GPA_FLOOR, gpaAt(normalCdf(Math.sqrt(1 - TERM_NOISE * TERM_NOISE) * standingZ(seed, ref, inputs) + TERM_NOISE * luck)));
}

/**
 * A student's usual term, from where they stand (R4b, DESIGN.md 81.1): the average of their terms' grades over every
 * luck a term can bring. It sits a little inside their average, since a term cannot go above 4.0 or below the floor.
 * R4b's letters take each term as the student's average and this term's luck less their usual, so the average over a
 * transcript keeps R1's spread (NPSAS:16 is of averages over all a student's terms).
 */
export function usualTerm(z: number): number {
  const keep = Math.sqrt(1 - TERM_NOISE * TERM_NOISE);
  let sum = 0;
  let weights = 0;
  for (let i = -12; i <= 12; i++) {
    const x = i / 4;
    const w = Math.exp((-x * x) / 2);
    sum += w * Math.max(GPA_FLOOR, gpaAt(normalCdf(keep * z + TERM_NOISE * x)));
    weights += w;
  }
  return sum / weights;
}

/** The share of a campus below the probation line, at its teaching: the real figure at typical teaching (DESIGN.md 65.4). */
export function probationShare(teaching: number): number {
  return normalCdf(normalInv(shareBelow(PROBATION_BELOW)) - TEACH_Z * (teaching - TEACH_TYPICAL));
}

/** The share of a campus on the Dean's list for a semester, at its teaching. */
export function deansListShare(teaching: number): number {
  return 1 - normalCdf(normalInv(shareBelow(DEANS_LIST_FROM)) - TEACH_Z * (teaching - TEACH_TYPICAL));
}

export interface WeekInClass {
  /** Classes they went to this week, of how many there were. */
  went: number;
  of: number;
}

export interface WeekConditions {
  /** True when rain or snow kept the paths wet this week. */
  wet: boolean;
  /** True when they go out to parties and a party night fell before a class day. */
  partied: boolean;
  /** Days of this week they were too sick for class. */
  sickDays: number;
}

/** How often a student goes to class, 0 to 1: who they are, before the week. */
export function attendanceOf(seed: number, ref: Ref, archetype: string): number {
  const attend = normalInv(unit(seed, ref, SALT.attend));
  return Math.max(0.2, Math.min(0.99, ATTEND_MEAN + ATTEND_SPREAD * attend + (ATTEND_TILT[archetype] ?? 0)));
}

/**
 * This week's classes: fewer on Friday, fewer when it rains or snows, fewer the morning after a party, none while
 * sick (DESIGN.md 65.4). `week` is the game week, for the week's own luck.
 */
export function weekInClass(seed: number, ref: Ref, archetype: string, week: number, conditions: WeekConditions): WeekInClass {
  const base = attendanceOf(seed, ref, archetype) + ATTEND_WEEK * normalInv(unit(seed, ref, SALT.week, week)) - (conditions.wet ? ATTEND_WEATHER : 0);
  const fridays = ATTEND_CLASSES.friday;
  const others = ATTEND_CLASSES.week - fridays;
  const sick = Math.min(ATTEND_CLASSES.week, Math.round((conditions.sickDays / 5) * ATTEND_CLASSES.week));
  const share = (x: number): number => Math.max(0, Math.min(1, x));
  const went = Math.round(share(base) * others + share(base - ATTEND_FRIDAY - (conditions.partied ? ATTEND_PARTY : 0)) * fridays);
  return { went: Math.max(0, went - sick), of: ATTEND_CLASSES.week };
}
