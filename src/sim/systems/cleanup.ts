import { ERA_AT_RANK } from '../config/goals';
import type { GameState } from '../types';
import { gainXp, hasDaily } from './daily';
import { dropMeasuredOrders } from './orders';
import { yearGoalShare, yearPay, yearProgress } from './rhythm';

/**
 * Save version 43, the goals clean-up (DESIGN.md 85.9): nothing a player has earned is lost, and old progress converts
 * into the new system. Called once, as a save from before is opened. Changes the state it is given and says what it
 * did, for the upgrade note and the hand-over.
 */
export interface CleanUpReport {
  /** Eras the save had by its rank, written down so they stay open whatever the level. */
  eras: number;
  /** The goals for the year: met ones paid in full, part-done ones their share of the experience. */
  yearMet: number;
  yearPart: number;
  yearXp: number;
  yearSeals: number;
  /** Open orders whose clock was taken off, and orders measured at a moment that were not done, taken off the board. */
  timersCleared: number;
  measuredDropped: number;
  /** Moments that had gone by unmet, now Big days to claim. */
  bigDays: number;
  /** True when a trustees' dip on Reputation was lifted. */
  dipLifted: boolean;
}

export function cleanUpGoals(state: GameState): CleanUpReport {
  const report: CleanUpReport = { eras: 0, yearMet: 0, yearPart: 0, yearXp: 0, yearSeals: 0, timersCleared: 0, measuredDropped: 0, bigDays: 0, dipLifted: false };
  const tick = state.clock.tick;
  // A trustees' dip is a penalty: lifted on any campus.
  if (state.chaos && state.chaos.dipUntil > tick) {
    state.chaos.dipUntil = 0;
    report.dipLifted = true;
  }
  if (!hasDaily(state)) return report;
  const year = Math.max(1, state.clock.week.year);
  // An era a save opened by its rank stays open, even below the level that opens it now.
  const goals = state.goals;
  if (goals) {
    let byRank = 0;
    for (let n = 0; n < ERA_AT_RANK.length; n++) if (goals.rank >= ERA_AT_RANK[n]!) byRank = n + 1;
    const have = new Set(goals.reached.filter((entry) => entry.ladder === 'era').map((entry) => entry.n));
    for (let n = 1; n <= byRank; n++) {
      if (have.has(n)) continue;
      goals.reached.push({ ladder: 'era', n, year });
      report.eras += 1;
    }
  }
  // The goals for the year: a met one is paid now, a part-done one its share of the experience.
  const set = state.rhythm?.year;
  if (set) {
    for (const goal of set.goals) {
      const pay = yearPay(goal);
      if (yearProgress(state, goal).done) {
        report.yearMet += 1;
        report.yearXp += pay.xp;
        report.yearSeals += pay.seals;
      } else {
        const share = yearGoalShare(state, goal);
        if (share <= 0) continue;
        report.yearPart += 1;
        report.yearXp += Math.round(pay.xp * share);
      }
    }
    state.rhythm.year = null;
    state.daily.seals += report.yearSeals;
    gainXp(state, report.yearXp);
  }
  // Open orders keep their progress and lose their clocks. One measured at a moment that is not done is taken off:
  // a new one comes in its place.
  for (const order of state.orders.open) {
    if (order.until === undefined) continue;
    delete order.until;
    report.timersCleared += 1;
  }
  report.measuredDropped = dropMeasuredOrders(state);
  state.orders.due = [];
  // A moment that went by unmet is a Big day now: it pays for what happened.
  for (const moment of state.rhythm.moments) {
    if (moment.met !== false) continue;
    moment.met = true;
    moment.share = 0;
    report.bigDays += 1;
  }
  return report;
}
