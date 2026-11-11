import {
  PLACED,
  STORE_INCOME_PER_PASSER,
  STORE_PASSING_SHARE,
  STORE_REACH_CELLS,
  type PlacedFamily,
} from '../config/placed';
import { stageSpec } from '../config/buildings';
import { enrollment } from '../selectors';
import type { GameState, MapState, Placed, PlacedType } from '../types';

/**
 * Hand-placed buildings: where they may go, what is in reach of them, and
 * what a store earns. Reach is worked out when asked, from the map alone, and
 * the map only changes when the player acts, so none of this costs anything
 * during catch-up.
 */

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export type PlaceProblem = 'offMap' | 'blocked' | 'cash';

export interface PlacePreview {
  type: PlacedType;
  /** The top corner of the footprint. */
  x: number;
  y: number;
  /** Every cell it would cover that is on the map. */
  cells: Array<[number, number]>;
  cost: number;
  problem: PlaceProblem | null;
}

/** What placing a building here would do, without doing it. Drives the ghost. */
export function previewPlace(state: GameState, type: PlacedType, x: number, y: number): PlacePreview {
  const spec = PLACED[type];
  const map = state.map;
  const cells: Array<[number, number]> = [];
  let problem: PlaceProblem | null = null;
  for (let cy = y; cy < y + spec.h; cy++) {
    for (let cx = x; cx < x + spec.w; cx++) {
      if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) {
        problem = 'offMap';
        continue;
      }
      cells.push([cx, cy]);
      if (map.cells[cy * map.width + cx]!.kind !== 'empty' && problem === null) problem = 'blocked';
    }
  }
  if (problem === null && spec.cost > state.money.cash) problem = 'cash';
  return { type, x, y, cells, cost: spec.cost, problem };
}

/** Put a building on the map. The caller has checked the spot and paid. `builtTick` is -1 for one the campus begins with. */
export function addPlaced(map: MapState, type: PlacedType, x: number, y: number, builtTick = -1): Placed {
  const spec = PLACED[type];
  const placed: Placed = { id: map.placed.length, type, x, y, w: spec.w, h: spec.h, builtTick };
  map.placed.push(placed);
  for (let cy = y; cy < y + spec.h; cy++) {
    for (let cx = x; cx < x + spec.w; cx++) {
      const cell = map.cells[cy * map.width + cx]!;
      cell.kind = 'placed';
      cell.zone = null;
      cell.buildingId = null;
      cell.placedId = placed.id;
      cell.variant = 0;
      cell.builtTick = builtTick;
    }
  }
  return placed;
}

export function removePlaced(map: MapState, id: number): void {
  const placed = map.placed[id];
  if (!placed) return;
  for (let cy = placed.y; cy < placed.y + placed.h; cy++) {
    for (let cx = placed.x; cx < placed.x + placed.w; cx++) {
      const cell = map.cells[cy * map.width + cx]!;
      cell.kind = 'empty';
      cell.placedId = null;
      cell.builtTick = -1;
    }
  }
  map.placed[id] = null;
}

export function placedAt(map: MapState, x: number, y: number): Placed | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const id = map.cells[y * map.width + x]!.placedId;
  return id === null ? null : (map.placed[id] ?? null);
}

/** Cells between a spot and the nearest edge of a building, counting diagonals as one. */
function cellsFrom(placed: Placed, x: number, y: number): number {
  const dx = Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1));
  const dy = Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1));
  return Math.max(dx, dy);
}

/** The buildings of one family whose reach covers a spot. */
export function inReach(map: MapState, family: PlacedFamily, x: number, y: number): Placed[] {
  const out: Placed[] = [];
  for (const placed of map.placed) {
    if (!placed) continue;
    const spec = PLACED[placed.type];
    if (spec.family === family && spec.radius > 0 && cellsFrom(placed, x, y) <= spec.radius) out.push(placed);
  }
  return out;
}

/** True when a dining hall or a coffee stand reaches this spot. */
export function fedAt(map: MapState, x: number, y: number): boolean {
  return inReach(map, 'dining', x, y).length > 0;
}

/** How much there is to do near a spot, 0 to 1. Every recreation building in reach adds its share, up to one cap. */
export function recreationAt(map: MapState, x: number, y: number): number {
  let sum = 0;
  for (const placed of inReach(map, 'recreation', x, y)) sum += PLACED[placed.type].strength;
  return Math.min(1, sum);
}

/** Points of desirability a library adds to an Academic lot here. The best one in reach counts, fading with distance. */
export function libraryLift(map: MapState, x: number, y: number): number {
  let best = 0;
  for (const placed of inReach(map, 'library', x, y)) {
    const spec = PLACED[placed.type];
    const fade = (spec.radius + 1 - cellsFrom(placed, x, y)) / (spec.radius + 1);
    best = Math.max(best, spec.strength * fade);
  }
  return best;
}

/**
 * The nearest free ground to a lot where a building would still reach it: the
 * spot the "build one here" shortcut offers. Ground beside a path wins a tie.
 * null when nothing in reach is free.
 */
export function nearestSpot(state: GameState, type: PlacedType, x: number, y: number): { x: number; y: number } | null {
  const spec = PLACED[type];
  const map = state.map;
  const besidePath = (px: number, py: number): boolean => {
    for (let cy = py; cy < py + spec.h; cy++) {
      for (let cx = px; cx < px + spec.w; cx++) {
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.cells[ny * map.width + nx]!.kind === 'path') return true;
        }
      }
    }
    return false;
  };
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let py = y - spec.radius - spec.h + 1; py <= y + spec.radius; py++) {
    for (let px = x - spec.radius - spec.w + 1; px <= x + spec.radius; px++) {
      const far = cellsFrom({ id: -1, type, x: px, y: py, w: spec.w, h: spec.h, builtTick: -1 }, x, y);
      if (far < 1 || far > spec.radius) continue;
      const problem = previewPlace(state, type, px, py).problem;
      if (problem === 'blocked' || problem === 'offMap') continue;
      const score = far + (besidePath(px, py) ? 0 : 0.5);
      if (score < bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
  }
  return best;
}

/** Cells a reach covers, for the tint shown while placing. */
export function reachCells(map: MapState, type: PlacedType, x: number, y: number): Array<[number, number]> {
  const spec = PLACED[type];
  const out: Array<[number, number]> = [];
  if (spec.radius <= 0) return out;
  for (let cy = y - spec.radius; cy < y + spec.h + spec.radius; cy++) {
    for (let cx = x - spec.radius; cx < x + spec.w + spec.radius; cx++) {
      if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) continue;
      if (cx >= x && cx < x + spec.w && cy >= y && cy < y + spec.h) continue;
      out.push([cx, cy]);
    }
  }
  return out;
}

/**
 * Students who pass a store's door: half of the beds and seats within a short
 * walk of it along the paths, and never more than are enrolled. It is read
 * from the path network, never from the walkers on screen.
 */
export function storePassers(state: GameState, placed: Placed): number {
  const map = state.map;
  const { width, height, cells } = map;
  const depth = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (cells[i]!.kind === 'path' && depth[i] === -1) {
      depth[i] = 0;
      queue.push(i);
    }
  };
  for (let cy = placed.y; cy < placed.y + placed.h; cy++) {
    for (let cx = placed.x; cx < placed.x + placed.w; cx++) for (const [dx, dy] of NEIGHBOURS) seed(cx + dx, cy + dy);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    if (depth[i]! >= STORE_REACH_CELLS) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (cells[ni]!.kind === 'path' && depth[ni] === -1) {
        depth[ni] = depth[i]! + 1;
        queue.push(ni);
      }
    }
  }

  let capacity = 0;
  for (const building of map.buildings) {
    if (!building || building.stage < 1) continue;
    const beside = NEIGHBOURS.some(([dx, dy]) => {
      const nx = building.x + dx;
      const ny = building.y + dy;
      return nx >= 0 && ny >= 0 && nx < width && ny < height && depth[ny * width + nx]! >= 0;
    });
    if (beside) capacity += stageSpec(building.zone, building.stage).capacity;
  }
  return Math.min(enrollment(state), Math.round(capacity * STORE_PASSING_SHARE));
}

export function storeIncomePerYear(state: GameState, placed: Placed): number {
  return storePassers(state, placed) * STORE_INCOME_PER_PASSER;
}

/** Yearly upkeep of every hand-placed building. */
export function placedUpkeepPerYear(map: MapState): number {
  let total = 0;
  for (const placed of map.placed) if (placed) total += PLACED[placed.type].upkeepPerYear;
  return total;
}

/** Yearly income of every store. */
export function placedIncomePerYear(state: GameState): number {
  let total = 0;
  for (const placed of state.map.placed) {
    if (placed && PLACED[placed.type].family === 'store') total += storeIncomePerYear(state, placed);
  }
  return total;
}
