import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  dormStudents,
  bottleneck,
  demandBar,
  enrollment,
  expectedClass,
  fallClassDraw,
  FIRST_INTAKE_TICK,
  FOUNDING_CLASS,
  FOUNDING_SHARES,
  MIN_WINDOW_TICKS,
  openCapacity,
  roomForNewStudents,
  rowBetween,
  sampleStudents,
  spreadClassYears,
  SPRING_SHARE,
  startedHere,
  studentCard,
  summarizeAway,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  WAITLIST_TICKS,
  type GameState,
  type LogEntry,
  type Point,
  type Tool,
} from '../src/sim';
import { promote } from '../src/sim/systems/admissions';
import { recomputeRates } from '../src/sim/systems/money';
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
  // A tended campus feeds its dorms: Housing needs dining in reach to grow past its first stage.
  for (const [x, y] of [[5, 19], [28, 19]] as const) {
    const placed = applyAction(state, { type: 'place', building: 'dining', x, y });
    if (!placed.ok) throw new Error(placed.error);
    state = placed.state;
  }
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
    // The starter campus holds 60: 60 seats, with 36 students in its 36 beds and 24 locals walking in from town.
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
    expect(dormStudents(state)).toBeLessThanOrEqual(openCapacity(state, 'housing'));
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

  it('closes a day and a half after the intake and reports who was lost', () => {
    const open = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS - 1)).state;
    expect(open.admissions.waitlist).toBeGreaterThan(0);

    const result = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + WAITLIST_TICKS));
    expect(result.state.admissions.waitlist).toBe(0);
    expect(result.state.admissions.waitlistUntilTick).toBe(0);
    const closed = result.log.find((e) => e.kind === 'waitlistClosed');
    expect(closed?.data?.lost).toBeGreaterThan(0);
  });

  it('is always open on a visit by someone who looks in once a day, with half a day to spare', () => {
    expect(WAITLIST_TICKS).toBeGreaterThanOrEqual(MIN_WINDOW_TICKS);
    // Whatever minute of the day they look in, their first visit after an intake is inside the window.
    for (let minute = 0; minute < TICKS_PER_DAY; minute += 7) {
      const firstVisit = minute === 0 ? 0 : minute;
      const lastVisitInside = firstVisit + Math.floor((WAITLIST_TICKS - 1 - firstVisit) / TICKS_PER_DAY) * TICKS_PER_DAY;
      expect(lastVisitInside).toBeLessThan(WAITLIST_TICKS);
      expect(WAITLIST_TICKS - firstVisit).toBeGreaterThanOrEqual(12 * 60);
    }
    // And no window is still open when the next class arrives.
    expect(WAITLIST_TICKS).toBeLessThan(2 * TICKS_PER_DAY);
  });

  it('still takes students a full day after the intake', () => {
    // Someone who was not there for move-in and looks in a day later can still fix it.
    let state = advance(freshGame(), T0, at(FIRST_INTAKE_TICK + TICKS_PER_DAY - 1)).state;
    state.money.cash = 5_000_000;
    const students = enrollment(state);
    expect(state.admissions.waitlist).toBeGreaterThan(0);
    state = paint(state, 'academic', rowBetween([4, 13], [9, 13]));
    state = paint(state, 'housing', rowBetween([8, 18], [14, 18]));
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 60 * MIN).state;
    expect(enrollment(later)).toBeGreaterThan(students);
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
    expect(yearOne.cohorts[1]).toBeGreaterThan(0);
    // The seniors have just graduated.
    expect(yearOne.cohorts[3]).toBe(0);

    const yearTwo = advance(start, T0, T0 + 7.5 * DAY).state;
    expect(yearTwo.cohorts[1]).toBe(yearOne.cohorts[0]);
    expect(yearTwo.cohorts[2]).toBe(yearOne.cohorts[1]);
    expect(yearTwo.cohorts[3]).toBe(yearOne.cohorts[2]);
    expect(yearTwo.cohorts[0]).toBeGreaterThan(0);
  });

  it('graduates a class every spring, from the first commencement on', () => {
    const start = wellZoned();
    const beforeGrad = advance(start, T0, T0 + 4.5 * DAY).state;
    expect(beforeGrad.stats.graduates).toBe(0);
    expect(beforeGrad.cohorts[3]).toBeGreaterThan(0);

    // Year one: the founding seniors, who began somewhere else two years before the campus opened.
    const first = advance(start, T0, T0 + 6.5 * DAY);
    // All of them but the few who did not come back at the end of the semester.
    expect(first.state.stats.graduates).toBeGreaterThan(beforeGrad.cohorts[3] * 0.9);
    expect(first.state.stats.graduates).toBeLessThanOrEqual(beforeGrad.cohorts[3]);
    expect(first.state.cohorts[3]).toBe(0);
    expect(first.log.some((e) => e.kind === 'graduation')).toBe(true);
    expect(first.state.classes.find((r) => r.entryYear === -2)?.finishedOnTime).toBe(first.state.stats.graduates);

    // Year four: the first class to have spent all four years here.
    const beforeFourth = advance(start, T0, T0 + 26 * DAY).state;
    const fourth = advance(start, T0, T0 + 27 * DAY).state;
    expect(fourth.stats.graduates).toBeGreaterThan(beforeFourth.stats.graduates);
    expect(fourth.classes.find((r) => r.entryYear === 1)?.finishedOnTime).toBeGreaterThan(0);
    expect(fourth.cohorts[3]).toBe(0);
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

describe('all four class years from the first day', () => {
  const sum = (list: readonly number[]): number => list.reduce((total, n) => total + n, 0);

  it('splits the founding class 27, 26, 25 and 22 in a hundred, and changes nothing else on day one', () => {
    const state = advance(wellZoned(), T0, at(FIRST_INTAKE_TICK)).state;
    expect(enrollment(state)).toBe(FOUNDING_CLASS);
    expect(state.cohorts).toEqual(FOUNDING_SHARES.map((share) => Math.round(FOUNDING_CLASS * share)));
    expect(state.cohorts[3]).toBeLessThan(state.cohorts[0]);
    // Those who live in town are split the same way.
    const off = sum(state.offCampus);
    expect(off).toBeGreaterThan(0);
    for (let classYear = 0; classYear < 4; classYear++) {
      expect(Math.abs(state.offCampus[classYear]! - off * FOUNDING_SHARES[classYear]!)).toBeLessThanOrEqual(1);
    }
    // The money is what it would be with 400 freshmen: tuition and room fees do not ask what year anyone is in.
    const freshmen = structuredClone(state);
    freshmen.cohorts = [FOUNDING_CLASS, 0, 0, 0];
    freshmen.offCampus = [off, 0, 0, 0];
    recomputeRates(state);
    recomputeRates(freshmen);
    expect(state.money.incomePerYear).toBe(freshmen.money.incomePerYear);
    expect(state.money.spendingPerYear).toBe(freshmen.money.spendingPerYear);
    expect(state.money.cash).toBe(freshmen.money.cash);
  });

  it('keeps the mix however the founders trickle in, and records each class under the year it began', () => {
    // The starter campus has room for 60. The other 340 wait, and come in as lots open.
    const first = advance(freshGame(), T0, at(FIRST_INTAKE_TICK)).state;
    expect(enrollment(first)).toBe(60);
    for (let classYear = 0; classYear < 4; classYear++) {
      expect(Math.abs(first.cohorts[classYear]! - 60 * FOUNDING_SHARES[classYear]!)).toBeLessThan(1);
    }
    let state = structuredClone(first);
    state.money.cash = 5_000_000;
    state = paint(state, 'housing', rowBetween([0, 18], [18, 18]));
    state = paint(state, 'academic', rowBetween([0, 13], [9, 13]));
    const later = advance(state, state.clock.lastSimulatedAt, T0 + 1.2 * DAY).state;
    expect(enrollment(later)).toBeGreaterThan(100);
    expect(later.admissions.waitlistAdmitted).toBe(enrollment(later) - 60);
    for (let classYear = 0; classYear < 4; classYear++) {
      expect(Math.abs(later.cohorts[classYear]! - enrollment(later) * FOUNDING_SHARES[classYear]!)).toBeLessThan(1);
      // Sophomores began in year 0, juniors in year -1, seniors in year -2.
      expect(later.classes.find((r) => r.entryYear === 1 - classYear)?.entered).toBe(later.cohorts[classYear]);
    }
    expect(later.classes.filter(startedHere).map((r) => r.entryYear)).toEqual([1]);
  });

  it('brings every later class in as freshmen', () => {
    const start = wellZoned();
    const beforeSpring = advance(start, T0, T0 + 2.9 * DAY).state;
    const afterSpring = advance(start, T0, T0 + 3.2 * DAY).state;
    expect(afterSpring.admissions.lastIntake?.season).toBe('spring');
    expect(afterSpring.admissions.lastIntake!.admitted).toBeGreaterThan(0);
    // The upper classes only shrink, by the few who did not come back.
    for (const classYear of [1, 2, 3]) expect(afterSpring.cohorts[classYear]).toBeLessThanOrEqual(beforeSpring.cohorts[classYear]!);
    expect(afterSpring.cohorts[0]).toBeGreaterThan(beforeSpring.cohorts[0]! - 10);
  });

  it('shows each founder the year they are in, with a first-year phase only for freshmen and a last-year one only for seniors', () => {
    const state = advance(wellZoned(), T0, T0 + 20 * MIN).state;
    const names = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
    for (let classYear = 0; classYear < 4; classYear++) {
      // A founding sophomore's class entered in year 0, a senior's in year -2.
      const card = studentCard(state, { entryYear: 1 - classYear, index: 0 })!;
      expect(card.classYear).toBe(classYear);
      expect(card.classYearName).toBe(names[classYear]);
      expect(studentCard(state, { entryYear: 1 - classYear, index: state.cohorts[classYear]! })).toBeNull();
    }
    const cards = sampleStudents(state).map((ref) => studentCard(state, ref)!);
    expect(cards.length).toBe(FOUNDING_CLASS);
    for (const card of cards) {
      if (card.archetype === 'lost' || card.archetype === 'homesick') expect(card.classYear).toBe(0);
      if (card.archetype === 'superSenior') expect(card.classYear).toBe(3);
    }
    expect(cards.some((card) => card.archetype === 'lost')).toBe(true);
    expect(cards.some((card) => card.archetype === 'superSenior')).toBe(true);
  });
});

describe('a save from before campuses opened with four class years', () => {
  const sum = (list: readonly number[]): number => list.reduce((total, n) => total + n, 0);
  /** The campus as an older version left it: everyone a freshman, in the fall of year one. */
  function oldSave(): GameState {
    const state = structuredClone(advance(wellZoned(), T0, T0 + 2 * DAY).state);
    const off = sum(state.offCampus);
    state.cohorts = [enrollment(state), 0, 0, 0];
    state.offCampus = [off, 0, 0, 0];
    state.classes = [{ entryYear: 1, entered: FOUNDING_CLASS, finishedOnTime: 0, finishedLate: 0, left: FOUNDING_CLASS - state.cohorts[0] }];
    state.fourYears = false;
    return state;
  }

  it('graduates nobody in its first spring, then fills the upper classes at the next fall intake', () => {
    const start = oldSave();
    const summer = advance(start, start.clock.lastSimulatedAt, T0 + 6.9 * DAY);
    expect(summer.state.stats.graduates).toBe(0);
    expect(summer.state.fourYears).toBe(false);
    expect(summer.log.some((e) => e.kind === 'classes')).toBe(false);

    const fall = advance(summer.state, summer.state.clock.lastSimulatedAt, T0 + 7.1 * DAY);
    expect(fall.state.fourYears).toBe(true);
    for (const classYear of [0, 1, 2, 3]) expect(fall.state.cohorts[classYear]).toBeGreaterThan(0);
    // Said once, and it reaches the away list.
    const notes = fall.log.filter((e) => e.kind === 'classes');
    expect(notes.length).toBe(1);
    expect(notes[0]!.text).toMatch(/all four class years/);
    const away = summarizeAway(fall.log, { minutes: 300, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(away.lines.filter((line) => /all four class years/.test(line)).length).toBe(1);
    // And never again.
    const next = advance(fall.state, fall.state.clock.lastSimulatedAt, T0 + 14.5 * DAY);
    expect(next.log.some((e) => e.kind === 'classes')).toBe(false);
    // Its seniors graduate that spring.
    expect(next.state.stats.graduates).toBeGreaterThan(0);
  });

  it('moves nobody out and changes no income: the same students, in other years', () => {
    const start = oldSave();
    const summer = structuredClone(advance(start, start.clock.lastSimulatedAt, T0 + 6.9 * DAY).state);
    summer.clock.tick += 1;
    promote(summer);
    recomputeRates(summer);
    const before = structuredClone(summer);
    const log: LogEntry[] = [];
    spreadClassYears(summer, log);
    recomputeRates(summer);
    expect(enrollment(summer)).toBe(enrollment(before));
    expect(sum(summer.offCampus)).toBe(sum(before.offCampus));
    expect(summer.money.incomePerYear).toBe(before.money.incomePerYear);
    expect(summer.money.spendingPerYear).toBe(before.money.spendingPerYear);
    expect(sum(summer.classes.map((r) => r.entered))).toBe(sum(before.classes.map((r) => r.entered)));
    // About 26, 25 and 22 parts of the 73 that are not freshmen.
    const continuing = enrollment(before);
    expect(summer.cohorts[0]).toBe(0);
    expect(Math.abs(summer.cohorts[3] - (continuing * 22) / 73)).toBeLessThanOrEqual(1);
    expect(Math.abs(summer.cohorts[2] - (continuing * 25) / 73)).toBeLessThanOrEqual(1);
    for (let classYear = 1; classYear < 4; classYear++) expect(summer.offCampus[classYear]).toBeLessThanOrEqual(summer.cohorts[classYear]!);
    expect(log.length).toBe(1);
    // A second call does nothing.
    const again = structuredClone(summer);
    spreadClassYears(again, log);
    expect(again).toEqual(summer);
    expect(log.length).toBe(1);
  });

  it('moves nobody down a year, and leaves a campus with every class alone', () => {
    // A save upgraded in its second year: last year's freshmen and the founding class, no seniors.
    const two = oldSave();
    two.clock.tick = 2 * TICKS_PER_YEAR + FIRST_INTAKE_TICK;
    two.cohorts = [0, 100, 380, 0];
    two.offCampus = [0, 10, 40, 0];
    two.classes = [
      { entryYear: 1, entered: 400, finishedOnTime: 0, finishedLate: 0, left: 20 },
      { entryYear: 2, entered: 110, finishedOnTime: 0, finishedLate: 0, left: 10 },
    ];
    spreadClassYears(two, []);
    expect(two.cohorts[1]).toBe(100);
    expect(two.cohorts[3]).toBe(Math.round((480 * 22) / 73));
    expect(two.cohorts[2]).toBe(380 - two.cohorts[3]);
    expect(sum(two.offCampus)).toBe(50);

    // A mature campus already has every class.
    const mature = oldSave();
    mature.clock.tick = 5 * TICKS_PER_YEAR + FIRST_INTAKE_TICK;
    mature.cohorts = [0, 300, 280, 260];
    const before = structuredClone(mature);
    const log: LogEntry[] = [];
    spreadClassYears(mature, log);
    expect(mature.cohorts).toEqual(before.cohorts);
    expect(mature.classes).toEqual(before.classes);
    expect(mature.fourYears).toBe(true);
    expect(log.length).toBe(0);
  });
});
