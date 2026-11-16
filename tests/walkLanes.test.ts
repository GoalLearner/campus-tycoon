import { describe, expect, it } from 'vitest';
import { applyAction, newGame, PAINT_SAVED_WALKS, paintCost, paintWalks, parseSave, previewPaint, SAVE_VERSION, scaleOf, serialize, type Cell, type GameState, type Point } from '../src/sim';
import { ownedAt } from '../src/sim/systems/town';
import { MIGRATIONS } from '../src/sim/save';
import { laneCount, lanesShort } from '../src/app/wheels';

/**
 * Bike lanes painted on the walks (DESIGN.md 74, the owner's "I wish there was bike paths everywhere they're walking
 * especially on the main campus path"): paint on a footpath, a quarter of a path's price, on new games on every walk.
 * To everything but riders and the walkers keeping beside it, the cell is the footpath it was.
 */

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const small = (): GameState => newGame({ seed: 35, name: 'Test University', now: T0 });
const model = (): GameState => newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' });
const cellAt = (state: GameState, [x, y]: Point): Cell => state.map.cells[y * state.map.width + x]!;
const paint = (state: GameState, tool: 'lane' | 'laneClear' | 'path' | 'bike' | 'road' | 'clear', cells: Point[]): GameState => {
  const done = applyAction(state, { type: 'paint', tool, cells });
  if (!done.ok) throw new Error(done.error);
  return done.state;
};

/** A run of open ground the campus owns, `n` cells along a row, with open ground on both sides. */
function openRow(state: GameState, n: number): Point[] {
  const { width, height, cells } = state.map;
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x]!.kind === 'empty' && ownedAt(state.map, x, y);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 0; x + n <= width; x++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = open(x + k, y) && open(x + k, y - 1) && open(x + k, y + 1);
      if (ok) return Array.from({ length: n }, (_, k) => [x + k, y] as Point);
    }
  }
  throw new Error('no open row');
}

describe('the bike lane tool', () => {
  it('paints a lane on a footpath for a quarter of its price, and only on a footpath', () => {
    const start = small();
    const row = openRow(start, 4);
    const walk = paint(start, 'path', row.slice(0, 3));
    const cash = walk.money.cash;
    const paid = row.slice(0, 3).map((cell) => cellAt(walk, cell).builtTick);
    const painted = paint(walk, 'lane', row);
    // The fourth cell is open ground: nothing to paint there.
    expect(previewPaint(walk, 'lane', row).cells).toHaveLength(3);
    for (const cell of row.slice(0, 3)) {
      expect(cellAt(painted, cell).kind).toBe('path');
      expect(cellAt(painted, cell).lane).toBe(painted.clock.tick);
    }
    expect(cellAt(painted, row[3]!).lane).toBeUndefined();
    expect(paintCost('lane', 1) * 4).toBe(paintCost('path', 1));
    expect(cash - painted.money.cash).toBe(3 * paintCost('lane', scaleOf(start)));
    // The walk keeps when it was paid for, so clearing it later gives back what it would have.
    expect(row.slice(0, 3).map((cell) => cellAt(painted, cell).builtTick)).toEqual(paid);
    // A walk already painted takes no more.
    expect(previewPaint(painted, 'lane', row).cells).toHaveLength(0);
  });

  it('takes a lane off where a drag starts on one, the whole price back inside the undo minute', () => {
    const start = small();
    const row = openRow(start, 3);
    const painted = paint(paint(start, 'path', row), 'lane', row);
    const cash = painted.money.cash;
    const off = paint(painted, 'laneClear', row);
    for (const cell of row) {
      expect(cellAt(off, cell).kind).toBe('path');
      expect(cellAt(off, cell).lane).toBeUndefined();
    }
    expect(off.money.cash - cash).toBe(3 * paintCost('lane', scaleOf(start)));
    // Clearing the walk itself takes the lane with it, and gives back both.
    const cleared = paint(painted, 'clear', row);
    for (const cell of row) {
      expect(cellAt(cleared, cell).kind).toBe('empty');
      expect(cellAt(cleared, cell).lane).toBeUndefined();
    }
    expect(cleared.money.cash - cash).toBe(3 * (paintCost('path', scaleOf(start)) + paintCost('lane', scaleOf(start))));
  });

  it('loses its paint where the walk becomes a crossing', () => {
    const start = small();
    const row = openRow(start, 3);
    const painted = paint(paint(start, 'path', row), 'lane', row);
    const crossed = paint(painted, 'bike', [row[1]!]);
    expect(cellAt(crossed, row[1]!).kind).toBe('bikeCrossing');
    expect(cellAt(crossed, row[1]!).lane).toBeUndefined();
    expect(cellAt(crossed, row[0]!).lane).toBe(painted.clock.tick);
  });
});

describe('painted walks on the model campus', () => {
  it('counts a painted walk as a lane and still as a footpath, so a new game has bike lanes enough', () => {
    const state = model();
    const { paths, lanes } = laneCount(state);
    const painted = state.map.cells.filter((cell) => cell.kind === 'path' && cell.lane !== undefined).length;
    const bike = state.map.cells.filter((cell) => cell.kind === 'bike' || cell.kind === 'bikeCrossing').length;
    expect(lanes).toBe(painted + bike);
    expect(paths).toBe(state.map.cells.filter((cell) => cell.kind === 'path' || cell.kind === 'crossing').length);
    expect(lanesShort(state)).toBe(false);
  });

  it('paints every walk but the corners of a square of paving, and a walk straight through one', () => {
    // A row of walk through a square of paving three cells deep, and a square on its own.
    const width = 10;
    const height = 8;
    const cells: Cell[] = Array.from({ length: width * height }, () => ({ kind: 'empty', zone: null, buildingId: null, variant: 0, placedId: null, builtTick: -1 }));
    const pave = (x: number, y: number): void => {
      cells[y * width + x]!.kind = 'path';
    };
    for (let x = 0; x < 8; x++) pave(x, 2);
    pave(3, 1);
    pave(4, 1);
    pave(3, 3);
    pave(4, 3);
    pave(7, 5);
    pave(8, 5);
    pave(7, 6);
    pave(8, 6);
    const painted = paintWalks({ width, height, cells });
    const lane = (x: number, y: number): number | undefined => cells[y * width + x]!.lane;
    for (let x = 0; x < 8; x++) expect(lane(x, 2), `the walk at ${x}, 2`).toBe(-1);
    for (const [x, y] of [[3, 1], [4, 1], [3, 3], [4, 3], [7, 5], [8, 5], [7, 6], [8, 6]] as const) expect(lane(x, y), `${x}, ${y}`).toBeUndefined();
    expect(painted).toBe(8);
    // Painting again paints nothing more.
    expect(paintWalks({ width, height, cells })).toBe(0);
  });
});

describe('a game saved before painted lanes', () => {
  it('keeps its map exactly while the upgrade waits on the owner, and the upgrade would paint every walk', () => {
    expect(SAVE_VERSION).toBe(36);
    expect(PAINT_SAVED_WALKS).toBe(false);
    // A model campus as saved at version 35: no cell had a lane then.
    const old = model();
    for (const cell of old.map.cells) delete cell.lane;
    const file = JSON.parse(serialize(old, T0));
    file.v = 35;
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(35);
    expect(loaded.state.map.cells.filter((cell) => cell.lane !== undefined)).toHaveLength(0);
    expect(loaded.state.map.cells.map((cell) => cell.kind)).toEqual(old.map.cells.map((cell) => cell.kind));
    // With the switch on, the same upgrade paints the walks as a new game has them.
    const upgraded = structuredClone(old);
    const map = upgraded.map;
    expect(paintWalks({ width: map.width, height: map.height, cells: map.cells })).toBe(model().map.cells.filter((cell) => cell.lane !== undefined).length);
    expect(typeof MIGRATIONS[35]).toBe('function');
  });
});
