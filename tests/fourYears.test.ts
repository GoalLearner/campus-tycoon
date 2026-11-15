import { describe, expect, it } from 'vitest';
import { ACADEMIC_CALENDAR, dateAt, dayRead, FIRST_INTAKE_TICK, seasonCurve, tickOfDate, type Week } from '../src/sim';
import { SEASON_CURVE } from '../src/sim/config/season';
import type { CalDate } from '../src/sim/config/academicCalendar';

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
