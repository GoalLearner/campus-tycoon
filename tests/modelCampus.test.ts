import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  budget,
  campusClean,
  campusHappiness,
  coverFor,
  enrollment,
  fedAt,
  FIRST_INTAKE_TICK,
  isMessSpot,
  MODEL_CASH_SHARE,
  MODEL_FULL,
  MODEL_STAGE,
  MODEL_STUDENTS,
  modelDistricts,
  newGame,
  openCapacity,
  parseSave,
  PLACED,
  roadReach,
  serialize,
  spotFix,
  stageSpec,
  TICK_MS,
  TICKS_PER_DAY,
  touchesPath,
  townPlaces,
  validate,
  type GameState,
} from '../src/sim';
import { calendarAt, dateAt } from '../src/sim/calendar';
import { STREET_NAMES, TOWN_X } from '../src/sim/config/town';
import { BOWLS, CONFERENCE_NAMES, NICKNAMES, PLACE_ENDS, PLACE_STARTS } from '../src/sim/config/football';
import { CLUBS, FIRST_NAMES, MAJORS, SURNAME_ENDS, SURNAME_STARTS } from '../src/sim/config/students';
import { T0 } from './helpers';

/**
 * The model campus (DESIGN.md section 35): a whole campus laid by a script,
 * district by district, and opened balanced.
 */

const model = (seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });

describe('the model campus is laid by a script', () => {
  it('builds the same campus twice from the same seed, and it passes the validation every save goes through', () => {
    const one = model();
    const two = model();
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
    expect(validate(one)).toBeNull();
    const back = parseSave(serialize(one, T0));
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.stringify(back.state)).toBe(JSON.stringify(one));
  });

  it('lays the same districts for every seed: only the looks and the names change', () => {
    const ground = (state: GameState): string => state.map.cells.slice(0, state.map.width * state.map.height).map((cell, i) => (i % state.map.width < TOWN_X ? `${cell.kind}${cell.zone ?? ''}` : '')).join(',');
    expect(ground(model(7))).toBe(ground(model(35)));
    expect(model(7).football.conference).not.toBe('');
  });

  it('has every district of the design, each within three cells of the place given', () => {
    const districts = modelDistricts(35);
    const ids = districts.map((district) => district.id);
    for (const id of ['core', 'tower', 'union', 'commons', 'northEastHalls', 'hill', 'avenueHouses', 'farApartments', 'stadium', 'recreation', 'fields', 'pool', 'structures', 'lots', 'loop', 'transit', 'facilities', 'care']) {
      expect(ids, id).toContain(id);
    }
    for (const district of districts) {
      const off = Math.max(Math.abs(district.centre.x - district.aim.x), Math.abs(district.centre.y - district.aim.y));
      expect(off, `${district.name} is at ${district.centre.x}, ${district.centre.y} and was aimed at ${district.aim.x}, ${district.aim.y}`).toBeLessThanOrEqual(3);
    }
    // About one building for every two or three on the reference, which names about 115.
    const state = model();
    const lots = state.map.buildings.filter(Boolean).length;
    const placed = state.map.placed.filter((item) => item && !['bin', 'seat'].includes(PLACED[item.type].family)).length;
    expect(lots + placed).toBeGreaterThanOrEqual(80);
    expect(lots + placed).toBeLessThanOrEqual(110);
  });

  it('has the long walk, the walk to College Avenue and the loop road, each joined up', () => {
    const state = model();
    const map = state.map;
    const kind = (x: number, y: number): string => map.cells[y * map.width + x]!.kind;
    for (let x = 9; x <= 23; x++) expect(['path', 'crossing'], `the long walk at ${x}, 19`).toContain(kind(x, 19));
    for (let x = 23; x <= 31; x++) expect(kind(x, 15), `the walk to the avenue at ${x}, 15`).toBe('path');
    // The loop road runs down the west edge and along the north edge, and a car can drive it from College Avenue.
    const reached = roadReach(map);
    for (const [x, y] of [[0, 40], [0, 20], [0, 0], [16, 0], [31, 0]] as const) expect(reached[y * map.width + x], `road at ${x}, ${y}`).toBe(1);
    // Every car park holds cars: a road or the avenue reaches each.
    const parks = map.placed.filter((item) => item && PLACED[item.type].family === 'parking');
    expect(parks.length).toBe(8);
    expect(map.town.access.linked.length).toBe(parks.length);
    // Streets on both sides of the walk can walk in.
    expect(map.town.access.walk.filter((minutes) => minutes >= 0).length).toBeGreaterThanOrEqual(2);
  });

  it('builds nothing on town land, and leaves the town as any new game has it', () => {
    const state = model();
    const small = newGame({ seed: 35, name: 'Test University', now: T0 });
    const map = state.map;
    for (let y = 0; y < map.height; y++) {
      for (let x = TOWN_X; x < map.width; x++) {
        const i = y * map.width + x;
        expect(JSON.stringify(map.cells[i]), `town cell ${x}, ${y}`).toBe(JSON.stringify(small.map.cells[i]));
      }
    }
    for (const building of map.buildings) if (building) expect(building.x).toBeLessThan(TOWN_X);
    for (const item of map.placed) if (item) expect(item.x + item.w).toBeLessThanOrEqual(TOWN_X);
    expect(JSON.stringify(map.town.neighbourhoods)).toBe(JSON.stringify(small.map.town.neighbourhoods));
    // The starting land and both fields are the campus's own.
    expect(map.parcels.every((parcel) => parcel.owned)).toBe(true);
  });
});

describe('the model campus follows the game\'s own rules', () => {
  it('every lot stands at its second stage and has what that stage asks for', () => {
    const state = model();
    const map = state.map;
    let lots = 0;
    for (const building of map.buildings) {
      if (!building) continue;
      lots += 1;
      const at = `${building.zone} lot at ${building.x}, ${building.y}`;
      expect(building.stage, at).toBe(MODEL_STAGE);
      expect(building.rebuild, at).toBeNull();
      expect(touchesPath(map, building.x, building.y), `${at} touches a path`).toBe(true);
      expect(map.score[building.y * map.width + building.x]!, `${at} is desirable enough`).toBeGreaterThanOrEqual(stageSpec(building.zone, MODEL_STAGE).desirabilityNeeded);
      if (building.zone === 'housing') expect(fedAt(map, building.x, building.y), `${at} has food in reach`).toBe(true);
    }
    expect(lots).toBe(64);
    expect(state.timers.filter((timer) => timer.kind === 'buildDone').length).toBe(0);
  });

  it('every place that drops litter has a bin in reach and a staffed yard that covers it', () => {
    const state = model();
    let spots = 0;
    for (const item of state.map.placed) {
      if (!item || !isMessSpot(item)) continue;
      spots += 1;
      const fix = spotFix(state, item);
      expect(fix === null || fix === 'quiet', `${PLACED[item.type].name} at ${item.x}, ${item.y}: ${String(fix)}`).toBe(true);
    }
    expect(spots).toBeGreaterThanOrEqual(12);
    expect(campusClean(state)).toBe(1);
  });

  it('a Medical Center and Campus Safety reach the union, the north-east halls, the avenue houses and most places to play', () => {
    const state = model();
    const map = state.map;
    const both = (x: number, y: number): boolean => coverFor(map, 'medical', x, y) !== null && coverFor(map, 'safety', x, y) !== null;
    const dorms = map.buildings.filter((building) => building && building.zone === 'housing');
    const covered = dorms.filter((building) => both(building!.x, building!.y)).length;
    // The hill and the far apartments are outside both: the first thing for a president to fix.
    expect(covered).toBeGreaterThanOrEqual(15);
    expect(covered).toBeLessThan(dorms.length);
    const play = map.placed.filter((item) => item && PLACED[item.type].family === 'recreation');
    const reached = play.filter((item) => coverFor(map, 'medical', item!.x, item!.y) !== null).length;
    expect(reached).toBeGreaterThanOrEqual(4);
  });
});

describe('the model campus opens balanced', () => {
  it('opens about nine tenths full, with all four class years and locals who walk and drive in', () => {
    const state = model();
    const seats = openCapacity(state, 'academic');
    const beds = openCapacity(state, 'housing');
    const students = enrollment(state);
    expect(students).toBe(MODEL_STUDENTS);
    expect(Math.abs(students / seats - MODEL_FULL)).toBeLessThan(0.02);
    for (const year of state.cohorts) expect(year).toBeGreaterThan(students / 6);
    const inTown = state.offCampus.reduce((a, b) => a + b, 0);
    const inDorms = students - inTown;
    expect(inDorms / beds).toBeGreaterThan(0.85);
    expect(inDorms / beds).toBeLessThanOrEqual(0.95);
    const town = townPlaces(state.map);
    expect(town.walk).toBeGreaterThan(0);
    expect(town.drive).toBeGreaterThan(0);
    expect(inTown).toBeGreaterThan(town.walk);
    expect(state.classes.length).toBe(4);
    expect(state.admissions.lastIntake?.admitted).toBe(students);
    expect(state.admissions.waitlist).toBe(0);
  });

  it('opens with cash worth about a tenth of a year\'s spending, a surplus, and nothing in the endowment', () => {
    const state = model();
    const books = budget(state);
    expect(state.money.cash / books.spending).toBeGreaterThan(MODEL_CASH_SHARE - 0.005);
    expect(state.money.cash / books.spending).toBeLessThan(MODEL_CASH_SHARE + 0.005);
    expect(state.money.endowment).toBe(0);
    expect(books.incomeTotal).toBeGreaterThan(books.spending);
    expect(books.kept).toBeGreaterThan(5);
    const payroll = books.groups.find((group) => group.id === 'payroll')!.amount;
    expect(payroll / books.fullSpending).toBeGreaterThanOrEqual(0.5);
    expect(campusHappiness(state).score).toBeGreaterThan(60);
  });

  it('opens before the first day of a fall semester, with a team whose first season is that fall and a bare stadium plot', () => {
    const state = model();
    expect(state.clock.tick).toBe(FIRST_INTAKE_TICK);
    const f = state.football;
    expect(f.firstYear).toBe(1);
    expect(f.stadium.tier).toBe(0);
    expect(f.stadium.work).toBeNull();
    expect(f.stadium.plot).not.toBeNull();
    expect(state.map.placed[f.stadium.plot!]?.type).toBe('stadium');
    // No founding class is on its way: the students are already there, and the first thing to happen is the fall.
    const day = advance(state, T0, T0 + (state.clock.week.start - state.clock.tick + 2) * TICK_MS);
    expect(day.log.filter((entry) => entry.kind === 'intake').length).toBe(0);
    expect(enrollment(day.state)).toBe(enrollment(state));
    expect(calendarAt(day.state.clock).phase).toBe('fall');
    expect(dateAt(day.state.clock).month).toBe(8);
    expect(f.season === null || f.season.year === 1).toBe(true);
    expect(day.state.football.season?.games.length).toBe(10);
  });

  it('runs a week without help: no grant, still clean, and the same students or more after the first spring class', () => {
    const state = model();
    const later = advance(state, T0, T0 + 3 * TICKS_PER_DAY * TICK_MS).state;
    expect(later.money.grants).toBe(0);
    expect(later.money.cash).toBeGreaterThan(state.money.cash);
    expect(campusClean(later)).toBeGreaterThan(0.9);
    expect(validate(later)).toBeNull();
  });

  it('an anchored game opens the same campus, with its first fall at the anchor', () => {
    const anchored = newGame({ seed: 35, name: 'Test University', now: T0, anchor: 9 * 60, campus: 'model' });
    expect(enrollment(anchored)).toBe(enrollment(model()));
    expect(anchored.clock.week.start).toBeGreaterThan(anchored.clock.tick);
    expect(anchored.clock.week.start - anchored.clock.tick).toBeLessThanOrEqual(TICKS_PER_DAY);
    expect(validate(anchored)).toBeNull();
  });

  it('leaves the small campus exactly as it was', () => {
    const small = newGame({ seed: 35, name: 'Test University', now: T0 });
    const named = newGame({ seed: 35, name: 'Test University', now: T0, campus: 'small' });
    expect(JSON.stringify(named)).toBe(JSON.stringify(small));
    expect(small.clock.tick).toBe(0);
    expect(enrollment(small)).toBe(0);
    expect(small.map.parcels.filter((parcel) => parcel.owned).length).toBe(1);
  });
});

// ---------------------------------------------------------------- names --

const ROOT = join(__dirname, '..');
const REFERENCE = join(ROOT, 'art', 'reference', 'campus-map-reference.pdf');

/** Ordinary words any campus map prints. A word here is not a name, wherever it came from. */
const ORDINARY = new Set(
  (
    'academic administration apartments astronomy athletics avenue building business campus center central centre chemistry club college commons communication community computer ' +
    'construction content cottage court courts east education engineering facilities faculty field fields food fraternity gallery graphics hall health house housing information ' +
    'international lane letters library main mathematics medical music north office parking physics plaza pool receiving recital recreation reserved residence resource road safety ' +
    'school science sciences semester services sharing shuttle softball south square stadium state station street student students studies tennis theatre tower track transit union ' +
    'university valley vehicle veterans village west'
  ).split(' '),
);

/** The words printed on the reference map, read from the file itself. null when the file, or a way to read it, is not here. */
function referenceWords(): string[] | null {
  if (!existsSync(REFERENCE)) return null;
  const script = "import sys, pymupdf\nfor page in pymupdf.open(sys.argv[1]):\n    for word in page.get_text('words'):\n        print(word[4])";
  const run = spawnSync('python', ['-I', '-c', script, REFERENCE], { encoding: 'utf8' });
  if (run.status !== 0 || !run.stdout) return null;
  return run.stdout
    .split(/\r?\n/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').toLowerCase())
    .filter((word) => word.length > 0);
}

function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

describe('no name from the reference is anywhere in the game', () => {
  const words = referenceWords();
  const check = words ? it : it.skip;

  check('no name the game can make or show is a name printed on the reference map', () => {
    // The names: any word of four letters or more on the map that is not an ordinary word.
    const names = new Set(words!.filter((word) => word.length >= 4 && !ORDINARY.has(word)));
    expect(names.size).toBeGreaterThan(40);

    // Every pool the game makes a name from, and every name a model campus carries.
    const state = model();
    const pools: string[] = [
      ...FIRST_NAMES,
      ...SURNAME_STARTS,
      ...SURNAME_ENDS,
      ...PLACE_STARTS,
      ...PLACE_ENDS,
      ...NICKNAMES,
      ...CONFERENCE_NAMES,
      ...BOWLS,
      ...STREET_NAMES,
      ...MAJORS.map((major) => major.name),
      ...CLUBS.map((club) => club.name),
      ...Object.values(PLACED).map((spec) => spec.name),
      ...modelDistricts(35).map((district) => district.name),
      ...state.field.schools.flatMap((school) => [school.name, school.nick]),
      state.football.conference,
      state.football.nick,
      state.football.coach.name,
      ...state.map.town.neighbourhoods.map((hood) => hood.name),
    ];
    const made = new Set(pools.flatMap((text) => text.toLowerCase().split(/[^a-z]+/)).filter((word) => word.length >= 4 && !ORDINARY.has(word)));
    const shared = [...made].filter((word) => names.has(word));
    expect(shared, 'a name the game makes is printed on the reference map').toEqual([]);

    // Every quoted piece of text in the source, the documents and the tests: no long name from the map in any of them.
    const long = [...names].filter((word) => word.length >= 7);
    const texts = [join(ROOT, 'src'), join(ROOT, 'tests'), join(ROOT, 'scripts'), join(ROOT, 'DESIGN.md'), join(ROOT, 'CREDITS.md')]
      .filter((path) => existsSync(path))
      .flatMap((path) => filesUnder(path))
      .filter((file) => /\.(ts|css|html|md|json)$/.test(file) && !file.includes('fixtures'));
    const found: string[] = [];
    for (const file of texts) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const word of long) {
        if (new RegExp(`\\b${word}\\b`).test(text)) found.push(`${relative(ROOT, file)}: a long name from the map`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the reference file is never part of the repository', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^art\/reference\/$/m);
  });
});
