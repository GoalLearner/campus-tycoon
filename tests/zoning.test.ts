import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  buildingAt,
  cellAt,
  COST,
  desirabilityHint,
  FOUNDING_CLASS,
  lotStatus,
  openCapacity,
  pendingCapacity,
  previewPaint,
  rowBetween,
  shortage,
  stageSpec,
  START_CASH,
  type GameState,
  type Point,
  type Tool,
} from '../src/sim';
import { advanceInSteps, freshGame, HOUR, MIN, T0 } from './helpers';

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Cells on the row just above the north spine. */
const northRow = (x0: number, x1: number): Point[] => rowBetween([x0, 13], [x1, 13]);

/** Four empty cells that touch the north spine, east of the starter dorms. */
const BESIDE_PATH = northRow(18, 21);

function rich(state: GameState): GameState {
  state.money.cash = 5_000_000;
  return state;
}

describe('the drag gesture', () => {
  it('covers a straight row or column', () => {
    expect(rowBetween([2, 5], [5, 5])).toEqual([[2, 5], [3, 5], [4, 5], [5, 5]]);
    expect(rowBetween([5, 5], [2, 5])).toEqual([[5, 5], [4, 5], [3, 5], [2, 5]]);
    expect(rowBetween([3, 1], [3, 3])).toEqual([[3, 1], [3, 2], [3, 3]]);
    expect(rowBetween([3, 3], [3, 3])).toEqual([[3, 3]]);
    // A slanted drag snaps to its longer side.
    expect(rowBetween([0, 0], [4, 1])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  });

  it('previews count and cost before anything is spent', () => {
    const state = freshGame();
    const preview = previewPaint(state, 'academic', northRow(4, 9));
    // (8,13) and (9,13) are empty, as are 4 to 7. None of the six is taken.
    expect(preview.cells.length).toBe(6);
    expect(preview.cost).toBe(6 * COST.zoneLot);
    expect(preview.affordable).toBe(true);
    expect(state.money.cash).toBe(START_CASH);
  });

  it('skips cells that cannot take the tool and never counts a cell twice', () => {
    const state = freshGame();
    // x = 10, 11, 12 on row 13 already hold the starter dorms.
    const preview = previewPaint(state, 'housing', [...northRow(8, 12), [8, 13], [-1, 13], [99, 99]]);
    expect(preview.cells).toEqual([[8, 13], [9, 13]]);
    expect(preview.skipped).toBe(5);
  });

  it('refuses a paint the campus cannot afford and changes nothing', () => {
    const state = freshGame();
    state.money.cash = COST.zoneLot * 2 - 1;
    const result = applyAction(state, { type: 'paint', tool: 'housing', cells: northRow(8, 9) });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it('says so when there is nothing to do', () => {
    const state = freshGame();
    expect(applyAction(state, { type: 'paint', tool: 'path', cells: [[14, 14]] }).ok).toBe(false);
    expect(applyAction(state, { type: 'paint', tool: 'clear', cells: [[0, 0]] }).ok).toBe(false);
  });
});

describe('zoning', () => {
  it('charges for the lots and never mutates the state it was given', () => {
    const state = freshGame();
    const before = JSON.stringify(state);
    const next = paint(state, 'academic', BESIDE_PATH);
    expect(next.money.cash).toBe(START_CASH - 4 * COST.zoneLot);
    expect(cellAt(next.map, 18, 13)).toMatchObject({ kind: 'lot', zone: 'academic' });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('starts building at once when the founding class needs the room', () => {
    const next = paint(freshGame(), 'academic', BESIDE_PATH);
    for (const [x, y] of BESIDE_PATH) {
      expect(lotStatus(next, x, y)?.kind).toBe('building');
      expect(buildingAt(next.map, x, y)?.rebuild?.toStage).toBe(1);
    }
  });

  it('opens a new building after its build time', () => {
    const zoned = paint(freshGame(), 'academic', BESIDE_PATH);
    const buildTicks = stageSpec('academic', 1).buildTicks;
    const early = advance(zoned, T0, T0 + (buildTicks - 1) * MIN).state;
    for (const [x, y] of BESIDE_PATH) expect(buildingAt(early.map, x, y)?.stage).toBe(0);
    const done = advance(zoned, T0, T0 + buildTicks * MIN);
    for (const [x, y] of BESIDE_PATH) expect(buildingAt(done.state.map, x, y)?.stage).toBe(1);
    expect(done.log.filter((e) => e.kind === 'built' && e.data?.stage === 1).length).toBe(4);
  });

  it('never starts more building than the forecast calls for', () => {
    const state = rich(freshGame());
    const wantedSeats = FOUNDING_CLASS; // one seat per student
    const short = shortage(state, 'academic');
    expect(short).toBe(wantedSeats - openCapacity(state, 'academic'));

    // Zone far more Academic lots than the founding class needs, all beside the two spines.
    const many: Point[] = [...rowBetween([0, 13], [9, 13]), ...rowBetween([0, 18], [18, 18]), ...rowBetween([22, 18], [31, 18])];
    let next = state;
    // Lots must touch a path, so extend both spines to the map edges first.
    next = paint(next, 'path', [...rowBetween([0, 14], [7, 14]), ...rowBetween([0, 17], [7, 17]), ...rowBetween([24, 17], [31, 17])]);
    next = paint(next, 'academic', many);

    const pending = pendingCapacity(next, 'academic');
    const perLot = stageSpec('academic', 1).capacity;
    expect(pending).toBeGreaterThanOrEqual(short);
    expect(pending).toBeLessThan(short + perLot);
    expect(shortage(next, 'academic')).toBeLessThanOrEqual(0);
  });

  it('leaves a lot with no path beside it waiting, and says why', () => {
    const next = paint(freshGame(), 'academic', [[2, 2]]);
    const status = lotStatus(next, 2, 2);
    expect(status).toMatchObject({ kind: 'stalled', cause: 'noPath' });
    expect(buildingAt(next.map, 2, 2)).toBeNull();
  });
});

describe('desirability', () => {
  it('counts the walk to class along paths, in minutes', () => {
    const next = paint(freshGame(), 'housing', [[8, 13]]);
    // From (8,13): down to the spine, east to the ring, around it, east again to the lecture halls.
    expect(next.map.walkMinutes[13 * next.map.width + 8]).toBe(8);
  });

  it('lifts lots near a quad and not lots far from one', () => {
    const state = freshGame();
    const near = state.map.score[13 * state.map.width + 12]!; // starter dorm two cells from the quad
    const far = state.map.score[13 * state.map.width + 10]!; // starter dorm out of its reach
    expect(near).toBeGreaterThan(far);
    expect(far).toBe(30);
  });

  it('stalls a lot at stage one for low desirability, then grows it once a quad is placed', () => {
    // A dorm out of the quad's reach reaches stage 1 but not stage 2.
    let state = paint(freshGame(), 'housing', [[8, 13]]);
    // Fed by a coffee stand, so dining is not what holds it back.
    const fed = applyAction(state, { type: 'place', building: 'coffee', x: 7, y: 13 });
    if (!fed.ok) throw new Error(fed.error);
    state = advance(fed.state, T0, T0 + 5 * MIN).state;
    expect(buildingAt(state.map, 8, 13)?.stage).toBe(1);

    const stalled = lotStatus(state, 8, 13);
    expect(stalled).toMatchObject({ kind: 'stalled', cause: 'lowDesirability', nextStage: 2 });
    expect(desirabilityHint(state, 8, 13)).toMatch(/quad/i);

    // The fix the hint names: a quad next door.
    const now = state.clock.lastSimulatedAt;
    state = paint(state, 'quad', [[8, 12], [9, 12]]);
    expect(lotStatus(state, 8, 13)?.kind).toBe('building');
    state = advance(state, now, now + 15 * MIN).state;
    expect(buildingAt(state.map, 8, 13)?.stage).toBe(2);
  });

  it('gives a dorm with no route to class nothing to grow on', () => {
    // An island: a path stub and a lot, far from everything.
    let state = paint(freshGame(), 'path', [[2, 28], [3, 28]]);
    state = paint(state, 'housing', [[2, 27]]);
    expect(state.map.walkMinutes[27 * state.map.width + 2]).toBe(-1);
    expect(lotStatus(state, 2, 27)).toMatchObject({ kind: 'stalled', cause: 'lowDesirability' });
    expect(desirabilityHint(state, 2, 27)).toMatch(/no path leads/i);
  });
});

describe('clearing', () => {
  it('removes a building, its timer and its capacity', () => {
    let state = paint(freshGame(), 'academic', BESIDE_PATH);
    const timers = state.timers.length;
    expect(buildingAt(state.map, 18, 13)?.rebuild).not.toBeNull();
    state = paint(state, 'clear', [[18, 13]]);
    expect(cellAt(state.map, 18, 13)).toMatchObject({ kind: 'empty', zone: null, buildingId: null });
    expect(state.timers.length).toBe(timers - 1);

    const seats = openCapacity(state, 'academic');
    state = paint(state, 'clear', [[19, 18]]); // a starter lecture hall
    expect(openCapacity(state, 'academic')).toBe(seats - stageSpec('academic', 1).capacity);
  });

  it('lets the cleared cell be zoned again', () => {
    let state = paint(freshGame(), 'clear', [[10, 13]]);
    state = paint(state, 'academic', [[10, 13]]);
    expect(cellAt(state.map, 10, 13)?.zone).toBe('academic');
  });
});

describe('determinism with player actions', () => {
  it('gives the same campus whether time between actions passes in one step or many', () => {
    const script: Array<{ at: number; tool: Tool; cells: Point[] }> = [
      { at: 2 * MIN, tool: 'academic', cells: northRow(18, 23) },
      { at: 6 * MIN, tool: 'housing', cells: rowBetween([8, 18], [14, 18]) },
      { at: 40 * MIN, tool: 'quad', cells: [[19, 12], [20, 12]] },
      { at: 3 * HOUR, tool: 'clear', cells: [[18, 13]] },
      { at: 5 * HOUR, tool: 'path', cells: rowBetween([24, 14], [28, 14]) },
      { at: 5 * HOUR + MIN, tool: 'academic', cells: rowBetween([24, 13], [28, 13]) },
    ];
    const end = T0 + 2 * 24 * HOUR;

    const run = (steps: number): GameState => {
      let state = freshGame(77);
      for (const step of script) {
        state = advanceInSteps(state, T0 + step.at, steps, steps).state;
        state = paint(state, step.tool, step.cells);
      }
      return advanceInSteps(state, end, steps * 10, steps).state;
    };

    expect(run(37)).toEqual(run(1));
  });
});

describe('trees', () => {
  it('plant on empty cells, cost their price and remember their kind', () => {
    const start = rich(freshGame());
    const result = applyAction(start, { type: 'paint', tool: 'tree', cells: northRow(18, 20), variant: 3 });
    if (!result.ok) throw new Error(result.error);
    expect(result.cost).toBe(3 * COST.tree);
    expect(cellAt(result.state.map, 19, 13)).toMatchObject({ kind: 'tree', variant: 3 });
    // A tree cannot go where something already stands.
    expect(previewPaint(result.state, 'tree', northRow(18, 20)).cells.length).toBe(0);
  });

  it('fall back to the first kind when the kind is not one the game knows', () => {
    const state = paint(rich(freshGame()), 'tree', northRow(18, 18));
    expect(cellAt(state.map, 18, 13)?.variant).toBe(0);
    const odd = applyAction(rich(freshGame()), { type: 'paint', tool: 'tree', cells: northRow(18, 18), variant: 99 });
    if (!odd.ok) throw new Error(odd.error);
    expect(cellAt(odd.state.map, 18, 13)?.variant).toBe(0);
  });

  it('lift nearby lots, by less than a quad does', () => {
    const lot: Point = [21, 13];
    const scoreAt = (state: GameState): number => state.map.score[lot[1] * state.map.width + lot[0]]!;
    const bare = paint(rich(freshGame()), 'housing', [lot]);
    const withTree = paint(paint(rich(freshGame()), 'tree', [[22, 13]]), 'housing', [lot]);
    const withQuad = paint(paint(rich(freshGame()), 'quad', [[22, 13]]), 'housing', [lot]);
    expect(scoreAt(withTree)).toBeGreaterThan(scoreAt(bare));
    expect(scoreAt(withQuad)).toBeGreaterThan(scoreAt(withTree));
  });

  it('clear away like anything else', () => {
    const planted = paint(rich(freshGame()), 'tree', northRow(18, 18));
    const cleared = paint(planted, 'clear', northRow(18, 18));
    expect(cellAt(cleared.map, 18, 13)).toMatchObject({ kind: 'empty', variant: 0 });
  });
});
