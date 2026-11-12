import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  BENEFITS_SHARE,
  BIN_CAPACITY,
  binState,
  BREAK_LINES,
  BREAK_RATE,
  BROKE_BY,
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
  isBrokenLamp,
  isBrokenThing,
  LAMP_BROKE_BY,
  lampReport,
  LITTER_CEILING,
  moodNear,
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
  thingReport,
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
    const some = YARD_MAX_WORKERS - 1;
    const room = { ...now, workers: some, supply: some * WORK_PER_WORKER, need: 100, hire: 3 };
    expect(yardLine({ ...room, beyond: false })).toBe('Understaffed: hire 1 more.');
    expect(yardLine({ ...room, beyond: true })).toBe('Understaffed: hire 1 more, and build another yard.');
  });

  it('are paid a wage with benefits on top, and a yard holds no more than six', () => {
    let state = withYard(busy());
    expect(state.grounds.workers[yard(state).id]).toBe(1);
    expect(wagesPerYear(state)).toBe(WAGE_PER_YEAR);
    recomputeRates(state);
    const before = state.money.spendingPerYear;
    state = staff(state, 3);
    recomputeRates(state);
    expect(state.money.spendingPerYear - before).toBeCloseTo(2 * WAGE_PER_YEAR * (1 + BENEFITS_SHARE), 6);
    expect(YARD_MAX_WORKERS).toBe(6);
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

  it('is rarer inside a Campus Safety circle', () => {
    const unsafe = filthy(40, false);
    const safe = filthy(40, true);
    // Campus Safety also makes the students nearby a little happier, so the chance is read from the rule itself.
    const rule = (state: GameState, share: number): number => BREAK_RATE * (0.5 + (100 - moodNear(state, dining(state))!) / 100) * share;
    expect(breakChance(unsafe, dining(unsafe))).toBeCloseTo(rule(unsafe, 1), 9);
    expect(breakChance(safe, dining(safe))).toBeCloseTo(rule(safe, BREAK_SAFETY_SHARE), 9);
    expect(breakChance(safe, dining(safe))).toBeLessThan(breakChance(unsafe, dining(unsafe)) * 0.3);
    // And it shows: far fewer things are broken where Campus Safety is near.
    expect(broken(safe)).toBeLessThanOrEqual(broken(unsafe));
  });

  it('reads the Happiness of the students near the spot, not of the whole campus', () => {
    const state = filthy(40, false);
    const hall = dining(state);
    const width = state.map.width;
    // The three dorms beside the hall are its students. The lecture halls across the campus are not.
    const dorms = state.map.buildings.filter((b) => b && b.zone === 'housing' && b.stage >= 1).map((b) => approvalAt(state, b!.y * width + b!.x).score);
    expect(dorms.length).toBe(3);
    const near = moodNear(state, hall)!;
    expect(near).toBeCloseTo(dorms.reduce((sum, score) => sum + score, 0) / dorms.length, 9);
    expect(Math.abs(near - campusHappiness(state).score)).toBeGreaterThan(3);
    // Last semester's campus number no longer moves it.
    const other = filthy(95, false);
    expect(breakChance(other, dining(other))).toBe(breakChance(state, hall));
    // What the students beside it feel does. With the litter gone they are happier, and less gets broken.
    const tidy = structuredClone(state);
    tidy.grounds.litter = {};
    expect(moodNear(tidy, dining(tidy))!).toBeGreaterThan(near + 1);
    expect(breakChance(tidy, dining(tidy))).toBeLessThan(breakChance(state, hall));
    // A mess at the far end of the campus changes the campus's Happiness and leaves this spot's alone.
    let far = act(state, { type: 'paint', tool: 'path', cells: rowBetween([19, 19], [21, 19]) });
    far = act(far, { type: 'place', building: 'courts', x: 19, y: 20 });
    far.grounds.litter[ofType(far, 'courts')[0]!.id] = LITTER_CEILING;
    expect(campusHappiness(far).score).not.toBeCloseTo(campusHappiness(state).score, 6);
    expect(moodNear(far, dining(far))!).toBeCloseTo(near, 9);
  });

  it('falls back on the campus where nobody lives or studies in reach yet', () => {
    const chance = (mood: number): number => {
      const state = act(filthy(mood, false), { type: 'place', building: 'courts', x: 3, y: 26 });
      const lonely = ofType(state, 'courts')[0]!;
      expect(moodNear(state, lonely)).toBeNull();
      return breakChance(state, lonely);
    };
    expect(chance(98)).toBeLessThan(chance(40));
    expect(chance(40)).toBeLessThan(chance(5));
  });

  it('mends a broken bin before anything else, so one crew can win back a filthy place', () => {
    let state = withYard(busy());
    const bins = ofType(state, 'bin');
    expect(bins.length).toBe(2);
    for (const bin of bins) state.grounds.broken[bin.id] = FIX_WORK;
    state.grounds.litter[dining(state).id] = LITTER_CEILING;
    // With both bins broken the hall drops more than one worker sweeps, so sweeping first would never end.
    expect(yardStatus(state, yard(state)).beyond).toBe(false);
    const first = run(state, 80);
    const hour = first.state;
    // Both are mended within three checks, while the litter still lies deep. (One may be broken again later.)
    expect(first.log.filter((entry) => entry.data?.event === 'fixed' && entry.data?.thing === 'bin').length).toBe(2);
    expect(litter(hour)).toBeGreaterThan(0.9 * LITTER_CEILING);
    // And with the bins back, the yard's own advice gets the place clean again.
    const status = yardStatus(hour, yard(hour));
    const staffed = staff(hour, Math.min(YARD_MAX_WORKERS, status.workers + status.hire));
    expect(spotClean(run(staffed, 2 * 24 * 60).state, dining(staffed))).toBeGreaterThan(0.9);
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

  describe('a broken street lamp', () => {
    const LAMP: [number, number] = [10, 14];
    const cellOf = (state: GameState): number => LAMP[1] * state.map.width + LAMP[0];
    const breakLamp = (state: GameState): GameState => {
      const next = structuredClone(state);
      next.grounds.lamps[cellOf(next)] = FIX_WORK;
      next.grounds.lampFrom[cellOf(next)] = { spot: dining(next).id, line: 1 };
      return next;
    };

    it('says what broke it, which yard covers it, and when it will be fixed', () => {
      expect(lampReport(withYard(busy(0)), ...LAMP)).toBeNull();
      const state = breakLamp(withYard(busy(0)));
      expect(isBrokenLamp(state, ...LAMP)).toBe(true);
      const report = lampReport(state, ...LAMP)!;
      expect(report.spot?.id).toBe(dining(state).id);
      expect(report.line).toBe(1);
      expect(report.yard?.id).toBe(yard(state).id);
      expect(report.workers).toBe(1);
      // The time it gives is the time it takes: still broken one check sooner, fixed on the minute.
      expect(report.minutes).not.toBeNull();
      const minutes = report.minutes!;
      expect(minutes).toBeGreaterThan(20);
      expect(minutes).toBeLessThanOrEqual(60);
      expect(isBrokenLamp(run(state, minutes - 20).state, ...LAMP)).toBe(true);
      const fixed = run(state, minutes).state;
      expect(isBrokenLamp(fixed, ...LAMP)).toBe(false);
      expect(fixed.grounds.lampFrom).toEqual({});
      // Asking changes nothing.
      const before = JSON.stringify(state);
      lampReport(state, ...LAMP);
      expect(JSON.stringify(state)).toBe(before);
    });

    it('takes longer behind a crew with more to do, and says when nobody will come', () => {
      // A second worker gets there sooner.
      const one = breakLamp(withYard(busy(0)));
      const two = staff(one, 2);
      expect(lampReport(two, ...LAMP)!.minutes!).toBeLessThan(lampReport(one, ...LAMP)!.minutes!);
      // A filthy hall with no bins keeps one worker sweeping for good: the lamp is not reached.
      let swamped = act(withYard(busy()), { type: 'paint', tool: 'clear', cells: [[9, 12], [12, 12]] });
      swamped.grounds.litter[dining(swamped).id] = LITTER_CEILING;
      swamped = breakLamp(swamped);
      const stuck = lampReport(swamped, ...LAMP)!;
      expect(stuck.yard).not.toBeNull();
      expect(stuck.minutes).toBeNull();
      expect(isBrokenLamp(run(swamped, 3 * 24 * 60).state, ...LAMP)).toBe(true);
      // Nobody on the books, or no yard at all.
      const idle = lampReport(staff(one, 0), ...LAMP)!;
      expect(idle.yard).not.toBeNull();
      expect(idle.workers).toBe(0);
      expect(idle.minutes).toBeNull();
      const alone = lampReport(breakLamp(busy(0)), ...LAMP)!;
      expect(alone.yard).toBeNull();
      expect(alone.minutes).toBeNull();
    });

    it('remembers which place\'s litter led to it, and which story it was', () => {
      // No bins and no benches by the hall: the lamps on its path are all there is to break.
      let state = act(busy(), { type: 'paint', tool: 'clear', cells: [[9, 12], [12, 12]] });
      state.grounds.litter[dining(state).id] = LITTER_CEILING;
      let entry: LogEntry | undefined;
      for (let day = 0; day < 12 && !entry; day++) {
        const result = run(state, 24 * 60);
        state = result.state;
        entry = result.log.find((line) => line.data?.event === 'broken');
      }
      expect(entry?.data?.thing).toBe('lamp');
      const cells = Object.keys(state.grounds.lamps).map(Number);
      expect(cells.length).toBeGreaterThan(0);
      const from = state.grounds.lampFrom[cells[0]!]!;
      expect(from.spot).toBe(dining(state).id);
      const width = state.map.width;
      const report = lampReport(state, cells[0]! % width, Math.floor(cells[0]! / width))!;
      expect(report.spot?.id).toBe(dining(state).id);
      expect(BREAK_LINES.lamp).toContain(entry!.text);
      expect(report.line).toBeGreaterThanOrEqual(0);
      expect(report.line).toBeLessThan(LAMP_BROKE_BY.length);
      expect(report.yard).toBeNull();
    });

    it('has the same to say for a broken bin, bench or picnic table', () => {
      let state = withYard(busy(0));
      state = act(state, { type: 'paint', tool: 'bench', cells: [[8, 11]] });
      state = act(state, { type: 'paint', tool: 'table', cells: [[28, 28]] });
      const bench = ofType(state, 'bench')[0]!;
      const table = ofType(state, 'table')[0]!;
      const bin = ofType(state, 'bin')[0]!;
      expect(thingReport(state, bench)).toBeNull();
      state.grounds.broken[bench.id] = FIX_WORK;
      state.grounds.brokenFrom[bench.id] = { spot: dining(state).id, line: 1 };
      state.grounds.broken[table.id] = FIX_WORK;
      state.grounds.broken[bin.id] = FIX_WORK;
      state.grounds.brokenFrom[bin.id] = { spot: dining(state).id, line: 0 };

      // The bench by the yard: its cause, its yard, and a time that is the time it takes.
      const near = thingReport(state, bench)!;
      expect(near).toMatchObject({ kind: 'bench', line: 1, workers: 1 });
      expect(near.spot?.id).toBe(dining(state).id);
      expect(near.yard?.id).toBe(yard(state).id);
      const minutes = near.minutes!;
      expect(minutes).toBeGreaterThan(0);
      expect(isBrokenThing(run(state, minutes - 20).state, bench.id)).toBe(true);
      const fixed = run(state, minutes).state;
      expect(isBrokenThing(fixed, bench.id)).toBe(false);
      expect(fixed.grounds.brokenFrom[bench.id]).toBeUndefined();
      // The bin is mended first, so it is done sooner than the bench.
      expect(thingReport(state, bin)!.minutes!).toBeLessThan(minutes);
      expect(thingReport(state, bin)!.kind).toBe('bin');

      // The table across the campus: no cause was kept, nothing drops litter near it, and no yard reaches it.
      const far = thingReport(state, table)!;
      expect(far).toMatchObject({ kind: 'table', line: null, spot: null, yard: null, workers: 0, minutes: null });
      // With nobody on the books the near one is not coming either.
      expect(thingReport(staff(state, 0), bench)).toMatchObject({ workers: 0, minutes: null });
      // Cleared, it is forgotten.
      const cleared = run(act(state, { type: 'paint', tool: 'clear', cells: [[28, 28]] }), 20).state;
      expect(cleared.grounds.broken[table.id]).toBeUndefined();
      expect(cleared.grounds.brokenFrom[table.id]).toBeUndefined();
    });

    it('keeps the cause when breakage breaks a bin, bench or table', () => {
      let state = act(busy(), { type: 'paint', tool: 'bench', cells: rowBetween([6, 11], [13, 11]) });
      state.grounds.litter[dining(state).id] = LITTER_CEILING;
      const result = run(state, 6 * 24 * 60);
      const ids = Object.keys(result.state.grounds.broken).map(Number);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const from = result.state.grounds.brokenFrom[id]!;
        expect(from.spot).toBe(dining(state).id);
        const kind = result.state.map.placed[id]!.type as 'bin' | 'bench' | 'table';
        expect(from.line).toBeLessThan(BROKE_BY[kind].length);
        expect(thingReport(result.state, result.state.map.placed[id]!)!.spot?.id).toBe(dining(state).id);
      }
    });

    it('is forgotten when its path is cleared', () => {
      let state = breakLamp(busy(0));
      state = act(state, { type: 'paint', tool: 'clear', cells: [LAMP] });
      expect(isBrokenLamp(state, ...LAMP)).toBe(false);
      expect(lampReport(state, ...LAMP)).toBeNull();
      const later = run(state, 20).state;
      expect(later.grounds.lamps).toEqual({});
      expect(later.grounds.lampFrom).toEqual({});
    });
  });

  it('keeps every line inside the tone guide', () => {
    const banned = /\b(beer|wine|drunk|alcohol|pub|vodka|smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*|vomit\w*|vandal\w*|rat|rats|roach\w*)\b/i;
    for (const lines of Object.values(BREAK_LINES)) for (const line of lines) expect(line).not.toMatch(banned);
    // A broken thing's panel tells the same stories as the news of it breaking.
    for (const kind of ['bin', 'bench', 'table', 'lamp'] as const) {
      for (const line of BROKE_BY[kind]) expect(line).not.toMatch(banned);
      expect(BROKE_BY[kind].length).toBe(BREAK_LINES[kind].length);
    }
    expect(LAMP_BROKE_BY).toBe(BROKE_BY.lamp);
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

describe('upgrading a version 7 save, from when a yard reached eight cells', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v7.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState }).state;
  const load = (): GameState => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(7);
    return loaded.state;
  };

  it('changes nothing the player built or owns', () => {
    const state = load();
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.money.cash).toBe(old.money.cash);
    expect(state.cohorts).toEqual(old.cohorts);
    expect(state.map.placed).toEqual(old.map.placed);
    expect(state.map.cells).toEqual(old.map.cells);
    expect(state.grounds.litter).toEqual(old.grounds.litter);
    expect(state.grounds.lamps).toEqual(old.grounds.lamps);
    expect(state.grounds.workers).toEqual(old.grounds.workers);
    expect(state.grounds.lampFrom).toEqual({});
    expect(validate(state)).toBeNull();
    expect(load()).toEqual(load());
  });

  it('lets the yard reach the store ten cells away, which it could not before', () => {
    const state = load();
    const store = ofType(state, 'store')[0]!;
    const bench = ofType(state, 'bench')[0]!;
    expect(old.map.care.yard[store.id]).toBe(-1);
    expect(old.grounds.litter[store.id]).toBe(LITTER_CEILING);
    expect(isBrokenThing(state, bench.id)).toBe(true);
    expect(state.map.care.yard[store.id]).toBe(yard(state).id);
    expect(state.map.care.yard[bench.id]).toBe(yard(state).id);
    // Its worker sweeps the store and mends the bench without being asked.
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state;
    expect(spotClean(later, store)).toBeGreaterThan(0.9);
    expect(isBrokenThing(later, bench.id)).toBe(false);
  });

  it('explains a lamp broken before the cause was kept, by the nearest place that drops litter', () => {
    const state = load();
    const cells = Object.keys(state.grounds.lamps).map(Number);
    expect(cells.length).toBe(1);
    const width = state.map.width;
    const report = lampReport(state, cells[0]! % width, Math.floor(cells[0]! / width))!;
    expect(report.line).toBeNull();
    expect(report.spot?.type).toBe('store');
    // It stands thirteen cells from the yard: out of reach at twelve cells, inside the circle at sixteen.
    expect(report.yard?.id).toBe(yard(state).id);
    expect(report.minutes).not.toBeNull();
  });
});

describe('upgrading a version 8 save, from when a yard reached twelve cells', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v8.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState }).state;
  const load = (): GameState => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(8);
    return loaded.state;
  };

  it('keeps the map and the grounds as they were', () => {
    const state = load();
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.map.placed).toEqual(old.map.placed);
    expect(state.map.cells).toEqual(old.map.cells);
    expect(state.grounds.litter).toEqual(old.grounds.litter);
    expect(state.grounds.broken).toEqual(old.grounds.broken);
    expect(state.grounds.workers).toEqual(old.grounds.workers);
    expect(state.grounds.brokenFrom).toEqual({});
    expect(validate(state)).toBeNull();
    expect(load()).toEqual(load());
  });

  it('lets the yard reach the store fourteen cells away, and explains the bench broken before causes were kept', () => {
    const state = load();
    const store = ofType(state, 'store')[0]!;
    const bench = ofType(state, 'bench')[0]!;
    expect(old.map.care.yard[store.id]).toBe(-1);
    expect(state.map.care.yard[store.id]).toBe(yard(state).id);
    const report = thingReport(state, bench)!;
    expect(report).toMatchObject({ kind: 'bench', line: null });
    expect(report.spot?.type).toBe('store');
    expect(report.yard?.id).toBe(yard(state).id);
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state;
    expect(spotClean(later, store)).toBeGreaterThan(0.9);
    expect(isBrokenThing(later, bench.id)).toBe(false);
  });
});
