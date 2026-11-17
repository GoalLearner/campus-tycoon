import { describe, expect, it } from 'vitest';
import { newGame, parseSave, serialize, studentCard, toneProblem, type GameState } from '../src/sim';
import { regularDay } from '../src/app/regularDay';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { MWF_LENGTH, TTH_LENGTH } from '../src/sim/config/courses';
import { HARD_INTROS, HONORS, LETTERS, SYLLABI } from '../src/sim/config/coursework';
import { MAJORS } from '../src/sim/config/students';
import { MIGRATIONS, SAVE_VERSION } from '../src/sim/save';
import { adviserOf, averageOf, curvedCourse, gradeSemester, kindOf, officeHabit, professorFor, syllabusOf } from '../src/sim/systems/coursework';
import { capacity } from '../src/sim/systems/capacity';
import { CATALOG, campusGrades, campusRegistration, COURSE_BY_CODE, courseHistory, GPA_BANDS, gradeWords, type CourseHistory } from '../src/sim/systems/registration';
import { classPlaces, semesterOf, type StudentRef } from '../src/sim/systems/students';
import { dateAt } from '../src/sim/calendar';
import { DAY, T0 } from './helpers';

const MODEL = newGame({ seed: 77, name: 'Test University', now: T0, campus: 'model' });

/** Students of the first four class years, spread through each class. */
function students(state: GameState, perClass: number, years = 4): StudentRef[] {
  const out: StudentRef[] = [];
  for (let year = 0; year < years; year++) {
    const place = classPlaces(state, year);
    for (let k = 0; k < Math.min(perClass, place.size); k++) out.push({ entryYear: place.entryYear, index: place.from + Math.floor(((k + 0.5) / perClass) * place.size) });
  }
  return out;
}

const SAMPLE = students(MODEL, 150);
const HISTORIES: Array<{ ref: StudentRef; history: CourseHistory }> = SAMPLE.map((ref) => ({ ref, history: courseHistory(MODEL, ref, semesterOf(MODEL), false) }));

/** Every grade in every semester already over, from the sample. */
function overGrades(): Array<{ code: string; credits: number; letter: string; passed: boolean }> {
  return HISTORIES.flatMap(({ history }) => history.semesters.slice(0, -1).flatMap((plan) => plan.courses.map((one) => ({ code: one.course.code, credits: one.course.credits, letter: one.grade!.letter, passed: one.grade!.passed }))));
}

describe('grades by class (R4b, DESIGN.md 81)', () => {
  it("spreads a semester's average across its classes, the letters coming back to it", () => {
    const courses = ['CHEM 101', 'WRIT 101', 'BIOL 201', 'PSYC 101', 'KINS 100'].map((code) => COURSE_BY_CODE.get(code)!);
    let near = 0;
    let n = 0;
    for (let index = 0; index < 400; index++) {
      const target = 1.6 + (index % 23) * 0.1;
      const grades = gradeSemester(5, { entryYear: 2024, index }, 3, courses, target);
      expect(grades).toHaveLength(courses.length);
      expect(gradeSemester(5, { entryYear: 2024, index }, 3, courses, target)).toEqual(grades);
      for (const grade of grades) expect(LETTERS.some(([letter]) => letter === grade.letter) || grade.letter === 'W').toBe(true);
      const gpa = averageOf(courses.map((course, i) => ({ credits: course.credits, grade: grades[i]! })));
      if (gpa === null) continue;
      n++;
      if (Math.abs(gpa - target) <= 0.07) near++;
      expect(Math.abs(gpa - target)).toBeLessThan(0.35);
    }
    expect(near / n).toBeGreaterThan(0.9);
  });

  it('grades the hard introductory courses hardest and on a curve, a one-credit activity kindest', () => {
    for (const code of HARD_INTROS) {
      expect(COURSE_BY_CODE.has(code), code).toBe(true);
      expect(kindOf(COURSE_BY_CODE.get(code)!)).toBe('hardIntro');
      expect(curvedCourse(COURSE_BY_CODE.get(code)!)).toBe(true);
    }
    expect(kindOf(COURSE_BY_CODE.get('WRIT 101')!)).toBe('writing');
    expect(kindOf(COURSE_BY_CODE.get('KINS 100')!).length).toBeGreaterThan(0);
    expect(kindOf(COURSE_BY_CODE.get('HON 499')!)).toBe('late');
    for (const course of CATALOG) expect(curvedCourse(course)).toBe(HARD_INTROS.has(course.code));
  });

  it("lands on the real figures: A's about 43%, about 1 in 10 a D, an F or a W, about 3 in 10 in the hard introductory courses, and R1's spread", () => {
    const all = overGrades();
    expect(all.length).toBeGreaterThan(3000);
    const share = (list: typeof all, test: (one: (typeof all)[number]) => boolean): number => list.filter(test).length / list.length;
    const bad = (one: (typeof all)[number]): boolean => one.letter === 'W' || one.letter === 'F' || one.letter.startsWith('D');
    const a = share(all, (one) => one.letter.startsWith('A'));
    const dfw = share(all, bad);
    const intros = all.filter((one) => HARD_INTROS.has(one.code));
    const hardIntroDfw = share(intros, bad);
    expect(a).toBeGreaterThan(0.36);
    expect(a).toBeLessThan(0.5);
    expect(dfw).toBeGreaterThan(0.06);
    expect(dfw).toBeLessThan(0.15);
    expect(intros.length).toBeGreaterThan(300);
    expect(hardIntroDfw).toBeGreaterThan(0.2);
    expect(hardIntroDfw).toBeLessThan(0.4);
    // Their averages over the semesters so far, in R1's bands: 4, 8, 19, 29, 27 and 13% (NPSAS:16).
    const gpas = HISTORIES.map(({ history }) => history.gpa).filter((gpa): gpa is number => gpa !== null);
    const bands = [0, 0, 0, 0, 0, 0];
    for (const gpa of gpas) bands[GPA_BANDS.filter((from) => gpa >= from).length]!++;
    const real = [0.04, 0.08, 0.19, 0.29, 0.27, 0.13];
    bands.forEach((count, i) => expect(Math.abs(count / gpas.length - real[i]!), `band ${i}: ${(count / gpas.length).toFixed(3)}`).toBeLessThan(0.07));
  });

  it('gives no credit for an F or a W, and has a course failed taken again before what needs it', () => {
    let retaken = 0;
    let failed = 0;
    let withdrawn = 0;
    for (const { history } of HISTORIES) {
      const passed = new Set<string>();
      let earned = 0;
      history.semesters.forEach((plan, i) => {
        const over = i < history.semesters.length - 1;
        expect(plan.earned).toBe(plan.courses.reduce((sum, one) => sum + (one.grade?.passed ? one.course.credits : 0), 0));
        for (const one of plan.courses) {
          if (one.course.prereq) expect(passed.has(one.course.prereq), `${one.course.code} needs ${one.course.prereq} passed`).toBe(true);
          expect(passed.has(one.course.code), `${one.course.code} again after passing it`).toBe(false);
          if (one.grade?.letter === 'F' && over) failed++;
          if (one.grade?.withdrawn && over) withdrawn++;
          if (!one.grade?.passed && history.semesters.slice(i + 1).some((later) => later.courses.some((other) => other.course.code === one.course.code))) retaken++;
        }
        for (const one of plan.courses) if (one.grade?.passed) passed.add(one.course.code);
        if (over) earned += plan.earned;
      });
      expect(history.earned).toBe(earned);
      // The average counts every letter but a W.
      const letters = history.semesters.slice(0, -1).flatMap((plan) => plan.courses.map((one) => ({ credits: one.course.credits, grade: one.grade })));
      expect(history.gpa).toBe(averageOf(letters));
    }
    expect(failed).toBeGreaterThan(20);
    expect(withdrawn).toBeGreaterThan(10);
    expect(retaken).toBeGreaterThan(5);
  });

  it('gives about one in five a minor by their third year, and Latin honors only to the averages that earn them', () => {
    const upper = HISTORIES.filter(({ ref }) => ref.entryYear <= classPlaces(MODEL, 2).entryYear);
    const minors = upper.filter(({ history }) => history.minor !== null).length / upper.length;
    expect(minors).toBeGreaterThan(0.12);
    expect(minors).toBeLessThan(0.32);
    for (const { history } of HISTORIES) {
      if (history.minor) expect(MAJORS.some((major) => major.name === history.minor)).toBe(true);
      if (history.latin === 'summa cum laude') expect(history.gpa!).toBeGreaterThanOrEqual(3.9);
      if (history.latin === null && history.gpa !== null && history.semesters.length >= 7) expect(history.gpa).toBeLessThan(3.5);
    }
  });

  it('has the Honors College only where it stands: its strongest students in honors sections, and a thesis in their last year', () => {
    expect(HISTORIES.every(({ history }) => !history.honors && history.semesters.every((plan) => plan.courses.every((one) => !one.honors && one.course.code !== 'HON 499')))).toBe(true);
    // The campus's records with the Honors College standing in every semester.
    const now = semesterOf(MODEL);
    const records = [];
    for (let g = now - 8; g <= now; g++) records.push({ ...campusRegistration(MODEL, g), honors: true });
    const honors = { ...MODEL, registration: { records } } as GameState;
    const seniors = students(honors, 200).filter((ref) => ref.entryYear === classPlaces(honors, 3).entryYear);
    const histories = seniors.map((ref) => courseHistory(honors, ref, now, false));
    const share = histories.filter((one) => one.honors).length / histories.length;
    expect(share).toBeGreaterThan(HONORS.share / 2);
    expect(share).toBeLessThan(HONORS.share * 2);
    for (const history of histories) {
      const sections = history.semesters.some((plan) => plan.courses.some((one) => one.honors));
      if (!history.honors) expect(sections).toBe(false);
    }
    expect(histories.some((one) => one.honors && one.semesters.some((plan) => plan.courses.some((c) => c.course.code === 'HON 499')))).toBe(true);
  });

  it('meets for 75 minutes on Tuesdays and Thursdays, 50 on Mondays, Wednesdays and Fridays', () => {
    for (const { ref } of HISTORIES.slice(0, 60)) {
      for (const plan of courseHistory(MODEL, ref).semesters) {
        for (const one of plan.courses) {
          for (const m of one.meetings) {
            if (m.lab || one.course.code === 'FYS 100') continue;
            const length = m.to - m.from;
            if (m.days.includes(2)) expect(length).toBeCloseTo(TTH_LENGTH, 9);
            else expect(length).toBeCloseTo(MWF_LENGTH, 9);
          }
        }
      }
    }
  });

  it("is the same on a student's card as in the campus's sample", () => {
    for (const { ref, history } of HISTORIES.slice(0, 80)) {
      const card = courseHistory(MODEL, ref);
      expect(card.gpa).toBe(history.gpa);
      expect(card.earned).toBe(history.earned);
      expect(card.semesters.map((plan) => plan.courses.map((one) => `${one.course.code} ${one.grade?.letter}`))).toEqual(history.semesters.map((plan) => plan.courses.map((one) => `${one.course.code} ${one.grade?.letter}`)));
    }
  });
});

describe('syllabi, professors and advisers (R4b, DESIGN.md 81.3)', () => {
  it('weighs every syllabus to the whole grade, and marks a part only once it is done', () => {
    for (const items of Object.values(SYLLABI)) expect(items.reduce((sum, one) => sum + one.weight, 0)).toBeCloseTo(1, 9);
    const ref = SAMPLE[0]!;
    const grade = { letter: 'B', points: 3, passed: true, withdrawn: false };
    for (const course of CATALOG.slice(0, 80)) {
      for (const month of [9, 10, 11, 12]) {
        const lines = syllabusOf(77, ref, 10, course, grade, false, month, false);
        expect(syllabusOf(77, ref, 10, course, grade, false, month, false)).toEqual(lines);
        for (const line of lines) {
          expect(line.mark !== null).toBe(month > line.month);
          expect(toneProblem(line.name)).toBeNull();
        }
      }
      expect(syllabusOf(77, ref, 10, course, grade, false, 9, true).every((line) => line.mark !== null)).toBe(true);
      expect(syllabusOf(77, ref, 10, course, { letter: 'W', points: 0, passed: false, withdrawn: true }, false, 12, true).every((line) => line.mark === null)).toBe(true);
    }
  });

  it('makes professors people: the same each time, office hours on two weekdays, and nothing off the hard lines', () => {
    for (const course of CATALOG) {
      for (const section of [1, 2, 5]) {
        const one = professorFor(77, course, section);
        expect(professorFor(77, course, section)).toEqual(one);
        expect(one.officeHours).toHaveLength(2);
        for (const slot of one.officeHours) {
          expect(slot.day).toBeGreaterThanOrEqual(1);
          expect(slot.day).toBeLessThanOrEqual(5);
          expect(slot.to).toBeGreaterThan(slot.from);
        }
        for (const text of [one.name, one.title, one.department, one.style]) expect(toneProblem(text), text).toBeNull();
        // The department is a major's name, already in the game (Psychology is one): the rest is new.
        for (const text of [one.name, one.title, one.style]) expect(hardLineProblem(text), text).toBeNull();
        if (curvedCourse(course)) expect(one.style).toBe('Curves the exams');
      }
    }
  });

  it("gives every student an adviser in their major's department; about half have met them, 1 in 5 must", () => {
    let guided = 0;
    let required = 0;
    for (const ref of SAMPLE) {
      const one = adviserOf(77, ref, 3, 1);
      expect(adviserOf(77, ref, 3, 1)).toEqual(one);
      expect(one.department).toBe(MAJORS[3]!.name);
      if (one.required) expect(one.guided).toBe(true);
      guided += one.guided ? 1 : 0;
      required += one.required ? 1 : 0;
      expect(toneProblem(one.name)).toBeNull();
      expect(hardLineProblem(one.name)).toBeNull();
    }
    expect(guided / SAMPLE.length).toBeGreaterThan(0.45);
    expect(guided / SAMPLE.length).toBeLessThan(0.65);
    expect(required / SAMPLE.length).toBeGreaterThan(0.13);
    expect(required / SAMPLE.length).toBeLessThan(0.27);
    const never = SAMPLE.filter((ref) => officeHabit(77, ref) === 'never').length / SAMPLE.length;
    expect(never).toBeGreaterThan(0.2);
    expect(never).toBeLessThan(0.36);
  });

  it("puts their classes in their own halls, and office hours, tutoring and advising in a followed student's days", () => {
    let atHall = 0;
    let classes = 0;
    let office = 0;
    let days = 0;
    // A week of weekdays, a hundred students each.
    for (let d = 0; d < 7; d++) {
      const state = { ...MODEL, clock: { ...MODEL.clock, tick: MODEL.clock.tick + d * DAY } } as GameState;
      const weekday = dateAt(state.clock).weekday;
      if (weekday === 0 || weekday === 6) continue;
      for (const ref of SAMPLE.slice(0, 100)) {
        const card = studentCard(state, ref);
        if (!card) continue;
        const day = regularDay(null, state, ref, card);
        // A day of classes (the week can run into the days before the term).
        if (day.some((item) => item.where === 'class')) days++;
        for (let i = 1; i < day.length; i++) expect(day[i]!.from).toBeCloseTo(day[i - 1]!.to, 9);
        for (const item of day) {
          expect(toneProblem(item.words), item.words).toBeNull();
          expect(item.to).toBeGreaterThan(item.from);
          // Coffee is a short thing: never an hour before class.
          if (/^Coffee/.test(item.words)) expect(item.to - item.from).toBeLessThanOrEqual(1.25);
          // Lunch round noon; after a full day of classes it is a late lunch, and says so.
          if (/^Lunch/.test(item.words)) expect(item.from).toBeLessThan(14.5);
          if (item.where !== 'class') continue;
          classes++;
          if (item.at) atHall++;
          if (/^Office hours with .+ about [A-Z]+ \d+$/.test(item.words)) office++;
        }
      }
    }
    expect(classes).toBeGreaterThan(300);
    expect(atHall / classes).toBeGreaterThan(0.8);
    // About one or two visits a term for most who go (Student Voice, 2022): a few in a hundred on a weekday.
    expect(office / days).toBeGreaterThan(0.01);
    expect(office / days).toBeLessThan(0.08);
  });
});

describe("the campus's grades (R4b, DESIGN.md 81.7)", () => {
  it("reads last semester's grades from the sample registration keeps, once a semester, in a line for the Faculty row", () => {
    const grades = campusGrades(MODEL)!;
    expect(grades).not.toBeNull();
    expect(campusGrades(MODEL)).toBe(grades);
    expect(grades.semester).toBe(semesterOf(MODEL) - 1);
    expect(grades.a).toBeGreaterThan(0.3);
    expect(grades.a).toBeLessThan(0.55);
    expect(grades.passed).toBeGreaterThan(0.9);
    expect(grades.bands.reduce((sum, one) => sum + one, 0)).toBeCloseTo(1, 9);
    const line = gradeWords(MODEL);
    expect(line).toMatch(/^Last (fall|spring), \d+% of grades were A's/);
    expect(toneProblem(line)).toBeNull();
    expect(hardLineProblem(line)).toBeNull();
    const faculty = capacity(MODEL).needs.find((need) => need.id === 'faculty')!;
    expect(faculty.forecast).toContain(line);
  });
});

describe('the save (R4b, DESIGN.md 81)', () => {
  it('comes through a version 40 save unchanged: every grade is from the seed', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(41);
    const file = JSON.parse(serialize(MODEL, T0));
    file.v = 40;
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(40);
    expect(loaded.state).toEqual(MODEL);
    expect(typeof MIGRATIONS[40]).toBe('function');
  });
});
