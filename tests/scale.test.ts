import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  budget,
  campusClean,
  campusHappiness,
  enrollment,
  expectedCrowd,
  fanDemand,
  footballBooks,
  fallClassDraw,
  FOUNDING_CLASS,
  MODEL_STUDENTS,
  newGame,
  openCapacity,
  parseSave,
  PLACED,
  placedCars,
  placedCost,
  placedRoom,
  placedUpkeep,
  POOL_CEILING,
  SAVE_VERSION,
  scaleOf,
  seatsNow,
  serialize,
  smallCount,
  stageSpec,
  TICK_MS,
  TICKS_PER_YEAR,
  townPlaces,
  validate,
  workerCount,
  type GameState,
} from '../src/sim';
import { BENEFITS_SHARE, paintCost } from '../src/sim/config/money';
import { CROWD_STEPS, QUEUE_SHOWN, queueNow, walkersWanted } from '../src/app/crowd';
import { SEATS } from '../src/sim/config/football';
import { freshGame, T0 } from './helpers';

/**
 * The campus scale (DESIGN.md 35.7): one whole number that says how many of
 * the small game's students each bed, seat, parking space and town house
 * stands for. 1 for every campus but the model campus.
 */

/** The last save version before the campus scale. */
const BEFORE_SCALE = 12;

const model = (scale?: number): GameState => newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model', ...(scale === undefined ? {} : { scale }) });

describe('the model campus at its own size', () => {
  it('opens with exactly 46,000 students, in all four class years, in about nine tenths of its seats', () => {
    const state = model();
    expect(MODEL_STUDENTS).toBe(46_000);
    expect(enrollment(state)).toBe(46_000);
    expect(state.cohorts.reduce((a, b) => a + b, 0)).toBe(46_000);
    for (const year of state.cohorts) expect(year).toBeGreaterThan(9_000);
    const full = enrollment(state) / openCapacity(state, 'academic');
    expect(full).toBeGreaterThan(0.88);
    expect(full).toBeLessThan(0.92);
    const inDorms = enrollment(state) - state.offCampus.reduce((a, b) => a + b, 0);
    expect(inDorms / openCapacity(state, 'housing')).toBeGreaterThan(0.85);
    expect(inDorms / openCapacity(state, 'housing')).toBeLessThanOrEqual(0.95);
    expect(Number.isInteger(scaleOf(state))).toBe(true);
    expect(scaleOf(state)).toBeGreaterThan(20);
    expect(validate(state)).toBeNull();
  });

  it('counts its students by class year and never one by one: the save is no bigger than the small campus\'s', () => {
    const big = serialize(model(), T0).length;
    const small = serialize(model(1), T0).length;
    expect(big / small).toBeLessThan(1.02);
  });

  it('has every count that is in heads, and every price, at its own scale', () => {
    const state = model();
    const one = model(1);
    const scale = scaleOf(state);
    expect(scaleOf(one)).toBe(1);
    expect(openCapacity(state, 'academic')).toBe(openCapacity(one, 'academic') * scale);
    expect(openCapacity(state, 'housing')).toBe(openCapacity(one, 'housing') * scale);
    expect(townPlaces(state.map).total).toBe(townPlaces(one.map).total * scale);
    expect(townPlaces(state.map).spaces).toBe(townPlaces(one.map).spaces * scale);
    // The stadium is one stadium of real size at any scale, and so are its coach and its deal (DESIGN.md 35.9).
    expect(seatsNow(state)).toBe(SEATS[0]!);
    expect(seatsNow(one)).toBe(SEATS[0]!);
    expect(workerCount(state)).toBe(workerCount(one) * scale);
    expect(state.football.coach.pay).toBe(one.football.coach.pay);
    // Prices and bills.
    expect(placedCost('library', scale)).toBe(PLACED.library.cost * scale);
    expect(placedUpkeep('library', scale)).toBe(PLACED.library.upkeepPerYear * scale);
    expect(placedRoom('gym', scale)).toBe(PLACED.gym.capacity! * scale);
    expect(placedCars('garage', scale)).toBe(PLACED.garage.cars! * scale);
    expect(paintCost('path', scale)).toBe(paintCost('path', 1) * scale);
    expect(stageSpec('housing', 2, scale).capacity).toBe(stageSpec('housing', 2).capacity * scale);
    expect(stageSpec('housing', 2, scale).upkeepPerYear).toBe(stageSpec('housing', 2).upkeepPerYear * scale);
    // What is not in heads does not move: the desirability a stage asks for, and how long it takes to build.
    expect(stageSpec('housing', 2, scale).desirabilityNeeded).toBe(stageSpec('housing', 2).desirabilityNeeded);
    expect(stageSpec('housing', 2, scale).buildTicks).toBe(stageSpec('housing', 2).buildTicks);
    // The applicant pool has a floor and a ceiling in heads.
    expect(fallClassDraw(state)).toBeLessThanOrEqual(POOL_CEILING * scale);
    expect(fallClassDraw(state)).toBeGreaterThan(FOUNDING_CLASS * scale);
    // Building costs what the Build menu says, at this campus's scale.
    const before = state.money.cash;
    const rich = structuredClone(state);
    rich.money.cash = 1e12;
    const built = applyAction(rich, { type: 'place', building: 'coffee', x: 12, y: 30 });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.cost).toBe(PLACED.coffee.cost * scale);
    expect(state.money.cash).toBe(before);
  });

  it('feels the same at any scale: Happiness and cleanliness do not move, and the campus keeps the same share of its money apart from football', () => {
    const big = model();
    const one = model(1);
    expect(campusHappiness(big).score).toBeCloseTo(campusHappiness(one).score, 6);
    expect(campusClean(big)).toBe(campusClean(one));
    // Football is one programme of real size, so its money is taken out before the two are compared.
    expect(Math.abs(keptApart(big) - keptApart(one))).toBeLessThan(0.5);
    // On the campus that stands for 46,000 the rented field sells out, and far more want a ticket than it holds.
    expect(expectedCrowd(big)).toBe(seatsNow(big));
    expect(fanDemand(big)).toBeGreaterThan(10 * seatsNow(big));
    // Tickets are a small line there, and football costs more than it earns.
    const ball = footballBooks(big);
    expect(ball.tickets / budget(big).incomeTotal).toBeLessThan(0.005);
  });

  it('with football held off, five years at scale 1 and at its own scale end in the same proportion', () => {
    let big = noFootball(model());
    let one = noFootball(model(1));
    const scale = scaleOf(big);
    const year = TICKS_PER_YEAR * TICK_MS;
    for (let n = 0; n < 5; n++) {
      big = advance(big, big.clock.lastSimulatedAt, big.clock.lastSimulatedAt + year).state;
      one = advance(one, one.clock.lastSimulatedAt, one.clock.lastSimulatedAt + year).state;
    }
    const off = (a: number, b: number): number => Math.abs(a / (b * scale) - 1);
    // Measured when this was built: enrollment within 0.1%, cash within 0.7%, a year's spending within 0.8%.
    // What is left is whole numbers: a staff of 41 at scale 1 is 1,148 here, where 46,000 students make it 1,150.
    expect(off(enrollment(big), enrollment(one)), 'enrollment').toBeLessThan(0.005);
    expect(off(big.money.cash, one.money.cash), 'cash').toBeLessThan(0.02);
    expect(off(budget(big).spending, budget(one).spending), "a year's spending").toBeLessThan(0.02);
    expect(off(budget(big).incomeTotal, budget(one).incomeTotal), "a year's income").toBeLessThan(0.02);
    // As many things happened, give or take the whole students a small campus is rounded to.
    expect(off((big.incidents.handled + big.incidents.missed) * scale, one.incidents.handled + one.incidents.missed), 'incidents').toBeLessThan(0.05);
    expect(big.money.grants).toBe(0);
    expect(one.money.grants).toBe(0);
    expect(campusClean(big)).toBeGreaterThan(0.9);
    expect(validate(big)).toBeNull();
  });

  it('with football on, enrollment stays in proportion, and so does the money once football\'s own lines are taken out', () => {
    let big = model();
    let one = model(1);
    const scale = scaleOf(big);
    const year = TICKS_PER_YEAR * TICK_MS;
    for (let n = 0; n < 5; n++) {
      big = advance(big, big.clock.lastSimulatedAt, big.clock.lastSimulatedAt + year).state;
      one = advance(one, one.clock.lastSimulatedAt, one.clock.lastSimulatedAt + year).state;
    }
    const off = (a: number, b: number): number => Math.abs(a / (b * scale) - 1);
    expect(off(enrollment(big), enrollment(one)), 'enrollment').toBeLessThan(0.01);
    expect(off(apart(big).income, apart(one).income), "a year's income apart from football").toBeLessThan(0.02);
    expect(off(apart(big).spending, apart(one).spending), "a year's spending apart from football").toBeLessThan(0.02);
    // The stadium is the same real stadium on both, and both earned a bigger one by filling it.
    expect(seatsNow(big)).toBe(seatsNow(one));
    expect(big.football.stadium.earned).toBeGreaterThanOrEqual(1);
    // Neither needed rescuing, football's cost and all.
    expect(big.money.grants).toBe(0);
    expect(big.money.cash).toBeGreaterThan(model().money.cash);
  });

  it('draws a crowd that follows the real enrollment, and never more than the limits that already hold it', () => {
    const big = model();
    const facts = { pathCells: 180, visiblePathCells: 180, period: 'morning' as const, weekend: false };
    for (let step = 0; step < CROWD_STEPS.length; step++) {
      const wanted = walkersWanted({ ...facts, students: enrollment(big), step });
      expect(wanted).toBeLessThanOrEqual(CROWD_STEPS[step]!.inView);
      // A campus that stands for 46,000 shows at least the crowd of a small campus of 1,600.
      expect(wanted).toBeGreaterThanOrEqual(walkersWanted({ ...facts, students: smallCount(big, enrollment(big)), step }));
    }
    expect(queueNow(enrollment(big), 'dining', 'afternoon')).toBe(QUEUE_SHOWN);
    expect(smallCount(model(1), 400)).toBe(400);
  });
});

/** A campus as it would be with no football programme yet: no season, no games, no football money. */
function noFootball(state: GameState): GameState {
  const copy = structuredClone(state);
  copy.football.firstYear = 9_999;
  copy.timers = copy.timers.filter((timer) => timer.kind !== 'scrimmage' && timer.kind !== 'kickoff' && timer.kind !== 'final');
  return copy;
}

/** A year's income and spending with football's own lines taken out. */
function apart(state: GameState): { income: number; spending: number } {
  const books = budget(state);
  const ball = footballBooks(state);
  return {
    income: books.incomeTotal - ball.tickets - ball.tv,
    spending: books.spending - ball.pay * (1 + BENEFITS_SHARE) - ball.operations - ball.upkeep - ball.utilities,
  };
}

/** Of every $100 that comes in apart from football, how much is kept. */
function keptApart(state: GameState): number {
  const { income, spending } = apart(state);
  return (100 * (income - spending)) / income;
}

describe('every other campus has a scale of 1 and is unchanged', () => {
  it('a new small campus has scale 1', () => {
    const state = freshGame();
    expect(state.map.scale).toBe(1);
    expect(scaleOf(state)).toBe(1);
    expect(state.version).toBe(SAVE_VERSION);
  });

  it('a save from before the scale is given 1, and nothing else about it changes', () => {
    const state = freshGame();
    const later = advance(state, T0, T0 + 3 * 24 * 60 * TICK_MS).state;
    const text = serialize(later, T0);
    const file = JSON.parse(text) as { v: number; state: { version: number; map: { scale?: number } } };
    // As a save of version 12 would have been, the last before the scale: no scale at all.
    file.v = BEFORE_SCALE;
    file.state.version = BEFORE_SCALE;
    delete file.state.map.scale;
    const back = parseSave(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.migratedFrom).toBe(BEFORE_SCALE);
    expect(back.state.map.scale).toBe(1);
    // The scale is the only thing added. Everything else is as it was saved.
    expect(back.state).toEqual(later);
  });

  it('a save with no scale, or a scale that is not a whole number of 1 or more, is refused', () => {
    for (const bad of [0, -3, 1.5]) {
      const state = structuredClone(freshGame());
      state.map.scale = bad;
      expect(validate(state)).not.toBeNull();
    }
  });
});

// ------------------------------------------------- no rule forgets the scale --

const SRC = join(__dirname, '..', 'src');

function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

/** The arguments of a call that begins at `open`, split at the commas that are not inside anything. */
function argsAt(source: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let from = open + 1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        if (source.slice(from, i).trim() !== '') args.push(source.slice(from, i).trim());
        return args;
      }
    } else if (ch === ',' && depth === 1) {
      args.push(source.slice(from, i).trim());
      from = i + 1;
    }
  }
  return args;
}

describe('no rule can forget the scale', () => {
  const files = filesUnder(SRC).filter((file) => file.endsWith('.ts'));
  const outsideConfig = files.filter((file) => !relative(SRC, file).replace(/\\/g, '/').startsWith('sim/config/'));

  it('nothing outside the config reads a building\'s small-game price, upkeep, room or parking directly', () => {
    const problems: string[] = [];
    for (const file of outsideConfig) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/PLACED(?:\[[^\]]+\]|\.\w+)\.(cost|upkeepPerYear|utilitiesPerYear|capacity|cars)\b/g)) {
        problems.push(`${relative(SRC, file)}: ${match[0]}`);
      }
      for (const match of source.matchAll(/\bspec\.(cost|upkeepPerYear|utilitiesPerYear|cars)\b/g)) problems.push(`${relative(SRC, file)}: ${match[0]}`);
      if (/\bCOST\.(path|road|quad|tree|zoneLot|clear)\b/.test(source)) problems.push(`${relative(SRC, file)}: reads COST directly`);
      if (/\bSTAGES\[/.test(source)) problems.push(`${relative(SRC, file)}: reads STAGES directly`);
    }
    expect(problems).toEqual([]);
  });

  it('every reading of a stage, a utility bill, a place to play or a neighbourhood in the game says whose campus it is', () => {
    const wants: Record<string, number> = { stageSpec: 3, utilitiesOf: 2, playCapacity: 2, hoodCapacity: 2, buildEntries: 1 };
    const problems: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [name, count] of Object.entries(wants)) {
        for (const match of source.matchAll(new RegExp(`(?<![.\\w])${name}\\(`, 'g'))) {
          const before = source.slice(Math.max(0, match.index! - 20), match.index!);
          if (/function\s+$/.test(before)) continue;
          const args = argsAt(source, match.index! + name.length);
          if (args.length < count) problems.push(`${relative(SRC, file)}: ${name}(${args.join(', ')})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
