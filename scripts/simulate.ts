import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BENEFITS_SHARE,
  budget,
  parseSave,
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
  BREAK_LIFT,
  fieldAverage,
  FIELD_MEAN,
  kickoff,
  ME,
  STRESS_HAPPINESS,
  teamRating,
  TICKS_PER_HOUR,
  advisorLines,
  edition,
  everyWrittenItem,
  HAPPY_CAP,
  MIN_WINDOW_TICKS,
  NEW_PER_DAY,
  newspaperLines,
  planNotices,
  ROUTINE_CAP,
  TOP_ITEMS,
  toneProblem,
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
  income: number;
  spending: number;
  /** Of every $100 that comes in, how much is kept. */
  kept: number;
  endowment: number;
}

interface Run {
  style: Style;
  seed: number;
  rows: YearRow[];
  final: GameState;
  checkIns: number;
  checkInsWithPurchase: number;
  checkInsBlocked: number;
  /** The football and calendar layer: what was seen along the way. */
  seen: Seen;
}

interface Seen {
  /** The tick of every visit. */
  visits: number[];
  /** Every annual decision that opened: when it opened and when it closed. */
  decisions: Array<{ opens: number; closes: number; kind: string }>;
  /** Exam reports, by which exams they were for. */
  exams: Record<string, number>;
  /** Stress at its highest, at its highest outside an exam week, and at its highest during a break. */
  stressMax: number;
  stressOutsideExams: number;
  stressOnBreak: number;
  /** The least and the most the calendar and the sky ever moved Happiness. */
  deltaMin: number;
  deltaMax: number;
  /** Football seasons finished, and how many of them had ten games for every team and a table that added up. */
  seasons: number;
  seasonsSound: number;
  /** The desk (DESIGN.md section 36). Every routine item that opened: what it was, when it opened and when it closes. */
  desk: Array<{ opens: number; closes: number; key: string }>;
  /** The most routine items ever open at once, whenever the campus was looked at. */
  deskMost: number;
  /** Routine items that took their default, and that the player answered. */
  deskDefaults: number;
  deskAnswered: number;
  /** What the answers took out of the bank over the whole run, less what they brought in, and what went into the endowment. */
  deskSpent: number;
  deskEndowed: number;
  /** Items seen on a desk, and how many had a default or a pick that was not one of their choices. */
  deskSeen: number;
  deskUnsound: number;
  /** Editions of the paper printed at a visit, how many had nothing at the top, and how many had more than four things. */
  editions: number;
  editionsEmpty: number;
  editionsOver: number;
  /** Lines checked against the tone guide, and the ones that broke it. */
  lines: number;
  toneBroken: string[];
}

const newSeen = (): Seen => ({
  visits: [],
  decisions: [],
  exams: {},
  stressMax: 0,
  stressOutsideExams: 0,
  stressOnBreak: 0,
  deltaMin: 0,
  deltaMax: 0,
  seasons: 0,
  seasonsSound: 0,
  desk: [],
  deskMost: 0,
  deskDefaults: 0,
  deskAnswered: 0,
  deskSpent: 0,
  deskEndowed: 0,
  deskSeen: 0,
  deskUnsound: 0,
  editions: 0,
  editionsEmpty: 0,
  editionsOver: 0,
  lines: 0,
  toneBroken: [],
});

/** Check lines against the tone guide's banned and retired words. */
function tone(seen: Seen, lines: readonly string[]): void {
  for (const line of lines) {
    seen.lines += 1;
    if (toneProblem(line) !== null && seen.toneBroken.length < 20) seen.toneBroken.push(line);
  }
}

/** Read what a stretch of time left in the log, and how the campus stands at the end of it. */
function look(seen: Seen, state: GameState, log: LogEntry[]): void {
  for (const entry of log) {
    if (entry.kind === 'decision' && entry.data?.closes !== undefined) seen.decisions.push({ opens: entry.tick, closes: Number(entry.data.closes), kind: String(entry.data.kind) });
    if (entry.kind === 'exam') seen.exams[String(entry.data?.id)] = (seen.exams[String(entry.data?.id)] ?? 0) + 1;
    if (entry.kind === 'inbox' && entry.data?.closes !== undefined) seen.desk.push({ opens: entry.tick, closes: Number(entry.data.closes), key: String(entry.data.key) });
    if (entry.kind === 'inbox' && entry.data?.byDefault === 1) seen.deskDefaults += 1;
  }
  seen.deskMost = Math.max(seen.deskMost, state.inbox.open.length);
  const season = campusHappiness(state).season;
  seen.stressMax = Math.max(seen.stressMax, season.stress.score);
  if (season.day.kind !== 'finals' && season.day.kind !== 'midterms') seen.stressOutsideExams = Math.max(seen.stressOutsideExams, season.stress.score);
  if (season.day.kind === 'break' || season.day.kind === 'summer') seen.stressOnBreak = Math.max(seen.stressOnBreak, season.stress.score);
  seen.deltaMin = Math.min(seen.deltaMin, season.delta);
  seen.deltaMax = Math.max(seen.deltaMax, season.delta);
}

/** True when a finished season gave every conference team ten games and its table adds up. */
function seasonSound(state: GameState): boolean {
  const season = state.football.season;
  if (!season || !season.closed) return false;
  const teams = Object.keys(season.table);
  if (teams.length !== 12) return false;
  let wins = 0;
  let losses = 0;
  for (const team of teams) {
    const record = season.table[team]!;
    const extra = team === String(ME) ? season.games.filter((game) => game.slot >= 10 && game.done).length : 0;
    if (record.w + record.l !== 10 + extra || record.cw + record.cl !== 9 || record.dw + record.dl !== 5) return false;
    wins += record.cw;
    losses += record.cl;
  }
  return wins === losses && wins === 54;
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
    income: state.money.incomePerYear,
    spending: state.money.spendingPerYear,
    kept: state.money.incomePerYear > 0 ? (100 * (state.money.incomePerYear - state.money.spendingPerYear)) / state.money.incomePerYear : 0,
    endowment: state.money.endowment,
  };
}

/** False for one comparison run: the player looks in as usual and leaves the desk alone, so every item takes its default. */
let answersDesk = true;

function play(style: Style, seed: number, years: number, campus: 'small' | 'model' = 'small'): Run {
  let state = newGame({ seed, name: `Sim ${style}`, now: T0, campus });
  const rows: YearRow[] = [];
  const step = CHECK_IN_MS[style];
  const end = T0 + years * YEAR_MS;
  let checkIns = 0;
  let checkInsWithPurchase = 0;
  let checkInsBlocked = 0;
  let lostThisYear = 0;
  const seen = newSeen();
  let seasonCounted = 0;

  // The player acts once before move-in, as a person would in their first session.
  const first = takeTurn(state, style);
  state = first.state;

  // Each year's row is read two days into the fall, once the new class and its waitlist have settled.
  let nextRowAt = T0 + 2 * DAY_MS;

  for (let now = Math.min(T0 + step, end); ; now = Math.min(now + step, end)) {
    // Everything since the last visit, for the paper that greets this one.
    const before = state;
    const gap: LogEntry[] = [];
    // Stop at each row mark on the way, so the numbers are read at the same point every year.
    while (nextRowAt <= now) {
      const r = advance(state, state.clock.lastSimulatedAt, nextRowAt);
      state = r.state;
      gap.push(...r.log);
      lostThisYear += lostToWaitlist(r.log);
      look(seen, state, r.log);
      if (rows.length < years) rows.push(yearRow(state, rows.length + 1, lostThisYear));
      lostThisYear = 0;
      nextRowAt += YEAR_MS;
    }
    const result = advance(state, state.clock.lastSimulatedAt, now);
    state = result.state;
    lostThisYear += lostToWaitlist(result.log);
    look(seen, state, result.log);
    gap.push(...result.log);
    // The paper that greets this visit (DESIGN.md 36.2): something at its top, never more than four, every line inside the tone guide.
    const away = state.clock.tick - before.clock.tick;
    if (style !== 'absent' && away >= 60) {
      const paper = edition(state, gap, { minutes: away, cashBefore: before.money.cash, cashAfter: state.money.cash, studentsBefore: enrollment(before), studentsAfter: enrollment(state) });
      seen.editions += 1;
      if (paper.top.length === 0 || paper.headline === '') seen.editionsEmpty += 1;
      if (paper.top.length > TOP_ITEMS) seen.editionsOver += 1;
      tone(seen, [paper.headline, paper.deck, ...paper.top.map((item) => item.text), ...paper.more, ...paper.scores, ...(paper.admissions ? [paper.admissions] : []), ...paper.poll.map((line) => line.label)]);
    }
    // A football season that has just finished is checked once, while its table is still there.
    const season = state.football.season;
    if (season && season.closed && season.year > seasonCounted) {
      seasonCounted = season.year;
      seen.seasons += 1;
      if (seasonSound(state)) seen.seasonsSound += 1;
    }

    if (style !== 'absent') {
      seen.visits.push(state.clock.tick);
      const turn = takeTurn(state, style);
      state = turn.state;
      checkIns += 1;
      if (turn.purchases > 0) checkInsWithPurchase += 1;
      if (turn.blockedByCash && turn.purchases === 0) checkInsBlocked += 1;
      // Every player who looks in takes the advisor's pick on whatever is open. The absent one never does.
      for (const decision of state.decisions.open) {
        if (decision.chosen !== null) continue;
        const picked = applyAction(state, { type: 'decide', id: decision.id, option: decision.advised });
        if (picked.ok) state = picked.state;
      }
      // The desk: every item is read, checked, and given the advisor's pick. One the campus cannot pay for is left to its default.
      for (const item of [...state.inbox.open]) {
        seen.deskSeen += 1;
        const ids = item.options.map((choice) => choice.id);
        if (item.options.length < 2 || !ids.includes(item.fallback) || !ids.includes(item.advised)) seen.deskUnsound += 1;
        tone(seen, [item.title, item.body, ...item.options.flatMap((choice) => [choice.label, choice.detail])]);
        if (!answersDesk) continue;
        const picked = applyAction(state, { type: 'inbox', id: item.id, option: item.advised });
        if (picked.ok) {
          seen.deskEndowed += picked.state.money.endowment - state.money.endowment;
          seen.deskSpent += state.money.cash - picked.state.money.cash - (picked.state.money.endowment - state.money.endowment);
          state = picked.state;
          seen.deskAnswered += 1;
        }
      }
      tone(seen, advisorLines(state).map((advisor) => advisor.issue));
    }
    if (now >= end) break;
  }
  return { style, seed, rows, final: state, checkIns, checkInsWithPurchase, checkInsBlocked, seen };
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
  console.log('year  students      cash    net/yr  kept  endowment  buildings  avg stage  desirability  lost to waitlist    grants');
  for (const r of run.rows) {
    console.log(
      [
        String(r.year).padStart(4),
        String(r.students).padStart(9),
        dollarsShort(r.cash).padStart(9),
        dollarsShort(r.netPerYear).padStart(9),
        `${r.kept.toFixed(0)}%`.padStart(5),
        dollarsShort(r.endowment).padStart(10),
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
    check(
      'an untouched campus still works, and still nets a surplus, after five years',
      ok,
      y5 ? `${y5.students} students, net ${dollarsShort(y5.netPerYear)} a year, ${y5.kept.toFixed(0)} of every $100 kept` : 'ran fewer than five years',
    );
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
    // The casual player's campus is the covered one. The optimizer spends every dollar on lots the moment it
    // has one, and since staff are paid it ends up with half its dorms outside any Campus Safety circle.
    const tended = campusHappiness(casual.final);
    const safe = (mood: typeof bare): number => mood.causes.find((c) => c.id === 'safety')?.level ?? 0;
    const ok = bare.score >= 25 && safe(bare) > 0 && safe(bare) < safe(tended) && bare.retention >= 0.95;
    check('an uncovered campus loses happiness but never spirals', ok, `happiness ${bare.score.toFixed(0)} uncovered against ${tended.score.toFixed(0)} covered, after five years and twenty`);
  }

  // 9. A covered campus handles nearly every incident.
  {
    const before = casual.final.incidents;
    const later = advance(casual.final, casual.final.clock.lastSimulatedAt, casual.final.clock.lastSimulatedAt + 3 * DAY_MS).state.incidents;
    const handled = later.handled - before.handled;
    const missed = later.missed - before.missed;
    const ok = handled + missed > 10 && handled / (handled + missed) >= 0.9;
    check('a covered campus handles nearly every incident', ok, `the casual player's campus: ${handled} handled and ${missed} missed over three days`);
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
    const share = (wagesPerYear(s) * (1 + BENEFITS_SHARE)) / Math.max(1, s.money.incomePerYear);
    const ok = spots > 0 && bins <= spots * 1.5 && yards >= 1 && spots / yards >= 5 && share < 0.05 && campusClean(s) > 0.75;
    check(
      "the casual player's grounds stay a small job",
      ok,
      `${spots} places that drop litter, ${bins} bins, ${yards} yards (${(spots / Math.max(1, yards)).toFixed(1)} places a yard, against the design's six to eight), wages with benefits ${(share * 100).toFixed(1)}% of income, ${Math.round(campusClean(s) * 100)}% clean`,
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
    // A filthy campus is the dear one to catch up: every dirty place rolls for breakage on every beat, and each
    // roll that depends on it reads how the students around the place feel. It still has to be quick.
    {
      const from = s.clock.lastSimulatedAt;
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        advance(s, from, from + 30 * DAY_MS);
        best = Math.min(best, performance.now() - t);
      }
      const places = s.map.placed.filter((p) => !!p && isMessSpot(p)).length;
      check('30 days of catch-up on a campus nobody tends runs in under one second', best < 1000, `${best.toFixed(0)} ms with ${places} places that drop litter and no workers`);
    }
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

  // ---- Money (DESIGN.md 31.6)
  const daily = runs.find((r) => r.style === 'daily')!;

  // 17. Payroll, with benefits, is at least half of what a mature campus spends.
  {
    const shares = [casual, daily, optimizer].map((run) => {
      const b = budget(run.final);
      return { style: run.style, share: (b.groups.find((g) => g.id === 'payroll')?.amount ?? 0) / Math.max(1, b.fullSpending) };
    });
    check(
      'payroll is at least half of spending on a mature campus',
      shares.every((entry) => entry.share >= 0.5),
      shares.map((entry) => `${entry.style} ${Math.round(entry.share * 100)}%`).join(', '),
    );
  }

  // 18. Mid-game, between 10 and 20 of every $100 is kept. Years 3 to 8: past the opening, before the land runs out.
  {
    const mid = [casual, daily].flatMap((run) => run.rows.filter((row) => row.year >= 3 && row.year <= 8).map((row) => ({ style: run.style, ...row })));
    const low = Math.min(...mid.map((row) => row.kept));
    const high = Math.max(...mid.map((row) => row.kept));
    check(
      'the mid-game margin sits between 10 and 20%',
      mid.length >= 10 && low >= 10 && high <= 20,
      `casual and once-a-day players, years 3 to 8: ${low.toFixed(1)}% at the least and ${high.toFixed(1)}% at the most; payroll ${Math.round((100 * (budget(casual.final).groups.find((g) => g.id === 'payroll')?.amount ?? 0)) / Math.max(1, casual.final.money.incomePerYear))}% of the casual player's income at the end`,
    );
  }

  // 19. Real costs, and seniors who graduate from the first spring, must not slow a campus by more than a year.
  // The pace is what both players managed before play stop 5: the year each size was first read.
  {
    const PACE_BEFORE: Record<number, number> = { 500: 2, 1000: 3, 2000: 4, 4000: 6, 8000: 11 };
    const yearReached = (run: Run, students: number): number => run.rows.find((row) => row.students >= students)?.year ?? Infinity;
    const late: string[] = [];
    const told: string[] = [];
    for (const run of [casual, daily]) {
      for (const [size, was] of Object.entries(PACE_BEFORE)) {
        const now = yearReached(run, Number(size));
        if (now > was + 1) late.push(`${run.style} ${size}`);
        if (run === casual) told.push(`${size}: year ${now} (was ${was})`);
      }
    }
    check(
      'the casual and once-a-day players still reach each campus size within a year of the pace before real costs',
      late.length === 0,
      `casual ${told.join(', ')}; once a day ${Object.keys(PACE_BEFORE).map((size) => `${size}: year ${yearReached(daily, Number(size))}`).join(', ')}`,
    );
  }

  // 20. Cash has somewhere to go. Nobody sits on more than a year of their own spending.
  {
    const worst = runs
      .filter((run) => run.style !== 'absent')
      .map((run) => ({ style: run.style, most: Math.max(...run.rows.map((row) => row.cash / Math.max(1, row.spending))), endowment: run.final.money.endowment }));
    check(
      'no test player holds more cash than a year of its own spending at any reading',
      worst.every((entry) => entry.most <= 1),
      worst.map((entry) => `${entry.style}: ${entry.most.toFixed(2)} of a year at most, ${dollarsShort(entry.endowment)} in the endowment by the end`).join('; '),
    );
  }

  // 21. A mature save from before these costs climbs to them in seven days and never needs the state.
  {
    // Read from the repository root, where `npm run simulate` runs.
    const text = readFileSync(resolve('tests/fixtures/save-v8-mature.json'), 'utf8');
    const loaded = parseSave(text);
    if (!loaded.ok) {
      check('a mature save from before real costs needs no rescue while they phase in', false, loaded.reason);
    } else {
      let s = loaded.state;
      const before = { spending: s.money.spendingPerYear, income: s.money.incomePerYear, students: enrollment(s) };
      let least = s.money.cash;
      let steps = 0;
      // Nine days, visited twice a day, as its player would.
      for (let visit = 0; visit < 18; visit++) {
        const result = advance(s, s.clock.lastSimulatedAt, s.clock.lastSimulatedAt + DAY_MS / 2);
        steps += result.log.filter((entry) => entry.kind === 'costs').length;
        s = takeTurn(result.state, 'casual').state;
        least = Math.min(least, s.money.cash);
      }
      const b = budget(s);
      check(
        'a mature save from before real costs needs no rescue while they phase in',
        s.money.grants === 0 && least > 0 && steps === 7 && b.phase === null && b.kept > 10,
        `${before.students} students; spending ${dollarsShort(before.spending)} a year before and ${dollarsShort(b.spending)} after ${steps} daily steps; ${b.kept.toFixed(0)} of every $100 kept at the end; cash never under ${dollarsShort(least)}; grants ${dollarsShort(s.money.grants)}`,
      );
    }
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

/** The football and calendar layer (DESIGN.md section 18, layer 1, and 27.3). */
function assertLayerOne(runs: Run[]): void {
  console.log('\nLAYER 1 ASSERTIONS: FOOTBALL AND THE CALENDAR');
  const daily = runs.find((r) => r.style === 'daily')!;
  const tended = runs.filter((r) => r.style !== 'absent');

  // A clear favourite: ten points better, on a neutral field, wins about three games in four.
  {
    const state = structuredClone(daily.final);
    const mine = teamRating(state).total;
    const opp = state.football.divisions[1][0]!;
    state.field.schools[opp]!.fr = mine - 10;
    let won = 0;
    const games = 4000;
    for (let n = 0; n < games; n++) {
      const game = { slot: 10, label: '', opp, home: false, kick: state.clock.tick, us: [] as number[], them: [] as number[], crowd: 0, seats: 0, rating: 0, oppRating: 0, gap: '', done: false };
      state.football.season = { year: state.clock.week.year, games: [game], table: {}, pending: [], played: 10, champion: null, bowl: '', closed: false, streak: 0 };
      state.timers = [];
      kickoff(state, 10);
      if (game.us.reduce((a, b) => a + b, 0) > game.them.reduce((a, b) => a + b, 0)) won += 1;
    }
    const share = won / games;
    check('a clear favourite wins about three games in four', share > 0.71 && share < 0.79, `${(share * 100).toFixed(1)}% of ${games} games with a ten-point edge`);
  }

  // Ten games for every team, every season, and a table that adds up.
  {
    const seasons = runs.reduce((sum, run) => sum + run.seen.seasons, 0);
    const sound = runs.reduce((sum, run) => sum + run.seen.seasonsSound, 0);
    check('every team plays ten games every season and the standings add up', seasons > 0 && sound === seasons, `${sound} of ${seasons} finished seasons across ${runs.length} players`);
  }

  // No annual decision is open for less than 48 hours.
  {
    const all = runs.flatMap((run) => run.seen.decisions);
    const shortest = all.reduce((least, item) => Math.min(least, item.closes - item.opens), Infinity);
    const kinds = [...new Set(all.map((item) => item.kind))].sort();
    check('no annual decision is open for less than 48 hours', all.length > 0 && shortest >= 48 * TICKS_PER_HOUR, `${all.length} decisions (${kinds.join(', ')}), the shortest open ${(shortest / TICKS_PER_HOUR).toFixed(0)} hours`);
  }

  // The once-a-day player sees every decision while it is open.
  {
    const missed = daily.seen.decisions.filter((item) => !daily.seen.visits.some((visit) => visit >= item.opens && visit < item.closes));
    check('the once-a-day player misses no decision', daily.seen.decisions.length > 0 && missed.length === 0, `${daily.seen.decisions.length} decisions, ${missed.length} that opened and closed between two visits`);
  }

  // The field never rises: its average stays where it began.
  {
    const worst = runs.reduce((most, run) => Math.max(most, Math.abs(fieldAverage(run.final.field, 'ar') - FIELD_MEAN), Math.abs(fieldAverage(run.final.field, 'fr') - FIELD_MEAN)), 0);
    check("the field's average does not drift", worst < 0.6, `at most ${worst.toFixed(2)} points from ${FIELD_MEAN} after ${YEARS} years, academics and football, on every player's field`);
  }

  // Stress never spirals: it is low on every break, never at its peak outside exams, and its cost to Happiness is capped.
  {
    const breaks = tended.map((run) => run.seen.stressOnBreak);
    const outside = tended.map((run) => run.seen.stressOutsideExams);
    const top = runs.reduce((most, run) => Math.max(most, run.seen.stressMax), 0);
    const low = runs.reduce((least, run) => Math.min(least, run.seen.deltaMin), 0);
    const high = runs.reduce((most, run) => Math.max(most, run.seen.deltaMax), 0);
    // The desk can add or take three points on top of the calendar's and the sky's (DESIGN.md 36.4).
    const ok = Math.max(...breaks) <= 15 && Math.max(...outside) <= 62 && top <= 100 && low >= -(STRESS_HAPPINESS + 4 + HAPPY_CAP) && high <= BREAK_LIFT + 1.5 + HAPPY_CAP;
    check(
      'Stress and weather never spiral and stay inside their caps',
      ok,
      `Stress at most ${Math.max(...breaks)} on a break and ${Math.max(...outside)} outside exam weeks at any visit, ${top} at its highest; the season's line on Happiness between ${low.toFixed(1)} and +${high.toFixed(1)} points`,
    );
  }

  // The once-a-day player's away list carries an exam report for every exam period, seen or not.
  {
    const counts = ['fallMidterms', 'fallFinals', 'springMidterms', 'springFinals'].map((id) => daily.seen.exams[id] ?? 0);
    check('the once-a-day player gets an exam report for every exam period', counts.every((count) => count === YEARS), `${counts.join(', ')} reports for the four exam periods over ${YEARS} years`);
  }
}

/** Advisors, the inbox and the newspaper (DESIGN.md section 18, layer 4, and section 36). */
function assertLayerFour(runs: Run[], seed: number): void {
  console.log('\nLAYER 4 ASSERTIONS: THE DESK AND THE NEWSPAPER');
  const daily = runs.find((r) => r.style === 'daily')!;
  const casual = runs.find((r) => r.style === 'casual')!;
  const tended = runs.filter((r) => r.style !== 'absent');
  const realDays = YEARS * 7;
  // The casual player again, looking in as often and never answering the desk: every item takes its default.
  answersDesk = false;
  const alone = play('casual', seed, YEARS);
  answersDesk = true;

  // The check-in contract: a paper greets every visit after an hour or more away, with one to four things at its top.
  {
    const perDay = (run: Run): number => run.seen.desk.length / realDays;
    const ok = [daily, casual].every((run) => run.seen.editions === run.checkIns && run.seen.editionsEmpty === 0 && run.seen.editionsOver === 0 && perDay(run) >= 0.5 && perDay(run) <= NEW_PER_DAY);
    check(
      'the check-in contract holds for the casual and the once-a-day player',
      ok,
      `a paper at every visit with one to four things at its top (${casual.seen.editions} and ${daily.seen.editions} editions); ${perDay(casual).toFixed(2)} and ${perDay(daily).toFixed(2)} new routine items a day, the limit being ${NEW_PER_DAY}; a purchase at ${Math.round((100 * casual.checkInsWithPurchase) / Math.max(1, casual.checkIns))}% and ${Math.round((100 * daily.checkInsWithPurchase) / Math.max(1, daily.checkIns))}% of visits`,
    );
  }

  // The cap: never more than four routine items open, for anyone, the player who never looks included.
  {
    const most = Math.max(...runs.map((run) => run.seen.deskMost));
    const total = runs.reduce((sum, run) => sum + run.seen.desk.length, 0);
    check('the inbox never holds more than four routine items', total > 0 && most <= ROUTINE_CAP, `at most ${most} open at once across ${runs.length} players and ${total} items`);
  }

  // Every item has a default, and its default and its pick are among its choices.
  {
    const written = everyWrittenItem(daily.final);
    const unsoundWritten = written.filter(({ draft }) => draft.options.length < 2 || !draft.options.some((choice) => choice.id === draft.fallback) || !draft.options.some((choice) => choice.id === draft.advised)).length;
    const seenCount = tended.reduce((sum, run) => sum + run.seen.deskSeen, 0);
    const unsound = tended.reduce((sum, run) => sum + run.seen.deskUnsound, 0);
    // Left alone, every item that closed took its default, and nothing else happened to it.
    const closed = alone.seen.desk.filter((item) => item.closes <= alone.final.clock.tick).length;
    check(
      'every item has a default, and an item left alone takes it',
      written.length >= 20 && unsoundWritten === 0 && seenCount > 0 && unsound === 0 && closed > 0 && alone.seen.deskDefaults === closed && alone.seen.deskAnswered === 0,
      `${written.length} written items and ${seenCount} seen on a desk, none without a default and a pick among its choices; with the desk left alone ${alone.seen.deskDefaults} of ${closed} items that closed took their default`,
    );
  }

  // Nothing written breaks the tone guide: the items, the paper, the advisors and the notices.
  {
    const written = everyWrittenItem(daily.final).flatMap((item) => item.lines);
    const notices = planNotices(daily.final, { perDay: 3, wakeHour: 7, offsetMinutes: 0 }).flatMap((notice) => [notice.title, notice.body]);
    const fixed = [...written, ...newspaperLines(), ...notices];
    const brokenFixed = fixed.filter((line) => toneProblem(line) !== null);
    const broken = [...brokenFixed, ...tended.flatMap((run) => run.seen.toneBroken)];
    const lines = fixed.length + tended.reduce((sum, run) => sum + run.seen.lines, 0);
    check('no content line breaks the banned-word list', broken.length === 0, broken.length === 0 ? `${lines} lines: every written item, every edition, every advisor's line and the notices` : `${broken.length} lines, the first: ${broken[0]}`);
  }

  // Windows: no routine item is open for less than 36 hours, and the once-a-day player sees every one while it is open.
  {
    const all = runs.flatMap((run) => run.seen.desk);
    const shortest = all.reduce((least, item) => Math.min(least, item.closes - item.opens), Infinity);
    check('no routine item is open for less than 36 hours', all.length > 0 && shortest >= MIN_WINDOW_TICKS, `${all.length} items of ${new Set(all.map((item) => item.key)).size} kinds, the shortest open ${(shortest / TICKS_PER_HOUR).toFixed(0)} hours`);
    const last = daily.seen.visits[daily.seen.visits.length - 1] ?? 0;
    const missed = daily.seen.desk.filter((item) => item.opens <= last - MIN_WINDOW_TICKS && !daily.seen.visits.some((visit) => visit >= item.opens && visit < item.closes));
    check('the once-a-day player misses no routine item', daily.seen.desk.length > 0 && missed.length === 0, `${daily.seen.desk.length} items, ${missed.length} that opened and closed between two visits; ${daily.seen.deskAnswered} answered and ${daily.seen.deskDefaults} left to their default`);
  }

  // The desk gates nothing: the same player who never answers it ends on much the same campus. Two runs that buy
  // different things on different days drift apart by a few students in a hundred whatever the cause, so the band
  // is a tenth either way. What the answers cost is said beside it.
  {
    const students = enrollment(casual.final) / Math.max(1, enrollment(alone.final));
    const lowAnswered = Math.min(...casual.rows.filter((row) => row.year >= 3).map((row) => row.kept));
    const lowAlone = Math.min(...alone.rows.filter((row) => row.year >= 3).map((row) => row.kept));
    const spending = budget(casual.final).spending;
    check(
      'the desk gates nothing: answered or left alone, the casual player ends on much the same campus',
      students > 0.9 && students < 1.1 && Math.abs(lowAnswered - lowAlone) < 2 && casual.final.money.grants <= alone.final.money.grants + 1,
      `${enrollment(casual.final)} students with every pick taken and ${enrollment(alone.final)} with the desk left alone; cash ${dollarsShort(casual.final.money.cash)} and ${dollarsShort(alone.final.money.cash)}; the leanest year from year 3 keeps ${lowAnswered.toFixed(1)}% and ${lowAlone.toFixed(1)}%; ${casual.seen.deskAnswered} answers took ${dollarsShort(casual.seen.deskSpent)} out of the bank in ${YEARS} years, which is ${((100 * casual.seen.deskSpent) / Math.max(1, spending * YEARS)).toFixed(2)}% of ${YEARS} years of spending at today's rate, and put ${dollarsShort(casual.seen.deskEndowed)} into the endowment`,
    );
  }
}

/** The model campus (DESIGN.md 35.5): whole from the first minute, so it has to stand up by itself. */
function assertModelCampus(seed: number): void {
  console.log('');
  console.log('THE MODEL CAMPUS');
  const alone = play('absent', seed, 5, 'model');
  const tended = play('casual', seed, 8, 'model');
  printRun(alone);
  printRun(tended);

  // Left alone for five years it keeps a surplus, needs no rescue and stays clean.
  {
    const worst = Math.min(...alone.rows.map((row) => row.netPerYear));
    const clean = campusClean(alone.final);
    const grew = alone.final.money.cash - alone.rows[0]!.cash;
    check(
      'the model campus, left alone for five years, keeps a surplus, needs no rescue and stays clean',
      alone.rows.length === 5 && worst > 0 && grew > 0 && alone.final.money.grants === 0 && clean >= 0.9,
      `${alone.rows[4]!.students} students at year five; the leanest year nets ${dollarsShort(worst)}; cash grew by ${dollarsShort(grew)}; grants ${dollarsShort(alone.final.money.grants)}; ${Math.round(clean * 100)}% clean`,
    );
  }

  // With the casual player it stays inside the margin and payroll checks.
  {
    const mid = tended.rows.filter((row) => row.year >= 3 && row.year <= 8);
    const low = Math.min(...mid.map((row) => row.kept));
    const high = Math.max(...mid.map((row) => row.kept));
    const books = budget(tended.final);
    const payroll = (books.groups.find((group) => group.id === 'payroll')?.amount ?? 0) / Math.max(1, books.fullSpending);
    check(
      'the model campus with the casual player stays inside the margin and payroll checks',
      mid.length === 6 && low >= 10 && high <= 20 && payroll >= 0.5,
      `years 3 to 8: ${low.toFixed(1)}% kept at the least and ${high.toFixed(1)}% at the most; payroll ${Math.round(payroll * 100)}% of spending; ${tended.rows[7]!.students} students at year eight; state grants ${dollarsShort(tended.final.money.grants)}, which is ${((100 * tended.final.money.grants) / Math.max(1, budget(tended.final).spending)).toFixed(1)}% of a year's spending, to a player who spends every dollar`,
    );
  }

  // Thirty days of catch-up on it stays inside one second.
  {
    const fresh = newGame({ seed, name: 'Sim model', now: T0, campus: 'model' });
    let best = Infinity;
    for (let n = 0; n < 3; n++) {
      const t = performance.now();
      advance(fresh, fresh.clock.lastSimulatedAt, fresh.clock.lastSimulatedAt + 30 * DAY_MS);
      best = Math.min(best, performance.now() - t);
    }
    check('30 days of catch-up on the model campus runs in under one second', best < 1000, `${best.toFixed(0)} ms with ${buildings(fresh.map).length} lots and ${fresh.map.placed.filter(Boolean).length} placed things`);
  }

  check('the model campus validates when it opens and after eight years with a player', validate(newGame({ seed, name: 'Sim model', now: T0, campus: 'model' })) === null && validate(tended.final) === null, 'checked by the validation every save goes through, both times');
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
assertLayerOne(allRuns.filter((r) => r.seed === SEEDS[0]));
assertLayerFour(allRuns.filter((r) => r.seed === SEEDS[0]), SEEDS[0]!);
assertModelCampus(SEEDS[0]!);
console.log(`\n${failures.length === 0 ? 'All assertions passed' : `${failures.length} assertion(s) failed`} in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
process.exit(failures.length === 0 ? 0 : 1);
