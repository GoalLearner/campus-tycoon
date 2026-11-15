import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, newGame, parseSave, scorecard, studentCard, type GameState } from '../src/sim';
import { ANCHORS, CLASS_YEARS, LATE_FROM, LEAVE_WHYS } from '../src/sim/config/population';
import { campusRates } from '../src/sim/systems/field';
import { anchorAt, classPath, leaveShares, splitCount, standingOf } from '../src/sim/systems/population';
import { namedRegulars } from '../src/sim/systems/regulars';
import { catchUp, idOf, newWeb, tiesOf, webWeekOf } from '../src/sim/systems/web';
import { edition } from '../src/sim/newspaper';
import { toneProblem } from '../src/sim/config/tone';
import { DAY, T0 } from './helpers';

/**
 * The realism pass, R1 (DESIGN.md 65): the numbers match. Who stays, who finishes and when, and why the others leave,
 * against the real figures the owner approved ("Yes, all ten", 2026-11-14).
 */

const MODEL = newGame({ seed: 20261115, name: 'Test University', now: T0, campus: 'model' });
const at = (state: GameState, days: number): ReturnType<typeof advance> => advance(state, state.clock.lastSimulatedAt, T0 + days * DAY);
/** A year and a half: two commencements, a promotion and a second fall in between. */
const LATER = at(MODEL, 10.5);

describe('a class’s path', () => {
  it('lands on the real figures at each anchor: back for a second year, finished in four years and in six', () => {
    const near = (x: number, y: number): void => expect(Math.abs(x - y)).toBeLessThan(0.01);
    const weak = classPath(ANCHORS.weak);
    near(weak.second, 0.82);
    near(weak.four, 0.46);
    near(weak.six, 0.63);
    const flagship = classPath(ANCHORS.flagship);
    near(flagship.second, 0.92);
    near(flagship.four, 0.57);
    near(flagship.six, 0.76);
    const best = classPath(ANCHORS.best);
    near(best.second, 0.96);
    near(best.four, 0.8);
    near(best.six, 0.91);
    // Between the anchors every rate climbs with standing.
    let last = classPath(anchorAt(0));
    for (let q = 0.05; q <= 1.0001; q += 0.05) {
      const now = classPath(anchorAt(q));
      expect(now.second).toBeGreaterThanOrEqual(last.second - 1e-9);
      expect(now.six).toBeGreaterThanOrEqual(last.six - 1e-9);
      last = now;
    }
  });

  it('rises with the rank and with Happiness, and a model campus opens as a flagship', () => {
    expect(standingOf(10, 70).q).toBeGreaterThan(standingOf(100, 70).q);
    expect(standingOf(100, 80).q).toBeGreaterThan(standingOf(100, 60).q);
    expect(standingOf(5, 90).q).toBeCloseTo(1, 9);
    expect(standingOf(200, 40).q).toBeCloseTo(0, 9);
    const opening = campusRates(MODEL);
    expect(opening.second!).toBeGreaterThan(0.88);
    expect(opening.second!).toBeLessThan(0.94);
    expect(opening.four!).toBeGreaterThan(0.5);
    expect(opening.four!).toBeLessThan(0.62);
  });
});

describe('who leaves, and why', () => {
  it('splits each class year’s leavers by reason, homesickness for first-years only, fewer transfers near the top', () => {
    const stand = standingOf(100, 70);
    for (let classYear = 0; classYear < CLASS_YEARS; classYear++) {
      const shares = leaveShares(MODEL, stand, classYear);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(shares[LEAVE_WHYS.indexOf('housing')]).toBe(0);
      if (classYear > 0) expect(shares[LEAVE_WHYS.indexOf('homesick')]).toBe(0);
    }
    expect(leaveShares(MODEL, stand, 0)[LEAVE_WHYS.indexOf('homesick')]).toBeGreaterThan(0.1);
    const transfer = LEAVE_WHYS.indexOf('transfer');
    expect(leaveShares(MODEL, standingOf(5, 70), 1)[transfer]).toBeLessThan(leaveShares(MODEL, standingOf(150, 70), 1)[transfer]!);
    for (const count of [0, 1, 7, 1234]) expect(splitCount(count, leaveShares(MODEL, stand, 0)).reduce((a, b) => a + b, 0)).toBe(count);
  });

  it('keeps every class’s record whole: who left by reason adds up, and stop-outs come back to their class', () => {
    const state = LATER.state;
    for (const record of state.classes) {
      expect((record.why ?? []).reduce((a, b) => a + b, 0)).toBe(record.left);
    }
    expect(LATER.log.some((entry) => entry.kind === 'returned')).toBe(true);
    expect(state.classes.some((record) => (record.returned ?? 0) > 0)).toBe(true);
    // The semester's line says who left and the most common reasons.
    const line = LATER.log.filter((entry) => entry.kind === 'semester').pop()!;
    expect(line.text).toMatch(/did not come back: [\d,]+ (transferred|stopped out|left for money|were suspended|went home)/);
    expect(toneProblem(line.text)).toBeNull();
  });

  it('is on the Scorecard and in the paper, with what would keep more of them', () => {
    const rows = scorecard(LATER.state)!;
    const retention = rows.find((row) => row.id === 'retention')!;
    expect(retention.value).toMatch(/^\d+% of freshmen come back for a second year$/);
    expect(retention.limit).toMatch(/left; the biggest group .+\(\d[\d,]*\)\. .+ keep/);
    const graduation = rows.find((row) => row.id === 'graduation')!;
    expect(graduation.value).toMatch(/^\d+% finish within six years, \d+% in four$/);
    const semester = LATER.log.filter((entry) => entry.kind === 'semester');
    const paper = edition(LATER.state, semester, { minutes: 600, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    const said = [paper.headline, ...paper.top.map((item) => item.text), ...paper.more];
    expect(said.some((text) => /Transfer|Stop Out|Money|Grades|Homesick/.test(text))).toBe(true);
    for (const text of said) expect(toneProblem(text)).toBeNull();
  });
});

describe('fifth- and sixth-year seniors', () => {
  it('stay on after commencement, a run of their class after the named, and read as Super Seniors', () => {
    const state = LATER.state;
    expect(state.cohorts[4]).toBeGreaterThan(0);
    expect(state.cohorts[5]).toBeGreaterThan(0);
    const year = state.clock.week.year;
    for (const classYear of [4, 5]) {
      const record = state.classes.find((one) => one.entryYear === year - classYear)!;
      const from = record.from!;
      expect(from).toBe(LATE_FROM);
      const card = studentCard(state, { entryYear: year - classYear, index: from })!;
      expect(card.classYear).toBe(classYear);
      expect(card.archetype).toBe('superSenior');
      expect(card.classYearName).toBe(classYear === 4 ? 'Fifth-year senior' : 'Sixth-year senior');
      expect(studentCard(state, { entryYear: year - classYear, index: from - 1 })).toBeNull();
      expect(studentCard(state, { entryYear: year - classYear, index: from + state.cohorts[classYear]! })).toBeNull();
    }
    // The named regulars finish on time: they are among the first of their class.
    for (const ref of namedRegulars(state)) expect(ref.index).toBeLessThan(LATE_FROM);
  });

  it('keep their friends in the web: each class keeps its ring for all six years', () => {
    // Seniors before commencement, with ties; after it and the next fall's promotion, the ones who stayed on still have them.
    const spring = at(MODEL, 4.5).state;
    const web = newWeb(spring.seed, 1024);
    catchUp(web, spring, webWeekOf(spring));
    const year = spring.clock.week.year;
    const seniors: Array<{ entryYear: number; index: number }> = [];
    for (let index = LATE_FROM; index < LATE_FROM + 400; index++) seniors.push({ entryYear: year - 3, index });
    const fall = at(spring, 8.2).state;
    const stayed = seniors.filter((ref) => studentCard(fall, ref)?.classYear === 4);
    expect(stayed.length).toBeGreaterThan(50);
    catchUp(web, fall, webWeekOf(fall));
    const withTies = stayed.filter((ref) => idOf(web, ref) >= 0 && tiesOf(web, ref).length > 0);
    expect(withTies.length).toBeGreaterThan(stayed.length * 0.8);
  });
});

describe('a save from version 30', () => {
  const text = readFileSync(new URL('./fixtures/save-v30-model.json', import.meta.url), 'utf8');

  it('comes through with two more class years, empty, and nothing else moved', () => {
    const old = (JSON.parse(text) as { state: GameState }).state;
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const state = loaded.state;
    expect(state.cohorts).toEqual([...old.cohorts, 0, 0]);
    expect(state.offCampus).toEqual([...old.offCampus, 0, 0]);
    const { cohorts: _a, offCampus: _b, version: _c, ...rest } = state;
    const { cohorts: _d, offCampus: _e, version: _f, ...was } = old;
    expect(rest).toEqual(was);
  });

  it('plays on: its seniors finish or stay on at commencement, and its records keep adding up', () => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const played = advance(loaded.state, loaded.state.clock.lastSimulatedAt, loaded.state.clock.lastSimulatedAt + 4 * DAY).state;
    expect(played.cohorts[3] + played.cohorts[4]).toBeGreaterThan(0);
    for (const record of played.classes) expect(record.entered + (record.returned ?? 0)).toBeGreaterThan(0);
  });
});
