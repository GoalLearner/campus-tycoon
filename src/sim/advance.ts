import { tellPolicies } from './systems/policies';
import { tellDaily } from './systems/daily';
import { offerDaily, tellOrders } from './systems/orders';
import { decorOnDayStart, onCraftDone } from './systems/decor';
import { rhythmOnDayStart, rhythmOnFallIntake, rhythmOnTimer, tellRhythm } from './systems/rhythm';
import { bigBuildDone, tellBigBuilds } from './systems/bigBuilds';
import { discoveryDue } from './systems/labs';
import { openRoutine, stepInbox } from './systems/inbox';
import { stepGrounds } from './systems/grounds';
import { spawnIncidents, stepIncidents } from './systems/incidents';
import { calendarAt, dateAt, eventsAt, rollWeek, type CalendarEvent } from './calendar';
import { GROWTH_EVAL_TICKS, MAX_CATCHUP_TICKS, TICK_MS, TICKS_PER_HOUR, TICKS_PER_YEAR } from './config/time';
import {
  closeWaitlist,
  fillFromWaitlist,
  graduate,
  promote,
  runIntake,
  semesterEnd,
  spreadClassYears,
} from './systems/admissions';
import { finishBuild } from './systems/construction';
import { evaluateGrowth } from './systems/growth';
import { campusLevels } from './systems/happiness';
import { stepSeason } from './systems/season';
import { accrue, dailyCashCheck, markRatesDirty, stepPhase } from './systems/money';
import { openAnnualDecisions, stepDecisions } from './systems/decisions';
import { driftField, rankingsDay } from './systems/field';
import { finalWhistle, footballYearEnd, hasSeason, kickoff, scrimmage, stadiumDone, startSeason } from './systems/football';
import { yearEnd } from './systems/year';
import { addTimer, popDue } from './timers';
import type { AdvanceResult, GameState, LogEntry, Timer } from './types';

/**
 * The heart of the game. Moves the simulation from one real moment to another.
 *
 * Tick timing lives in the state (clock.nextTickAt), never in the caller, so a
 * span gives identical results whether it is advanced in one call or in a
 * thousand small ones. Nothing here reads the wall clock or a global random
 * source. See DESIGN.md section 17.4.
 *
 * `from` should equal state.clock.lastSimulatedAt. The state's own clock is the
 * source of truth, so a caller that passes a stale `from` cannot corrupt it.
 *
 * The 30-day cap applies to a single call: one absence longer than 30 days
 * drops whole weeks so the weekly rhythm stays aligned with real time.
 */
export function advance(state: GameState, from: number, to: number): AdvanceResult {
  void from;
  const last = state.clock.lastSimulatedAt;

  if (to < last) {
    return { state, log: [], info: { ticks: 0, weeksSkipped: 0, clockWentBack: true } };
  }

  let due = to >= state.clock.nextTickAt ? Math.floor((to - state.clock.nextTickAt) / TICK_MS) + 1 : 0;

  if (due === 0) {
    const same = to === last;
    return {
      state: same ? state : { ...state, clock: { ...state.clock, lastSimulatedAt: to } },
      log: [],
      info: { ticks: 0, weeksSkipped: 0, clockWentBack: false },
    };
  }

  const draft = structuredClone(state);
  const log: LogEntry[] = [];

  let weeksSkipped = 0;
  if (due > MAX_CATCHUP_TICKS) {
    weeksSkipped = Math.ceil((due - MAX_CATCHUP_TICKS) / TICKS_PER_YEAR);
    const skippedTicks = weeksSkipped * TICKS_PER_YEAR;
    draft.clock.nextTickAt += skippedTicks * TICK_MS;
    draft.clock.weeksSkipped += weeksSkipped;
    due -= skippedTicks;
    log.push({
      tick: draft.clock.tick,
      kind: 'paused',
      text:
        weeksSkipped === 1
          ? 'You were away a long time. The campus sat paused for 1 week.'
          : `You were away a long time. The campus sat paused for ${weeksSkipped} weeks.`,
      data: { weeks: weeksSkipped },
    });
  }

  for (let i = 0; i < due; i++) tick(draft, log);

  draft.clock.lastSimulatedAt = to;
  return { state: draft, log, info: { ticks: due, weeksSkipped, clockWentBack: false } };
}

/** One real minute of game time. The order of the steps is fixed. */
function tick(state: GameState, log: LogEntry[]): void {
  const clock = state.clock;
  clock.tick += 1;
  clock.nextTickAt += TICK_MS;
  // A new game year begins the moment the last one has run its length, stretched summer and all.
  rollWeek(clock);
  const said = log.length;
  // A policy switched since the last tick gets its one line (DESIGN.md 41.7).
  tellPolicies(state, log);
  // And a level reached by collecting gets its line (DESIGN.md 42.2).
  tellDaily(state, log);
  // And an order claimed gets its line (DESIGN.md 42.16).
  tellOrders(state, log);
  tellRhythm(state, log);
  tellBigBuilds(state, log);

  for (const timer of popDue(state, clock.tick)) fireTimer(state, timer, log);
  for (const event of eventsAt(clock)) onCalendarEvent(state, event, log);
  stepSeason(state, log, () => campusLevels(state));
  stepDecisions(state, log);
  stepInbox(state, log);

  if (clock.tick % GROWTH_EVAL_TICKS === 0) {
    fillFromWaitlist(state, log);
    evaluateGrowth(state);
  }

  stepIncidents(state, log);
  spawnIncidents(state);
  stepGrounds(state, log);

  accrue(state);

  // Everything said this tick carries the date in the game, so the away list can be read by date.
  if (log.length > said) {
    const date = dateAt(clock);
    for (let i = said; i < log.length; i++) {
      // A line that names its own date keeps it: a game's result belongs to the day it kicked off.
      log[i]!.date ??= date.month * 100 + date.day;
      log[i]!.year ??= clock.week.year;
    }
  }
}

function fireTimer(state: GameState, timer: Timer, log: LogEntry[]): void {
  switch (timer.kind) {
    case 'buildDone': {
      const zone = state.map.buildings[timer.ref]?.zone;
      finishBuild(state, timer.ref, log);
      // Room just opened: let the waitlist in first, then see what should grow next.
      fillFromWaitlist(state, log);
      if (zone) evaluateGrowth(state, zone);
      break;
    }
    case 'kickoff':
      // An hour before a home game the crowd turns out: what food earns changes. Then the kickoff itself.
      if (timer.ref >= 100) markRatesDirty(state);
      else kickoff(state, timer.ref);
      break;
    case 'final':
      finalWhistle(state, timer.ref, log);
      break;
    case 'stadiumDone':
      stadiumDone(state, log);
      break;
    case 'scrimmage':
      scrimmage(state, timer.ref, log);
      break;
    case 'moment':
      // A moment of the calendar measured on the clock: finals week (DESIGN.md 44).
      rhythmOnTimer(state, timer.ref, log);
      break;
    case 'bigBuild':
      // A big build of an era has gone up (DESIGN.md 45): it opens, and the paper says so.
      bigBuildDone(state, timer.ref, log);
      break;
    case 'discovery':
      // A research lab has made a discovery (DESIGN.md 49): the paper says so, and the next is on its way.
      discoveryDue(state, timer.ref, log);
      break;
    case 'craftDone':
      // The Workshop has finished something: the paper says so. It waits on its bench for ever.
      onCraftDone(state, timer.ref, timer.due, log);
      break;
    case 'decision':
      break;
  }
}

function onCalendarEvent(state: GameState, event: CalendarEvent, log: LogEntry[]): void {
  switch (event) {
    case 'dayStart': {
      dailyCashCheck(state, log);
      stepPhase(state, log);
      const day = calendarAt(state.clock).day;
      // Day 1 opens the football season. Day 5 is rankings day, and the spring game is played that evening.
      if (day === 1) startSeason(state, log);
      if (day === 5) {
        rankingsDay(state, log);
        if (hasSeason(state)) addTimer(state, state.clock.tick + 10 * TICKS_PER_HOUR, 'scrimmage', 1);
      }
      openAnnualDecisions(state, day, log);
      // The desk, after the year's own decisions: routine items wait while two of those are open.
      openRoutine(state, day, log);
      // The orders board: one new order a real day, while it has room. A stub, with nothing read from the campus.
      offerDaily(state, log);
      // A seasonal set of decorations that has just opened is told once (DESIGN.md 42.5).
      decorOnDayStart(state, log);
      // The moments of the calendar that are near open, and the goals for the year are set if none are (DESIGN.md 44).
      rhythmOnDayStart(state, log);
      break;
    }
    case 'fallIntake':
      if (calendarAt(state.clock).year > 1) {
        promote(state);
        spreadClassYears(state, log);
      }
      runIntake(state, 'fall', log);
      evaluateGrowth(state);
      // The fall class is in: the year's goals are set (DESIGN.md 44).
      rhythmOnFallIntake(state, log);
      break;
    case 'springIntake':
      semesterEnd(state, log);
      runIntake(state, 'spring', log);
      evaluateGrowth(state);
      break;
    case 'waitlistClose':
      closeWaitlist(state, log);
      break;
    case 'graduation':
      graduate(state, log);
      break;
    case 'yearEnd':
      yearEnd(state, log);
      // The field moves on a year, and so does the coach.
      driftField(state.field, state.rng);
      footballYearEnd(state);
      break;
  }
}
