/**
 * A mature model campus for the tests (DESIGN.md 79): the founding the app does, then the once-a-day test player for
 * two real weeks (two game years), the social web read each game week as the app reads it. Its Main Character, big
 * builds, traditions, chapters, labs, levels, Gold Seals and orders are those of a campus played as the owner plays.
 * Writes tests/fixtures/save-v<version>-mature-model.json.
 *
 *   npx tsx scripts/make-mature-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { advance, applyAction, newGame, SAVE_VERSION, serialize, TICK_MS, type GameState } from '../src/sim';
import { friendsEffectsOf } from '../src/sim/systems/friends';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { takeTurn } from './bots';

const T0 = Date.UTC(2026, 9, 5, 15, 0, 0);
const DAY_MS = 24 * 60 * TICK_MS;
const DAYS = 14;
const SEED = 20261116;

function readWeb(state: GameState): GameState {
  const week = webWeekOf(state);
  if (state.web.effects && state.web.effects.week === week) return state;
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, week);
  const effects = friendsEffectsOf(web);
  if (!effects) return state;
  const done = applyAction(state, { type: 'socialEffects', effects: { ...effects, week } });
  return done.ok ? done.state : state;
}

let state = newGame({ seed: SEED, name: 'Test University', now: T0, campus: 'model' });
state = takeTurn(state, 'daily').state;
let at = T0;
for (let day = 0; day < DAYS; day++) {
  state = advance(state, at, at + DAY_MS).state;
  at += DAY_MS;
  state = readWeb(state);
  state = takeTurn(state, 'daily').state;
}
const path = new URL(`../tests/fixtures/save-v${SAVE_VERSION}-mature-model.json`, import.meta.url);
writeFileSync(path, serialize(state, at));
console.log(`wrote ${path.pathname}: day ${DAYS}, level ${state.daily.level}, ${state.daily.seals} Seals, cash ${Math.round(state.money.cash)}, MC ${state.story?.mc ? 'yes' : 'no'}`);
