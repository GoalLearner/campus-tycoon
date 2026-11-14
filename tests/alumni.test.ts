import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  alumniClasses,
  alumniPool,
  alumniSuccess,
  budget,
  classNumbers,
  ENDOWED_SHARE,
  giftSize,
  newGame,
  OPENING_CLASSES,
  OPENING_SUCCESS,
  parseSave,
  participation,
  SAVE_VERSION,
  scorecard,
  serialize,
  toneProblem,
  validate,
  type ClassRecord,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { academicInputs } from '../src/sim/systems/field';
import { edition } from '../src/sim/newspaper';
import { moneyView } from '../src/ui/buildUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, T0 } from './helpers';

/**
 * Alumni giving (DESIGN.md 54, as built in section 56): the pool, the drive
 * at each commencement, the endowment link, the Money panel, the alumni
 * success input of the academic rating, and the first Scorecard.
 */

const OPENED = newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' });
const WEEK = 7 * DAY;
const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);
const THREE = (() => {
  let state = OPENED;
  const log: LogEntry[] = [];
  for (let week = 0; week < 3; week++) {
    const run = later(state, WEEK);
    state = run.state;
    log.push(...run.log);
  }
  return { state, log };
})();

describe('the alumni pool', () => {
  it('opens on a model campus with the classes before the player arrived, at middling numbers', () => {
    const opening = OPENED.alumni.opening!;
    // So many classes, each the size of a quarter of the school or its senior class, whichever is larger.
    expect(opening.size).toBe(OPENING_CLASSES * Math.max(OPENED.cohorts[3], Math.round(OPENED.cohorts.reduce((sum, n) => sum + n, 0) / 4)));
    expect(opening.success).toBe(OPENING_SUCCESS);
    expect(alumniPool(OPENED)).toBe(opening.size);
    // A game begun on the small campus has no pool to ask, and no drive.
    expect(freshGame().alumni.opening).toBeNull();
  });

  it('only grows: every graduate joins it, and nobody leaves', () => {
    let state = OPENED;
    let pool = alumniPool(state);
    let graduates = state.stats.graduates;
    for (let week = 0; week < 3; week++) {
      state = later(state, WEEK).state;
      const now = alumniPool(state);
      expect(now).toBeGreaterThanOrEqual(pool);
      // What it grew by is what graduated.
      expect(now - pool).toBe(state.stats.graduates - graduates);
      pool = now;
      graduates = state.stats.graduates;
    }
  });

  it('fixes each graduating class’s success and affinity on its record, for good', () => {
    const classes = alumniClasses(THREE.state);
    expect(classes.length).toBe(3);
    for (const record of classes) {
      expect(record.success).toBeGreaterThan(0);
      expect(record.success).toBeLessThanOrEqual(100);
      expect(record.affinity).toBeGreaterThan(0);
      expect(record.affinity).toBeLessThanOrEqual(100);
    }
    // A week later, the old classes' numbers have not moved.
    const before = classes.map((record) => [record.entryYear, record.success, record.affinity]);
    const next = later(THREE.state, WEEK).state;
    const after = alumniClasses(next).slice(0, 3).map((record) => [record.entryYear, record.success, record.affinity]);
    expect(after).toEqual(before);
  });
});

describe('the drive', () => {
  it('comes every commencement, in the paper, with most of it to the endowment and the rest as cash over the year', () => {
    const drives = THREE.log.filter((entry) => entry.kind === 'alumni');
    expect(drives).toHaveLength(3);
    for (const drive of drives) {
      const raised = Number(drive.data?.raised);
      expect(raised).toBeGreaterThan(0);
      expect(Number(drive.data?.endowed)).toBe(Math.round(raised * ENDOWED_SHARE));
      expect(Number(drive.data?.cash) + Number(drive.data?.endowed)).toBe(raised);
      expect(drive.text).toMatch(/^The alumni drive raised \$[\d,]+ from [\d,]+ of [\d,]+ alumni: \$[\d,]+ to the endowment, and \$[\d,]+ in cash over the year\./);
      expect(toneProblem(drive.text)).toBeNull();
    }
    expect(THREE.state.alumni.totals.drives).toBe(3);
    // The endowment holds what was given to it.
    expect(THREE.state.money.endowment).toBeGreaterThanOrEqual(THREE.state.alumni.totals.endowed);
    // The paper leads with it on a day with nothing bigger.
    const last = drives[drives.length - 1]!;
    const paper = edition(THREE.state, [last], { minutes: 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(paper.headline).toMatch(/^Alumni Give \$/);
  });

  it('shows on the Money panel: an Alumni giving line, the endowment’s part, and the pool in one line', () => {
    const books = budget(THREE.state);
    const line = books.income.find((one) => one.id === 'alumni')!;
    expect(line.name).toBe('Alumni giving');
    expect(line.amount).toBe(THREE.state.alumni.last!.cash);
    expect(books.income.find((one) => one.id === 'endowment')!.detail).toMatch(/Alumni gave \$[\d,]+ of it/);
    const view = moneyView(THREE.state);
    expect(view.alumni).toMatch(/^[\d,]+ alumni\. The last drive raised \$[\d.]+[KMB]?; \$[\d.]+[KMB]? went to the endowment\.$/);
    expect(moneyView(freshGame()).alumni).toBeNull();
    expect(budget(advance(freshGame(), T0, T0 + 2 * WEEK).state).income.some((one) => one.id === 'alumni')).toBe(false);
  });

  it('gives more for each driver: happier, more traditions, more in chapters, more wins, more success', () => {
    // Participation follows affinity, and chapter members give at a higher rate; an Alumni House lifts it a little.
    expect(participation(80, 0, false)).toBeGreaterThan(participation(40, 0, false));
    expect(participation(60, 0.5, false)).toBeGreaterThan(participation(60, 0, false));
    expect(participation(60, 0, true)).toBeGreaterThan(participation(60, 0, false));
    // A gift follows success, and an older class gives a little more.
    expect(giftSize(80, 0)).toBeGreaterThan(giftSize(40, 0));
    expect(giftSize(60, 10)).toBeGreaterThan(giftSize(60, 0));
    // Affinity: each part moves it the right way.
    const state = structuredClone(THREE.state);
    const record: ClassRecord = { entryYear: 1, entered: 1000, finishedOnTime: 900, finishedLate: 0, left: 100 };
    const year = 4;
    state.alumni.years = [1, 2, 3, 4].map((y) => ({ year: y, happy: 120, semesters: 2, kept: 0, wins: 3, games: 10 }));
    const base = classNumbers(state, record, 0, year).affinity;
    const happier = structuredClone(state);
    for (const one of happier.alumni.years) one.happy = 170;
    expect(classNumbers(happier, record, 0, year).affinity).toBeGreaterThan(base);
    const kept = structuredClone(state);
    for (const one of kept.alumni.years) one.kept = 2;
    expect(classNumbers(kept, record, 0, year).affinity).toBeGreaterThan(base);
    expect(classNumbers(state, record, 0.08, year).affinity).toBeGreaterThan(base);
    const wins = structuredClone(state);
    for (const one of wins.alumni.years) one.wins = 8;
    expect(classNumbers(wins, record, 0, year).affinity).toBeGreaterThan(base);
    // Success: finishing on time raises it.
    const onTime = { ...record, finishedOnTime: 990, left: 10 };
    expect(classNumbers(state, onTime, 0, year).success).toBeGreaterThan(classNumbers(state, record, 0, year).success);
  });
});

describe('the academic rating', () => {
  it('reads alumni success at its weight of 15 on a game with goals, and not on the small campus', () => {
    const input = academicInputs(THREE.state).find((one) => one.id === 'alumni')!;
    expect(input.weight).toBe(15);
    expect(input.level).toBeCloseTo(alumniSuccess(THREE.state)!, 9);
    expect(input.detail).toMatch(/^The Class of Year \d+ scored \d+ of 100/);
    // Until a class graduates, the classes before the player arrived fill it in.
    expect(alumniSuccess(OPENED)).toBe(OPENING_SUCCESS);
    expect(academicInputs(freshGame()).some((one) => one.id === 'alumni')).toBe(false);
  });
});

describe('the Scorecard', () => {
  it('has the seven stages as seven rows, each with a number and what limits it most', () => {
    const rows = scorecard(THREE.state)!;
    expect(rows.map((row) => row.name)).toEqual(['Applications', 'Acceptance rate', 'Yield', 'Retention', 'Graduation rate', 'Alumni success', 'Donations']);
    for (const row of rows) {
      expect(row.value.length).toBeGreaterThan(0);
      expect(row.limit.length).toBeGreaterThan(10);
      for (const text of [row.name, row.value, row.limit]) expect(toneProblem(text), text).toBeNull();
    }
    // The faculty ratio is the graduation row's cause (section 38 left it for the Scorecard).
    expect(rows.find((row) => row.id === 'graduation')!.limit).toMatch(/one member of faculty to every \d+ students/);
    expect(scorecard(freshGame())).toBeNull();
  });

  it('points an arrow against the end of last school year, once there is one', () => {
    expect(scorecard(OPENED)!.every((row) => row.trend === null)).toBe(true);
    const rows = scorecard(THREE.state)!;
    expect(THREE.state.alumni.scorecard).not.toBeNull();
    expect(rows.filter((row) => row.trend !== null).length).toBeGreaterThan(3);
    // Acceptance is better lower: a more selective school.
    const accept = rows.find((row) => row.id === 'acceptance')!;
    if (accept.trend && accept.trend.way !== 'same') expect(accept.trend.good).toBe(accept.trend.way === 'down');
  });
});

describe('saves', () => {
  it('keep the pool, the drives and the Scorecard’s last year through a save and a load', () => {
    const loaded = parseSave(serialize(THREE.state, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.alumni).toEqual(THREE.state.alumni);
    expect(loaded.state.classes).toEqual(THREE.state.classes);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBe(28);
  });

  describe('from version 26', () => {
    const text = readFileSync(new URL('./fixtures/save-v26-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: the owner's kind of game, its pool from its seniors and its graduates", () => {
      expect(file.state.version).toBe(26);
      expect(file.state.alumni).toBeUndefined();
      expect(file.state.stats.graduates).toBeGreaterThan(0);
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(26);
      const seniors = Math.max(file.state.cohorts[3], Math.round(file.state.cohorts.reduce((sum, n) => sum + n, 0) / 4));
      expect(loaded.state.alumni.opening).toEqual({ size: OPENING_CLASSES * seniors + file.state.stats.graduates, success: OPENING_SUCCESS, affinity: 50 });
      expect(loaded.state.alumni.last).toBeNull();
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.alumni = loaded.state.alumni;
      // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
      expected.story = newStory();
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      const week = advance(loaded.state, file.savedAt, file.savedAt + 7 * DAY);
      expect(validate(week.state)).toBeNull();
      expect(week.log.filter((entry) => entry.kind === 'alumni')).toHaveLength(1);
      const notes = upgradeNotes(26);
      expect(notes).toHaveLength(2);
      expect(notes[0]).toMatch(/alumni/);
      expect(toneProblem(notes[0]!)).toBeNull();
    });
  });
});
