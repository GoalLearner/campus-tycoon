import { describe, expect, it } from 'vitest';
import { advance, newGame, parseSave, serialize, toneProblem, TICK_MS, type GameState } from '../src/sim';
import { dateAt } from '../src/sim/calendar';
import { DEGREE_CREDITS, DEPARTMENTS, MWF_HOURS, REGISTRATION, TTH_HOURS } from '../src/sim/config/courses';
import { MAJORS } from '../src/sim/config/students';
import { MIGRATIONS, SAVE_VERSION } from '../src/sim/save';
import { CATALOG, COURSE_BY_CODE, campusRegistration, courseHistory, latestRegistration, stepRegistration, type SemesterPlan } from '../src/sim/systems/registration';
import { classPlaces, semesterOf } from '../src/sim/systems/students';
import type { LogEntry } from '../src/sim/types';

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const MODEL = newGame({ seed: 77, name: 'Test University', now: T0, campus: 'model' });
const DAY = 24 * 60;

/** Students of every class year on a campus, spread through each class. */
function students(state: GameState, perClass: number): Array<{ entryYear: number; index: number }> {
  const out: Array<{ entryYear: number; index: number }> = [];
  for (let year = 0; year < 6; year++) {
    const place = classPlaces(state, year);
    for (let k = 0; k < Math.min(perClass, place.size); k++) out.push({ entryYear: place.entryYear, index: place.from + Math.floor(((k + 0.5) / perClass) * place.size) });
  }
  return out;
}

const clash = (plan: SemesterPlan): boolean => {
  const all = plan.courses.flatMap((one) => one.meetings);
  return all.some((a, i) => all.some((b, j) => j > i && a.days.some((d) => b.days.includes(d)) && a.from < b.to && b.from < a.to));
};

describe('courses and registration (R4a, DESIGN.md 80)', () => {
  it('has a department of seven courses and two topics for every major, each needing the one before it, and the general courses', () => {
    expect(DEPARTMENTS).toHaveLength(MAJORS.length);
    const codes = CATALOG.map((one) => one.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const course of CATALOG) {
      if (course.prereq) expect(COURSE_BY_CODE.has(course.prereq), course.code).toBe(true);
      expect(toneProblem(course.title), course.title).toBeNull();
      expect([1, 3, 4]).toContain(course.credits);
    }
    for (let d = 0; d < DEPARTMENTS.length; d++) expect(CATALOG.filter((one) => one.dept === d)).toHaveLength(9);
    expect(COURSE_BY_CODE.get('BIOL 201')?.prereq).toBe('BIOL 101');
    expect(COURSE_BY_CODE.get('BIOL 490')?.prereq).toBe('BIOL 301');
  });

  it("works out every student's semesters from the seed: full time, prerequisites first, a week with no clashes, on the hour or the half hour", () => {
    for (const ref of students(MODEL, 20)) {
      const history = courseHistory(MODEL, ref);
      expect(courseHistory(MODEL, ref)).toEqual(history);
      const taken = new Set<string>();
      for (const plan of history.semesters) {
        expect(plan.credits, `${ref.entryYear}:${ref.index} ${plan.n}`).toBeGreaterThanOrEqual(12);
        expect(plan.credits).toBeLessThanOrEqual(18);
        expect(clash(plan)).toBe(false);
        for (const one of plan.courses) {
          if (one.course.prereq) expect(taken.has(one.course.prereq), `${one.course.code} before ${one.course.prereq}`).toBe(true);
          expect(taken.has(one.course.code)).toBe(false);
          for (const m of one.meetings) {
            if (m.lab || one.course.code === 'FYS 100') continue;
            if (m.days.includes(1)) expect(MWF_HOURS as readonly number[]).toContain(m.from);
            else expect(TTH_HOURS as readonly number[]).toContain(m.from);
          }
          // A professor by title and surname, or a lecturer by name (R4b, DESIGN.md 81.3).
          expect(one.professor).toMatch(/^(Prof\. [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+)$/);
          expect(one.hall).toMatch(/ Hall$/);
        }
        // Only a course passed counts: one failed or withdrawn from is taken again (R4b, DESIGN.md 81.2).
        for (const one of plan.courses) if (one.grade?.passed) taken.add(one.course.code);
      }
      // A first-year's first fall has the first-year seminar, unless it was full or clashed; College Writing is
      // registered for in the first year, or was full and is tried again.
      const tried = (plan: SemesterPlan, code: string): boolean => plan.courses.some((one) => one.course.code === code) || plan.missed.some((one) => one.course.code === code);
      if (history.semesters.length >= 1) expect(tried(history.semesters[0]!, 'FYS 100')).toBe(true);
      if (history.semesters.length >= 2) expect(history.semesters.slice(0, 3).some((plan) => tried(plan, 'WRIT 101'))).toBe(true);
      expect(history.earned).toBeLessThan(DEGREE_CREDITS * 1.6);
    }
  });

  it('lands the campus on the real figures: about 1 in 6 a semester without a course they needed, about 14 credits, fewer than half at 15, a flagship\'s sections', () => {
    const records = [MODEL, newGame({ seed: 99, name: 'Test University', now: T0, campus: 'model' })].flatMap((state) => [campusRegistration(state, semesterOf(state)), campusRegistration(state, semesterOf(state) + 1)]);
    const mean = (pick: (r: (typeof records)[number]) => number): number => records.reduce((sum, one) => sum + pick(one), 0) / records.length;
    expect(mean((r) => r.short)).toBeCloseTo(REGISTRATION.shortBase, 2);
    expect(mean((r) => r.credits)).toBeGreaterThan(13.5);
    expect(mean((r) => r.credits)).toBeLessThan(15);
    expect(mean((r) => r.fifteen)).toBeLessThan(0.5);
    expect(mean((r) => r.fifteen)).toBeGreaterThan(0.3);
    expect(mean((r) => r.under20)).toBeGreaterThan(0.3);
    expect(mean((r) => r.under20)).toBeLessThan(0.5);
    expect(mean((r) => r.over50)).toBeGreaterThan(0.08);
    expect(mean((r) => r.over50)).toBeLessThan(0.25);
    // The cards agree with the record: students registered one by one go without a needed course about as often.
    let without = 0;
    const many = students(MODEL, 60);
    for (const ref of many) if (courseHistory(MODEL, ref).semesters.at(-1)!.missed.some((one) => one.needed)) without += 1;
    expect(without / many.length).toBeGreaterThan(REGISTRATION.shortBase - 0.07);
    expect(without / many.length).toBeLessThan(REGISTRATION.shortBase + 0.07);
  });

  it('shuts more out where the campus is short of seats or faculty', () => {
    const crowded = structuredClone(MODEL);
    // A game with goals hires a semester behind (38): its faculty can be fewer than its students need.
    crowded.staffing.faculty = Math.round(crowded.staffing.faculty * 0.7);
    const plain = campusRegistration(MODEL, semesterOf(MODEL));
    const short = campusRegistration(crowded, semesterOf(crowded));
    expect(short.faculty).toBeLessThan(0.8);
    expect(short.short).toBeGreaterThan(plain.short + 0.15);
    expect(short.short).toBeLessThanOrEqual(REGISTRATION.shortMost);
  });

  it("registers for the spring in November and the fall in April, once each, with the paper's line, and a card shows the next semester", () => {
    let state = structuredClone(MODEL);
    const log: LogEntry[] = [];
    let at = state.clock.lastSimulatedAt;
    for (let k = 0; k < 7 * 3 && log.filter((one) => one.kind === 'courses').length < 2; k++) {
      const next = advance(state, at, at + (DAY * TICK_MS) / 3);
      at += (DAY * TICK_MS) / 3;
      state = next.state;
      log.push(...next.log);
    }
    const told = log.filter((one) => one.kind === 'courses');
    expect(told.length).toBeGreaterThanOrEqual(1);
    const first = told[0]!;
    expect(first.text).toMatch(/^Registration for the (spring|fall) is done: /);
    expect(toneProblem(first.text)).toBeNull();
    const month = dateAt({ tick: first.tick, week: state.clock.week } as never).month;
    expect([4, 5, 6, 7, 11, 12]).toContain(month);
    expect(state.registration.records.some((one) => one.semester === semesterOf(state) + 1) || told.length >= 1).toBe(true);
    expect(latestRegistration(state)).not.toBeNull();
    // Once registered, a card has next semester's classes.
    const nextSemester = state.registration.records.at(-1)!.semester;
    if (nextSemester > semesterOf(state)) {
      const ref = students(state, 1)[1]!;
      expect(courseHistory(state, ref).next).not.toBeNull();
    }
  });

  it('is the same in one step or many', () => {
    const a = structuredClone(MODEL);
    const b = structuredClone(MODEL);
    const span = 3 * DAY * TICK_MS;
    const one = advance(a, a.clock.lastSimulatedAt, a.clock.lastSimulatedAt + span).state;
    let many = b;
    for (let k = 0; k < 12; k++) many = advance(many, b.clock.lastSimulatedAt + (k * span) / 12, b.clock.lastSimulatedAt + ((k + 1) * span) / 12).state;
    expect(many.registration).toEqual(one.registration);
  });

  it('a stepped campus keeps a record a semester, and no more than three years of them', () => {
    const state = structuredClone(MODEL);
    const log: LogEntry[] = [];
    state.clock.tick -= state.clock.tick % 60;
    stepRegistration(state, log);
    expect(state.registration.records.map((one) => one.semester)).toContain(semesterOf(state));
  });

  it('comes through a version 39 save with no records, and makes this semester\'s on its first hour', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(40);
    const file = JSON.parse(serialize(MODEL, T0));
    file.v = 39;
    delete file.state.registration;
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(39);
    expect(loaded.state.registration).toEqual({ records: [] });
    expect(loaded.state).toEqual(MODEL);
    expect(typeof MIGRATIONS[39]).toBe('function');
  });
});
