import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  bedsWanted,
  cellAt,
  COST,
  dormStudents,
  driversNow,
  enrollment,
  FIRST_INTAKE_TICK,
  hasRoadAccess,
  housingFixes,
  hoodAdvice,
  hoodAt,
  hoodCapacity,
  hoodWalks,
  LAND_FOR_SALE,
  LOCAL_SHARE,
  localsAmong,
  MAP_SIZE,
  occupiedBeds,
  offCampusNow,
  openCapacity,
  ownedAt,
  PARKING_NOISE,
  parseSave,
  PLACED,
  PLOTS_MIN,
  PLOTS_SPREAD,
  previewPaint,
  roadsByAccess,
  roomPlan,
  previewPlace,
  ROAD_NOISE,
  ROAD_UPKEEP_PER_YEAR,
  ROOM_FEE_PER_BED_PER_YEAR,
  rowBetween,
  sampleStudents,
  SAVE_VERSION,
  scoreParts,
  SIDE_STREET_ROWS,
  STARTER,
  studentCard,
  STUDENTS_PER_HOUSE,
  TOWN_WALK_MAX_MINUTES,
  TOWN_X,
  townHints,
  townLiving,
  townPlaces,
  TUITION_PER_STUDENT_PER_YEAR,
  upkeepPerYear,
  validate,
  WORLD,
  type Action,
  type GameState,
  type Neighbourhood,
} from '../src/sim';
import { seedStreams } from '../src/sim/rng';
import { housingFixLines } from '../src/ui/buildUi';
import { recomputeRates } from '../src/sim/systems/money';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function rich(seed = 42): GameState {
  const state = freshGame(seed);
  state.money.cash = 10_000_000;
  return state;
}

const hoodOnRow = (state: GameState, row: number): Neighbourhood => state.map.town.neighbourhoods.find((hood) => hood.row === row)!;
const atIntake = (state: GameState): GameState => advance(state, T0, T0 + FIRST_INTAKE_TICK * MIN).state;

describe('the town', () => {
  it('is the same for the same seed, and is made without touching any random stream', () => {
    const a = freshGame(7);
    const b = freshGame(7);
    expect(a.map.town).toEqual(b.map.town);
    expect(a.map.cells).toEqual(b.map.cells);
    expect(a.rng).toEqual(seedStreams(7));
    const other = freshGame(8);
    expect(other.map.town.neighbourhoods.map((hood) => hood.plots)).not.toEqual(a.map.town.neighbourhoods.map((hood) => hood.plots));
  });

  it('runs down the east side: a main street, side streets, and houses on both sides of each', () => {
    const state = freshGame();
    const { map } = state;
    expect(map.width).toBe(WORLD.width);
    expect(map.height).toBe(WORLD.height);
    for (let y = 0; y < map.height; y++) expect(cellAt(map, TOWN_X, y)?.kind).toBe('street');
    expect(map.town.neighbourhoods.map((hood) => hood.row)).toEqual([...SIDE_STREET_ROWS]);
    const names = new Set(map.town.neighbourhoods.map((hood) => hood.name));
    expect(names.size).toBe(map.town.neighbourhoods.length);
    for (const hood of map.town.neighbourhoods) {
      expect(hood.plots.length).toBeGreaterThanOrEqual(PLOTS_MIN);
      expect(hood.plots.length).toBeLessThan(PLOTS_MIN + PLOTS_SPREAD);
      expect(hoodCapacity(hood)).toBe(hood.plots.length * STUDENTS_PER_HOUSE);
      for (let x = TOWN_X + 1; x < map.width; x++) expect(cellAt(map, x, hood.row)?.kind).toBe('street');
      for (const plot of hood.plots) {
        expect(cellAt(map, plot.x, plot.y)?.kind).toBe('house');
        expect(Math.abs(plot.y - hood.row)).toBe(1);
        expect(hoodAt(map, plot.x, plot.y)).toBe(hood);
      }
    }
    // Nothing of the town is on the campus's land.
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) expect(['street', 'house', 'town']).not.toContain(cellAt(map, x, y)!.kind);
  });
});

describe('locals', () => {
  it('walk in on founding day: 36 students in the 36 beds, and 24 from the first neighbourhood', () => {
    const before = freshGame();
    const first = hoodOnRow(before, STARTER.townLink.y);
    expect(hoodWalks(before.map, first)).toBe(true);
    expect(townPlaces(before.map).walk).toBe(hoodCapacity(first));

    const state = atIntake(before);
    expect(enrollment(state)).toBe(60);
    // The 24 who live in town are spread across the four class years like everyone else.
    expect(state.offCampus.reduce((sum, n) => sum + n, 0)).toBe(24);
    for (let classYear = 0; classYear < 4; classYear++) expect(state.offCampus[classYear]).toBeLessThanOrEqual(state.cohorts[classYear]!);
    expect(dormStudents(state)).toBe(36);
    expect(state.admissions.lastIntake?.bottleneck).toBe('housing');
    // 160 of the 400 were locals. 24 are in, so 136 of those waiting are locals.
    expect(state.admissions.waitlistLocals).toBe(localsAmong(400) - 24);

    // Everyone pays tuition. Only those in a dorm pay the room fee. Six in ten in a dorm is the old flat $10,000.
    recomputeRates(state);
    expect(occupiedBeds(state)).toBe(36);
    expect(state.money.incomePerYear).toBe(60 * TUITION_PER_STUDENT_PER_YEAR + 36 * ROOM_FEE_PER_BED_PER_YEAR);
    expect(state.money.incomePerYear).toBe(60 * 10_000);

    // They show as living on that street, a house for every ten.
    const living = townLiving(state);
    expect(living.reduce((sum, hood) => sum + hood.living, 0)).toBe(offCampusNow(state));
    expect(living[first.id]).toMatchObject({ living: 24, mode: 'walk', houses: 3 });
  });

  it('need a bed when there is no way in', () => {
    // No walk to the town: the link the campus begins with is cleared.
    const cut = act(freshGame(), { type: 'paint', tool: 'clear', cells: rowBetween([STARTER.townLink.x0, STARTER.townLink.y], [STARTER.townLink.x1, STARTER.townLink.y]) });
    expect(townPlaces(cut.map).total).toBe(0);
    expect(bedsWanted(cut)).toBe(400);
    expect(bedsWanted(freshGame())).toBe(400 - Math.min(localsAmong(400), townPlaces(freshGame().map).total));

    const state = atIntake(cut);
    // Only the beds fill. Nobody lives in town, so every student is in a dorm.
    expect(enrollment(state)).toBe(Math.min(60, openCapacity(state, 'housing')));
    expect(enrollment(state)).toBeLessThan(60);
    expect(offCampusNow(state)).toBe(0);
    for (const hood of townLiving(state)) expect(hood.mode).toBe('none');
    expect(hoodAdvice(state, townLiving(state)[0]!)).toMatch(/Nobody can get to class from here/);
  });

  it('walk from a neighbourhood once a path joins it, if the walk is short enough', () => {
    let state = rich();
    const next = hoodOnRow(state, 12);
    const far = hoodOnRow(state, 2);
    expect(hoodWalks(state.map, next)).toBe(false);
    const before = townPlaces(state.map).walk;

    // A path up the east edge, as far as the next street.
    state = act(state, { type: 'paint', tool: 'path', cells: rowBetween([31, 16], [31, 14]) });
    expect(hoodWalks(state.map, next)).toBe(true);
    expect(townPlaces(state.map).walk).toBe(before + hoodCapacity(next));
    expect(state.map.town.access.walk[next.id]).toBeLessThanOrEqual(TOWN_WALK_MAX_MINUTES);

    // On to the far end of the land. That street is joined, but too long a walk.
    state = act(state, { type: 'paint', tool: 'path', cells: rowBetween([31, 13], [31, 3]) });
    expect(state.map.town.access.walk[far.id]).toBeGreaterThan(TOWN_WALK_MAX_MINUTES);
    expect(hoodWalks(state.map, far)).toBe(false);
    expect(hoodAdvice(state, townLiving(state)[far.id]!)).toMatch(/minutes/);

    // Fewer beds are wanted for the same class when more of it can live in town.
    expect(bedsWanted(state)).toBeLessThan(bedsWanted(rich()));
  });

  it('keep their place until they graduate, and never outnumber their class', () => {
    let state = atIntake(rich());
    state = act(state, { type: 'paint', tool: 'housing', cells: rowBetween([8, 18], [18, 18]) });
    state = act(state, { type: 'paint', tool: 'academic', cells: rowBetween([0, 13], [9, 13]) });
    for (let day = 1; day <= 16; day++) {
      state = advance(state, state.clock.lastSimulatedAt, T0 + day * DAY + HOUR).state;
      for (let classYear = 0; classYear < 4; classYear++) {
        expect(state.offCampus[classYear]).toBeGreaterThanOrEqual(0);
        expect(state.offCampus[classYear]).toBeLessThanOrEqual(state.cohorts[classYear]!);
      }
      expect(validate(state)).toBeNull();
    }
    // Two years on there are locals in more than one class year.
    expect(state.offCampus.filter((count) => count > 0).length).toBeGreaterThan(1);
  });

  it('show the street they live on, on the student card', () => {
    const state = atIntake(freshGame());
    const streets = new Set(state.map.town.neighbourhoods.map((hood) => hood.name));
    let offCampus = 0;
    for (const ref of sampleStudents(state)) {
      const card = studentCard(state, ref)!;
      if (card.residence === 'dorm') expect(card.street).toBeNull();
      else {
        offCampus += 1;
        expect(streets.has(card.street!)).toBe(true);
      }
    }
    expect(offCampus).toBeGreaterThan(0);
  });
});

describe('roads and parking', () => {
  /** A car park south of the spine, with a road east to College Avenue. */
  const LOT: readonly [number, number] = [26, 20];
  const ROAD = rowBetween([28, 20], [31, 20]);

  it('a car park holds no cars until a road links it to a town street', () => {
    let state = act(rich(), { type: 'place', building: 'parking', x: LOT[0], y: LOT[1] });
    const lot = state.map.placed.find((p) => p?.type === 'parking')!;
    expect(hasRoadAccess(state.map, lot)).toBe(false);
    expect(townPlaces(state.map).spaces).toBe(0);
    expect(townPlaces(state.map).drive).toBe(0);
    const bedsBefore = bedsWanted(state);

    // Three cells of road stop one short of the street. Still nothing.
    state = act(state, { type: 'paint', tool: 'road', cells: ROAD.slice(0, 3) });
    expect(hasRoadAccess(state.map, lot)).toBe(false);

    const cash = state.money.cash;
    const upkeep = upkeepPerYear(state);
    state = act(state, { type: 'paint', tool: 'road', cells: ROAD.slice(3) });
    expect(state.money.cash).toBe(cash - COST.road);
    expect(upkeepPerYear(state)).toBe(upkeep + ROAD_UPKEEP_PER_YEAR);
    expect(hasRoadAccess(state.map, lot)).toBe(true);
    expect(townPlaces(state.map).spaces).toBe(PLACED.parking.cars);
    expect(townPlaces(state.map).drive).toBe(20);
    // Twenty more locals can live in town, so twenty fewer beds are wanted.
    expect(bedsWanted(state)).toBe(bedsBefore - 20);

    // Break the road and the spaces are gone again.
    state = act(state, { type: 'paint', tool: 'clear', cells: [ROAD[1]!] });
    expect(townPlaces(state.map).spaces).toBe(0);
  });

  it('lets in one driver for each space, and no more', () => {
    let state = act(rich(), { type: 'place', building: 'garage', x: 26, y: 21 });
    state = act(state, { type: 'paint', tool: 'road', cells: rowBetween([28, 21], [31, 21]) });
    const places = townPlaces(state.map);
    expect(places.spaces).toBe(100);
    expect(places.drive).toBe(100);
    expect(places.driveWanted).toBeGreaterThan(100);

    // Zone room for everyone, along walks, so only the town's places decide who lives off campus.
    state = act(state, { type: 'paint', tool: 'path', cells: [...rowBetween([0, 14], [7, 14]), ...rowBetween([0, 17], [7, 17]), ...rowBetween([24, 14], [30, 14])] });
    // That last walk stops a cell short of College Avenue, so it joins no second neighbourhood.
    expect(townPlaces(state.map).walk).toBe(places.walk);
    state = act(state, { type: 'paint', tool: 'housing', cells: [...rowBetween([0, 18], [18, 18]), ...rowBetween([22, 18], [31, 18])] });
    state = act(state, { type: 'paint', tool: 'academic', cells: [...rowBetween([0, 13], [9, 13]), ...rowBetween([20, 13], [31, 13])] });
    state = advance(state, T0, T0 + DAY).state;
    expect(enrollment(state)).toBe(400);
    expect(offCampusNow(state)).toBe(Math.min(localsAmong(400), places.walk + 100));
    expect(driversNow(state)).toBe(offCampusNow(state) - places.walk);
    expect(driversNow(state)).toBeLessThanOrEqual(100);
    expect(townLiving(state).filter((hood) => hood.mode === 'drive' && hood.living > 0).length).toBeGreaterThan(0);
  });

  it('makes a crossing where a road and a path share a cell, and both pass through', () => {
    let state = rich();
    const first = hoodOnRow(state, STARTER.townLink.y);
    const walk = state.map.town.access.walk[first.id];
    // A road straight across the walk to town.
    state = act(state, { type: 'paint', tool: 'road', cells: rowBetween([26, 15], [26, 19]) });
    expect(cellAt(state.map, 26, 17)?.kind).toBe('crossing');
    expect(cellAt(state.map, 26, 16)?.kind).toBe('road');
    expect(state.map.town.access.walk[first.id]).toBe(walk);
    expect(hoodWalks(state.map, first)).toBe(true);
    // And a path laid over a road.
    state = act(state, { type: 'paint', tool: 'path', cells: [[26, 19]] });
    expect(cellAt(state.map, 26, 19)?.kind).toBe('crossing');
    // Clearing a crossing leaves empty ground.
    state = act(state, { type: 'paint', tool: 'clear', cells: [[26, 19]] });
    expect(cellAt(state.map, 26, 19)?.kind).toBe('empty');
  });

  it('are mildly disliked by the lots beside them', () => {
    let state = act(rich(), { type: 'paint', tool: 'housing', cells: [[10, 20]] });
    const quiet = scoreParts(state.map, 10, 20, 'housing', 0);
    expect(quiet.noise).toBe(0);
    state = act(state, { type: 'paint', tool: 'road', cells: [[10, 21]] });
    const byRoad = scoreParts(state.map, 10, 20, 'housing', 0);
    expect(byRoad.noise).toBe(ROAD_NOISE);
    expect(byRoad.total).toBe(quiet.total - ROAD_NOISE);
    state = act(state, { type: 'place', building: 'parking', x: 11, y: 19 });
    expect(scoreParts(state.map, 10, 20, 'housing', 0).noise).toBe(ROAD_NOISE + PARKING_NOISE.parking);
    // A parking structure offends less than a surface lot.
    expect(PARKING_NOISE.garage).toBeLessThan(PARKING_NOISE.parking);
  });
});

describe('land', () => {
  const field = LAND_FOR_SALE[0];

  it('cannot be built on until it is bought, and the town never can', () => {
    const state = rich();
    const inField: [number, number] = [field.x + 2, field.y + 2];
    expect(ownedAt(state.map, ...inField)).toBe(false);
    expect(previewPaint(state, 'housing', [inField]).cells).toEqual([]);
    expect(previewPaint(state, 'road', [inField]).cells).toEqual([]);
    expect(previewPlace(state, 'gym', ...inField).problem).toBe('offMap');
    expect(applyAction(state, { type: 'paint', tool: 'path', cells: [inField] }).ok).toBe(false);

    // The town: its streets, houses and gardens are not the player's to change.
    const hood = state.map.town.neighbourhoods[0]!;
    for (const cell of [[TOWN_X, 5], [TOWN_X + 3, hood.row], [hood.plots[0]!.x, hood.plots[0]!.y], [TOWN_X + 1, hood.row + 2]] as Array<[number, number]>) {
      expect(ownedAt(state.map, ...cell)).toBe(false);
      for (const tool of ['clear', 'road', 'path', 'housing'] as const) expect(previewPaint(state, tool, [cell]).cells).toEqual([]);
      expect(previewPlace(state, 'coffee', ...cell).problem).toBe('offMap');
    }
    // A building that would hang over the edge of the land does not fit either.
    expect(previewPlace(state, 'gym', 31, 5).problem).toBe('offMap');
  });

  it('can be bought, once, for its price', () => {
    const poor = freshGame();
    poor.money.cash = field.price - 1;
    const refused = applyAction(poor, { type: 'buyLand', parcel: 1 });
    expect(refused.ok).toBe(false);

    let state = rich();
    const cash = state.money.cash;
    state = act(state, { type: 'buyLand', parcel: 1 });
    expect(state.money.cash).toBe(cash - field.price);
    expect(state.map.parcels[1]).toMatchObject({ name: field.name, owned: true });
    expect(ownedAt(state.map, field.x + 2, field.y + 2)).toBe(true);
    expect(applyAction(state, { type: 'buyLand', parcel: 1 }).ok).toBe(false);
    expect(applyAction(state, { type: 'buyLand', parcel: 0 }).ok).toBe(false);
    expect(applyAction(state, { type: 'buyLand', parcel: 99 }).ok).toBe(false);

    // It is ordinary land now, and it borders the town too.
    state = act(state, { type: 'paint', tool: 'housing', cells: [[field.x + 2, field.y + 2]] });
    state = act(state, { type: 'place', building: 'parking', x: 28, y: field.y + 3 });
    state = act(state, { type: 'paint', tool: 'road', cells: rowBetween([30, field.y + 3], [31, field.y + 3]) });
    expect(townPlaces(state.map).spaces).toBe(20);
    // The other field is still for sale.
    expect(ownedAt(state.map, 2, field.y + 2)).toBe(false);
  });
});

describe('upgrading a version 5 save, from before the town', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v5.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState }).state;
  const load = (): GameState => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(5);
    return loaded.state;
  };

  it('keeps every student, every dollar and every building, each cell at the same x and y', () => {
    const state = load();
    expect(state.version).toBe(SAVE_VERSION);
    expect(old.map.width).toBe(32);
    expect(state.cohorts).toEqual(old.cohorts);
    expect(state.money.cash).toBe(old.money.cash);
    expect(state.map.buildings).toEqual(old.map.buildings);
    expect(state.map.placed).toEqual(old.map.placed);
    expect(state.timers).toEqual(old.timers);
    old.map.cells.forEach((was, i) => {
      const x = i % old.map.width;
      const y = Math.floor(i / old.map.width);
      expect(state.map.cells[y * state.map.width + x]).toEqual(was);
    });
    // A town in the new columns, fields to the south, and the old land still the player's.
    expect(state.map.width).toBe(WORLD.width);
    expect(state.map.height).toBe(WORLD.height);
    expect(state.map.town.neighbourhoods.length).toBe(SIDE_STREET_ROWS.length);
    expect(cellAt(state.map, TOWN_X, 0)?.kind).toBe('street');
    expect(state.map.parcels.map((parcel) => parcel.owned)).toEqual([true, false, false]);
    expect(validate(state)).toBeNull();
  });

  it('changes neither the income nor the beds that are wanted', () => {
    const state = load();
    // Four in ten of each class already lived off campus under the old rule.
    expect(state.offCampus).toEqual(old.cohorts.map((count) => Math.round(count * LOCAL_SHARE)));
    expect(state.admissions.waitlistLocals).toBe(Math.round(old.admissions.waitlist * LOCAL_SHARE));
    recomputeRates(state);
    expect(Math.abs(state.money.incomePerYear - old.money.incomePerYear)).toBeLessThan(old.money.incomePerYear * 0.01);
    expect(Math.abs(state.money.spendingPerYear - old.money.spendingPerYear)).toBeLessThan(1);
    expect(dormStudents(state)).toBeLessThanOrEqual(openCapacity(state, 'housing'));
  });

  it('turns nobody out, though no path reaches the town yet', () => {
    const state = load();
    expect(townPlaces(state.map).total).toBe(0);
    const before = enrollment(state);
    const dorm = dormStudents(state);
    // Through the next semester end and beyond. The only students lost are the few who leave any semester.
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state;
    const last = later.admissions.lastSemester!;
    expect(last.tick).toBeGreaterThan(state.clock.tick);
    expect(last.left).toBeLessThanOrEqual(Math.ceil(before * 0.06));
    expect(offCampusNow(later)).toBeGreaterThan(0);
    expect(dormStudents(later)).toBeLessThanOrEqual(Math.max(dorm, openCapacity(later, 'housing')));
  });

  it('gives the same game however many times it is loaded', () => {
    expect(load()).toEqual(load());
    // And the town is the one a new game with the same seed would have.
    const fresh = freshGame(old.seed);
    expect(load().map.town.neighbourhoods).toEqual(fresh.map.town.neighbourhoods);
  });
});

describe('the three fixes for a shortage of beds', () => {
  it('gives each fix its numbers, and each number is what the fix then does', () => {
    const state = rich();
    const fixes = housingFixes(state);
    const places = townPlaces(state.map);
    const stuck = localsAmong(400) - places.total;
    expect(stuck).toBeGreaterThan(0);

    // 1. Housing lots: as many as cover every missing bed.
    const plan = roomPlan(state).zones.housing;
    expect(fixes.bedsShort).toBe(plan.short);
    expect(fixes.lots).toEqual({ count: Math.ceil(plan.short / 12), perLot: 12, cost: Math.ceil(plan.short / 12) * COST.zoneLot });

    // 2. A path to the nearest street nobody walks from: three cells up the edge from the walk the campus begins with.
    const next = hoodOnRow(state, 12);
    expect(fixes.path).toMatchObject({ hood: next.id, street: next.name, cells: 3, cost: 3 * COST.path, brings: stuck, gate: [31, 14] });
    const joined = act(state, { type: 'paint', tool: 'path', cells: rowBetween([31, 16], [31, 14]) });
    expect(joined.map.town.access.walk[next.id]).toBe(fixes.path!.minutes);
    expect(bedsWanted(state) - bedsWanted(joined)).toBe(fixes.path!.brings);
    expect(townPlaces(joined.map).walk).toBe(places.walk + hoodCapacity(next));

    // 3. Parking: a space for each local who could drive in, and the lots that hold them.
    expect(fixes.parking).toEqual({ spaces: stuck, lots: Math.ceil(stuck / 20), cost: Math.ceil(stuck / 20) * PLACED.parking.cost, brings: stuck });
    let parked = state;
    for (let n = 0; n < fixes.parking!.lots; n++) parked = act(parked, { type: 'place', building: 'parking', x: 30, y: 19 + n });
    expect(state.money.cash - parked.money.cash).toBe(fixes.parking!.cost);
    expect(townPlaces(parked.map).spaces).toBeGreaterThanOrEqual(fixes.parking!.spaces);
    expect(bedsWanted(state) - bedsWanted(parked)).toBe(fixes.parking!.brings);
  });

  it('counts the same locals when a waitlist is open', () => {
    const state = atIntake(rich());
    const fixes = housingFixes(state);
    const free = townPlaces(state.map).total - offCampusNow(state);
    expect(fixes.path!.brings).toBe(state.admissions.waitlistLocals - free);
    expect(fixes.parking!.brings).toBe(state.admissions.waitlistLocals - free);
    expect(fixes.bedsShort).toBe(roomPlan(state).zones.housing.short - roomPlan(state).zones.housing.building);
  });

  it('offers no path or parking once the town takes every local, and nothing at all when beds are not short', () => {
    // Join two more streets: more places than there are locals.
    let state = act(rich(), { type: 'paint', tool: 'path', cells: rowBetween([31, 16], [31, 14]) });
    state = act(state, { type: 'paint', tool: 'path', cells: rowBetween([31, 18], [31, 20]) });
    expect(townPlaces(state.map).total).toBeGreaterThanOrEqual(localsAmong(400));
    const full = housingFixes(state);
    expect(full.bedsShort).toBeGreaterThan(0);
    expect(full.lots).not.toBeNull();
    expect(full.path).toBeNull();
    expect(full.parking).toBeNull();

    // With the beds built, there is nothing to fix.
    const beds = openCapacity(state, 'housing');
    for (const building of state.map.buildings) if (building && building.zone === 'housing') building.stage = 2;
    const roomy = structuredClone(state);
    roomy.cohorts = [0, 0, 0, 0];
    roomy.admissions.waitlist = 0;
    expect(openCapacity(roomy, 'housing')).toBeGreaterThan(beds);
    // Make the next class small enough for the beds there are.
    roomy.clock.tick = FIRST_INTAKE_TICK + 2;
    const none = housingFixes(roomy);
    if (roomPlan(roomy).zones.housing.short === 0) expect(none).toEqual({ bedsShort: 0, lots: null, path: null, parking: null });
    else expect(none.bedsShort).toBeGreaterThan(0);
  });

  it('skips a street that is joined already but too long a walk', () => {
    // A path all the way to the far end of the land: the last street is joined, and too far.
    const state = act(rich(), { type: 'paint', tool: 'path', cells: rowBetween([31, 16], [31, 3]) });
    const far = hoodOnRow(state, 2);
    expect(state.map.town.access.walk[far.id]).toBeGreaterThan(TOWN_WALK_MAX_MINUTES);
    expect(housingFixes(state).path?.hood).not.toBe(far.id);
  });

  it('says each fix in one line, with its numbers', () => {
    const state = rich();
    const fixes = housingFixes(state);
    const lines = housingFixLines(fixes);
    expect(lines.lots).toMatch(new RegExp(`Zone ${fixes.lots!.count} more Housing lots: 12 beds each`));
    expect(lines.path).toContain(`Lay a path to ${fixes.path!.street}: about 3 path cells, $6,000.`);
    expect(lines.path).toContain(`${fixes.path!.brings} locals could walk in`);
    expect(lines.path).toContain(`${fixes.path!.brings} fewer beds are needed`);
    expect(lines.parking).toContain(`Build ${fixes.parking!.spaces} parking spaces with a road to a street: ${fixes.parking!.lots} Parking lots, $80K.`);
    expect(lines.parking).toContain(`${fixes.parking!.brings} locals could drive in`);
    // Nothing is said about a fix that would bring nobody in.
    expect(housingFixLines({ bedsShort: 5, lots: { count: 1, perLot: 12, cost: 15_000 }, path: null, parking: null })).toMatchObject({ path: '', parking: '' });
  });
});

describe('the Parking overlay', () => {
  it('sorts roads by whether a car from the town can reach them', () => {
    let state = act(rich(), { type: 'paint', tool: 'road', cells: rowBetween([26, 22], [28, 22]) });
    expect(roadsByAccess(state.map)).toEqual({ linked: [], cut: [[26, 22], [27, 22], [28, 22]] });
    state = act(state, { type: 'paint', tool: 'road', cells: rowBetween([29, 22], [31, 22]) });
    const sorted = roadsByAccess(state.map);
    expect(sorted.cut).toEqual([]);
    expect(sorted.linked.length).toBe(6);
    // A second road that goes nowhere is still shown as cut off.
    state = act(state, { type: 'paint', tool: 'road', cells: rowBetween([20, 24], [21, 24]) });
    expect(roadsByAccess(state.map).cut).toEqual([[20, 24], [21, 24]]);
  });
});

describe('what the map points at while the town cannot get in', () => {
  /** A campus from before the town was joined: the path to College Avenue is not there. */
  const unjoined = (): GameState => act(rich(), { type: 'paint', tool: 'clear', cells: rowBetween([24, STARTER.townLink.y], [31, STARTER.townLink.y]) });

  it('points at nothing to walk by on a new campus, whose path already meets the street', () => {
    const state = rich();
    expect(townPlaces(state.map).walk).toBeGreaterThan(0);
    expect(townHints(state).walk).toBeNull();
  });

  it('points at the edge beside the street nearest the lecture halls when no path joins the town', () => {
    const state = unjoined();
    expect(townPlaces(state.map).walk).toBe(0);
    const hint = townHints(state).walk!;
    // The lecture halls stand on row 18. The side street across from row 17 is the nearest.
    expect(hint).toEqual({ x: TOWN_X - 1, y: STARTER.townLink.y, street: hoodOnRow(state, STARTER.townLink.y).name });
    // It goes away the moment a path does the job, wherever the player lays it.
    const joined = act(state, { type: 'paint', tool: 'path', cells: rowBetween([24, 17], [31, 17]) });
    expect(townHints(joined).walk).toBeNull();
  });

  it('points at a second spot for parking until a road reaches a car park, and never at the same cell', () => {
    const state = unjoined();
    const hints = townHints(state);
    expect(hints.drive).not.toBeNull();
    expect(hints.drive!.x).toBe(TOWN_X - 1);
    expect(hints.drive!.y).not.toBe(hints.walk!.y);
    // With the path there, parking takes the nearest spot.
    expect(townHints(rich()).drive).toEqual({ x: TOWN_X - 1, y: STARTER.townLink.y, street: hoodOnRow(state, STARTER.townLink.y).name });
    // A car park with no road changes nothing. One a road reaches clears it.
    let built = act(rich(), { type: 'place', building: 'parking', x: 28, y: 20 });
    expect(townHints(built).drive).not.toBeNull();
    built = act(built, { type: 'paint', tool: 'road', cells: rowBetween([28, 21], [31, 21]) });
    built = act(built, { type: 'paint', tool: 'road', cells: rowBetween([31, 21], [31, 22]) });
    expect(built.map.town.access.spaces).toBeGreaterThan(0);
    expect(townHints(built).drive).toBeNull();
  });

  it('stands on the campus\'s own land, and changes nothing in the game', () => {
    const state = unjoined();
    const before = JSON.stringify(state);
    const hints = townHints(state);
    expect(JSON.stringify(state)).toBe(before);
    for (const hint of [hints.walk!, hints.drive!]) expect(ownedAt(state.map, hint.x, hint.y)).toBe(true);
  });
});
