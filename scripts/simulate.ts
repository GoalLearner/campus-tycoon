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
  FIRST_INTAKE_TICK,
  RANK_GOALS,
  SIZE_GOALS,
  capacity,
  enrollmentCap,
  facultyCount,
  facultyNeed,
  fallApplicants,
  openStaff,
  ratioTarget,
  rewardsEarned,
  rewardsWaiting,
  RANK_REWARDS,
  academicInputs,
  academicRating,
  eraOf,
  ERAS,
  POLICIES,
  policiesOpen,
  policyWords,
  collectCashPerYear,
  collectables,
  HOME_GAMES_PER_YEAR,
  levelAt,
  SEAL_HOURS,
  waits,
  hasDaily,
  orderCashCeiling,
  DECOR,
  DECOR_CAP,
  decorCounts,
  decorLift,
  SEASON_SETS,
  liveSeason,
  orderSlots,
  orderViews,
  ORDER_KINDS,
  ORDER_LEAST_HOURS,
  GIVERS,
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
import { botOptions, takeTurn, type Style } from './bots';

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
// `-- --no-slider` runs the test players with the Instruction slider left where it opens: a comparison, to show
// what the slider is worth to the margin. Its checks on the margin are then expected to fail.
if (args.includes('--no-slider')) botOptions.slider = false;
// `-- --no-policies` runs them with every switch an era opens left off, as a campus that never visits the page.
if (args.includes('--no-policies')) botOptions.policies = false;
// `-- --no-daily` runs them without the daily layer: nothing collected and no Seal spent.
if (args.includes('--no-daily')) botOptions.daily = false;
// `-- --no-orders` runs them without the orders board: never looked at, so no order ever starts.
if (args.includes('--no-orders')) botOptions.orders = false;
// `-- --no-decor` runs them without decorations or the Workshop: nothing set out, nothing made.
if (args.includes('--no-decor')) botOptions.decor = false;
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
  // The striver looks in once a day, as the once-a-day player does (DESIGN.md 37.8).
  striver: 24 * 60 * TICK_MS,
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
  /** The daily layer: the University Level, experience and Seals held, two days into the week. */
  level: number;
  xp: number;
  seals: number;
  /** Decorations owned and on the map, things the Workshop has made, and Seals spent on decorations and the second bench. */
  decor: number;
  decorPlaced: number;
  crafted: number;
  decorSeals: number;
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
  /** The real week each size goal and each rank goal was reached, counting the first week as 1. 0 when not reached. */
  sizeWeeks: number[];
  rankWeeks: number[];
  /** Policies: how many times a switch was turned on or off, and lines of the paper about them that broke the tone guide. */
  switches: number;
  /**
   * The daily layer: the level after the first sitting, what was collected over the run, what the cap had
   * already cost when it was collected, Seals spent and waits finished, and every price a wait was seen at.
   */
  firstSitting: number;
  collectXp: number;
  collectCash: number;
  collectLost: number;
  collects: number;
  sealsSpent: number;
  finished: number;
  prices: number[];
  levelLines: number;
  /**
   * The orders board, read at the first look of each visit: visits, and those with an order that can be finished
   * in one sitting; the same by real day; times the board held more than its places; orders whose window was
   * under the least allowed; the level at which the fourth and fifth places were first seen; lines in the paper.
   */
  orderLooks: number;
  orderLooksWith: number;
  orderDay: number;
  orderDays: number;
  orderDaysWith: number;
  orderDayHad: boolean;
  orderOver: number;
  orderShort: number;
  orderMostOpen: number;
  orderLines: number;
  /** Goals whose headline was not in the paper of the visit after they were reached. */
  goalsUnsaid: number;
  /** The most students the campus ever held, whenever it was looked at. */
  mostStudents: number;
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
  sizeWeeks: SIZE_GOALS.map(() => 0),
  rankWeeks: RANK_GOALS.map(() => 0),
  switches: 0,
  firstSitting: 1,
  collectXp: 0,
  collectCash: 0,
  collectLost: 0,
  collects: 0,
  sealsSpent: 0,
  finished: 0,
  prices: [],
  levelLines: 0,
  orderLooks: 0,
  orderLooksWith: 0,
  orderDay: -1,
  orderDays: 0,
  orderDaysWith: 0,
  orderDayHad: false,
  orderOver: 0,
  orderShort: 0,
  orderMostOpen: 0,
  orderLines: 0,
  goalsUnsaid: 0,
  mostStudents: 0,
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
    if (entry.kind === 'policy') seen.switches += 1;
    if (entry.kind === 'level') seen.levelLines += 1;
    if (entry.kind === 'order') seen.orderLines += 1;
  }
  for (const entry of log) {
    if (entry.kind !== 'goal') continue;
    const week = Math.floor((entry.tick - FIRST_INTAKE_TICK) / TICKS_PER_YEAR) + 1;
    const weeks = entry.data?.ladder === 'size' ? seen.sizeWeeks : seen.rankWeeks;
    for (let n = Number(entry.data?.from ?? 0); n < Number(entry.data?.count ?? 0); n++) weeks[n] = week;
  }
  seen.deskMost = Math.max(seen.deskMost, state.inbox.open.length);
  seen.mostStudents = Math.max(seen.mostStudents, enrollment(state));
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
    level: state.daily.level,
    xp: state.daily.xp,
    seals: state.daily.seals,
    decor: decorCounts(state).owned,
    decorPlaced: decorCounts(state).placed,
    crafted: state.decor.tally.crafted ?? 0,
    decorSeals: state.decor.tally.sealsSpent ?? 0,
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

  // The orders board as each visit first finds it (DESIGN.md 42.3): looked at on a copy, which the turn then does for real.
  const board = (at: number): void => {
    if (!botOptions.orders || style === 'absent' || !hasDaily(state)) return;
    const looked = applyAction(state, { type: 'seeOrders' });
    if (!looked.ok) return;
    const views = orderViews(looked.state);
    // Something for this sitting: an order that can be finished in one, or one already finished and waiting to be claimed.
    const has = views.some((view) => (view.sitting && !view.done) || view.done);
    // The last visit falls on the first hour of a day the run never finishes: it is looked at, and not counted as a day.
    const day = at >= end ? seen.orderDay : Math.floor((at - T0) / DAY_MS);
    if (day !== seen.orderDay) {
      seen.orderDay = day;
      seen.orderDays += 1;
      seen.orderDayHad = false;
    }
    if (has && !seen.orderDayHad) {
      seen.orderDayHad = true;
      seen.orderDaysWith += 1;
    }
    seen.orderLooks += 1;
    if (has) seen.orderLooksWith += 1;
    seen.orderMostOpen = Math.max(seen.orderMostOpen, views.length);
    if (views.length > orderSlots(looked.state)) seen.orderOver += 1;
    for (const order of looked.state.orders.open) if (order.seen !== undefined && order.until !== undefined && order.until - order.seen < ORDER_LEAST_HOURS * TICKS_PER_HOUR) seen.orderShort += 1;
    tone(seen, [looked.state.orders.note, ...views.flatMap((view) => [view.from, view.title, view.ask, view.progress, view.reward])].filter((line) => line !== ''));
  };
  board(T0);

  // The player acts once before move-in, as a person would in their first session.
  const first = takeTurn(state, style);
  state = first.state;
  const daily = (turn: ReturnType<typeof takeTurn>): void => {
    if (!turn.daily) return;
    seen.collectXp += turn.daily.xp;
    seen.collectCash += turn.daily.cash;
    seen.collectLost += turn.daily.lost;
    seen.collects += turn.daily.count;
    seen.sealsSpent += turn.daily.spent;
    seen.finished += turn.daily.finished;
  };
  daily(first);
  seen.firstSitting = state.daily.level;

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
      const reached = gap.filter((entry) => entry.kind === 'goal');
      seen.goalsUnsaid += reached.filter((entry) => paper.deck !== entry.text && !paper.top.some((item) => item.text === entry.text)).length;
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
      for (const wait of waits(state)) seen.prices.push(wait.price);
      board(now);
      const turn = takeTurn(state, style);
      state = turn.state;
      daily(turn);
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

/** How long the pace runs last, in real weeks. A game year is a real week. */
const PACE_WEEKS = 44;

const weekOf = (week: number): string => (week > 0 ? `week ${week}` : 'not reached');

/** A campus as if a share of its students had gone, or had never come: every class cut by the same share. */
function withStudents(state: GameState, share: number, staffToo: boolean): GameState {
  const next = structuredClone(state);
  next.cohorts = next.cohorts.map((n) => Math.round(n * share)) as GameState['cohorts'];
  next.offCampus = next.offCampus.map((n, year) => Math.min(next.cohorts[year]!, Math.round(n * share))) as GameState['offCampus'];
  for (const record of next.classes) record.entered = Math.round(record.entered * share);
  // A campus that opens smaller was staffed for the students it has. One that lost them still has everyone it hired.
  if (staffToo) openStaff(next);
  next.money.ratesDirty = true;
  return next;
}

/** Take away every second building of the kinds a growing campus has to add, and every worker: nothing built ahead. */
function stripped(state: GameState): GameState {
  let next = state;
  const count: Record<string, number> = {};
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const family = PLACED[placed.type].family;
    if (!['dining', 'recreation', 'medical', 'safety'].includes(family)) continue;
    count[family] = (count[family] ?? 0) + 1;
    if (count[family]! % 2 === 0) continue;
    const cleared = applyAction(next, { type: 'paint', tool: 'clear', cells: [[placed.x, placed.y]] });
    if (cleared.ok) next = cleared.state;
  }
  for (const placed of next.map.placed) {
    if (!placed || placed.type !== 'yard') continue;
    const staffed = applyAction(next, { type: 'staff', yard: placed.id, workers: 1 });
    if (staffed.ok) next = staffed.state;
  }
  return next;
}

/**
 * The model campus (DESIGN.md 35.5, section 37 and section 38): whole from
 * the first minute, so it has to stand up by itself, keep what a well-run
 * campus should keep, never pass its cap, and climb its rank goals over
 * months and not weeks.
 */
function assertModelCampus(seed: number): void {
  console.log('');
  console.log('THE MODEL CAMPUS');
  const alone = play('absent', seed, 5, 'model');
  printRun(alone);
  const opening = newGame({ seed, name: 'Sim model', now: T0, campus: 'model' });
  const cap = enrollmentCap(opening) ?? 0;

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

  // The pace: three kinds of player, two seeds, long enough to show months.
  const seeds = [seed, seed + 1];
  const styles = ['casual', 'daily', 'striver'] as const;
  const runs = seeds.flatMap((one) => styles.map((style) => play(style, one, PACE_WEEKS, 'model')));
  const of = (style: Style): Run[] => runs.filter((run) => run.style === style);
  for (const run of runs.filter((one) => one.seed === seed)) printRun({ ...run, rows: run.rows.filter((row) => row.year <= 12 || row.year % 4 === 0) });

  console.log('');
  console.log(`THE PACE OF THE GOALS: the real week each is reached, over ${PACE_WEEKS} weeks`);
  const head = runs.map((run) => `${run.style} ${run.seed}`.padStart(14)).join('');
  console.log(`${'goal'.padEnd(18)}${head}`);
  console.log(`${`Full: ${cap.toLocaleString('en-US')}`.padEnd(18)}${runs.map((run) => weekOf(run.seen.sizeWeeks[0]!).padStart(14)).join('')}`);
  RANK_GOALS.forEach((goal, n) => console.log(`${`Top ${goal}`.padEnd(18)}${runs.map((run) => weekOf(run.seen.rankWeeks[n]!).padStart(14)).join('')}`));
  console.log(`${'rank at the end'.padEnd(18)}${runs.map((run) => `No. ${run.final.field.rank}`.padStart(14)).join('')}`);
  console.log(`${'faculty funded'.padEnd(18)}${runs.map((run) => `1 to ${ratioTarget(run.final)}`.padStart(14)).join('')}`);
  console.log(`${'looks, of 100'.padEnd(18)}${runs.map((run) => averageDesirability(run.final).toFixed(1).padStart(14)).join('')}`);
  console.log(`${'buildings placed'.padEnd(18)}${runs.map((run) => `${rewardsEarned(run.final).length - rewardsWaiting(run.final).length} of ${rewardsEarned(run.final).length}`.padStart(14)).join('')}`);
  console.log(`${'era at the end'.padEnd(18)}${runs.map((run) => ERAS[eraOf(run.final.goals)]!.padStart(14)).join('')}`);
  console.log(`${'policies on'.padEnd(18)}${runs.map((run) => `${run.final.policies.on.length} of ${policiesOpen(run.final).length}`.padStart(14)).join('')}`);
  console.log(`${'switches thrown'.padEnd(18)}${runs.map((run) => String(run.seen.switches).padStart(14)).join('')}`);
  console.log('');
  for (const run of runs) console.log(`${run.style} ${run.seed} ends with: ${run.final.policies.on.map((id) => POLICIES.find((spec) => spec.id === id)?.name ?? id).join(', ') || 'no policy on'}`);
  console.log('');

  // The same players with every switch left off (DESIGN.md section 41), and nothing else changed: what the
  // switches move, and nothing more.
  botOptions.policies = false;
  const plain = seeds.flatMap((one) => styles.map((style) => play(style, one, PACE_WEEKS, 'model')));
  const plainOf = (style: Style): Run[] => plain.filter((run) => run.style === style);
  console.log('THE SAME, WITH EVERY SWITCH LEFT OFF');
  console.log(`${'goal'.padEnd(18)}${head}`);
  RANK_GOALS.forEach((goal, n) => console.log(`${`Top ${goal}`.padEnd(18)}${plain.map((run) => weekOf(run.seen.rankWeeks[n]!).padStart(14)).join('')}`));
  console.log(`${'rank at the end'.padEnd(18)}${plain.map((run) => `No. ${run.final.field.rank}`.padStart(14)).join('')}`);
  console.log('');
  // And one of each player who uses none of it (section 42): no switch, nothing collected, the orders board never
  // looked at. What the campus does by the slow game alone.
  botOptions.daily = false;
  botOptions.orders = false;
  botOptions.decor = false;
  const bare = styles.map((style) => play(style, seed, PACE_WEEKS, 'model'));
  botOptions.policies = !args.includes('--no-policies');
  botOptions.daily = !args.includes('--no-daily');
  botOptions.orders = !args.includes('--no-orders');
  botOptions.decor = !args.includes('--no-decor');
  console.log('AND WITH NONE OF IT: NO SWITCH, NOTHING COLLECTED, THE ORDERS BOARD NEVER LOOKED AT');
  console.log(`${'goal'.padEnd(18)}${bare.map((run) => `${run.style} ${run.seed}`.padStart(14)).join('')}`);
  RANK_GOALS.forEach((goal, n) => console.log(`${`Top ${goal}`.padEnd(18)}${bare.map((run) => weekOf(run.seen.rankWeeks[n]!).padStart(14)).join('')}`));
  console.log(`${'rank at the end'.padEnd(18)}${bare.map((run) => `No. ${run.final.field.rank}`.padStart(14)).join('')}`);
  console.log(`${'looks, of 100'.padEnd(18)}${bare.map((run) => averageDesirability(run.final).toFixed(1).padStart(14)).join('')}`);
  console.log(`${'level at the end'.padEnd(18)}${bare.map((run) => String(run.final.daily.level).padStart(14)).join('')}`);
  console.log('');

  // The cap: nobody ever holds more students than it allows, and every campus is full within a few weeks.
  {
    const most = Math.max(alone.seen.mostStudents, ...runs.map((run) => run.seen.mostStudents));
    const full = runs.map((run) => run.seen.sizeWeeks[0]!);
    check(
      'no model campus ever passes its cap, and every tended one is full within a month',
      cap > 0 && most <= cap && full.every((week) => week > 0 && week <= 4),
      `the cap is ${cap.toLocaleString('en-US')}; the most any campus held was ${most.toLocaleString('en-US')}; full at ${runs.map((run) => `${run.style} ${run.seed} ${weekOf(run.seen.sizeWeeks[0]!)}`).join(', ')}`,
    );
  }

  // A building for each rank goal (DESIGN.md section 40): every one a player earned is on its campus, and the
  // campus looks the better for them. A campus nobody tends earns them too, and they wait.
  {
    const kept = runs.every((run) => rewardsEarned(run.final).length === run.final.goals!.rank && rewardsWaiting(run.final).length === 0);
    const plain = averageDesirability(alone.final);
    const lifted = runs.map((run) => averageDesirability(run.final));
    const waiting = rewardsWaiting(alone.final).length;
    check(
      'every building a rank goal gave is on the campus of the player who earned it, and lifts how it looks',
      kept && Math.min(...lifted) >= plain + 3 && waiting === alone.final.goals!.rank && RANK_REWARDS.length === RANK_GOALS.length,
      `${runs.map((run) => `${run.style} ${run.seed}: ${rewardsEarned(run.final).length} placed, looks ${averageDesirability(run.final).toFixed(1)}`).join('; ')}; a campus left alone looks ${plain.toFixed(1)} of 100, with ${waiting} waiting in its Build menu after five years`,
    );
  }

  // A well-run model campus keeps $12 to $17 of every $100 (the owner's target, 37.10), measured in years 3 to 8.
  {
    const read = (run: Run, from: number, to: number): { low: number; high: number } => {
      const mid = run.rows.filter((row) => row.year >= from && row.year <= to).map((row) => row.kept);
      return { low: Math.min(...mid), high: Math.max(...mid) };
    };
    // The owner's target is measured on the casual and the once-a-day players. The striver's range is told beside it.
    const all = [...of('casual'), ...of('daily')].map((run) => read(run, 3, 8));
    const low = Math.min(...all.map((one) => one.low));
    const high = Math.max(...all.map((one) => one.high));
    const later = [...of('casual'), ...of('daily')].map((run) => read(run, 9, PACE_WEEKS));
    const laterLow = Math.min(...later.map((one) => one.low));
    const laterHigh = Math.max(...later.map((one) => one.high));
    const opens = budget(opening).kept;
    const books = budget(of('casual')[0]!.final);
    const payroll = (books.groups.find((group) => group.id === 'payroll')?.amount ?? 0) / Math.max(1, books.fullSpending);
    const range = (style: Style, from: number, to: number): string => `${Math.min(...of(style).map((run) => read(run, from, to).low)).toFixed(1)}% to ${Math.max(...of(style).map((run) => read(run, from, to).high)).toFixed(1)}%`;
    check(
      'a model campus run by the casual or the once-a-day player keeps $12 to $17 of every $100 in years 3 to 8, and opens inside that range',
      low >= 12 && high <= 17 && opens >= 12 && opens <= 17 && payroll >= 0.5,
      `it opens keeping ${opens.toFixed(1)}%; years 3 to 8: ${styles.map((style) => `${style} ${range(style, 3, 8)}`).join(', ')} over ${seeds.length} seeds; payroll ${Math.round(payroll * 100)}% of the casual player's spending; state grants ${dollarsShort(Math.max(...runs.map((run) => run.final.money.grants)))} at most`,
    );
    // The same with every switch left off: the range a campus keeps must not depend on the Policies page.
    {
      const offRange = (style: Style, from: number, to: number): { low: number; high: number } => ({ low: Math.min(...plainOf(style).map((run) => read(run, from, to).low)), high: Math.max(...plainOf(style).map((run) => read(run, from, to).high)) });
      const says = (style: Style, from: number, to: number): string => `${offRange(style, from, to).low.toFixed(1)}% to ${offRange(style, from, to).high.toFixed(1)}%`;
      const regular = (['casual', 'daily'] as const).flatMap((style) => [offRange(style, 3, 8), offRange(style, 9, PACE_WEEKS)]);
      check(
        'with every switch left off the same players keep $12 to $17 too, in years 3 to 8 and in the later weeks',
        Math.min(...regular.map((one) => one.low)) >= 12 && Math.max(...regular.map((one) => one.high)) <= 17,
        `switches off, years 3 to 8: ${styles.map((style) => `${style} ${says(style, 3, 8)}`).join(', ')}; weeks 9 to ${PACE_WEEKS}: ${styles.map((style) => `${style} ${says(style, 9, PACE_WEEKS)}`).join(', ')}. With the switches in use, years 3 to 8: ${styles.map((style) => `${style} ${range(style, 3, 8)}`).join(', ')}; weeks 9 to ${PACE_WEEKS}: ${styles.map((style) => `${style} ${range(style, 9, PACE_WEEKS)}`).join(', ')}`,
      );
    }
    check(
      'the later weeks stay in that range too, for the casual and the once-a-day player',
      laterLow >= 12 && laterHigh <= 17,
      `weeks 9 to ${PACE_WEEKS}: ${styles.map((style) => `${style} ${range(style, 9, PACE_WEEKS)}`).join(', ')}; the endowment holds ${dollarsShort(Math.min(...runs.map((run) => run.final.money.endowment)))} to ${dollarsShort(Math.max(...runs.map((run) => run.final.money.endowment)))} by week ${PACE_WEEKS}; faculty funded at one to every ${runs.map((run) => ratioTarget(run.final)).join(', ')} students at the end`,
    );
  }

  // Rank: the Top 100 in about month two, the Top 10 not before month five, and somebody gets there.
  {
    const strivers = of('striver');
    const regular = [...of('casual'), ...of('daily')];
    const ok =
      strivers.every((run) => run.seen.rankWeeks[3]! >= 5 && run.seen.rankWeeks[3]! <= 13) &&
      regular.every((run) => run.seen.rankWeeks[3]! >= 5 && run.seen.rankWeeks[3]! <= 18) &&
      runs.every((run) => run.seen.rankWeeks[7]! === 0 || run.seen.rankWeeks[7]! >= 20);
    check(
      'the rank climbs a little a year: the Top 100 in about month two, and the Top 10 not before month five',
      ok,
      runs.map((run) => `${run.style} ${run.seed}: Top 100 at ${weekOf(run.seen.rankWeeks[3]!)}, Top 50 at ${weekOf(run.seen.rankWeeks[5]!)}, Top 10 ${weekOf(run.seen.rankWeeks[7]!)}`).join('; '),
    );
    check(
      'the last rank goal can be reached: the player who works every cause gets to the Top 10, in months',
      strivers.every((run) => run.seen.rankWeeks[7]! >= 20),
      strivers.map((run) => `seed ${run.seed}: the Top 10 at ${weekOf(run.seen.rankWeeks[7]!)}, No. ${run.final.field.rank} at the end, looks ${averageDesirability(run.final).toFixed(0)} of 100, marketing at step ${run.final.money.marketing}, a tier ${run.final.football.stadium.tier} stadium, ${Math.round((100 * enrollment(run.final)) / Math.max(1, capacity(run.final).needs.find((need) => need.id === 'seats')!.have))}% of seats taken`).join('; '),
    );
  }

  // The daily layer (DESIGN.md section 42): the University Level, Gold Seals and collecting.
  {
    const at = (run: Run, week: number): YearRow => run.rows[Math.min(run.rows.length, week) - 1]!;
    const perWeek = (run: Run, from: number, to: number, pick: (row: YearRow) => number): number => (pick(at(run, to)) - pick(at(run, from))) / (to - from);
    // Everything earned: what is held, what finished a wait, and what bought a decoration or the second bench.
    const earned = (run: Run): number => run.final.daily.seals + run.seen.sealsSpent + (run.final.decor.tally.sealsSpent ?? 0);
    const share = (run: Run): number => (run.seen.collectXp + run.seen.collectLost > 0 ? run.seen.collectXp / (run.seen.collectXp + run.seen.collectLost) : 1);
    const cashPerYear = (run: Run): number => run.seen.collectCash / PACE_WEEKS;
    const income = (run: Run): number => budget(run.final).incomeTotal;
    const mean = (list: number[]): number => (list.length > 0 ? list.reduce((sum, n) => sum + n, 0) / list.length : 0);
    console.log('THE UNIVERSITY LEVEL, GOLD SEALS AND COLLECTING');
    console.log(`${''.padEnd(26)}${head}`);
    const row = (name: string, cell: (run: Run) => string): void => console.log(`${name.padEnd(26)}${runs.map((run) => cell(run).padStart(14)).join('')}`);
    row('level, first sitting', (run) => String(run.seen.firstSitting));
    for (const week of [1, 4, 12, PACE_WEEKS]) row(`level at week ${week}`, (run) => String(at(run, week).level));
    row('levels a week, 1 to 4', (run) => perWeek(run, 1, 4, (r) => r.level).toFixed(1));
    row('levels a week, 4 to 12', (run) => perWeek(run, 4, 12, (r) => r.level).toFixed(1));
    row(`levels a week, 12 to ${PACE_WEEKS}`, (run) => perWeek(run, 12, PACE_WEEKS, (r) => r.level).toFixed(1));
    row('Seals earned in all', (run) => String(earned(run)));
    row('Seals earned a week', (run) => (earned(run) / PACE_WEEKS).toFixed(1));
    row('Seals spent', (run) => String(run.seen.sealsSpent));
    row('waits finished', (run) => String(run.seen.finished));
    row('price of a wait, mean', (run) => mean(run.seen.prices).toFixed(1));
    row('price of a wait, most', (run) => String(run.seen.prices.length > 0 ? Math.max(...run.seen.prices) : 0));
    row('buildings collected', (run) => String(run.seen.collects));
    row('experience collected', (run) => String(run.seen.collectXp));
    row('lost to the cap', (run) => String(run.seen.collectLost));
    row('share collected', (run) => `${(100 * share(run)).toFixed(1)}%`);
    row('cash collected a year', (run) => dollarsShort(cashPerYear(run)));
    row('of every $100 that comes in', (run) => `$${((100 * cashPerYear(run)) / income(run)).toFixed(3)}`);
    console.log('');

    const dailies = of('daily');
    const first = runs.every((run) => run.seen.firstSitting >= 3 && run.seen.firstSitting <= 6);
    const later = dailies.map((run) => perWeek(run, 12, PACE_WEEKS, (r) => r.level));
    const middle = dailies.map((run) => perWeek(run, 4, 12, (r) => r.level));
    check(
      'the University Level comes at the pace asked: several levels in the first sitting, then about one every day or two for the once-a-day player',
      first && [...later, ...middle].every((n) => n >= 3.5 && n <= 7),
      `${runs.map((run) => `${run.style} ${run.seed}: level ${run.seen.firstSitting} after the first sitting, ${at(run, 1).level} at week 1, ${at(run, 4).level} at week 4, ${at(run, 12).level} at week 12, ${at(run, PACE_WEEKS).level} at week ${PACE_WEEKS}`).join('; ')}. The once-a-day player gains ${middle.map((n) => n.toFixed(1)).join(' and ')} levels a week in weeks 4 to 12 and ${later.map((n) => n.toFixed(1)).join(' and ')} after`,
    );
    // A level never falls, every level reached was told once, and the level is the one the experience makes.
    const told = runs.every((run) => run.final.daily.level === levelAt(run.final.daily.xp).level && run.final.daily.news.length <= 1 && run.rows.every((r, n) => n === 0 || (r.level >= run.rows[n - 1]!.level && r.xp >= run.rows[n - 1]!.xp)));
    check(
      'experience only rises, and the level told is the level the experience makes',
      told && runs.every((run) => run.seen.levelLines > 0),
      runs.map((run) => `${run.style} ${run.seed}: ${run.final.daily.xp} experience, level ${run.final.daily.level}, ${run.seen.levelLines} lines for its levels`).join('; '),
    );
    const weekly = runs.map((run) => earned(run) / PACE_WEEKS);
    const price = mean(runs.flatMap((run) => run.seen.prices));
    check(
      'Gold Seals come at about one Finish now a week',
      // The Workshop's short waits brought the average price down, so a week's Seals now finish two or three.
      weekly.every((n) => n >= 0.6 * price && n <= 4 * price) && price >= 2,
      `${runs.map((run) => `${run.style} ${run.seed}: ${earned(run)} earned, ${(earned(run) / PACE_WEEKS).toFixed(1)} a week, ${run.seen.sealsSpent} spent on ${run.seen.finished} waits`).join('; ')}. A wait costs ${price.toFixed(1)} Seals on average when one is there to finish, a Seal for every ${SEAL_HOURS} hours left`,
    );
    check(
      'a player who comes once a day gets all of the collectable extra, and so does one who comes twice',
      [...of('daily'), ...of('casual'), ...of('striver')].every((run) => run.seen.collectLost === 0 && run.seen.collectXp > 0),
      runs.map((run) => `${run.style} ${run.seed}: ${run.seen.collectXp} experience from ${run.seen.collects} buildings collected, ${run.seen.collectLost} lost to the cap`).join('; '),
    );
    // The cash is a rate with a cap: a year of it is a small known sum, far inside the room the money target leaves.
    const most = Math.max(...runs.map((run) => (100 * cashPerYear(run)) / income(run)));
    const ceiling = Math.max(...runs.map((run) => (100 * collectCashPerYear(run.final, TICKS_PER_YEAR, HOME_GAMES_PER_YEAR)) / income(run)));
    check(
      'collecting pays a little cash and no more: under a tenth of a dollar in every $100 that comes in, at the very most',
      most <= 0.1 && ceiling <= 0.1,
      `${runs.map((run) => `${run.style} ${run.seed}: ${dollarsShort(cashPerYear(run))} a year, $${((100 * cashPerYear(run)) / income(run)).toFixed(3)} of every $100`).join('; ')}. The most a campus could ever collect in a year is $${ceiling.toFixed(3)} of every $100`,
    );
    // A campus nobody visits loses nothing but the extra itself, and a game with no goals has no layer at all.
    const idle = alone.final;
    check(
      'the layer is a bonus: a campus nobody visits still levels from what happens by itself, and holds what it could not collect',
      idle.daily.level > 1 && idle.daily.seals > 0 && collectables(idle).length > 0 && bare.every((run) => run.seen.collects === 0 && run.seen.sealsSpent === 0),
      `left alone for five years it reaches level ${idle.daily.level} with ${idle.daily.seals} Seals and ${collectables(idle).length} buildings holding something; the players who never collect reach level ${bare.map((run) => run.final.daily.level).join(', ')}`,
    );
  }

  // The orders board (DESIGN.md 42.3, as built in 42.16): what was offered, finished, dismissed and missed, what
  // it paid, and that the board always has something to do today.
  {
    const tally = (run: Run, what: string): number => run.final.orders.tally[what] ?? 0;
    const perWeek = (run: Run, what: string): string => (tally(run, what) / PACE_WEEKS).toFixed(1);
    const settled = (run: Run): number => tally(run, 'claimed') + tally(run, 'dismissed') + tally(run, 'missed');
    const finished = (run: Run): number => (settled(run) > 0 ? tally(run, 'claimed') / settled(run) : 0);
    const income = (run: Run): number => budget(run.final).incomeTotal;
    const cashAYear = (run: Run): number => tally(run, 'cash') / PACE_WEEKS;
    console.log('THE ORDERS BOARD');
    console.log(`${''.padEnd(30)}${head}`);
    const row = (name: string, cell: (run: Run) => string): void => console.log(`${name.padEnd(30)}${runs.map((run) => cell(run).padStart(14)).join('')}`);
    row('offered a week', (run) => perWeek(run, 'offered'));
    row('  of them a second for today', (run) => perWeek(run, 'second'));
    row('finished and claimed a week', (run) => perWeek(run, 'claimed'));
    row('dismissed a week', (run) => perWeek(run, 'dismissed'));
    row('missed a week', (run) => perWeek(run, 'missed'));
    row('share finished', (run) => `${Math.round(100 * finished(run))}%`);
    row('open at the end', (run) => String(run.final.orders.open.length));
    row('most open at once', (run) => String(run.seen.orderMostOpen));
    row('days with one for a sitting', (run) => `${run.seen.orderDaysWith} of ${run.seen.orderDays}`);
    row('experience from orders a week', (run) => perWeek(run, 'xp'));
    row('Seals from orders a week', (run) => perWeek(run, 'seals'));
    row('cash from orders a year', (run) => dollarsShort(cashAYear(run)));
    row('of every $100 that comes in', (run) => `$${((100 * cashAYear(run)) / income(run)).toFixed(3)}`);
    console.log('');
    console.log('ORDERS BY KIND: seen / claimed / dismissed / missed, over the run');
    console.log(`${''.padEnd(30)}${head}`);
    for (const kind of ORDER_KINDS) row(`${kind.giver} ${kind.id}`, (run) => ['seen', 'claimed', 'dismissed', 'missed'].map((what) => tally(run, `${what}:${kind.id}`)).join('/'));
    console.log('');

    check(
      'the orders board never holds more than its places, and no order runs for less than 36 hours from when it is first seen',
      runs.every((run) => run.seen.orderLooks > 0 && run.seen.orderOver === 0 && run.seen.orderShort === 0 && run.seen.orderMostOpen <= 5),
      runs.map((run) => `${run.style} ${run.seed}: ${run.seen.orderLooks} looks, at most ${run.seen.orderMostOpen} open, ${run.seen.orderOver} over, ${run.seen.orderShort} too short`).join('; '),
    );
    check(
      'on every real day a player looks in, the board has an order that can be finished in one sitting, or one finished and waiting to be claimed',
      runs.every((run) => run.seen.orderDays > 0 && run.seen.orderDaysWith === run.seen.orderDays),
      runs.map((run) => `${run.style} ${run.seed}: ${run.seen.orderDaysWith} of ${run.seen.orderDays} days, and ${run.seen.orderLooksWith} of ${run.seen.orderLooks} visits (a later visit the same day finds it already done)`).join('; '),
    );
    const dailies = of('daily');
    check(
      'a once-a-day player can finish most of what the board offers, and misses little',
      dailies.every((run) => finished(run) >= 0.6 && tally(run, 'missed') <= 0.08 * tally(run, 'offered')) && runs.every((run) => finished(run) >= 0.5),
      runs.map((run) => `${run.style} ${run.seed}: ${tally(run, 'offered')} offered, ${tally(run, 'claimed')} claimed (${Math.round(100 * finished(run))}%), ${tally(run, 'dismissed')} dismissed, ${tally(run, 'missed')} missed`).join('; '),
    );
    // Every giver is heard from, and every kind of order that this campus can be asked comes up for somebody.
    const givers = Object.keys(GIVERS);
    const heard = runs.every((run) => givers.every((giver) => ORDER_KINDS.some((kind) => kind.giver === giver && tally(run, `claimed:${kind.id}`) > 0)));
    const unseen = ORDER_KINDS.filter((kind) => runs.every((run) => tally(run, `seen:${kind.id}`) === 0)).map((kind) => kind.id);
    check(
      'all four givers are heard from on every campus, and nearly every kind of order comes up',
      heard && unseen.length <= 3,
      `${ORDER_KINDS.length} kinds from ${givers.length} givers; never asked of these players: ${unseen.join(', ') || 'none'}`,
    );
    // The cash is capped by the school year: a small known sum, far inside the room the money target leaves.
    const most = Math.max(...runs.map((run) => (100 * cashAYear(run)) / income(run)));
    const ceiling = Math.max(...runs.map((run) => (100 * orderCashCeiling(run.final)) / income(run)));
    check(
      'orders pay a little cash and no more: under a tenth of a dollar in every $100 that comes in, at the very most',
      most <= 0.1 && ceiling <= 0.1 && runs.every((run) => run.final.orders.paid <= orderCashCeiling(run.final)),
      `${runs.map((run) => `${run.style} ${run.seed}: ${dollarsShort(cashAYear(run))} a year, $${((100 * cashAYear(run)) / income(run)).toFixed(3)} of every $100`).join('; ')}. The most a campus could ever be paid in a year is $${ceiling.toFixed(3)} of every $100`,
    );
    check(
      'the paper says each new order and each finished one, and the board is a bonus: a campus that never looks at it loses nothing',
      runs.every((run) => run.seen.orderLines >= tally(run, 'claimed')) && bare.every((run) => tally(run, 'claimed') === 0 && tally(run, 'missed') === 0 && run.final.orders.open.every((order) => order.seen === undefined)) && alone.final.orders.open.length === orderSlots(alone.final),
      `${runs.map((run) => `${run.style} ${run.seed}: ${run.seen.orderLines} lines`).join('; ')}. Never looked at: ${bare.map((run) => `${run.final.orders.open.length} waiting unseen`).join(', ')}, none begun, none missed; the campus left alone holds ${alone.final.orders.open.length}, all unseen`,
    );
  }

  // Decorations, the Workshop and the seasonal sets (DESIGN.md 42.5 and 42.6, as built from 42.20).
  {
    const at = (run: Run, week: number): YearRow => run.rows[Math.min(run.rows.length, week) - 1]!;
    const tally = (run: Run, what: string): number => run.final.decor.tally[what] ?? 0;
    const lots = (state: GameState) => state.map.buildings.filter((b): b is NonNullable<typeof b> => !!b && b.stage >= 1);
    const lifts = (state: GameState): number[] => lots(state).map((b) => decorLift(state.map, b.x, b.y));
    const mean = (list: number[]): number => (list.length > 0 ? list.reduce((sum, n) => sum + n, 0) / list.length : 0);
    /** The same campus with every decoration put away. */
    const putAway = (state: GameState): GameState => {
      let out = state;
      for (const placed of state.map.placed) {
        if (!placed || placed.type !== 'decor') continue;
        const done = applyAction(out, { type: 'storeDecor', placed: placed.id });
        if (done.ok) out = done.state;
      }
      return out;
    };
    const without = new Map(runs.map((run) => [run, putAway(run.final)]));
    const sealsSpent = (run: Run): number => run.seen.sealsSpent + tally(run, 'sealsSpent');
    const sealsEarned = (run: Run): number => run.final.daily.seals + sealsSpent(run);
    console.log('DECORATIONS, THE WORKSHOP AND GOLD SEALS');
    console.log(`${''.padEnd(34)}${head}`);
    const row = (name: string, cell: (run: Run) => string): void => console.log(`${name.padEnd(34)}${runs.map((run) => cell(run).padStart(14)).join('')}`);
    for (const week of [1, 4, 12, PACE_WEEKS]) row(`decorations owned, week ${week}`, (run) => String(at(run, week).decor));
    row('on the map at the end', (run) => String(decorCounts(run.final).placed));
    row('in storage at the end', (run) => String(decorCounts(run.final).stored));
    row('kinds owned, of ' + DECOR.filter((spec) => spec.home.kind !== 'founder').length, (run) => String(decorCounts(run.final).kinds));
    row('bought for cash', (run) => String(tally(run, 'bought')));
    row('bought for Gold Seals', (run) => String(tally(run, 'boughtSeals')));
    row('given by the town', (run) => String(tally(run, 'given')));
    row('made in the Workshop', (run) => String(tally(run, 'crafted')));
    row('made a week, weeks 1 to 4', (run) => ((at(run, 4).crafted - at(run, 1).crafted) / 3).toFixed(1));
    row('made a week, weeks 12 to ' + PACE_WEEKS, (run) => ((at(run, PACE_WEEKS).crafted - at(run, 12).crafted) / (PACE_WEEKS - 12)).toFixed(1));
    row('benches', (run) => String(run.final.decor.benches.length));
    row('mean lift to a lot, of ' + DECOR_CAP, (run) => mean(lifts(run.final)).toFixed(2));
    row('lots at the cap', (run) => `${lifts(run.final).filter((lift) => lift >= DECOR_CAP - 0.01).length} of ${lots(run.final).length}`);
    row('looks, of 100', (run) => averageDesirability(run.final).toFixed(1));
    row('looks with them put away', (run) => averageDesirability(without.get(run)!).toFixed(1));
    row('applicants a fall', (run) => String(fallApplicants(run.final).total));
    row('applicants with them put away', (run) => String(fallApplicants(without.get(run)!).total));
    row('Seals earned a week', (run) => (sealsEarned(run) / PACE_WEEKS).toFixed(1));
    row('Seals spent a week', (run) => (sealsSpent(run) / PACE_WEEKS).toFixed(1));
    row('  of them on decorations', (run) => (tally(run, 'sealsSpent') / PACE_WEEKS).toFixed(1));
    for (const week of [1, 4, 12, PACE_WEEKS]) row(`Seals held, week ${week}`, (run) => String(at(run, week).seals));
    console.log('');

    const worth = runs.map((run) => fallApplicants(run.final).total - fallApplicants(without.get(run)!).total);
    check(
      'decorations lift how a campus looks a little, through one input with one cap, and nothing else',
      runs.every((run) => lifts(run.final).every((lift) => lift >= 0 && lift <= DECOR_CAP + 1e-9) && averageDesirability(run.final) >= averageDesirability(without.get(run)!)) &&
        runs.every((run) => averageDesirability(run.final) - averageDesirability(without.get(run)!) <= DECOR_CAP + 1e-9),
      `${runs.map((run) => `${run.style} ${run.seed}: ${decorCounts(run.final).placed} on the map lift a lot by ${mean(lifts(run.final)).toFixed(2)} of ${DECOR_CAP} on average, looks ${averageDesirability(run.final).toFixed(1)} against ${averageDesirability(without.get(run)!).toFixed(1)} with them put away`).join('; ')}. That is worth ${Math.min(...worth)} to ${Math.max(...worth)} applicants a fall`,
    );
    check(
      'nothing is ever lost: every decoration bought, made or given is on the map or in storage',
      runs.every((run) => decorCounts(run.final).owned === tally(run, 'bought') + tally(run, 'boughtSeals') + tally(run, 'crafted') + tally(run, 'given')),
      runs.map((run) => `${run.style} ${run.seed}: ${decorCounts(run.final).owned} owned from ${tally(run, 'bought')} bought, ${tally(run, 'boughtSeals')} for Seals, ${tally(run, 'crafted')} made and ${tally(run, 'given')} given`).join('; '),
    );
    const dailies = of('daily');
    check(
      'a player gets a new decoration often, and the once-a-day player loses nothing by it: a finished craft waits',
      runs.every((run) => at(run, 1).decor >= 5 && at(run, 4).decor >= 20 && tally(run, 'crafted') > 0) && dailies.every((run) => run.final.decor.benches.every((bench) => bench.making === null || bench.done !== null)),
      runs.map((run) => `${run.style} ${run.seed}: ${at(run, 1).decor} owned at week 1, ${at(run, 4).decor} at week 4, ${at(run, 12).decor} at week 12, ${at(run, PACE_WEEKS).decor} at week ${PACE_WEEKS}; ${tally(run, 'crafted')} made`).join('; '),
    );
    // Seals now have something to buy. A week's Seals buy about one special thing, and a balance still builds.
    const special = mean(DECOR.flatMap((spec) => (spec.home.kind === 'seals' ? [spec.home.price] : [])));
    check(
      'Gold Seals buy about one special thing a week',
      runs.every((run) => sealsEarned(run) / PACE_WEEKS >= 0.6 * special && sealsEarned(run) / PACE_WEEKS <= 2.5 * special && tally(run, 'boughtSeals') > 0),
      `${runs.map((run) => `${run.style} ${run.seed}: ${(sealsEarned(run) / PACE_WEEKS).toFixed(1)} earned a week, ${(sealsSpent(run) / PACE_WEEKS).toFixed(1)} spent, ${run.final.daily.seals} held at the end, ${tally(run, 'boughtSeals')} decorations bought with them`).join('; ')}. A decoration for Seals costs ${special.toFixed(1)} on average`,
    );
    // The players who use none of it, and the campus nobody visits.
    check(
      'decorating is a bonus: a campus that never opens the shelf or the Workshop loses nothing',
      bare.every((run) => decorCounts(run.final).placed === 0 && tally(run, 'bought') === 0 && tally(run, 'crafted') === 0) && decorCounts(alone.final).owned === 0 && alone.final.decor.benches.every((bench) => bench.making === null),
      `${bare.map((run) => `${run.style} ${run.seed}: ${decorCounts(run.final).owned} owned, none set out`).join('; ')}; the campus left alone owns ${decorCounts(alone.final).owned}`,
    );
    // The seasonal sets, by the real calendar: every day of a year is in one set or in none, and each set comes back.
    const days = Array.from({ length: 365 }, (_, n) => Date.UTC(2027, 0, 1) + n * 86_400_000);
    const liveOn = (ms: number): string => {
      const probe = structuredClone(alone.final);
      probe.clock.lastSimulatedAt = ms;
      probe.clock.nextTickAt = ms;
      return liveSeason(probe)?.id ?? '';
    };
    const lived = days.map(liveOn);
    const counts = SEASON_SETS.map((set) => lived.filter((id) => id === set.id).length);
    check(
      'each seasonal set is live for some weeks of every real year, and what was bought stays',
      counts.every((n) => n >= 21 && n <= 92) && SEASON_SETS.every((set) => DECOR.some((spec) => spec.home.kind === 'season' && spec.home.season === set.id)),
      `${SEASON_SETS.map((set, n) => `${set.name}: ${counts[n]} days of 2027, ${DECOR.filter((spec) => spec.home.kind === 'season' && spec.home.season === set.id).length} decorations`).join('; ')}; ${lived.filter((id) => id === '').length} days with no set`,
    );
  }

  // What each era opens (DESIGN.md section 41): the switches are there for the player who reached the era, the
  // pace of the goals is the same with them in use as with every one left off, and nobody is asked to use one.
  {
    const opened = runs.every((run) => policiesOpen(run.final).length === POLICIES.filter((spec) => spec.era <= eraOf(run.final.goals)).length && run.final.policies.on.every((id) => policiesOpen(run.final).some((spec) => spec.id === id)));
    const used = runs.filter((run) => run.seen.switches > 0).length;
    const unused = plain.every((run) => run.seen.switches === 0 && run.final.policies.on.length === 0);
    // The week of each rank goal, with the switches in use against every one off: never more than a few weeks apart.
    let widest = 0;
    runs.forEach((run, n) => {
      RANK_GOALS.forEach((_, goal) => {
        const a = run.seen.rankWeeks[goal]!;
        const b = plain[n]!.seen.rankWeeks[goal]!;
        if (a > 0 && b > 0) widest = Math.max(widest, Math.abs(a - b));
      });
    });
    const offOk =
      plainOf('striver').every((run) => run.seen.rankWeeks[3]! >= 5 && run.seen.rankWeeks[3]! <= 13) &&
      [...plainOf('casual'), ...plainOf('daily')].every((run) => run.seen.rankWeeks[3]! >= 5 && run.seen.rankWeeks[3]! <= 18) &&
      plain.every((run) => run.seen.rankWeeks[7]! === 0 || run.seen.rankWeeks[7]! >= 20);
    check(
      'an era opens its switches, the players who reach it use them, and the pace of the goals does not hang on them',
      opened && used === runs.length && unused && offOk && widest <= 6,
      `${runs.map((run) => `${run.style} ${run.seed}: ${ERAS[eraOf(run.final.goals)]}, ${policiesOpen(run.final).length} open, ${run.final.policies.on.length} on, ${run.seen.switches} thrown`).join('; ')}. With every switch off: ${plain.map((run) => `${run.style} ${run.seed} Top 100 at ${weekOf(run.seen.rankWeeks[3]!)}, Top 10 ${weekOf(run.seen.rankWeeks[7]!)}, No. ${run.final.field.rank} at the end`).join('; ')}. The same goal is never more than ${widest} ${widest === 1 ? 'week' : 'weeks'} apart with the switches in use`,
    );
  }

  // What each policy is worth, in its own numbers (DESIGN.md section 41): on two campuses, each with every era
  // open, the one policy turned on and left for six years against the same campus with it off. The first is the
  // campus of the once-a-day player after its long run. The second is a campus nobody has tended.
  {
    const SIX = 6;
    // Each campus is read a day and a half into a fall, when its dorms are as full as they get: every era open,
    // every switch off.
    const eras = (state: GameState): GameState => {
      const next = advance(structuredClone(state), state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 1.5 * DAY_MS).state;
      next.goals!.rank = RANK_GOALS.length;
      next.policies = { on: [], locked: [], news: [] };
      return next;
    };
    interface Read {
      kept: number;
      happy: number;
      stress: number;
      students: number;
      left: number;
      incidents: number;
      rating: number;
      published: number;
      rank: number;
      income: number;
      spending: number;
    }
    /** Six years of a campus as it stands, read every day: what it keeps, its Happiness, who left, and where it ends. */
    const sixYears = (start: GameState): Read => {
      let state = start;
      const from = state.clock.lastSimulatedAt;
      let kept = 0;
      let happy = 0;
      let students = 0;
      let income = 0;
      let spending = 0;
      let days = 0;
      let left = 0;
      let incidents = 0;
      let stress = 0;
      let semesters = 0;
      for (let day = 1; day <= SIX * 7; day++) {
        const result = advance(state, state.clock.lastSimulatedAt, from + day * DAY_MS);
        state = result.state;
        for (const entry of result.log) {
          if (entry.kind === 'semester') {
            left += Number(entry.data?.left ?? 0);
            // The semester's own average, not the rounded figure the log carries.
            stress += state.term.lastAverage;
            semesters += 1;
          }
          if (entry.kind === 'incident' && entry.data?.handled === 0) incidents += 1;
        }
        const books = budget(state);
        kept += books.kept;
        income += books.incomeTotal;
        spending += books.spending;
        happy += campusHappiness(state).base;
        students += enrollment(state);
        days += 1;
      }
      return { kept: kept / days, happy: happy / days, stress: stress / Math.max(1, semesters), students: students / days, left: left / SIX, incidents: incidents / SIX, rating: academicRating(state), published: state.field.academic, rank: state.field.rank, income: income / days, spending: spending / days };
    };
    const campuses: Array<[string, GameState]> = [
      ['the once-a-day campus', eras(of('daily')[0]!.final)],
      ['a campus nobody tends', eras(alone.final)],
      ['a campus with half its cover gone', eras(stripped(alone.final))],
    ];
    const signed = (n: number, digits = 2): string => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(digits)}`;
    let moved = true;
    const told: string[] = [];
    console.log('WHAT EACH POLICY IS WORTH: one switch on for six years, against the same campus with it off');
    for (const [name, base] of campuses) {
      const off = sixYears(base);
      const inputs = academicInputs(base).map((input) => `${input.id} ${input.level === null ? '-' : input.level.toFixed(0)}`).join(', ');
      console.log('');
      console.log(`${name}: ${enrollment(base)} students, keeps $${off.kept.toFixed(2)}, Happiness ${off.happy.toFixed(1)}, semester Stress ${off.stress.toFixed(1)}, ${Math.round(off.left)} leave a year, ${Math.round(off.incidents)} incidents a year unanswered, rating ${off.rating.toFixed(1)} (published ${off.published.toFixed(1)}, No. ${off.rank}); ${inputs}`);
      for (const spec of POLICIES) {
        const result = applyAction(base, { type: 'policy', id: spec.id, on: true });
        if (!result.ok) {
          moved = false;
          continue;
        }
        const words = policyWords(base, spec);
        const on = sixYears(result.state);
        const d = { kept: on.kept - off.kept, happy: on.happy - off.happy, stress: on.stress - off.stress, left: on.left - off.left, incidents: on.incidents - off.incidents, rating: on.rating - off.rating, published: on.published - off.published, rank: on.rank - off.rank, income: on.income - off.income, spending: on.spending - off.spending };
        console.log(`  ${spec.name}`);
        console.log(`      + ${spec.gives}: ${words.gain.join('; ')}`);
        console.log(`      - ${spec.takes}: ${words.cost.join('; ')}`);
        console.log(`      over six years: keeps ${signed(d.kept)} of every $100 (income ${signed(d.income / 1e6)}M, spending ${signed(d.spending / 1e6)}M a year), Happiness ${signed(d.happy)}, semester Stress ${signed(d.stress)}, ${signed(d.left, 0)} leave a year, ${signed(d.incidents, 0)} incidents unanswered a year, rating ${signed(d.rating, 1)} (published ${signed(d.published, 1)}, ${d.rank === 0 ? 'same rank' : `${Math.abs(d.rank)} ${Math.abs(d.rank) === 1 ? 'place' : 'places'} ${d.rank < 0 ? 'better' : 'worse'}`})`);
        // Each moves the number it names, the way it says.
        const ok: Record<string, boolean> = {
          readingDays: d.stress < 0,
          toughGrading: d.left > 0,
          freshmenOnCampus: d.income >= 0 && d.happy <= 0.01,
          freeStudentSection: d.happy > 0 && d.income <= 0,
          allNightLibrary: d.stress <= 0 && d.spending > 0,
          parkingFees: d.income > 0 && d.happy < 0,
          quietHours: d.happy < 0.5,
          namingRights: d.income > 0 && d.happy < 0,
        };
        if (ok[spec.id] === false) {
          moved = false;
          told.push(`${spec.name} on ${name}`);
        }
      }
    }
    // Tough grading is the one whose two sides come at different times: the lift at once, the cost as the classes
    // it thinned graduate. The same campus with it on, against itself with it off, six, fifteen and thirty years on.
    {
      const base = campuses[0]![1];
      const tough = applyAction(base, { type: 'policy', id: 'toughGrading', on: true });
      const read = (state: GameState): { rating: number; published: number; rank: number; graduation: number } => ({ rating: academicRating(state), published: state.field.academic, rank: state.field.rank, graduation: academicInputs(state).find((input) => input.id === 'graduation')?.level ?? 0 });
      if (tough.ok) {
        console.log('');
        console.log('TOUGH GRADING OVER TIME, on the once-a-day campus: on against off');
        let on = tough.state;
        let off = base;
        // A year at a time: a single catch-up never runs longer than a few weeks.
        for (let year = 1; year <= 30; year++) {
          on = advance(on, on.clock.lastSimulatedAt, base.clock.lastSimulatedAt + year * YEAR_MS).state;
          off = advance(off, off.clock.lastSimulatedAt, base.clock.lastSimulatedAt + year * YEAR_MS).state;
          if (![1, 3, 6, 10, 15, 20, 30].includes(year)) continue;
          const a = read(on);
          const b = read(off);
          console.log(`  after ${String(year).padStart(2)} years: rating ${signed(a.rating - b.rating, 1)}, published ${signed(a.published - b.published, 1)}, rank No. ${a.rank} against No. ${b.rank}, graduation rate in the rating ${signed(a.graduation - b.graduation, 1)}`);
        }
      }
    }
    console.log('');
    check(
      'every policy moves the number it names, the way its switch says, on a tended campus and on an untended one',
      moved,
      told.length === 0 ? `${POLICIES.length} policies on ${campuses.length} campuses, six years each, against the same campus with the switch off: the table above` : `not as said: ${told.join('; ')}`,
    );
  }

  // Rank, applicants and selectivity feed each other: a better rank brings applicants, applicants make a full
  // campus more selective, and a selective campus ranks better. It has to settle. Nothing else changes here:
  // the campus is left alone for forty years.
  {
    let state = opening;
    const rows: Array<{ year: number; applicants: number; accept: number; measured: number; published: number; rank: number }> = [];
    // Read each year on rankings day itself: what was measured, and what was published.
    for (let year = 1; year <= 40; year++) {
      const result = advance(state, state.clock.lastSimulatedAt, T0 + year * YEAR_MS);
      state = result.state;
      const day = result.log.filter((entry) => entry.kind === 'rankings').pop();
      const fall = result.log.filter((entry) => entry.kind === 'intake' && entry.data?.season === 'fall').pop();
      const spring = result.log.filter((entry) => entry.kind === 'intake' && entry.data?.season === 'spring').pop();
      const applied = Number(fall?.data?.expected ?? 0) + Number(spring?.data?.expected ?? 0);
      const admitted = Number(fall?.data?.admitted ?? 0) + Number(spring?.data?.admitted ?? 0);
      if (day) rows.push({ year, applicants: Number(fall?.data?.expected ?? fallApplicants(state).total), accept: applied > 0 ? admitted / applied : 1, measured: Number(day.data?.measured ?? 0), published: Number(day.data?.rating ?? 0), rank: Number(day.data?.rank ?? 0) });
    }
    console.log('');
    console.log('RANK, APPLICANTS AND SELECTIVITY ON A CAMPUS LEFT ALONE');
    console.log('year  applicants  admitted  measured  published  rank');
    for (const row of rows.filter((one) => one.year <= 4 || one.year % 4 === 0)) {
      console.log([String(row.year).padStart(4), String(row.applicants).padStart(11), `${Math.round(row.accept * 100)}%`.padStart(9), row.measured.toFixed(1).padStart(9), row.published.toFixed(1).padStart(10), String(row.rank).padStart(5)].join(' '));
    }
    const late = rows.slice(-10);
    const span = (pick: (row: (typeof rows)[number]) => number): number => Math.max(...late.map(pick)) - Math.min(...late.map(pick));
    const most = Math.max(...rows.map((row) => row.applicants));
    // The most the four causes could ever make of the reach: looks, marketing, football and the rank all at their best.
    const ceiling = (cap / 50_000) * 11_000 * 1.4 * 1.2 * 1.14 * 1.25;
    check(
      'rank, applicants and selectivity settle: left alone, the last ten of forty years barely move',
      span((row) => row.published) <= 2 && span((row) => row.applicants) <= 0.05 * late[0]!.applicants && most < ceiling,
      `years 31 to 40: the published rating moves ${span((row) => row.published).toFixed(1)} points, applicants ${span((row) => row.applicants)} (${late[0]!.applicants} to start with), the share admitted ${Math.round(Math.min(...late.map((row) => row.accept)) * 100)}% to ${Math.round(Math.max(...late.map((row) => row.accept)) * 100)}%; rank ${Math.min(...late.map((row) => row.rank))} to ${Math.max(...late.map((row) => row.rank))} as the field drifts; the most applicants in any year ${most}, and the four causes at their best could never make more than ${Math.round(ceiling)}`,
    );
  }

  // The same on a campus with all eight buildings placed, where looks bring the most applicants they can: the
  // campus of the player who works every cause, left alone for thirty more years.
  {
    let state = of('striver')[0]!.final;
    const from = state.clock.lastSimulatedAt;
    const rows: Array<{ applicants: number; published: number; rank: number }> = [];
    for (let year = 1; year <= 30; year++) {
      const result = advance(state, state.clock.lastSimulatedAt, from + year * YEAR_MS);
      state = result.state;
      const day = result.log.filter((entry) => entry.kind === 'rankings').pop();
      const fall = result.log.filter((entry) => entry.kind === 'intake' && entry.data?.season === 'fall').pop();
      if (day && fall) rows.push({ applicants: Number(fall.data?.expected ?? 0), published: Number(day.data?.rating ?? 0), rank: Number(day.data?.rank ?? 0) });
    }
    const late = rows.slice(-10);
    const span = (pick: (row: (typeof rows)[number]) => number): number => Math.max(...late.map(pick)) - Math.min(...late.map(pick));
    const placed = rewardsEarned(state).length - rewardsWaiting(state).length;
    check(
      'they still settle with every building placed: thirty years on, the last ten barely move',
      placed === RANK_REWARDS.length && late.length === 10 && span((row) => row.published) <= 2 && span((row) => row.applicants) <= 0.05 * late[0]!.applicants,
      `${placed} buildings on the campus, looks ${averageDesirability(state).toFixed(1)} of 100; in the last ten years the published rating moves ${span((row) => row.published).toFixed(1)} points and applicants ${span((row) => row.applicants)} (${late[0]!.applicants} to start with); rank ${Math.min(...late.map((row) => row.rank))} to ${Math.max(...late.map((row) => row.rank))}`,
    );
  }

  // The owner's two checks (DESIGN.md 38.1, point 4).
  // A campus that grows fast without building ahead ends short and unhappy, and never spirals. It opens a third
  // full, with half of what feeds, entertains and looks after its students taken away and one worker at each yard.
  // Its player turns marketing up, underfunds teaching, and builds nothing.
  {
    let state = withStudents(stripped(opening), 1 / 3, true);
    const started = enrollment(state);
    for (const action of [{ type: 'marketing', step: 4 } as const, { type: 'instruction', step: 0 } as const]) {
      const done = applyAction(state, action);
      if (done.ok) state = done.state;
    }
    const students: number[] = [];
    const happy: number[] = [];
    let stretched = 0;
    for (let year = 1; year <= 12; year++) {
      // Read each fall, two days in, with the class settled.
      state = advance(state, state.clock.lastSimulatedAt, T0 + (year - 1) * YEAR_MS + 2 * DAY_MS).state;
      students.push(enrollment(state));
      happy.push(campusHappiness(state).base);
      if (facultyCount(state) < facultyNeed(state) * 0.9) stretched += 1;
    }
    const page = capacity(state);
    const short = page.needs.filter((need) => need.status !== 'ok').map((need) => `${need.name.toLowerCase()} ${need.status}`);
    const tended = campusHappiness(of('daily')[0]!.final).base;
    const last = students.slice(-4);
    const steady = Math.max(...last) - Math.min(...last) <= 0.05 * last[0]!;
    const mood = campusHappiness(state);
    check(
      'a campus that grows fast without building ahead ends short and unhappy, and never spirals',
      students[2]! >= started * 2 && stretched >= 1 && short.length >= 3 && happy[11]! < tended - 5 && happy[11]! >= 25 && steady && mood.retention >= 0.95 && state.money.grants === 0 && state.money.incomePerYear > state.money.spendingPerYear && validate(state) === null,
      `${started} students to begin with, ${students[2]} by its third fall and ${students[11]} at its twelfth, the last four within ${Math.max(...last) - Math.min(...last)} of each other; faculty a tenth or more short in ${stretched} of twelve falls; at the end: ${short.join(', ')}; Happiness ${happy[11]!.toFixed(0)} against ${tended.toFixed(0)} on a tended campus; ${(mood.retention * 100).toFixed(1)}% stay each semester; it nets ${dollarsShort(state.money.incomePerYear - state.money.spendingPerYear)} a year and took ${dollarsShort(state.money.grants)} from the state`,
    );
  }

  // A campus that shrinks recovers its finances within two years. The once-a-day player's campus, six years in,
  // loses three students in ten overnight. Nobody is let go, so the payroll is carried until the semester turns.
  {
    // Six years, and then two days into the seventh fall, so the campus is read in term with its class settled.
    const six = play('daily', seed, 6, 'model');
    const settled = takeTurn(advance(six.final, six.final.clock.lastSimulatedAt, T0 + 6 * YEAR_MS + 2 * DAY_MS).state, 'daily').state;
    const before = budget(settled);
    let state = withStudents(settled, 0.7, false);
    const carried = facultyCount(state) - facultyNeed(state);
    const atOnce = budget(state);
    let least = state.money.cash;
    let worst = atOnce.kept;
    const kept: number[] = [];
    const from = state.clock.lastSimulatedAt;
    // Two years, a visit a day.
    for (let day = 1; day <= 14; day++) {
      state = advance(state, state.clock.lastSimulatedAt, from + day * DAY_MS).state;
      state = takeTurn(state, 'daily').state;
      least = Math.min(least, state.money.cash);
      const now = budget(state).kept;
      worst = Math.min(worst, now);
      kept.push(now);
    }
    // Read in term, as the margin always is: the last reading that is not a summer's.
    const end = budget(state);
    const inTerm = Math.max(...kept.slice(-7));
    check(
      'a campus that shrinks carries its payroll for a while, and recovers its finances within two years',
      carried > 0 && atOnce.kept < before.kept - 5 && inTerm >= 12 && state.money.grants === settled.money.grants && least >= 0 && validate(state) === null,
      `${enrollment(settled)} students and $${before.kept.toFixed(1)} kept of every $100 before; ${enrollment(withStudents(settled, 0.7, false))} students the day after, with ${carried} more faculty than they need still paid, and $${atOnce.kept.toFixed(1)} kept; the worst reading in two years $${worst.toFixed(1)}; two years on ${enrollment(state)} students, $${inTerm.toFixed(1)} kept in term and $${end.kept.toFixed(1)} on the last day; cash never under ${dollarsShort(least)}; no grant from the state`,
    );
  }

  // A goal reached while away is in the paper of the next visit, for every player.
  {
    const unsaid = runs.reduce((sum, run) => sum + run.seen.goalsUnsaid, 0);
    const reached = runs.reduce((sum, run) => sum + run.seen.sizeWeeks.filter((at) => at > 0).length + run.seen.rankWeeks.filter((at) => at > 0).length, 0);
    check('a goal reached while away is in the paper of the next visit', reached > 0 && unsaid === 0, `${reached} goals reached across ${runs.length} runs, ${unsaid} missing from the paper`);
  }

  // Thirty days of catch-up on it stays inside one second.
  {
    let best = Infinity;
    for (let n = 0; n < 3; n++) {
      const t = performance.now();
      advance(opening, opening.clock.lastSimulatedAt, opening.clock.lastSimulatedAt + 30 * DAY_MS);
      best = Math.min(best, performance.now() - t);
    }
    // And on the campus of the player who works every cause, with all eight of the rank goals' buildings on it.
    const full = of('striver')[0]!.final;
    let lifted = Infinity;
    for (let n = 0; n < 3; n++) {
      const t = performance.now();
      advance(full, full.clock.lastSimulatedAt, full.clock.lastSimulatedAt + 30 * DAY_MS);
      lifted = Math.min(lifted, performance.now() - t);
    }
    check(
      '30 days of catch-up on the model campus runs in under one second',
      best < 1000 && lifted < 1000,
      `${best.toFixed(0)} ms with ${buildings(opening.map).length} lots and ${opening.map.placed.filter(Boolean).length} placed things; ${lifted.toFixed(0)} ms on a tended campus with ${buildings(full.map).length} lots, ${full.map.placed.filter(Boolean).length} placed things and all eight reward buildings`,
    );
  }

  check('the model campus validates when it opens and after its longest run', validate(opening) === null && runs.every((run) => validate(run.final) === null), `checked by the validation every save goes through, at opening and after ${PACE_WEEKS} weeks with each player`);
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
check(
  'a game with no goals has no orders board: nothing offered, nothing counted',
  allRuns.every((run) => run.final.orders.open.length === 0 && Object.keys(run.final.orders.tally).length === 0 && run.final.orders.marks.length === 0),
  `${allRuns.length} small campuses, ${allRuns.reduce((sum, run) => sum + run.final.orders.open.length, 0)} orders between them`,
);
assertModelCampus(SEEDS[0]!);
console.log(`\n${failures.length === 0 ? 'All assertions passed' : `${failures.length} assertion(s) failed`} in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
process.exit(failures.length === 0 ? 0 : 1);
