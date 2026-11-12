import {
  campusHappiness,
  campusClean,
  isMessSpot,
  spotClean,
  spotFix,
  wagesPerYear,
  yardStatus,
  PLACED,
  advance,
  applyAction,
  bedsWanted,
  offCampusNow,
  rowBetween,
  STARTER,
  studentsWanted,
  townPlaces,
  averageDesirability,
  buildings,
  dollarsShort,
  enrollment,
  newGame,
  TICK_MS,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  validate,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { takeTurn, type Style } from './bots';

/**
 * Headless balance runs. Plays the pure simulation for many game years under
 * three kinds of player and prints one row per year, then checks the
 * assertions agreed for the current layer. Exits non-zero if one fails.
 *
 *   npm run simulate                 20 years, one seed
 *   npm run simulate -- --years 10 --seeds 1,2,3
 */

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}
const YEARS = Number(option('years', '20'));
const SEEDS = option('seeds', '1').split(',').map(Number);

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const DAY_MS = TICKS_PER_DAY * TICK_MS;
const YEAR_MS = TICKS_PER_YEAR * TICK_MS;

/** How often each kind of player opens the game. */
const CHECK_IN_MS: Record<Style, number> = {
  absent: 30 * DAY_MS,
  casual: 12 * 60 * TICK_MS,
  // Once a day is the slowest rhythm the game supports (DESIGN.md 2.3).
  daily: 24 * 60 * TICK_MS,
  optimizer: 2 * 60 * TICK_MS,
};

interface YearRow {
  year: number;
  students: number;
  cash: number;
  netPerYear: number;
  lots: number;
  avgStage: number;
  desirability: number;
  turnedAway: number;
  grants: number;
}

interface Run {
  style: Style;
  seed: number;
  rows: YearRow[];
  final: GameState;
  checkIns: number;
  checkInsWithPurchase: number;
  checkInsBlocked: number;
}

function yearRow(state: GameState, year: number, turnedAway: number): YearRow {
  const all = buildings(state.map).filter((b) => b.stage > 0);
  const stageSum = all.reduce((s, b) => s + b.stage, 0);
  return {
    year,
    students: enrollment(state),
    cash: state.money.cash,
    netPerYear: state.money.incomePerYear - state.money.spendingPerYear,
    lots: all.length,
    avgStage: all.length ? stageSum / all.length : 0,
    desirability: averageDesirability(state),
    turnedAway,
    grants: state.money.grants,
  };
}

function play(style: Style, seed: number, years: number): Run {
  let state = newGame({ seed, name: `Sim ${style}`, now: T0 });
  const rows: YearRow[] = [];
  const step = CHECK_IN_MS[style];
  const end = T0 + years * YEAR_MS;
  let checkIns = 0;
  let checkInsWithPurchase = 0;
  let checkInsBlocked = 0;
  let lostThisYear = 0;

  // The player acts once before move-in, as a person would in their first session.
  const first = takeTurn(state, style);
  state = first.state;

  // Each year's row is read two days into the fall, once the new class and its waitlist have settled.
  let nextRowAt = T0 + 2 * DAY_MS;

  for (let now = Math.min(T0 + step, end); ; now = Math.min(now + step, end)) {
    // Stop at each row mark on the way, so the numbers are read at the same point every year.
    while (nextRowAt <= now) {
      const r = advance(state, state.clock.lastSimulatedAt, nextRowAt);
      state = r.state;
      lostThisYear += lostToWaitlist(r.log);
      if (rows.length < years) rows.push(yearRow(state, rows.length + 1, lostThisYear));
      lostThisYear = 0;
      nextRowAt += YEAR_MS;
    }
    const result = advance(state, state.clock.lastSimulatedAt, now);
    state = result.state;
    lostThisYear += lostToWaitlist(result.log);

    if (style !== 'absent') {
      const turn = takeTurn(state, style);
      state = turn.state;
      checkIns += 1;
      if (turn.purchases > 0) checkInsWithPurchase += 1;
      if (turn.blockedByCash && turn.purchases === 0) checkInsBlocked += 1;
    }
    if (now >= end) break;
  }
  return { style, seed, rows, final: state, checkIns, checkInsWithPurchase, checkInsBlocked };
}

function lostToWaitlist(log: LogEntry[]): number {
  let total = 0;
  for (const entry of log) {
    if (entry.kind === 'waitlistClosed') total += Number(entry.data?.lost ?? 0);
  }
  return total;
}

function printRun(run: Run): void {
  console.log(`\n${run.style.toUpperCase()}  (seed ${run.seed})`);
  console.log('year  students      cash    net/yr  buildings  avg stage  desirability  lost to waitlist    grants');
  for (const r of run.rows) {
    console.log(
      [
        String(r.year).padStart(4),
        String(r.students).padStart(9),
        dollarsShort(r.cash).padStart(9),
        dollarsShort(r.netPerYear).padStart(9),
        String(r.lots).padStart(10),
        r.avgStage.toFixed(2).padStart(10),
        r.desirability.toFixed(1).padStart(13),
        String(r.turnedAway).padStart(17),
        dollarsShort(r.grants).padStart(9),
      ].join(' '),
    );
  }
  if (run.checkIns > 0) {
    const bought = Math.round((100 * run.checkInsWithPurchase) / run.checkIns);
    const blocked = Math.round((100 * run.checkInsBlocked) / run.checkIns);
    console.log(`check-ins: ${run.checkIns}; made a purchase in ${bought}%; wanted to and could not afford it in ${blocked}%`);
  }
}

// ------------------------------------------------------------ assertions --

const failures: string[] = [];
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures.push(name);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertLayerZero(runs: Run[]): void {
  console.log('\nLAYER 0 ASSERTIONS');
  const casual = runs.find((r) => r.style === 'casual')!;
  const absent = runs.find((r) => r.style === 'absent')!;
  const optimizer = runs.find((r) => r.style === 'optimizer')!;

  // 1. Determinism: one call and a thousand small ones, on a campus with plenty going on.
  {
    const start = play('casual', casual.seed, 2).final;
    const from = start.clock.lastSimulatedAt;
    const to = from + 3 * DAY_MS;
    const once = advance(start, from, to);
    let stepped = start;
    const log: LogEntry[] = [];
    for (let i = 1; i <= 1000; i++) {
      const r = advance(stepped, stepped.clock.lastSimulatedAt, from + Math.floor(((to - from) * i) / 1000));
      stepped = r.state;
      log.push(...r.log);
    }
    check('one advance call equals a thousand small ones', sameJson(once.state, stepped) && sameJson(once.log, log), `${once.info.ticks} ticks, ${once.log.length} log entries`);
  }

  // 2. Catch-up speed: 30 days on the busiest campus we have.
  {
    const busy = runs.find((r) => r.style === 'optimizer')!.final;
    const from = busy.clock.lastSimulatedAt;
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      advance(busy, from, from + 30 * DAY_MS);
      best = Math.min(best, performance.now() - t);
    }
    check('30 days of catch-up runs in under one second', best < 1000, `${best.toFixed(0)} ms with ${buildings(busy.map).length} buildings`);
  }

  // 3. The clock guard.
  {
    const s = casual.final;
    const back = advance(s, s.clock.lastSimulatedAt, s.clock.lastSimulatedAt - 5 * DAY_MS);
    check('a backward clock advances nothing', back.state === s && back.info.clockWentBack && back.log.length === 0, 'state untouched');
  }

  // 4. Neglect: an untouched campus still works after five years.
  {
    const y5 = absent.rows[4];
    const ok = !!y5 && y5.students > 0 && y5.netPerYear > 0 && validate(absent.final) === null;
    check('an untouched campus still works after five years', ok, y5 ? `${y5.students} students, net ${dollarsShort(y5.netPerYear)} a year` : 'ran fewer than five years');
  }

  // 5. A tended campus grows over its first years.
  {
    const y1 = casual.rows[0];
    const y3 = casual.rows[2];
    const ok = !!y1 && !!y3 && y3.students > y1.students * 1.5;
    check("the casual player's enrollment grows over its first years", ok, y1 && y3 ? `${y1.students} in year 1, ${y3.students} in year 3` : 'ran fewer than three years');
  }

  // 6. No run leaves a broken number in the state.
  check('every final state validates', runs.every((r) => validate(r.final) === null), `${runs.length} runs`);

  // 7. The Build menu gives cash somewhere to go. Checked while there is still land to build on.
  {
    const placed = (state: GameState): number => state.map.placed.filter((p) => p && PLACED[p.type].buildable).length;
    const y3 = casual.rows[2];
    const ok = placed(casual.final) >= 5 && !!y3 && y3.cash < 2 * Math.max(1, y3.netPerYear);
    check(
      'a player who uses the Build menu does not pile up cash',
      ok,
      y3 ? `casual: ${placed(casual.final)} buildings placed, ${dollarsShort(y3.cash)} in hand in year 3 against ${dollarsShort(y3.netPerYear)} a year` : 'ran fewer than three years',
    );
  }

  // 8. A campus with no coverage is less happy, and stays so: it never spirals.
  {
    const bare = campusHappiness(absent.final);
    const tended = campusHappiness(optimizer.final);
    const safe = (mood: typeof bare): number => mood.causes.find((c) => c.id === 'safety')?.level ?? 0;
    const ok = bare.score >= 25 && safe(bare) > 0 && safe(bare) < safe(tended) && bare.retention >= 0.95;
    check('an uncovered campus loses happiness but never spirals', ok, `happiness ${bare.score.toFixed(0)} uncovered against ${tended.score.toFixed(0)} covered, after five years and twenty`);
  }

  // 9. A covered campus handles nearly every incident.
  {
    const before = optimizer.final.incidents;
    const later = advance(optimizer.final, optimizer.final.clock.lastSimulatedAt, optimizer.final.clock.lastSimulatedAt + 3 * DAY_MS).state.incidents;
    const handled = later.handled - before.handled;
    const missed = later.missed - before.missed;
    const ok = handled + missed > 10 && handled / (handled + missed) >= 0.9;
    check('a covered campus handles nearly every incident', ok, `${handled} handled and ${missed} missed over three days`);
  }

  // 10. Once a day is enough. Eras and the bailout are not built yet, so this reads the sizes a
  // campus passes on its way up, and the plain grant that stands in for the bailout.
  {
    const daily = runs.find((r) => r.style === 'daily')!;
    const yearReached = (run: Run, students: number): number => run.rows.find((row) => row.students >= students)?.year ?? Infinity;
    const sizes = [500, 1000, 2000, 4000, 8000].filter((size) => yearReached(casual, size) < Infinity);
    const slow = sizes.filter((size) => yearReached(daily, size) > Math.max(yearReached(casual, size) + 1, Math.ceil(1.5 * yearReached(casual, size))));
    const grants = daily.rows.reduce((sum, row) => sum + row.grants, 0);
    check(
      'a once-a-day player is never more than half again as slow as a twice-a-day one, and needs no rescue',
      sizes.length >= 3 && slow.length === 0 && grants === 0,
      `${sizes.map((size) => `${size} students: year ${yearReached(daily, size)} against ${yearReached(casual, size)}`).join('; ')}; grants ${dollarsShort(grants)}`,
    );
  }

  // 11. Living in town saves beds, and only a way in makes it count.
  {
    const fresh = newGame({ seed: casual.seed, name: 'Simulated University', now: T0 });
    const link = STARTER.townLink;
    const cut = applyAction(fresh, { type: 'paint', tool: 'clear', cells: rowBetween([link.x0, link.y], [link.x1, link.y]) });
    const joined = bedsWanted(fresh) / studentsWanted(fresh);
    const alone = cut.ok ? bedsWanted(cut.state) / studentsWanted(cut.state) : 0;
    const grown = casual.final;
    const share = offCampusNow(grown) / Math.max(1, enrollment(grown));
    check(
      'a campus joined to the town needs fewer beds per student than one that is not',
      cut.ok && joined < alone && alone === 1 && share > 0.05 && share <= 0.4 + 1e-9,
      `${joined.toFixed(2)} beds a student joined against ${alone.toFixed(2)} cut off; ${Math.round(share * 100)}% of the casual player's students live in town`,
    );
  }

  // 13. Grounds never spirals. A campus nobody tends gets messy, loses a few points, and stops there.
  {
    const five = play('absent', absent.seed, 5).final;
    const twenty = absent.final;
    const spotless = structuredClone(twenty);
    spotless.grounds.litter = {};
    const lost = campusHappiness(spotless).score - campusHappiness(twenty).score;
    const ok = campusClean(twenty) < 0.5 && Math.abs(campusClean(twenty) - campusClean(five)) < 1e-9 && lost > 1 && lost < 7;
    check(
      'an untended campus gets messy, loses a few points of happiness, and is the same at year five as at year twenty',
      ok,
      `${Math.round(campusClean(five) * 100)}% clean at year five and ${Math.round(campusClean(twenty) * 100)}% at year twenty; ${lost.toFixed(1)} points of happiness lost to litter`,
    );
  }

  // 14. Where a place has its bin and a yard that is keeping up, it stays clean and nothing near it stays broken.
  {
    // The run ends in summer, with the campus at its emptiest, and the fall class arrives during the next day.
    // A yard staffed for summer is short of hands by that evening. So the player looks in once the class is
    // here, as it does every two hours, and it is the day after that visit that is judged.
    const arrived = advance(optimizer.final, optimizer.final.clock.lastSimulatedAt, optimizer.final.clock.lastSimulatedAt + DAY_MS).state;
    const visited = takeTurn(arrived, 'optimizer').state;
    const day = advance(visited, visited.clock.lastSimulatedAt, visited.clock.lastSimulatedAt + DAY_MS).state;
    const places = day.map.placed.filter((p): p is NonNullable<typeof p> => !!p && isMessSpot(p));
    const tended = places.filter((p) => spotFix(day, p) === null);
    const dirty = tended.filter((p) => spotClean(day, p) <= 0.9).length;
    const keepingUp = (id: number): boolean => {
      const yardId = day.map.care.yard[id] ?? -1;
      const yard = yardId >= 0 ? day.map.placed[yardId] : null;
      return !!yard && yardStatus(day, yard).hire === 0 && yardStatus(day, yard).workers > 0;
    };
    const stillBroken = Object.keys(day.grounds.broken).map(Number).filter(keepingUp).length;
    check(
      'a well-staffed place stays above 90% clean and nothing near it is left broken, a day after the player last looked in',
      tended.length >= places.length * 0.6 && dirty === 0 && stillBroken === 0,
      `${tended.length} of ${places.length} places have a bin and a yard that is keeping up; ${dirty} of those are under 90% clean; ${stillBroken} things left broken beside them; ${day.grounds.repaired} repairs so far`,
    );
  }

  // 15. Grounds is not homework: about a bin for each place that drops litter, a few yards, and a small wage bill.
  {
    const s = casual.final;
    const all = s.map.placed.filter((p): p is NonNullable<typeof p> => !!p);
    const spots = all.filter((p) => isMessSpot(p)).length;
    const bins = all.filter((p) => p.type === 'bin').length;
    const yards = all.filter((p) => p.type === 'yard').length;
    const share = wagesPerYear(s) / Math.max(1, s.money.incomePerYear);
    const ok = spots > 0 && bins <= spots * 1.5 && yards >= 1 && spots / yards >= 3 && share < 0.05 && campusClean(s) > 0.75;
    check(
      "the casual player's grounds stay a small job",
      ok,
      `${spots} places that drop litter, ${bins} bins, ${yards} yards (${(spots / Math.max(1, yards)).toFixed(1)} places a yard, against the design's six to eight), wages ${(share * 100).toFixed(1)}% of income, ${Math.round(campusClean(s) * 100)}% clean`,
    );
  }

  // 16. Neglect is never a trap. A campus whose workers were all let go gets filthy and has its bins broken.
  // Hiring what each yard then asks for, and building nothing, brings it back.
  {
    let s = casual.final;
    const yards = s.map.placed.filter((p): p is NonNullable<typeof p> => !!p && p.type === 'yard');
    const staff = (workers: (yard: (typeof yards)[number]) => number): void => {
      for (const yard of yards) {
        const result = applyAction(s, { type: 'staff', yard: yard.id, workers: workers(yard) });
        if (result.ok) s = result.state;
      }
    };
    staff(() => 0);
    s = advance(s, s.clock.lastSimulatedAt, s.clock.lastSimulatedAt + 6 * DAY_MS).state;
    const filthy = campusClean(s);
    const brokenBins = Object.keys(s.grounds.broken).filter((id) => s.map.placed[Number(id)]?.type === 'bin').length;
    // Twice a day, as the casual player would: read each yard's line and hire up to it.
    for (let visit = 0; visit < 10; visit++) {
      staff((yard) => {
        const status = yardStatus(s, yard);
        return Math.min(status.max, Math.max(1, status.workers + status.hire));
      });
      s = advance(s, s.clock.lastSimulatedAt, s.clock.lastSimulatedAt + DAY_MS / 2).state;
    }
    const stuck = yards.filter((yard) => yardStatus(s, yard).beyond).length;
    check(
      'a campus left to rot comes back within five days once its yards are staffed, with nothing new built',
      filthy < 0.5 && brokenBins > 0 && campusClean(s) > 0.9 && stuck === 0,
      `${Math.round(filthy * 100)}% clean with ${brokenBins} bins broken after six days with no workers; ${Math.round(campusClean(s) * 100)}% clean five days after hiring again; ${stuck} yards beyond a full crew`,
    );
  }

  // 12. A car park with no road lets nobody in. With a road to the street it does.
  {
    let state = newGame({ seed: casual.seed, name: 'Simulated University', now: T0 });
    state.money.cash = 1_000_000;
    const before = bedsWanted(state);
    const lot = applyAction(state, { type: 'place', building: 'parking', x: 26, y: 20 });
    if (lot.ok) state = lot.state;
    const noRoad = { spaces: townPlaces(state.map).spaces, beds: bedsWanted(state) };
    const road = applyAction(state, { type: 'paint', tool: 'road', cells: rowBetween([28, 20], [31, 20]) });
    if (road.ok) state = road.state;
    const withRoad = { spaces: townPlaces(state.map).spaces, beds: bedsWanted(state) };
    check(
      'an unconnected car park lets nobody in',
      lot.ok && road.ok && noRoad.spaces === 0 && noRoad.beds === before && withRoad.spaces === 20 && withRoad.beds === before - 20,
      `no road: ${noRoad.spaces} spaces and ${noRoad.beds} beds wanted; with a road: ${withRoad.spaces} spaces and ${withRoad.beds} beds wanted`,
    );
  }
}

// ------------------------------------------------------------------- main --

const started = performance.now();
const allRuns: Run[] = [];
for (const seed of SEEDS) {
  const runs = (['absent', 'daily', 'casual', 'optimizer'] as const).map((style) => play(style, seed, YEARS));
  runs.forEach(printRun);
  allRuns.push(...runs);
}
assertLayerZero(allRuns.filter((r) => r.seed === SEEDS[0]));
console.log(`\n${failures.length === 0 ? 'All assertions passed' : `${failures.length} assertion(s) failed`} in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
process.exit(failures.length === 0 ? 0 : 1);
