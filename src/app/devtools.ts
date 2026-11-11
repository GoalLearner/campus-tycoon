import { advance, applyAction, newGame, rowBetween, type GameState, type Point, type Tool } from '../sim';
import { clock } from './clock';
import { session } from './session';
import { store } from './store';

/**
 * Dev builds only. Never shipped: main.ts loads this file behind a dev check.
 *
 * - `window.__campus` exposes the store, session and clock to the console.
 * - Opening the page with `?demo` shows a small tended campus that is about an
 *   hour old, without touching the saved game. It is what the screenshot
 *   script photographs.
 */

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  return result.ok ? result.state : state;
}

/** A campus a careful player might have after their first session. */
function demoCampus(): GameState {
  const now = clock.now();
  const started = now - 75 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 900_000;

  // Session one, before move-in: a cross street, two quads, and rows of lots.
  state = paint(state, 'path', [...rowBetween([19, 8], [19, 13]), ...rowBetween([12, 18], [12, 23])]);
  state = paint(state, 'quad', [[21, 12], [22, 12], [9, 19], [10, 19], [16, 12]]);
  state = paint(state, 'academic', [...rowBetween([20, 13], [23, 13]), ...rowBetween([20, 9], [20, 11]), ...rowBetween([15, 13], [17, 13])]);
  state = paint(state, 'housing', [...rowBetween([8, 18], [11, 18]), ...rowBetween([13, 19], [13, 22]), ...rowBetween([13, 18], [16, 18])]);
  state = advance(state, started, started + 40 * 60_000).state;

  // A second visit: one more row, left without green space so it stalls at stage one.
  state = paint(state, 'housing', rowBetween([4, 13], [9, 13]));
  state = paint(state, 'path', rowBetween([4, 14], [7, 14]));
  return advance(state, state.clock.lastSimulatedAt, now).state;
}

export function installDevTools(): void {
  (window as unknown as Record<string, unknown>).__campus = { store, session, clock };
  if (new URLSearchParams(window.location.search).has('demo')) {
    store.adopt(demoCampus(), { ephemeral: true });
  }
}
