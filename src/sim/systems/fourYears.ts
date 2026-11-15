import { ON_CAMPUS_BY_YEAR } from '../config/fourYears';
import { headCount } from '../format';
import type { GameState, LogEntry } from '../types';

/**
 * Four years, R2 of the realism pass (DESIGN.md 66), as the simulation tells it. Who lives where is each student's own
 * draw against their class year's share (`studentHome`); the campus's beds and its places in town are counted as
 * before, so nothing here changes a number the balance reads.
 */

/**
 * Moving off campus (DESIGN.md 66.3): each fall, once the new class is in, the returning students who left the halls
 * for town, at the real pattern. Told in the paper; nothing is saved. Returns how many.
 */
export function tellMovingOut(state: GameState, log: LogEntry[]): number {
  let moved = 0;
  for (let classYear = 1; classYear < state.cohorts.length; classYear++) {
    moved += state.cohorts[classYear]! * Math.max(0, ON_CAMPUS_BY_YEAR[classYear - 1]! - ON_CAMPUS_BY_YEAR[classYear]!);
  }
  moved = Math.round(moved);
  if (moved > 0) {
    log.push({ tick: state.clock.tick, kind: 'housing', text: `About ${headCount(moved)} returning students moved off campus into town this fall, most of them juniors; nearly every first-year has a room in a hall.`, data: { moved } });
  }
  return moved;
}
