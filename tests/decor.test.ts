import { newGreek } from '../src/sim/systems/greek';
import { newSocial } from '../src/sim/systems/social';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  awayLines,
  budget,
  CRAFT_XP,
  craftsReady,
  DECOR,
  DECOR_CAP,
  DECOR_POINT,
  DECOR_REACH,
  decorCounts,
  decorLift,
  decorOffer,
  decorOffers,
  decorOwned,
  decorSprite,
  enrollment,
  hasMakerspace,
  LEVEL_UNLOCKS,
  liveSeason,
  newDecor,
  newGame,
  ORDER_KINDS,
  orderViews,
  ownedAt,
  parseSave,
  PLACED,
  previewDecor,
  recipesOpen,
  SAVE_VERSION,
  scaleOf,
  SCHOOL_COLOURS,
  SEASON_SETS,
  seasonDates,
  serialize,
  TICKS_PER_HOUR,
  toneProblem,
  TOWN_DECOR_EACH,
  TOWN_DECOR_XP,
  townGift,
  validate,
  waits,
  WORKSHOP_BENCHES,
  WORKSHOP_SECOND_SEALS,
  workshopOpen,
  workshopView,
  type DecorSpec,
  type GameState,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { captionLayout, photoFileName } from '../src/app/photo';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DECOR_ENTRY, WORKSHOP_ENTRY, decorEntries, decorPanel, decorPlacedWords, decorPlacingLine, liftedCount, liftsNear, photoCaption, workshopPage } from '../src/ui/decorUi';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/**
 * Decorations, the Workshop and the seasonal sets (DESIGN.md 42.5 and 42.6,
 * as built from 42.20). A decoration lifts how the campus looks near it a
 * little and does nothing else. Nothing is ever sold or lost.
 */

const model = (seed = 35, now = T0): GameState => newGame({ seed, name: 'Test University', now, campus: 'model' });
const BASE = model();
/** A model campus at a level that has opened every shelf and every recipe. */
function fresh(level = 80, seals = 0): GameState {
  const state = structuredClone(BASE);
  state.daily.level = level;
  state.daily.seals = seals;
  return state;
}

function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const refuse = (state: GameState, action: Parameters<typeof applyAction>[1]): string => {
  const result = applyAction(state, action);
  return result.ok ? '' : result.error;
};

const later = (state: GameState, ms: number) => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);
const facts = (state: GameState) => ({ minutes: 600, cashBefore: state.money.cash, cashAfter: state.money.cash, studentsBefore: enrollment(state), studentsAfter: enrollment(state) });
const spec = (id: string): DecorSpec => DECOR.find((one) => one.id === id)!;
const of = (kind: DecorSpec['home']['kind']): DecorSpec[] => DECOR.filter((one) => one.home.kind === kind);
const free = (state: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < state.map.width && y < state.map.height && state.map.cells[y * state.map.width + x]!.kind === 'empty' && ownedAt(state.map, x, y);

/** Free ground exactly `far` cells from a lot, counting diagonals as one. */
function ring(state: GameState, lot: { x: number; y: number }, far: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let dy = -far; dy <= far; dy++) {
    for (let dx = -far; dx <= far; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === far && free(state, lot.x + dx, lot.y + dy)) out.push([lot.x + dx, lot.y + dy]);
    }
  }
  return out;
}

/** A dorm or a lecture hall with free ground right beside it: two cells of it, or as many as are asked for. */
function quietLot(state: GameState, beside = 2): { x: number; y: number } {
  const lot = state.map.buildings.find((building) => building && building.stage >= 1 && ring(state, building, 1).length >= beside);
  if (!lot) throw new Error('no lot with free ground beside it');
  return { x: lot.x, y: lot.y };
}

const placedDecor = (state: GameState) => state.map.placed.filter((placed) => placed && placed.type === 'decor').map((placed) => placed!);

describe('the decorations, as data', () => {
  it('has the forty the owner chose and two seasonal sets, each with a home', () => {
    const launch = DECOR.filter((one) => one.home.kind !== 'season');
    expect(launch).toHaveLength(40);
    expect(new Set(DECOR.map((one) => one.id)).size).toBe(DECOR.length);
    expect(new Set(DECOR.map((one) => one.sprite)).size).toBe(DECOR.length);
    expect(of('shelf')).toHaveLength(20);
    expect(of('town')).toHaveLength(6);
    expect(of('workshop')).toHaveLength(7);
    expect(of('seals')).toHaveLength(6);
    // The stone statue is kept back for the Founder's Pack.
    expect(of('founder').map((one) => one.id)).toEqual(['statue']);
    const sets = (id: string): number => DECOR.filter((one) => one.home.kind === 'season' && one.home.season === id).length;
    expect(sets('fall')).toBe(5);
    expect(sets('summer')).toBe(6);
    // Winter and spring have no art, so they have no set and nothing stands in.
    expect(SEASON_SETS.map((set) => set.id).sort()).toEqual(['fall', 'summer']);
    for (const one of DECOR) {
      expect(toneProblem(one.name), one.name).toBeNull();
      expect(one.a.length).toBeGreaterThan(3);
      if (one.home.kind === 'shelf' || one.home.kind === 'workshop' || one.home.kind === 'season') expect(one.home.cost).toBeGreaterThan(0);
      if (one.home.kind === 'seals') expect(one.home.price).toBeGreaterThan(0);
      // A craft takes a day or two.
      if (one.home.kind === 'workshop') expect([24, 36, 48]).toContain(one.home.hours);
    }
    // Only the banner takes the school's colour: the one altered drawing.
    expect(DECOR.filter((one) => one.colour).map((one) => one.id)).toEqual(['banner']);
    for (const colour of SCHOOL_COLOURS) {
      const state = fresh();
      state.football.colour = colour.id;
      expect(decorSprite(state, 'banner')).toBe(`decoration.banner.${colour.id}`);
    }
    expect(decorSprite(BASE, 'sofa')).toBe('decoration.sofa');
  });

  it('opens the shelf and the recipes by level, one new thing at a time', () => {
    const levels = of('shelf').map((one) => (one.home.kind === 'shelf' ? one.home.level : 0));
    expect(Math.min(...levels)).toBe(2);
    expect(Math.max(...levels)).toBe(60);
    expect(new Set(levels).size).toBe(levels.length);
    for (const one of [...of('shelf'), ...of('workshop')]) {
      const level = one.home.kind === 'shelf' || one.home.kind === 'workshop' ? one.home.level : 0;
      const gifts = LEVEL_UNLOCKS[level] ?? [];
      const what = one.home.kind === 'shelf' ? 'decoration' : 'recipe';
      expect(gifts.some((gift) => gift.kind === 'unlock' && gift.what === what && gift.id === one.id), one.id).toBe(true);
    }
    // No level brings two new things: an order, a place on the board, a decoration or a recipe.
    for (const [level, gifts] of Object.entries(LEVEL_UNLOCKS)) expect(gifts.length, `level ${level}`).toBe(1);
    // A new thing nearly every level through the first month, and the first recipe within the first week.
    const through30 = Object.keys(LEVEL_UNLOCKS).filter((level) => Number(level) <= 31).length;
    expect(through30).toBeGreaterThanOrEqual(25);
    expect(Math.min(...of('workshop').map((one) => (one.home.kind === 'workshop' ? one.home.level : 99)))).toBeLessThanOrEqual(10);
    expect(recipesOpen(fresh(1))).toEqual([]);
    expect(recipesOpen(fresh(80))).toHaveLength(7);
  });

  it('takes a new decoration as one more row', () => {
    const list = DECOR as DecorSpec[];
    list.push({ id: 'testGnome', name: 'Garden gnome', a: 'a garden gnome', sprite: 'decoration.flowers', group: 'Seating and small things', home: { kind: 'shelf', level: 3, cost: 500 } });
    try {
      const state = fresh(3);
      const lot = quietLot(state);
      const [x, y] = ring(state, lot, 1)[0]!;
      const placed = act(state, { type: 'placeDecor', id: 'testGnome', x, y });
      expect(placed.money.cash).toBe(state.money.cash - 500 * scaleOf(state));
      expect(decorLift(placed.map, lot.x, lot.y)).toBeCloseTo(DECOR_POINT * 0.75);
      expect(decorEntries(placed).some((entry) => entry.id === `${DECOR_ENTRY}testGnome` && entry.name === 'Garden gnome')).toBe(true);
      expect(decorPanel(placedDecor(placed)[0]!)).toEqual({ title: 'Garden gnome', turns: false });
    } finally {
      list.pop();
    }
  });
});

describe('what a decoration does', () => {
  it('lifts how a lot looks through one input with one cap, and a second of the same kind adds nothing', () => {
    const state = fresh();
    const lot = quietLot(state);
    const index = lot.y * state.map.width + lot.x;
    const beside = ring(state, lot, 1);
    expect(decorLift(state.map, lot.x, lot.y)).toBe(0);
    const one = act(state, { type: 'placeDecor', id: 'flowers', x: beside[0]![0], y: beside[0]![1] });
    // Right beside the lot it is three quarters of a point, and the lot's own score has it.
    expect(decorLift(one.map, lot.x, lot.y)).toBeCloseTo(0.75 * DECOR_POINT);
    expect(one.map.score[index]! - state.map.score[index]!).toBeCloseTo(0.75 * DECOR_POINT);
    // A second pot of flowers beside the first adds nothing: it is variety that lifts a campus.
    const same = act(one, { type: 'placeDecor', id: 'flowers', x: beside[1]![0], y: beside[1]![1] });
    expect(decorLift(same.map, lot.x, lot.y)).toBeCloseTo(0.75 * DECOR_POINT);
    // Another kind does.
    const two = act(one, { type: 'placeDecor', id: 'globeLamp', x: beside[1]![0], y: beside[1]![1] });
    expect(decorLift(two.map, lot.x, lot.y)).toBeCloseTo(1.5 * DECOR_POINT);
    // It fades with distance, to nothing just past its reach.
    const far = ring(state, lot, DECOR_REACH)[0];
    if (far) {
      const edge = act(state, { type: 'placeDecor', id: 'flowers', x: far[0], y: far[1] });
      expect(decorLift(edge.map, lot.x, lot.y)).toBeCloseTo(0.25 * DECOR_POINT);
    }
    expect(PLACED.decor.radius).toBe(DECOR_REACH);
  });

  it('never adds more than the cap, which free decorations alone can reach', () => {
    let state = fresh();
    // Four kinds right beside a lot are the whole cap. The model campus has lots with that much free ground.
    const lot = quietLot(state, 4);
    // Things from the Decor shelf alone, a different one on every free cell near the lot.
    const kinds = of('shelf').map((one) => one.id);
    const spots = [...ring(state, lot, 1), ...ring(state, lot, 2)];
    let n = 0;
    for (const [x, y] of spots.slice(0, kinds.length)) {
      state = act(state, { type: 'placeDecor', id: kinds[n]!, x, y });
      n += 1;
      expect(decorLift(state.map, lot.x, lot.y)).toBeLessThanOrEqual(DECOR_CAP + 1e-9);
    }
    expect(n).toBeGreaterThanOrEqual(5);
    expect(decorLift(state.map, lot.x, lot.y)).toBeCloseTo(DECOR_CAP);
    expect(4 * 0.75 * DECOR_POINT).toBeGreaterThanOrEqual(DECOR_CAP);
    // Not one of them cost a Gold Seal.
    expect(state.daily.seals).toBe(0);
    expect(DECOR_CAP).toBeLessThanOrEqual(5);
  });

  it('gives a decoration bought with Gold Seals exactly what a free one of its size gives', () => {
    const state = fresh(80, 50);
    const lot = quietLot(state);
    const [x, y] = ring(state, lot, 1)[0]!;
    const cash = act(state, { type: 'placeDecor', id: 'flowers', x, y });
    const seals = act(state, { type: 'placeDecor', id: 'windmill', x, y });
    expect(decorLift(seals.map, lot.x, lot.y)).toBe(decorLift(cash.map, lot.x, lot.y));
    expect(seals.map.score).toEqual(cash.map.score);
  });

  it('costs nothing to keep and changes nothing else: what the campus keeps of every $100 is the same', () => {
    const state = fresh();
    const lot = quietLot(state);
    const [x, y] = ring(state, lot, 1)[0]!;
    const before = budget(state);
    const placed = act(state, { type: 'placeDecor', id: 'sofa', x, y });
    const after = budget(placed);
    expect(after.spending).toBe(before.spending);
    expect(after.incomeTotal).toBe(before.incomeTotal);
    expect(after.kept).toBe(before.kept);
    expect(PLACED.decor.upkeepPerYear).toBe(0);
    // It is not a building that opens: nothing to collect, and no experience for placing it.
    expect(placed.daily).toEqual(state.daily);
  });

  it('is not there at all on a game with no goals', () => {
    const small = freshGame();
    expect(small.decor).toEqual(newDecor());
    expect(decorOffers(small)).toEqual([]);
    expect(decorOffer(small, 'flowers')).toBeNull();
    expect(decorEntries(small)).toEqual([]);
    expect(workshopView(small)).toBeNull();
    expect(workshopOpen(small)).toBe(false);
    expect(refuse(small, { type: 'placeDecor', id: 'flowers', x: 5, y: 5 })).toBe('This campus has no decorations.');
    expect(refuse(small, { type: 'setRecipe', bench: 0, recipe: 'bunting' })).toBe('This campus has no decorations.');
    const week = later(small, 9 * DAY);
    expect(week.state.decor).toEqual(newDecor());
    expect(week.log.filter((entry) => entry.kind === 'season' || entry.kind === 'craft')).toEqual([]);
  });
});

describe('getting, placing, moving and putting away', () => {
  it('sells the Decor shelf for cash on the campus\'s own count, once its level is reached', () => {
    const low = fresh(1);
    const lot = quietLot(low);
    const [x, y] = ring(low, lot, 1)[0]!;
    expect(decorOffer(low, 'flowers')).toMatchObject({ way: null, locked: 'Level 2' });
    expect(refuse(low, { type: 'placeDecor', id: 'flowers', x, y })).toBe('Red flowers: Level 2.');
    const state = fresh(2);
    expect(decorOffer(state, 'flowers')).toMatchObject({ way: 'cash', cost: 600 * scaleOf(state), locked: '' });
    const placed = act(state, { type: 'placeDecor', id: 'flowers', x, y });
    expect(placed.money.cash).toBe(state.money.cash - 600 * scaleOf(state));
    expect(placedDecor(placed)).toMatchObject([{ type: 'decor', decor: 'flowers', x, y, w: 1, h: 1 }]);
    expect(decorOwned(placed, 'flowers')).toBe(1);
    expect(placed.decor.tally).toMatchObject({ bought: 1, placed: 1 });
    // It needs empty ground on the campus's own land, and the money.
    expect(refuse(placed, { type: 'placeDecor', id: 'flowers', x, y })).toBe('Something is in the way. It needs empty ground.');
    expect(refuse(state, { type: 'placeDecor', id: 'flowers', x: -1, y: 0 })).toBe('That does not fit on your land.');
    const poor = structuredClone(state);
    poor.money.cash = 10;
    expect(refuse(poor, { type: 'placeDecor', id: 'flowers', x, y })).toMatch(/^That costs \$16,800\. You have \$10\.$/);
    expect(previewDecor(poor, 'flowers', x, y)).toMatchObject({ way: 'cash', problem: 'cash' });
    expect(refuse(state, { type: 'placeDecor', id: 'noSuchThing', x, y })).toBe('There is no such decoration.');
  });

  it('sells the special ones for Gold Seals, and keeps the Founder\'s statue back', () => {
    const state = fresh(1, 20);
    const lot = quietLot(state);
    const [x, y] = ring(state, lot, 1)[0]!;
    // The Seal shelf is open from the first day: it is about looks, not levels.
    expect(decorOffer(state, 'sculpture')).toMatchObject({ way: 'seals', seals: 6, cost: 0, locked: '' });
    const placed = act(state, { type: 'placeDecor', id: 'sculpture', x, y });
    expect(placed.daily.seals).toBe(14);
    expect(placed.money.cash).toBe(state.money.cash);
    expect(placed.decor.tally).toMatchObject({ boughtSeals: 1, sealsSpent: 6 });
    expect(refuse(fresh(1, 5), { type: 'placeDecor', id: 'sculpture', x, y })).toBe('That takes 6 Gold Seals. You have 5.');
    expect(decorOffer(state, 'statue')).toMatchObject({ way: null, locked: "With the Founder's Pack, later" });
    expect(refuse(fresh(99, 999), { type: 'placeDecor', id: 'statue', x, y })).toBe("Stone statue: With the Founder's Pack, later.");
    // What only the town gives, or only the Workshop makes, is not sold.
    expect(decorOffer(state, 'flowerBox')).toMatchObject({ way: null, locked: "From the town's orders" });
    expect(decorOffer(fresh(80), 'bunting')).toMatchObject({ way: null, locked: 'Made in the Workshop' });
    expect(decorOffer(fresh(1), 'bunting')).toMatchObject({ way: null, locked: 'Workshop recipe at Level 19' });
  });

  it('moves one for nothing, turns the ones that run one way, and never loses one', () => {
    const state = fresh();
    const lot = quietLot(state);
    const [[x, y], [x2, y2]] = ring(state, lot, 1) as [[number, number], [number, number]];
    const placed = act(state, { type: 'placeDecor', id: 'stoneWall', x, y, flip: true });
    const wall = placedDecor(placed)[0]!;
    expect(wall.flip).toBe(true);
    const cash = placed.money.cash;
    // Moving is free, and it keeps the way it faces.
    const moved = act(placed, { type: 'moveDecor', placed: wall.id, x: x2, y: y2 });
    expect(moved.money.cash).toBe(cash);
    expect(placedDecor(moved)).toMatchObject([{ decor: 'stoneWall', x: x2, y: y2, flip: true }]);
    expect(moved.map.cells[y * moved.map.width + x]!.kind).toBe('empty');
    expect(decorOwned(moved, 'stoneWall')).toBe(1);
    const there = placedDecor(moved)[0]!;
    expect(refuse(moved, { type: 'moveDecor', placed: there.id, x: lot.x, y: lot.y })).toBe('Something is in the way. It needs empty ground.');
    // Turning.
    const turned = act(moved, { type: 'turnDecor', placed: there.id });
    expect(placedDecor(turned)[0]!.flip).toBeUndefined();
    expect(placedDecor(act(turned, { type: 'turnDecor', placed: there.id }))[0]!.flip).toBe(true);
    const pot = act(state, { type: 'placeDecor', id: 'flowers', x, y });
    expect(refuse(pot, { type: 'turnDecor', placed: placedDecor(pot)[0]!.id })).toBe('That one looks the same from every side.');
    // Putting away sends it to storage. Placing from storage is free.
    const away = act(moved, { type: 'storeDecor', placed: there.id });
    expect(placedDecor(away)).toEqual([]);
    expect(away.decor.stored.stoneWall).toBe(1);
    expect(away.money.cash).toBe(cash);
    expect(decorLift(away.map, lot.x, lot.y)).toBe(0);
    expect(decorOffer(away, 'stoneWall')).toMatchObject({ way: 'storage', stored: 1 });
    const back = act(away, { type: 'placeDecor', id: 'stoneWall', x, y });
    expect(back.money.cash).toBe(cash);
    expect(back.decor.stored.stoneWall).toBe(0);
    // The Clear tool puts one away too: nothing comes back in cash, and nothing is lost.
    const cleared = act(back, { type: 'paint', tool: 'clear', cells: [[x, y]] });
    expect(cleared.money.cash).toBe(cash);
    expect(cleared.decor.stored.stoneWall).toBe(1);
    expect(placedDecor(cleared)).toEqual([]);
    expect(refuse(cleared, { type: 'storeDecor', placed: 9999 })).toBe('That is not a decoration.');
  });

  it('gives a town order\'s decoration: the one the campus holds fewest of, then experience when it has them all', () => {
    const town = of('town').map((one) => one.id);
    expect(townGift(BASE)).toBe(town[0]);
    const some = fresh();
    some.decor.stored[town[0]!] = 1;
    expect(townGift(some)).toBe(town[1]);
    const all = fresh();
    for (const id of town) all.decor.stored[id] = TOWN_DECOR_EACH;
    expect(townGift(all)).toBeNull();
    // On the board: a planting order pays a decoration and some experience, and experience alone once the town has no more.
    const board = (state: GameState): string => {
      const asked = structuredClone(state);
      asked.orders.open = [{ id: 900, giver: 'town', roll: 0, offered: asked.clock.tick }];
      for (const kind of ORDER_KINDS) if (kind.giver === 'town' && kind.id !== 'plantTrees') asked.orders.rest[kind.id] = asked.clock.tick + 1e9;
      return orderViews(act(asked, { type: 'seeOrders' })).find((view) => view.id === 900)!.reward;
    };
    expect(board(fresh())).toBe('a flower box and 60 experience');
    expect(board(all)).toBe(`${60 + TOWN_DECOR_XP} experience`);
  });
});

describe('the seasonal sets', () => {
  const on = (year: number, month: number, day: number): GameState => model(35, Date.UTC(year, month - 1, day, 12));

  it('are live by the real calendar, the same days every year', () => {
    expect(liveSeason(on(2026, 11, 13))?.id).toBe('fall');
    expect(liveSeason(on(2026, 10, 1))?.id).toBe('fall');
    expect(liveSeason(on(2027, 11, 30))?.id).toBe('fall');
    expect(liveSeason(on(2026, 12, 1))).toBeNull();
    expect(liveSeason(on(2027, 1, 15))).toBeNull();
    expect(liveSeason(on(2027, 4, 10))).toBeNull();
    expect(liveSeason(on(2027, 6, 14))).toBeNull();
    expect(liveSeason(on(2027, 6, 15))?.id).toBe('summer');
    expect(liveSeason(on(2028, 8, 15))?.id).toBe('summer');
    expect(liveSeason(on(2028, 8, 16))).toBeNull();
    expect(seasonDates(SEASON_SETS.find((set) => set.id === 'fall')!)).toBe('1 October to 30 November');
    expect(seasonDates(SEASON_SETS.find((set) => set.id === 'summer')!)).toBe('15 June to 15 August');
  });

  it('sell their decorations while they are live, and what was bought stays for good', () => {
    const fall = on(2026, 11, 13);
    const lot = quietLot(fall);
    const [x, y] = ring(fall, lot, 1)[0]!;
    expect(decorOffer(fall, 'pumpkins')).toMatchObject({ way: 'cash', cost: 800 * scaleOf(fall) });
    expect(decorOffer(fall, 'lounger')).toMatchObject({ way: null, locked: 'Summer set: 15 June to 15 August' });
    const bought = act(fall, { type: 'placeDecor', id: 'pumpkins', x, y });
    // Winter comes. The pumpkins stay where they are, can be moved and put away, and are free to place again.
    const winter = later(bought, 40 * DAY).state;
    expect(liveSeason(winter)).toBeNull();
    expect(placedDecor(winter)).toMatchObject([{ decor: 'pumpkins' }]);
    expect(decorOffer(winter, 'pumpkins')).toMatchObject({ way: null, placed: 1, locked: 'Fall set: 1 October to 30 November' });
    const away = act(winter, { type: 'storeDecor', placed: placedDecor(winter)[0]!.id });
    expect(decorOffer(away, 'pumpkins')).toMatchObject({ way: 'storage', stored: 1 });
    expect(act(away, { type: 'placeDecor', id: 'pumpkins', x, y }).money.cash).toBe(away.money.cash);
    expect(refuse(winter, { type: 'placeDecor', id: 'hayBales', x: x, y: y })).toMatch(/Something is in the way|Hay bales: Fall set/);
  });

  it('are told in the paper once when a set opens, and come back the next year', () => {
    const before = on(2026, 9, 29);
    expect(before.decor.season).toBe('');
    const opened = later(before, 4 * DAY);
    const lines = opened.log.filter((entry) => entry.kind === 'season');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('The fall set is on the Decor shelf until 30 November: 5 decorations for the season. What you buy is yours for good, and the set comes back every year.');
    expect(toneProblem(lines[0]!.text)).toBeNull();
    expect(opened.state.decor.season).toBe('fall');
    expect(awayLines(opened.log, facts(opened.state)).map((line) => line.text)).toContain(lines[0]!.text);
    // Nothing more is said while it is live, nothing when it closes, and it is told again when summer opens.
    const year = later(opened.state, 300 * DAY);
    const told = year.log.filter((entry) => entry.kind === 'season').map((entry) => entry.text.slice(0, 14));
    expect(told).toEqual(['The summer set']);
    const again = later(year.state, 80 * DAY);
    expect(again.log.filter((entry) => entry.kind === 'season').map((entry) => entry.text.slice(0, 12))).toEqual(['The fall set']);
  });
});

describe('the Workshop', () => {
  const made = (id: string) => spec(id).home as { kind: 'workshop'; level: number; hours: number; cost: number };

  it('is in the Makerspace, and makes what the levels have brought', () => {
    expect(hasMakerspace(BASE)).toBe(true);
    expect(workshopOpen(fresh(1))).toBe(false);
    expect(workshopOpen(fresh(8))).toBe(true);
    expect(refuse(fresh(8), { type: 'setRecipe', bench: 0, recipe: 'bunting' })).toBe('Bunting is a recipe for Level 19.');
    expect(refuse(fresh(), { type: 'setRecipe', bench: 0, recipe: 'flowers' })).toBe('The Workshop cannot make that.');
    expect(refuse(fresh(), { type: 'setRecipe', bench: 1, recipe: 'bunting' })).toBe('The Workshop has no such bench.');
    // A campus with no Makerspace has no Workshop until it builds one, and is told so.
    const none = fresh();
    const shop = none.map.placed.find((placed) => placed && placed.type === 'makerspace')!;
    const cleared = act(none, { type: 'paint', tool: 'clear', cells: [[shop.x, shop.y]] });
    expect(hasMakerspace(cleared)).toBe(false);
    expect(workshopOpen(cleared)).toBe(false);
    expect(refuse(cleared, { type: 'setRecipe', bench: 0, recipe: 'bunting' })).toBe('The Workshop is in the Makerspace. Build one first.');
    expect(workshopPage(cleared)).toMatchObject({ makerspace: false, lead: 'The Workshop is in the Makerspace, and this campus has none. Build one and it opens.' });
    expect(decorEntries(cleared).find((entry) => entry.id === WORKSHOP_ENTRY)).toMatchObject({ cost: 'Needs a Makerspace' });
  });

  it('makes one thing at a time, a day or two each, and says in the paper when it is ready', () => {
    const state = fresh();
    const set = act(state, { type: 'setRecipe', bench: 0, recipe: 'bunting' });
    const hours = made('bunting').hours;
    expect(set.money.cash).toBe(state.money.cash - made('bunting').cost * scaleOf(state));
    expect(set.decor.benches[0]).toEqual({ recipe: 'bunting', making: 'bunting', done: state.clock.tick + hours * TICKS_PER_HOUR });
    expect(workshopView(set)!.benches[0]).toMatchObject({ making: 'Bunting', recipe: 'Bunting', ready: false, line: 'Ready in 1 d' });
    expect(craftsReady(set)).toBe(0);
    expect(refuse(set, { type: 'collectCraft', bench: 0 })).toBe('That is ready in 1 d.');
    // Choosing another recipe now is for the next one: what is on the bench is finished first.
    const changed = act(set, { type: 'setRecipe', bench: 0, recipe: 'stage' });
    expect(changed.decor.benches[0]).toMatchObject({ recipe: 'stage', making: 'bunting' });
    expect(changed.money.cash).toBe(set.money.cash);
    const done = later(set, hours * HOUR + MIN);
    const lines = done.log.filter((entry) => entry.kind === 'craft');
    expect(lines.map((entry) => entry.text)).toEqual(['A run of bunting is ready at the Workshop.']);
    expect(toneProblem(lines[0]!.text)).toBeNull();
    expect(awayLines(done.log, facts(done.state)).map((line) => line.text)).toContain('A run of bunting is ready at the Workshop.');
    expect(craftsReady(done.state)).toBe(1);
    expect(workshopView(done.state)!.benches[0]).toMatchObject({ ready: true, line: 'Ready to collect' });
  });

  it('keeps a finished thing for ever, and begins the next when it is collected', () => {
    const state = act(fresh(), { type: 'setRecipe', bench: 0, recipe: 'banner' });
    // A month away: it is still on the bench, and nothing else was made or lost.
    const month = later(state, 30 * DAY);
    expect(month.log.filter((entry) => entry.kind === 'craft')).toHaveLength(1);
    expect(month.state.decor.benches[0]).toMatchObject({ making: 'banner' });
    expect(craftsReady(month.state)).toBe(1);
    expect(decorOwned(month.state, 'banner')).toBe(0);
    const cash = month.state.money.cash;
    const result = applyAction(month.state, { type: 'collectCraft', bench: 0 });
    if (!result.ok) throw new Error(result.error);
    const collected = result.state;
    expect(result.gained).toEqual({ xp: CRAFT_XP, cash: 0, count: 1 });
    expect(collected.decor.stored.banner).toBe(1);
    expect(collected.daily.xp).toBe(month.state.daily.xp + CRAFT_XP);
    expect(collected.decor.tally.crafted).toBe(1);
    expect(collected.orders.tally.crafts).toBe(1);
    // The standing choice: the next banner is under way, and paid for.
    expect(collected.decor.benches[0]).toMatchObject({ recipe: 'banner', making: 'banner', done: collected.clock.tick + made('banner').hours * TICKS_PER_HOUR });
    expect(collected.money.cash).toBe(cash - made('banner').cost * scaleOf(collected));
    // Told to stop, it finishes what it has and stands idle after.
    const stopped = act(collected, { type: 'setRecipe', bench: 0, recipe: null });
    expect(stopped.decor.benches[0]).toMatchObject({ recipe: null, making: 'banner' });
    const last = act(later(stopped, 2 * DAY).state, { type: 'collectCraft', bench: 0 });
    expect(last.decor.benches[0]).toEqual({ recipe: null, making: null, done: null });
    expect(last.decor.stored.banner).toBe(2);
    expect(workshopView(last)!.benches[0]).toMatchObject({ making: '', line: 'Idle' });
    expect(refuse(last, { type: 'collectCraft', bench: 0 })).toBe('Nothing is on that bench.');
    // With no cash for the next, the choice stands and the bench waits, with the reason passed on.
    const poor = structuredClone(month.state);
    poor.money.cash = 5;
    const waited = applyAction(poor, { type: 'collectCraft', bench: 0 });
    if (!waited.ok) throw new Error(waited.error);
    expect(waited.state.decor.benches[0]).toEqual({ recipe: 'banner', making: null, done: null });
    expect(waited.note).toMatch(/^School banner costs \$16,800 to make\. You have \$5\.$/);
  });

  it('finishes a craft now for Gold Seals, and sells a second bench for them, once', () => {
    const state = act(fresh(80, 40), { type: 'setRecipe', bench: 0, recipe: 'stage' });
    const wait = waits(state).find((one) => one.id === 'craft:0')!;
    expect(wait).toMatchObject({ name: 'Stage', price: 8 });
    const hurried = act(state, { type: 'finish', wait: 'craft:0' });
    expect(hurried.daily.seals).toBe(32);
    const soon = later(hurried, 2 * MIN);
    expect(craftsReady(soon.state)).toBe(1);
    expect(soon.log.filter((entry) => entry.kind === 'craft').map((entry) => entry.text)).toEqual(['A stage is ready at the Workshop.']);
    // The line is told once: the old timer finds the bench has moved on.
    expect(later(soon.state, 3 * DAY).log.filter((entry) => entry.kind === 'craft')).toEqual([]);
    expect(waits(soon.state).some((one) => one.id.startsWith('craft:'))).toBe(false);
    // The second bench.
    expect(workshopView(state)!.secondBench).toBe(WORKSHOP_SECOND_SEALS);
    expect(refuse(fresh(80, WORKSHOP_SECOND_SEALS - 1), { type: 'buyBench' })).toBe(`A second bench takes ${WORKSHOP_SECOND_SEALS} Gold Seals. You have ${WORKSHOP_SECOND_SEALS - 1}.`);
    const two = act(state, { type: 'buyBench' });
    expect(two.daily.seals).toBe(40 - WORKSHOP_SECOND_SEALS);
    expect(two.decor.benches).toHaveLength(2);
    expect(workshopView(two)!.secondBench).toBe(0);
    expect(WORKSHOP_BENCHES).toBe(2);
    expect(refuse(two, { type: 'buyBench' })).toBe('The Workshop has 2 benches, which is all it holds.');
    // Both benches work at once, each on its own thing.
    const both = act(two, { type: 'setRecipe', bench: 1, recipe: 'bunting' });
    expect(both.decor.benches.map((bench) => bench.making)).toEqual(['stage', 'bunting']);
  });

  it('is what two kinds of order ask for, once it can make something', () => {
    const kinds = ORDER_KINDS.filter((kind) => kind.metric === 'crafts');
    expect(kinds.map((kind) => kind.id).sort()).toEqual(['craftOne', 'craftTwo']);
    for (const kind of kinds) {
      expect(kind.when).toBe('workshopOpen');
      // A craft takes a day or two, so these orders run three days or more.
      expect(kind.hours).toBeGreaterThanOrEqual(72);
      expect(toneProblem(kind.title.replace('{n}', '2'))).toBeNull();
      expect(toneProblem(kind.ask)).toBeNull();
    }
    const kindsAt = (level: number): Set<string> => {
      const found = new Set<string>();
      for (let roll = 0; roll < 30; roll++) {
        const state = fresh(level);
        state.orders.open = (['town', 'donors'] as const).map((giver, n) => ({ id: 60 + n, giver, roll: roll * 5 + n, offered: state.clock.tick }));
        for (const order of act(state, { type: 'seeOrders' }).orders.open) found.add(order.kind!);
      }
      return found;
    };
    expect([...kindsAt(1)].some((id) => id.startsWith('craft'))).toBe(false);
    expect([...kindsAt(40)].some((id) => id.startsWith('craft'))).toBe(true);
  });
});

describe('the words on screen', () => {
  it('lists storage first, then the shelf as the levels bring it, the season, the Seal shelf and the Workshop', () => {
    const state = fresh(13, 9);
    state.decor.stored.gumball = 2;
    const entries = decorEntries(state);
    const categories = [...new Set(entries.map((entry) => entry.category))];
    expect(categories).toEqual(['In storage', 'Decor', 'Fall set, until 30 November', 'Decor for Gold Seals', 'Decor made on campus']);
    expect(entries[0]).toMatchObject({ id: `${DECOR_ENTRY}gumball`, name: 'Gumball machine', cost: 'Free', upkeep: '2 in storage', footprint: '' });
    const shelf = entries.filter((entry) => entry.category === 'Decor');
    // Levels 2 to 13 have brought four, and the next two to come are shown, locked.
    expect(shelf.map((entry) => entry.name)).toEqual(['Red flowers', 'Globe lamp', 'Clipped hedge', 'Boulder', 'Mailbox', 'Lantern']);
    expect(shelf.map((entry) => entry.locked ?? '')).toEqual(['', '', '', '', 'Level 14', 'Level 17']);
    expect(shelf[0]).toMatchObject({ cost: '$17K', key: 'decoration.flowers' });
    expect(entries.filter((entry) => entry.category.startsWith('Fall set'))).toHaveLength(5);
    const special = entries.filter((entry) => entry.category === 'Decor for Gold Seals');
    expect(special).toHaveLength(6);
    expect(special.find((entry) => entry.name === 'Bronze sculpture')).toMatchObject({ cost: '6 Gold Seals' });
    expect(entries[entries.length - 1]).toMatchObject({ id: WORKSHOP_ENTRY, name: 'The Workshop', cost: 'Idle' });
    // The Founder's statue, the town's own and what the Workshop makes are on no shelf.
    for (const id of ['statue', 'flowerBox', 'bunting']) expect(entries.some((entry) => entry.id === `${DECOR_ENTRY}${id}`)).toBe(false);
    for (const entry of entries) expect(toneProblem(`${entry.name} ${entry.cost} ${entry.upkeep} ${entry.effect}`)).toBeNull();
  });

  it('says what placing one costs, and what a placed one can do', () => {
    const state = fresh(13, 9);
    state.decor.stored.gumball = 1;
    expect(decorPlacingLine(state, 'gumball', false)).toBe('Gumball machine · from storage, free');
    expect(decorPlacingLine(state, 'flowers', false)).toBe('Red flowers · $17K');
    expect(decorPlacingLine(state, 'sculpture', false)).toBe('Bronze sculpture · 6 Gold Seals');
    expect(decorPlacingLine(state, 'sculpture', true)).toBe('Bronze sculpture · moving it is free');
    const lot = quietLot(state);
    const [x, y] = ring(state, lot, 1)[0]!;
    const wall = act(fresh(), { type: 'placeDecor', id: 'stoneWall', x, y });
    expect(decorPanel(placedDecor(wall)[0]!)).toEqual({ title: 'Low stone wall', turns: true });
    expect(decorPanel(wall.map.placed.find((placed) => placed && placed.type === 'makerspace')!)).toBeNull();
    expect(decorPanel(null)).toBeNull();
  });

  it('says how many buildings look better when one lands, and nothing more when none does', () => {
    const state = fresh();
    const lot = quietLot(state);
    const [first, second] = ring(state, lot, 1);
    const before = liftsNear(state, first![0], first![1]);
    expect(before.size).toBeGreaterThan(0);
    const one = act(state, { type: 'placeDecor', id: 'flowers', x: first![0], y: first![1] });
    const lifted = liftedCount(before, liftsNear(one, first![0], first![1]));
    expect(lifted).toBe(before.size);
    expect(decorPlacedWords(one, 'flowers', 'cash', lifted)).toBe(lifted === 1 ? 'Red flowers placed. 1 building near it looks better.' : `Red flowers placed. ${lifted} buildings near it look better.`);
    // A second of the same kind beside it adds nothing to the lots the first already reaches, and the words say no more.
    const mid = liftsNear(one, second![0], second![1]);
    const two = act(one, { type: 'placeDecor', id: 'flowers', x: second![0], y: second![1] });
    const again = liftedCount(mid, liftsNear(two, second![0], second![1]));
    expect(again).toBeLessThan(mid.size);
    expect(decorPlacedWords(two, 'flowers', 'cash', 0)).toBe('Red flowers placed.');
    expect(decorPlacedWords(two, 'gumball', 'storage', 2)).toBe('Gumball machine placed, from storage. 2 buildings near it look better.');
    expect(decorPlacedWords(two, 'flowers', 'moved', 1)).toBe('Red flowers moved. 1 building near it looks better.');
    expect(decorPlacedWords(two, 'flowers', 'moved')).toBe('Red flowers moved.');
  });

  it('opens the Workshop with a line only when there is something to say', () => {
    expect(workshopPage(fresh())!.lead).toBe('');
    expect(workshopPage(fresh(1))!.lead).toBe('The first recipe comes at Level 8.');
  });

  it('captions a photo with the school\'s name and its rank', () => {
    expect(photoCaption(BASE)).toEqual({ name: 'Test University', line: 'Year 1' });
    const ranked = fresh();
    ranked.field.rank = 96;
    expect(photoCaption(ranked)).toEqual({ name: 'Test University', line: 'No. 96 in the country' });
    expect(photoFileName('Larp University')).toBe('larp-university.png');
    expect(photoFileName('!!!')).toBe('campus.png');
    const layout = captionLayout(780);
    expect(layout.band).toBeGreaterThan(layout.name + layout.line);
    expect(layout.name).toBeGreaterThan(layout.line);
  });
});

describe('saves', () => {
  it('keeps storage, what is on the map and the benches through a save and a load', () => {
    let state = fresh(80, 30);
    const lot = quietLot(state);
    const spots = ring(state, lot, 1);
    state = act(state, { type: 'placeDecor', id: 'stoneWall', x: spots[0]![0], y: spots[0]![1], flip: true });
    state = act(state, { type: 'placeDecor', id: 'sculpture', x: spots[1]![0], y: spots[1]![1] });
    state = act(state, { type: 'storeDecor', placed: placedDecor(state)[1]!.id });
    state = act(state, { type: 'setRecipe', bench: 0, recipe: 'bunting' });
    state = later(state, 9 * HOUR).state;
    const loaded = parseSave(serialize(state, T0 + 3 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state).toEqual(state);
    expect(decorCounts(loaded.state)).toEqual({ owned: 2, placed: 1, stored: 1, kinds: 2 });
    expect(validate(loaded.state)).toBeNull();
    // The craft's line still comes after a load.
    expect(later(loaded.state, 2 * DAY).log.filter((entry) => entry.kind === 'craft')).toHaveLength(1);
  });

  describe('from version 19', () => {
    const text = readFileSync(new URL('./fixtures/save-v19-model.json', import.meta.url), 'utf8');

    it("comes through with nothing else moved: the owner's own kind of game, with an empty storage and one idle bench", () => {
      const file = JSON.parse(text) as { v: number; savedAt: number; state: GameState };
      expect(file.v).toBe(19);
      expect(file.state.school.name).toBe('Larp University');
      expect(file.state.map.scale).toBe(28);
      expect(file.state.daily.level).toBe(5);
      expect(file.state.orders.open.length).toBeGreaterThan(0);
      expect(file.state.decor).toBeUndefined();

      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      const state = loaded.state;
      expect(loaded.migratedFrom).toBe(19);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(29);
      expect(state.decor).toEqual(newDecor());
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.decor = newDecor();
      expected.rhythm = state.rhythm;
      expected.bigBuilds = state.bigBuilds;
      expected.labs = state.labs;
      expected.traditions = state.traditions;
      expected.greek = newGreek();
      // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
      expected.alumni = state.alumni;
      // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
      expected.story = newStory();
      expected.social = newSocial();
      expect(state).toEqual(expected);
      expect(validate(state)).toBeNull();
      // Its money, its level, its Seals and its orders are what they were.
      expect(state.money).toEqual(file.state.money);
      expect(state.daily).toEqual(file.state.daily);
      expect(state.orders).toEqual(file.state.orders);
      expect(state.map.score).toEqual(file.state.map.score);
      // A saved one is not migrated again.
      const again = parseSave(serialize(state, file.savedAt));
      if (!again.ok) throw new Error(again.reason);
      expect(again.migratedFrom).toBeNull();
      expect(again.state).toEqual(state);
      // And everything works on it: the shelf its level has opened, the Seal shelf, the fall set.
      const offers = decorOffers(state);
      expect(offers.find((offer) => offer.spec.id === 'flowers')).toMatchObject({ way: 'cash' });
      expect(offers.find((offer) => offer.spec.id === 'sculpture')).toMatchObject({ way: 'seals' });
      expect(liveSeason(state)?.id).toBe('fall');
      const lot = quietLot(state);
      const [x, y] = ring(state, lot, 1)[0]!;
      expect(decorLift(act(state, { type: 'placeDecor', id: 'pumpkins', x, y }).map, lot.x, lot.y)).toBeGreaterThan(0);
    });

    it('is told what is new, once', () => {
      const notes = upgradeNotes(19);
      expect(notes).toHaveLength(11);
      expect(notes[0]).toContain('Decor');
      expect(notes[0]).toContain('Workshop');
      expect(toneProblem(notes[0]!)).toBeNull();
      expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
    });

    it('gives a small campus saved at version 19 nothing to decorate', () => {
      const small = freshGame();
      const file = { v: 19, savedAt: T0, state: structuredClone(small) as unknown as Record<string, unknown> & { version: number } };
      delete file.state.decor;
      file.state.version = 19;
      const loaded = parseSave(JSON.stringify(file));
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(19);
      expect(loaded.state).toEqual(small);
    });
  });
});
