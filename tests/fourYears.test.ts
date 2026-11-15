import { describe, expect, it } from 'vitest';
import { ACADEMIC_CALENDAR, advance, dateAt, dayRead, FIRST_INTAKE_TICK, newGame, seasonCurve, tickOfDate, type Week } from '../src/sim';
import { WRITE_UPS_IN_DORMS, WRITE_UPS_PER_THOUSAND } from '../src/sim/config/fourYears';
import { toneProblem } from '../src/sim/config/tone';
import { DAY, T0 } from './helpers';
import { SEASON_CURVE } from '../src/sim/config/season';
import type { CalDate } from '../src/sim/config/academicCalendar';
import { ageOf, birthdayOf, over21Share } from '../src/sim/systems/birthdays';
import { practicesOf, practiceShares, tellMovingOut } from '../src/sim/systems/fourYears';
import { awayAbroad, classYearOf, movedOutThisYear, sampleStudents, studentCard } from '../src/sim/systems/students';
import { MAJORS, type MajorGroup } from '../src/sim/config/students';
import { BY_SENIOR_YEAR } from '../src/sim/config/fourYears';
import { calendarAt } from '../src/sim/calendar';

/** R2 of the realism pass, four years (DESIGN.md 66). */

const PLAIN: Week = { year: 1, start: FIRST_INTAKE_TICK, extra: 0 };
const SECOND: Week = { year: 2, start: FIRST_INTAKE_TICK + 10_080, extra: 0 };
/** A few minutes into a date: a date of the game lasts about 28 ticks (the year is a real week). */
const noon = (week: Week, date: CalDate): { tick: number; week: Week } => ({ tick: tickOfDate(week, date) + 10, week });
const entry = (id: string) => ACADEMIC_CALENDAR.events.find((event) => event.id === id)!;

describe('the year, R2', () => {
  it('has a welcome week every fall, before the first classes, as easy as move-in week', () => {
    for (const week of [PLAIN, SECOND]) {
      for (const day of [19, 21, 23] as const) {
        const read = dayRead(noon(week, [8, day, 0]));
        expect(read.kind).toBe('term');
        expect(read.special).toBe('welcome');
        expect(read.rhythm).toBe('Welcome week');
        expect(seasonCurve(noon(week, [8, day, 0]))).toBe(SEASON_CURVE.founding);
      }
      expect(dayRead(noon(week, [8, 25, 0])).special).toBeUndefined();
    }
  });

  it("has parents' weekend from a Friday to a Sunday in early October, a day of term like any other", () => {
    const from = dateAt(noon(PLAIN, entry('parentsWeekend').from));
    expect(from.month).toBe(10);
    expect(from.weekday).toBe(5);
    expect(dateAt(noon(PLAIN, entry('parentsWeekend').to!)).weekday).toBe(0);
    const read = dayRead(noon(PLAIN, [10, 3, 0]));
    expect(read.kind).toBe('term');
    expect(read.special).toBe('parents');
    expect(read.rhythm).toBe("Parents' weekend");
  });

  it('puts spring break in the middle of March, after midterms', () => {
    const brk = entry('springBreak');
    const mid = entry('springMidterms');
    expect(brk.from[0]).toBe(3);
    expect(brk.from[1]).toBeGreaterThanOrEqual(10);
    expect(brk.from[1]).toBeLessThanOrEqual(20);
    expect(tickOfDate(PLAIN, mid.to!)).toBeLessThan(tickOfDate(PLAIN, brk.from));
    expect(dayRead(noon(PLAIN, [3, 17, 1])).kind).toBe('break');
    expect(dayRead(noon(PLAIN, [3, 30, 1])).kind).toBe('term');
  });

  it('names the stretches of the year on days of term: fall energy, the midterm slump, finals crunch, spring fatigue', () => {
    expect(dayRead(noon(PLAIN, [9, 2, 0])).rhythm).toBe('First weeks of fall');
    expect(dayRead(noon(PLAIN, [10, 27, 0])).rhythm).toBe('Midterm slump');
    expect(dayRead(noon(PLAIN, [12, 8, 0])).rhythm).toBe('Finals crunch');
    expect(dayRead(noon(PLAIN, [2, 16, 1])).rhythm).toBe('Spring fatigue');
    expect(dayRead(noon(PLAIN, [4, 14, 1])).rhythm).toBe('Spring fatigue');
    // An exam week or a break says what it is, as before.
    expect(dayRead(noon(PLAIN, [10, 14, 0])).kind).toBe('midterms');
    expect(dayRead(noon(PLAIN, [11, 26, 0])).kind).toBe('break');
    // Seniors' last weeks, up to commencement.
    expect(dayRead(noon(PLAIN, [5, 1, 1])).seniors).toBe(true);
    expect(dayRead(noon(PLAIN, [5, 14, 1])).seniors).toBe(true);
    expect(dayRead(noon(PLAIN, [4, 1, 1])).seniors).toBeFalsy();
  });
});

describe('birthdays and turning 21, R2', () => {
  const SEED = 20261115;
  const refs = Array.from({ length: 4000 }, (_, index) => ({ entryYear: 1, index }));
  const share = (list: boolean[]): number => list.filter(Boolean).length / list.length;

  it('spreads birthdays through the year, and a student keeps theirs', () => {
    const months = new Array<number>(12).fill(0);
    for (const ref of refs) months[birthdayOf(SEED, ref).month - 1]! += 1;
    for (const n of months) expect(Math.abs(n - refs.length / 12)).toBeLessThan(refs.length / 12 * 0.2);
    expect(birthdayOf(SEED, refs[7]!)).toEqual(birthdayOf(SEED, refs[7]!));
  });

  it('makes a student 18 at their first fall (a few a year older), 19 in their first year and 21 in their third', () => {
    const firstFall = noon(PLAIN, [8, 20, 0]);
    const ages = refs.map((ref) => ageOf(SEED, ref, firstFall).age);
    expect(ages.every((age) => age >= 18 && age <= 20)).toBe(true);
    expect(share(ages.map((age) => age === 18))).toBeGreaterThan(0.85);
    // By the spring, about half have had their birthday; a junior turns 21 in their third year.
    const third: Week = { year: 3, start: FIRST_INTAKE_TICK + 2 * 10_080, extra: 0 };
    const juniorsStart = refs.map((ref) => ageOf(SEED, ref, noon(third, [8, 20, 0])).over21);
    const juniorsEnd = refs.map((ref) => ageOf(SEED, ref, noon(third, [8, 17, 1])).over21);
    expect(share(juniorsStart)).toBeLessThan(0.1);
    expect(share(juniorsEnd)).toBeGreaterThan(0.95);
    const fourth: Week = { year: 4, start: FIRST_INTAKE_TICK + 3 * 10_080, extra: 0 };
    expect(refs.every((ref) => ageOf(SEED, ref, noon(fourth, [8, 20, 0])).over21)).toBe(true);
    // The share worked out for a class year agrees with the students' own.
    const midJunior = noon(third, [2, 1, 1]);
    expect(Math.abs(over21Share(2, midJunior) - share(refs.map((ref) => ageOf(SEED, ref, midJunior).over21)))).toBeLessThan(0.03);
    expect(over21Share(0, midJunior)).toBe(0);
    expect(over21Share(3, midJunior)).toBe(1);
  });

  it('marks the birthday on the day, and the 21st', () => {
    const ref = refs.find((one) => birthdayOf(SEED, one).month === 3 && birthdayOf(SEED, one).day === 3)!;
    const third: Week = { year: 3, start: FIRST_INTAKE_TICK + 2 * 10_080, extra: 0 };
    const day = ageOf(SEED, ref, noon(third, [3, 3, 1]));
    expect(day.birthday).toBe('Mar 3');
    expect(day.today).toBe(true);
    expect(day.turned21Today).toBe(day.age === 21);
    expect(ageOf(SEED, ref, noon(third, [3, 4, 1])).today).toBe(false);
  });
});

describe('under-21 drinking, counted (R2, the owner’s decision 8)', () => {
  it('writes up students for drinking under 21 at about the real rate each semester, most of them in the dorms', () => {
    const model = newGame({ seed: 20261115, name: 'Test University', now: T0, campus: 'model' });
    const run = advance(model, model.clock.lastSimulatedAt, T0 + 3.6 * DAY);
    const line = run.log.find((entry) => entry.kind === 'writeUps');
    expect(line).toBeDefined();
    const students = run.state.admissions.lastSemester!.stayed + run.state.admissions.lastSemester!.left;
    const count = Number(line!.data!.writeUps);
    // About 7 a year for every 1,000 students, half of it in a semester, more with a bigger party scene.
    expect(count).toBeGreaterThanOrEqual(Math.round((WRITE_UPS_PER_THOUSAND / 1000) * students * 0.5 * 0.9));
    expect(count).toBeLessThanOrEqual(Math.round((WRITE_UPS_PER_THOUSAND / 1000) * students * 0.5 * 2));
    expect(Number(line!.data!.dorms) / count).toBeCloseTo(WRITE_UPS_IN_DORMS, 1);
    expect(run.state.admissions.lastSemester!.writeUps).toBe(count);
    expect(toneProblem(line!.text)).toBeNull();
  });

  it('has no write-ups on a game without parties', () => {
    const small = newGame({ seed: 7, name: 'Test College', now: T0 });
    const run = advance(small, small.clock.lastSimulatedAt, T0 + 3.6 * DAY);
    expect(run.log.some((entry) => entry.kind === 'writeUps')).toBe(false);
  });
});

describe('moving off campus, R2', () => {
  it('moves a student into town once, at the start of a class year, and never back', () => {
    for (let index = 0; index < 2000; index++) {
      const ref = { entryYear: 1, index };
      let moves = 0;
      for (let classYear = 1; classYear < 6; classYear++) if (movedOutThisYear(20261115, ref, classYear)) moves += 1;
      expect(moves).toBeLessThanOrEqual(1);
    }
  });

  it('tells each fall about how many returning students moved into town, with nothing saved', () => {
    const model = newGame({ seed: 20261115, name: 'Test University', now: T0, campus: 'model' });
    const before = JSON.stringify(model.offCampus);
    const log: Parameters<typeof tellMovingOut>[1] = [];
    const moved = tellMovingOut(model, log);
    expect(moved).toBeGreaterThan(0.15 * (model.cohorts[1] + model.cohorts[2] + model.cohorts[3]));
    expect(log[0]!.kind).toBe('housing');
    expect(toneProblem(log[0]!.text)).toBeNull();
    expect(JSON.stringify(model.offCampus)).toBe(before);
  });
});

describe('internships, study abroad, research and senior work, R2', () => {
  const SEED = 20261115;
  const many = Array.from({ length: 6000 }, (_, index) => ({ entryYear: 1, index }));
  const groups = MAJORS.flatMap((major) => new Array<MajorGroup>(Math.max(1, Math.round(major.share * 10))).fill(major.group));
  const groupOf = (index: number): MajorGroup => groups[index % groups.length]!;

  it('lands the campus on the real shares by senior year: half an internship, a fifth research, two in five senior work, one in nine abroad', () => {
    const shares = practiceShares();
    for (const practice of Object.keys(BY_SENIOR_YEAR) as Array<keyof typeof BY_SENIOR_YEAR>) expect(Math.abs(shares[practice] - BY_SENIOR_YEAR[practice])).toBeLessThan(0.015);
    const seniors = many.map((ref) => practicesOf(SEED, ref, 3, groupOf(ref.index), 'spring'));
    const did = (practice: keyof typeof BY_SENIOR_YEAR): number => seniors.filter((one) => one.did[practice]).length / seniors.length;
    expect(Math.abs(did('internship') - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(did('research') - 0.23)).toBeLessThan(0.04);
    expect(Math.abs(did('capstone') - 0.42)).toBeLessThan(0.05);
    expect(Math.abs(did('abroad') - 0.12)).toBeLessThan(0.03);
  });

  it('times them: internships in the summers after the second and third years, a semester abroad in the third spring, senior work in the last year', () => {
    const first = many.map((ref) => practicesOf(SEED, ref, 0, groupOf(ref.index), 'fall'));
    expect(first.every((one) => one.lines.length === 0 && !one.away)).toBe(true);
    const summer2 = many.map((ref) => practicesOf(SEED, ref, 1, groupOf(ref.index), 'summer'));
    const interning = summer2.filter((one) => one.interning).length / many.length;
    expect(Math.abs(interning - 0.5 * 0.3)).toBeLessThan(0.03);
    const spring3 = many.map((ref) => practicesOf(SEED, ref, 2, groupOf(ref.index), 'spring'));
    const away = spring3.filter((one) => one.away).length / many.length;
    expect(Math.abs(away - 0.12 * 0.4)).toBeLessThan(0.015);
    expect(many.every((ref) => !practicesOf(SEED, ref, 2, groupOf(ref.index), 'fall').away)).toBe(true);
    const senior = many.map((ref) => practicesOf(SEED, ref, 3, groupOf(ref.index), 'fall'));
    expect(senior.some((one) => one.capstone)).toBe(true);
    expect(many.every((ref) => !practicesOf(SEED, ref, 2, groupOf(ref.index), 'fall').capstone)).toBe(true);
    for (const one of [...summer2, ...spring3, ...senior].slice(0, 3000)) for (const line of one.lines) expect(toneProblem(line), line).toBeNull();
  });

  it('leaves a student abroad for the spring off the map that semester, and only then', () => {
    const model = newGame({ seed: SEED, name: 'Test University', now: T0, campus: 'model' });
    const spring = advance(model, model.clock.lastSimulatedAt, T0 + 4 * DAY).state;
    expect(calendarAt(spring.clock).phase).toBe('spring');
    const sample = sampleStudents(spring);
    expect(sample.some((ref) => awayAbroad(spring, ref, classYearOf(spring, ref) ?? -1))).toBe(false);
    const juniors = sample.filter((ref) => classYearOf(spring, ref) === 2).length;
    expect(juniors).toBeLessThan(400);
    expect(juniors).toBeGreaterThan(400 * 0.9);
    const card = studentCard(spring, sample[0]!)!;
    expect(Array.isArray(card.milestones.lines)).toBe(true);
  });
});
