import { describe, expect, it } from 'vitest';
import {
  advance,
  buildings,
  MAX_CATCHUP_TICKS,
  TICK_MS,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  type GameState,
} from '../src/sim';
import { startBuild } from '../src/sim/systems/construction';
import { markRatesDirty } from '../src/sim/systems/money';
import { advanceInSteps, badNumbers, DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/** A game with students enrolled and several builds under way, so plenty happens. */
function busyGame(seed = 42): GameState {
  const state = freshGame(seed);
  state.cohorts = [120, 100, 80, 60];
  markRatesDirty(state);
  const all = buildings(state.map);
  all.forEach((b, i) => {
    state.clock.tick += i; // stagger the start ticks so timers land on different minutes
    startBuild(state, b, 2);
  });
  state.clock.tick = 0;
  return state;
}

describe('advance: ticks', () => {
  it('does nothing before the first tick is due', () => {
    const state = freshGame();
    const result = advance(state, T0, T0 + MIN - 1);
    expect(result.info.ticks).toBe(0);
    expect(result.state.clock.tick).toBe(0);
    expect(result.state.clock.lastSimulatedAt).toBe(T0 + MIN - 1);
    expect(result.log).toEqual([]);
  });

  it('runs exactly one tick per real minute', () => {
    const state = freshGame();
    expect(advance(state, T0, T0 + MIN).state.clock.tick).toBe(1);
    expect(advance(state, T0, T0 + 10 * MIN + 59_999).state.clock.tick).toBe(10);
    expect(advance(state, T0, T0 + DAY).state.clock.tick).toBe(TICKS_PER_DAY);
  });

  it('never changes the state it was given', () => {
    const state = busyGame();
    const before = JSON.stringify(state);
    advance(state, T0, T0 + 2 * DAY);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('returns the same object when no time has passed', () => {
    const state = freshGame();
    expect(advance(state, T0, T0).state).toBe(state);
  });
});

describe('advance: determinism', () => {
  it('gives identical state and log in one call or a thousand', () => {
    for (const seed of [1, 42, 9001]) {
      const start = busyGame(seed);
      const end = T0 + 3 * DAY;
      const once = advance(start, T0, end);
      const many = advanceInSteps(start, end, 1000, seed);
      expect(many.state).toEqual(once.state);
      expect(many.log).toEqual(once.log);
      expect(once.log.length).toBeGreaterThan(0);
    }
    // Three thousand advances, each copying the whole state. This checks sameness, not speed:
    // the speed of catch-up is held by the simulate script.
  }, 30_000);

  it('gives the same result for the same seed and a different one for another', () => {
    const a = advance(busyGame(5), T0, T0 + DAY).state;
    const b = advance(busyGame(5), T0, T0 + DAY).state;
    const c = advance(busyGame(6), T0, T0 + DAY).state;
    expect(a).toEqual(b);
    expect(a.rng).not.toEqual(c.rng);
  });

  it('ignores a stale `from` and trusts the state clock', () => {
    const start = busyGame();
    const good = advance(start, T0, T0 + 5 * HOUR);
    const stale = advance(start, T0 - 3 * DAY, T0 + 5 * HOUR);
    expect(stale.state).toEqual(good.state);
  });
});

describe('advance: the clock guard', () => {
  it('does not advance and does not crash when the clock goes backward', () => {
    const later = advance(busyGame(), T0, T0 + 6 * HOUR).state;
    const result = advance(later, later.clock.lastSimulatedAt, T0 + 1 * HOUR);
    expect(result.info.clockWentBack).toBe(true);
    expect(result.info.ticks).toBe(0);
    expect(result.state).toBe(later);
    expect(result.log).toEqual([]);
  });

  it('carries on normally once the clock passes the last simulated moment again', () => {
    const later = advance(busyGame(), T0, T0 + 6 * HOUR).state;
    const back = advance(later, later.clock.lastSimulatedAt, T0 + HOUR).state;
    const resumed = advance(back, back.clock.lastSimulatedAt, T0 + 7 * HOUR).state;
    const straight = advance(busyGame(), T0, T0 + 7 * HOUR).state;
    expect(resumed).toEqual(straight);
  });
});

describe('advance: the 30-day cap', () => {
  it('simulates up to 30 days in full', () => {
    const result = advance(busyGame(), T0, T0 + 30 * DAY);
    expect(result.info.ticks).toBe(MAX_CATCHUP_TICKS);
    expect(result.info.weeksSkipped).toBe(0);
  });

  it('drops whole weeks from a longer absence and says so', () => {
    const result = advance(busyGame(), T0, T0 + 45 * DAY);
    // 45 days is 15 over the cap, so three whole weeks are dropped and 24 days run.
    expect(result.info.weeksSkipped).toBe(3);
    expect(result.info.ticks).toBe(24 * TICKS_PER_DAY);
    expect(result.state.clock.weeksSkipped).toBe(3);
    expect(result.state.clock.lastSimulatedAt).toBe(T0 + 45 * DAY);
    expect(result.log[0]?.kind).toBe('paused');
  });

  it('keeps the weekly rhythm aligned with real time after a skip', () => {
    const state = advance(busyGame(), T0, T0 + 45 * DAY).state;
    // The next tick is still due exactly one minute after the last whole minute.
    expect(state.clock.nextTickAt).toBe(T0 + 45 * DAY + TICK_MS);
    // Skipped ticks are whole weeks, so the tick count stays on the same weekday and minute.
    expect((45 * TICKS_PER_DAY - state.clock.tick) % TICKS_PER_YEAR).toBe(0);
  });
});

describe('advance: catch-up', () => {
  it('runs 30 days in under a second', () => {
    const start = busyGame();
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      advance(start, T0, T0 + 30 * DAY);
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThan(1000);
  });

  it('leaves no broken numbers after a long run', () => {
    const state = advance(busyGame(), T0, T0 + 30 * DAY).state;
    expect(badNumbers(state)).toEqual([]);
  });

  it('finishes every build that came due and keeps the timer list sorted', () => {
    const state = advance(busyGame(), T0, T0 + DAY).state;
    // Nothing is left to build. The timers that remain are the season's kickoffs.
    expect(state.timers.filter((timer) => timer.kind === 'buildDone')).toEqual([]);
    for (let i = 1; i < state.timers.length; i++) expect(state.timers[i]!.due).toBeGreaterThanOrEqual(state.timers[i - 1]!.due);
    for (const b of buildings(state.map)) {
      expect(b.stage).toBe(2);
      expect(b.rebuild).toBeNull();
    }
  });
});
