/**
 * Coming and going on foot (DESIGN.md 69.2, the owner's "I don't want people to spawn in just from out of nowhere...
 * they gotta come out of a house/building"). Nobody appears or disappears in view: everyone on the screen comes out of
 * a door or walks in from the screen's edge, and anyone leaving walks to a door and in, or off the screen. The walkers
 * know the doors and the paths (src/game/Walkers.ts); the lawns, the courts and the small scenes ask them for a way.
 */

/** Where someone finds their way on and off the screen. */
export interface Afoot {
  /** A way from the nearest door or the screen's edge to (x, y), the first point where they appear; null for none. */
  approach(x: number, y: number): Array<{ x: number; y: number }> | null;
  /** True for ground only just come into sight (the first look, a pan, a zoom): people may be there already. */
  fresh(x: number, y: number): boolean;
  /** True when a point of the map is on the screen, or near enough that a figure there would show. */
  seen(at: { x: number; y: number }): boolean;
}

/** A walk along points: to a place, or `out` and away. */
export interface Trip {
  pts: Array<{ x: number; y: number }>;
  /** The length walked at each point. */
  at: number[];
  total: number;
  startMs: number;
  out: boolean;
}

export function tripOf(pts: Array<{ x: number; y: number }>, startMs: number, out: boolean): Trip {
  const at = [0];
  for (let k = 1; k < pts.length; k++) at.push(at[k - 1]! + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y));
  return { pts, at, total: at[at.length - 1]!, startMs, out };
}

/** Move a trip's last point (a place that moves, as a player's does) and its length with it. */
export function moveEnd(trip: Trip, x: number, y: number): void {
  const last = trip.pts.length - 1;
  if (last < 1) return;
  trip.pts[last] = { x, y };
  trip.at[last] = trip.at[last - 1]! + Math.hypot(x - trip.pts[last - 1]!.x, y - trip.pts[last - 1]!.y);
  trip.total = trip.at[last]!;
}

/** Where on a trip someone is after walking `d` cells, and the stretch they are on (for the way they face). */
export function pointOn(trip: Trip, d: number): { x: number; y: number; ax: number; ay: number; bx: number; by: number } {
  const along = Math.max(0, Math.min(trip.total, d));
  let k = 1;
  while (k < trip.pts.length - 1 && trip.at[k]! < along) k += 1;
  const a = trip.pts[k - 1]!;
  const b = trip.pts[Math.min(k, trip.pts.length - 1)]!;
  const span = Math.max(1e-6, (trip.at[k] ?? along) - trip.at[k - 1]!);
  const f = Math.min(1, Math.max(0, (along - trip.at[k - 1]!) / span));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

/** How strongly someone on a trip shows: fading only in the doorway at its start (in) or its end (out), over `fade` cells. */
export function doorAlpha(trip: Trip, d: number, fade: number): number {
  // Before setting out: not yet come out of the door, or still standing in their place.
  if (d <= 0) return trip.out ? 1 : 0;
  return trip.out ? Math.min(1, Math.max(0, (trip.total - d) / fade)) : Math.min(1, d / fade);
}

/** The four cells beside a cell, as steps. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Scratch space for `searchOnFoot`, kept between searches so none allocates. */
export interface SearchSpace {
  seen: Int32Array;
  from: Int32Array;
  stamp: number;
}

export function searchSpace(cells: number): SearchSpace {
  return { seen: new Int32Array(cells), from: new Int32Array(cells), stamp: 0 };
}

/**
 * The nearest cell on foot from `start` that is `done`, by a breadth-first search over cells that are `afoot` (the
 * start itself may not be: someone standing where a building now is walks off it). The cells of the way from the start
 * to it, both included, or null when none is found within `limit` cells. Pure: for the walkers, and for the tests.
 */
export function searchOnFoot(width: number, height: number, afoot: ArrayLike<boolean>, start: number, done: (cell: number) => boolean, limit: number, space: SearchSpace): number[] | null {
  if (start < 0 || start >= width * height || space.seen.length !== width * height) return null;
  const stamp = ++space.stamp;
  const { seen, from } = space;
  const queue = [start];
  seen[start] = stamp;
  from[start] = -1;
  let end = -1;
  for (let head = 0; head < queue.length && head < limit; head++) {
    const c = queue[head]!;
    if (done(c)) {
      end = c;
      break;
    }
    const cx = c % width;
    const cy = (c - cx) / width;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] === stamp || !afoot[n]) continue;
      seen[n] = stamp;
      from[n] = c;
      queue.push(n);
    }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let c = end; c >= 0; c = from[c]!) cells.push(c);
  return cells.reverse();
}

/**
 * The cells a rider takes from one cell to another (DESIGN.md 71): over the cells they may `ride`, a cell of bike path
 * (`lane`) costing `laneCost` and any other `pathCost`, so a way along the bike path wins over a slightly shorter one
 * along the footpaths. No more than `most` cells. Both ends included, with how many of them are bike path; null when
 * they do not join. Pure: for the walkers, and for the tests.
 */
export function searchRide(
  width: number,
  height: number,
  ride: ArrayLike<boolean>,
  lane: ArrayLike<boolean>,
  start: number,
  end: number,
  most: number,
  laneCost = 2,
  pathCost = 3,
): { cells: number[]; lane: number } | null {
  const size = width * height;
  if (start < 0 || end < 0 || start >= size || end >= size) return null;
  const dist = new Int32Array(size).fill(-1);
  const parent = new Int32Array(size).fill(-1);
  const steps = new Int32Array(size);
  const buckets: number[][] = [[start]];
  dist[start] = 0;
  parent[start] = start;
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let k = 0; k < bucket.length; k++) {
      const c: number = bucket[k]!;
      if (dist[c] !== d) continue;
      if (c === end) {
        const cells = [end];
        while (cells[cells.length - 1] !== start) cells.push(parent[cells[cells.length - 1]!]!);
        cells.reverse();
        return { cells, lane: cells.reduce((n, one) => n + (lane[one] ? 1 : 0), 0) };
      }
      if (steps[c]! >= most) continue;
      const cx: number = c % width;
      const cy: number = (c - cx) / width;
      for (const [dx, dy] of STEPS) {
        const nx: number = cx + dx;
        const ny: number = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n: number = ny * width + nx;
        if (!ride[n]) continue;
        const nd = d + (lane[n] ? laneCost : pathCost);
        if (dist[n] !== -1 && dist[n]! <= nd) continue;
        dist[n] = nd;
        parent[n] = c;
        steps[n] = steps[c]! + 1;
        (buckets[nd] ??= []).push(n);
      }
    }
  }
  return null;
}
