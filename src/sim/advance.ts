import { stepGrounds } from './systems/grounds';
import { spawnIncidents, stepIncidents } from './systems/incidents';
import { calendarAt, eventsAt, type CalendarEvent } from './calendar';
import { GROWTH_EVAL_TICKS, MAX_CATCHUP_TICKS, TICK_MS, TICKS_PER_YEAR } from './config/time';
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
import { accrue, dailyCashCheck } from './systems/money';
import { yearEnd } from './systems/year';
import { popDue } from './timers';
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

  for (const timer of popDue(state, clock.tick)) fireTimer(state, timer, log);
  for (const event of eventsAt(clock.tick)) onCalendarEvent(state, event, log);

  if (clock.tick % GROWTH_EVAL_TICKS === 0) {
    fillFromWaitlist(state, log);
    evaluateGrowth(state);
  }

  stepIncidents(state, log);
  spawnIncidents(state);
  stepGrounds(state, log);

  accrue(state);
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
  }
}

function onCalendarEvent(state: GameState, event: CalendarEvent, log: LogEntry[]): void {
  switch (event) {
    case 'dayStart':
      dailyCashCheck(state, log);
      break;
    case 'fallIntake':
      if (calendarAt(state.clock.tick).year > 1) {
        promote(state);
        spreadClassYears(state, log);
      }
      runIntake(state, 'fall', log);
      evaluateGrowth(state);
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
      break;
  }
}
