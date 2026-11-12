import { describe, expect, it } from 'vitest';
import {
  advance,
  buildings,
  calendarAt,
  cellAt,
  DAYS_PER_YEAR,
  dollars,
  dollarsShort,
  duration,
  eventsAt,
  FIRST_INTAKE_TICK,
  MAP_SIZE,
  netPerRealHour,
  nextMilestone,
  budget,
  ROOM_FEE_PER_BED_PER_YEAR,
  START_CASH,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  TUITION_PER_STUDENT_PER_YEAR,
  upkeepPerYear,
  validate,
  WAITLIST_TICKS,
  WORLD,
} from '../src/sim';
import { hashInts, nextFloat, nextInt, seedStreams } from '../src/sim/rng';
import { markRatesDirty, recomputeRates, spend } from '../src/sim/systems/money';
import { addTimer, cancelTimers, popDue } from '../src/sim/timers';
import { DAY, freshGame, T0 } from './helpers';

describe('time constants', () => {
  it('make a game year one real week of whole days', () => {
    expect(TICKS_PER_YEAR).toBe(10_080);
    expect(DAYS_PER_YEAR).toBe(7);
    expect(Number.isInteger(TICKS_PER_YEAR / TICKS_PER_DAY)).toBe(true);
  });
});

describe('rng', () => {
  it('is repeatable for a seed', () => {
    const a = seedStreams(123);
    const b = seedStreams(123);
    const seqA = Array.from({ length: 20 }, () => nextFloat(a, 'growth'));
    const seqB = Array.from({ length: 20 }, () => nextFloat(b, 'growth'));
    expect(seqA).toEqual(seqB);
  });

  it('stays inside [0, 1) and spreads out', () => {
    const rng = seedStreams(7);
    const values = Array.from({ length: 5000 }, () => nextFloat(rng, 'intake'));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
  });

  it('keeps streams independent', () => {
    const a = seedStreams(99);
    const b = seedStreams(99);
    for (let i = 0; i < 50; i++) nextFloat(a, 'events');
    expect(nextFloat(a, 'growth')).toBe(nextFloat(b, 'growth'));
    expect(a.intake).toBe(b.intake);
  });

  it('gives whole numbers in range', () => {
    const rng = seedStreams(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(nextInt(rng, 'names', 6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hashes without touching any stream', () => {
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(1, 2, 4));
  });
});

describe('calendar', () => {
  it('opens fifteen minutes before the first intake', () => {
    expect(calendarAt(0).phase).toBe('moveIn');
    expect(nextMilestone(0)).toEqual({ event: 'fallIntake', inTicks: FIRST_INTAKE_TICK });
    expect(eventsAt(FIRST_INTAKE_TICK)).toEqual(['dayStart', 'fallIntake']);
    expect(calendarAt(FIRST_INTAKE_TICK)).toMatchObject({ year: 1, day: 1, phase: 'fall' });
  });

  it('runs fall, spring, graduation and summer on whole days', () => {
    const at = (day: number) => calendarAt(FIRST_INTAKE_TICK + (day - 1) * TICKS_PER_DAY).phase;
    expect([1, 2, 3, 4, 5, 6, 7].map(at)).toEqual([
      'fall', 'fall', 'fall', 'spring', 'spring', 'graduation', 'summer',
    ]);
    expect(calendarAt(FIRST_INTAKE_TICK + TICKS_PER_YEAR)).toMatchObject({ year: 2, day: 1 });
  });

  it('fires each yearly event exactly once a year', () => {
    const counts: Record<string, number> = {};
    for (let t = FIRST_INTAKE_TICK; t < FIRST_INTAKE_TICK + TICKS_PER_YEAR; t++) {
      for (const e of eventsAt(t)) counts[e] = (counts[e] ?? 0) + 1;
    }
    expect(counts).toEqual({
      dayStart: 7,
      fallIntake: 1,
      springIntake: 1,
      waitlistClose: 2,
      graduation: 1,
      yearEnd: 1,
    });
  });

  it('closes each waitlist a day and a half after its intake', () => {
    expect(eventsAt(FIRST_INTAKE_TICK + WAITLIST_TICKS)).toEqual(['waitlistClose']);
    expect(eventsAt(FIRST_INTAKE_TICK + 3 * TICKS_PER_DAY + WAITLIST_TICKS)).toEqual(['waitlistClose']);
  });

  it('always names a next milestone at least one tick away', () => {
    for (let t = 0; t < 2 * TICKS_PER_YEAR; t += 97) {
      const next = nextMilestone(t);
      expect(next.inTicks).toBeGreaterThanOrEqual(1);
      expect(eventsAt(t + next.inTicks)).toContain(next.event);
    }
  });
});

describe('timers', () => {
  it('fire in due order, then in the order they were set', () => {
    const state = freshGame();
    addTimer(state, 10, 'buildDone', 1);
    addTimer(state, 5, 'buildDone', 2);
    addTimer(state, 10, 'buildDone', 3);
    addTimer(state, 5, 'buildDone', 4);
    expect(popDue(state, 4)).toEqual([]);
    expect(popDue(state, 5).map((t) => t.ref)).toEqual([2, 4]);
    expect(popDue(state, 99).map((t) => t.ref)).toEqual([1, 3]);
    expect(state.timers).toEqual([]);
  });

  it('can be cancelled', () => {
    const state = freshGame();
    addTimer(state, 10, 'buildDone', 1);
    addTimer(state, 11, 'buildDone', 2);
    cancelTimers(state, 'buildDone', 1);
    expect(state.timers.map((t) => t.ref)).toEqual([2]);
  });
});

describe('new game', () => {
  it('builds the starter campus at the centre of the starting land', () => {
    const state = freshGame();
    // The map is the starting land, the fields south of it and the town down its east side.
    expect(state.map.width).toBe(WORLD.width);
    expect(state.map.cells.length).toBe(WORLD.width * WORLD.height);
    expect(state.map.parcels[0]).toMatchObject({ x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE, owned: true });
    expect(cellAt(state.map, 15, 15)?.kind).toBe('quad');
    expect(cellAt(state.map, 14, 14)?.kind).toBe('path');
    expect(buildings(state.map).map((b) => b.zone)).toEqual([
      'housing', 'housing', 'housing', 'academic', 'academic', 'academic',
    ]);
    expect(state.money.cash).toBe(START_CASH);
    expect(validate(state)).toBeNull();
  });

  it('puts every starter building beside a path', () => {
    const state = freshGame();
    for (const b of buildings(state.map)) {
      const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
        ([dx, dy]) => cellAt(state.map, b.x + dx!, b.y + dy!)?.kind === 'path',
      );
      expect(beside).toBe(true);
    }
  });

  it('is identical for the same seed', () => {
    expect(freshGame(11)).toEqual(freshGame(11));
  });
});

describe('money', () => {
  it('accrues yearly rates one minute at a time', () => {
    const state = freshGame();
    state.cohorts = [100, 100, 100, 100];
    markRatesDirty(state);
    // Fourteen minutes ends before the first intake, so nothing but money changes.
    const end = advance(state, T0, T0 + (FIRST_INTAKE_TICK - 1) * 60_000).state;
    const ticks = end.clock.tick;
    expect(ticks).toBe(FIRST_INTAKE_TICK - 1);
    // Every student pays tuition. The 36 beds of the starter dorms are all full, and each pays a room fee.
    // The starter dining hall reaches the three dorms, half the lots, so it has 200 students to itself (tests/food.test.ts).
    // What goes out is the budget, line by line (tests/money.test.ts).
    const spent = budget(state);
    expect(spent.incomeTotal).toBe(400 * TUITION_PER_STUDENT_PER_YEAR + 36 * ROOM_FEE_PER_BED_PER_YEAR + 200 * 30);
    expect(spent.spending).toBe(spent.fullSpending);
    expect(spent.spending).toBeGreaterThan(upkeepPerYear(state));
    const perTick = (spent.incomeTotal - spent.spending) / TICKS_PER_YEAR;
    expect(end.money.cash).toBeCloseTo(START_CASH + perTick * ticks, 6);
    expect(end.money.yearEarned - end.money.yearSpent).toBeCloseTo(perTick * ticks, 6);
    expect(netPerRealHour(end)).toBeCloseTo(perTick * 60, 6);
  });

  it('refuses a purchase the campus cannot afford', () => {
    const state = freshGame();
    expect(spend(state, START_CASH + 1)).toBe(false);
    expect(state.money.cash).toBe(START_CASH);
    expect(spend(state, 1000)).toBe(true);
    expect(state.money.cash).toBe(START_CASH - 1000);
  });

  it('tops cash up to zero at the daily check and records the grant', () => {
    const state = freshGame();
    state.money.cash = -5_000;
    const result = advance(state, T0, T0 + (FIRST_INTAKE_TICK + 1) * 60_000);
    const grant = result.log.find((e) => e.kind === 'grant');
    expect(grant).toBeDefined();
    expect(result.state.money.grants).toBeGreaterThan(5_000);
    expect(result.state.money.cash).toBeGreaterThan(-50);
  });

  it('keeps stored rates equal to freshly computed ones after a long run', () => {
    const end = advance(freshGame(), T0, T0 + 20 * DAY).state;
    const fresh = structuredClone(end);
    recomputeRates(fresh);
    expect(end.money.incomePerYear).toBeCloseTo(fresh.money.incomePerYear, 6);
    expect(end.money.spendingPerYear).toBeCloseTo(fresh.money.spendingPerYear, 6);
  });

  it('closes the books at the end of each game year', () => {
    const result = advance(freshGame(), T0, T0 + 8 * DAY);
    const yearEnds = result.log.filter((e) => e.kind === 'yearEnd');
    expect(yearEnds.length).toBe(1);
    expect(result.state.stats.yearsCompleted).toBe(1);
  });
});

describe('format', () => {
  it('writes money the same way everywhere', () => {
    expect(dollars(1234567.4)).toBe('$1,234,567');
    expect(dollars(-950)).toBe('-$950');
    expect(dollars(0)).toBe('$0');
    expect(dollarsShort(1_250_000)).toBe('$1.3M');
    expect(dollarsShort(34_400)).toBe('$34K');
    expect(dollarsShort(-2_300)).toBe('-$2.3K');
  });

  it('writes durations in real time', () => {
    expect(duration(12)).toBe('12 m');
    expect(duration(250)).toBe('4 h 10 m');
    expect(duration(1440 * 2 + 180)).toBe('2 d 3 h');
  });
});
