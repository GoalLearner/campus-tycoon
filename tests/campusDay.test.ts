import { afterEach, describe, expect, it } from 'vitest';
import {
  CLASS_LENGTH,
  classChanges,
  dayCurve,
  dayFactsOf,
  headingsAt,
  nextLines,
  nowLine,
  ON_THE_HALF,
  ON_THE_HOUR,
  ORDINARY_DAY,
  PASSING,
  passingAt,
  pathsAt,
  type DayFacts,
} from '../src/app/campusDay';
import { clockText, forceClockCycle } from '../src/app/clockText';
import { regularDay } from '../src/app/regularDay';
import { advance, newGame, sampleStudents, studentCard, type GameState } from '../src/sim';
import { DAY, T0 } from './helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Time of day you can see (DESIGN.md 75): the class changes, the meal rushes and the evening by the player's hour,
 * the HUD's clock in the device's own form, and a followed student's day kept to the same timetable. All for show.
 */

const at = (h: number, m = 0): number => h + m / 60;
/** A game day: a game year is a real week. */
const GAME_DAY_MS = (7 * DAY) / 365;
const WEEKEND: DayFacts = { ...ORDINARY_DAY, weekend: true, classes: false };
const FINALS: DayFacts = { ...ORDINARY_DAY, classes: false, finals: true };

afterEach(() => forceClockCycle(null));

describe('the class timetable (75.2)', () => {
  it('starts classes on the hour from 8 AM to 8 PM, some on the half hour, and lets the last out by 9 PM', () => {
    expect(ON_THE_HOUR[0]![0]).toBe(8);
    expect(ON_THE_HOUR[ON_THE_HOUR.length - 1]![0]).toBe(20);
    for (const [start] of [...ON_THE_HOUR, ...ON_THE_HALF]) {
      expect(Math.round(start * 2) / 2).toBeCloseTo(start, 9);
      expect(start + CLASS_LENGTH).toBeLessThanOrEqual(21);
    }
    expect(ON_THE_HALF.length).toBeGreaterThan(0);
    expect(ON_THE_HALF.every(([start]) => start % 1 === 0.5)).toBe(true);
    // A half-hour class is the smaller share.
    for (const [, load] of ON_THE_HALF) expect(load).toBeLessThan(0.5);
    // Every change lasts ten minutes and ends as a class starts, or lets the last out.
    for (const change of classChanges(ORDINARY_DAY)) {
      expect(change.to - change.from).toBeCloseTo(PASSING, 9);
      if (change.starts !== null) expect(change.to).toBeCloseTo(change.starts, 9);
    }
  });

  it('floods the paths in a class change and empties them once classes start', () => {
    // 10:50 to 11:00: the busiest change of the day.
    expect(passingAt(at(10, 49), ORDINARY_DAY)).toBe(0);
    expect(passingAt(at(10, 54), ORDINARY_DAY)).toBe(1);
    expect(passingAt(at(11, 5), ORDINARY_DAY)).toBe(0);
    expect(pathsAt(at(10, 54), ORDINARY_DAY)).toBeGreaterThan(0.95);
    expect(pathsAt(at(11, 10), ORDINARY_DAY)).toBeLessThan(0.55);
    // The morning rush, before the first class at 8.
    expect(pathsAt(at(7, 56), ORDINARY_DAY)).toBeGreaterThan(pathsAt(at(8, 20), ORDINARY_DAY) * 1.5);
    // The half-hour changes are smaller than the hour's.
    expect(passingAt(at(10, 24), ORDINARY_DAY)).toBeGreaterThan(0);
    expect(passingAt(at(10, 24), ORDINARY_DAY)).toBeLessThan(passingAt(at(10, 54), ORDINARY_DAY));
    // No class changes at night.
    for (let h = 21.25; h < 31; h += 1 / 12) expect(passingAt(h, ORDINARY_DAY), String(h)).toBe(0);
  });

  it('is quiet late at night with a few night owls, and busier at lunch and dinner than in class', () => {
    const small = pathsAt(3, ORDINARY_DAY);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(0.1);
    expect(pathsAt(at(12, 10), ORDINARY_DAY)).toBeGreaterThan(pathsAt(at(11, 10), ORDINARY_DAY));
    expect(pathsAt(at(18, 15), ORDINARY_DAY)).toBeGreaterThan(pathsAt(at(21, 30), ORDINARY_DAY));
    for (let m = 0; m < 24 * 60; m += 5) {
      const level = pathsAt(m / 60, ORDINARY_DAY);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('starts a weekend later, with no class changes, more on the lawns and out on a party night', () => {
    expect(classChanges(WEEKEND)).toEqual([]);
    expect(pathsAt(8, WEEKEND)).toBeLessThan(pathsAt(8, ORDINARY_DAY));
    expect(pathsAt(14, WEEKEND)).toBeGreaterThan(pathsAt(8, WEEKEND) * 3);
    expect(headingsAt(14, WEEKEND, 'out').quad).toBeGreaterThan(headingsAt(14, ORDINARY_DAY, 'out').quad);
    const party = { ...WEEKEND, partyNight: true };
    expect(pathsAt(22, party)).toBeGreaterThan(pathsAt(22, WEEKEND));
    expect(headingsAt(22, party, 'out').greek).toBeGreaterThan(headingsAt(22, WEEKEND, 'out').greek);
  });

  it('sends people where the hour says: class in a change, food at lunch, the courts in the afternoon, home at night', () => {
    const top = (hour: number, facts = ORDINARY_DAY, from: 'home' | 'class' | 'out' = 'out'): string => {
      const weights = headingsAt(hour, facts, from);
      return Object.entries(weights).sort((a, b) => b[1] - a[1])[0]![0];
    };
    expect(top(at(10, 54), ORDINARY_DAY, 'class')).toBe('class');
    expect(top(at(7, 55), ORDINARY_DAY, 'home')).toBe('class');
    expect(top(at(12, 20))).toBe('food');
    expect(top(at(16, 20))).toBe('play');
    expect(top(3)).toBe('home');
    // Nobody heads home from home.
    expect(headingsAt(3, ORDINARY_DAY, 'home').home).toBe(0);
  });

  it('keeps the library busy in finals, with exams in blocks', () => {
    expect(headingsAt(14, FINALS, 'out').seat).toBeGreaterThan(headingsAt(14, ORDINARY_DAY, 'out').seat * 2);
    expect(pathsAt(23.5, FINALS)).toBeGreaterThan(pathsAt(23.5, ORDINARY_DAY));
    expect(classChanges(FINALS).filter((change) => change.starts !== null).map((change) => change.starts)).toEqual([8, 10.5, 13, 15.5, 18.5]);
  });

  it('reads the kind of day from the calendar: classes on a weekday of term, none on a break, the summer or a weekend', () => {
    expect(dayFactsOf('term', false, false).classes).toBe(true);
    expect(dayFactsOf('midterms', false, false).classes).toBe(true);
    expect(dayFactsOf('term', true, false).classes).toBe(false);
    expect(dayFactsOf('break', false, true)).toMatchObject({ classes: false, away: true, partyNight: false });
    expect(dayFactsOf('summer', false, false).away).toBe(true);
    expect(dayFactsOf('finals', false, false)).toMatchObject({ classes: false, finals: true });
    expect(dayFactsOf('moveIn', false, false).classes).toBe(false);
  });
});

describe('Today on campus (75.3)', () => {
  it('says what is happening now and what comes next', () => {
    forceClockCycle(12);
    expect(nowLine(at(10, 48), ORDINARY_DAY)).toBe('Class change in 2 minutes');
    expect(nowLine(at(10, 52), ORDINARY_DAY)).toBe('Class change: classes start at 11 AM');
    expect(nowLine(at(11, 5), ORDINARY_DAY)).toBe('Classes until 11:50 AM');
    expect(nowLine(at(12, 10), ORDINARY_DAY)).toBe('Lunch rush');
    expect(nowLine(3, ORDINARY_DAY)).toBe('Quiet night: a few night owls');
    expect(nextLines(at(11, 5), ORDINARY_DAY)).toEqual(['Lunch rush at 12 PM', 'Games on the courts from 3 PM']);
    const party = { ...ORDINARY_DAY, partyNight: true };
    expect(nextLines(at(19, 30), party)).toContain('Party night from 9 PM');
    expect(nowLine(22, party)).toBe('Party night');
    expect(nowLine(14, { ...ORDINARY_DAY, away: true, classes: false })).toBe('Most students are away');
    expect(nowLine(at(9, 0), FINALS)).toBe('Exams until 10 AM');
  });

  it('draws the day as a curve, one point every five minutes, with a peak at every class change', () => {
    const curve = dayCurve(ORDINARY_DAY);
    expect(curve).toHaveLength(288);
    const index = (h: number, m: number): number => (h * 60 + m) / 5;
    expect(curve[index(10, 55)]!).toBeGreaterThan(curve[index(11, 15)]!);
    expect(curve[index(14, 55)]!).toBeGreaterThan(curve[index(14, 30)]!);
    expect(Math.max(...dayCurve(WEEKEND))).toBeLessThan(Math.max(...curve));
  });
});

describe('the clock (75.1)', () => {
  it('writes the hour as the device keeps it, 12-hour or 24-hour', () => {
    forceClockCycle(12);
    expect(clockText(at(9, 48))).toBe('9:48 AM');
    expect(clockText(0)).toBe('12:00 AM');
    expect(clockText(12)).toBe('12:00 PM');
    expect(clockText(21, true)).toBe('9 PM');
    expect(clockText(at(21, 30), true)).toBe('9:30 PM');
    forceClockCycle(24);
    expect(clockText(at(9, 48))).toBe('09:48');
    expect(clockText(21, true)).toBe('21:00');
    expect(clockText(at(23, 59.9))).toBe('00:00');
    expect(nowLine(at(10, 52), ORDINARY_DAY)).toBe('Class change: classes start at 11:00');
  });
});

describe("a student's day keeps the campus's timetable (75.2)", () => {
  // A model campus a real day on (two months of the game's fall term), and its next six game days, weekend and all.
  const start = advance(newGame({ seed: 41, name: 'Timetable', now: T0, campus: 'model' }), T0, T0 + DAY).state;
  const days: GameState[] = [start];
  for (let n = 1; n <= 6; n++) days.push(advance(days[n - 1]!, T0 + DAY + (n - 1) * GAME_DAY_MS, T0 + DAY + n * GAME_DAY_MS).state);

  it('starts every class on the hour or the half hour, 8 AM or later, for 50 minutes, and out by 9 PM', () => {
    let classes = 0;
    for (const state of days) {
      for (const ref of sampleStudents(state, 40)) {
        const card = studentCard(state, ref);
        if (!card) continue;
        for (const item of regularDay(null, state, ref, card)) {
          // A shift at a lab is work, not a class.
          if (item.where !== 'class' || item.words.startsWith('A shift')) continue;
          classes += 1;
          expect(Math.abs(item.from * 2 - Math.round(item.from * 2)), item.words).toBeLessThan(1e-6);
          expect(item.from).toBeGreaterThanOrEqual(8);
          expect(item.from + CLASS_LENGTH).toBeLessThanOrEqual(21);
        }
      }
    }
    expect(classes).toBeGreaterThan(100);
  });

  it('meets clubs from 7 PM and goes to parties from 9 PM', () => {
    let clubs = 0;
    let parties = 0;
    for (const state of days) {
      for (const ref of sampleStudents(state, 40)) {
        const card = studentCard(state, ref);
        if (!card) continue;
        for (const item of regularDay(null, state, ref, card)) {
          if (card.club && item.words === `${card.club} meets`) {
            clubs += 1;
            expect(item.from).toBeGreaterThanOrEqual(19);
          }
          if (item.words === 'At a party') {
            parties += 1;
            expect(item.from).toBeGreaterThanOrEqual(21);
          }
        }
      }
    }
    expect(clubs).toBeGreaterThan(0);
    expect(parties).toBeGreaterThan(0);
  });

  it('is for show: nothing in the simulation reads the hour, the slider or the timetable', () => {
    for (const file of ['src/app/campusDay.ts', 'src/app/clockText.ts', 'src/ui/todayStrip.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      for (const banned of ['applyAction', 'advance(', 'serialize', 'localStorage', 'state.rng']) expect(source.includes(banned), `${file}: ${banned}`).toBe(false);
    }
  });
});
