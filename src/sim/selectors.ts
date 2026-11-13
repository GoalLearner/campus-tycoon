import { placedUpkeep } from './config/placed';
import { scaleOf } from './scale';
import { stageSpec } from './config/buildings';
import { TICKS_PER_YEAR } from './config/time';
import { PLACED } from './config/placed';
import { ROAD_UPKEEP_PER_YEAR } from './config/town';
import { CHAPTER_BEDS } from './config/greek';
import type { Building, Cell, CellKind, GameState, MapState, Zone } from './types';

/** Read-only views of the state. The UI reads the game through these. */

export function enrollment(state: GameState): number {
  const c = state.cohorts;
  return c[0] + c[1] + c[2] + c[3];
}

export function cellIndex(map: MapState, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: MapState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function cellAt(map: MapState, x: number, y: number): Cell | null {
  return inBounds(map, x, y) ? map.cells[cellIndex(map, x, y)]! : null;
}

export function buildingAt(map: MapState, x: number, y: number): Building | null {
  const cell = cellAt(map, x, y);
  if (!cell || cell.buildingId === null) return null;
  return map.buildings[cell.buildingId] ?? null;
}

/** Every building still standing, in id order. */
export function buildings(map: MapState): Building[] {
  const out: Building[] = [];
  for (const b of map.buildings) if (b) out.push(b);
  return out;
}

/**
 * Beds or seats open right now. A building under rebuild still serves at its old stage. The beds of Greek Row's
 * houses count with the dorms' as far as their members fill them (DESIGN.md 51): a member who moved in left a dorm
 * bed free.
 */
export function openCapacity(state: GameState, zone: Zone): number {
  const scale = scaleOf(state);
  let total = 0;
  for (const b of state.map.buildings) {
    if (b && b.zone === zone && b.stage > 0) total += stageSpec(zone, b.stage, scale).capacity;
  }
  if (zone === 'housing') total += chapterBedsTaken(state);
  return total;
}

/** Beds taken in chapter houses: each house's members, up to its beds. Nothing on a campus with no chapter. */
export function chapterBedsTaken(state: GameState): number {
  const list = state.greek?.chapters;
  if (!list || list.length === 0) return 0;
  const beds = CHAPTER_BEDS * scaleOf(state);
  let sum = 0;
  for (const chapter of list) sum += Math.min(chapter.members, beds);
  return sum;
}

/** Extra beds or seats that will open when current builds finish. */
export function pendingCapacity(state: GameState, zone: Zone): number {
  const scale = scaleOf(state);
  let total = 0;
  for (const b of state.map.buildings) {
    if (!b || b.zone !== zone || !b.rebuild) continue;
    const now = b.stage > 0 ? stageSpec(zone, b.stage, scale).capacity : 0;
    total += stageSpec(zone, b.rebuild.toStage, scale).capacity - now;
  }
  return total;
}

export function upkeepPerYear(state: GameState): number {
  const scale = scaleOf(state);
  let total = 0;
  for (const b of state.map.buildings) {
    if (b && b.stage > 0) total += stageSpec(b.zone, b.stage, scale).upkeepPerYear;
  }
  // A big build going up (DESIGN.md 45) is paid for once it opens.
  for (const placed of state.map.placed) if (placed && placed.done === undefined) total += placedUpkeep(placed.type, scale);
  for (const cell of state.map.cells) if (cell.kind === 'road' || cell.kind === 'crossing') total += ROAD_UPKEEP_PER_YEAR * scale;
  return total;
}

/** True for ground a student walks along: a path, or a crossing where a path and a road share a cell. */
export function isPathKind(kind: CellKind | undefined): boolean {
  return kind === 'path' || kind === 'crossing';
}

/** True for ground a car drives along: the player's roads, crossings, and the town's streets. */
export function isRoadKind(kind: CellKind | undefined): boolean {
  return kind === 'road' || kind === 'crossing' || kind === 'street';
}

/** Net income per real hour at the current rates. The HUD's headline number. */
export function netPerRealHour(state: GameState): number {
  const perTick = (state.money.incomePerYear - state.money.spendingPerYear) / TICKS_PER_YEAR;
  return perTick * 60;
}
