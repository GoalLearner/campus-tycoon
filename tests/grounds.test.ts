import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  BIN_CAPACITY,
  binState,
  BREAK_LINES,
  BREAK_SAFETY_SHARE,
  breakChance,
  campusClean,
  campusHappiness,
  cleanAt,
  COST,
  DIRT_AT_CEILING,
  enrollment,
  FIX_WORK,
  fixText,
  GROUNDS_QUIET_TICKS,
  groundsLine,
  isBrokenThing,
  LITTER_CEILING,
  parseSave,
  PART_WEIGHTS,
  partLevel,
  PATH_DIRT,
  PLACED,
  rowBetween,
  SAVE_VERSION,
  seatingAt,
  socialLife,
  spotClean,
  spotFix,
  thingFix,
  validate,
  WAGE_PER_YEAR,
  wagesPerYear,
  WORK_PER_WORKER,
  YARD_MAX_WORKERS,
  yardLine,
  yardStatus,
  type Action,
  type GameState,
  type LogEntry,
  type Placed,
} from '../src/sim';
import { recomputeRates } from '../src/sim/systems/money';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A campus full of students, so the dining hall is as busy as a place gets, with money to build. */
function busy(students = 3000): GameState {
  const state = structuredClone(advance(freshGame(), T0, T0 + 20 * MIN).state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  // An empty campus stays empty: nobody is waiting to move in.
  if (students === 0) state.admissions.waitlist = 0;
  return state;
}

function run(state: GameState, minutes: number): { state: GameState; log: LogEntry[] } {
  const result = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + minutes * MIN);
  return { state: result.state, log: result.log.filter((entry) => entry.kind === 'grounds') };
}

const dining = (state: GameState): Placed => state.map.placed.find((placed) => placed?.type === 'dining')!;
const ofType = (state: GameState, type: string): Placed[] => state.map.placed.filter((placed): placed is Placed => placed?.type === type);
const litter = (state: GameState): number => state.grounds.litter[dining(state).id] ?? 0;
/** A yard two cells from the dining hall, so the hall and its bins are in its circle. */
const withYard = (state: GameState): GameState => act(state, { type: 'place', building: 'yard', x: 6, y: 11 });
const yard = (state: GameState): Placed => ofType(state, 'yard')[0]!;
const staff = (state: GameState, workers: number): GameState => act(state, { type: 'staff', yard: yard(state).id, workers });

describe('a new campus', () => {
  it('starts with two bins beside its dining hall, no yard, and nothing on the ground', () => {
    const state = freshGame();
    expect(ofType(state, 'bin').length).toBe(2);
    expect(ofType(state, 'yard').length).toBe(0);
    expect(state.map.care.bins[dining(state).id]!.length).toBe(2);
    expect(campusClean(state)).toBe(1);
    expect(spotFix(state, dining(state))).toBe('noYard');
    expect(fixText(state, dining(state), 'noYard')).toMatch(/Outside worker coverage/);
  });
});

describe('litter and bins', () => {
  it('falls where students eat, and bins catch most of it', () => {
    const binned = run(busy(), 3 * 60).state;
    const bare = run(act(busy(), { type: 'paint', tool: 'clear', cells: [[9, 12], [12, 12]] }), 3 * 60).state;
    expect(litter(binned)).toBeGreaterThan(0);
    // Bins catch 85%, so far less reaches the ground.
    expect(litter(binned)).toBeLessThan(litter(bare) * 0.25);
    expect(spotFix(bare, dining(bare))).toBe('noBin');
    for (const bin of ofType(binned, 'bin')) expect(binned.grounds.bins[bin.id]).toBeGreaterThan(0);
    // Fewer students, less litter.
    expect(litter(run(busy(60), 3 * 60).state)).toBeLessThan(litter(binned) * 0.5);
  });

  it('a full bin catches nothing, and an emptied one catches again', () => {
    const filled = run(busy(), 10 * 60);
    for (const bin of ofType(filled.state, 'bin')) expect(binState(filled.state, bin.id)).toBe('full');
    expect(filled.log.filter((entry) => entry.data?.event === 'full').length).toBe(2);
    expect(filled.state.grounds.overflowed).toBe(2);
    expect(thingFix(filled.state, ofType(filled.state, 'bin')[0]!)).toBe('noYard');

    // With the bins full, everything dropped lands on the ground.
    const before = litter(filled.state);
    const later = run(filled.state, 60).state;
    const perCheckFull = (litter(later) - before) / 3;
    const early = run(busy(), 60).state;
    const perCheckCaught = litter(early) / 3;
    expect(perCheckFull).toBeGreaterThan(perCheckCaught * 4);

    // A yard's workers empty them without being asked, and they catch again.
    const tended = run(staff(withYard(filled.state), YARD_MAX_WORKERS), 2 * 60).state;
    for (const bin of ofType(tended, 'bin')) expect(binState(tended, bin.id)).not.toBe('full');
    expect(litter(tended)).toBeLessThan(litter(later));
  });

  it('piles up to a ceiling on a campus nobody tends, and stays there', () => {
    const week = run(busy(), 7 * 24 * 60).state;
    const month = run(week, 21 * 24 * 60).state;
    expect(litter(week)).toBe(LITTER_CEILING);
    expect(litter(month)).toBe(LITTER_CEILING);
    expect(spotClean(week, dining(week))).toBeCloseTo(1 - DIRT_AT_CEILING, 6);
    // It costs about five points of Happiness, and no more however long it is left.
    const clean = structuredClone(week);
    clean.grounds.litter = {};
    const lost = campusHappiness(clean).score - campusHappiness(week).score;
    expect(lost).toBeGreaterThan(2);
    expect(lost).toBeLessThan(7);
    // Cleanliness is no worse a month on than after a week: it has levelled off.
    expect(campusClean(month)).toBeCloseTo(campusClean(week), 9);
    expect(partLevel(campusHappiness(month).causes, 'clean')).toBeGreaterThanOrEqual(partLevel(campusHappiness(week).causes, 'clean')! - 1e-9);
  });
});

describe('workers', () => {
  it('clear a spot twice as fast when there are twice as many', () => {
    // Nobody is dropping anything: the campus has emptied for the summer.
    const mess = withYard(busy(0));
    mess.grounds.litter[dining(mess).id] = LITTER_CEILING;
    const checksToClear = (workers: number): number => {
      let state = staff(mess, workers);
      let checks = 0;
      while (litter(state) > 0 && checks < 200) {
        state = run(state, 20).state;
        checks += 1;
      }
      return checks;
    };
    const one = checksToClear(1);
    const two = checksToClear(2);
    expect(one).toBe(Math.ceil(LITTER_CEILING / WORK_PER_WORKER));
    expect(two).toBe(Math.ceil(LITTER_CEILING / (2 * WORK_PER_WORKER)));
    expect(staff(mess, 0).grounds.workers[yard(mess).id]).toBe(0);
  });

  it('keep up when there are enough of them, and say how many more to hire when there are not', () => {
    // A busy hall with no bins takes more than one worker can sweep.
    let state = withYard(act(busy(), { type: 'paint', tool: 'clear', cells: [[9, 12], [12, 12]] }));
    expect(yardStatus(state, yard(state))).toMatchObject({ workers: 1, max: YARD_MAX_WORKERS, hire: 1 });
    expect(yardLine(yardStatus(state, yard(state)))).toBe('Understaffed: hire 1 more.');
    expect(spotFix(state, dining(state))).toBe('noBin');
    const short = run(state, 2 * 24 * 60).state;
    // It sits at its ceiling, less the little one worker sweeps at each check.
    expect(litter(short)).toBeGreaterThanOrEqual(LITTER_CEILING - WORK_PER_WORKER - 1e-9);

    // With its bins back one worker is enough, and the yard says so.
    state = act(state, { type: 'paint', tool: 'bin', cells: [[9, 12], [12, 12]] });
    expect(yardLine(yardStatus(state, yard(state)))).toBe('Keeping up.');
    expect(spotFix(state, dining(state))).toBeNull();
    const kept = run(state, 2 * 24 * 60).state;
    expect(spotClean(kept, dining(kept))).toBeGreaterThan(0.9);
    for (const bin of ofType(kept, 'bin')) expect(binState(kept, bin.id)).not.toBe('full');

    // Nobody on the books: it says to hire.
    expect(yardLine(yardStatus(staff(state, 0), yard(state)))).toMatch(/^Nobody works here\. Hire 1/);
    expect(spotFix(staff(state, 0), dining(state))).toBe('noWorkers');
  });

  it('ask for another yard only when a full crew could never hold the place, not for a backlog', () => {
    const state = withYard(busy());
    const now = yardStatus(state, yard(state));
    expect(now.beyond).toBe(false);
    const full = { ...now, workers: YARD_MAX_WORKERS, supply: YARD_MAX_WORKERS * WORK_PER_WORKER, need: 10, hire: 1 };
    expect(yardLine({ ...full, beyond: false })).toBe('Full crew, catching up.');
    expect(yardLine({ ...full, beyond: true })).toBe('Understaffed, and full. Build another yard near the busiest places.');
    const room = { ...now, workers: 3, supply: 3 * WORK_PER_WORKER, need: 12, hire: 3 };
    expect(yardLine({ ...room, beyond: false })).toBe('Understaffed: hire 1 more.');
    expect(yardLine({ ...room, beyond: true })).toBe('Understaffed: hire 1 more, and build another yard.');
  });

  it('are paid a wage, and a yard holds no more than four', () => {
    let state = withYard(busy());
    expect(state.grounds.workers[yard(state).id]).toBe(1);
    expect(wagesPerYear(state)).toBe(WAGE_PER_YEAR);
    recomputeRates(state);
    const before = state.money.spendingPerYear;
    state = staff(state, 3);
    recomputeRates(state);
    expect(state.money.spendingPerYear - before).toBe(2 * WAGE_PER_YEAR);
    expect(applyAction(state, { type: 'staff', yard: yard(state).id, workers: YARD_MAX_WORKERS + 1 }).ok).toBe(false);
    expect(applyAction(state, { type: 'staff', yard: dining(state).id, workers: 1 }).ok).toBe(false);
    // Bins, benches and tables cost nothing to keep.
    for (const type of ['bin', 'bench', 'table', 'yard'] as const) expect(PLACED[type].upkeepPerYear).toBe(0);
  });
});

describe('seating and the Grounds cause', () => {
  it('counts quads, benches and tables, but not a broken bench', () => {
    let state = busy();
    // A spot with nothing near it.
    expect(seatingAt(state, 3, 25)).toBe(0);
    state = act(state, { type: 'paint', tool: 'bench', cells: [[4, 25]] });
    expect(seatingAt(state, 3, 25)).toBeCloseTo(1 / 1.5, 6);
    state = act(state, { type: 'paint', tool: 'table', cells: [[2, 25]] });
    expect(seatingAt(state, 3, 25)).toBe(1);
    const bench = ofType(state, 'bench')[0]!;
    state.grounds.broken[bench.id] = FIX_WORK;
    expect(isBrokenThing(state, bench.id)).toBe(true);
    expect(seatingAt(state, 3, 25)).toBe(1);
    state.grounds.broken[ofType(state, 'table')[0]!.id] = FIX_WORK;
    expect(seatingAt(state, 3, 25)).toBe(0);
    // The starter quad already seats the lots beside it.
    expect(seatingAt(state, 15, 14)).toBe(1);
  });

  it('is green space, cleanliness and seating, at five, three and two tenths', () => {
    const state = busy();
    const cell = 13 * state.map.width + 10;
    const grounds = approvalAt(state, cell).causes.find((cause) => cause.id === 'grounds')!;
    expect(grounds.parts.map((part) => part.id)).toEqual(['green', 'clean', 'seating']);
    const level = (id: 'green' | 'clean' | 'seating'): number => partLevel([grounds], id)!;
    expect(grounds.level).toBeCloseTo(0.5 * level('green') + 0.3 * level('clean') + 0.2 * level('seating'), 9);
    expect(PART_WEIGHTS.green + PART_WEIGHTS.clean + PART_WEIGHTS.seating).toBeCloseTo(1, 9);
    expect(approvalAt(state, cell).causes.map((cause) => cause.id)).toEqual(['walk', 'grounds', 'life', 'safety']);
    // Nobody sweeps the paths yet, so it is never spotless: 85% at best.
    expect(cleanAt(state, 10, 13)).toBeCloseTo(1 - PATH_DIRT, 9);
    expect(cleanAt(staff(withYard(state), 1), 10, 13)).toBeGreaterThan(0.99);
  });

  it('a picnic table near dining adds to social life', () => {
    const state = busy(800);
    const before = socialLife(state);
    const tables = act(state, { type: 'paint', tool: 'table', cells: rowBetween([8, 11], [13, 11]) });
    expect(socialLife(tables)).toBeGreaterThan(before);
    // One in the middle of nowhere does not.
    const lonely = act(state, { type: 'paint', tool: 'table', cells: rowBetween([2, 26], [7, 26]) });
    expect(socialLife(lonely)).toBe(before);
  });

  it('lays a row at a drag, charges for each, and gives it back on clearing', () => {
    const state = busy();
    const cash = state.money.cash;
    const row = act(state, { type: 'paint', tool: 'bin', cells: rowBetween([2, 25], [5, 25]) });
    expect(ofType(row, 'bin').length).toBe(6);
    expect(cash - row.money.cash).toBe(4 * PLACED.bin.cost);
    const cleared = act(row, { type: 'paint', tool: 'clear', cells: rowBetween([2, 25], [5, 25]) });
    expect(cleared.money.cash).toBe(cash);
    expect(COST.clear).toBe(0);
  });
});

describe('breakage', () => {
  /** A filthy hall with benches around it, and nobody to clean. */
  function filthy(mood: number, safe: boolean): GameState {
    let state = act(busy(), { type: 'paint', tool: 'clear', cells: [[9, 12], [12, 12]] });
    state = act(state, { type: 'paint', tool: 'bench', cells: [...rowBetween([6, 11], [13, 11]), ...rowBetween([6, 10], [13, 10])] });
    if (safe) state = act(state, { type: 'place', building: 'safety', x: 6, y: 8 });
    state.grounds.litter[dining(state).id] = LITTER_CEILING;
    state.admissions.lastSemester = { tick: state.clock.tick, stayed: 3000, left: 0, happiness: mood };
    return state;
  }
  /** Things broken before the next class arrives, two and a half days on. */
  const broken = (state: GameState): number => run(state, 2.5 * 24 * 60).log.filter((entry) => entry.data?.event === 'broken').length;

  it('happens where litter is deep, at most one thing a day at a spot', () => {
    const result = run(filthy(40, false), 6 * 24 * 60);
    const breaks = result.log.filter((entry) => entry.data?.event === 'broken');
    expect(breaks.length).toBeGreaterThan(1);
    expect(breaks.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < breaks.length; i++) expect(breaks[i]!.tick - breaks[i - 1]!.tick).toBeGreaterThanOrEqual(24 * 60);
    // A clean campus breaks nothing.
    const clean = filthy(40, false);
    clean.grounds.litter = {};
    clean.cohorts = [0, 0, 0, 0];
    clean.admissions.waitlist = 0;
    expect(broken(clean)).toBe(0);
  });

  it('is rarer inside a Campus Safety circle, and where students are happy', () => {
    const chance = (mood: number, safe: boolean): number => {
      const state = filthy(mood, safe);
      return breakChance(state, dining(state));
    };
    expect(chance(40, true)).toBeCloseTo(chance(40, false) * BREAK_SAFETY_SHARE, 9);
    expect(chance(98, false)).toBeLessThan(chance(40, false));
    expect(chance(40, false)).toBeLessThan(chance(5, false));
    // And it shows over a week: far fewer things are broken where Campus Safety is near.
    const week = (state: GameState): number => run(state, 2.5 * 24 * 60).log.filter((entry) => entry.data?.event === 'broken').length;
    expect(week(filthy(40, true))).toBeLessThanOrEqual(week(filthy(40, false)));
  });

  it('is fixed inside a yard\'s circle with no tap, and stays broken outside one', () => {
    let state = withYard(busy(0));
    state = act(state, { type: 'paint', tool: 'bench', cells: [[8, 11], [28, 28]] });
    const [near, far] = ofType(state, 'bench') as [Placed, Placed];
    state.grounds.broken[near.id] = FIX_WORK;
    state.grounds.broken[far.id] = FIX_WORK;
    state.grounds.lamps[14 * state.map.width + 10] = FIX_WORK;
    expect(thingFix(state, far)).toBe('noYard');
    expect(fixText(state, far, thingFix(state, far))).toMatch(/Outside worker coverage/);
    const later = run(state, 2 * 60);
    expect(isBrokenThing(later.state, near.id)).toBe(false);
    expect(isBrokenThing(later.state, far.id)).toBe(true);
    expect(later.state.grounds.lamps).toEqual({});
    expect(later.state.grounds.repaired).toBe(2);
    expect(later.log.filter((entry) => entry.data?.event === 'fixed').length).toBe(2);
    // Days later the far one is still waiting.
    expect(isBrokenThing(run(later.state, 3 * 24 * 60).state, far.id)).toBe(true);
  });

  it('keeps every line inside the tone guide', () => {
    const banned = /\b(beer|wine|drunk|alcohol|pub|vodka|smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*|vomit\w*|vandal\w*|rat|rats|roach\w*)\b/i;
    for (const lines of Object.values(BREAK_LINES)) for (const line of lines) expect(line).not.toMatch(banned);
  });
});

describe('while the player is away', () => {
  it('turns out the same in one go or in many small steps', () => {
    let start = withYard(busy());
    start = act(start, { type: 'paint', tool: 'bench', cells: rowBetween([6, 10], [13, 10]) });
    start = staff(start, 0);
    const end = start.clock.lastSimulatedAt + 3 * DAY;
    const once = advance(start, start.clock.lastSimulatedAt, end);
    let stepped = start;
    const log: LogEntry[] = [];
    for (let at = start.clock.lastSimulatedAt + 37 * MIN; at < end; at += 37 * MIN) {
      const result = advance(stepped, stepped.clock.lastSimulatedAt, at);
      stepped = result.state;
      log.push(...result.log);
    }
    const last = advance(stepped, stepped.clock.lastSimulatedAt, end);
    log.push(...last.log);
    expect(last.state.grounds).toEqual(once.state.grounds);
    expect(log.filter((entry) => entry.kind === 'grounds')).toEqual(once.log.filter((entry) => entry.kind === 'grounds'));
    expect(validate(once.state)).toBeNull();
  });

  it('gives grounds one line in the away list: the messiest spot and its fix, bins filled, repairs made', () => {
    const away = run(busy(), 2 * 24 * 60);
    const line = groundsLine(away.state, away.log);
    expect(line).toMatch(/The Dining hall is the messiest spot, \d+% clean\. Outside worker coverage/);
    expect(line).toMatch(/2 bins filled up\./);
    // A tended campus has nothing to report.
    const tended = run(staff(withYard(busy()), 2), 6 * 60);
    expect(groundsLine(tended.state, tended.log)).toBe('');
  });
});

describe('upgrading a version 6 save, from before grounds', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v6.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState }).state;
  const load = (): GameState => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(6);
    return loaded.state;
  };

  it('adds nothing to the map and charges nothing', () => {
    const state = load();
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.money.cash).toBe(old.money.cash);
    expect(state.cohorts).toEqual(old.cohorts);
    expect(state.map.placed).toEqual(old.map.placed);
    expect(state.map.cells).toEqual(old.map.cells);
    expect(state.map.buildings).toEqual(old.map.buildings);
    expect(ofType(state, 'bin').length).toBe(0);
    expect(wagesPerYear(state)).toBe(0);
    expect(validate(state)).toBeNull();
    expect(load()).toEqual(load());
  });

  it('drops no litter for the first day and a half, then begins', () => {
    const state = load();
    expect(enrollment(state)).toBeGreaterThan(100);
    expect(state.grounds.quietUntilTick).toBe(state.clock.tick + GROUNDS_QUIET_TICKS);
    const quiet = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 35 * HOUR).state;
    expect(quiet.grounds.litter).toEqual({});
    expect(campusClean(quiet)).toBe(1);
    const later = advance(quiet, quiet.clock.lastSimulatedAt, quiet.clock.lastSimulatedAt + 6 * HOUR).state;
    expect(campusClean(later)).toBeLessThan(1);
    expect(Object.keys(later.grounds.litter).length).toBeGreaterThan(1);
    expect(later.grounds.bins).toEqual({});
    // A bin's worth of capacity is what a full one holds.
    expect(BIN_CAPACITY).toBeGreaterThan(0);
  });
});
