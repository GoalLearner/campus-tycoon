import type { GameState, Timer, TimerKind } from './types';

/**
 * Timers are kept sorted by (due, seq), so the next one due is always first
 * and timers due on the same tick fire in the order they were set.
 */

export function addTimer(state: GameState, due: number, kind: TimerKind, ref: number): void {
  const timer: Timer = { due, seq: state.timerSeq, kind, ref };
  state.timerSeq += 1;
  const list = state.timers;
  // Binary search for the insertion point. A new timer has the highest seq,
  // so it goes after every timer with the same due tick.
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.due <= due) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, timer);
}

/** Remove and return every timer due at or before this tick, in firing order. */
export function popDue(state: GameState, tick: number): Timer[] {
  const list = state.timers;
  let n = 0;
  while (n < list.length && list[n]!.due <= tick) n += 1;
  return n === 0 ? [] : list.splice(0, n);
}

/** Drop every timer of one kind that points at one thing. */
export function cancelTimers(state: GameState, kind: TimerKind, ref: number): void {
  state.timers = state.timers.filter((t) => !(t.kind === kind && t.ref === ref));
}
