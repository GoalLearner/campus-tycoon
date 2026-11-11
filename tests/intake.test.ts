import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  BED_NEED,
  bottleneck,
  demandBar,
  enrollment,
  expectedClass,
  fallClassDraw,
  FIRST_INTAKE_TICK,
  FOUNDING_CLASS,
  openCapacity,
  roomForNewStudents,
  rowBetween,
  SPRING_SHARE,
  TICKS_PER_DAY,
  WAITLIST_TICKS,
  type GameState,
  type Point,
  type Tool,
} from '../src/sim';
import { badNumbers, DAY, freshGame, MIN, T0 } from './helpers';

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const at = (tick: number): number => T0 + tick * MIN;

/** A campus with enough lots zoned, before move-in, to hold the whole founding class in time. */
function wellZoned(): GameState {
  let state = freshGame();
  state.money.cash = 5_000_000;
  state = paint(state, 'path', [...rowBetween([0, 14], [7, 14]), ...rowBetween([0, 17], [7, 17]), ...rowBetween([24, 14], [31, 14]), ...rowBetween([24, 17], [31, 17])]);
  state = paint(state, 'quad', [...rowBetween([4, 15], [9, 15]), ...rowBetween([4, 16], [9, 16]), ...rowBetween([22, 15], [27, 15]), ...rowBetween([22, 16], [27, 16])]);
  state = paint(state, 'academic', [...rowBetween([0, 13], [9, 13]), ...rowBetween([20, 13], [31, 13])]);
  state = paint(state, 'housing', [...rowBetween([0, 18], [18, 18]), ...rowBetween([22, 18], [31, 18])]);
  return state;
}

describe('the forecast', () => {
  it('expects the founding class before move-in', () => {
    const state = freshGame();
    expect(expectedClass(state)).toBe(FOUNDING_CLASS);
    expect(demandBar(state, 'academic')).toBeGreaterThan(0.5);
    expect(demandBar(state, 'housing')).toBeGreaterThan(0.5);
    expect(bottleneck(state)).not.toBeNull();
  });

  it('reacts to zoning as soon as buildings open', () => {
    let state = freshGame();
    const before = demandBar(state, 'academic');
    state = paint(state, 'academic', rowBetween([4, 13], [9, 13]));
    state = advance(state, T0, at(5)).state;
    expect(demandBar(state, 'academic')).toBeLessThan(before);
  });
});

describe('the first intake', () => {
  it('lands fifteen minutes in and is capped by the scarcest zone', () => {
    const before = advance(freshGame(), T0, at(FIRST_INTAKE_TICK - 1));
    expect(enrollment(before.state)).toBe(0);
    expect(before.log.some((e) => e.kind === 'intake')).toBe(false);

    const result = advance(freshGame(), T0, at(FIRST_INTAKE_TICK));
    const intake = result.state.admissions.lastIntake!;
    expect(intake.season).toBe('fall');
    expect(intake.expected).toBe(FOUNDING_CLASS);
    // The starter campus holds 60: 60 seats, and 36 beds at 0.6 beds a student.
    expect(intake.admitted).toBe(60);
    expect(enrollment(result.state)).toBe(60);
    expect(intake.turnedAway).toBe(FOUNDING_CLASS - 60);
    expect(intake.bottleneck).not.toBeNull();
    expect(result.state.admissions.waitlist).toBe(FOUNDING_CLASS - 60);
    expect(result.log.filter((e) => e.kind === 'intake').length).toBe(1);
  });

  it('never enrols more students than either zone can hold', () => {
    const state = advance(freshGame(), T0, at(FIRST_INTAKE_TICK)).state;
    expect(enrollment(state)).toBeLessThanOrEqual(openCapacity(state, 'academic'));
    expect(enrollment(state) * BED_NEED).toBeLessThanOrEqual(openCapacity(state, 'housing') + 1e-9);
    expect(roomForNewStudents(state).room).toBe(0);
  });
});

describe('the waitlist', () => {
  it('fills room that opens during the window', () => {
    // Zone right after move-in: the buildings open minutes later and the waitlist takes them.
    let state = advance(freshGame(), T0, at(FIRST_INTAKE_TICK)).state;
    state.money.cash = 5_000_000;
    const waiting = state.admissions.waitlist;
    state = paint(state, 'academic', rowBetween([4, 13], [9, 13]));
    state = paint(state, 'housing', rowBetween([8, 18], [14, 18]));
    const result = advance(state, at(FIRST_INTAKE_TICK), at(FIRST_INTAKE_TICK + 60));
    expect(result.state.admissions.waitlistAdmitted).toBeGreaterThan(0);
    expect(result.state.admissions.waitlist).toBe(waiting - result.state.admissions.waitlistAdmitted);
    expect(enrollment(result.state)).toBe(60 + result.state.admissions.waitlistAdmitted);
    expect(result.log.some((e) => e.kind === 'waitlist')).toBe(true);
  });

  it('closes nine hours after the intake and reports who was lost', () => {
    const open = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS - 1)).state;
    expect(open.admissions.waitlist).toBeGreaterThan(0);

    const result = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS));
    expect(result.state.admissions.waitlist).toBe(0);
    expect(result.state.admissions.waitlistUntilTick).toBe(0);
    const closed = result.log.find((e) => e.kind === 'waitlistClosed');
    expect(closed?.data?.lost).toBeGreaterThan(0);
  });

  it('admits no one after it has closed', () => {
    let state = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS + 5)).state;
    state.money.cash = 5_000_000;
    const students = enrollment(state);
    state = paint(state, 'academic', rowBetween([4, 13], [9, 13]));
    state = paint(state, 'housing', rowBetween([8, 18], [14, 18]));
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 6 * 60 * MIN).state;
    expect(enrollment(later)).toBe(students);
  });

  it('takes the whole founding class when the campus was zoned in time', () => {
    const result = advance(wellZoned(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS + 1));
    expect(enrollment(result.state)).toBe(FOUNDING_CLASS);
    expect(result.log.some((e) => e.kind === 'waitlistClosed' && Number(e.data?.lost) > 0)).toBe(false);
  });
});

describe('the academic year', () => {
  it('brings a smaller spring class on day four', () => {
    const start = wellZoned();
    const beforeSpring = advance(start, T0, at(FIRST_INTAKE_TICK + 3 * TICKS_PER_DAY - 1)).state;
    const fall = fallClassDraw(beforeSpring);
    const result = advance(start, T0, at(FIRST_INTAKE_TICK + 3 * TICKS_PER_DAY));
    const spring = result.state.admissions.lastIntake!;
    expect(spring.season).toBe('spring');
    // The forecast is taken after the fall semester's leavers have gone, so allow a little slack.
    expect(spring.expected).toBeGreaterThan(fall * SPRING_SHARE * 0.9);
    expect(spring.expected).toBeLessThanOrEqual(Math.round(fall * SPRING_SHARE));
  });

  it('moves every class up a year at the next fall intake', () => {
    const start = wellZoned();
    const yearOne = advance(start, T0, T0 + 6.5 * DAY).state;
    expect(yearOne.cohorts[0]).toBeGreaterThan(0);
    expect(yearOne.cohorts[1]).toBe(0);

    const yearTwo = advance(start, T0, T0 + 7.5 * DAY).state;
    expect(yearTwo.cohorts[1]).toBe(yearOne.cohorts[0]);
    expect(yearTwo.cohorts[0]).toBeGreaterThan(0);
  });

  it('graduates the founding class in its fourth year', () => {
    const start = wellZoned();
    const beforeGrad = advance(start, T0, T0 + 26 * DAY).state;
    expect(beforeGrad.stats.graduates).toBe(0);
    expect(beforeGrad.cohorts[3]).toBeGreaterThan(0);

    const afterGrad = advance(start, T0, T0 + 27 * DAY);
    expect(afterGrad.state.stats.graduates).toBeGreaterThan(0);
    expect(afterGrad.state.cohorts[3]).toBe(0);
    expect(afterGrad.log.some((e) => e.kind === 'graduation')).toBe(true);
  });

  it('grows a tended campus year over year', () => {
    const start = wellZoned();
    const y1 = enrollment(advance(start, T0, T0 + 5 * DAY).state);
    const y2 = enrollment(advance(start, T0, T0 + 12 * DAY).state);
    const y3 = enrollment(advance(start, T0, T0 + 19 * DAY).state);
    expect(y2).toBeGreaterThan(y1);
    expect(y3).toBeGreaterThan(y2);
  });
});

describe('neglect', () => {
  it('leaves an untouched campus still working after five years', () => {
    let state = freshGame();
    // Five game years is five real weeks. Advance in 30-day pieces, as a long absence would.
    for (const days of [30, 35]) {
      state = advance(state, state.clock.lastSimulatedAt, T0 + days * DAY).state;
    }
    expect(state.stats.yearsCompleted).toBe(5);
    expect(enrollment(state)).toBeGreaterThan(0);
    expect(state.stats.graduates).toBeGreaterThan(0);
    expect(state.money.cash).toBeGreaterThanOrEqual(0);
    expect(state.money.incomePerYear).toBeGreaterThan(state.money.spendingPerYear);
    expect(badNumbers(state)).toEqual([]);
  });

  it('settles instead of collapsing or exploding', () => {
    const run = (days: number): number => {
      let state = freshGame();
      for (let d = 30; d < days; d += 30) state = advance(state, state.clock.lastSimulatedAt, T0 + d * DAY).state;
      return enrollment(advance(state, state.clock.lastSimulatedAt, T0 + days * DAY).state);
    };
    const atYear5 = run(35);
    const atYear10 = run(70);
    expect(atYear10).toBeGreaterThan(atYear5 * 0.7);
    expect(atYear10).toBeLessThan(atYear5 * 1.3);
  });
});
