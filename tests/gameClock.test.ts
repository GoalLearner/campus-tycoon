import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/platform', () => ({ isNative: false, hasTimeSkip: false }));

import {
  dateAt,
  dateOfDay,
  dayIndexAt,
  FIRST_INTAKE_TICK,
  formatDate,
  hourAt,
  KICKOFF_HOUR,
  momentAt,
  newGame,
  plainWeek,
  SLOTS,
  TICK_MS,
  tickOfDate,
  tickOfMoment,
  TICKS_PER_YEAR,
  type Week,
} from '../src/sim';
import { daylightAt, followGame, forceClock, gameMoment, gameNow, shownHour, viewAt } from '../src/app/daylight';
import { BELL_HOURS, bellDue } from '../src/app/life';
import { clockText } from '../src/app/clockText';

/** The game's own clock (DESIGN.md 84): the hour of the game's day, from the same calendar as the date. */

const NOW = Date.UTC(2026, 0, 5, 9, 0, 0);
const PLAIN: Week = { year: 1, start: FIRST_INTAKE_TICK, extra: 0 };
const at = (tick: number, week: Week = PLAIN) => ({ tick, week });

afterEach(() => {
  followGame(null);
  forceClock(null);
  viewAt(null);
});

describe('the hour of the game day', () => {
  it('starts each game year at midnight on its first date, and the date and hour turn over together', () => {
    expect(hourAt(at(PLAIN.start))).toBe(0);
    let last = momentAt(at(PLAIN.start));
    for (let tick = PLAIN.start + 1; tick < PLAIN.start + TICKS_PER_YEAR; tick++) {
      const now = momentAt(at(tick));
      // At a whole tick the clock's date is the simulation's, exactly.
      expect(now.date).toEqual(dateAt(at(tick)));
      expect(now.index).toBe(dayIndexAt(at(tick)));
      expect(now.hour).toBeGreaterThanOrEqual(0);
      expect(now.hour).toBeLessThan(24);
      // The hour runs backward only when a new date begins.
      if (now.index === last.index) expect(now.hour).toBeGreaterThan(last.hour);
      else expect(now.hour).toBeLessThan(last.hour);
      last = now;
    }
  });

  it('a fall game day is about 28 real minutes, so a game hour is about 70 real seconds', () => {
    const midnights: number[] = [];
    for (let tick = PLAIN.start + 1; tick < PLAIN.start + 24 * 60; tick++) if (dayIndexAt(at(tick)) !== dayIndexAt(at(tick - 1))) midnights.push(tick);
    const gaps = midnights.slice(1).map((tick, i) => tick - midnights[i]!);
    for (const gap of gaps) expect(gap === 28 || gap === 29).toBe(true);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect((mean * 60) / 24).toBeGreaterThan(68);
    expect((mean * 60) / 24).toBeLessThan(72);
  });

  it('runs on smoothly between ticks, and on into the next year at its first midnight', () => {
    for (const tick of [PLAIN.start + 100, PLAIN.start + 3000, PLAIN.start + 8000]) {
      const a = momentAt(at(tick));
      const half = momentAt(at(tick + 0.5));
      const b = momentAt(at(tick + 1));
      const pos = (m: { index: number; hour: number }): number => m.index + m.hour / 24;
      expect(pos(half)).toBeGreaterThan(pos(a));
      expect(pos(half)).toBeLessThan(pos(b));
    }
    const end = PLAIN.start + TICKS_PER_YEAR;
    const late = momentAt(at(end - 0.01));
    const next = momentAt({ tick: end, week: plainWeek(end) });
    // Every game year shows the same dates on the same weekdays.
    expect(formatDate(next.date)).toBe('Wed, Aug 19');
    expect(next.hour).toBe(0);
    expect(next.index + next.hour / 24 - (late.index + late.hour / 24)).toBeLessThan(0.01);
  });

  it('is worked out from the game alone: the same tick always reads the same hour', () => {
    const one = hourAt(at(PLAIN.start + 1234));
    expect(hourAt(at(PLAIN.start + 1234))).toBe(one);
    expect(dateOfDay(dayIndexAt(at(PLAIN.start + 1234)))).toEqual(dateAt(at(PLAIN.start + 1234)));
  });

  it('opens a founding day at 8 AM on Aug 12 and runs it to midnight before the first fall day', () => {
    const state = newGame({ seed: 5, name: 'Anchored', now: NOW, anchor: 16 * 60 });
    const week = state.clock.week;
    expect(week.start - FIRST_INTAKE_TICK).toBeGreaterThan(60);
    const first = momentAt(at(FIRST_INTAKE_TICK, week));
    expect(formatDate(first.date)).toBe('Wed, Aug 12');
    expect(first.hour).toBeCloseTo(8, 6);
    expect(formatDate(dateAt(at(week.start - 1, week)))).toBe('Tue, Aug 18');
    expect(hourAt(at(week.start - 1, week))).toBeGreaterThan(20);
    expect(formatDate(dateAt(at(week.start, week)))).toBe('Wed, Aug 19');
    expect(hourAt(at(week.start, week))).toBe(0);
  });

  it('a game with a one-minute founding day still reads Aug 12 on it, as before', () => {
    expect(formatDate(dateAt({ tick: FIRST_INTAKE_TICK, week: { year: 1, start: FIRST_INTAKE_TICK + 1, extra: 0 } }))).toBe('Wed, Aug 12');
  });
});

describe('football on the game clock', () => {
  it('kicks off at its hour on its Saturday, and the whistle blows forty real minutes later, on the Sunday', () => {
    for (const slot of SLOTS) {
      const kick = tickOfMoment(PLAIN, slot.date, KICKOFF_HOUR);
      const moment = momentAt(at(kick));
      expect(moment.date.weekday).toBe(6);
      expect(moment.hour).toBeGreaterThanOrEqual(KICKOFF_HOUR);
      expect(moment.hour).toBeLessThan(KICKOFF_HOUR + 1);
      // That share of a game day (about 28 real minutes) after the first tick of the Saturday.
      expect(Math.abs(kick - tickOfDate(PLAIN, slot.date) - (KICKOFF_HOUR / 24) * 28.2)).toBeLessThanOrEqual(1);
      const whistle = momentAt(at(kick + 40));
      expect(whistle.index - moment.index).toBe(1);
      expect(whistle.date.weekday).toBe(0);
    }
  });

  it('noon is one hour away: half a game day after the Saturday begins', () => {
    for (const slot of SLOTS) {
      const noon = tickOfMoment(PLAIN, slot.date, 12);
      expect(Math.floor(hourAt(at(noon)))).toBe(12);
      expect(noon - tickOfDate(PLAIN, slot.date)).toBeGreaterThanOrEqual(13);
      expect(noon - tickOfDate(PLAIN, slot.date)).toBeLessThanOrEqual(15);
    }
  });

  it('a date at hour 0 is the same tick as before', () => {
    for (const slot of SLOTS) expect(tickOfMoment(PLAIN, slot.date, 0)).toBe(tickOfDate(PLAIN, slot.date));
  });
});

describe('the light over a 28-minute day', () => {
  it('is mostly daylight, with a short night and dusk and dawn of a few real minutes', () => {
    let day = 0;
    let night = 0;
    const minutes = 24 * 60;
    for (let minute = 0; minute < minutes; minute++) {
      const light = daylightAt(minute / 60);
      if (light.strength <= 0.1) day += 1;
      if (light.strength >= 0.55) night += 1;
    }
    // A game day is about 28 real minutes.
    const real = (share: number): number => (share / minutes) * 28.2;
    expect(day / minutes).toBeGreaterThan(0.5);
    expect(real(night)).toBeGreaterThan(5);
    expect(real(night)).toBeLessThan(8);
    // Dusk takes more than two real minutes from plain day to full night: never a blink.
    const from = 17.5;
    let to = from;
    while (daylightAt(to).strength < 0.55) to += 1 / 60;
    expect(((to - from) / 24) * 28.2).toBeGreaterThan(2);
  });
});

describe("the map's clock", () => {
  it("reads the game's clock, not the device's, and the View at slider over it (DESIGN.md 75.4, 84)", () => {
    const tick = PLAIN.start + 26;
    const nextTickAt = Date.now() + TICK_MS;
    followGame(() => ({ tick, week: PLAIN, nextTickAt }));
    expect(shownHour()).toBeCloseTo(hourAt(at(tick)), 2);
    expect(gameNow().date).toEqual(dateAt(at(tick)));
    viewAt(7.5);
    expect(shownHour()).toBe(7.5);
    viewAt(null);
    expect(shownHour()).toBeCloseTo(hourAt(at(tick)), 2);
    forceClock(22.5);
    expect(shownHour()).toBe(22.5);
  });

  it('moves on between ticks, never more than one tick ahead of the game', () => {
    const tick = PLAIN.start + 500;
    const now = Date.now();
    expect(gameMoment({ tick, week: PLAIN, nextTickAt: now + TICK_MS }, now).tick).toBeCloseTo(tick, 6);
    expect(gameMoment({ tick, week: PLAIN, nextTickAt: now + TICK_MS / 2 }, now).tick).toBeCloseTo(tick + 0.5, 6);
    // A tick the game has not run yet is never shown.
    expect(gameMoment({ tick, week: PLAIN, nextTickAt: now - 5 * TICK_MS }, now).tick).toBeLessThan(tick + 1);
  });

  it('writes the hour as the device writes times', () => {
    expect(clockText(13.5, false)).toMatch(/1:30|13:30/);
  });
});

describe('the bell', () => {
  it('chimes as the game clock reaches the first classes, noon and the evening, never every game hour', () => {
    expect(BELL_HOURS).toEqual([8, 12, 18]);
    expect(bellDue(7.98, 8.01, false)).toBe(true);
    expect(bellDue(11.9, 12.1, false)).toBe(true);
    expect(bellDue(17.99, 18.0, false)).toBe(true);
    expect(bellDue(13.9, 14.1, false)).toBe(false);
    expect(bellDue(23.9, 0.1, false)).toBe(false);
    expect(bellDue(12, 12.5, false)).toBe(false);
    // Not when the clock is set back, on a hidden page, or with nothing heard before.
    expect(bellDue(20, 8.2, false)).toBe(false);
    expect(bellDue(7.98, 8.01, true)).toBe(false);
    expect(bellDue(null, 8.01, false)).toBe(false);
  });
});
