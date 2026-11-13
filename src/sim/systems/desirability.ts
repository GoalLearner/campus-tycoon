import {
  BASE_SCORE,
  GREEN_CAP,
  GREEN_PER_CELL,
  GREEN_RADIUS,
  TREE_GREEN_SHARE,
  WALK_FREE_MINUTES,
  WALK_MAX_PENALTY,
  WALK_MINUTES_PER_CELL,
  WALK_PENALTY_PER_MINUTE,
} from '../config/desirability';
import { PLACED, POND_GREEN_SHARE } from '../config/placed';
import { PARKING_NOISE, ROAD_NOISE } from '../config/town';
import type { MapState, Zone } from '../types';
import { libraryLift, rewardLift } from './placed';
import { refreshTownAccess } from './town';
import { refreshCare } from './grounds';

/**
 * Desirability and walk time for every lot. Only player actions change the
 * things these read, so this runs after an action and never during a tick.
 * That keeps catch-up cheap.
 */

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Steps from each walkable cell to the nearest Academic lot, counted along
 * paths, quads and crossings. -1 where no Academic lot can be reached.
 */
const walkable = (kind: string): boolean => kind === 'path' || kind === 'quad' || kind === 'crossing';

export function stepsToClass(map: MapState): Int32Array {
  const { width, height, cells } = map;
  const dist = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y * width + x]!;
      if (cell.kind !== 'lot' || cell.zone !== 'academic') continue;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        const kind = cells[ni]!.kind;
        if (walkable(kind) && dist[ni] === -1) {
          dist[ni] = 1;
          queue.push(ni);
        }
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      const kind = cells[ni]!.kind;
      if (walkable(kind) && dist[ni] === -1) {
        dist[ni] = dist[i]! + 1;
        queue.push(ni);
      }
    }
  }
  return dist;
}

/** Walk from a housing lot to class, in minutes. -1 when there is no route. */
function walkFrom(map: MapState, steps: Int32Array, x: number, y: number): number {
  const { width, height, cells } = map;
  let best = -1;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const ni = ny * width + nx;
    const cell = cells[ni]!;
    let cellsWalked = -1;
    if (cell.kind === 'lot' && cell.zone === 'academic') cellsWalked = 1;
    else if (steps[ni]! > 0) cellsWalked = steps[ni]! + 1;
    if (cellsWalked > 0 && (best === -1 || cellsWalked < best)) best = cellsWalked;
  }
  return best === -1 ? -1 : best * WALK_MINUTES_PER_CELL;
}

/** How much of a quad cell this cell is worth as green space. Ponds, trees and quads share the one capped input. */
function greenShare(map: MapState, index: number): number {
  const cell = map.cells[index]!;
  if (cell.kind === 'quad') return 1;
  if (cell.kind === 'tree') return TREE_GREEN_SHARE;
  if (cell.kind === 'placed' && cell.placedId !== null) {
    const placed = map.placed[cell.placedId];
    if (placed && PLACED[placed.type].family === 'water') return POND_GREEN_SHARE;
  }
  return 0;
}

/** Lift from quads, trees and water near a cell, capped. */
function greenLift(map: MapState, x: number, y: number, zone: Zone): number {
  const { width, height } = map;
  let lift = 0;
  for (let dy = -GREEN_RADIUS; dy <= GREEN_RADIUS; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -GREEN_RADIUS; dx <= GREEN_RADIUS; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const share = greenShare(map, ny * width + nx);
      if (share === 0) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      lift += GREEN_PER_CELL[zone] * share * ((GREEN_RADIUS + 1 - d) / (GREEN_RADIUS + 1));
    }
  }
  return Math.min(GREEN_CAP[zone], lift);
}

/**
 * What a lot loses to traffic: a road, crossing or street right beside it, and
 * a car park within a cell of it. The first piece of the noise input.
 */
function noiseAt(map: MapState, x: number, y: number): number {
  const { width, height, cells } = map;
  let road = 0;
  let parking = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const cell = cells[ny * width + nx]!;
      if ((dx === 0 || dy === 0) && (cell.kind === 'road' || cell.kind === 'crossing' || cell.kind === 'street')) road = ROAD_NOISE;
      if (cell.kind === 'placed' && cell.placedId !== null) {
        const placed = map.placed[cell.placedId];
        if (placed && (placed.type === 'parking' || placed.type === 'garage')) parking = Math.max(parking, PARKING_NOISE[placed.type]);
      }
    }
  }
  return road + parking;
}

export function walkPenalty(minutes: number): number {
  if (minutes < 0) return WALK_MAX_PENALTY;
  const over = minutes - WALK_FREE_MINUTES;
  return over <= 0 ? 0 : Math.min(WALK_MAX_PENALTY, over * WALK_PENALTY_PER_MINUTE);
}

/** The pieces of one lot's score, for the lot inspector. */
export interface ScoreParts {
  base: number;
  green: number;
  /** Added by a library in reach. Academic only. */
  library: number;
  /** Added by a rank goal's building in reach. Either zone. */
  reward: number;
  /** Subtracted from the score. Housing only. */
  walkPenalty: number;
  /** -1 when there is no route. Housing only. */
  walkMinutes: number;
  /** Subtracted from the score: a road beside the lot, or a car park within a cell of it. */
  noise: number;
  total: number;
}

export function scoreParts(map: MapState, x: number, y: number, zone: Zone, walk: number): ScoreParts {
  const green = greenLift(map, x, y, zone);
  const penalty = zone === 'housing' ? walkPenalty(walk) : 0;
  const library = zone === 'academic' ? libraryLift(map, x, y) : 0;
  const reward = rewardLift(map, x, y);
  const noise = noiseAt(map, x, y);
  const total = Math.max(0, Math.min(100, BASE_SCORE + green + library + reward - penalty - noise));
  return { base: BASE_SCORE, green, library, reward, walkPenalty: penalty, walkMinutes: walk, noise, total };
}

/** Refresh map.score and map.walkMinutes for every cell. */
export function recomputeDesirability(map: MapState): void {
  const { width, height, cells } = map;
  const steps = stepsToClass(map);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cell = cells[i]!;
      if (cell.kind !== 'lot' || cell.zone === null) {
        map.score[i] = 0;
        map.walkMinutes[i] = -1;
        continue;
      }
      const walk = cell.zone === 'housing' ? walkFrom(map, steps, x, y) : -1;
      map.walkMinutes[i] = walk;
      map.score[i] = scoreParts(map, x, y, cell.zone, walk).total;
    }
  }
  // Who can walk in from town, and which car parks a road reaches, change with the same actions.
  refreshTownAccess(map, steps);
  // So do the bins beside each place to eat, and the yard that looks after each thing.
  refreshCare(map);
}
