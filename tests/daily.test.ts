import { newGreek } from '../src/sim/systems/greek';
import { newSocial } from '../src/sim/systems/social';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  awayLines,
  backPay,
  budget,
  COLLECT,
  COLLECT_HOURS,
  COLLECT_READY_HOURS,
  collectables,
  dailyOnBuilt,
  dailyOnHomeGame,
  dollarsShort,
  earn,
  enrollment,
  gainXp,
  GAME_CASH,
  GAMES_HELD,
  giftWords,
  hasDaily,
  landRankGoals,
  landSizeGoals,
  LEVEL_FIRST,
  LEVEL_MOST,
  LEVEL_STEP,
  LEVEL_UNLOCKS,
  levelAt,
  levelCost,
  levelGifts,
  newDaily,
  newGame,
  nextSemesterStaff,
  OPENINGS_PER_DAY,
  parseSave,
  PLACED,
  previewPlace,
  readyToCollect,
  SAVE_VERSION,
  SEAL_HOURS,
  sealPrice,
  SEALS_ERA,
  SEALS_FIFTH_LEVEL,
  SEALS_PER_LEVEL,
  SEALS_RANK_GOAL,
  SEALS_SIZE_GOAL,
  serialize,
  STORE_WIN_TIMES,
  tellDaily,
  TICKS_PER_HOUR,
  toneProblem,
  validate,
  waits,
  XP_SOURCES,
  type GameState,
  type LogEntry,
  type PlacedType,
  type XpSource,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { ticksToIntake } from '../src/sim/calendar';
import { addTimer } from '../src/sim/timers';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { COLLECT_ALL_FROM, collectAllChip, finishConfirm, gainedWords, levelChip, levelView } from '../src/ui/levelUi';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

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

function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const later = (state: GameState, ms: number): GameState => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms).state;
const facts = (state: GameState) => ({ minutes: 600, cashBefore: state.money.cash, cashAfter: state.money.cash, studentsBefore: enrollment(state), studentsAfter: enrollment(state) });
const of = (state: GameState, family: string) => state.map.placed.filter((placed) => placed && PLACED[placed.type].family === family).map((placed) => placed!);
const held = (state: GameState, key: string) => collectables(state).find((one) => one.key === key);

/** The first free ground a building fits on, scanning out from a cell. */
function spotFor(state: GameState, type: PlacedType, cx = 16, cy = 16): [number, number] {
  const map = state.map;
  let best: [number, number] | null = null;
  let near = Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const far = Math.abs(x - cx) + Math.abs(y - cy);
      if (far >= near || previewPlace(state, type, x, y).problem !== null) continue;
      near = far;
      best = [x, y];
    }
  }
  if (!best) throw new Error(`no room for ${type}`);
  return best;
}

describe('the University Level', () => {
  it('asks a little more for each level, and never more than the most', () => {
    expect(levelCost(1)).toBe(LEVEL_FIRST);
    expect(levelCost(2)).toBe(LEVEL_FIRST + LEVEL_STEP);
    for (let level = 1; level < 60; level++) {
      expect(levelCost(level + 1)).toBeGreaterThanOrEqual(levelCost(level));
      expect(levelCost(level)).toBeLessThanOrEqual(LEVEL_MOST);
    }
    expect(levelCost(60)).toBe(LEVEL_MOST);
    expect(levelAt(0)).toEqual({ level: 1, into: 0, need: LEVEL_FIRST });
    expect(levelAt(LEVEL_FIRST - 1).level).toBe(1);
    expect(levelAt(LEVEL_FIRST)).toEqual({ level: 2, into: 0, need: LEVEL_FIRST + LEVEL_STEP });
    // More experience is never a lower level.
    let last = 1;
    for (let xp = 0; xp < 20_000; xp += 37) {
      const at = levelAt(xp);
      expect(at.level).toBeGreaterThanOrEqual(last);
      expect(at.into).toBeLessThan(at.need);
      last = at.level;
    }
  });

  it('gives a Seal with every level and more at every fifth, with room for what later stops will open', () => {
    // The Seals come first. Level 2 also puts the first decoration on the Decor shelf (tests/decor.test.ts).
    expect(levelGifts(2)[0]).toEqual({ kind: 'seals', count: SEALS_PER_LEVEL });
    expect(levelGifts(2)[1]).toMatchObject({ kind: 'unlock', what: 'decoration', id: 'flowers' });
    // The Seals come first. Level 5 also opens a fourth place on the orders board (tests/orders.test.ts).
    expect(levelGifts(5)[0]).toEqual({ kind: 'seals', count: SEALS_FIFTH_LEVEL });
    expect(levelGifts(1000)).toEqual([{ kind: 'seals', count: SEALS_FIFTH_LEVEL }]);
    expect(SEALS_FIFTH_LEVEL).toBeGreaterThan(SEALS_PER_LEVEL);
    expect(giftWords(levelGifts(2))).toBe('1 Gold Seal and red flowers for the Decor shelf');
    expect(giftWords(levelGifts(1000))).toBe('2 Gold Seals');
    expect(giftWords(levelGifts(999))).toBe('1 Gold Seal');
    expect(giftWords(levelGifts(5))).toBe('2 Gold Seals and a fourth order on the board');
    // What a level opens besides its Seals is a list: a kind of order, one more order on the board, a decoration
    // for the Decor shelf or a Workshop recipe (tests/orders.test.ts, tests/decor.test.ts). One more is one entry.
    for (const gifts of Object.values(LEVEL_UNLOCKS)) {
      for (const gift of gifts) {
        expect(gift.kind).toBe('unlock');
        if (gift.kind === 'unlock') expect(['order', 'slot', 'decoration', 'recipe']).toContain(gift.what);
      }
    }
    expect(LEVEL_UNLOCKS[999]).toBeUndefined();
    const list = LEVEL_UNLOCKS as Record<number, unknown>;
    list[999] = [{ kind: 'unlock', what: 'decoration', id: 'testBench', name: 'a garden bench' }];
    try {
      expect(giftWords(levelGifts(999))).toBe('1 Gold Seal and a garden bench');
    } finally {
      delete list[999];
    }
    expect(levelView(model())!.next).toBe(`Level 2 gives ${giftWords(levelGifts(2))}.`);
  });

  it('only rises, pays each level once, and says several at once in one line', () => {
    const state = model();
    expect(state.daily).toEqual(newDaily(0));
    const log: LogEntry[] = [];
    gainXp(state, LEVEL_FIRST - 1, log);
    expect(state.daily.level).toBe(1);
    expect(log).toEqual([]);
    gainXp(state, 1, log);
    expect(state.daily.level).toBe(2);
    expect(state.daily.seals).toBe(SEALS_PER_LEVEL);
    expect(log.map((entry) => entry.text)).toEqual([`Test University reaches University Level 2: ${giftWords(levelGifts(2))}.`]);
    expect(log[0]!.kind).toBe('level');
    // Nothing takes experience away.
    gainXp(state, -500, log);
    gainXp(state, 0, log);
    expect(state.daily.xp).toBe(LEVEL_FIRST);
    // Three levels in one go are one line, with everything they gave: levels 3 and 4 a Seal each, level 5 two.
    gainXp(state, levelCost(2) + levelCost(3) + levelCost(4), log);
    expect(state.daily.level).toBe(5);
    expect(state.daily.seals).toBe(SEALS_PER_LEVEL * 3 + SEALS_FIFTH_LEVEL);
    // With what levels 3 and 4 open on the orders board, in the same line.
    const opened = [3, 4, 5].flatMap((level) => levelGifts(level).filter((gift) => gift.kind === 'unlock'));
    expect(log[1]!.text).toBe(`Test University reaches University Level 5, 3 levels at once: ${giftWords([{ kind: 'seals', count: 2 * SEALS_PER_LEVEL + SEALS_FIFTH_LEVEL }, ...opened])}.`);
    expect(log).toHaveLength(2);
    for (const entry of log) expect(toneProblem(entry.text), entry.text).toBeNull();
    expect(state.daily.level).toBe(levelAt(state.daily.xp).level);
  });

  it('is fed by what happens by itself, so a campus nobody visits levels too', () => {
    const start = model();
    const week = advance(start, T0, T0 + WEEK);
    const state = week.state;
    // A class moved in twice, the seniors graduated, and the first rankings brought a goal.
    const intakes = week.log.filter((entry) => entry.kind === 'intake').length;
    const graduations = week.log.filter((entry) => entry.kind === 'graduation').length;
    expect(intakes).toBeGreaterThanOrEqual(1);
    expect(graduations).toBe(1);
    expect(state.daily.xp).toBeGreaterThanOrEqual(intakes * XP_SOURCES.classIn.xp + graduations * XP_SOURCES.graduation.xp);
    expect(state.daily.level).toBeGreaterThan(3);
    expect(state.daily.level).toBe(levelAt(state.daily.xp).level);
    expect(state.daily.seals).toBeGreaterThan(0);
    const lines = week.log.filter((entry) => entry.kind === 'level');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(toneProblem(line.text), line.text).toBeNull();
    // Nothing was collected, and nothing was lost for it: every building still holds what it held.
    expect(state.daily.since).toEqual({});
    expect(readyToCollect(state).length).toBeGreaterThanOrEqual(readyToCollect(start).length);
  });

  it('counts each source at its listed amount', () => {
    for (const id of ['classIn', 'graduation', 'homeWin', 'grew'] as const) {
      const state = model();
      earn(state, id);
      expect(state.daily.xp, id).toBe(XP_SOURCES[id].xp);
    }
    // A lot's building that grows a stage pays by itself. One that opens leaves a bonus to collect.
    const state = opened();
    const lot = state.map.buildings.find((building) => building && building.stage >= 1)!;
    const log: LogEntry[] = [];
    const was = state.daily.xp;
    dailyOnBuilt(state, lot.id, 1, log);
    expect(state.daily.xp).toBe(was + XP_SOURCES.grew.xp);
    dailyOnBuilt(state, lot.id, 0, log);
    expect(state.daily.xp).toBe(was + XP_SOURCES.grew.xp);
    expect(held(state, `b${lot.id}`)).toMatchObject({ xp: XP_SOURCES.opened.xp, cash: 0, ready: true, x: lot.x, y: lot.y });
    const taken = act(state, { type: 'collect', key: `b${lot.id}` });
    expect(taken.daily.xp).toBe(state.daily.xp + XP_SOURCES.opened.xp);
    expect(held(taken, `b${lot.id}`)).toBeUndefined();
    for (const source of Object.values(XP_SOURCES) as XpSource[]) {
      expect(toneProblem(source.name), source.name).toBeNull();
      expect(source.xp).toBeGreaterThanOrEqual(0);
    }
  });

  it('is fed by goals and eras, which bring Gold Seals as they are reached', () => {
    const { state, log } = ranked(170, model());
    expect(state.goals!.rank).toBe(1);
    expect(state.daily.xp).toBe(XP_SOURCES.rankGoal.xp);
    const levels = levelAt(XP_SOURCES.rankGoal.xp).level;
    expect(state.daily.level).toBe(levels);
    // Five for the goal, and one for each level its experience reached (the fifth level gives three).
    const forLevels = Array.from({ length: levels - 1 }, (_, n) => levelGifts(n + 2)[0]!).reduce((sum, gift) => sum + (gift.kind === 'seals' ? gift.count : 0), 0);
    expect(state.daily.seals).toBe(SEALS_RANK_GOAL + forLevels);
    expect(log[0]!.kind).toBe('goal');
    expect(log[0]!.text.endsWith('It brings 5 Gold Seals.')).toBe(true);
    expect(log[1]!.kind).toBe('level');
    expect(log).toHaveLength(2);
    // Three goals and an era in one day.
    const big = ranked(120, model());
    expect(big.state.daily.xp).toBe(3 * XP_SOURCES.rankGoal.xp + XP_SOURCES.era.xp);
    expect(big.log[0]!.text).toContain(`They bring ${3 * SEALS_RANK_GOAL + SEALS_ERA} Gold Seals. The Growth era begins.`);
    // A full campus.
    const full = structuredClone(model());
    full.cohorts = [15_000, 14_500, 14_500, 14_000];
    const said: LogEntry[] = [];
    landSizeGoals(full, said);
    expect(full.daily.xp).toBe(XP_SOURCES.sizeGoal.xp);
    expect(said[0]!.text.endsWith(`It brings ${SEALS_SIZE_GOAL} Gold Seals.`)).toBe(true);
  });
});

describe('only a game with goals has the layer', () => {
  it('leaves a game begun on the small campus exactly as it was', () => {
    const small = freshGame();
    expect(hasDaily(small)).toBe(false);
    expect(small.daily).toEqual(newDaily(0));
    const state = advance(small, T0, T0 + 4 * WEEK).state;
    expect(state.daily).toEqual(newDaily(0));
    expect(collectables(state)).toEqual([]);
    expect(waits(state)).toEqual([]);
    expect(levelChip(state)).toBeNull();
    expect(levelView(state)).toBeNull();
    expect(collectAllChip(state)).toBeNull();
    for (const action of [{ type: 'collectAll' }, { type: 'collect', key: 'p0' }, { type: 'finish', wait: 'faculty' }] as const) {
      expect(applyAction(state, action).ok).toBe(false);
    }
    earn(state, 'graduation');
    gainXp(state, 500);
    expect(state.daily.xp).toBe(0);
  });
});

describe('collecting', () => {
  it('finds a new campus with every food place and store full, so the first sitting has something to tap', () => {
    const state = model();
    const food = of(state, 'dining');
    const stores = of(state, 'store');
    expect(food.length).toBeGreaterThan(5);
    const all = collectables(state);
    expect(all).toHaveLength(food.length + stores.length);
    for (const one of all) {
      expect(one.ready).toBe(true);
      expect(one.full).toBe(1);
      expect(one.lost).toBe(0);
    }
    const dining = held(state, `p${food[0]!.id}`)!;
    expect(dining.xp).toBe(Math.floor(COLLECT.dining!.xpPerHour * COLLECT_HOURS));
    expect(dining.cash).toBe(Math.round(COLLECT.dining!.cashPerHour * 28 * COLLECT_HOURS));
    expect(dining.name).toBe(PLACED[food[0]!.type].name);
    expect(collectAllChip(state)).toBe(`Collect all · ${all.length}`);

    // Collect all: several levels in the first sitting, said in one line on the next minute.
    const result = applyAction(state, { type: 'collectAll' });
    if (!result.ok) throw new Error(result.error);
    const xp = all.reduce((sum, one) => sum + one.xp, 0);
    const cash = all.reduce((sum, one) => sum + one.cash, 0);
    expect(result.gained).toEqual({ xp, cash, count: all.length });
    expect(result.state.daily.xp).toBe(xp);
    expect(result.state.daily.level).toBeGreaterThanOrEqual(3);
    expect(result.state.money.cash).toBe(state.money.cash + cash);
    expect(readyToCollect(result.state)).toEqual([]);
    expect(collectAllChip(result.state)).toBeNull();
    expect(applyAction(result.state, { type: 'collectAll' }).ok).toBe(false);
    expect(result.state.daily.news).toHaveLength(1);
    const next = advance(result.state, T0, T0 + MIN);
    const lines = next.log.filter((entry) => entry.kind === 'level');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toMatch(/^Test University reaches University Level \d, \d levels at once: \d Gold Seals/);
    expect(next.state.daily.news).toEqual([]);
    expect(gainedWords(result.gained!)).toBe(`+${xp} experience and ${dollarsShort(cash)} from ${all.length} buildings`);
  });

  it('is worked out from time: a building fills by the hour, shows its marker after six, and holds 36 hours and no more', () => {
    const start = act(model(), { type: 'collectAll' });
    const place = of(start, 'dining')[0]!;
    const key = `p${place.id}`;
    const rate = COLLECT.dining!.xpPerHour;
    // Just collected: nothing to take, and no marker.
    expect(held(start, key)).toBeUndefined();
    expect(applyAction(start, { type: 'collect', key }).ok).toBe(false);
    // Three hours: it holds a little, with no marker yet. It can still be taken from the Level page's button? No: only what is ready is collected by Collect all.
    const three = later(start, 3 * HOUR);
    expect(held(three, key)).toMatchObject({ xp: Math.floor(rate * 3), ready: false });
    expect(readyToCollect(three)).toEqual([]);
    // Six hours: the marker shows.
    const six = later(start, COLLECT_READY_HOURS * HOUR);
    expect(held(six, key)).toMatchObject({ xp: Math.floor(rate * COLLECT_READY_HOURS), ready: true });
    // A day: a day's worth.
    const day = later(start, DAY);
    expect(held(day, key)!.xp).toBe(Math.floor(rate * 24));
    expect(held(day, key)!.full).toBeCloseTo(24 / COLLECT_HOURS, 6);
    expect(held(day, key)!.lost).toBe(0);
    // Thirty-six hours: full, and nothing lost yet.
    const most = later(start, COLLECT_HOURS * HOUR);
    expect(held(most, key)).toMatchObject({ xp: Math.floor(rate * COLLECT_HOURS), full: 1, lost: 0 });
    // Four days: still 36 hours' worth, and the rest was never banked.
    const long = later(start, 4 * DAY);
    expect(held(long, key)!.xp).toBe(Math.floor(rate * COLLECT_HOURS));
    expect(held(long, key)!.lost).toBe(Math.floor(rate * (96 - COLLECT_HOURS)));
    // Nothing about it ran on a tick: the record of when it was collected is what it was.
    expect(long.daily.since).toEqual(start.daily.since);
  });

  it('loses nothing to rounding, whenever it is collected', () => {
    let state = act(model(), { type: 'collectAll' });
    const place = of(state, 'dining')[0]!;
    const key = `p${place.id}`;
    const rate = COLLECT.dining!.xpPerHour;
    let taken = 0;
    for (let n = 0; n < 6; n++) {
      state = later(state, 7 * HOUR);
      const result = applyAction(state, { type: 'collect', key });
      if (!result.ok) throw new Error(result.error);
      taken += result.gained!.xp;
      state = result.state;
    }
    // Six collections seven hours apart pay what forty-two hours fill, to the point.
    expect(taken).toBe(Math.floor(rate * 42));
  });

  it('pays mostly experience and a little cash, and leaves normal income alone', () => {
    const state = later(act(model(), { type: 'collectAll' }), DAY);
    const before = budget(state);
    const ready = readyToCollect(state);
    const cash = ready.reduce((sum, one) => sum + one.cash, 0);
    const after = act(state, { type: 'collectAll' });
    expect(after.money.cash).toBe(state.money.cash + cash);
    // The books are what they were: income, spending and what is kept of every $100.
    const books = budget(after);
    expect(books.incomeTotal).toBe(before.incomeTotal);
    expect(books.spending).toBe(before.spending);
    expect(books.kept).toBe(before.kept);
    expect(books.income.map((line) => line.id)).toEqual(before.income.map((line) => line.id));
    // A day of every building on the campus is a few thousand dollars against half a billion a year.
    expect(cash).toBeGreaterThan(0);
    expect(cash * 7).toBeLessThan(before.incomeTotal * 0.001);
  });

  it('fills the campus store twice as fast for a day after a home win', () => {
    const start = act(opened(), { type: 'collectAll' });
    const store = of(start, 'store')[0]!;
    const key = `p${store.id}`;
    const rate = COLLECT.store!.xpPerHour;
    // A day with no home win in it.
    const day = structuredClone(later(start, DAY));
    day.daily.wins = [];
    expect(held(day, key)!.xp).toBe(Math.floor(rate * 24));
    // A home win as it was collected: the whole day since counts twice.
    const won = structuredClone(day);
    won.daily.wins = [start.clock.tick];
    expect(held(won, key)!.xp).toBe(Math.floor(rate * 24 * STORE_WIN_TIMES));
    // A win twelve hours ago: twelve of the twenty-four hours count twice.
    const half = structuredClone(day);
    half.daily.wins = [day.clock.tick - 12 * TICKS_PER_HOUR];
    expect(held(half, key)!.xp).toBe(Math.floor(rate * (24 + 12)));
    // Two wins whose days overlap do not count the same hour three times.
    const two = structuredClone(day);
    two.daily.wins = [day.clock.tick - 20 * TICKS_PER_HOUR, day.clock.tick - 12 * TICKS_PER_HOUR];
    expect(held(two, key)!.xp).toBe(Math.floor(rate * (24 + 20)));
    // A food place is not a store: it fills as it always does.
    const food = of(day, 'dining')[0]!;
    expect(held(won, `p${food.id}`)!.xp).toBe(held(day, `p${food.id}`)!.xp);
    // The win itself is experience, and is remembered for the store.
    const live = structuredClone(start);
    const log: LogEntry[] = [];
    dailyOnHomeGame(live, true, log);
    expect(live.daily.wins).toEqual([...start.daily.wins, live.clock.tick]);
    expect(live.daily.xp).toBe(start.daily.xp + XP_SOURCES.homeWin.xp);
  });

  it('leaves a bonus at the stadium after a home game, holds a few, and loses none', () => {
    const start = act(opened(), { type: 'collectAll' });
    const plot = start.football.stadium.plot!;
    expect(start.map.placed[plot]).toBeTruthy();
    expect(held(start, `p${plot}`)).toBeUndefined();
    const state = structuredClone(start);
    const log: LogEntry[] = [];
    dailyOnHomeGame(state, false, log);
    expect(state.daily.games).toBe(1);
    expect(state.daily.xp).toBe(start.daily.xp);
    expect(held(state, `p${plot}`)).toMatchObject({ xp: XP_SOURCES.homeGame.xp, cash: GAME_CASH * 28, ready: true, name: 'Stadium' });
    for (let n = 1; n < GAMES_HELD; n++) dailyOnHomeGame(state, false, log);
    expect(held(state, `p${plot}`)!.xp).toBe(GAMES_HELD * XP_SOURCES.homeGame.xp);
    // One more than it holds pays its experience at once.
    dailyOnHomeGame(state, false, log);
    expect(state.daily.games).toBe(GAMES_HELD);
    expect(state.daily.xp).toBe(start.daily.xp + XP_SOURCES.homeGame.xp);
    const taken = act(state, { type: 'collect', key: `p${plot}` });
    expect(taken.daily.games).toBe(0);
    expect(taken.daily.xp).toBe(state.daily.xp + GAMES_HELD * XP_SOURCES.homeGame.xp);
    expect(held(taken, `p${plot}`)).toBeUndefined();
    // With no stadium plot on the campus there is nothing to tap, so the game pays at once.
    const bare = structuredClone(start);
    bare.football.stadium.plot = null;
    dailyOnHomeGame(bare, false, log);
    expect(bare.daily.games).toBe(0);
    expect(bare.daily.xp).toBe(start.daily.xp + XP_SOURCES.homeGame.xp);
  });

  it('gives a building that has just opened a bonus to collect, a dozen a day at most', () => {
    const start = act(opened(), { type: 'collectAll' });
    const [x, y] = spotFor(start, 'coffee');
    const placed = act(start, { type: 'place', building: 'coffee', x, y });
    const id = placed.map.placed.filter((one) => one && one.type === 'coffee').pop()!.id;
    // Ready at once, with its opening bonus. It began to fill when it was placed, so that is all it holds.
    expect(held(placed, `p${id}`)).toMatchObject({ xp: XP_SOURCES.placed.xp, cash: 0, ready: true, x, y });
    expect(placed.daily.since[id]).toBe(placed.clock.tick);
    const taken = act(placed, { type: 'collect', key: `p${id}` });
    expect(taken.daily.xp).toBe(placed.daily.xp + XP_SOURCES.placed.xp);
    expect(held(taken, `p${id}`)).toBeUndefined();
    // Clearing a building takes what it held with it.
    const cleared = act(placed, { type: 'paint', tool: 'clear', cells: [[x, y]] });
    expect(cleared.daily.opened).toEqual([]);
    expect(cleared.daily.since[id]).toBeUndefined();
    expect(collectables(cleared).some((one) => one.key === `p${id}`)).toBe(false);
    // Furniture is not a building.
    const [bx, by] = spotFor(start, 'bench');
    const bench = act(start, { type: 'place', building: 'bench', x: bx, y: by });
    expect(bench.daily.opened).toEqual([]);
    // A dozen in a day, and the thirteenth opens with no bonus: building and clearing is not a way to level.
    let state = start;
    for (let n = 0; n < OPENINGS_PER_DAY + 3; n++) {
      const [tx, ty] = spotFor(state, 'coffee', 4 + n, 30);
      state = act(state, { type: 'place', building: 'coffee', x: tx, y: ty });
    }
    expect(state.daily.opened).toHaveLength(OPENINGS_PER_DAY);
    // A day later the count begins again.
    const next = later(state, DAY + HOUR);
    const [nx, ny] = spotFor(next, 'coffee', 20, 30);
    expect(act(next, { type: 'place', building: 'coffee', x: nx, y: ny }).daily.opened).toHaveLength(OPENINGS_PER_DAY + 1);
  });

  it('shows Collect all from five ready buildings, and collects only what is ready', () => {
    const empty = act(model(), { type: 'collectAll' });
    const food = of(empty, 'dining');
    expect(food.length).toBeGreaterThanOrEqual(COLLECT_ALL_FROM);
    // Four ready: no button. Five: the button.
    const state = structuredClone(later(empty, 2 * HOUR));
    const ago = state.clock.tick - 10 * TICKS_PER_HOUR;
    for (const place of food.slice(0, COLLECT_ALL_FROM - 1)) state.daily.since[place.id] = ago;
    expect(readyToCollect(state)).toHaveLength(COLLECT_ALL_FROM - 1);
    expect(collectAllChip(state)).toBeNull();
    state.daily.since[food[COLLECT_ALL_FROM - 1]!.id] = ago;
    expect(collectAllChip(state)).toBe(`Collect all · ${COLLECT_ALL_FROM}`);
    // It takes the five. The rest go on filling from where they were.
    const other = food[COLLECT_ALL_FROM];
    const result = applyAction(state, { type: 'collectAll' });
    if (!result.ok) throw new Error(result.error);
    expect(result.gained!.count).toBe(COLLECT_ALL_FROM);
    if (other) expect(result.state.daily.since[other.id]).toBe(state.daily.since[other.id]);
  });
});

describe('Gold Seals and Finish now', () => {
  it('prices a wait by the time left: a Seal for every six hours, and never less than one', () => {
    expect(SEAL_HOURS).toBe(6);
    expect(sealPrice(1)).toBe(1);
    expect(sealPrice(6 * TICKS_PER_HOUR)).toBe(1);
    expect(sealPrice(6 * TICKS_PER_HOUR + 1)).toBe(2);
    expect(sealPrice(24 * TICKS_PER_HOUR)).toBe(4);
    expect(sealPrice(72 * TICKS_PER_HOUR)).toBe(12);
    // A new game waits for nothing: the layer adds no wait of its own.
    expect(waits(model())).toEqual([]);
    expect(waits(opened())).toEqual([]);
  });

  it('frees a policy held until the next class, for its price, after a confirm', () => {
    const base = ranked(120).state;
    const on = act(base, { type: 'policy', id: 'toughGrading', on: true });
    const wait = waits(on).find((one) => one.id === 'policy:toughGrading')!;
    expect(wait.name).toBe('Tough grading');
    expect(wait.ticksLeft).toBe(ticksToIntake(on.clock));
    expect(wait.price).toBe(sealPrice(ticksToIntake(on.clock)));
    expect(wait.detail).toMatch(/^Its switch is free again in /);
    // The price is said before the tap, and the tap asks once more.
    const view = levelView(on)!;
    expect(view.waits).toEqual([{ id: wait.id, name: wait.name, detail: wait.detail, price: wait.price, can: on.daily.seals >= wait.price }]);
    expect(finishConfirm(wait)).toBe(`Spend ${wait.price} Gold Seals to finish tough grading now?`);
    // Without the Seals it is refused, and says what it takes.
    const poor = structuredClone(on);
    poor.daily.seals = wait.price - 1;
    const refused = applyAction(poor, { type: 'finish', wait: wait.id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(`That takes ${wait.price} Gold Seals. You have ${wait.price - 1}.`);
    expect(levelView(poor)!.waits[0]!.can).toBe(false);
    // With them it is free at once, and can be switched again.
    const rich = structuredClone(on);
    rich.daily.seals = wait.price + 2;
    const done = act(rich, { type: 'finish', wait: wait.id });
    expect(done.daily.seals).toBe(2);
    expect(done.policies.locked).toEqual([]);
    expect(done.policies.on).toEqual(['toughGrading']);
    expect(waits(done)).toEqual([]);
    expect(applyAction(done, { type: 'policy', id: 'toughGrading', on: false }).ok).toBe(true);
    // There is nothing there to finish twice.
    expect(applyAction(done, { type: 'finish', wait: wait.id }).ok).toBe(false);
  });

  it('brings faculty on the way in at once', () => {
    const base = opened();
    const more = act(base, { type: 'instruction', step: 8 });
    const coming = nextSemesterStaff(more).faculty - more.staffing.faculty;
    expect(coming).toBeGreaterThan(100);
    const wait = waits(more).find((one) => one.id === 'faculty')!;
    expect(wait.name).toBe(`${coming.toLocaleString('en-US')} faculty on the way`);
    expect(wait.price).toBe(sealPrice(ticksToIntake(more.clock)));
    const rich = structuredClone(more);
    rich.daily.seals = wait.price;
    const done = act(rich, { type: 'finish', wait: 'faculty' });
    expect(done.daily.seals).toBe(0);
    expect(done.staffing.faculty).toBe(more.staffing.faculty + coming);
    expect(waits(done).some((one) => one.id === 'faculty')).toBe(false);
    // They are on the payroll from today, as they would have been from the next semester.
    expect(budget(done).spending).toBeGreaterThan(budget(more).spending);
    // The semester's own arrival finds them already there and brings nobody twice.
    const spring = advance(done, done.clock.lastSimulatedAt, T0 + 3 * DAY + 5 * MIN).state;
    const plain = advance(more, more.clock.lastSimulatedAt, T0 + 3 * DAY + 5 * MIN).state;
    expect(spring.staffing.faculty).toBe(plain.staffing.faculty);
  });

  it('opens a stadium tier that is going up, on the next minute', () => {
    const state = opened();
    const done = state.clock.tick + 24 * TICKS_PER_HOUR;
    state.football.stadium.work = { tier: 1, done };
    addTimer(state, done, 'stadiumDone', 1);
    state.daily.seals = 10;
    const wait = waits(state).find((one) => one.id === 'stadium')!;
    expect(wait).toMatchObject({ name: 'Stadium tier 1', price: 4, ticksLeft: 24 * TICKS_PER_HOUR });
    const finished = act(state, { type: 'finish', wait: 'stadium' });
    expect(finished.daily.seals).toBe(6);
    const next = advance(finished, finished.clock.lastSimulatedAt, finished.clock.lastSimulatedAt + MIN);
    expect(next.state.football.stadium.tier).toBe(1);
    expect(next.state.football.stadium.work).toBeNull();
    expect(next.log.filter((entry) => entry.kind === 'football' && entry.data?.tier === 1)).toHaveLength(1);
    // It does not open a second time when the day it would have opened comes.
    const dayAfter = advance(next.state, next.state.clock.lastSimulatedAt, next.state.clock.lastSimulatedAt + 2 * DAY);
    expect(dayAfter.log.filter((entry) => entry.kind === 'football' && entry.data?.tier === 1)).toHaveLength(0);
    expect(dayAfter.state.timers.some((timer) => timer.kind === 'stadiumDone')).toBe(false);
  });
});

describe('the Level page and the paper', () => {
  it('says how far to the next level, what feeds it and what the next level gives', () => {
    const state = model();
    expect(levelChip(state)).toEqual({ level: 1, seals: 0, percent: 0 });
    const view = levelView(state)!;
    expect(view.title).toBe('University Level 1');
    expect(view.line).toBe(`0 of ${LEVEL_FIRST} experience to Level 2`);
    expect(view.next).toBe(`Level 2 gives ${giftWords(levelGifts(2))}.`);
    expect(view.seals).toBe(0);
    expect(view.waits).toEqual([]);
    // Every source is listed, the ones that happen by themselves first, each with what it pays.
    expect(view.feeds).toHaveLength(Object.keys(XP_SOURCES).length);
    const firstByHand = view.feeds.findIndex((feed) => !feed.itself);
    expect(view.feeds.slice(0, firstByHand).every((feed) => feed.itself)).toBe(true);
    expect(view.feeds.slice(firstByHand).every((feed) => !feed.itself)).toBe(true);
    expect(view.feeds.find((feed) => feed.name === 'Graduation')!.value).toBe(`+${XP_SOURCES.graduation.xp}`);
    expect(view.feeds.find((feed) => feed.name === 'Collecting from a building')!.value).toBe(`up to +${Math.floor(COLLECT.store!.xpPerHour * COLLECT_HOURS)}`);
    expect(view.ready!.count).toBe(collectables(state).length);
    expect(view.ready!.line).toMatch(/^\d+ buildings are ready to collect: \+\d+ experience and \$[\d.]+K\.$/);
    for (const text of [view.title, view.line, view.next, view.ready!.line, ...view.feeds.map((feed) => feed.name)]) expect(toneProblem(text), text).toBeNull();
    // Part of the way into a level.
    const part = structuredClone(state);
    gainXp(part, LEVEL_FIRST + 25);
    expect(levelChip(part)).toEqual({ level: 2, seals: SEALS_PER_LEVEL, percent: Math.round((100 * 25) / levelCost(2)) });
    expect(levelView(part)!.line).toBe(`25 of ${levelCost(2)} experience to Level 3`);
    // A source a later stop adds is one more entry, and the page lists it.
    const sources = XP_SOURCES as Record<string, XpSource>;
    sources.testOrder = { name: 'An order done', xp: 120, itself: false };
    try {
      expect(levelView(state)!.feeds.find((feed) => feed.name === 'An order done')).toEqual({ name: 'An order done', value: '+120', itself: false });
    } finally {
      delete sources.testOrder;
    }
  });

  it('puts a level reached in the paper: one line, or the last of several with how many', () => {
    const state = model();
    const one: LogEntry[] = [];
    gainXp(state, LEVEL_FIRST, one);
    expect(awayLines(one, facts(state)).map((line) => line.text)).toContain(`Test University reaches University Level 2: ${giftWords(levelGifts(2))}.`);
    gainXp(state, levelCost(2), one);
    const lines = awayLines(one, facts(state)).map((line) => line.text);
    expect(lines).toContain(`2 levels up. Test University reaches University Level 3: ${giftWords(levelGifts(3))}.`);
    expect(lines.filter((line) => /University Level/.test(line))).toHaveLength(1);
    // A line waiting from an action is told once.
    const waiting = model();
    waiting.daily.news = ['Test University reaches University Level 2: 1 Gold Seal.'];
    const told: LogEntry[] = [];
    tellDaily(waiting, told);
    tellDaily(waiting, told);
    expect(told).toHaveLength(1);
  });
});

describe('a save from version 17', () => {
  const text = readFileSync(new URL('./fixtures/save-v17-model.json', import.meta.url), 'utf8');

  it("comes through with nothing moved: the owner's own kind of game, early in year 1 with no rank goal yet", () => {
    const file = JSON.parse(text) as { v: number; state: GameState };
    expect(file.v).toBe(17);
    expect(file.state.school.name).toBe('Larp University');
    expect(file.state.map.scale).toBe(28);
    expect(file.state.clock.week.year).toBe(1);
    expect(file.state.goals).toEqual({ size: 0, rank: 0, reached: [], rewards: 0 });
    expect(file.state.daily).toBeUndefined();

    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const state = loaded.state;
    expect(loaded.migratedFrom).toBe(17);
    // It has reached no goal and seen no graduation, so it begins where a new game does: level 1, no Seals.
    expect(state.daily).toEqual(newDaily(file.state.clock.tick));
    const expected = structuredClone(file.state);
    expected.version = SAVE_VERSION;
    expected.daily = newDaily(file.state.clock.tick);
    // Version 19 adds the orders board and its stream of numbers (tests/orders.test.ts has those).
    expected.orders = state.orders;
    // Version 20 adds the decorations in storage and the Workshop (tests/decor.test.ts has those).
    expected.decor = state.decor;
    expected.rhythm = state.rhythm;
    expected.bigBuilds = state.bigBuilds;
    expected.labs = state.labs;
    expected.traditions = state.traditions;
    expected.greek = newGreek();
    expected.rng.orders = state.rng.orders;
    // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
    expected.alumni = state.alumni;
    // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
    expected.story = newStory();
    expected.social = newSocial();
    expect(state).toEqual(expected);
    expect(validate(state)).toBeNull();
    // Its money is what it was the moment before.
    const books = budget(state);
    expect(books.spending).toBeCloseTo(file.state.money.spendingPerYear, 4);
    expect(books.incomeTotal).toBeCloseTo(file.state.money.incomePerYear, 4);
    // And every food place and store is full, so there is something to collect the day it loads.
    const ready = readyToCollect(state);
    expect(ready.length).toBeGreaterThan(5);
    expect(ready.every((one) => one.full === 1 && one.lost === 0)).toBe(true);
    expect(levelChip(state)).toEqual({ level: 1, seals: 0, percent: 0 });
    expect(validate(advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state)).toBeNull();
  });

  it('that has reached goals and seen graduations is given their experience and Seals, so nobody starts behind', () => {
    const file = JSON.parse(text) as { v: number; savedAt: number; state: GameState };
    file.state.goals = {
      size: 1,
      rank: 3,
      rewards: 0,
      reached: [
        { ladder: 'rank', n: 0, year: 1 },
        { ladder: 'rank', n: 1, year: 2 },
        { ladder: 'size', n: 0, year: 2 },
        { ladder: 'rank', n: 2, year: 5 },
        { ladder: 'era', n: 1, year: 5 },
      ],
    };
    let graduations = 0;
    for (const record of file.state.classes.slice(0, 2)) {
      record.finishedOnTime = Math.max(1, record.entered - 100);
      graduations += 1;
    }
    const loaded = parseSave(JSON.stringify(file));
    if (!loaded.ok) throw new Error(loaded.reason);
    const daily = loaded.state.daily;
    const xp = 3 * XP_SOURCES.rankGoal.xp + XP_SOURCES.sizeGoal.xp + XP_SOURCES.era.xp + graduations * XP_SOURCES.graduation.xp;
    expect(daily.xp).toBe(xp);
    expect(daily.level).toBe(levelAt(xp).level);
    let forLevels = 0;
    for (let level = 2; level <= daily.level; level++) for (const gift of levelGifts(level)) if (gift.kind === 'seals') forLevels += gift.count;
    expect(daily.seals).toBe(3 * SEALS_RANK_GOAL + SEALS_SIZE_GOAL + SEALS_ERA + forLevels);
    // It simply loads at its level: no line is owed for it.
    expect(daily.news).toEqual([]);
    expect(advance(loaded.state, loaded.state.clock.lastSimulatedAt, loaded.state.clock.lastSimulatedAt + MIN).log.filter((entry) => entry.kind === 'level')).toEqual([]);
    // Saved and loaded again, it is not paid twice.
    const again = parseSave(serialize(loaded.state, file.savedAt));
    if (!again.ok) throw new Error(again.reason);
    expect(again.state.daily).toEqual(daily);
    // On a game with no goals there is nothing to pay.
    const small = freshGame();
    backPay(small);
    expect(small.daily).toEqual(newDaily(0));
  });

  it('keeps the level, the Seals and what was collected through a save and a load', () => {
    const played = later(act(opened(), { type: 'collectAll' }), 9 * HOUR);
    const loaded = parseSave(serialize(played, T0 + 3 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state.daily).toEqual(played.daily);
    expect(loaded.state).toEqual(played);
    expect(collectables(loaded.state)).toEqual(collectables(played));
  });

  it('is told what is new, once', () => {
    // Its own, and the ones versions 19 and 20 added after it (tests/orders.test.ts, tests/decor.test.ts).
    const notes = upgradeNotes(17);
    expect(notes).toHaveLength(13);
    expect(notes[0]).toContain('University Level');
    expect(toneProblem(notes[0]!)).toBeNull();
    expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
  });
});
