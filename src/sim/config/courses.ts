/**
 * Courses and registration (the realism pass, R4a, DESIGN.md 80). The catalog: each major's department has seven
 * courses in a chain, two introductions, two at the 200 level, two at the 300 level and a capstone, each needing the
 * one before it; and the general education courses every student takes some of. Section sizes are set so the
 * campus's sections land on a public flagship's (the University of Kansas's Common Data Set, 2025-26: about 39% of
 * sections under 20 students, about 18% of 50 or more). Every number here is [T] unless a source is named.
 */

/** Each major's department code and its seven courses, in the order of MAJORS (src/sim/config/students.ts). */
export const DEPARTMENTS: ReadonlyArray<{ code: string; courses: readonly string[] }> = [
  { code: 'BUS', courses: ['Introduction to Business', 'Business Analytics', 'Principles of Management', 'Business Law', 'Organizational Behavior', 'Operations Management', 'Business Strategy Capstone'] },
  { code: 'ACCT', courses: ['Financial Accounting', 'Managerial Accounting', 'Intermediate Accounting I', 'Intermediate Accounting II', 'Cost Accounting', 'Auditing', 'Accounting Capstone'] },
  { code: 'MKTG', courses: ['Principles of Marketing', 'Consumer Behavior', 'Marketing Research', 'Digital Marketing', 'Brand Management', 'Sales and Negotiation', 'Marketing Strategy Seminar'] },
  { code: 'NURS', courses: ['Foundations of Nursing', 'Health Assessment', 'Pathophysiology', 'Pharmacology for Nurses', 'Adult Health Nursing', 'Community Health Nursing', 'Nursing Leadership Capstone'] },
  { code: 'HSCI', courses: ['Introduction to Health Sciences', 'Medical Terminology', 'Human Anatomy', 'Health Care Systems', 'Research Methods in Health', 'Health Policy', 'Senior Seminar in Health Sciences'] },
  { code: 'PUBH', courses: ['Introduction to Public Health', 'Global Health', 'Epidemiology', 'Biostatistics', 'Environmental Health', 'Health Promotion', 'Public Health Practicum'] },
  { code: 'NUTR', courses: ['Introduction to Nutrition', 'Food Science', 'Nutrition Through the Life Cycle', 'Community Nutrition', 'Clinical Nutrition', 'Food Service Management', 'Senior Seminar in Nutrition'] },
  { code: 'ECON', courses: ['Principles of Microeconomics', 'Principles of Macroeconomics', 'Intermediate Microeconomics', 'Intermediate Macroeconomics', 'Econometrics', 'Labor Economics', 'Senior Seminar in Economics'] },
  { code: 'POLS', courses: ['American Government', 'Comparative Politics', 'International Relations', 'Political Theory', 'Public Policy', 'Constitutional Law', 'Senior Seminar in Political Science'] },
  { code: 'SOC', courses: ['Introduction to Sociology', 'Social Problems', 'Sociological Theory', 'Research Methods in Sociology', 'Families and Society', 'Urban Sociology', 'Senior Seminar in Sociology'] },
  { code: 'HIST', courses: ['United States History to 1877', 'United States History since 1877', 'Historical Methods', 'Modern Europe', 'The Ancient World', 'The Cold War', 'Senior Seminar in History'] },
  { code: 'BIOL', courses: ['Principles of Biology I', 'Principles of Biology II', 'Genetics', 'Cell Biology', 'Ecology', 'Evolution', 'Senior Seminar in Biology'] },
  { code: 'PSYC', courses: ['Introduction to Psychology', 'Research Methods in Psychology', 'Developmental Psychology', 'Social Psychology', 'Cognitive Psychology', 'Clinical Psychology', 'Senior Seminar in Psychology'] },
  { code: 'ME', courses: ['Engineering Graphics', 'Statics', 'Dynamics', 'Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Senior Design Project'] },
  { code: 'EE', courses: ['Introduction to Electrical Engineering', 'Circuits I', 'Circuits II', 'Signals and Systems', 'Electronics', 'Digital Systems', 'Senior Design Project'] },
  { code: 'CE', courses: ['Introduction to Civil Engineering', 'Surveying', 'Mechanics of Materials', 'Structural Analysis', 'Transportation Engineering', 'Water Resources', 'Senior Design Project'] },
  { code: 'CS', courses: ['Introduction to Programming', 'Data Structures', 'Computer Organization', 'Algorithms', 'Operating Systems', 'Software Engineering', 'Senior Capstone in Computing'] },
  { code: 'ART', courses: ['Drawing I', 'Two-Dimensional Design', 'Painting', 'Printmaking', 'Sculpture', 'Photography', 'Senior Exhibition'] },
  { code: 'FILM', courses: ['Introduction to Film', 'Film History', 'Screenwriting', 'Cinematography', 'Editing', 'Documentary', 'Senior Film Project'] },
  { code: 'MUS', courses: ['Music Theory I', 'Music Theory II', 'Aural Skills', 'Music History', 'Conducting', 'Composition', 'Senior Recital'] },
  { code: 'EDUC', courses: ['Foundations of Education', 'Educational Psychology', 'Child Development', 'Teaching Reading', 'Classroom Management', 'Assessment and Learning', 'Student Teaching Seminar'] },
  { code: 'COMM', courses: ['Introduction to Communication', 'Media and Society', 'Interpersonal Communication', 'Public Relations', 'Media Writing', 'Communication Research', 'Senior Seminar in Communication'] },
  { code: 'MATH', courses: ['Calculus I', 'Calculus II', 'Calculus III', 'Linear Algebra', 'Differential Equations', 'Real Analysis', 'Senior Seminar in Mathematics'] },
  { code: 'CHEM', courses: ['General Chemistry I', 'General Chemistry II', 'Organic Chemistry I', 'Organic Chemistry II', 'Analytical Chemistry', 'Biochemistry', 'Senior Seminar in Chemistry'] },
  { code: 'PHYS', courses: ['Physics I', 'Physics II', 'Modern Physics', 'Classical Mechanics', 'Electricity and Magnetism', 'Quantum Mechanics', 'Senior Thesis in Physics'] },
  { code: 'ENGL', courses: ['Introduction to Literature', 'British Literature', 'American Literature', 'Shakespeare', 'Creative Writing', 'Literary Theory', 'Senior Seminar in English'] },
  { code: 'SPAN', courses: ['Elementary Spanish I', 'Elementary Spanish II', 'Intermediate Spanish', 'Spanish Conversation', 'Spanish Literature', 'Spanish Linguistics', 'Senior Seminar in Spanish'] },
  { code: 'PHIL', courses: ['Introduction to Philosophy', 'Logic', 'Ethics', 'Ancient Philosophy', 'Philosophy of Mind', 'Political Philosophy', 'Senior Seminar in Philosophy'] },
  { code: 'KIN', courses: ['Introduction to Kinesiology', 'Anatomy and Movement', 'Physiology of Movement', 'Biomechanics', 'Motor Learning', 'Strength and Conditioning', 'Senior Seminar in Kinesiology'] },
  { code: 'CRJ', courses: ['Introduction to Criminal Justice', 'Policing', 'Courts and Society', 'Corrections', 'Criminology', 'Juvenile Justice', 'Senior Seminar in Criminal Justice'] },
  { code: 'SW', courses: ['Introduction to Social Work', 'Human Behavior and the Social Environment', 'Social Welfare Policy', 'Practice with Individuals', 'Practice with Groups', 'Field Practicum', 'Social Work Field Seminar'] },
  { code: 'ENVS', courses: ['Introduction to Environmental Science', 'Earth Systems', 'Environmental Chemistry', 'Conservation Biology', 'Climate and Society', 'Mapping and GIS', 'Senior Seminar in Environmental Science'] },
  { code: 'ARCH', courses: ['Architectural Design I', 'Architectural Design II', 'History of Architecture', 'Building Technology', 'Design Studio III', 'Urban Design', 'Thesis Studio'] },
  { code: 'LIBS', courses: ['Introduction to Liberal Studies', 'Ideas That Shaped the World', 'Methods Across the Fields', 'Science and Society', 'Arts and Culture', 'Topics in Liberal Studies', 'Liberal Studies Capstone'] },
];

/** The course numbers of the seven, in the chain's order: each needs the one before it at its level, the capstone the 300s. */
export const CHAIN_NUMBERS = [101, 102, 201, 202, 301, 302, 490] as const;
/** Two more in every department for its juniors and seniors: "Topics in Biology" (350) and "Advanced Topics in Biology" (450). */
export const TOPICS = [
  { number: 350, title: 'Topics in', prereq: 201 },
  { number: 450, title: 'Advanced Topics in', prereq: 301 },
] as const;
/** The share of first-years who take College Writing in their first fall; the rest take it in the spring. */
export const WRITING_FIRST_FALL = 0.6;

/** Departments whose introductions are four credits, with a weekly lab (the lab sciences, and Spanish in its first year). */
export const LAB_DEPARTMENTS: ReadonlySet<string> = new Set(['BIOL', 'CHEM', 'PHYS', 'ENVS', 'SPAN']);
/** Departments taught in studios: every section small. */
export const STUDIO_DEPARTMENTS: ReadonlySet<string> = new Set(['ART', 'ARCH', 'MUS', 'FILM']);

/** Most students in each, by how they are taught: an introduction is a big lecture in a big department. */
export const SECTION_CAP = { introBig: 200, introMid: 90, introSmall: 45, level200: 40, level300: 26, topics: 18, capstone: 15, studio: 16, spanish: 22 } as const;
/** A department is big at this share of degrees (percent) and up, middling from the second. */
export const DEPT_SIZE = { big: 3, mid: 1 } as const;

export interface GenEdSpec {
  code: string;
  title: string;
  credits: number;
  cap: number;
  /** A course this one needs first. */
  prereq?: string;
  /** A weekly lab in the afternoon. */
  lab?: boolean;
}

/** The general education courses: writing, a first-year seminar, math, speaking, and the breadth courses. */
export const GEN_EDS: readonly GenEdSpec[] = [
  { code: 'FYS 100', title: 'First-Year Seminar', credits: 1, cap: 18 },
  { code: 'WRIT 101', title: 'College Writing', credits: 3, cap: 19 },
  { code: 'WRIT 201', title: 'Writing in the Disciplines', credits: 3, cap: 19, prereq: 'WRIT 101' },
  { code: 'MATH 110', title: 'College Algebra', credits: 3, cap: 30 },
  { code: 'STAT 200', title: 'Introduction to Statistics', credits: 3, cap: 60 },
  { code: 'COMM 105', title: 'Public Speaking', credits: 3, cap: 22 },
  { code: 'HIST 110', title: 'World Civilizations', credits: 3, cap: 90 },
  { code: 'PHIL 105', title: 'Critical Thinking', credits: 3, cap: 30 },
  { code: 'ANTH 101', title: 'Cultural Anthropology', credits: 3, cap: 45 },
  { code: 'ARTH 101', title: 'Art History Survey', credits: 3, cap: 90 },
  { code: 'MUSC 110', title: 'Music Appreciation', credits: 3, cap: 90 },
  { code: 'GEOL 101', title: 'Earth Science', credits: 4, cap: 45, lab: true },
  { code: 'ASTR 101', title: 'Introduction to Astronomy', credits: 3, cap: 120 },
  { code: 'KINS 100', title: 'Fitness and Wellness', credits: 1, cap: 30 },
  // One-credit activities, to round a load up.
  { code: 'KINS 110', title: 'Yoga', credits: 1, cap: 25 },
  { code: 'KINS 111', title: 'Swimming', credits: 1, cap: 25 },
  { code: 'KINS 112', title: 'Tennis', credits: 1, cap: 25 },
  { code: 'KINS 113', title: 'Running', credits: 1, cap: 25 },
  { code: 'KINS 114', title: 'Rock Climbing', credits: 1, cap: 20 },
  // For juniors and seniors who have taken most of what they need: credit for an internship, research or a project.
  { code: 'IDS 390', title: 'Internship for Credit', credits: 3, cap: 15 },
  { code: 'IDS 395', title: 'Undergraduate Research', credits: 3, cap: 12 },
  { code: 'IDS 399', title: 'Independent Study', credits: 3, cap: 10 },
  // The Honors College's thesis, in a member's last year (R4b, DESIGN.md 81.4).
  { code: 'HON 499', title: 'Honors Thesis', credits: 3, cap: 12 },
];

/** The one-credit activities a load is rounded up with. */
export const ACTIVITIES: readonly string[] = ['KINS 110', 'KINS 111', 'KINS 112', 'KINS 113', 'KINS 114'];
/** What juniors and seniors take when the rest is done. */
export const LATE_CREDIT: readonly string[] = ['IDS 390', 'IDS 395', 'IDS 399'];

/** The breadth courses a student fills a load with, in the first two years especially, after writing and math. */
export const BREADTH: readonly string[] = ['HIST 110', 'PHIL 105', 'ANTH 101', 'ARTH 101', 'MUSC 110', 'GEOL 101', 'ASTR 101', 'COMM 105', 'KINS 100'];

/** Fields whose majors need calculus (MATH 101) in the first year; the rest take statistics or college algebra. */
export const CALCULUS_FIELDS: ReadonlySet<string> = new Set(['engineering', 'computerScience', 'math', 'physicalSciences']);

/**
 * Credits a semester (DESIGN.md 80.2): full time is 12 to 18. Fewer than half of full-time students at four-year
 * publics take 15 or more (Complete College America, "Full-Time Finishers" and "How Full-Time Are 'Full-Time'
 * Students?", 2013-14). The chance of each load, from 12 to 18.
 */
export const LOADS: readonly (readonly [number, number])[] = [
  [12, 0.17],
  [13, 0.15],
  [14, 0.21],
  [15, 0.29],
  [16, 0.1],
  [17, 0.05],
  [18, 0.03],
];

/** A degree is 120 credits. */
export const DEGREE_CREDITS = 120;

/**
 * Registration (DESIGN.md 80.3). About a quarter to a third of students say a course they needed was full or not
 * offered when they wanted it (Inside Higher Ed and College Pulse, Student Voice, 2023: "over a quarter", closer to a
 * third at four-year schools): about 1 in 6 a semester on a campus with seats and faculty enough, so about 3 in 10 over
 * a year. Short of seats or of faculty, more go without.
 */
export const REGISTRATION = {
  /** The share a semester who cannot get a course they need, with seats and faculty enough. */
  shortBase: 0.16,
  /** How much more for each tenth short of seats or faculty. */
  shortSlope: 0.9,
  /** Never more than this. */
  shortMost: 0.6,
  /** A full section's waitlist lets one in this often by the first week. */
  waitClears: 0.5,
  /** Who registers first: seniors, then juniors, sophomores and first-years, as how likely a section is full for them. */
  priority: [1.35, 1.1, 0.85, 0.65, 0.6, 0.6],
} as const;

/**
 * The days and times sections meet (75.2): Monday, Wednesday and Friday on the hour for 50 minutes; Tuesday and
 * Thursday for 75 minutes, starting on the hour or the half hour (8, 9:30, 11, 12:30, 2, 3:30), so each starts in one
 * of the campus's class changes and lets out a few minutes before the next (R4b, DESIGN.md 81.6).
 */
export const MWF_HOURS = [8, 9, 10, 11, 13, 14, 15, 16] as const;
export const TTH_HOURS = [8, 9.5, 11, 12.5, 14, 15.5] as const;
/** How long each meets, in hours. */
export const MWF_LENGTH = 50 / 60;
export const TTH_LENGTH = 75 / 60;
/** A lab is one afternoon a week, nearly three hours. */
export const LAB = { from: 13.5, hours: 2.8 } as const;
/** A first-year seminar meets once a week, Wednesday at four. */
export const SEMINAR_SLOT = { day: 3, from: 16 } as const;
/** The share of students who will take an 8 AM section (R3's early risers, 67.4); the rest choose a later one when they can. */
export const EARLY_SHARE = 0.35;
