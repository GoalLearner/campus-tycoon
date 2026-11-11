import { MAX_STAGE, stageSpec, VARIANTS_PER_STAGE } from '../config/buildings';
import { WALK_FREE_MINUTES } from '../config/desirability';
import { cellAt } from '../selectors';
import { ZONES, type Building, type GameState, type MapState, type Zone } from '../types';
import { startBuild } from './construction';
import { shortage } from './demand';
import { scoreParts } from './desirability';

/**
 * Organic growth. Inside its density tier a lot grows on its own when demand,
 * desirability and a path line up. A lot that cannot grow names the one thing
 * holding it back. See DESIGN.md section 6.
 */

export type StallCause = 'noPath' | 'noDemand' | 'lowDesirability';

export type LotStatus =
  | { kind: 'building'; toStage: number; doneTick: number }
  | { kind: 'top'; stage: number }
  | { kind: 'ready'; nextStage: number }
  | { kind: 'stalled'; nextStage: number; cause: StallCause; also: StallCause[]; needed: number };

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function touchesPath(map: MapState, x: number, y: number): boolean {
  return NEIGHBOURS.some(([dx, dy]) => cellAt(map, x + dx, y + dy)?.kind === 'path');
}

function stageOf(map: MapState, x: number, y: number): { stage: number; building: Building | null } {
  const cell = cellAt(map, x, y);
  const building = cell && cell.buildingId !== null ? (map.buildings[cell.buildingId] ?? null) : null;
  return { stage: building ? building.stage : 0, building };
}

/**
 * Where a zoned lot stands. Stall causes are checked in a fixed order and the
 * first one that applies is the primary cause.
 */
export function lotStatus(state: GameState, x: number, y: number): LotStatus | null {
  const map = state.map;
  const cell = cellAt(map, x, y);
  if (!cell || cell.kind !== 'lot' || cell.zone === null) return null;
  const zone = cell.zone;
  const { stage, building } = stageOf(map, x, y);

  if (building?.rebuild) {
    return { kind: 'building', toStage: building.rebuild.toStage, doneTick: building.rebuild.doneTick };
  }
  if (stage >= MAX_STAGE) return { kind: 'top', stage };

  const nextStage = stage + 1;
  const needed = stageSpec(zone, nextStage).desirabilityNeeded;
  const causes: StallCause[] = [];
  if (!touchesPath(map, x, y)) causes.push('noPath');
  if (shortage(state, zone) <= 0) causes.push('noDemand');
  if (map.score[y * map.width + x]! < needed) causes.push('lowDesirability');

  const [cause, ...also] = causes;
  if (!cause) return { kind: 'ready', nextStage };
  return { kind: 'stalled', nextStage, cause, also, needed };
}

/** The biggest thing dragging a lot's desirability down, in plain words. */
export function desirabilityHint(state: GameState, x: number, y: number): string {
  const map = state.map;
  const cell = cellAt(map, x, y);
  if (!cell || cell.zone === null) return '';
  const walk = map.walkMinutes[y * map.width + x]!;
  const parts = scoreParts(map, x, y, cell.zone, walk);
  if (cell.zone === 'housing' && parts.walkMinutes < 0) return 'No path leads from here to a classroom.';
  if (cell.zone === 'housing' && parts.walkPenalty >= 6) {
    return `The walk to class is ${Math.round(parts.walkMinutes)} minutes. Students want ${WALK_FREE_MINUTES} or less.`;
  }
  return 'There is no green space nearby. Place a quad.';
}

interface Candidate {
  x: number;
  y: number;
  score: number;
  nextStage: number;
  gain: number;
}

/** Lots of one zone that could start growing now, best first. */
function candidates(state: GameState, zone: Zone): Candidate[] {
  const map = state.map;
  const out: Candidate[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const cell = map.cells[i]!;
      if (cell.kind !== 'lot' || cell.zone !== zone) continue;
      const { stage, building } = stageOf(map, x, y);
      if (building?.rebuild || stage >= MAX_STAGE) continue;
      const nextStage = stage + 1;
      const next = stageSpec(zone, nextStage);
      const score = map.score[i]!;
      if (score < next.desirabilityNeeded || !touchesPath(map, x, y)) continue;
      const now = stage > 0 ? stageSpec(zone, stage).capacity : 0;
      out.push({ x, y, score, nextStage, gain: next.capacity - now });
    }
  }
  // Highest desirability first. Ties go to the lot nearest the top-left, so the order is fixed.
  out.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  return out;
}

function ensureBuilding(state: GameState, x: number, y: number, zone: Zone): Building {
  const map = state.map;
  const cell = map.cells[y * map.width + x]!;
  if (cell.buildingId !== null) {
    const existing = map.buildings[cell.buildingId];
    if (existing) return existing;
  }
  const id = map.buildings.length;
  const building: Building = { id, x, y, w: 1, h: 1, zone, stage: 0, variant: id % VARIANTS_PER_STAGE, rebuild: null };
  map.buildings.push(building);
  cell.buildingId = id;
  return building;
}

/**
 * Start as many builds as the shortage calls for, best lots first.
 * Capacity already under construction counts, so growth never overshoots the forecast.
 */
export function evaluateGrowth(state: GameState, only?: Zone): void {
  for (const zone of ZONES) {
    if (only && zone !== only) continue;
    let short = shortage(state, zone);
    if (short <= 0) continue;
    for (const c of candidates(state, zone)) {
      if (short <= 0) break;
      startBuild(state, ensureBuilding(state, c.x, c.y, zone), c.nextStage);
      short -= c.gain;
    }
  }
}
