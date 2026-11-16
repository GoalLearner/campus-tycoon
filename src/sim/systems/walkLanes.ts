import type { Cell } from '../types';
import { isPathKind } from '../selectors';

/**
 * Bike lanes painted on the walks (DESIGN.md 74, the owner's "I wish there was bike paths everywhere they're walking
 * especially on the main campus path"). A lane is paint on a footpath: to everything but riders, the walkers keeping
 * beside it and the map, the cell is a footpath as it was.
 */

/**
 * Whether a game saved before painted lanes gets a lane on every walk when it is opened (the one-time upgrade of save
 * version 36). Open: the owner has not said. Off, so a save keeps the campus its player built, until he does.
 */
export const PAINT_SAVED_WALKS = false;

/**
 * Paints a lane on every walk of a map: every cell of footpath, but in a square of paving (a plaza, a forecourt) only
 * where a walk passes straight through it, four cells or more in a line. Each is the campus's own (paid for at -1, so
 * clearing it gives nothing back). Returns how many it painted.
 */
export function paintWalks(map: { width: number; height: number; cells: Cell[] }): number {
  const { width, height, cells } = map;
  const paved = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && isPathKind(cells[y * width + x]!.kind);
  let painted = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y * width + x]!;
      if (cell.kind !== 'path' || cell.lane !== undefined) continue;
      let plaza = false;
      for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
        if (paved(x + ox, y + oy) && paved(x + ox + 1, y + oy) && paved(x + ox, y + oy + 1) && paved(x + ox + 1, y + oy + 1)) plaza = true;
      }
      if (plaza && runThrough(paved, x, y) < WALK_THROUGH) continue;
      cell.lane = -1;
      painted += 1;
    }
  }
  return painted;
}

/** A walk through a square of paving is painted when it runs this many cells or more in a straight line. */
const WALK_THROUGH = 4;

/** The longest straight run of paving through a cell, along either axis. */
function runThrough(paved: (x: number, y: number) => boolean, x: number, y: number): number {
  let best = 0;
  for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    let n = 1;
    for (let k = 1; paved(x + dx * k, y + dy * k); k++) n += 1;
    for (let k = 1; paved(x - dx * k, y - dy * k); k++) n += 1;
    best = Math.max(best, n);
  }
  return best;
}
