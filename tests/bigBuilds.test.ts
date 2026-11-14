import { newGreek } from '../src/sim/systems/greek';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  advance,
  applyAction,
  BIG_BUILDS,
  bigBuildOf,
  bigBuildsOffered,
  budget,
  campusHappiness,
  COMMONS_POINTS,
  edition,
  eraOpens,
  fallApplicants,
  HONORS_RATE,
  landRankGoals,
  marketingLift,
  MARKETING_LIFT,
  newBigBuilds,
  newLabs,
  newGame,
  parseSave,
  PLACED,
  placedCost,
  placedUpkeep,
  previewPlace,
  recreationAt,
  SAVE_VERSION,
  scaleOf,
  SECOND_BUILDER_SEALS,
  sealPrice,
  serialize,
  TICKS_PER_HOUR,
  toneProblem,
  UNION_REACH,
  UNION_STRENGTH,
  validate,
  waits,
  WELCOME_MORE,
  type Action,
  type GameState,
  type LogEntry,
  type PlacedType,
} from '../src/sim';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, T0 } from './helpers';

/**
 * The big builds of the eras (DESIGN.md 41.3, 41.4, as built in section 45):
 * opened by an era, one of each, built over real days, and each moving one
 * number the game already has.
 */

const model = (seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });

/** A model campus a day and a half into its first fall, at a rank, with the goals down to it reached and cash to spend. */
function ranked(rank: number, seed = 35): GameState {
  const state = advance(model(seed), T0, T0 + 1.5 * DAY).state;
  state.field.rank = rank;
  state.field.rankYear = 1;
  landRankGoals(state, []);
  state.money.cash = 2_000_000_000;
  return state;
}
const flagship = (): GameState => ranked(70);
const legacy = (): GameState => ranked(20);

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The first free spot a building fits on, scanning from the top corner. */
function spotFor(state: GameState, type: PlacedType): [number, number] {
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) if (previewPlace(state, type, x, y).problem === null) return [x, y];
  }
  throw new Error(`no room for ${type}`);
}

function build(state: GameState, type: PlacedType): GameState {
  const [x, y] = spotFor(state, type);
  return act(state, { type: 'place', building: type, x, y });
}

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

/** Built, and left until it opens. */
function opened(state: GameState, type: PlacedType): GameState {
  const hours = BIG_BUILDS.find((spec) => spec.type === type)!.hours;
  return later(build(state, type), (hours + 1) * HOUR).state;
}

describe('what the eras open', () => {
  it('is three buildings at Flagship and one landmark at Legacy, each one of a kind, on a campus with goals only', () => {
    expect(BIG_BUILDS.map((spec) => spec.type)).toEqual(['studentUnion', 'honorsCollege', 'welcomeCenter', 'foundersCommons']);
    expect(bigBuildsOffered(ranked(120))).toEqual([]);
    expect(bigBuildsOffered(flagship()).map((spec) => spec.type)).toEqual(['studentUnion', 'honorsCollege', 'welcomeCenter']);
    expect(bigBuildsOffered(legacy()).map((spec) => spec.type)).toEqual(['studentUnion', 'honorsCollege', 'welcomeCenter', 'foundersCommons']);
    // A small campus has no eras, and so none of these.
    const small = freshGame();
    expect(bigBuildsOffered(small)).toEqual([]);
    expect(applyAction(small, { type: 'place', building: 'studentUnion', x: 2, y: 2 }).ok).toBe(false);
    // Before its era, one is refused with the rank that opens it.
    const early = ranked(120);
    early.money.cash = 2_000_000_000;
    const [x, y] = spotFor(early, 'studentUnion');
    const refused = applyAction(early, { type: 'place', building: 'studentUnion', x, y });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe('Student Union comes with the Flagship era, at the Top 75.');
  });

  it('is said when the era begins, and on the Goals page ahead of it', () => {
    expect(eraOpens(2)).toMatch(/^three buildings to buy in the Build menu: the Student Union, the Honors College and the Welcome Center; and three more policies/);
    expect(eraOpens(3)).toMatch(/^one landmark to buy in the Build menu: the Founders' Commons; and two more policies/);
    for (const era of [2, 3]) expect(toneProblem(eraOpens(era)), eraOpens(era)).toBeNull();
  });

  it('costs many times a Build menu building to build and to run, about a step of the Instruction slider a year', () => {
    const state = flagship();
    const scale = scaleOf(state);
    const dearest = Math.max(...(['library', 'foodcourt', 'garage', 'medical'] as const).map((type) => placedCost(type, scale)));
    for (const type of ['studentUnion', 'honorsCollege', 'welcomeCenter'] as const) {
      expect(placedCost(type, scale)).toBeGreaterThan(4 * dearest);
      expect(placedUpkeep(type, scale)).toBeGreaterThanOrEqual(6_000_000);
      expect(placedUpkeep(type, scale)).toBeLessThanOrEqual(16_000_000);
    }
    expect(placedCost('foundersCommons', scale)).toBeGreaterThan(5 * placedCost('studentUnion', scale));
  });
});

describe('a big build', () => {
  it('goes up over real days as a building site that does nothing and costs nothing to run, then opens with a line in the paper', () => {
    const before = flagship();
    const keptBefore = budget(before).kept;
    const state = build(before, 'studentUnion');
    const placed = bigBuildOf(state, 'studentUnion')!;
    expect(placed.done).toBe(state.clock.tick + 24 * TICKS_PER_HOUR);
    expect(state.money.cash).toBe(before.money.cash - placedCost('studentUnion', scaleOf(state)));
    expect(budget(state).kept).toBeCloseTo(keptBefore, 6);
    // No opening bonus to collect from a building site: it comes when the building opens.
    expect(state.daily.opened.some((one) => one.kind === 'placed' && one.id === placed.id)).toBe(false);
    // Going up, nothing reaches the lots around it.
    const lot = state.map.buildings.find((b) => b && b.stage > 0 && Math.max(Math.abs(b.x - placed.x), Math.abs(b.y - placed.y)) <= UNION_REACH)!;
    expect(recreationAt(state, lot.x, lot.y)).toBe(recreationAt(before, lot.x, lot.y));
    // Started: the paper says so on the next tick.
    const next = later(state, 2 * 60_000);
    expect(next.log.some((entry) => entry.kind === 'bigBuild' && /^Work has begun on the Student Union\. It opens in/.test(entry.text))).toBe(true);
    // A day on, it opens.
    const day = later(next.state, 24 * HOUR);
    expect(bigBuildOf(day.state, 'studentUnion')!.done).toBeUndefined();
    expect(day.state.daily.opened.some((one) => one.kind === 'placed' && one.id === placed.id)).toBe(true);
    const line = day.log.find((entry) => entry.kind === 'bigBuild' && entry.data?.keep === 1)!;
    expect(line.text).toBe('The Student Union is open: things to do and somewhere to meet over a wide circle.');
    expect(toneProblem(line.text)).toBeNull();
    expect(budget(day.state).kept).toBeLessThan(budget(next.state).kept);
    // In the paper.
    const paper = edition(next.state, day.log, { minutes: 24 * 60, cashBefore: next.state.money.cash, cashAfter: day.state.money.cash, studentsBefore: 0, studentsAfter: 0 });
    expect(JSON.stringify(paper)).toContain('The Student Union is open');
  });

  it('is one of a kind: a second is refused while the first stands or goes up', () => {
    const state = build(flagship(), 'studentUnion');
    const [x, y] = spotFor(state, 'studentUnion');
    const again = applyAction(state, { type: 'place', building: 'studentUnion', x, y });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/^Student Union is being built\. It opens in/);
    const standing = later(state, 25 * HOUR).state;
    const third = applyAction(standing, { type: 'place', building: 'studentUnion', x, y });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toBe('Student Union is already on the campus. Clear it first to move it.');
  });

  it('goes up one at a time, two once the second builder is bought for Seals', () => {
    let state = build(flagship(), 'studentUnion');
    const [x, y] = spotFor(state, 'honorsCollege');
    const busy = applyAction(state, { type: 'place', building: 'honorsCollege', x, y });
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.error).toBe(`The builder is busy with the Student Union. A second builder costs ${SECOND_BUILDER_SEALS} Gold Seals, once.`);
    // Not enough Seals.
    state.daily.seals = SECOND_BUILDER_SEALS - 1;
    expect(applyAction(state, { type: 'buySecondBuilder' }).ok).toBe(false);
    state.daily.seals = SECOND_BUILDER_SEALS + 3;
    state = act(state, { type: 'buySecondBuilder' });
    expect(state.daily.seals).toBe(3);
    expect(state.bigBuilds.slots).toBe(2);
    expect(applyAction(state, { type: 'buySecondBuilder' }).ok).toBe(false);
    state = build(state, 'honorsCollege');
    const third = applyAction(state, { type: 'place', building: 'welcomeCenter', ...Object.fromEntries([['x', spotFor(state, 'welcomeCenter')[0]], ['y', spotFor(state, 'welcomeCenter')[1]]]) } as Action);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toBe('Both builders are busy, with the Student Union and the Honors College.');
  });

  it('can be finished now for Seals at the usual rate, and opens on the next tick', () => {
    let state = build(legacy(), 'foundersCommons');
    const placed = bigBuildOf(state, 'foundersCommons')!;
    const wait = waits(state).find((one) => one.id === `build:${placed.id}`)!;
    expect(wait.name).toBe("Founders' Commons");
    expect(wait.price).toBe(sealPrice(72 * TICKS_PER_HOUR));
    state.daily.seals = wait.price;
    state = act(state, { type: 'finish', wait: wait.id });
    expect(state.daily.seals).toBe(0);
    const next = later(state, 2 * 60_000);
    expect(bigBuildOf(next.state, 'foundersCommons')!.done).toBeUndefined();
    expect(next.log.filter((entry) => entry.kind === 'bigBuild' && entry.data?.keep === 1)).toHaveLength(1);
  });

  it('cleared while going up takes its timer with it, and can be bought again', () => {
    const state = build(flagship(), 'welcomeCenter');
    const placed = bigBuildOf(state, 'welcomeCenter')!;
    const cleared = act(state, { type: 'paint', tool: 'clear', cells: [[placed.x, placed.y]] });
    expect(bigBuildOf(cleared, 'welcomeCenter')).toBeNull();
    expect(cleared.timers.some((timer) => timer.kind === 'bigBuild')).toBe(false);
    expect(build(cleared, 'welcomeCenter').bigBuilds).toBeDefined();
  });

  it('loses nothing for a player away a week: it opens on its own', () => {
    const state = build(flagship(), 'honorsCollege');
    const week = later(state, 7 * DAY).state;
    expect(bigBuildOf(week, 'honorsCollege')!.done).toBeUndefined();
  });
});

describe('each moves one number the game already has', () => {
  it('the Student Union: recreation, part of Food & fun, at every lot in its wide reach', () => {
    const before = flagship();
    const state = opened(before, 'studentUnion');
    const union = bigBuildOf(state, 'studentUnion')!;
    let lifted = 0;
    for (const lot of state.map.buildings) {
      if (!lot || lot.stage <= 0) continue;
      const far = Math.max(Math.max(union.x - lot.x, 0, lot.x - (union.x + union.w - 1)), Math.max(union.y - lot.y, 0, lot.y - (union.y + union.h - 1)));
      const was = recreationAt(before, lot.x, lot.y);
      const now = recreationAt(state, lot.x, lot.y);
      if (far <= UNION_REACH) {
        expect(now).toBeCloseTo(Math.min(1, was + UNION_STRENGTH), 6);
        if (now > was) lifted += 1;
      } else expect(now).toBe(was);
    }
    expect(lifted).toBeGreaterThan(0);
    const life = (s: GameState) => campusHappiness(s).causes.find((cause) => cause.id === 'life')!.level;
    expect(life(state)).toBeGreaterThan(life(before));
  });

  it('the Honors College: the graduation rate the academic rating reads, named on its line', () => {
    // A rate to read needs a class through four years: the model campus has one from its first commencement.
    const spring = later(flagship(), 4 * DAY).state;
    spring.money.cash = 2_000_000_000;
    // A campus that has been running for years finishes about nine in ten (the long run reads 93 of 100 here), so a
    // tenth of each class is taken off: a new campus finishes nearly all of its first, and the input is at its top.
    for (const record of spring.classes) record.finishedOnTime = Math.floor(record.finishedOnTime * 0.9);
    const read = (s: GameState) => academicInputs(s).find((input) => input.id === 'graduation')!;
    const before = read(spring);
    expect(before.level).not.toBeNull();
    expect(before.level!).toBeLessThan(95);
    const state = opened(spring, 'honorsCollege');
    const after = read(state);
    expect(after.level!).toBeGreaterThan(before.level!);
    expect(after.detail).toMatch(new RegExp(`${Math.round(HONORS_RATE * 100)} of them with the Honors College`));
  });

  it('the Welcome Center: a share more from each step of marketing, and nothing with marketing off', () => {
    let state = act(flagship(), { type: 'marketing', step: 2 });
    const before = marketingLift(state);
    const draw = fallApplicants(state).total;
    state = opened(state, 'welcomeCenter');
    expect(marketingLift(state)).toBeCloseTo(MARKETING_LIFT[2]! * (1 + WELCOME_MORE), 9);
    expect(marketingLift(state)).toBeGreaterThan(before);
    expect(fallApplicants(state).total).toBeGreaterThan(draw);
    expect(marketingLift(act(state, { type: 'marketing', step: 0 }))).toBe(0);
  });

  it("Founders' Commons: Grounds for every student, wherever they live, inside the cause and named there", () => {
    const before = legacy();
    const state = opened(before, 'foundersCommons');
    const grounds = (s: GameState) => campusHappiness(s).causes.find((cause) => cause.id === 'grounds')!;
    const was = grounds(before);
    const now = grounds(state);
    expect(now.level).toBeGreaterThan(was.level);
    expect(now.level - was.level).toBeLessThanOrEqual(COMMONS_POINTS / 100 + 1e-9);
    expect(now.policies?.some((one) => one.name === "Founders' Commons")).toBe(true);
    // The causes stay four.
    expect(campusHappiness(state).causes.map((cause) => cause.id).sort()).toEqual(campusHappiness(before).causes.map((cause) => cause.id).sort());
  });

  it('never moves the rank directly: nothing here is in the rating but the Honors College on its own line', () => {
    expect(PLACED.studentUnion.family).toBe('era');
    for (const spec of BIG_BUILDS) expect(PLACED[spec.type].buildable).toBe(true);
  });
});

describe('saves', () => {
  it('keep a big build going up, its timer and the second builder through a save and a load', () => {
    let state = flagship();
    state.daily.seals = SECOND_BUILDER_SEALS;
    state = build(act(state, { type: 'buySecondBuilder' }), 'studentUnion');
    const loaded = parseSave(serialize(state, state.clock.lastSimulatedAt));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.bigBuilds).toEqual(state.bigBuilds);
    expect(bigBuildOf(loaded.state, 'studentUnion')!.done).toBe(bigBuildOf(state, 'studentUnion')!.done);
    expect(loaded.state.timers.filter((timer) => timer.kind === 'bigBuild')).toHaveLength(1);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBe(26);
  });

  describe('from version 21', () => {
    const text = readFileSync(new URL('./fixtures/save-v21-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: the owner's own kind of game, with one builder and nothing going up", () => {
      expect(file.state.version).toBe(21);
      expect(file.state.bigBuilds).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(21);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.bigBuilds = newBigBuilds();
      expected.labs = newLabs();
      expected.traditions = loaded.state.traditions;
      expected.greek = newGreek();
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      // It plays on.
      const day = advance(loaded.state, file.savedAt, file.savedAt + DAY).state;
      expect(validate(day)).toBeNull();
      const notes = upgradeNotes(21);
      expect(notes).toHaveLength(5);
      expect(notes[0]).toMatch(/big builds/);
    });
  });
});
