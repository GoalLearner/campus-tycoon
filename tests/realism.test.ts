import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, dateAt, newGame, parseSave, scorecard, studentCard, type GameState } from '../src/sim';
import { ANCHORS, CLASS_YEARS, LATE_FROM, LEAVE_WHYS } from '../src/sim/config/population';
import { campusRates } from '../src/sim/systems/field';
import { anchorAt, classPath, leaveShares, splitCount, standingOf } from '../src/sim/systems/population';
import { afterSwitching, FINAL, INTENDED, majorAt, majorPath } from '../src/sim/systems/majors';
import { MAJORS } from '../src/sim/config/students';
import { attendanceOf, gpaAt, normalCdf, normalInv, shareBelow, weekInClass } from '../src/sim/systems/grades';
import { sleepHours } from '../src/app/regularDay';
import { dayOfAcademicYear, fluOf, fluShare, homesickShare, lonelyChance } from '../src/sim/systems/wellbeing';
import { SEASON_CURVE } from '../src/sim/config/season';
import { campusSocial, relationshipWords, viewOf } from '../src/app/socialView';
import { EVENT } from '../src/sim/config/web';
import { rostersOf, teamFor, teamVenues, teamsYearEnd } from '../src/sim/systems/teams';
import { VARSITY_TEAMS } from '../src/sim/config/teams';
import { tightKnit } from '../src/app/tightKnit';
import { GREEK_HOUSES_MOST } from '../src/sim/config/greek';
import { catchUp as catchUpWeb } from '../src/sim/systems/web';
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

describe('sleep, Stress, homesickness, loneliness and the flu', () => {
  it('sleep about six and a half hours, two nights in three under seven, more at the weekend', () => {
    const cards = sampleStudents(MODEL, 500).map((ref) => studentCard(MODEL, ref)!).filter((card) => card.archetype !== 'allNighter');
    let hours = 0;
    let under = 0;
    let nights = 0;
    let weekendMore = 0;
    for (const card of cards) {
      for (let day = 0; day < 7; day++) {
        const [bed, up] = sleepHours(card, day >= 5);
        hours += up - bed;
        if (up - bed < 7) under += 1;
        nights += 1;
      }
      const [a, b] = sleepHours(card, false);
      const [c, d] = sleepHours(card, true);
      weekendMore += d - c - (b - a);
    }
    // Creswell and others, PNAS 2023: 6 h 37 min, about two thirds of nights under seven hours, half an hour more at weekends.
    expect(Math.abs(hours / nights - 6.62)).toBeLessThan(0.15);
    expect(Math.abs(under / nights - 0.66)).toBeLessThan(0.06);
    expect(weekendMore / cards.length).toBeCloseTo(0.6, 6);
  });

  it('keep the shape of Stress, with a higher everyday hum', () => {
    expect(SEASON_CURVE.term).toBeGreaterThan(0.5);
    expect(SEASON_CURVE.term + SEASON_CURVE.ramp).toBeLessThan(SEASON_CURVE.midterms);
    expect(SEASON_CURVE.midterms).toBeLessThan(SEASON_CURVE.finals);
    expect(SEASON_CURVE.break).toBeLessThan(SEASON_CURVE.term / 3);
  });

  it('miss home most at move-in, less over the fall, more before Thanksgiving', () => {
    const on = (month: number, day: number): number => {
      const state = structuredClone(MODEL);
      const start = state.clock.tick;
      for (let tick = start; tick < start + 7 * 1440; tick += 10) {
        state.clock.tick = tick;
        const date = dateAt(state.clock);
        if (date.month === month && date.day === day) return homesickShare(state.clock);
      }
      throw new Error(`no ${month}/${day}`);
    };
    const moveIn = on(8, 20);
    const october = on(10, 15);
    const early = on(11, 5);
    const beforeThanksgiving = on(11, 23);
    const march = on(3, 15);
    expect(moveIn).toBeGreaterThan(0.85);
    expect(october).toBeLessThan(moveIn / 2);
    expect(beforeThanksgiving).toBeGreaterThan(early);
    expect(march).toBeLessThan(october);
    expect(dayOfAcademicYear(8, 1)).toBe(0);
    expect(dayOfAcademicYear(7, 31)).toBe(364);
  });

  it('feel lonely about half the time, more with nobody close, less with a partner', () => {
    expect(lonelyChance({ close: 0, partnered: false, group: false, firstYear: true, commuter: true })).toBeGreaterThan(0.9);
    expect(lonelyChance({ close: 4, partnered: true, group: true, firstYear: false, commuter: false })).toBeLessThan(0.3);
    const state = at(MODEL, 1).state;
    const web = newWeb(state.seed, 1024);
    catchUpWeb(web, state, webWeekOf(state));
    const social = campusSocial(viewOf(web, false), state);
    // Healthy Minds 2024-25: 51%; ACHA-NCHA 2022: 58%.
    expect(social.lonely).toBeGreaterThan(0.45);
    expect(social.lonely).toBeLessThan(0.6);
    expect(social.homesick).not.toBeNull();
  }, 60_000);

  it('come down with the flu December to February, about a third of them in a season', () => {
    const state = structuredClone(MODEL);
    let most = 0;
    const ill = new Set<number>();
    const start = state.clock.tick;
    for (let tick = start; tick < start + 7 * 1440; tick += 30) {
      state.clock.tick = tick;
      const date = dateAt(state.clock);
      const share = fluShare(state.clock);
      if (date.month >= 3 && date.month <= 11) expect(share).toBe(0);
      most = Math.max(most, share);
      for (let index = 0; index < 600; index++) if (fluOf(state.seed, { entryYear: 1, index }, state.clock).sick) ill.add(index);
    }
    // A University of Minnesota cohort: 37% in one season; a few in a hundred at once at its height.
    expect(ill.size / 600).toBeGreaterThan(0.3);
    expect(ill.size / 600).toBeLessThan(0.44);
    expect(most).toBeGreaterThan(0.015);
    expect(most).toBeLessThan(0.06);
  });
});

describe('relationships and roommates', () => {
  it('put about a third in a relationship, hometown partners included, and card and web agree', () => {
    const state = at(MODEL, 1.6).state;
    const web = newWeb(state.seed, 1024);
    catchUpWeb(web, state, webWeekOf(state));
    const view = viewOf(web, false);
    const cards = sampleStudents(state, 1000).map((ref) => ({ ref, card: studentCard(state, ref)! }));
    const taken = cards.filter(({ ref, card }) => !/single/i.test(relationshipWords(view, state, ref, card.relationship).name)).length / cards.length;
    expect(taken).toBeGreaterThan(0.25);
    expect(taken).toBeLessThan(0.45);
    // Hometown partners are mostly first-years', and fewer by the last year.
    const far = (classYear: number): number => {
      const some = cards.filter(({ card }) => card.classYear === classYear);
      return some.filter(({ card }) => card.relationship.id.startsWith('distance')).length / Math.max(1, some.length);
    };
    expect(far(0)).toBeGreaterThan(far(3));
    // About half of roommates have some friction, fewer are at odds.
    const rooms = campusSocial(view, state).roommates!;
    expect(rooms.friction).toBeGreaterThan(0.4);
    expect(rooms.friction).toBeLessThan(0.6);
    expect(rooms.atOdds).toBeGreaterThan(0.08);
    expect(rooms.atOdds).toBeLessThan(rooms.friction);
  }, 60_000);

  it('move some roommates at odds apart at the spring semester, once, and never back together that year', () => {
    const fall = at(MODEL, 2).state;
    const web = newWeb(fall.seed, 1024);
    catchUpWeb(web, fall, webWeekOf(fall));
    const before = web.events[EVENT.roomSwitch]!;
    const spring = at(fall, 4.2).state;
    catchUpWeb(web, spring, webWeekOf(spring));
    const moved = web.events[EVENT.roomSwitch]! - before;
    // About 3% of students with a roommate a year: a few hundred pairs on a campus this size.
    expect(moved).toBeGreaterThan(100);
    expect(moved).toBeLessThan(1000);
    const again = web.events[EVENT.roomSwitch]!;
    catchUpWeb(web, at(spring, 4.6).state, webWeekOf(at(spring, 4.6).state));
    expect(web.events[EVENT.roomSwitch]).toBe(again);
  }, 90_000);
});

describe('varsity teams and Greek Row', () => {
  it('field a team for each kind of building the campus has: about one in a hundred of a big campus', () => {
    const rosters = rostersOf(MODEL);
    expect(rosters.teams.length).toBeGreaterThanOrEqual(8);
    expect(rosters.share).toBeGreaterThan(0.009);
    expect(rosters.share).toBeLessThan(0.02);
    // Every student on a roster has a team, in proportion to its roster.
    const counts = new Map<number, number>();
    for (let i = 0; i < 20_000; i++) {
      const team = teamFor(rosters, (i / 20_000) * rosters.share);
      expect(team).toBeGreaterThanOrEqual(0);
      counts.set(team, (counts.get(team) ?? 0) + 1);
    }
    expect(teamFor(rosters, rosters.share)).toBe(-1);
    const track = VARSITY_TEAMS.findIndex((team) => team.id === 'track');
    const tennis = VARSITY_TEAMS.findIndex((team) => team.id === 'tennis');
    if (counts.has(track) && counts.has(tennis)) expect(counts.get(track)!).toBeGreaterThan(counts.get(tennis)! * 4);
    // Each team but football practises at a building of its kind.
    const venues = teamVenues(MODEL);
    const placed = [...venues.keys()].map((id) => MODEL.map.placed[id]!);
    for (const one of placed) for (const team of venues.get(one.id)!) expect(team.needs).toBe(one.type);
    // The athletes on the cards say their team.
    const athletes = sampleStudents(MODEL, 4000).map((ref) => studentCard(MODEL, ref)!).filter((card) => card.archetype === 'athlete');
    expect(athletes.length).toBeGreaterThan(5);
    for (const card of athletes) expect(VARSITY_TEAMS.map((team) => team.name)).toContain(card.team);
  });

  it('keep teammates as close as the closest halls, near the top of the tight-knit list', () => {
    const state = at(MODEL, 1).state;
    const web = newWeb(state.seed, 1024);
    catchUpWeb(web, state, webWeekOf(state));
    const list = tightKnit(web, state);
    const teams = list.filter((group) => group.kind === 'team');
    const clubs = list.filter((group) => group.kind === 'club');
    expect(teams.length).toBeGreaterThan(0);
    for (const team of teams) for (const club of clubs) expect(team.share).toBeGreaterThan(club.share);
    expect(teams[0]!.share).toBeGreaterThan(0.25);
  }, 60_000);

  it('tell the seasons at the year’s end, and leave room for a big Greek Row', () => {
    const log: Parameters<typeof teamsYearEnd>[2] = [];
    teamsYearEnd(MODEL, 1, log);
    expect(log[0]!.text).toMatch(/^The varsity seasons are over: .+ \d+-\d+/);
    expect(toneProblem(log[0]!.text)).toBeNull();
    expect(GREEK_HOUSES_MOST).toBe(40);
  });
});
