import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, newGame, parseSave, scorecard, studentCard, type GameState } from '../src/sim';
import { ANCHORS, CLASS_YEARS, LATE_FROM, LEAVE_WHYS } from '../src/sim/config/population';
import { campusRates } from '../src/sim/systems/field';
import { anchorAt, classPath, leaveShares, splitCount, standingOf } from '../src/sim/systems/population';
import { afterSwitching, FINAL, INTENDED, majorAt, majorPath } from '../src/sim/systems/majors';
import { MAJORS } from '../src/sim/config/students';
import { attendanceOf, gpaAt, normalCdf, normalInv, shareBelow, weekInClass } from '../src/sim/systems/grades';
import { sampleStudents } from '../src/sim';
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

describe('majors', () => {
  it('end at the real degree shares, after the real rates of changing major', () => {
    const end = afterSwitching(INTENDED);
    for (let i = 0; i < FINAL.length; i++) expect(end[i]!).toBeCloseTo(FINAL[i]!, 9);
    expect(MAJORS.reduce((sum, major) => sum + major.share, 0)).toBeCloseTo(100, 6);
    // More come intending biology and mathematics than finish in them; business is near where it began.
    const at = (name: string): number => MAJORS.findIndex((major) => major.name === name);
    expect(INTENDED[at('Biology')]!).toBeGreaterThan(FINAL[at('Biology')]!);
    expect(INTENDED[at('Mathematics')]!).toBeGreaterThan(FINAL[at('Mathematics')]! * 1.3);
  });

  it('are undeclared for a third of first-years, declared by the second spring, changed by about a third, doubled by one in twenty', () => {
    const n = 20_000;
    const undeclared = [0, 0, 0, 0];
    let switched = 0;
    let doubled = 0;
    const field: Record<string, number> = {};
    for (let index = 0; index < n; index++) {
      const path = majorPath(11, { entryYear: 4, index });
      for (let semester = 0; semester < 4; semester++) if (majorAt(path, semester).undeclared) undeclared[semester]! += 1;
      if (path.switchAt >= 0) switched += 1;
      const senior = majorAt(path, 7);
      expect(senior.undeclared).toBe(false);
      if (senior.second !== null) {
        doubled += 1;
        expect(senior.shown).toBe(`${MAJORS[senior.subject]!.name} and ${MAJORS[senior.second]!.name}`);
      }
      field[MAJORS[senior.subject]!.field] = (field[MAJORS[senior.subject]!.field] ?? 0) + 1 / n;
    }
    expect(undeclared[0]! / n).toBeGreaterThan(0.3);
    expect(undeclared[0]! / n).toBeLessThan(0.4);
    expect(undeclared[3]).toBe(0);
    expect(switched / n).toBeGreaterThan(0.28);
    expect(switched / n).toBeLessThan(0.36);
    expect(doubled / n).toBeGreaterThan(0.04);
    expect(doubled / n).toBeLessThan(0.06);
    // NCES Digest 322.10: business 18.6%, health 13.1%, biology 6.5%, psychology 6.4%.
    expect(Math.abs(field.business! - 0.186)).toBeLessThan(0.01);
    expect(Math.abs(field.health! - 0.131)).toBeLessThan(0.01);
    expect(Math.abs(field.biology! - 0.065)).toBeLessThan(0.008);
    expect(Math.abs(field.psychology! - 0.064)).toBeLessThan(0.008);
  });

  it('show on the card: undeclared with a leaning, a change of major, and the subject that lectures name', () => {
    const cards = sampleStudents(MODEL, 400).map((ref) => studentCard(MODEL, ref)!);
    const freshmen = cards.filter((card) => card.classYear === 0);
    const undeclared = freshmen.filter((card) => card.major === 'Undeclared');
    expect(undeclared.length).toBeGreaterThan(freshmen.length * 0.25);
    for (const card of undeclared) expect(card.majorNote).toBe(`Leaning toward ${card.subject}`);
    expect(cards.filter((card) => card.classYear >= 2).every((card) => card.major !== 'Undeclared')).toBe(true);
    expect(cards.some((card) => card.majorNote?.startsWith('Switched from '))).toBe(true);
    for (const card of cards) expect(card.subject).not.toBe('Undeclared');
  });
});

describe('grades and classes', () => {
  it('follow the real spread: NPSAS:16 at public doctoral universities', () => {
    // The bands as the source gives them, from the quantiles.
    const band = (lo: number, hi: number): number => shareBelow(hi) - shareBelow(lo);
    expect(shareBelow(1.75)).toBeCloseTo(0.04, 9);
    expect(band(1.75, 2.25)).toBeCloseTo(0.08, 9);
    expect(band(2.25, 2.75)).toBeCloseTo(0.19, 9);
    expect(band(2.75, 3.25)).toBeCloseTo(0.29, 9);
    expect(band(3.25, 3.75)).toBeCloseTo(0.27, 9);
    expect(1 - shareBelow(3.75)).toBeCloseTo(0.13, 9);
    for (const p of [0.01, 0.2, 0.5, 0.9]) expect(shareBelow(gpaAt(p))).toBeCloseTo(p, 9);
    for (const p of [0.001, 0.03, 0.5, 0.97, 0.999]) expect(normalCdf(normalInv(p))).toBeCloseTo(p, 6);
  });

  it('give a model campus the real spread, about a quarter on the Dean’s list, and 6 to 9 in a hundred on probation', () => {
    const cards = sampleStudents(MODEL, 2000).map((ref) => studentCard(MODEL, ref)!);
    const share = (test: (gpa: number) => boolean): number => cards.filter((card) => test(card.gpa)).length / cards.length;
    expect(share((gpa) => gpa < 2.25)).toBeGreaterThan(0.08);
    expect(share((gpa) => gpa < 2.25)).toBeLessThan(0.17);
    expect(share((gpa) => gpa >= 3.75)).toBeGreaterThan(0.08);
    expect(share((gpa) => gpa >= 3.75)).toBeLessThan(0.18);
    const mean = cards.reduce((sum, card) => sum + card.gpa, 0) / cards.length;
    expect(Math.abs(mean - 3.0)).toBeLessThan(0.12);
    const deans = cards.filter((card) => card.deansList).length / cards.length;
    const probation = cards.filter((card) => card.probation).length / cards.length;
    expect(deans).toBeGreaterThan(0.2);
    expect(deans).toBeLessThan(0.31);
    expect(probation).toBeGreaterThan(0.05);
    expect(probation).toBeLessThan(0.1);
    for (const card of cards) expect(card.deansList && card.probation).toBe(false);
  });

  it('are worse on Fridays, in the rain and the morning after a party, and none while sick', () => {
    const ref = { entryYear: 3, index: 77 };
    const plain = weekInClass(5, ref, 'butterfly', 40, { wet: false, partied: false, sickDays: 0 });
    const wet = weekInClass(5, ref, 'butterfly', 40, { wet: true, partied: false, sickDays: 0 });
    const party = weekInClass(5, ref, 'butterfly', 40, { wet: false, partied: true, sickDays: 0 });
    const sick = weekInClass(5, ref, 'butterfly', 40, { wet: false, partied: false, sickDays: 5 });
    expect(wet.went).toBeLessThanOrEqual(plain.went);
    expect(party.went).toBeLessThanOrEqual(plain.went);
    expect(sick.went).toBe(0);
    // About two thirds of seats are filled across a campus, scholars more and slackers less.
    let sum = 0;
    for (let index = 0; index < 4000; index++) sum += attendanceOf(5, { entryYear: 3, index }, 'butterfly');
    expect(sum / 4000).toBeGreaterThan(0.7);
    expect(sum / 4000).toBeLessThan(0.82);
    expect(attendanceOf(5, ref, 'scholar')).toBeGreaterThan(attendanceOf(5, ref, 'slacker'));
  });

  it('are reported at each semester’s end, in the paper too', () => {
    const report = LATER.log.filter((entry) => entry.kind === 'grades').pop()!;
    expect(report.text).toMatch(/^Grades are in: [\d,]+ on the Dean's list and [\d,]+ on academic probation/);
    expect(toneProblem(report.text)).toBeNull();
  });
});
