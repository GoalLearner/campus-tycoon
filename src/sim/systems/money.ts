import { PHASE_STEPS } from '../config/money';
import { TICKS_PER_YEAR } from '../config/time';
import { dollars } from '../format';
import type { GameState, LogEntry } from '../types';
import { budget } from './budget';

export { occupiedBeds } from './budget';

/**
 * Money. Tuition from every student and a room fee from every occupied bed
 * come in. What goes out is worked out line by line in `budget`. Rates are
 * yearly and accrue every tick. See DESIGN.md sections 9, 25.1 and 31.
 */

/** Call after anything that changes enrollment, the buildings that stand, or what the player has chosen to spend. */
export function markRatesDirty(state: GameState): void {
  state.money.ratesDirty = true;
}

export function recomputeRates(state: GameState): void {
  const b = budget(state);
  state.money.incomePerYear = b.incomeTotal;
  state.money.spendingPerYear = b.spending;
  state.money.ratesDirty = false;
}

/** One tick of income and spending. */
export function accrue(state: GameState): void {
  const m = state.money;
  if (m.ratesDirty) recomputeRates(state);
  const earned = m.incomePerYear / TICKS_PER_YEAR;
  const spent = m.spendingPerYear / TICKS_PER_YEAR;
  m.cash += earned - spent;
  m.yearEarned += earned;
  m.yearSpent += spent;
}

/** A one-off purchase. Returns false and changes nothing when cash is short. */
export function spend(state: GameState, amount: number): boolean {
  if (amount > state.money.cash) return false;
  state.money.cash -= amount;
  state.money.yearSpent += amount;
  return true;
}

/**
 * A save from before play stop 5 takes one more step toward full costs each
 * day, seven in all, and says so each time. A new campus is already there.
 */
export function stepPhase(state: GameState, log: LogEntry[]): void {
  const m = state.money;
  if (m.phase >= PHASE_STEPS) return;
  m.phase += 1;
  recomputeRates(state);
  const full = budget(state).fullSpending;
  log.push({
    tick: state.clock.tick,
    kind: 'costs',
    text:
      m.phase >= PHASE_STEPS
        ? `Running costs have reached their full level: ${dollars(m.spendingPerYear)} a year. The cash figure opens the Money panel, which shows where it goes.`
        : `Running costs rose a step, ${m.phase} of ${PHASE_STEPS}: ${dollars(m.spendingPerYear)} a year now, and about ${dollars(full)} once all ${PHASE_STEPS} are in.`,
    data: { step: m.phase, spending: Math.round(m.spendingPerYear), full: Math.round(full) },
  });
}

/**
 * Daily check. When cash would sit below zero the endowment covers the
 * shortfall first, so nobody can put cash away and be bailed out. If that is
 * not enough the state tops cash up to zero and the grant is recorded. The
 * real bailout, with its penalties, arrives in layer 2.
 */
export function dailyCashCheck(state: GameState, log: LogEntry[]): void {
  const m = state.money;
  if (m.cash >= 0) return;
  const fromEndowment = Math.min(-m.cash, m.endowment);
  if (fromEndowment > 0) {
    m.endowment -= fromEndowment;
    m.cash += fromEndowment;
    markRatesDirty(state);
    log.push({
      tick: state.clock.tick,
      kind: 'grant',
      text: `The endowment covered a shortfall of ${dollars(fromEndowment)}.`,
      data: { endowment: Math.round(fromEndowment) },
    });
  }
  if (m.cash >= 0) return;
  const shortfall = -m.cash;
  m.cash = 0;
  m.grants += shortfall;
  log.push({
    tick: state.clock.tick,
    kind: 'grant',
    text: `The state covered a shortfall of ${dollars(shortfall)}.`,
    data: { amount: Math.round(shortfall) },
  });
}

/** Close the books on a game year and start the next. */
export function closeYear(state: GameState): { earned: number; spent: number } {
  const m = state.money;
  const totals = { earned: m.yearEarned, spent: m.yearSpent };
  m.yearEarned = 0;
  m.yearSpent = 0;
  return totals;
}
