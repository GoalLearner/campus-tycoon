import { CLASS_SPREAD, FAIL_BELOW, HARD_INTROS, GRADED, LATIN, LETTERS, OFFICE_HOURS, SYLLABI, TITLES, WITHDRAW, ADVISING, type SyllabusItem } from '../config/coursework';
import { LATE_CREDIT, STUDIO_DEPARTMENTS } from '../config/courses';
import { MAJORS, SURNAME_ENDS, SURNAME_STARTS, FIRST_NAMES } from '../config/students';
import { hashInts } from '../rng';
import { normalInv } from './grades';
import type { StudentRef } from './students';

/**
 * Grades by class, syllabi, professors and advisers (the realism pass, R4b, DESIGN.md 81). Pure functions of the seed,
 * a course and a student: registration (src/sim/systems/registration.ts) calls them as it works out each semester.
 */

export interface CourseLike {
  code: string;
  credits: number;
  level: number;
  dept: number;
}

export type CourseKind = 'hardIntro' | 'intro' | 'level200' | 'level300' | 'topics' | 'capstone' | 'writing' | 'seminar' | 'activity' | 'studio' | 'breadth' | 'late';

const deptCode = (course: CourseLike): string => course.code.split(' ')[0]!;
const number = (course: CourseLike): number => Number(course.code.split(' ')[1]);

/** How a course is graded and what its syllabus weighs: by its level, its department and what it is. */
export function kindOf(course: CourseLike): CourseKind {
  if (HARD_INTROS.has(course.code)) return 'hardIntro';
  if (course.code.startsWith('WRIT')) return 'writing';
  if (course.code === 'FYS 100' || course.code === 'COMM 105') return 'seminar';
  if (course.credits === 1) return 'activity';
  if (LATE_CREDIT.includes(course.code) || course.code === 'HON 499') return 'late';
  if (course.dept < 0) return 'breadth';
  if (STUDIO_DEPARTMENTS.has(deptCode(course))) return 'studio';
  const n = number(course);
  if (n === 490) return 'capstone';
  if (n === 350 || n === 450) return 'topics';
  if (course.level === 100) return 'intro';
  if (course.level === 200) return 'level200';
  return 'level300';
}

/** Graded on a curve: the hard introductory courses, as most are. */
export const curvedCourse = (course: CourseLike): boolean => HARD_INTROS.has(course.code);

export interface Grade {
  letter: string;
  /** Points on the 4.0 scale; 0 for an F, and for a W (withdrawn), which counts in no average. */
  points: number;
  passed: boolean;
  withdrawn: boolean;
}

const u = (...values: number[]): number => (hashInts(...values) >>> 0) / 4294967296;
const codeHash = (code: string): number => {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (Math.imul(h, 31) + code.charCodeAt(i)) | 0;
  return h;
};

function letterFor(points: number): readonly [string, number] {
  if (points < FAIL_BELOW) return LETTERS[LETTERS.length - 1]!;
  let best = LETTERS[0]!;
  for (const one of LETTERS) if (one[1] > 0 && Math.abs(one[1] - points) < Math.abs(best[1] - points)) best = one;
  return best;
}

/**
 * A semester's grades, one for each course (DESIGN.md 81.1): the semester's average (`target`, R1's) spread across its
 * classes by how each is graded and the student's luck in each, then held to the average: the letters, weighed by
 * credits, come out at it, to within the rounding of a letter. A class going very badly is now and then withdrawn from.
 */
export function gradeSemester(seed: number, ref: StudentRef, semester: number, courses: readonly CourseLike[], target: number, spread = CLASS_SPREAD): Grade[] {
  if (courses.length === 0) return [];
  const raw = courses.map((course) => target + GRADED[kindOf(course)] + spread * normalInv(Math.min(0.999, Math.max(0.001, u(seed, ref.entryYear, ref.index, semester, codeHash(course.code), 8201)))));
  // Held to the average inside 0 and 4: a class already at the top (or the bottom) is held there, and the rest move
  // until the credits' average is the semester's.
  const hold = (keep: boolean[]): void => {
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < raw.length; i++) raw[i] = Math.max(0, Math.min(4, raw[i]!));
      let w = 0;
      let sum = 0;
      courses.forEach((course, i) => {
        if (!keep[i]) return;
        w += course.credits;
        sum += course.credits * raw[i]!;
      });
      if (w <= 0) return;
      const off = target - sum / w;
      if (Math.abs(off) < 0.005) return;
      let free = 0;
      courses.forEach((course, i) => {
        if (keep[i] && (off > 0 ? raw[i]! < 4 : raw[i]! > 0)) free += course.credits;
      });
      if (free <= 0) return;
      const shift = (off * w) / free;
      courses.forEach((_, i) => {
        if (keep[i] && (off > 0 ? raw[i]! < 4 : raw[i]! > 0)) raw[i] = raw[i]! + shift;
      });
    }
    for (let i = 0; i < raw.length; i++) raw[i] = Math.max(0, Math.min(4, raw[i]!));
  };
  const all = courses.map(() => true);
  hold(all);
  // A class going very badly: withdrawn from now and then, before the deadline. It counts in no average.
  const withdrawn = courses.map((course, i) => course.credits > 1 && raw[i]! < WITHDRAW.below && u(seed, ref.entryYear, ref.index, semester, codeHash(course.code), 8202) < WITHDRAW.chance);
  const kept = withdrawn.map((w) => !w);
  if (kept.some((k) => k)) hold(kept);
  const letters = raw.map((points) => letterFor(Math.max(0, Math.min(4, points))));
  // The rounding to letters is held to the average too: the class furthest from its letter moves a step toward it.
  for (let pass = 0; pass < 4; pass++) {
    let w = 0;
    let sum = 0;
    courses.forEach((course, i) => {
      if (withdrawn[i]) return;
      w += course.credits;
      sum += course.credits * letters[i]![1];
    });
    if (w <= 0) break;
    const off = target - sum / w;
    if (Math.abs(off) <= 0.06) break;
    let pick = -1;
    let most = 0;
    courses.forEach((_, i) => {
      if (withdrawn[i]) return;
      const residual = raw[i]! - letters[i]![1];
      if (Math.sign(residual) === Math.sign(off) && Math.abs(residual) > most) {
        most = Math.abs(residual);
        pick = i;
      }
    });
    if (pick < 0) break;
    const at = LETTERS.findIndex((one) => one[0] === letters[pick]![0]);
    const step = off > 0 ? Math.max(0, at - 1) : Math.min(LETTERS.length - 1, at + 1);
    letters[pick] = LETTERS[step]!;
    raw[pick] = letters[pick]![1];
  }
  return courses.map((_, i) => (withdrawn[i] ? { letter: 'W', points: 0, passed: false, withdrawn: true } : { letter: letters[i]![0], points: letters[i]![1], passed: letters[i]![1] > 0, withdrawn: false }));
}

/** The average of graded courses, weighed by credits: W's count in none, F's count as nothing. */
export function averageOf(graded: ReadonlyArray<{ credits: number; grade: Grade | null }>): number | null {
  let w = 0;
  let sum = 0;
  for (const one of graded) {
    if (!one.grade || one.grade.withdrawn) continue;
    w += one.credits;
    sum += one.credits * one.grade.points;
  }
  return w > 0 ? sum / w : null;
}

export function latinFor(gpa: number): string | null {
  for (const [from, name] of LATIN) if (gpa >= from) return name;
  return null;
}

// ---------------------------------------------------------------- the syllabus --

export interface SyllabusLine {
  name: string;
  weight: number;
  /** The month it is done by, in the student's semester. */
  month: number;
  /** Their mark when it is done, as a letter; null before. */
  mark: string | null;
}

/**
 * A course's syllabus, and the student's mark on each part once it is done: the parts' marks spread around their grade
 * in the class (its own points), as a class's around a semester's.
 */
export function syllabusOf(seed: number, ref: StudentRef, semester: number, course: CourseLike, grade: Grade | null, spring: boolean, month: number, over: boolean): SyllabusLine[] {
  const kind = kindOf(course);
  const items: readonly SyllabusItem[] = kind === 'hardIntro' ? SYLLABI.hardIntro : kind === 'writing' ? SYLLABI.writing : kind === 'seminar' || kind === 'topics' ? SYLLABI.seminar : kind === 'studio' ? SYLLABI.studio : kind === 'activity' ? SYLLABI.activity : kind === 'capstone' ? SYLLABI.capstone : kind === 'late' ? SYLLABI.late : SYLLABI.lecture;
  const base = grade && !grade.withdrawn ? grade.points : null;
  return items.map((item, k) => {
    const due = spring ? item.month.spring : item.month.fall;
    const done = over || month > due;
    let mark: string | null = null;
    if (done && base !== null) {
      const spread = 0.5 * normalInv(Math.min(0.999, Math.max(0.001, u(seed, ref.entryYear, ref.index, semester, codeHash(course.code), k, 8203))));
      mark = letterFor(Math.max(0, Math.min(4, base + spread)))[0];
    }
    return { name: item.name, weight: item.weight, month: due, mark };
  });
}

// ---------------------------------------------------------------- professors and advisers --

export interface Professor {
  name: string;
  title: string;
  department: string;
  /** Two office hours a week: the day (1 Monday to 5 Friday) and the hours. */
  officeHours: Array<{ day: number; from: number; to: number }>;
  /** How they teach, in a line. */
  style: string;
}

const STYLES = ['Lectures without slides, and takes questions', 'Posts every lecture online', 'Known for long reading lists', 'Cold-calls in class', 'Holds review sessions before every exam', 'Grades fairly and quickly', 'Answers email at midnight', 'Starts every class with a story'] as const;

/** A professor, the same for a course's section every semester: who they are and when they keep office hours. */
export function professorFor(seed: number, course: CourseLike, section: number): Professor {
  const h = hashInts(seed, codeHash(course.code), Math.floor((section - 1) / 2), 8104) >>> 0;
  const name = `${SURNAME_STARTS[h % SURNAME_STARTS.length]!}${SURNAME_ENDS[(h >>> 8) % SURNAME_ENDS.length]!}`;
  let left = u(h, 8204);
  let title = TITLES[0]![0];
  for (const [one, share] of TITLES) {
    left -= share;
    if (left < 0) {
      title = one;
      break;
    }
  }
  const first = 1 + Math.floor(u(h, 8205) * 3);
  const second = first + 2;
  const from1 = [10, 13, 14, 15][Math.floor(u(h, 8206) * 4)]!;
  const from2 = [9.5, 11, 13.5, 15.5][Math.floor(u(h, 8207) * 4)]!;
  const department = course.dept >= 0 ? (MAJORS[course.dept]?.name ?? 'General Studies') : 'General Studies';
  const curved = curvedCourse(course) ? 'Curves the exams' : STYLES[Math.floor(u(h, 8208) * STYLES.length)]!;
  return {
    name: `${title === 'Lecturer' ? '' : 'Prof. '}${title === 'Lecturer' ? `${FIRST_NAMES[(h >>> 4) % FIRST_NAMES.length]!} ${name}` : name}`,
    title,
    department,
    officeHours: [
      { day: first, from: from1, to: from1 + OFFICE_HOURS.hours },
      { day: second, from: from2, to: from2 + OFFICE_HOURS.hours },
    ],
    style: curved,
  };
}

/** How often a student goes to office hours at all: never, once or twice a term, or more. */
export function officeHabit(seed: number, ref: StudentRef): 'never' | 'some' | 'often' {
  const x = u(seed, ref.entryYear, ref.index, 8209);
  return x < OFFICE_HOURS.never ? 'never' : x < OFFICE_HOURS.never + (1 - OFFICE_HOURS.never) * OFFICE_HOURS.oneOrTwo ? 'some' : 'often';
}

export interface Adviser {
  name: string;
  department: string;
  /** Required to meet them (1 in 5), and whether they have had guidance on the courses they need this year. */
  required: boolean;
  guided: boolean;
}

/** A student's academic adviser, in their major's department: the same each year, and whether they have met. */
export function adviserOf(seed: number, ref: StudentRef, major: number, year: number): Adviser {
  const h = hashInts(seed, major, Math.floor(u(seed, ref.entryYear, ref.index, 8210) * 6), 8211) >>> 0;
  const name = `${FIRST_NAMES[h % FIRST_NAMES.length]!} ${SURNAME_STARTS[(h >>> 6) % SURNAME_STARTS.length]!}${SURNAME_ENDS[(h >>> 12) % SURNAME_ENDS.length]!}`;
  const required = u(seed, ref.entryYear, ref.index, 8212) < ADVISING.required;
  const guided = required || u(seed, ref.entryYear, ref.index, year, 8213) < (ADVISING.guided - ADVISING.required) / (1 - ADVISING.required);
  return { name, department: MAJORS[major]?.name ?? 'General Studies', required, guided };
}
