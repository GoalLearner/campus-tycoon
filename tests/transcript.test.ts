import { describe, expect, it } from 'vitest';
import { advance, applyAction, newGame, sampleStudents, studentCard, type GameState, type LogEntry } from '../src/sim';
import { moodletsOf } from '../src/app/emotion';
import { happeningLine } from '../src/app/socialView';
import { calendarAt } from '../src/sim/calendar';
import { BULLYING_LINES } from '../src/sim/config/bullying';
import { LIBRARY } from '../src/sim/config/storyLibrary';
import { EVENT } from '../src/sim/config/web';
import { mcOnSemester } from '../src/sim/systems/mc';
import { courseHistory, gpaWords, standingOf, termOver, TRANSCRIPT_BELOW } from '../src/sim/systems/registration';
import { semesterOf } from '../src/sim/systems/students';
import { HOUR, T0 } from './helpers';

const MODEL = newGame({ seed: 77, name: 'Test University', now: T0, campus: 'model' });
const SAMPLE = sampleStudents(MODEL, 1500);

describe("one student's grades follow their transcript (R4c, DESIGN.md 82)", () => {
  it("reads a student's average, last term, Dean's list and probation from their transcript, as the card does", () => {
    for (const ref of SAMPLE.slice(0, 200)) {
      const standing = standingOf(MODEL, ref);
      expect(standingOf(MODEL, ref)).toBe(standing);
      const history = courseHistory(MODEL, ref, semesterOf(MODEL), false);
      expect(standing.gpa).toBe(history.gpa);
      const last = history.semesters[history.over - 1]?.gpa ?? null;
      expect(standing.lastTerm).toBe(last);
      expect(standing.deansList).toBe(last !== null && last >= 3.5);
      expect(standing.probation).toBe(history.gpa !== null && history.gpa < 2);
      const words = gpaWords(history);
      expect(words.includes("Dean's list")).toBe(standing.deansList);
      expect(words.includes('on academic probation')).toBe(standing.probation);
    }
  });

  it('works out the transcript only where it could be under 2.0: no student on probation has a card at 3.5 or more', () => {
    let probation = 0;
    for (const ref of SAMPLE) {
      const card = studentCard(MODEL, ref);
      if (!card || !standingOf(MODEL, ref).probation) continue;
      probation++;
      expect(card.gpa, `${ref.entryYear}:${ref.index}`).toBeLessThan(TRANSCRIPT_BELOW);
    }
    expect(probation).toBeGreaterThan(20);
  });

  it("has a family worried about grades only for a student their card shows on probation", () => {
    let worried = 0;
    for (const ref of SAMPLE) {
      const card = studentCard(MODEL, ref)!;
      if (!card) continue;
      const reasons = moodletsOf(null, MODEL, ref, card, 18).map((one) => one.reason);
      if (!reasons.includes('Family worried about grades')) continue;
      worried++;
      expect(standingOf(MODEL, ref).probation).toBe(true);
    }
    expect(worried).toBeGreaterThan(0);
  });

  it("says someone made the Dean's list only when their transcript has them on it", () => {
    const lines = BULLYING_LINES.bullying;
    const at = lines.findIndex((line) => /Dean.s list/.test(line));
    expect(at).toBeGreaterThanOrEqual(0);
    const on = SAMPLE.find((ref) => standingOf(MODEL, ref).deansList)!;
    const off = SAMPLE.find((ref) => standingOf(MODEL, ref).lastTerm !== null && !standingOf(MODEL, ref).deansList)!;
    const other = SAMPLE.find((ref) => ref !== on && ref !== off)!;
    const one = (b: typeof on) => happeningLine(MODEL, { week: 1, event: EVENT.bullying, year: 0, luck: at, people: [other, b] });
    expect(one(on)).toMatch(/Dean.s list/);
    // The next line of its kind instead.
    expect(one(off)).not.toBeNull();
    expect(one(off)).not.toMatch(/Dean.s list/);
  });

  it('counts the spring as over from commencement until the fall begins', () => {
    let tick = MODEL.clock.tick;
    let summer: GameState | null = null;
    for (let n = 0; n < 6000 && !summer; n++) {
      tick += 60;
      const clock = { ...MODEL.clock, tick };
      if (calendarAt(clock).phase === 'summer') summer = { ...MODEL, clock } as GameState;
    }
    expect(summer).not.toBeNull();
    expect(termOver(summer!)).toBe(true);
    expect(termOver(MODEL)).toBe(false);
    const ref = SAMPLE.find((one) => courseHistory(summer!, one).semesters.length >= 2)!;
    const history = courseHistory(summer!, ref);
    expect(history.over).toBe(history.semesters.length);
    expect(standingOf(summer!, ref).lastTerm).toBe(history.semesters.at(-1)!.gpa);
  });
});

describe("the Main Character's grades are their transcript's (R4c, DESIGN.md 82.1)", () => {
  const start = advance(newGame({ seed: 7, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 6 * HOUR).state;
  const ref = sampleStudents(start, 80).find((one) => (studentCard(start, one)?.classYear ?? 0) >= 1 && courseHistory(start, one).semesters.length >= 3)!;
  const made = applyAction(start, { type: 'makeMain', ref });
  if (!made.ok) throw new Error(made.error);
  const close = (study: number, attended: number): { state: GameState; log: LogEntry[] } => {
    const state = structuredClone(made.state);
    state.story.mc!.term = { study: study * 10, steps: 10, attended, classes: 10 };
    const log: LogEntry[] = [];
    mcOnSemester(state, log, true);
    return { state, log };
  };

  it('moves the semester that closed by how much they studied and went, and reads their grades back from the transcript', () => {
    const hard = close(95, 10).state;
    const idle = close(10, 5).state;
    const closed = semesterOf(hard) - 1;
    for (const state of [hard, idle]) {
      const mc = state.story.mc!;
      expect(mc.termShifts?.at(-1)?.[0]).toBe(closed);
      const history = courseHistory(state, mc.ref);
      const plan = history.semesters.find((one) => one.semester === closed)!;
      expect(mc.lastTerm).toBe(Math.round(plan.gpa! * 100) / 100);
      // Their average is the card's: the transcript's over every semester over.
      expect(mc.gpa).toBe(Math.round(history.gpa! * 100) / 100);
      expect(gpaWords(history)).toContain(`${history.gpa!.toFixed(2)} overall`);
    }
    expect(hard.story.mc!.lastTerm!).toBeGreaterThan(idle.story.mc!.lastTerm!);
  });

  it("says the Dean's list and probation only as their transcript has them", () => {
    for (const [study, went] of [
      [95, 10],
      [50, 9],
      [5, 3],
    ] as const) {
      const { state, log } = close(study, went);
      const mc = state.story.mc!;
      const said = [...log.map((one) => one.text), ...mc.memory.map((one) => one.text)].join(' | ');
      expect(/made the Dean's list/.test(said)).toBe(mc.lastTerm! >= 3.5);
      expect(/is on academic probation/.test(said)).toBe(mc.gpa! < 2);
      // Their card reads the same semester the same way.
      expect(standingOf(state, mc.ref).lastTerm).toBeCloseTo(mc.lastTerm!, 2);
    }
  });

  it("leaves probation and the Dean's list to the semester's close in its two stories about grades, and tells them only to a student near either", () => {
    const failing = LIBRARY.find((one) => one.id === 'failingMidterm')!;
    const deans = LIBRARY.find((one) => one.id === 'deansListRun')!;
    expect(failing.needs).toContain('shakyGrades');
    expect(deans.needs).toContain('goodGrades');
    const said = JSON.stringify([failing.stages, deans.stages]);
    expect(said).not.toMatch(/on academic probation|Off probation|made the Dean.s list|A in three classes/);
  });
});
