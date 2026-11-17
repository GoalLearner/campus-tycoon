import { dateAt } from '../calendar';
import { ACTIVITIES, LATE_CREDIT, CALCULUS_FIELDS, BREADTH, CHAIN_NUMBERS, DEPARTMENTS, DEPT_SIZE, EARLY_SHARE, GEN_EDS, LAB, LAB_DEPARTMENTS, LOADS, MWF_HOURS, REGISTRATION, SECTION_CAP, SEMINAR_SLOT, STUDIO_DEPARTMENTS, TOPICS, TTH_HOURS, WRITING_FIRST_FALL } from '../config/courses';
import { CLASS_YEARS } from '../config/population';
import { MAJORS, SURNAME_ENDS, SURNAME_STARTS } from '../config/students';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, LogEntry, RegistrationRecord } from '../types';
import { majorAt, majorPath, semestersIn } from './majors';
import { hallName } from './people';
import { facultyCount, facultyNeed } from './staffing';
import { classPlaces, semesterOf, type StudentRef } from './students';

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
      const language = dept.code === 'SPAN';
      const cap = studio
        ? SECTION_CAP.studio
        : language && k < 4
          ? SECTION_CAP.language
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
}

function ordersOf(seed: number, ref: StudentRef): Orders {
  const order = (list: readonly string[], salt: number): string[] => {
    const keys = new Map(list.map((code) => [code, u(seed, ref.entryYear, ref.index, salt, codeHash(code))]));
    return [...list].sort((a, b) => keys.get(a)! - keys.get(b)!);
  };
  return { path: majorPath(seed, ref), breadth: order(BREADTH, 8102), electives: order(ELECTIVES, 8103), activities: order(ACTIVITIES, 8109) };
}

/** The courses a student wants a semester, the most needed first, as they would put them in. */
function wanted(seed: number, ref: StudentRef, n: number, taken: ReadonlySet<string>, orders: Orders): Array<{ course: Course; needed: boolean }> {
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
  out[0]!.to = out[0]!.from + 50 / 60;
  // The lab on a day the lecture does not meet: a Tuesday or Thursday for a Monday-Wednesday-Friday course, else a Monday or Wednesday.
  if (course.lab) out.push({ days: [tth ? (h(3) < 0.5 ? 1 : 3) : h(3) < 0.5 ? 2 : 4], from: LAB.from, to: LAB.from + LAB.hours, lab: true });
  return out;
}

const clash = (a: Meeting, b: Meeting): boolean => a.days.some((day) => b.days.includes(day)) && a.from < b.to && b.from < a.to;

/** A professor's name, the same for a section every semester: "Prof. Alderwick". */
export function professorOf(seed: number, course: Course, section: number): string {
  const h = hashInts(seed, codeHash(course.code), Math.floor((section - 1) / 2), 8104) >>> 0;
  return `Prof. ${SURNAME_STARTS[h % SURNAME_STARTS.length]!}${SURNAME_ENDS[(h >>> 8) % SURNAME_ENDS.length]!}`;
}

/** The campus's lecture halls, where its classes meet. */
function hallsOf(state: GameState): Array<{ x: number; y: number }> {
  return state.map.buildings.filter((b): b is NonNullable<typeof b> => !!b && b.zone === 'academic' && b.stage > 0);
}

/** Where a department teaches: one of the campus's lecture halls, by name, and a room in it. */
function hallOf(state: GameState, halls: ReadonlyArray<{ x: number; y: number }>, course: Course, section: number): { hall: string; room: number } {
  const room = 100 + ((hashInts(state.seed, codeHash(course.code), section, 8105) >>> 0) % 320);
  if (halls.length === 0) return { hall: 'a lecture hall', room };
  const key = course.dept >= 0 ? course.dept : codeHash(course.code);
  const hall = halls[(hashInts(state.seed, key, 8106) >>> 0) % halls.length]!;
  return { hall: hallName(state, hall.y * state.map.width + hall.x), room };
}

/** One semester of one student's registration: what they wanted, what they got, when and where it meets. */
function registerSemester(state: GameState, ref: StudentRef, n: number, semester: number, taken: ReadonlySet<string>, students: number, halls: ReadonlyArray<{ x: number; y: number }> | null, orders: Orders): SemesterPlan {
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
  for (const want of wanted(seed, ref, n, taken, orders)) {
    if (credits >= target) break;
    // The load they meant: a course that would take them past it waits, once they are full time (below 12 they take
    // what they can, up to 18); a one-credit activity rounds a load up.
    if (credits + want.course.credits > 18 || (credits >= 12 && credits + want.course.credits > target)) continue;
    const roll = (salt: number): number => u(seed, ref.entryYear, ref.index, n, codeHash(want.course.code), salt);
    let fromWaitlist = false;
    if (roll(1) < full) {
      waitlisted += 1;
      if (roll(2) >= REGISTRATION.waitClears) {
        missed.push(want);
        continue;
      }
      fromWaitlist = true;
    }
    // A section that fits the week: the first that clashes with nothing they have, and not at 8 AM for a late riser.
    const sections = sectionsOf(students, want.course);
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
    const where = halls ? hallOf(state, halls, want.course, chosen) : { hall: '', room: 0 };
    courses.push({ course: want.course, section: chosen, sections, professor: halls ? professorOf(seed, want.course, chosen) : '', hall: where.hall, room: where.room, meetings, fromWaitlist, needed: want.needed });
    credits += want.course.credits;
  }
  return { n, semester, courses, credits, missed, waitlisted };
}

export interface CourseHistory {
  /** Every semester registered so far, the first first: the latest is this semester. */
  semesters: SemesterPlan[];
  /** Credits from the semesters already over (R4b gives grades; until then every course taken counts). */
  earned: number;
  /** Next semester's, once its registration is done. */
  next: SemesterPlan | null;
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
  let taken = new Set<string>();
  const semesters: SemesterPlan[] = [];
  let earned = 0;
  // A semester is registered against its own record, the campus's size then included, so once its record is made it
  // never comes out differently: the campus's sample keeps what it has worked out (a card works it out again, named).
  const semesterOfPlan = (n: number): SemesterPlan => {
    const g = first + n;
    const record = recordAt(state, g);
    const students = record ? record.students : Math.max(1, enrollment(state));
    const key = halls ? '' : `${state.seed}:${ref.entryYear}:${ref.index}:${g}:${record ? `${record.pFull}:${record.students}` : 'base'}`;
    const kept = key ? REGISTERED.get(key) : undefined;
    if (kept && kept.before === taken.size) {
      taken = new Set(kept.after);
      return kept.plan;
    }
    const before = taken.size;
    const plan = registerSemester(state, ref, n, g, taken, students, halls, orders);
    for (const course of plan.courses) taken.add(course.course.code);
    if (key) {
      if (REGISTERED.size >= REGISTERED_MOST) REGISTERED.clear();
      REGISTERED.set(key, { plan, before, after: [...taken] });
    }
    return plan;
  };
  for (let n = 0; n <= nowN; n++) {
    const plan = semesterOfPlan(n);
    semesters.push(plan);
    if (n < nowN) earned += plan.credits;
  }
  const registered = state.registration?.records.some((one) => one.semester === now + 1) ?? false;
  const next = registered ? semesterOfPlan(nowN + 1) : null;
  return { semesters, earned, next };
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
  const record: RegistrationRecord = { semester, students, seats: Math.min(9, seats), faculty: Math.min(9, faculty), pFull, short: 0, credits: 0, fifteen: 0, waitlisted: 0, cleared: 0, under20: 0, over50: 0 };
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
