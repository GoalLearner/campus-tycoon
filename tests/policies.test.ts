import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  academicRating,
  advance,
  applyAction,
  approvalAt,
  awayLines,
  budget,
  campusHappiness,
  campusLevels,
  capacity,
  CAUSE_NAMES,
  causeShifts,
  donorName,
  driversNow,
  edition,
  effectWords,
  enrollment,
  eraOf,
  eraOpens,
  ERAS,
  examsOff,
  EXAMS_AT_MIDTERMS,
  EXAMS_MOST,
  fansMore,
  freeSeats,
  housedByPolicy,
  housedIfOn,
  landRankGoals,
  leavingMore,
  libraryShare,
  mischiefTimes,
  newGame,
  nextEra,
  occupiedBeds,
  offCampusNow,
  openCapacity,
  parseSave,
  POLICIES,
  policiesAt,
  policiesOpen,
  policyIncome,
  policyLocked,
  policyOn,
  policySpec,
  policyWords,
  ratingShift,
  roomForNewStudents,
  SAVE_VERSION,
  serialize,
  stressRead,
  SURNAME_ENDS,
  SURNAME_STARTS,
  teachingQuality,
  toneProblem,
  upkeepMore,
  validate,
  type GameState,
  type LogEntry,
  type PolicyEffect,
  type PolicySpec,
} from '../src/sim';
import { semesterEnd } from '../src/sim/systems/admissions';
import { fanDemand, footballBooks } from '../src/sim/systems/football';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { happinessView } from '../src/ui/buildUi';
import { eraNextLine, policiesView, policyChip } from '../src/ui/policyUi';
import { sizeView } from '../src/ui/sizeUi';
import { DAY, freshGame, MIN, T0 } from './helpers';

const WEEK = 7 * DAY;
const model = (seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });

/** A model campus a day and a half into its first fall. */
function opened(seed = 35): GameState {
  return advance(model(seed), T0, T0 + 1.5 * DAY).state;
}

/** That campus at a rank, with every rank goal down to it reached, and what was said as each landed. */
function ranked(rank: number, start = opened()): { state: GameState; log: LogEntry[] } {
  const state = structuredClone(start);
  state.field.rank = rank;
  state.field.rankYear = 1;
  const log: LogEntry[] = [];
  landRankGoals(state, log);
  return { state, log };
}

const growth = (): GameState => ranked(120).state;
const flagship = (): GameState => ranked(70).state;
const legacy = (): GameState => ranked(20).state;

function flip(state: GameState, id: string, on = true): GameState {
  const result = applyAction(state, { type: 'policy', id, on });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const turnOn = (state: GameState, ...ids: string[]): GameState => ids.reduce((now, id) => flip(now, id), state);
const facts = (state: GameState) => ({ minutes: 600, cashBefore: state.money.cash, cashAfter: state.money.cash, studentsBefore: enrollment(state), studentsAfter: enrollment(state) });
const cause = (state: GameState, id: string) => campusHappiness(state).causes.find((one) => one.id === id)!;
const lotOf = (state: GameState, zone: 'housing' | 'academic'): number => {
  const lot = state.map.buildings.find((building) => building && building.zone === zone && building.stage >= 1)!;
  return lot.y * state.map.width + lot.x;
};

describe('the list of policies', () => {
  it('is eight, in the three eras, each with one gain and one named cost in plain words', () => {
    expect(POLICIES.map((spec) => spec.name)).toEqual([
      'Reading days before finals',
      'Tough grading',
      'Freshmen live on campus',
      'Free student section',
      'All-night library',
      'Parking fees',
      'Quiet hours',
      'Naming rights',
    ]);
    expect(policiesAt(1)).toHaveLength(4);
    expect(policiesAt(2).map((spec) => spec.id)).toEqual(['allNightLibrary', 'parkingFees']);
    expect(policiesAt(3).map((spec) => spec.id)).toEqual(['quietHours', 'namingRights']);
    expect(new Set(POLICIES.map((spec) => spec.id)).size).toBe(POLICIES.length);
    for (const spec of POLICIES) {
      expect(spec.gives.length, spec.id).toBeGreaterThan(3);
      expect(spec.takes.length, spec.id).toBeGreaterThan(3);
      expect(spec.gains.length, spec.id).toBeGreaterThan(0);
      expect(spec.costs.length, spec.id).toBeGreaterThan(0);
      // Its lines read as sentences, with a full stop and no instruction.
      for (const line of [spec.begins, spec.ends]) expect(line.endsWith('.'), line).toBe(true);
    }
  });

  it('keeps to the tone guide in every word, and says Happiness and Stress', () => {
    const state = legacy();
    for (const spec of POLICIES) {
      const words = policyWords(state, spec);
      for (const text of [spec.name, spec.gives, spec.takes, spec.begins, spec.ends, ...words.gain, ...words.cost]) {
        expect(toneProblem(text), text).toBeNull();
        expect(/approval/i.test(text), text).toBe(false);
      }
    }
  });

  it('says every effect in numbers, whatever its kind', () => {
    const state = legacy();
    const kinds = new Set<PolicyEffect['kind']>();
    for (const spec of POLICIES) {
      for (const effect of [...spec.gains, ...spec.costs]) {
        kinds.add(effect.kind);
        expect(effectWords(state, effect), `${spec.id} ${effect.kind}`).toMatch(/\d/);
      }
    }
    // Every kind of effect there is has a policy that uses it.
    expect([...kinds].sort()).toEqual(['cause', 'exams', 'fans', 'freeSeats', 'income', 'leaving', 'mischief', 'rating', 'spareBeds', 'upkeep']);
  });
});

describe('an era opens its switches', () => {
  it('has none before the Growth era, and none ever on a game begun on the small campus', () => {
    const state = opened();
    expect(eraOf(state.goals)).toBe(0);
    expect(policiesOpen(state)).toEqual([]);
    expect(policiesView(state)).toBeNull();
    expect(policyChip(state)).toBeNull();
    const refused = applyAction(state, { type: 'policy', id: 'toughGrading', on: true });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe('Tough grading opens with the Growth era, at the Top 125.');

    const small = advance(freshGame(), T0, T0 + 3 * WEEK).state;
    expect(small.goals).toBeNull();
    expect(small.policies).toEqual({ on: [], locked: [], news: [] });
    expect(policiesOpen(small)).toEqual([]);
    expect(policiesView(small)).toBeNull();
    expect(policyChip(small)).toBeNull();
    expect(eraNextLine(small)).toBe('');
    expect(applyAction(small, { type: 'policy', id: 'toughGrading', on: true }).ok).toBe(false);
    expect(applyAction(small, { type: 'policy', id: 'nothing', on: true }).ok).toBe(false);
  });

  it('opens four at Growth, two more at Flagship and two more at Legacy, every one off', () => {
    expect(policiesOpen(ranked(126).state)).toHaveLength(0);
    expect(policiesOpen(growth()).map((spec) => spec.id)).toEqual(['readingDays', 'toughGrading', 'freshmenOnCampus', 'freeStudentSection']);
    expect(policiesOpen(flagship())).toHaveLength(6);
    expect(policiesOpen(legacy())).toHaveLength(8);
    for (const state of [growth(), flagship(), legacy()]) {
      expect(state.policies.on).toEqual([]);
      expect(policiesView(state)!.rows.every((row) => !row.on && !row.locked)).toBe(true);
      expect(policyChip(state)).toBe('Policies');
    }
    // A switch of an era not yet reached is refused, with the era and the rank that opens it.
    const early = applyAction(growth(), { type: 'policy', id: 'parkingFees', on: true });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toBe('Parking fees opens with the Flagship era, at the Top 75.');
    const later = applyAction(flagship(), { type: 'policy', id: 'namingRights', on: true });
    if (!later.ok) expect(later.error).toBe('Naming rights opens with the Legacy era, at the Top 25.');
    expect(later.ok).toBe(false);
  });

  it('adds only: an era takes nothing a game could do before it', () => {
    // The same build menu, the same actions and the same numbers the day before and the day after Growth.
    const before = ranked(126).state;
    const after = growth();
    expect(budget(after).kept).toBeCloseTo(budget(before).kept, 6);
    expect(campusHappiness(after).base).toBeCloseTo(campusHappiness(before).base, 6);
    expect(academicRating(after)).toBe(academicRating(before));
    for (const action of [
      { type: 'instruction', step: 3 },
      { type: 'marketing', step: 1 },
      { type: 'ticketPrice', step: 1 },
    ] as const) {
      expect(applyAction(before, action).ok).toBe(true);
      expect(applyAction(after, action).ok).toBe(true);
    }
  });

  it('says what it opens the day it begins, in the goal, the headline and a line that leads to the page', () => {
    const { state, log } = ranked(120);
    const goal = log.find((entry) => entry.kind === 'goal')!;
    expect(goal.text.endsWith('The Growth era begins. It opens the Policies page, with four switches: Reading days before finals, Tough grading, Freshmen live on campus and Free student section.')).toBe(true);
    expect(goal.data?.era).toBe(1);
    const paper = edition(state, log, facts(state));
    expect(paper.headline.startsWith('The Growth Era Begins at Test')).toBe(true);
    expect(paper.deck).toBe(goal.text);
    const lead = [...paper.top].find((item) => item.go === 'policies')!;
    expect(lead.text).toBe('4 new switches are on the Policies page. All are off until you turn them on.');
    for (const text of [paper.headline, paper.deck, ...paper.top.map((item) => item.text)]) expect(toneProblem(text), text).toBeNull();

    // The later eras say theirs too.
    const second = ranked(70, state).log.find((entry) => entry.kind === 'goal')!;
    expect(second.text.endsWith('The Flagship era begins. It opens two more policies: All-night library and Parking fees.')).toBe(true);
    const third = ranked(20, ranked(70, state).state).log.find((entry) => entry.kind === 'goal')!;
    expect(third.text.endsWith('The Legacy era begins. It opens two more policies: Quiet hours and Naming rights.')).toBe(true);
    // A day that opens two eras at once says both.
    const both = ranked(20, state).log.find((entry) => entry.kind === 'goal')!;
    expect(both.text).toContain('The Flagship era begins. It opens two more policies: All-night library and Parking fees.');
    expect(both.text).toContain('The Legacy era begins. It opens two more policies: Quiet hours and Naming rights.');
    // An edition with no era in it has no such line.
    expect(edition(state, [], facts(state)).top.some((item) => item.go === 'policies')).toBe(false);
  });

  it('is named ahead of time on the Goals page: what the next era will open, and at which rank', () => {
    const start = opened();
    expect(nextEra(start)).toEqual({ era: 1, name: 'Growth', top: 125, opens: eraOpens(1) });
    expect(sizeView(start).era).toBe('Era: Arrival');
    expect(sizeView(start).eraNext).toBe('The Growth era, at the Top 125, opens the Policies page, with four switches: Reading days before finals, Tough grading, Freshmen live on campus and Free student section.');
    expect(sizeView(growth()).eraNext).toBe('The Flagship era, at the Top 75, opens two more policies: All-night library and Parking fees.');
    expect(sizeView(flagship()).eraNext).toBe('The Legacy era, at the Top 25, opens two more policies: Quiet hours and Naming rights.');
    expect(sizeView(legacy()).eraNext).toBe('');
    expect(nextEra(legacy())).toBeNull();
    // The Policies page says the same under its switches, and nothing once every era is open.
    expect(policiesView(growth())!.next).toBe(sizeView(growth()).eraNext);
    expect(policiesView(legacy())!.next).toBe('');
    expect(sizeView(freshGame()).eraNext).toBe('');
    expect(ERAS).toEqual(['Arrival', 'Growth', 'Flagship', 'Legacy']);
  });
});

describe('a switch', () => {
  it('says its gain and its cost before it is turned on, in words and in this campus\'s numbers', () => {
    const view = policiesView(legacy())!;
    expect(view.rows).toHaveLength(8);
    for (const row of view.rows) {
      const spec = policySpec(row.id)!;
      expect(row.gain).toBe(spec.gives);
      expect(row.cost).toBe(spec.takes);
      expect(row.gainLines.length).toBe(spec.gains.length);
      expect(row.costLines.length).toBe(spec.costs.length);
      for (const line of [...row.gainLines, ...row.costLines]) expect(line).toMatch(/\d/);
    }
    const row = (id: string) => view.rows.find((one) => one.id === id)!;
    const state = legacy();
    expect(row('parkingFees').gainLines).toEqual([`$${(driversNow(state) * 450).toLocaleString('en-US')} a year: ${driversNow(state).toLocaleString('en-US')} students who drive at $450`]);
    expect(row('parkingFees').costLines).toEqual([`Food & fun −18 for the ${driversNow(state).toLocaleString('en-US')} students who drive`]);
    expect(row('readingDays').gainLines).toEqual(['Stress −20 in finals week']);
    expect(row('readingDays').costLines).toEqual(['Class size −1 in the academic rating: fewer teaching days']);
    expect(row('toughGrading').gainLines).toEqual(['Reputation +6 in the academic rating: a degree here is harder to earn']);
    expect(row('toughGrading').costLines[0]).toMatch(/^0\.4% more of each class leaves each semester: about \d+ students\. Fewer of each class graduate, and the rating remembers$/);
    expect(row('quietHours').gainLines).toEqual(['75% less mischief in the dorms']);
    expect(row('namingRights').gainLines).toEqual([`$3,500,000 a year: from the ${donorName(state)} family, every year their name is up`]);
    expect(row('freeStudentSection').gainLines).toEqual(['20% more fans want a seat', 'Food & fun +3']);
  });

  it('stays put once changed, until the next class moves in', () => {
    const start = growth();
    const on = flip(start, 'toughGrading');
    expect(policyOn(on, 'toughGrading')).toBe(true);
    expect(policyLocked(on, 'toughGrading')).toBe(true);
    expect(policiesView(on)!.rows.find((row) => row.id === 'toughGrading')).toMatchObject({ on: true, locked: true });
    expect(policyChip(on)).toBe('Policies · 1 on');
    // It cannot be turned off again yet, and says why. Another switch is free.
    const back = applyAction(on, { type: 'policy', id: 'toughGrading', on: false });
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.error).toBe('Tough grading was just changed. It stays as it is until the next class moves in.');
    expect(policyLocked(on, 'readingDays')).toBe(false);
    // Asking for what it already is changes nothing and locks nothing.
    const same = applyAction(start, { type: 'policy', id: 'toughGrading', on: false });
    expect(same.ok && same.changed === 0 && same.state === start).toBe(true);

    // It is a class moving in that frees it, not a clock: a day later it is still held, and the spring class frees it.
    const held = advance(on, on.clock.lastSimulatedAt, on.clock.lastSimulatedAt + DAY);
    expect(held.log.some((entry) => entry.kind === 'intake')).toBe(false);
    expect(policyLocked(held.state, 'toughGrading')).toBe(true);
    const spring = advance(on, on.clock.lastSimulatedAt, T0 + 3 * DAY + 5 * MIN);
    expect(spring.log.some((entry) => entry.kind === 'intake')).toBe(true);
    expect(policyLocked(spring.state, 'toughGrading')).toBe(false);
    expect(policyOn(spring.state, 'toughGrading')).toBe(true);
    const off = flip(spring.state, 'toughGrading', false);
    expect(policyOn(off, 'toughGrading')).toBe(false);
    expect(policyLocked(off, 'toughGrading')).toBe(true);

    // Left alone for years, a switch never changes itself and nothing is asked of the player.
    const years = advance(on, on.clock.lastSimulatedAt, on.clock.lastSimulatedAt + 5 * WEEK).state;
    expect(years.policies.on).toEqual(['toughGrading']);
    expect(years.policies.locked).toEqual([]);
    expect(validate(years)).toBeNull();
  });

  it('gets one line in the paper when it is turned on, and one when it is turned off', () => {
    const on = turnOn(legacy(), 'parkingFees', 'namingRights');
    expect(on.policies.news).toHaveLength(2);
    const next = advance(on, on.clock.lastSimulatedAt, on.clock.lastSimulatedAt + MIN);
    const told = next.log.filter((entry) => entry.kind === 'policy');
    expect(told.map((entry) => entry.text)).toEqual(['Parking fees begin: students who drive pay for a space.', `Naming rights are sold: the ${donorName(on)} name goes up around campus.`]);
    expect(next.state.policies.news).toEqual([]);
    // Said once: the minute after has nothing more to say.
    expect(advance(next.state, next.state.clock.lastSimulatedAt, next.state.clock.lastSimulatedAt + MIN).log.filter((entry) => entry.kind === 'policy')).toEqual([]);
    const lines = awayLines(next.log, facts(next.state)).map((line) => line.text);
    for (const entry of told) expect(lines).toContain(entry.text);
    const paper = edition(next.state, next.log, facts(next.state));
    const printed = [...paper.top.map((item) => item.text), ...paper.more];
    for (const entry of told) {
      expect(printed).toContain(entry.text);
      expect(toneProblem(entry.text), entry.text).toBeNull();
    }
    // Turned off after the next class: the other line.
    const spring = advance(next.state, next.state.clock.lastSimulatedAt, T0 + 3 * DAY + 5 * MIN).state;
    const off = flip(spring, 'namingRights', false);
    const after = advance(off, off.clock.lastSimulatedAt, off.clock.lastSimulatedAt + MIN);
    expect(after.log.filter((entry) => entry.kind === 'policy').map((entry) => entry.text)).toEqual([`Naming rights end: the ${donorName(on)} name comes down.`]);
  });

  it('names a donor made from the game\'s own halves of a surname, the same for a seed', () => {
    const state = legacy();
    const donor = donorName(state);
    expect(SURNAME_STARTS.some((start) => donor.startsWith(start))).toBe(true);
    expect(SURNAME_ENDS.some((end) => donor.endsWith(end))).toBe(true);
    expect(donorName(ranked(20, opened(35)).state)).toBe(donor);
    const others = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => donorName(model(seed))));
    expect(others.size).toBeGreaterThan(3);
  });
});

describe('no fifth cause', () => {
  it('puts what a policy does to Happiness inside the cause it belongs to, named on that cause', () => {
    const off = legacy();
    const on = turnOn(off, 'parkingFees', 'quietHours', 'namingRights', 'freeStudentSection', 'freshmenOnCampus');
    const before = campusHappiness(off);
    const after = campusHappiness(on);
    // The same four causes, in the same order, and the same lines for the week: nothing new beside them.
    expect(after.causes.map((one) => one.id)).toEqual(['walk', 'grounds', 'life', 'safety']);
    expect(after.causes.map((one) => one.id)).toEqual(before.causes.map((one) => one.id));
    expect(after.season.parts.map((part) => part.id)).toEqual(before.season.parts.map((part) => part.id));
    expect(before.causes.every((one) => one.policies === undefined)).toBe(true);
    // Each is on its cause, and the cause's level has moved by exactly what is named on it.
    const names = (id: string) => (cause(on, id).policies ?? []).map((note) => note.name).sort();
    expect(names('life')).toEqual(['Free student section', 'Parking fees', 'Quiet hours']);
    expect(names('grounds')).toEqual(['Freshmen live on campus', 'Naming rights']);
    expect(cause(on, 'walk').policies).toBeUndefined();
    expect(cause(on, 'safety').policies).toBeUndefined();
    for (const id of ['life', 'grounds']) {
      const moved = (cause(on, id).policies ?? []).reduce((sum, note) => sum + note.delta, 0);
      expect(cause(on, id).level).toBeCloseTo(cause(off, id).level + moved, 6);
    }
    expect(cause(on, 'walk').level).toBeCloseTo(cause(off, 'walk').level, 9);
    // The four causes alone are what the share who stay follows, so a policy's cost reaches it.
    expect(after.base).toBeLessThan(before.base);
    expect(after.retention).toBeLessThan(before.retention);
    expect(after.retention).toBeCloseTo(0.95 + 0.045 * (after.base / 100), 9);
  });

  it('reads the same on a student\'s lot as on the campus panel, and is named on the panel\'s line', () => {
    const off = legacy();
    const on = turnOn(off, 'namingRights', 'parkingFees');
    // Naming rights is everyone's: three points of Grounds at every dorm and every lecture hall.
    for (const zone of ['housing', 'academic'] as const) {
      const cell = lotOf(on, zone);
      const was = approvalAt(off, cell).causes.find((one) => one.id === 'grounds')!;
      const now = approvalAt(on, cell).causes.find((one) => one.id === 'grounds')!;
      expect(now.level).toBeCloseTo(Math.max(0, was.level - 0.03), 9);
      expect(now.policies!.map((note) => note.name)).toEqual(['Naming rights']);
    }
    // Parking fees is for those who drive. They live in town and are read at the lecture halls, by their share.
    const share = driversNow(on) / offCampusNow(on);
    expect(share).toBeGreaterThan(0.2);
    expect(causeShifts(on, 'academic').find((shift) => shift.id === 'parkingFees')!.delta).toBeCloseTo(-0.18 * share, 9);
    expect(causeShifts(on, 'housing').some((shift) => shift.id === 'parkingFees')).toBe(false);
    const dorm = approvalAt(on, lotOf(on, 'housing')).causes.find((one) => one.id === 'life')!;
    expect(dorm.policies).toBeUndefined();
    // The panel: each policy on its cause's line, with what it takes, and the campus number is the average of the lots.
    const view = happinessView(on);
    expect(view.rows.find((row) => row.id === 'grounds')!.notes).toEqual(['Naming rights −3']);
    expect(view.rows.find((row) => row.id === 'life')!.notes[0]).toMatch(/^Parking fees −\d/);
    expect(view.rows.find((row) => row.id === 'walk')!.notes).toEqual([]);
    expect(happinessView(off).rows.every((row) => row.notes.length === 0)).toBe(true);
  });

  it('takes what a policy does to Stress off the top in exam weeks, named beside Stress, with no line of its own', () => {
    const off = legacy();
    const on = turnOn(off, 'readingDays');
    const levels = campusLevels(off);
    const finalsOff = stressRead(off, levels, 1);
    const finals = stressRead(on, levels, 1);
    expect(finals.score).toBe(finalsOff.score - 20);
    expect(finals.policy).toBe(20);
    expect(finals.policyBy).toEqual(['Reading days before finals']);
    expect(finals.cause).toBe(finalsOff.cause);
    expect(finals.factor).toBe(finalsOff.factor);
    // A share of it at midterms, and nothing in an ordinary week or on a break.
    expect(stressRead(on, levels, 0.75).score).toBe(stressRead(off, levels, 0.75).score - 20 * EXAMS_AT_MIDTERMS);
    for (const season of [0.6, 0.3, 0.1]) {
      expect(stressRead(on, levels, season).score).toBe(stressRead(off, levels, season).score);
      expect(stressRead(on, levels, season).policy).toBe(0);
    }
    expect(finalsOff.policy).toBe(0);
    expect(finalsOff.policyBy).toEqual([]);
  });
});

describe('each policy, in its own numbers', () => {
  it('Reading days before finals: lower Stress at exams, and class size in the rating a little lower', () => {
    const off = legacy();
    const on = turnOn(off, 'readingDays');
    const size = (state: GameState) => academicInputs(state).find((input) => input.id === 'classSize')!;
    expect(size(on).level).toBeCloseTo(size(off).level! - 1, 9);
    expect(size(on).detail).toBe(`${size(off).detail}. Reading days before finals: −1, fewer teaching days`);
    expect(ratingShift(on, 'classSize')).toEqual({ points: -1, notes: ['Reading days before finals: −1, fewer teaching days'] });
    expect(ratingShift(on, 'reputation').points).toBe(0);
    // Grades follow: the teaching a student card reads its marks from is a little lower.
    expect(teachingQuality(on)).toBeLessThan(teachingQuality(off));
    expect(teachingQuality(off) - teachingQuality(on)).toBeLessThan(0.02);
    expect(academicRating(on)).toBeLessThan(academicRating(off));
    // The semester's average Stress is lower for it, so it reaches how many students stay.
    const end = T0 + 3 * DAY - 10 * MIN;
    const calm = advance(on, on.clock.lastSimulatedAt, end).state;
    const plain = advance(off, off.clock.lastSimulatedAt, end).state;
    const average = (state: GameState) => state.term.stressSum / Math.max(1, state.term.lastTick - state.term.since);
    expect(average(calm)).toBeLessThan(average(plain) - 0.5);
  });

  it('All-night library: softer finals for students with a library in reach, and each library costs more', () => {
    const off = legacy();
    const on = turnOn(off, 'allNightLibrary');
    const share = libraryShare(off);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(1);
    expect(examsOff(on, 1, () => share).points).toBeCloseTo(20 * share, 9);
    expect(examsOff(on, 1, () => 0)).toEqual({ points: 0, by: [] });
    expect(examsOff(on, 0.3, () => share).points).toBe(0);
    const levels = campusLevels(off);
    expect(stressRead(on, levels, 1).score).toBe(stressRead(off, levels, 1).score - Math.round(20 * share));
    // Both together never take more than the most.
    const both = turnOn(on, 'readingDays');
    expect(examsOff(both, 1, () => 1).points).toBe(EXAMS_MOST);
    expect(examsOff(both, 1, () => 1).by).toEqual(['Reading days before finals', 'All-night library']);

    const libraries = off.map.placed.filter((placed) => placed && (placed.type === 'library' || placed.type === 'computerLab')).length;
    expect(libraries).toBeGreaterThan(0);
    expect(upkeepMore(on)).toEqual({ amount: libraries * 4_000 * 28, notes: [`All-night library: $${(libraries * 112_000).toLocaleString('en-US')} more`] });
    expect(budget(on).spending).toBeCloseTo(budget(off).spending + libraries * 112_000, 2);
    const line = budget(on).groups.flatMap((group) => group.lines).find((one) => one.id === 'upkeep')!;
    expect(line.detail).toContain('All-night library: $');
    expect(budget(on).incomeTotal).toBe(budget(off).incomeTotal);
  });

  it('Tough grading: reputation in the rating is higher, and a few more of each class leave each semester', () => {
    const start = legacy();
    // Reputation exists from the first rankings day.
    start.field.reputation = 50;
    const on = turnOn(start, 'toughGrading');
    const reputation = (state: GameState) => academicInputs(state).find((input) => input.id === 'reputation')!;
    expect(reputation(start).level).toBe(50);
    expect(reputation(on).level).toBe(56);
    expect(reputation(on).detail).toBe('A slow average of past ratings. Tough grading: +6, a degree here is harder to earn');
    expect(on.field.reputation).toBe(50);
    expect(academicRating(on)).toBeGreaterThan(academicRating(start));

    expect(leavingMore(on)).toEqual({ share: 0.004, by: ['Tough grading'] });
    expect(leavingMore(start)).toEqual({ share: 0, by: [] });
    const plain = structuredClone(start);
    const tough = structuredClone(on);
    const plainLog: LogEntry[] = [];
    const toughLog: LogEntry[] = [];
    semesterEnd(plain, plainLog);
    semesterEnd(tough, toughLog);
    const more = tough.admissions.lastSemester!.left - plain.admissions.lastSemester!.left;
    expect(more).toBeGreaterThan(150);
    expect(more).toBeLessThan(200);
    expect(toughLog[0]!.text).toMatch(/ Tough grading: \d+ of them\.$/);
    expect(Number(toughLog[0]!.data?.policy)).toBeCloseTo(more, -1);
    expect(plainLog[0]!.text).not.toContain('Tough grading');
    expect(plainLog[0]!.data?.policy).toBe(0);
    expect(happinessView(on).staying).toMatch(/ Tough grading: 0\.4% fewer\.$/);
    expect(happinessView(start).staying).not.toContain('Tough grading');
  });

  it('Freshmen live on campus: those from town fill the beds nobody is in, pay for them, and keep nobody out', () => {
    const off = growth();
    const spare = openCapacity(off, 'housing') - (enrollment(off) - offCampusNow(off));
    expect(spare).toBeGreaterThan(0);
    expect(housedIfOn(off)).toBe(Math.min(off.offCampus[0], spare));
    expect(housedByPolicy(off)).toBe(0);
    const on = turnOn(off, 'freshmenOnCampus');
    const housed = housedByPolicy(on);
    expect(housed).toBe(housedIfOn(off));
    expect(housed).toBeGreaterThan(0);
    expect(occupiedBeds(on)).toBe(occupiedBeds(off) + housed);
    expect(occupiedBeds(on)).toBeLessThanOrEqual(openCapacity(on, 'housing'));
    const rooms = (state: GameState) => budget(state).income.find((line) => line.id === 'rooms')!;
    expect(rooms(on).amount).toBe(rooms(off).amount + housed * 3000);
    expect(rooms(on).detail).toContain(`Freshmen live on campus: ${housed.toLocaleString('en-US')} of them are freshmen from town`);
    // A class moving in has every bed it would have had: they take only what is left over.
    expect(roomForNewStudents(on)).toEqual(roomForNewStudents(off));
    const beds = (state: GameState) => capacity(state).needs.find((need) => need.id === 'beds')!;
    expect(beds(on).line).toContain(`Freshmen live on campus: ${housed.toLocaleString('en-US')}`);
    expect(beds(on).status).toBe(beds(off).status);
    expect(beds(off).line).not.toContain('Freshmen');
    // Its cost is inside Grounds, at the dorms, by the share of those who live there that it housed.
    const shift = causeShifts(on, 'housing').find((one) => one.id === 'freshmenOnCampus')!;
    expect(shift.cause).toBe('grounds');
    expect(shift.delta).toBeCloseTo(-0.3 * (housed / (enrollment(on) - offCampusNow(on) + housed)), 9);
    expect(causeShifts(on, 'academic').some((one) => one.id === 'freshmenOnCampus')).toBe(false);
    // With the dorms full there is nobody to house, and it costs nothing.
    const full = structuredClone(on);
    full.offCampus[0] = 0;
    expect(housedByPolicy(full)).toBe(0);
    expect(causeShifts(full, 'housing')).toEqual([]);
  });

  it('Free student section: more fans, a little Happiness, and a quarter of the seats earn no ticket', () => {
    const off = growth();
    const on = turnOn(off, 'freeStudentSection');
    expect(fansMore(on)).toBe(0.2);
    expect(fansMore(off)).toBe(0);
    expect(fanDemand(on) / fanDemand(off)).toBeCloseTo(1.2, 2);
    expect(freeSeats(on)).toEqual({ share: 0.25, by: ['Free student section'] });
    const was = footballBooks(off);
    const now = footballBooks(on);
    expect(now.crowd).toBe(was.crowd);
    expect(was.tickets).toBeGreaterThan(0);
    // What the crowd spends inside is still earned: only the ticket part falls, by a quarter.
    const inside = 5.5 * was.crowd * 3;
    expect(now.tickets - inside).toBeCloseTo((was.tickets - inside) * 0.75, 4);
    const line = budget(on).income.find((one) => one.id === 'tickets')!;
    expect(line.detail).toContain('Free student section: 25% of the seats are free');
    expect(budget(off).income.find((one) => one.id === 'tickets')!.detail).not.toContain('free');
    // Three points of Food & fun at every lot that has room for them: a lot already full stays full.
    expect(cause(on, 'life').level - cause(off, 'life').level).toBeGreaterThan(0.02);
    expect(cause(on, 'life').level - cause(off, 'life').level).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(campusHappiness(on).base).toBeGreaterThan(campusHappiness(off).base);
  });

  it('Parking fees: income from every student who drives, under its own name', () => {
    const off = flagship();
    const on = turnOn(off, 'parkingFees');
    const drivers = driversNow(off);
    expect(drivers).toBeGreaterThan(1000);
    expect(policyIncome(on)).toEqual([{ id: 'policy.parkingFees', name: 'Parking fees', amount: drivers * 450, detail: `${drivers.toLocaleString('en-US')} students who drive at $450` }]);
    expect(policyIncome(off)).toEqual([]);
    expect(budget(on).incomeTotal).toBe(budget(off).incomeTotal + drivers * 450);
    expect(budget(on).income.find((line) => line.id === 'policy.parkingFees')!.name).toBe('Parking fees');
    expect(budget(on).spending).toBe(budget(off).spending);
    expect(budget(on).kept).toBeGreaterThan(budget(off).kept);
    expect(campusHappiness(on).base).toBeLessThan(campusHappiness(off).base);
  });

  it('Quiet hours: less mischief in the dorms, and a little off Food & fun', () => {
    const off = legacy();
    const on = turnOn(off, 'quietHours');
    expect(mischiefTimes(on)).toBe(0.25);
    expect(mischiefTimes(off)).toBe(1);
    expect(cause(on, 'life').level).toBeCloseTo(cause(off, 'life').level - 0.01, 3);
    // Counted over two weeks of the same campus: far fewer.
    const count = (state: GameState): number => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * WEEK).log.filter((entry) => entry.kind === 'incident' && /dorm/.test(entry.text)).length;
    const loud = count(off);
    const quiet = count(on);
    expect(loud).toBeGreaterThan(50);
    expect(quiet).toBeLessThan(loud * 0.45);
    expect(quiet).toBeGreaterThan(loud * 0.1);
  });

  it('Naming rights: a donor\'s gift every year, and a little off Grounds', () => {
    const off = legacy();
    const on = turnOn(off, 'namingRights');
    expect(policyIncome(on)).toEqual([{ id: 'policy.namingRights', name: 'Naming rights', amount: 125_000 * 28, detail: `From the ${donorName(on)} family, every year their name is up` }]);
    expect(budget(on).incomeTotal).toBe(budget(off).incomeTotal + 3_500_000);
    expect(cause(on, 'grounds').level).toBeCloseTo(cause(off, 'grounds').level - 0.03, 6);
  });
});

describe('content is data', () => {
  it('a ninth policy is one more entry in the list: the page, the lock, the paper, the money and the notes all follow', () => {
    const ninth: PolicySpec = {
      id: 'testNinth',
      name: 'Evening shuttle',
      era: 1,
      gives: 'Income',
      takes: 'A little Happiness',
      gains: [{ kind: 'income', per: 'driver', amount: 100 }],
      costs: [{ kind: 'cause', cause: 'safety', points: -2, among: 'everyone' }],
      begins: 'The evening shuttle begins.',
      ends: 'The evening shuttle ends.',
    };
    const list = POLICIES as PolicySpec[];
    list.push(ninth);
    try {
      const { state, log } = ranked(120);
      expect(log.find((entry) => entry.kind === 'goal')!.text).toContain('with five switches: Reading days before finals, Tough grading, Freshmen live on campus, Free student section and Evening shuttle.');
      const row = policiesView(state)!.rows.find((one) => one.id === 'testNinth')!;
      expect(row).toMatchObject({ name: 'Evening shuttle', on: false, locked: false, gain: 'Income', cost: 'A little Happiness' });
      expect(row.costLines).toEqual(['Safety & health −2']);
      const on = flip(state, 'testNinth');
      expect(policyLocked(on, 'testNinth')).toBe(true);
      expect(budget(on).income.find((line) => line.id === 'policy.testNinth')!.amount).toBe(driversNow(on) * 100);
      expect(happinessView(on).rows.find((one) => one.id === 'safety')!.notes).toEqual(['Evening shuttle −2']);
      const next = advance(on, on.clock.lastSimulatedAt, on.clock.lastSimulatedAt + MIN);
      expect(next.log.filter((entry) => entry.kind === 'policy').map((entry) => entry.text)).toEqual(['The evening shuttle begins.']);
      expect(policyChip(on)).toBe('Policies · 1 on');
    } finally {
      list.pop();
    }
    expect(POLICIES).toHaveLength(8);
  });

  it('no rule, page or line of the game names a policy: only the list does', () => {
    const SRC = join(__dirname, '..', 'src');
    const filesUnder = (path: string): string[] => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => filesUnder(join(path, name))) : [path]);
    const found: string[] = [];
    for (const file of filesUnder(SRC).filter((one) => one.endsWith('.ts'))) {
      const where = relative(SRC, file).split('\\').join('/');
      if (where === 'sim/config/policies.ts') continue;
      // Comments may name one as an example. Code may not.
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const spec of POLICIES) if (code.includes(spec.id) || code.includes(spec.name)) found.push(`${where}: ${spec.id}`);
    }
    expect(found).toEqual([]);
  });

  it('a policy that is off, or was removed from the list, changes nothing', () => {
    const state = legacy();
    expect(causeShifts(state, 'housing')).toEqual([]);
    expect(examsOff(state, 1, () => 1)).toEqual({ points: 0, by: [] });
    expect(upkeepMore(state)).toEqual({ amount: 0, notes: [] });
    expect(policyIncome(state)).toEqual([]);
    // A save that names a policy the game no longer has: it is simply not there.
    const ghost = structuredClone(state);
    ghost.policies.on = ['gone'];
    ghost.policies.news = [{ id: 'gone', on: true }];
    expect(budget(ghost).kept).toBe(budget(state).kept);
    expect(campusHappiness(ghost).base).toBe(campusHappiness(state).base);
    expect(policyChip(ghost)).toBe('Policies');
    const next = advance(ghost, ghost.clock.lastSimulatedAt, ghost.clock.lastSimulatedAt + MIN);
    expect(next.log.filter((entry) => entry.kind === 'policy')).toEqual([]);
    expect(CAUSE_NAMES.life).toBe('Food & fun');
  });
});

describe('a save from version 16', () => {
  const text = readFileSync(new URL('./fixtures/save-v16-model.json', import.meta.url), 'utf8');

  it("comes through with nothing moved: the owner's own kind of game, early in year 1 with no era yet", () => {
    const file = JSON.parse(text) as { v: number; state: GameState };
    expect(file.v).toBe(16);
    expect(file.state.school.name).toBe('Larp University');
    expect(file.state.map.scale).toBe(28);
    expect(file.state.clock.week.year).toBe(1);
    expect(file.state.goals).toEqual({ size: 0, rank: 0, reached: [], rewards: 0 });
    expect(file.state.cohorts.reduce((sum, n) => sum + n, 0)).toBe(46_000);
    expect(file.state.policies).toBeUndefined();

    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const state = loaded.state;
    expect(loaded.migratedFrom).toBe(16);
    expect(state.policies).toEqual({ on: [], locked: [], news: [] });
    // Everything else is as it was saved.
    const expected = structuredClone(file.state);
    expected.version = SAVE_VERSION;
    expected.policies = { on: [], locked: [], news: [] };
    // Version 18 adds the daily layer (tests/daily.test.ts has that).
    expected.daily = state.daily;
    // Version 19 adds the orders board and its stream of numbers (tests/orders.test.ts has those).
    expected.orders = state.orders;
    // Version 20 adds the decorations in storage and the Workshop (tests/decor.test.ts has those).
    expected.decor = state.decor;
    expected.rng.orders = state.rng.orders;
    expect(state).toEqual(expected);
    expect(validate(state)).toBeNull();
    // The numbers it read the moment before it was saved, at version 16.
    const books = budget(state);
    expect(books.spending).toBeCloseTo(file.state.money.spendingPerYear, 4);
    expect(books.incomeTotal).toBeCloseTo(file.state.money.incomePerYear, 4);
    expect(books.kept).toBeCloseTo(16.59, 2);
    expect(campusHappiness(state).base).toBeCloseTo(77.936, 3);
    // No era yet, so no page, no chip, and the Goals page says what Growth will open.
    expect(eraOf(state.goals)).toBe(0);
    expect(policiesView(state)).toBeNull();
    expect(policyChip(state)).toBeNull();
    expect(sizeView(state).eraNext).toContain('The Growth era, at the Top 125, opens the Policies page');
    expect(validate(advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state)).toBeNull();
  });

  it('already in Growth or later opens with every switch off', () => {
    for (const [rank, open] of [[3, 4], [5, 6], [7, 8]] as const) {
      const file = JSON.parse(text) as { v: number; savedAt: number; state: GameState };
      file.state.goals = { size: 1, rank, reached: [], rewards: 0 };
      const loaded = parseSave(JSON.stringify(file));
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.state.policies).toEqual({ on: [], locked: [], news: [] });
      const view = policiesView(loaded.state)!;
      expect(view.rows).toHaveLength(open);
      expect(view.rows.every((row) => !row.on && !row.locked)).toBe(true);
      // Nothing about its money or its Happiness moved on the day it loaded.
      expect(budget(loaded.state).incomeTotal).toBeCloseTo(file.state.money.incomePerYear, 4);
      expect(campusHappiness(loaded.state).base).toBeCloseTo(77.936, 3);
    }
  });

  it('keeps its switches through a save and a load', () => {
    const on = turnOn(legacy(), 'quietHours', 'toughGrading');
    const loaded = parseSave(serialize(on, T0 + 2 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state.policies).toEqual({ on: ['quietHours', 'toughGrading'], locked: ['quietHours', 'toughGrading'], news: [{ id: 'quietHours', on: true }, { id: 'toughGrading', on: true }] });
    expect(loaded.state).toEqual(on);
  });

  it('is told what is new, once', () => {
    // Its own, and the ones versions 18 to 20 added after it (the daily, orders and decor tests).
    const notes = upgradeNotes(16);
    expect(notes).toHaveLength(4);
    expect(notes[0]).toContain('Policies');
    expect(toneProblem(notes[0]!)).toBeNull();
    expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
  });
});
