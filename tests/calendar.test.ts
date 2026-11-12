import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_CALENDAR,
  activeEntries,
  advance,
  ANCHOR_RECHARGE_TICKS,
  anchorFreeAt,
  applyAction,
  BREAK_LIFT,
  BREAK_PRESENCE,
  budget,
  calendarAt,
  campusHappiness,
  campusLevels,
  datedDays,
  dateAt,
  dayRead,
  entrySpan,
  eventsAt,
  facultyCurve,
  FIRST_INTAKE_TICK,
  foodIncomePerYear,
  formatDate,
  marksAt,
  minuteOfDay,
  newGame,
  nextMilestone,
  parseSave,
  seasonCurve,
  seasonLine,
  serialize,
  SPELL_TICKS,
  STRESS_HAPPINESS,
  stressLoss,
  stressRead,
  SUMMER_PRESENCE,
  TICK_MS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_YEAR,
  tickOfDate,
  timeOfTick,
  WAITLIST_TICKS,
  weatherAt,
  WEATHER_POINTS,
  yearLength,
  type CalendarEvent,
  type Clock,
  type GameState,
  type LogEntry,
  type Week,
} from '../src/sim';

/**
 * The football and calendar layer, first half: the anchored week, the
 * founding day, the events of the academic year, Stress, breaks and weather
 * (DESIGN.md sections 4.2, 4.8, 27 and 28).
 */

// Nine in the morning, UTC, on a Monday.
const NOW = Date.UTC(2026, 0, 5, 9, 0, 0);
const HOUR = 60 * TICK_MS;

const run = (state: GameState, ticks: number): { state: GameState; log: LogEntry[] } => {
  const result = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ticks * TICK_MS);
  return { state: result.state, log: result.log };
};
const at = (week: Week, tick: number): Pick<Clock, 'tick' | 'week'> => ({ tick, week });
const PLAIN: Week = { year: 1, start: FIRST_INTAKE_TICK, extra: 0 };
const entry = (id: string) => ACADEMIC_CALENDAR.events.find((event) => event.id === id)!;

describe('the anchor and the founding day', () => {
  it('a game made without an anchor has the plain week it always had', () => {
    const state = newGame({ seed: 5, name: 'Plain', now: NOW });
    expect(state.clock.anchor).toBeNull();
    expect(state.clock.week).toEqual(PLAIN);
    expect(eventsAt(at(PLAIN, FIRST_INTAKE_TICK))).toEqual(['dayStart', 'fallIntake']);
    expect(eventsAt(at(PLAIN, FIRST_INTAKE_TICK))).toEqual(eventsAt(FIRST_INTAKE_TICK));
  });

  it('the first class moves in after fifteen minutes at any hour, and the week starts at the first anchor', () => {
    // Made at 09:00 with the anchor at 16:00: the first intake is 09:15, and the founding day runs 6 h 45 min.
    const state = newGame({ seed: 5, name: 'Anchored', now: NOW, anchor: 16 * 60 });
    const week = state.clock.week;
    expect(week).toEqual({ year: 1, start: FIRST_INTAKE_TICK + 6 * 60 + 45, extra: 0 });
    expect(minuteOfDay(timeOfTick(state.clock, week.start))).toBe(16 * 60);
    expect(eventsAt(at(week, FIRST_INTAKE_TICK))).toEqual(['fallIntake']);
    expect(calendarAt(at(week, FIRST_INTAKE_TICK))).toMatchObject({ year: 1, day: 0, phase: 'founding' });
    expect(calendarAt(at(week, week.start - 1)).phase).toBe('founding');
    // The first anchor begins day 1 and brings no second class.
    expect(eventsAt(at(week, week.start))).toEqual(['dayStart']);
    expect(calendarAt(at(week, week.start))).toMatchObject({ year: 1, day: 1, phase: 'fall', tickInYear: 0 });
    // The waitlist of the first class still closes 36 hours after it moved in.
    expect(eventsAt(at(week, FIRST_INTAKE_TICK + WAITLIST_TICKS))).toContain('waitlistClose');
  });

  it('every day of the week begins at the anchor hour, year after year', () => {
    let state = newGame({ seed: 5, name: 'Anchored', now: NOW, anchor: 16 * 60 });
    const seen: Array<{ event: CalendarEvent; minute: number }> = [];
    for (let day = 0; day < 16; day++) {
      const before = state.clock.tick;
      state = run(state, TICKS_PER_DAY).state;
      for (let tick = before + 1; tick <= state.clock.tick; tick++) {
        // Find the week the tick fell in by replaying its events from the state's own clock afterwards.
        if (tick < state.clock.week.start && state.clock.week.year > 1) continue;
        for (const event of eventsAt(at(state.clock.week, tick))) seen.push({ event, minute: minuteOfDay(timeOfTick(state.clock, tick)) });
      }
    }
    const anchored = seen.filter((mark) => mark.event !== 'waitlistClose' && !(mark.event === 'fallIntake' && mark.minute !== 16 * 60));
    expect(anchored.length).toBeGreaterThan(14);
    for (const mark of anchored) expect(mark.minute, mark.event).toBe(16 * 60);
    expect(state.clock.week.year).toBe(3);
  });

  it('the founding day shows move-in week, and the semester starts on its own date at the anchor', () => {
    const state = newGame({ seed: 5, name: 'Anchored', now: NOW, anchor: 16 * 60 });
    const week = state.clock.week;
    expect(formatDate(dateAt(at(week, FIRST_INTAKE_TICK)))).toBe('Wed, Aug 12');
    expect(formatDate(dateAt(at(week, week.start - 1)))).toBe('Tue, Aug 18');
    expect(formatDate(dateAt(at(week, week.start)))).toBe('Wed, Aug 19');
    expect(formatDate(dateAt(at(week, week.start + 72 * 60)))).toBe('Tue, Jan 19');
  });

  it('a founding day is never as long as a whole day, and none at all when the anchor is the intake itself', () => {
    for (const anchor of [0, 9 * 60 + 15, 9 * 60 + 14, 23 * 60 + 59]) {
      const week = newGame({ seed: 5, name: 'A', now: NOW, anchor }).clock.week;
      expect(week.start - FIRST_INTAKE_TICK).toBeGreaterThanOrEqual(0);
      expect(week.start - FIRST_INTAKE_TICK).toBeLessThan(TICKS_PER_DAY);
    }
    expect(newGame({ seed: 5, name: 'A', now: NOW, anchor: 9 * 60 + 15 }).clock.week.start).toBe(FIRST_INTAKE_TICK);
  });

  it('one advance equals many across a founding day and a year', () => {
    const start = newGame({ seed: 9, name: 'Anchored', now: NOW, anchor: 13 * 60 + 30 });
    const end = NOW + 9 * 24 * HOUR;
    const once = advance(start, NOW, end);
    let stepped = start;
    const log: LogEntry[] = [];
    for (let t = NOW; t < end; t += 7 * HOUR + 11 * TICK_MS) {
      const part = advance(stepped, stepped.clock.lastSimulatedAt, Math.min(end, t + 7 * HOUR + 11 * TICK_MS));
      stepped = part.state;
      log.push(...part.log);
    }
    expect(serialize(stepped, 0)).toBe(serialize(once.state, 0));
    expect(log).toEqual(once.log);
    expect(once.state.clock.week.year).toBe(2);
  });

  it('moving the anchor stretches one summer and shortens nothing', () => {
    let state = run(newGame({ seed: 5, name: 'Plain', now: NOW }), 2 * TICKS_PER_DAY).state;
    const before = state.clock.week;
    const nextFall = before.start + TICKS_PER_YEAR;
    // The plain week turns at 09:15. Ask for 16:00.
    const moved = applyAction(state, { type: 'anchor', minute: 16 * 60 });
    expect(moved.ok).toBe(true);
    state = moved.state;
    expect(state.clock.anchor).toBe(16 * 60);
    expect(state.clock.week.start).toBe(before.start);
    expect(state.clock.week.extra).toBe(6 * 60 + 45);
    expect(yearLength(state.clock.week)).toBeGreaterThanOrEqual(TICKS_PER_YEAR);
    // Nothing before the summer moves: the spring intake, graduation and the year's end are where they were.
    for (const event of ['springIntake', 'graduation', 'yearEnd'] as const) {
      let found = -1;
      for (let tick = before.start; tick < nextFall; tick++) if (eventsAt(at(state.clock.week, tick)).includes(event)) found = tick;
      let was = -1;
      for (let tick = before.start; tick < nextFall; tick++) if (eventsAt(at(before, tick)).includes(event)) was = tick;
      expect(found, event).toBe(was);
    }
    // The next fall begins later, on the new anchor, and the years after it are seven days again.
    state = run(state, 6 * TICKS_PER_DAY).state;
    expect(state.clock.week).toEqual({ year: 2, start: nextFall + 6 * 60 + 45, extra: 0 });
    expect(minuteOfDay(timeOfTick(state.clock, state.clock.week.start))).toBe(16 * 60);
  });

  it('the first choice on a game with no anchor is free, and after that it can be moved every four weeks', () => {
    let state = newGame({ seed: 5, name: 'Plain', now: NOW });
    state = applyAction(state, { type: 'anchor', minute: 600 }).state;
    expect(anchorFreeAt(state)).toBe(0);
    const second = applyAction(state, { type: 'anchor', minute: 700 });
    expect(second.ok).toBe(true);
    state = second.state;
    expect(anchorFreeAt(state)).toBe(state.clock.tick + ANCHOR_RECHARGE_TICKS);
    const third = applyAction(state, { type: 'anchor', minute: 800 });
    expect(third.ok).toBe(false);
    // The same minute again is not a move.
    expect(applyAction(state, { type: 'anchor', minute: 700 }).ok).toBe(true);
    expect(applyAction(state, { type: 'anchor', minute: 1440 }).ok).toBe(false);
  });

  it('the date still runs evenly through a stretched summer, and the next milestone is right', () => {
    const week: Week = { year: 2, start: 20_000, extra: 500 };
    expect(formatDate(dateAt(at(week, week.start + 144 * 60)))).toBe('Wed, May 26');
    expect(formatDate(dateAt(at(week, week.start + TICKS_PER_YEAR + 499)))).toBe('Wed, Aug 18');
    expect(calendarAt(at(week, week.start + TICKS_PER_YEAR + 100))).toMatchObject({ day: 7, phase: 'summer' });
    expect(nextMilestone(at(week, week.start + TICKS_PER_YEAR + 100))).toEqual({ event: 'fallIntake', inTicks: 400 });
    let last = 0;
    for (let tick = week.start + 144 * 60; tick < week.start + yearLength(week); tick += 7) {
      const date = dateAt(at(week, tick));
      const order = date.month * 31 + date.day;
      expect(order).toBeGreaterThanOrEqual(last);
      last = order;
    }
  });

  it('a save from before the anchor loads with its plain week and no anchor', () => {
    const state = run(newGame({ seed: 5, name: 'Old', now: NOW }), 9 * TICKS_PER_DAY).state;
    const old = JSON.parse(serialize(state, 0)) as { v: number; state: { version: number; clock: Record<string, unknown>; term?: unknown } };
    old.v = 11;
    old.state.version = 11;
    delete old.state.clock.week;
    delete old.state.clock.anchor;
    delete old.state.clock.anchorMovedTick;
    delete old.state.term;
    const loaded = parseSave(JSON.stringify(old));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(11);
    expect(loaded.state.clock.week).toEqual(state.clock.week);
    expect(loaded.state.clock.anchor).toBeNull();
    expect(loaded.state.term.since).toBe(state.clock.tick);
  });
});

describe('the events of the academic year', () => {
  it('a date and its tick turn into each other, for every day of the year', () => {
    for (let day = 0; day < 365; day += 1) {
      const tick = PLAIN.start + Math.floor((day / 365) * TICKS_PER_YEAR);
      const date = dateAt(at(PLAIN, tick));
      const year = date.month > 8 || (date.month === 8 && date.day >= 19) ? 0 : 1;
      const first = tickOfDate(PLAIN, [date.month, date.day, year]);
      expect(first).toBeLessThanOrEqual(tick);
      expect(dateAt(at(PLAIN, first))).toEqual(date);
      if (first > PLAIN.start) expect(dateAt(at(PLAIN, first - 1))).not.toEqual(date);
    }
  });

  it('puts the season opener eight hours after the fall anchor, on a Saturday', () => {
    const tick = tickOfDate(PLAIN, [9, 5, 0]);
    expect(tick - PLAIN.start).toBe(8 * TICKS_PER_HOUR);
    expect(dateAt(at(PLAIN, tick)).weekday).toBe(6);
    // Thanksgiving Saturday is 28 minutes before the third day begins.
    expect(PLAIN.start + 2 * TICKS_PER_DAY - tickOfDate(PLAIN, [11, 28, 0])).toBe(28);
  });

  it('every entry begins and ends once a year, in order', () => {
    const begins = new Map<string, number>();
    const ends = new Map<string, number>();
    for (let tick = PLAIN.start; tick <= PLAIN.start + TICKS_PER_YEAR; tick++) {
      for (const mark of marksAt(at(PLAIN, tick))) (mark.begins ? begins : ends).set(mark.entry.id, tick);
    }
    for (const event of ACADEMIC_CALENDAR.events) {
      const span = entrySpan(PLAIN, event);
      expect(begins.get(event.id), event.id).toBe(span.from);
      expect(ends.get(event.id), event.id).toBe(span.to);
      expect(span.to).toBeGreaterThan(span.from);
    }
    // Winter break is fourteen and a half real hours and ends as the spring class arrives.
    const winter = entrySpan(PLAIN, entry('winterBreak'));
    expect(winter.to).toBe(PLAIN.start + 3 * TICKS_PER_DAY);
    expect((winter.to - winter.from) / 60).toBeCloseTo(14.6, 0);
    // Fall finals are about three hours and twenty minutes of an afternoon.
    const finals = entrySpan(PLAIN, entry('fallFinals'));
    expect((finals.to - finals.from) / 60).toBeCloseTo(3.3, 1);
  });

  it('says what kind of day it is', () => {
    const kind = (id: string, into = 5): string => dayRead(at(PLAIN, entrySpan(PLAIN, entry(id)).from + into)).kind;
    expect(kind('laborDay')).toBe('holiday');
    expect(kind('fallMidterms')).toBe('midterms');
    expect(kind('thanksgiving')).toBe('break');
    expect(kind('fallFinals')).toBe('finals');
    expect(kind('winterBreak')).toBe('break');
    expect(kind('springBreak')).toBe('break');
    expect(kind('summerStart', 200)).toBe('summer');
    expect(dayRead(at(PLAIN, PLAIN.start + 300)).kind).toBe('term');
    expect(dayRead(at(PLAIN, 3)).kind).toBe('moveIn');
    // New Year's Day and the holiday at its end fall inside the winter break: the break is what the campus feels.
    expect(kind('newYear')).toBe('break');
    expect(activeEntries(at(PLAIN, entrySpan(PLAIN, entry('newYear')).from)).map((e) => e.id)).toContain('winterBreak');
  });

  it('a year away leaves a line for every holiday, break and exam week, with its date', () => {
    const start = run(newGame({ seed: 21, name: 'Larkspur', now: NOW }), FIRST_INTAKE_TICK).state;
    const { log } = run(start, TICKS_PER_YEAR);
    const said = log.filter((e) => e.kind === 'calendar' || e.kind === 'exam');
    const about = (id: string): LogEntry[] => said.filter((e) => e.data?.id === id);
    for (const id of ['laborDay', 'veteransDay', 'mlkDay', 'juneteenth', 'independenceDay']) expect(about(id).length, id).toBe(1);
    for (const id of ['thanksgiving', 'winterBreak', 'springBreak']) expect(about(id).length, id).toBe(2);
    for (const id of ['fallMidterms', 'fallFinals', 'springMidterms', 'springFinals']) {
      expect(about(id).filter((e) => e.kind === 'exam').length, id).toBe(1);
      expect(about(id).find((e) => e.kind === 'exam')!.text).toMatch(/Stress peaked at \d+/);
    }
    // Every line carries the date it happened on.
    for (const line of log) expect(line.date, line.text).toBeGreaterThan(100);
    expect(about('laborDay')[0]!.date).toBe(907);
    // The list by date, from the calendar's own lines: a whole year with football in it is longer than the list keeps.
    const days = datedDays(said).days;
    expect(days.find((day) => day.date === 'Sep 7')!.lines[0]).toContain('Labor Day');
    expect(days.map((day) => day.date)).toContain('Dec 19');
    // The whole year fits inside the last real week, so all of it is told by date.
    expect(datedDays(log).days.map((day) => day.date)).toContain('May 13');
  });

  it('an older year is told in what was kept, and a long list keeps its newest lines', () => {
    // Each year's lines are two real weeks from the next year's.
    const line = (year: number, date: number, text: string, keep = 0): LogEntry => ({ tick: year * 2 * TICKS_PER_YEAR + date, kind: 'calendar', text, date, year, data: { keep } });
    const { days } = datedDays([line(3, 907, 'Labor Day.'), line(3, 1128, 'A season to remember.', 1), line(4, 907, 'Labor Day again.'), line(4, 907, 'And a game.')]);
    expect(days).toEqual([
      { date: 'Year 3', lines: ['A season to remember.'] },
      { date: 'Sep 7', lines: ['Labor Day again.', 'And a game.'] },
    ]);
    const many = Array.from({ length: 90 }, (_, n) => line(1, 901 + (n % 28), `Line ${n}`));
    const long = datedDays(many);
    expect(long.earlier).toBe(30);
    expect(long.days.reduce((sum, day) => sum + day.lines.length, 0)).toBe(60);
  });
});

describe('Stress, breaks and weather', () => {
  const calm = { recreation: 1, green: 1, safety: 1, dining: 1 };
  const bare = { recreation: 0, green: 0, safety: 0, dining: 0 };
  const campus = (): GameState => run(newGame({ seed: 21, name: 'Larkspur', now: NOW }), FIRST_INTAKE_TICK + 30).state;
  const during = (state: GameState, id: string, into = 5): GameState => {
    const copy = structuredClone(state);
    copy.clock.tick = entrySpan(copy.clock.week, entry(id)).from + into;
    return copy;
  };

  it('follows the calendar: low on a break, climbing to exams, highest in finals week', () => {
    const curve = (id: string, into = 5): number => seasonCurve(at(PLAIN, entrySpan(PLAIN, entry(id)).from + into));
    expect(curve('fallFinals')).toBe(1);
    expect(curve('springFinals')).toBe(1);
    expect(curve('fallMidterms')).toBeLessThan(1);
    expect(curve('fallMidterms')).toBeGreaterThan(0.6);
    expect(curve('thanksgiving')).toBeLessThanOrEqual(0.1);
    expect(curve('winterBreak', 300)).toBeLessThanOrEqual(0.1);
    expect(curve('summerStart', 300)).toBeLessThan(0.2);
    // An ordinary week, and then the climb in the days before midterms.
    const ordinary = seasonCurve(at(PLAIN, PLAIN.start + 200));
    const before = seasonCurve(at(PLAIN, entrySpan(PLAIN, entry('fallMidterms')).from - 20));
    expect(before).toBeGreaterThan(ordinary);
    expect(before).toBeLessThan(curve('fallMidterms'));
    // Never outside its range, at any minute of the year.
    for (let tick = 0; tick < PLAIN.start + TICKS_PER_YEAR; tick += 13) {
      const value = seasonCurve(at(PLAIN, tick));
      expect(value).toBeGreaterThanOrEqual(0.1);
      expect(value).toBeLessThanOrEqual(1);
      expect(facultyCurve(at(PLAIN, tick))).toBeGreaterThanOrEqual(value);
    }
  });

  it('a campus with relief gets through finals with a small dip, and one without gets a big one', () => {
    const state = during(campus(), 'fallFinals');
    const worst = stressRead(state, bare, 1);
    const best = stressRead(state, calm, 1);
    expect(worst.score).toBeGreaterThan(best.score + 15);
    expect(worst.score).toBeLessThanOrEqual(100);
    // This small campus has no library and its classes are filling, so even with everything else in reach it is not the best there is.
    expect(best.score).toBeGreaterThan(15);
    expect(best.score).toBeLessThan(60);
    // The best a campus can read at the height of finals, until teaching is something the player funds: a third.
    expect(Math.round(100 * (0.55 + 0.45 * 0.25) * (1 - 0.5))).toBe(33);
    // The cause named is something to build.
    expect(['unwind', 'support', 'crowding']).toContain(worst.cause);
    // The dip on Happiness is capped.
    const line = seasonLine(state, bare);
    const exams = line.parts.find((part) => part.id === 'exams')!;
    expect(exams.points).toBeLessThan(-3);
    expect(exams.points).toBeGreaterThanOrEqual(-STRESS_HAPPINESS);
    expect(Math.abs(seasonLine(state, calm).parts.find((part) => part.id === 'exams')?.points ?? 0)).toBeLessThan(Math.abs(exams.points));
  });

  it('is worked out, so it eases the moment the season does', () => {
    const state = campus();
    const finals = stressRead(during(state, 'fallFinals'), campusLevels(state)).score;
    const rest = stressRead(during(state, 'winterBreak', 60), campusLevels(state)).score;
    expect(rest).toBeLessThan(finals / 5);
    expect(rest).toBeLessThan(12);
    // And across a whole year the semester's average is far below its peak.
    let year = state;
    let peak = 0;
    for (let hour = 0; hour < 7 * 24; hour++) {
      year = run(year, 60).state;
      peak = Math.max(peak, year.term.lastStress);
      expect(year.term.lastStress).toBeLessThanOrEqual(100);
    }
    expect(peak).toBeGreaterThan(30);
    expect(year.term.lastAverage).toBeGreaterThan(0);
    expect(year.term.lastAverage).toBeLessThan(peak * 0.7);
    expect(stressLoss(year.term.lastAverage)).toBeLessThanOrEqual(0.01);
    expect(stressLoss(10)).toBe(0);
    expect(stressLoss(36)).toBeCloseTo(0.01, 6);
  });

  it('a break lifts Happiness and empties the campus, and the first day back dips a little', () => {
    const state = campus();
    const onBreak = during(state, 'thanksgiving');
    const happy = campusHappiness(onBreak);
    expect(happy.season.parts.find((part) => part.id === 'break')!.points).toBe(BREAK_LIFT);
    expect(happy.season.day.presence).toBe(BREAK_PRESENCE);
    const back = structuredClone(state);
    back.clock.tick = entrySpan(back.clock.week, entry('thanksgiving')).to + 3;
    expect(campusHappiness(back).season.parts.find((part) => part.id === 'back')!.points).toBeLessThan(0);
    // The four causes are untouched by any of it, and retention follows them alone.
    expect(happy.base).toBe(campusHappiness(state).base);
    expect(happy.retention).toBe(campusHappiness(state).retention);
    expect(happy.score).toBeCloseTo(Math.max(0, Math.min(100, happy.base + happy.season.delta)), 9);
  });

  it('food and the stores earn by who is on campus', () => {
    const state = campus();
    const term = budget(state).income.find((line) => line.id === 'food')!.amount;
    expect(term).toBeCloseTo(foodIncomePerYear(state), 6);
    const onBreak = budget(during(state, 'winterBreak', 60)).income.find((line) => line.id === 'food')!;
    expect(onBreak.amount).toBeCloseTo(term * BREAK_PRESENCE, 6);
    expect(onBreak.detail).toContain('Winter break');
    expect(budget(during(state, 'summerStart', 600)).income.find((line) => line.id === 'food')!.amount).toBeCloseTo(term * SUMMER_PRESENCE, 6);
    // And the rate the campus is paid at follows it through a break and back.
    let live = state;
    live = run(live, entrySpan(live.clock.week, entry('thanksgiving')).from + 1 - live.clock.tick).state;
    const during_ = live.money.incomePerYear;
    live = run(live, entrySpan(live.clock.week, entry('thanksgiving')).to + 1 - live.clock.tick).state;
    expect(live.money.incomePerYear).toBeGreaterThan(during_);
  });

  it('weather comes in spells from the seed, by the season, with no state', () => {
    const seen: Record<string, Set<string>> = { fall: new Set(), winter: new Set(), spring: new Set(), summer: new Set() };
    for (let tick = PLAIN.start; tick < PLAIN.start + 6 * TICKS_PER_YEAR; tick += SPELL_TICKS) {
      const week: Week = { year: 1 + Math.floor((tick - PLAIN.start) / TICKS_PER_YEAR), start: PLAIN.start + Math.floor((tick - PLAIN.start) / TICKS_PER_YEAR) * TICKS_PER_YEAR, extra: 0 };
      const clock = at(week, tick);
      const kind = weatherAt(77, clock);
      // The same for the whole spell, and the same whenever it is asked.
      expect(weatherAt(77, at(week, Math.min(tick + SPELL_TICKS - 1, week.start + TICKS_PER_YEAR - 1)))).toBeDefined();
      expect(weatherAt(77, clock)).toBe(kind);
      const month = dateAt(clock).month;
      seen[month >= 9 && month <= 11 ? 'fall' : month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : 'summer']!.add(kind);
    }
    expect(seen.winter!.has('snow')).toBe(true);
    expect(seen.summer!.has('snow')).toBe(false);
    expect(seen.fall!.has('snow')).toBe(false);
    expect(seen.summer!.has('heat')).toBe(true);
    expect(seen.winter!.has('heat')).toBe(false);
    expect(seen.spring!.has('rain')).toBe(true);
    // A few points at most, either way.
    for (const points of Object.values(WEATHER_POINTS)) expect(Math.abs(points)).toBeLessThanOrEqual(3);
    // Another seed has other weather.
    let differs = 0;
    for (let tick = PLAIN.start; tick < PLAIN.start + TICKS_PER_YEAR; tick += SPELL_TICKS) if (weatherAt(77, at(PLAIN, tick)) !== weatherAt(78, at(PLAIN, tick))) differs += 1;
    expect(differs).toBeGreaterThan(5);
  });

  it('shelter softens bad weather and never good weather', () => {
    const state = campus();
    // Find a wet spell and a sunny one in this seed's year.
    let wet: GameState | null = null;
    let sunny: GameState | null = null;
    for (let tick = state.clock.week.start + 100; tick < state.clock.week.start + 3 * TICKS_PER_DAY; tick += SPELL_TICKS) {
      const copy = structuredClone(state);
      copy.clock.tick = tick;
      const kind = weatherAt(copy.seed, copy.clock);
      if (kind === 'rain' && !wet) wet = copy;
      if (kind === 'sunny' && !sunny) sunny = copy;
    }
    expect(wet).not.toBeNull();
    expect(sunny).not.toBeNull();
    const open = seasonLine(wet!, bare).parts.find((part) => part.id === 'weather')!.points;
    const sheltered = seasonLine(wet!, calm).parts.find((part) => part.id === 'weather')!.points;
    expect(open).toBe(WEATHER_POINTS.rain);
    expect(sheltered).toBeGreaterThan(open);
    expect(sheltered).toBeLessThan(0);
    expect(seasonLine(sunny!, bare).parts.find((part) => part.id === 'weather')!.points).toBe(WEATHER_POINTS.sunny);
    expect(seasonLine(sunny!, calm).parts.find((part) => part.id === 'weather')!.points).toBe(WEATHER_POINTS.sunny);
  });

  it('the whole seasonal line stays inside its caps for every hour of five years', () => {
    let state = campus();
    for (let hour = 0; hour < 5 * 7 * 24; hour += 2) {
      state = run(state, 120).state;
      const happy = campusHappiness(state);
      expect(happy.season.delta).toBeGreaterThanOrEqual(-(STRESS_HAPPINESS + 3 + 1));
      expect(happy.season.delta).toBeLessThanOrEqual(BREAK_LIFT + 1.5);
      expect(happy.season.stress.score).toBeGreaterThanOrEqual(0);
      expect(happy.season.stress.score).toBeLessThanOrEqual(100);
    }
  }, 60_000);
});
