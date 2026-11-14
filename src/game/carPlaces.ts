import type { RouteNode } from '../app/traffic';
import { hasRoadAccess, placedCars, type MapState } from '../sim';
import type { Iso } from './iso';

/**
 * Where the cars of the map may leave the road, and the routes they drive
 * (DESIGN.md section 59). For show only, in plain functions, so a test can
 * drive every route the map offers and check where each car is drawn.
 *
 * A car is on the road, in a house's driveway, or in a car park. It leaves
 * the street only into a driveway or a car park, and a route ends in one of
 * them or at the edge of the map.
 */

/** A car park a car can drive into: the road cell at its door, and its footprint. */
export interface CarPark {
  door: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A road cell beside a footprint (not across a corner), or -1. */
export function roadBeside(map: MapState, drivable: readonly boolean[], x0: number, y0: number, w: number, h: number): number {
  const { width, height } = map;
  for (let y = y0 - 1; y <= y0 + h; y++) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const beside = (x < x0 || x >= x0 + w) !== (y < y0 || y >= y0 + h);
      if (!beside || x < 0 || y < 0 || x >= width || y >= height) continue;
      if (drivable[y * width + x]) return y * width + x;
    }
  }
  return -1;
}

/** Every car park a road reaches: a parking lot or a parking structure. */
export function carParks(map: MapState, drivable: readonly boolean[]): CarPark[] {
  const parks: CarPark[] = [];
  for (const placed of map.placed) {
    if (!placed || placedCars(placed.type, 1) <= 0 || !hasRoadAccess(map, placed)) continue;
    const door = roadBeside(map, drivable, placed.x, placed.y, placed.w, placed.h);
    if (door >= 0) parks.push({ door, x: placed.x, y: placed.y, w: placed.w, h: placed.h });
  }
  return parks;
}

/** True for a placed thing that holds cars. */
export function holdsCars(map: MapState, cell: number): boolean {
  const id = map.cells[cell]?.placedId;
  const placed = id !== null && id !== undefined ? map.placed[id] : null;
  return !!placed && placedCars(placed.type, 1) > 0;
}

/**
 * A student's drive: out of a driveway (or from the kerb of a street with
 * none), along the roads `cells` from its street to the car park's door, and
 * into the car park.
 */
export function studentRoute(width: number, home: { x: number; y: number; row: number }, cells: readonly number[], park: CarPark): RouteNode[] {
  return [
    { x: home.x, y: home.y, road: home.y === home.row },
    ...cells.map((cell) => ({ x: cell % width, y: Math.floor(cell / width), road: true })),
    { x: park.x, y: park.y, road: false },
  ];
}

/** A neighbour's drive along the roads `cells`, out of a driveway and into one where `from` or `to` is given. */
export function townRoute(width: number, cells: readonly number[], from?: { x: number; y: number }, to?: { x: number; y: number }): RouteNode[] {
  const route: RouteNode[] = cells.map((cell) => ({ x: cell % width, y: Math.floor(cell / width), road: true }));
  if (from) route.unshift({ x: from.x, y: from.y, road: false });
  if (to) route.push({ x: to.x, y: to.y, road: false });
  return route;
}

/**
 * Where a car's drawing stands. A car's spot counts the middle of a cell as
 * the whole number; its drawing is one cell, stood so that cell's middle is
 * on the spot at every turn of the view.
 */
export function carTop(iso: Iso, x: number, y: number): { x: number; y: number } {
  return iso.standTop(x + 0.5, y + 0.5);
}

/** The draw-order sum of a car's spot: that of the cell it is in. */
export function carSum(iso: Iso, x: number, y: number): number {
  return iso.sum(x + 0.5, y + 0.5) - 1;
}
