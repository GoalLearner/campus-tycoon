import { advance, applyAction, newGame, rowBetween, STARTER, type GameState, type PlacedType, type Point, type Tool } from '../sim';
import { clock } from './clock';

/**
 * Dev builds only: campuses for checking, by eye, the people who use the
 * campus and the town beside it. Loaded by devtools.ts, never shipped.
 */

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells, variant: 0 });
  return result.ok ? result.state : state;
}

function place(state: GameState, building: PlacedType, x: number, y: number): GameState {
  const result = applyAction(state, { type: 'place', building, x, y });
  return result.ok ? result.state : state;
}

/**
 * Recreation in use, on one screen. `?demo=play`.
 *
 * - West: dorms with two courts side by side. They share the players, so both
 *   have a game on and nobody waits.
 * - East: as many dorms with one court. The same players, half the room: a
 *   full court and a line beside it.
 * - South: dorms around a track, a recreation field and a pool.
 *
 * Joined to the town by its walk, with a car park and a road to College Avenue.
 */
export function playCampus(students = 1500): GameState {
  const now = clock.now();
  const started = now - 50 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 9_000_000;
  // West: six dorms on the north walk, and two courts between the walks.
  state = paint(state, 'housing', [[8, 13], [9, 13], [13, 13]]);
  state = place(state, 'courts', 9, 15);
  state = place(state, 'courts', 11, 15);
  // East: six dorms on a walk of their own, and one court.
  state = paint(state, 'path', rowBetween([24, 14], [30, 14]));
  state = paint(state, 'housing', rowBetween([24, 13], [29, 13]));
  state = place(state, 'courts', 26, 15);
  // South: two rows of dorms with the track, the field and the pool between them.
  state = paint(state, 'path', [...rowBetween([13, 18], [13, 26]), ...rowBetween([3, 22], [12, 22]), ...rowBetween([3, 26], [12, 26])]);
  state = paint(state, 'housing', [...rowBetween([3, 21], [12, 21]), ...rowBetween([3, 25], [12, 25])]);
  state = place(state, 'track', 4, 23);
  state = place(state, 'field', 7, 23);
  state = place(state, 'pool', 10, 23);
  // Somewhere to sit beside the south walk.
  state = paint(state, 'bench', [[14, 20], [14, 24]]);
  state = paint(state, 'table', [[12, 23], [12, 24]]);
  // A car park with a road east to College Avenue.
  state = place(state, 'parking', 27, 20);
  state = paint(state, 'road', rowBetween([29, 20], [31, 20]));
  state = advance(state, started, now).state;
  if (students > 0) {
    state = structuredClone(state);
    const year = Math.round(students / 4);
    state.cohorts = [students - year * 3, year, year, year];
  }
  return state;
}

/**
 * Food and Academics on one screen, for play stop 4b. `?demo=food`.
 *
 * - West, by the dorms: a burger grill, a taco stand and a pizza place in a
 *   row, with picnic tables and bins in front of them. With the dining hall
 *   that is four kinds of food in reach of every dorm.
 * - East, by the lecture halls: the food court, the computer lab, the study
 *   center and the makerspace along a walk of their own.
 * - A smoothie bar beside a court, a convenience store, and a food truck.
 */
export function foodCampus(students = 1200): GameState {
  const now = clock.now();
  const started = now - 50 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 9_000_000;
  state = paint(state, 'housing', [[8, 13], [9, 13], [13, 13]]);
  // Three kinds of food in a row south of the north walk, and somewhere to eat it.
  state = place(state, 'burger', 5, 15);
  state = place(state, 'taco', 8, 15);
  state = place(state, 'pizza', 11, 15);
  // Tables between them, so the ground in front of each stays clear for its line.
  state = paint(state, 'table', [[7, 15], [10, 15], [13, 15], [7, 16]]);
  state = paint(state, 'bench', [[4, 15], [10, 16]]);
  state = paint(state, 'bin', [[4, 16], [13, 16]]);
  // The lecture halls get a walk of their own, with the food court and the three Academics buildings on it.
  state = paint(state, 'path', [[18, 18], ...rowBetween([18, 19], [28, 19])]);
  state = paint(state, 'academic', [[22, 18]]);
  state = place(state, 'foodcourt', 19, 20);
  state = place(state, 'computerLab', 22, 20);
  state = place(state, 'studyCenter', 25, 20);
  state = place(state, 'makerspace', 23, 18);
  state = paint(state, 'table', [[21, 20], [21, 21]]);
  state = paint(state, 'bin', [[18, 20], [24, 20]]);
  // A smoothie bar beside a court, a convenience store by the dorms, and a food truck by the far lecture halls.
  state = place(state, 'courts', 6, 11);
  state = place(state, 'smoothie', 8, 12);
  state = place(state, 'convenience', 13, 12);
  state = place(state, 'truck', 26, 18);
  state = paint(state, 'bin', [[8, 11], [14, 12], [27, 18]]);
  // A road in from College Avenue along the south side of the food court, so deliveries can pull up at it.
  state = paint(state, 'road', rowBetween([19, 22], [31, 22]));
  // A Facilities Yard with hands enough for all of it.
  state = place(state, 'yard', 15, 11);
  const yard = state.map.placed.find((placed) => placed?.type === 'yard');
  if (yard) {
    const hired = applyAction(state, { type: 'staff', yard: yard.id, workers: 4 });
    if (hired.ok) state = hired.state;
  }
  state = advance(state, started, now).state;
  if (students > 0) {
    state = structuredClone(state);
    const year = Math.round(students / 4);
    state.cohorts = [students - year * 3, year, year, year];
  }
  return state;
}

/**
 * A campus the town cannot get into: no walk to College Avenue and no parking.
 * `?demo=unjoined`. The map says so at its edge.
 */
export function unjoinedCampus(): GameState {
  const now = clock.now();
  const started = now - 30 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  const link = STARTER.townLink;
  state = paint(state, 'clear', rowBetween([link.x0, link.y], [link.x1, link.y]));
  return advance(state, started, now).state;
}
