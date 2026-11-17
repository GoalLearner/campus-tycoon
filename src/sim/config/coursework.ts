/**
 * Grades by class and academic support (the realism pass, R4b, DESIGN.md 81). Every number here is [T] unless a source
 * is named.
 *
 * Each semester's grade point average is R1's (65.4: the NPSAS:16 spread of a public doctoral university); R4b spreads
 * it across the semester's classes by how hard each is graded, so the letters average out to it and the campus's spread
 * stays R1's. About 43 to 45% of letter grades are A's and about 10% D's and F's (Rojstaczer and Healy, Teachers
 * College Record, 2012, and its 2016 update). In the hard introductory courses about 29% (chemistry) to 34% (calculus) get a D or
 * an F or withdraw (the Gardner Institute's study of 36 institutions, "Digging into the Disciplines").
 */

/** The letters and their points. */
export const LETTERS: ReadonlyArray<readonly [string, number]> = [
  ['A', 4.0],
  ['A-', 3.7],
  ['B+', 3.3],
  ['B', 3.0],
  ['B-', 2.7],
  ['C+', 2.3],
  ['C', 2.0],
  ['C-', 1.7],
  ['D+', 1.3],
  ['D', 1.0],
  ['F', 0],
];

/** How far a class's grade sits from the semester's average, from one class to the next, before how hard it is graded. */
export const CLASS_SPREAD = 0.9;
/** Below this, an F: no credit, and the course must be taken again to count as a prerequisite. */
export const FAIL_BELOW = 0.85;
/** A class going this badly, a student withdraws from it this often: a W, no credit and no grade. */
export const WITHDRAW = { below: 1.35, chance: 0.4 } as const;

/** The big introductory courses graded hardest, and on a curve: chemistry, physics, calculus, statistics, economics and accounting. */
export const HARD_INTROS: ReadonlySet<string> = new Set(['CHEM 101', 'CHEM 102', 'PHYS 101', 'PHYS 102', 'MATH 101', 'MATH 102', 'BIOL 101', 'STAT 200', 'MATH 110', 'ECON 101', 'ECON 102', 'ACCT 101', 'CS 101']);
/**
 * How each kind of course is graded, against the semester's average: the hard introductory courses lowest, writing and the upper levels
 * kinder, a capstone and a one-credit activity kindest.
 */
export const GRADED = { hardIntro: -1.25, intro: -0.12, level200: -0.05, level300: 0.12, topics: 0.25, capstone: 0.3, writing: 0.12, seminar: 0.45, activity: 0.7, studio: 0.3, breadth: 0.05, late: 0.45 } as const;

/** What a syllabus weighs, by the kind of course: each a share of the grade, and when in the term it falls. */
export interface SyllabusItem {
  name: string;
  weight: number;
  /** The month it is done by: midterms in October and March, finals in December and May. */
  month: { fall: number; spring: number };
}

const at = (fall: number, spring: number): { fall: number; spring: number } => ({ fall, spring });
export const SYLLABI: Readonly<Record<'hardIntro' | 'lecture' | 'writing' | 'seminar' | 'studio' | 'activity' | 'capstone' | 'late', readonly SyllabusItem[]>> = {
  hardIntro: [
    { name: 'Homework and quizzes', weight: 0.2, month: at(11, 4) },
    { name: 'Midterm exam', weight: 0.25, month: at(10, 3) },
    { name: 'Lab reports', weight: 0.15, month: at(11, 4) },
    { name: 'Final exam', weight: 0.4, month: at(12, 5) },
  ],
  lecture: [
    { name: 'Quizzes', weight: 0.15, month: at(11, 4) },
    { name: 'Midterm exam', weight: 0.25, month: at(10, 3) },
    { name: 'A paper', weight: 0.25, month: at(11, 4) },
    { name: 'Final exam', weight: 0.35, month: at(12, 5) },
  ],
  writing: [
    { name: 'First paper', weight: 0.2, month: at(9, 2) },
    { name: 'Second paper', weight: 0.25, month: at(10, 3) },
    { name: 'Research paper', weight: 0.35, month: at(12, 5) },
    { name: 'Participation and drafts', weight: 0.2, month: at(12, 5) },
  ],
  seminar: [
    { name: 'Response papers', weight: 0.25, month: at(11, 4) },
    { name: 'Group project', weight: 0.3, month: at(11, 4) },
    { name: 'Presentation', weight: 0.15, month: at(11, 4) },
    { name: 'Final paper', weight: 0.3, month: at(12, 5) },
  ],
  studio: [
    { name: 'Projects', weight: 0.5, month: at(11, 4) },
    { name: 'Critiques', weight: 0.2, month: at(10, 3) },
    { name: 'Final portfolio', weight: 0.3, month: at(12, 5) },
  ],
  activity: [{ name: 'Attendance and effort', weight: 1, month: at(12, 5) }],
  capstone: [
    { name: 'Proposal', weight: 0.15, month: at(9, 2) },
    { name: 'Drafts and meetings', weight: 0.25, month: at(11, 4) },
    { name: 'Final project or thesis', weight: 0.45, month: at(12, 5) },
    { name: 'Presentation', weight: 0.15, month: at(12, 5) },
  ],
  late: [
    { name: 'Hours and journal', weight: 0.5, month: at(11, 4) },
    { name: 'Final report', weight: 0.5, month: at(12, 5) },
  ],
};

/** Latin honors at graduation, by the average (each school sets its own; these are common). */
export const LATIN: ReadonlyArray<readonly [number, string]> = [
  [3.9, 'summa cum laude'],
  [3.75, 'magna cum laude'],
  [3.5, 'cum laude'],
];

/**
 * Minors: about one in five graduates has one (a single, weaker source: about 22% of bachelor's degrees in 2021). A
 * student who takes one declares it in their second year and takes five of its department's courses, one a semester.
 */
export const MINOR = { share: 0.22, from: 2, courses: 5 } as const;

/**
 * The Honors College (34's big build): with it standing, the strongest students by R1's standing are in it, about
 * this share, and take honors sections (smaller) of their introductions and an honors thesis in their last year.
 */
export const HONORS = { share: 0.08, cap: 20 } as const;

/**
 * Office hours: 28% of students never go, and of those who do 55% only once or twice a term (Inside Higher Ed and
 * College Pulse, Student Voice, 2022). A professor keeps two a week, about an hour and a half each.
 */
export const OFFICE_HOURS = { never: 0.28, oneOrTwo: 0.55, hours: 1.5 } as const;
/** A week's chance a student who goes is at a professor's office hours: about 1.5 visits a term of 14 weeks, more when a class goes badly. */
export const OFFICE_WEEK = { usual: 0.1, struggling: 0.3 } as const;

/**
 * Advising: 55% say they have had guidance on the courses they need to finish, and 1 in 5 are required to meet an
 * adviser (Student Voice, 2023). A student's adviser is in their major's department; an appointment comes before
 * registration (October for the spring, March for the fall).
 */
export const ADVISING = { guided: 0.55, required: 0.2 } as const;

/** Professors' titles, by how often a section is taught by each. */
export const TITLES: ReadonlyArray<readonly [string, number]> = [
  ['Professor', 0.3],
  ['Associate Professor', 0.25],
  ['Assistant Professor', 0.25],
  ['Lecturer', 0.2],
];
