import { dateAt } from '../calendar';
import { ACTIVITIES, LATE_CREDIT, CALCULUS_FIELDS, BREADTH, CHAIN_NUMBERS, DEPARTMENTS, DEPT_SIZE, EARLY_SHARE, GEN_EDS, LAB, LAB_DEPARTMENTS, LOADS, MWF_HOURS, MWF_LENGTH, REGISTRATION, SECTION_CAP, SEMINAR_SLOT, STUDIO_DEPARTMENTS, TOPICS, TTH_HOURS, TTH_LENGTH, WRITING_FIRST_FALL } from '../config/courses';
import { CLASS_SPREAD, HONORS, MINOR } from '../config/coursework';
import { DEANS_LIST_FROM, PROBATION_BELOW, TEACH_TYPICAL } from '../config/grades';
import { averageOf, curvedCourse, gradeSemester, latinFor, professorFor, type Grade } from './coursework';
import { gradesOf, normalCdf, standingZ, usualTerm } from './grades';
import { bigBuildOpen } from './bigBuilds';
import { CLASS_YEARS } from '../config/population';
import { MAJORS, SURNAME_ENDS, SURNAME_STARTS } from '../config/students';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, LogEntry, RegistrationRecord } from '../types';
import { majorAt, majorPath, semestersIn } from './majors';
import { hallName } from './people';
import { facultyCount, facultyNeed } from './staffing';
import { classPlaces, movedAway, natureOf, semesterOf, teachingQuality, type StudentRef } from './students';

/**
 * Courses and registration (the realism pass, R4a, DESIGN.md 80). Levels of detail, as the social web has them: any
 * student whose card is open gets their whole course history worked out from the seed, semester by semester, against
 * the campus's registration that semester (its full sections and waitlists); the campus as a whole is a record a
 * semester, read from a sample of students run through the same function, so the totals and the cards agree.
 * Nothing here moves a campus number: crowded classes already raise Stress and lower grades (38), and the records
 * show what that crowding means at registration.
 */

const u = (...values: number[]): number => (hashInts(...values) >>> 0) / 4294967296;

// ---------------------------------------------------------------- the catalog --

export interface Course {
  code: string;
  title: string;
  credits: number;
  /** Most students in a section. */
  cap: number;
  /** 100 to 400, or 0 for a general education course with no level to speak of. */
  level: number;
  /** The major's place in MAJORS whose department it is, or -1 for a general education course. */
  dept: number;
  prereq: string | null;
  lab: boolean;
}

function buildCatalog(): Course[] {
  const out: Course[] = [];
  DEPARTMENTS.forEach((dept, d) => {
    const share = MAJORS[d]?.share ?? 0;
    dept.courses.forEach((title, k) => {
      const number = CHAIN_NUMBERS[k]!;
      const intro = k < 2;
      const lab = intro && LAB_DEPARTMENTS.has(dept.code);
      const studio = STUDIO_DEPARTMENTS.has(dept.code);
      const spanish = dept.code === 'SPAN';
      const cap = studio
        ? SECTION_CAP.studio
        : spanish && k < 4
          ? SECTION_CAP.spanish
          : k === 6
            ? SECTION_CAP.capstone
            : intro
              ? share >= DEPT_SIZE.big
                ? SECTION_CAP.introBig
                : share >= DEPT_SIZE.mid
                  ? SECTION_CAP.introMid
                  : SECTION_CAP.introSmall
              : k < 4
                ? SECTION_CAP.level200
                : SECTION_CAP.level300;
      // Each needs the one before it at its level; the 200s an introduction, the 300s a 200, the capstone a 300.
      const before = k === 0 ? -1 : k === 1 ? 0 : k === 2 ? 0 : k === 3 ? 1 : k === 4 ? 2 : k === 5 ? 3 : 4;
      out.push({ code: `${dept.code} ${number}`, title, credits: lab ? 4 : 3, cap, level: Math.floor(number / 100) * 100, dept: d, prereq: before >= 0 ? `${dept.code} ${(CHAIN_NUMBERS as readonly number[])[before]}` : null, lab });
    });
    // Its two topics courses, for juniors and seniors.
    const name = MAJORS[d]?.name ?? dept.code;
    for (const topic of TOPICS) {
      const cap = STUDIO_DEPARTMENTS.has(dept.code) ? SECTION_CAP.studio : SECTION_CAP.topics;
      out.push({ code: `${dept.code} ${topic.number}`, title: `${topic.title} ${name}`, credits: 3, cap, level: Math.floor(topic.number / 100) * 100, dept: d, prereq: `${dept.code} ${topic.prereq}`, lab: false });
    }
  });
  for (const gen of GEN_EDS) out.push({ code: gen.code, title: gen.title, credits: gen.credits, cap: gen.cap, level: 0, dept: -1, prereq: gen.prereq ?? null, lab: gen.lab === true });
  return out;
}

export const CATALOG: readonly Course[] = buildCatalog();
export const COURSE_BY_CODE: ReadonlyMap<string, Course> = new Map(CATALOG.map((course) => [course.code, course]));
/** A department's courses in the order a major takes them: by number, the capstone last. */
const chainOf = (dept: number): Course[] => CATALOG.filter((course) => course.dept === dept).sort((a, b) => Number(a.code.split(' ')[1]) - Number(b.code.split(' ')[1]));
const CHAINS: readonly Course[][] = DEPARTMENTS.map((_, d) => chainOf(d));
/** Courses others take as electives: every department's two introductions, and its 200s once they can. */
const ELECTIVES: readonly string[] = CATALOG.filter((course) => course.dept >= 0 && course.level <= 200).map((course) => course.code);

// ---------------------------------------------------------------- a student's semester --

export interface Meeting {
  /** Weekdays, 1 Monday to 5 Friday. */
  days: number[];
  /** Hours of the day: 9.5 is half past nine. */
  from: number;
  to: number;
  lab: boolean;
}

export interface Enrolled {
  course: Course;
  /** Which section, from 1, and how many the course has. */
  section: number;
  sections: number;
  professor: string;
  hall: string;
  room: number;
  meetings: Meeting[];
  /** Let in off the waitlist. */
  fromWaitlist: boolean;
  /** Required for them: their major's next course, writing, math. */
  needed: boolean;
  /** Where its hall stands on the map, for a followed student to walk to (R4b, DESIGN.md 81.6). null with no hall. */
  hallAt: { x: number; y: number } | null;
  /** An honors section, for a member of the Honors College. */
  honors: boolean;
  /** Their grade in it (R4b, DESIGN.md 81.1): decided from the seed, shown once the semester is over. */
  grade: Grade | null;
}

export interface SemesterPlan {
  /** Their semester since entering, from 0, and the game's semester it is. */
  n: number;
  semester: number;
  courses: Enrolled[];
  credits: number;
  /** Courses they wanted and could not get: full, the waitlist never moving. */
  missed: Array<{ course: Course; needed: boolean }>;
  /** Sections they sat on a waitlist for, let in or not. */
  waitlisted: number;
  /** The semester's grade point average, from its letters, and the credits passed. */
  gpa: number | null;
  earned: number;
}

/** What registration was like a semester: the campus's record, or, before there is one, the base. */
function recordAt(state: GameState, semester: number): RegistrationRecord | null {
  return state.registration?.records.find((one) => one.semester === semester) ?? null;
}

/** The chance a section is full, for a share of students who should go without a needed course a semester. */
function baseFull(short: number): number {
  // About 1.6 needed courses a semester, as registered; a full section's waitlist lets half in.
  const perCourse = 1 - Math.pow(1 - short, 1 / NEEDED_A_SEMESTER);
  return Math.min(0.9, perCourse / (1 - REGISTRATION.waitClears));
}

/** [T] Needed courses a student registers for in a semester, on average (writing, math, the major's), as the sample finds. */
const NEEDED_A_SEMESTER = 1.55;

function load(seed: number, ref: StudentRef, n: number): number {
  let left = u(seed, ref.entryYear, ref.index, n, 8101);
  for (const [credits, share] of LOADS) {
    left -= share;
    if (left < 0) return credits;
  }
  return 15;
}

/** A student's own order of the courses they fill a load with: the same every semester, from the seed. */
interface Orders {
  path: ReturnType<typeof majorPath>;
  breadth: string[];
  electives: string[];
  activities: string[];
  /** Their minor's department, or -1 (R4b, DESIGN.md 81.5). */
  minor: number;
  /** Where they stand among the campus's students, 0 to 1, from R1's standing (who they are): the Honors College takes the top. */
  standing: number;
}

function ordersOf(seed: number, ref: StudentRef): Orders {
  const order = (list: readonly string[], salt: number): string[] => {
    const keys = new Map(list.map((code) => [code, u(seed, ref.entryYear, ref.index, salt, codeHash(code))]));
    return [...list].sort((a, b) => keys.get(a)! - keys.get(b)!);
  };
  const path = majorPath(seed, ref);
  return { path, breadth: order(BREADTH, 8102), electives: order(ELECTIVES, 8103), activities: order(ACTIVITIES, 8109), minor: minorOf(seed, ref, path), standing: normalCdf(standingZ(seed, ref, { archetype: natureOf(seed, ref, movedAway(seed, ref)), classYear: 0, teaching: TEACH_TYPICAL, tutoring: 0 })) };
}

/** A student's minor (R4b, DESIGN.md 81.5): about one in five, in a department other than their majors', by its share. */
export function minorOf(seed: number, ref: StudentRef, path: ReturnType<typeof majorPath>): number {
  if (u(seed, ref.entryYear, ref.index, 8301) >= MINOR.share) return -1;
  const not = new Set([path.intended, path.to, path.second]);
  const total = MAJORS.reduce((sum, major, i) => sum + (not.has(i) ? 0 : major.share), 0);
  let left = u(seed, ref.entryYear, ref.index, 8302) * total;
  for (let i = 0; i < MAJORS.length; i++) {
    if (not.has(i)) continue;
    left -= MAJORS[i]!.share;
    if (left < 0) return i;
  }
  return -1;
}

/** The courses a student wants a semester, the most needed first, as they would put them in. */
function wanted(seed: number, ref: StudentRef, n: number, taken: ReadonlySet<string>, orders: Orders, honors: boolean): Array<{ course: Course; needed: boolean }> {
  const year = Math.floor(n / 2);
  const now = majorAt(orders.path, n);
  const field = MAJORS[now.subject]?.field ?? 'other';
  const out: Array<{ course: Course; needed: boolean }> = [];
  const listed = new Set<string>();
  const add = (code: string, needed: boolean): void => {
    if (taken.has(code) || listed.has(code)) return;
    const course = COURSE_BY_CODE.get(code);
    if (!course || (course.prereq && !taken.has(course.prereq))) return;
    listed.add(code);
    out.push({ course, needed });
  };
  if (n === 0) add('FYS 100', true);
  // College Writing in the first fall for most, the first spring for the rest.
  if (n === 1 || (n === 0 && u(seed, ref.entryYear, ref.index, 8108) < WRITING_FIRST_FALL)) add('WRIT 101', true);
  if (n >= 2 && n <= 4) add('WRIT 201', true);
  // Math: calculus for the sciences and engineering in the first year; statistics or algebra for the rest by the third.
  if (CALCULUS_FIELDS.has(field)) {
    if (n <= 2) add('MATH 101', true);
    if (n <= 4 && field !== 'computerScience') add('MATH 102', true);
  } else if (n >= 1 && n <= 5) add(field === 'arts' || field === 'languages' || field === 'education' ? 'MATH 110' : 'STAT 200', true);
  // The major's chain, the next ones they can take: one a semester in the first two years, two after; the capstone
  // and the advanced topics in the last year.
  const majorCount = year < 2 ? 1 : 2;
  let put = 0;
  for (const course of CHAINS[now.subject] ?? []) {
    if (put >= majorCount) break;
    if (course.level === 400 && n < 6) continue;
    if (course.level === 300 && n < 4) continue;
    if (taken.has(course.code) || (course.prereq && !taken.has(course.prereq))) continue;
    add(course.code, !now.undeclared || course.level === 100);
    put += 1;
  }
  if (now.second !== null) {
    for (const course of CHAINS[now.second] ?? []) {
      if (taken.has(course.code) || (course.prereq && !taken.has(course.prereq))) continue;
      add(course.code, true);
      break;
    }
  }
  // The Honors College's thesis, in a member's last year (81.4).
  if (honors && n >= 6) add('HON 499', true);
  // A minor's courses, one a semester from the second year, the first five of its department's (81.5).
  if (orders.minor >= 0 && n >= MINOR.from && orders.minor !== now.subject) {
    const minorCourses = (CHAINS[orders.minor] ?? []).slice(0, MINOR.courses);
    for (const course of minorCourses) {
      if (taken.has(course.code) || (course.prereq && !taken.has(course.prereq))) continue;
      add(course.code, false);
      break;
    }
  }
  // Breadth, most in the first two years, then electives from other departments; and for juniors and seniors with the
  // rest done, credit for an internship, research or a project of their own. One-credit activities round a load up.
  if (year < 2) {
    for (const code of orders.breadth) add(code, false);
    for (const code of orders.electives) add(code, false);
  } else {
    for (const code of orders.electives) add(code, false);
    for (const code of orders.breadth) add(code, false);
    for (const code of LATE_CREDIT) add(code, false);
  }
  for (const code of orders.activities) add(code, false);
  return out;
}

const codeHash = (code: string): number => {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (Math.imul(h, 31) + code.charCodeAt(i)) | 0;
  return h;
};

/** How many sections a course has a semester on a campus of this size: as its students fill them. */
export function sectionsOf(students: number, course: Course): number {
  const share = course.dept >= 0 ? ((MAJORS[course.dept]?.share ?? 1) / 100) * (course.level === 100 ? 1.4 : course.level === 400 ? 0.25 : 0.5) : GEN_SHARE[course.code] ?? 0.08;
  return Math.max(1, Math.ceil((students * share) / course.cap));
}
const GEN_SHARE: Readonly<Record<string, number>> = { 'FYS 100': 0.24, 'WRIT 101': 0.24, 'WRIT 201': 0.2, 'MATH 110': 0.06, 'STAT 200': 0.12, 'COMM 105': 0.08, 'KINS 100': 0.06 };

function meetingsOf(seed: number, course: Course, section: number): Meeting[] {
  const h = (salt: number): number => u(seed, codeHash(course.code), section, salt);
  if (course.code === 'FYS 100') return [{ days: [SEMINAR_SLOT.day], from: SEMINAR_SLOT.from, to: SEMINAR_SLOT.from + 50 / 60, lab: false }];
  // The 300s and seminars meet on Tuesdays and Thursdays more often; introductions on Mondays, Wednesdays and Fridays.
  const tth = h(1) < (course.level >= 300 ? 0.6 : 0.35);
  const out: Meeting[] = tth
    ? [{ days: [2, 4], from: TTH_HOURS[Math.floor(h(2) * TTH_HOURS.length)]!, to: 0, lab: false }]
    : [{ days: [1, 3, 5], from: MWF_HOURS[Math.floor(h(2) * MWF_HOURS.length)]!, to: 0, lab: false }];
  out[0]!.to = out[0]!.from + (tth ? TTH_LENGTH : MWF_LENGTH);
  // The lab on a day the lecture does not meet: a Tuesday or Thursday for a Monday-Wednesday-Friday course, else a Monday or Wednesday.
  if (course.lab) out.push({ days: [tth ? (h(3) < 0.5 ? 1 : 3) : h(3) < 0.5 ? 2 : 4], from: LAB.from, to: LAB.from + LAB.hours, lab: true });
  return out;
}

const clash = (a: Meeting, b: Meeting): boolean => a.days.some((day) => b.days.includes(day)) && a.from < b.to && b.from < a.to;

/** A professor's name, the same for a section every semester: "Prof. Alderwick" (who they are: professorFor, 81.3). */
export function professorOf(seed: number, course: Course, section: number): string {
  return professorFor(seed, course, section).name;
}
void SURNAME_STARTS;
void SURNAME_ENDS;

/** The campus's lecture halls, where its classes meet. */
function hallsOf(state: GameState): Array<{ x: number; y: number }> {
  return state.map.buildings.filter((b): b is NonNullable<typeof b> => !!b && b.zone === 'academic' && b.stage > 0);
}

/** Where a department teaches: one of the campus's lecture halls, by name and place, and a room in it. */
function hallOf(state: GameState, halls: ReadonlyArray<{ x: number; y: number }>, course: Course, section: number): { hall: string; room: number; at: { x: number; y: number } | null } {
  const room = 100 + ((hashInts(state.seed, codeHash(course.code), section, 8105) >>> 0) % 320);
  if (halls.length === 0) return { hall: 'a lecture hall', room, at: null };
  const key = course.dept >= 0 ? course.dept : codeHash(course.code);
  const hall = halls[(hashInts(state.seed, key, 8106) >>> 0) % halls.length]!;
  return { hall: hallName(state, hall.y * state.map.width + hall.x), room, at: { x: hall.x, y: hall.y } };
}

/** One semester of one student's registration: what they wanted, what they got, when and where it meets. */
function registerSemester(state: GameState, ref: StudentRef, n: number, semester: number, taken: ReadonlySet<string>, students: number, halls: ReadonlyArray<{ x: number; y: number }> | null, orders: Orders, honors: boolean): SemesterPlan {
  const seed = state.seed;
  const year = Math.min(CLASS_YEARS - 1, Math.floor(n / 2));
  const target = load(seed, ref, n);
  const record = recordAt(state, semester);
  const full = Math.min(0.9, (record ? record.pFull : baseFull(REGISTRATION.shortBase)) * REGISTRATION.priority[year]!);
  const early = u(seed, ref.entryYear, ref.index, 8107) < EARLY_SHARE;
  const courses: Enrolled[] = [];
  const missed: Array<{ course: Course; needed: boolean }> = [];
  let credits = 0;
  let waitlisted = 0;
  for (const want of wanted(seed, ref, n, taken, orders, honors)) {
    if (credits >= target) break;
    // The load they meant: a course that would take them past it waits, once they are full time (below 12 they take
    // what they can, up to 18); a one-credit activity rounds a load up.
    if (credits + want.course.credits > 18 || (credits >= 12 && credits + want.course.credits > target)) continue;
    const roll = (salt: number): number => u(seed, ref.entryYear, ref.index, n, codeHash(want.course.code), salt);
    let fromWaitlist = false;
    // An honors section: an introduction for a member of the Honors College, small, and theirs to register for first.
    const honorsSection = honors && want.course.level === 100 && want.course.dept >= 0;
    if (!honorsSection && roll(1) < full) {
      waitlisted += 1;
      if (roll(2) >= REGISTRATION.waitClears) {
        missed.push(want);
        continue;
      }
      fromWaitlist = true;
    }
    // A section that fits the week: the first that clashes with nothing they have, and not at 8 AM for a late riser.
    const sections = honorsSection ? Math.max(1, Math.ceil(sectionsOf(students, want.course) * HONORS.share)) : sectionsOf(students, want.course);
    const start = Math.floor(roll(3) * sections);
    let chosen = -1;
    let meetings: Meeting[] = [];
    for (let k = 0; k < Math.min(sections, 12); k++) {
      const section = ((start + k) % sections) + 1;
      const these = meetingsOf(seed, want.course, section);
      if (!early && sections > 1 && these.some((m) => m.from < 9 && !m.lab) && k < sections - 1) continue;
      if (these.some((m) => courses.some((c) => c.meetings.some((o) => clash(m, o))))) continue;
      chosen = section;
      meetings = these;
      break;
    }
    if (chosen < 0) {
      missed.push(want);
      continue;
    }
    // Who teaches it and where, for a card; the campus's sample does without.
    const where = halls ? hallOf(state, halls, want.course, chosen) : { hall: '', room: 0, at: null };
    courses.push({ course: want.course, section: chosen, sections, professor: halls ? professorOf(seed, want.course, chosen) : '', hall: where.hall, room: where.room, meetings, fromWaitlist, needed: want.needed, hallAt: where.at, honors: honorsSection, grade: null });
    credits += want.course.credits;
  }
  return { n, semester, courses, credits, missed, waitlisted, gpa: null, earned: 0 };
}

/**
 * Grade a semester (R4b, DESIGN.md 81.1): R1's average for it, read with the campus as it stood then (its record's
 * teaching), spread across its classes.
 */
function gradePlan(state: GameState, ref: StudentRef, plan: SemesterPlan, teaching: number): void {
  const nature = natureOf(state.seed, ref, movedAway(state.seed, ref));
  const inputs = { archetype: nature, classYear: Math.min(CLASS_YEARS - 1, Math.floor(plan.n / 2)), teaching, tutoring: 0 };
  const r1 = gradesOf(state.seed, ref, inputs, plan.semester + 1);
  // Their average, and this term's luck less their usual term's: a transcript's average then keeps R1's spread (NPSAS
  // is of averages over all a student's terms), where R1's terms alone, held under 4.0, bunch toward the middle. The
  // Dean's list stays R1's term's.
  const target = Math.max(0, Math.min(4, r1.gpa + r1.term - usualTerm(standingZ(state.seed, ref, inputs))));
  const grades = gradeSemester(state.seed, ref, plan.semester, plan.courses.map((one) => one.course), target, CLASS_SPREAD, r1.deansList);
  plan.courses.forEach((one, i) => {
    one.grade = grades[i] ?? null;
  });
  plan.gpa = averageOf(plan.courses.map((one) => ({ credits: one.course.credits, grade: one.grade })));
  plan.earned = plan.courses.reduce((sum, one) => sum + (one.grade?.passed ? one.course.credits : 0), 0);
}

export interface CourseHistory {
  /** Every semester registered so far, the first first: the latest is this semester. */
  semesters: SemesterPlan[];
  /** Credits passed in the semesters already over: an F or a W earns none (R4b). */
  earned: number;
  /** The grade point average over the semesters already over, from their letters; null before the first is over. */
  gpa: number | null;
  /** Next semester's, once its registration is done. */
  next: SemesterPlan | null;
  /** In the Honors College now (81.4), their minor's name (81.5), and the Latin honors their average would bring. */
  honors: boolean;
  minor: string | null;
  latin: string | null;
}

/**
 * A student's whole course history (DESIGN.md 80): every semester from their first to this one, each registered
 * against that semester's records, and next semester's once registration for it is done. From the seed: the same
 * every time.
 */
export function courseHistory(state: GameState, ref: StudentRef, now = semesterOf(state), detail = true): CourseHistory {
  const nowN = semestersIn(ref.entryYear, now);
  const first = now - nowN;
  const halls = detail ? hallsOf(state) : null;
  const orders = ordersOf(state.seed, ref);
  const teachingNow = teachingQuality(state);
  const honorsNow = bigBuildOpen(state, 'honorsCollege');
  // Courses passed: what counts toward a prerequisite and is never taken again. A course failed or withdrawn from is
  // taken again when it is needed (81.2).
  let taken = new Set<string>();
  const semesters: SemesterPlan[] = [];
  let earned = 0;
  // A semester is registered against its own record, the campus's size then included, so once its record is made it
  // never comes out differently: the campus's sample keeps what it has worked out (a card works it out again, named).
  const semesterOfPlan = (n: number): SemesterPlan => {
    const g = first + n;
    const record = recordAt(state, g);
    const students = record ? record.students : Math.max(1, enrollment(state));
    const teaching = record?.teaching ?? teachingNow;
    const honors = (record?.honors ?? honorsNow) && orders.standing >= 1 - HONORS.share;
    const key = halls ? '' : `${state.seed}:${ref.entryYear}:${ref.index}:${g}:${record ? `${record.pFull}:${record.students}` : 'base'}:${teaching}:${honors ? 1 : 0}`;
    const kept = key ? REGISTERED.get(key) : undefined;
    if (kept && kept.before === taken.size) {
      taken = new Set(kept.after);
      return kept.plan;
    }
    const before = taken.size;
    const plan = registerSemester(state, ref, n, g, taken, students, halls, orders, honors);
    gradePlan(state, ref, plan, teaching);
    for (const course of plan.courses) if (course.grade?.passed) taken.add(course.course.code);
    if (key) {
      if (REGISTERED.size >= REGISTERED_MOST) REGISTERED.clear();
      REGISTERED.set(key, { plan, before, after: [...taken] });
    }
    return plan;
  };
  for (let n = 0; n <= nowN; n++) {
    const plan = semesterOfPlan(n);
    semesters.push(plan);
    if (n < nowN) earned += plan.earned;
  }
  const registered = state.registration?.records.some((one) => one.semester === now + 1) ?? false;
  const next = registered ? semesterOfPlan(nowN + 1) : null;
  // Only the semesters over count toward the average: this one's grades are still being earned.
  const over = semesters.slice(0, -1).flatMap((plan) => plan.courses.map((one) => ({ credits: one.course.credits, grade: one.grade })));
  const gpa = averageOf(over);
  const nowHonors = (recordAt(state, now)?.honors ?? honorsNow) && orders.standing >= 1 - HONORS.share;
  const minorTaken = orders.minor >= 0 ? (CHAINS[orders.minor] ?? []).slice(0, MINOR.courses).filter((course) => taken.has(course.code)).length : 0;
  const minor = orders.minor >= 0 && (minorTaken > 0 || nowN >= MINOR.from) ? (MAJORS[orders.minor]?.name ?? null) : null;
  return { semesters, earned, gpa, next, honors: nowHonors, minor, latin: gpa !== null && nowN >= 6 ? latinFor(gpa) : null };
}

/**
 * A card's grades in a line (R4b, DESIGN.md 81.1), each with what goes by it so the two never read as one: probation by
 * the average over all, the Dean's list by the last term. "3.30 overall · 3.62 last term, Dean's list"; "1.85 overall,
 * on academic probation · 2.10 last term"; "3.62 in their first term, Dean's list"; "No grades yet".
 */
export function gpaWords(history: CourseHistory): string {
  const over = history.semesters.length - 1;
  const lastTerm = history.semesters.at(-2)?.gpa ?? null;
  const average = history.gpa;
  if (average === null) return 'No grades yet';
  const deans = lastTerm !== null && lastTerm >= DEANS_LIST_FROM ? ", Dean's list" : '';
  const probation = average < PROBATION_BELOW ? ', on academic probation' : '';
  if (over <= 1 && lastTerm !== null) return `${average.toFixed(2)} in their first term${deans}${probation}`;
  return `${average.toFixed(2)} overall${probation}${lastTerm !== null ? ` · ${lastTerm.toFixed(2)} last term${deans}` : ''}`;
}

/** What the campus's sample has registered, by student and semester: a semester's plan never changes once made. */
const REGISTERED = new Map<string, { plan: SemesterPlan; before: number; after: string[] }>();
const REGISTERED_MOST = 40_000;

// ---------------------------------------------------------------- the campus's record --

/** Students sampled from each class year for the campus's record. */
const SAMPLE = 24;

/**
 * Registration for a semester across the campus (80.3): how short it is of seats and faculty, and from that how often
 * a section is full; then a sample of students from every class year registered through the same function the cards
 * use, for the totals: who went without a course they needed, the load, the waitlists, and the sections' sizes.
 */
export function campusRegistration(state: GameState, semester: number): RegistrationRecord {
  const students = Math.max(1, enrollment(state));
  const seats = openCapacity(state, 'academic') / students;
  const need = facultyNeed(state);
  const faculty = need > 0 ? facultyCount(state) / need : 1;
  const enough = Math.min(1, seats, faculty);
  const short = Math.min(REGISTRATION.shortMost, REGISTRATION.shortBase + REGISTRATION.shortSlope * (1 - enough));
  const pFull = baseFull(short);
  const record: RegistrationRecord = { semester, students, seats: Math.min(9, seats), faculty: Math.min(9, faculty), pFull, short: 0, credits: 0, fifteen: 0, waitlisted: 0, cleared: 0, under20: 0, over50: 0, teaching: teachingQuality(state), honors: bigBuildOpen(state, 'honorsCollege') };
  // The sample: for the campus record only, registered against this record's own odds.
  const working = { ...state, registration: { records: [...(state.registration?.records.filter((one) => one.semester !== semester) ?? []), record] } } as GameState;
  let sampled = 0;
  let without = 0;
  let creditSum = 0;
  let fifteen = 0;
  let waits = 0;
  let cleared = 0;
  const demand = new Map<string, number>();
  for (let year = 0; year < CLASS_YEARS; year++) {
    const place = classPlaces(state, year);
    if (place.size <= 0) continue;
    const take = Math.min(SAMPLE, place.size);
    const weight = place.size / take;
    for (let k = 0; k < take; k++) {
      const ref = { entryYear: place.entryYear, index: place.from + Math.floor(((k + 0.5) / take) * place.size) };
      const history = courseHistory(working, ref, semester, false);
      const plan = history.semesters[history.semesters.length - 1]!;
      sampled += weight;
      if (plan.missed.some((one) => one.needed)) without += weight;
      creditSum += plan.credits * weight;
      if (plan.credits >= 15) fifteen += weight;
      waits += plan.waitlisted * weight;
      cleared += plan.courses.filter((one) => one.fromWaitlist).length * weight;
      for (const course of plan.courses) demand.set(course.course.code, (demand.get(course.course.code) ?? 0) + weight);
    }
  }
  // The sections each course needs for the students in it, and how full they are: the size bands of a Common Data Set.
  let sections = 0;
  let small = 0;
  let big = 0;
  for (const [code, count] of demand) {
    const course = COURSE_BY_CODE.get(code)!;
    const n = Math.max(1, Math.ceil(count / course.cap));
    const size = count / n;
    sections += n;
    if (size < 20) small += n;
    if (size >= 50) big += n;
  }
  // The campus's share without a needed course is the model's: the sample, small for speed, swings around it (80.3).
  record.short = short;
  void without;
  if (sampled > 0) {
    record.credits = creditSum / sampled;
    record.fifteen = fifteen / sampled;
    record.waitlisted = Math.round(waits);
    record.cleared = Math.round(cleared);
  }
  if (sections > 0) {
    record.under20 = small / sections;
    record.over50 = big / sections;
  }
  return record;
}

/** The campus's grades in the semester just over (81.7): the letters of the same sample registration uses. */
export interface CampusGrades {
  semester: number;
  /** Letter grades given, the sample weighed up to the campus. */
  graded: number;
  /** Shares of the letters: A's (A and A-), and D's, F's and W's; the same in the hard introductory courses. */
  a: number;
  dfw: number;
  hardIntroDfw: number;
  /** Credits passed of those attempted. */
  passed: number;
  /** The average of students' grade point averages over their semesters so far, and their spread in R1's bands (below 1.75, 1.75 to 2.25, ... 3.75 and up). */
  gpa: number;
  bands: number[];
  /** Of third- and fourth-years, the share with a minor; of everyone, the share in the Honors College. */
  minors: number;
  honors: number;
}

const GRADES_SEEN = new Map<string, CampusGrades | null>();
/** R1's bands' edges (NPSAS:16, 65.4): 4% below the first, then 8, 19, 29, 27 and 13% above the last. */
export const GPA_BANDS: readonly number[] = [1.75, 2.25, 2.75, 3.25, 3.75];

/**
 * The campus's grades last semester (81.7), worked out once a semester from the sample registration already keeps: the
 * same students, so the cards and the campus agree. Null before a semester is over.
 */
export function campusGrades(state: GameState): CampusGrades | null {
  const now = semesterOf(state);
  const records = state.registration?.records ?? [];
  const key = `${state.seed}:${now}:${records.length}:${records.at(-1)?.semester ?? -1}:${enrollment(state) > 0 ? 1 : 0}`;
  if (GRADES_SEEN.has(key)) return GRADES_SEEN.get(key)!;
  let graded = 0;
  let a = 0;
  let dfw = 0;
  let intros = 0;
  let hardIntroDfw = 0;
  let tried = 0;
  let passed = 0;
  let people = 0;
  let gpaSum = 0;
  const bands = [0, 0, 0, 0, 0, 0];
  let upper = 0;
  let minors = 0;
  let everyone = 0;
  let honors = 0;
  for (let year = 0; year < CLASS_YEARS; year++) {
    const place = classPlaces(state, year);
    if (place.size <= 0) continue;
    const take = Math.min(SAMPLE, place.size);
    const weight = place.size / take;
    for (let k = 0; k < take; k++) {
      const ref = { entryYear: place.entryYear, index: place.from + Math.floor(((k + 0.5) / take) * place.size) };
      const history = courseHistory(state, ref, now, false);
      everyone += weight;
      if (history.honors) honors += weight;
      if (year >= 2) {
        upper += weight;
        if (history.minor) minors += weight;
      }
      const plan = history.semesters.at(-2);
      if (!plan) continue;
      for (const one of plan.courses) {
        const grade = one.grade;
        if (!grade) continue;
        graded += weight;
        tried += one.course.credits * weight;
        if (grade.passed) passed += one.course.credits * weight;
        const bad = grade.withdrawn || grade.letter.startsWith('D') || grade.letter === 'F';
        if (grade.letter.startsWith('A')) a += weight;
        if (bad) dfw += weight;
        if (curvedCourse(one.course)) {
          intros += weight;
          if (bad) hardIntroDfw += weight;
        }
      }
      // Their average over every semester over, in R1's bands (NPSAS:16's, 65.4).
      if (history.gpa !== null) {
        people += weight;
        gpaSum += history.gpa * weight;
        bands[GPA_BANDS.filter((from) => history.gpa! >= from).length]! += weight;
      }
    }
  }
  const out: CampusGrades | null =
    graded > 0
      ? {
          semester: now - 1,
          graded: Math.round(graded),
          a: a / graded,
          dfw: dfw / graded,
          hardIntroDfw: intros > 0 ? hardIntroDfw / intros : 0,
          passed: tried > 0 ? passed / tried : 1,
          gpa: people > 0 ? gpaSum / people : 0,
          bands: bands.map((n) => (people > 0 ? n / people : 0)),
          minors: upper > 0 ? minors / upper : 0,
          honors: everyone > 0 ? honors / everyone : 0,
        }
      : null;
  if (GRADES_SEEN.size > 40) GRADES_SEEN.clear();
  GRADES_SEEN.set(key, out);
  return out;
}

/**
 * Last semester's grades in a line, for the Capacity page's faculty (81.7): "Last spring, 41% of grades were A's and 1 in
 * 11 a D, an F or a W (3 in 10 in the hard introductory courses)." Empty before a semester is over.
 */
export function gradeWords(state: GameState): string {
  const grades = campusGrades(state);
  if (!grades) return '';
  const term = grades.semester % 2 === 0 ? 'fall' : 'spring';
  return `Last ${term}, ${Math.round(grades.a * 100)}% of grades were A's and ${percentWords(grades.dfw)} a D, an F or a W (${percentWords(grades.hardIntroDfw)} in the hard introductory courses).`;
}

/** The records kept: three years of semesters, enough for every student's history in the game's time. */
const RECORDS_KEPT = 14;

/**
 * Registration through the year (80.3): for the spring from November, for the fall from April, once. A semester with
 * no record yet (a new campus, an older save) is registered at once, with no line in the paper.
 */
export function stepRegistration(state: GameState, log: LogEntry[]): void {
  if (state.clock.tick % 60 !== 0 || enrollment(state) <= 0) return;
  if (!state.registration) state.registration = { records: [] };
  const book = state.registration;
  const now = semesterOf(state);
  if (!book.records.some((one) => one.semester === now)) keep(state, campusRegistration(state, now));
  const date = dateAt(state.clock);
  const spring = date.month >= 11;
  const fall = date.month >= 4 && date.month <= 7;
  if (!spring && !fall) return;
  // Registration is for the next semester: spring's in November, the fall's in April.
  const next = now + 1;
  if (book.records.some((one) => one.semester === next)) return;
  const record = campusRegistration(state, next);
  keep(state, record);
  const term = spring ? 'spring' : 'fall';
  const without = Math.round(record.short * record.students);
  log.push({
    tick: state.clock.tick,
    kind: 'courses',
    text: `Registration for the ${term} is done: ${percentWords(record.short)} of students (about ${without.toLocaleString('en-US')}) could not get a course they needed, ${record.waitlisted.toLocaleString('en-US')} sat on waitlists and ${record.cleared.toLocaleString('en-US')} got in from them. Most took ${record.credits.toFixed(1)} credits.`,
    data: { short: Math.round(record.short * 1000) / 1000, term: spring ? 1 : 0 },
  });
}

function keep(state: GameState, record: RegistrationRecord): void {
  const book = state.registration!;
  book.records = [...book.records.filter((one) => one.semester !== record.semester), record].sort((a, b) => a.semester - b.semester).slice(-RECORDS_KEPT);
}

function percentWords(share: number): string {
  const one = Math.round(1 / Math.max(0.01, share));
  return share >= 0.095 && one <= 10 ? `1 in ${one}` : `${Math.round(share * 100)}%`;
}

/** The latest record, for the Capacity page's seats and the Scorecard. */
export function latestRegistration(state: GameState): RegistrationRecord | null {
  const records = state.registration?.records ?? [];
  return records.length > 0 ? records[records.length - 1]! : null;
}

/**
 * The latest registration in a line, for the Capacity page's seats (80.3): "At registration for the spring, 1 in 6 could
 * not get a course they needed and most took 14.2 credits." Empty before there is one.
 */
export function registrationWords(state: GameState): string {
  const record = latestRegistration(state);
  if (!record) return '';
  const term = record.semester % 2 === 0 ? 'fall' : 'spring';
  return `At registration for the ${term}, ${percentWords(record.short)} could not get a course they needed and most took ${record.credits.toFixed(1)} credits.`;
}
