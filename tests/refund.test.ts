import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  buildingAt,
  COST,
  fedAt,
  FIRST_INTAKE_TICK,
  nearestSpot,
  parseSave,
  PLACED,
  previewPaint,
  REFUND_SHARE,
  SAVE_VERSION,
  serialize,
  STARTER,
  type GameState,
  type PlacedType,
  type Point,
  type Tool,
} from '../src/sim';
import { freshGame, MIN, T0 } from './helpers';

function place(state: GameState, building: PlacedType, x: number, y: number): GameState {
  const result = applyAction(state, { type: 'place', building, x, y });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const later = (state: GameState, minutes: number): GameState =>
  advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + minutes * MIN).state;

/** Cash a clear would bring back right now. */
const back = (state: GameState, cells: Point[]): number => previewPaint(state, 'clear', cells).refund;

describe('refunds', () => {
  it('gives the whole price back for at least a minute, then half', () => {
    const start = freshGame();
    const built = place(start, 'gym', 3, 3);
    expect(start.money.cash - built.money.cash).toBe(PLACED.gym.cost);

    // Straight away, and a minute on: an undo.
    expect(paint(built, 'clear', [[3, 3]]).money.cash).toBe(start.money.cash);
    expect(previewPaint(later(built, 1), 'clear', [[3, 3]])).toMatchObject({ refund: PLACED.gym.cost, undo: true, buildings: ['gym'] });

    // After that, half.
    const old = later(built, 3);
    expect(previewPaint(old, 'clear', [[3, 3]])).toMatchObject({ refund: PLACED.gym.cost * REFUND_SHARE, undo: false });
    const cleared = paint(old, 'clear', [[4, 3]]);
    expect(cleared.money.cash - old.money.cash).toBeCloseTo(PLACED.gym.cost * REFUND_SHARE, 0);
  });

  it('counts a building once however many of its cells are cleared', () => {
    const built = later(place(freshGame(), 'library', 3, 3), 5);
    expect(back(built, [[3, 3], [4, 3], [3, 4], [4, 4]])).toBe(PLACED.library.cost * REFUND_SHARE);
  });

  it('treats paths, quads, trees and zoned lots the same way', () => {
    let state = freshGame();
    state = paint(state, 'path', [[3, 20]]);
    state = paint(state, 'quad', [[4, 20]]);
    state = paint(state, 'tree', [[5, 20]]);
    state = paint(state, 'housing', [[3, 21]]);
    const all: Point[] = [[3, 20], [4, 20], [5, 20], [3, 21]];
    const price = COST.path + COST.quad + COST.tree + COST.zoneLot;
    expect(previewPaint(state, 'clear', all)).toMatchObject({ refund: price, undo: true });
    expect(back(later(state, 4), all)).toBe(price * REFUND_SHARE);
  });

  it('gives nothing back for what the campus began with', () => {
    const state = later(freshGame(), 5);
    const spine = STARTER.spines[0]!;
    const quad = STARTER.quad;
    const dorm = STARTER.buildings[0]!;
    const dining = STARTER.placed[0]!;
    expect(back(state, [[spine.x0, spine.y], [quad.x, quad.y], [dorm.x, dorm.y], [dining.x, dining.y]])).toBe(0);
    const before = state.money.cash;
    expect(paint(state, 'clear', [[spine.x0, spine.y]]).money.cash).toBe(before);
  });

  it('stops a build that leaned on what was cleared, so an undo cannot leave growth behind', () => {
    // A dorm at its first stage, fed, held back only by desirability.
    let state = paint(freshGame(), 'housing', [[8, 13]]);
    state = later(state, 5);
    expect(buildingAt(state.map, 8, 13)?.stage).toBe(1);
    // A quad starts it growing. Taking the quad straight back stops the build.
    const withQuad = paint(state, 'quad', [[8, 12], [9, 12]]);
    expect(buildingAt(withQuad.map, 8, 13)?.rebuild).not.toBeNull();
    const undone = paint(withQuad, 'clear', [[8, 12], [9, 12]]);
    expect(undone.money.cash).toBe(state.money.cash);
    expect(buildingAt(undone.map, 8, 13)?.rebuild).toBeNull();
    expect(buildingAt(undone.map, 8, 13)?.stage).toBe(1);
    expect(later(undone, 30).map.buildings.find((b) => b?.x === 8 && b.y === 13)?.stage).toBe(1);
  });

  it('ends the undo early when a class arrives while the thing stands', () => {
    // One minute before the founding class moves in.
    let state = later(freshGame(), FIRST_INTAKE_TICK - 1);
    state = place(state, 'gym', 3, 3);
    expect(previewPaint(state, 'clear', [[3, 3]]).undo).toBe(true);
    // The class arrives the next minute. The gym was counted, so it is no longer a free undo.
    const after = later(state, 1);
    expect(after.admissions.lastIntake).not.toBeNull();
    expect(previewPaint(after, 'clear', [[3, 3]])).toMatchObject({ undo: false, refund: PLACED.gym.cost * REFUND_SHARE });
  });
});

describe('the dining shortcut', () => {
  it('finds free ground from which a dining hall would reach the dorm', () => {
    let state = paint(freshGame(), 'housing', [[22, 13]]);
    expect(fedAt(state.map, 22, 13)).toBe(false);
    const spot = nearestSpot(state, 'dining', 22, 13)!;
    expect(spot).not.toBeNull();
    state = place(state, 'dining', spot.x, spot.y);
    expect(fedAt(state.map, 22, 13)).toBe(true);
  });
});

describe('upgrading a version 3 save', () => {
  const file = join(__dirname, 'fixtures', 'save-v3.json');

  it('marks what the campus began with as never paid for, and the rest as paid long ago', () => {
    if (!existsSync(file)) {
      // Made once from a current game: a version 3 save is the same without the paid-for ticks.
      let state = freshGame(11);
      state = paint(state, 'path', [[3, 20]]);
      state = place(state, 'coffee', 3, 21);
      state = advance(state, T0, T0 + 30 * MIN).state;
      const raw = JSON.parse(serialize(state, T0 + 30 * MIN)) as { v: number; state: GameState };
      raw.v = 3;
      (raw.state as unknown as { version: number }).version = 3;
      for (const cell of raw.state.map.cells) delete (cell as Partial<typeof cell>).builtTick;
      for (const placed of raw.state.map.placed) if (placed) delete (placed as Partial<typeof placed>).builtTick;
      writeFileSync(file, JSON.stringify(raw));
    }
    const loaded = parseSave(readFileSync(file, 'utf8'));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(3);
    const state = loaded.state;
    expect(state.version).toBe(SAVE_VERSION);
    const at = (x: number, y: number) => state.map.cells[y * state.map.width + x]!;
    const spine = STARTER.spines[0]!;
    expect(at(spine.x0, spine.y).builtTick).toBe(-1);
    expect(at(STARTER.quad.x, STARTER.quad.y).builtTick).toBe(-1);
    expect(at(3, 20).builtTick).toBe(0);
    expect(at(0, 0).builtTick).toBe(-1);
    expect(state.map.placed.find((p) => p?.type === 'dining')!.builtTick).toBe(-1);
    expect(state.map.placed.find((p) => p?.type === 'coffee')!.builtTick).toBe(0);
    // The player's own coffee stand refunds half. The starter dining hall refunds nothing.
    expect(back(state, [[3, 21]])).toBe(PLACED.coffee.cost * REFUND_SHARE);
    expect(back(state, [[STARTER.placed[0]!.x, STARTER.placed[0]!.y]])).toBe(0);
  });
});
