import {
  OPERATING_COST_PER_STUDENT_PER_YEAR,
  TUITION_PER_STUDENT_PER_YEAR,
} from '../config/money';
import { TICKS_PER_YEAR } from '../config/time';
import { dollars } from '../format';
import { enrollment, upkeepPerYear } from '../selectors';
import type { GameState, LogEntry } from '../types';
import { placedIncomePerYear } from './placed';

/**
 * First playable money: flat tuition in, upkeep and a flat running cost out.
 * Rates are yearly and accrue every tick. See DESIGN.md section 9.
 */

/** Call after anything that changes enrollment or the buildings that stand. */
export function markRatesDirty(state: GameState): void {
  state.money.ratesDirty = true;
}

export function recomputeRates(state: GameState): void {
  const students = enrollment(state);
  state.money.incomePerYear = students * TUITION_PER_STUDENT_PER_YEAR + placedIncomePerYear(state);
  state.money.spendingPerYear =
    upkeepPerYear(state) + students * OPERATING_COST_PER_STUDENT_PER_YEAR;
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
 * Daily check. The first playable has no bailout penalties yet: when cash would
 * sit below zero the state tops it up to zero and the grant is recorded.
 * The real bailout arrives in layer 2.
 */
export function dailyCashCheck(state: GameState, log: LogEntry[]): void {
  const m = state.money;
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
