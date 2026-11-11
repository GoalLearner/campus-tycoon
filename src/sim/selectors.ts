import { stageSpec } from './config/buildings';
import { TICKS_PER_YEAR } from './config/time';
import { PLACED } from './config/placed';
import type { Building, Cell, GameState, MapState, Zone } from './types';

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

/** Beds or seats open right now. A building under rebuild still serves at its old stage. */
export function openCapacity(state: GameState, zone: Zone): number {
  let total = 0;
  for (const b of state.map.buildings) {
    if (b && b.zone === zone && b.stage > 0) total += stageSpec(zone, b.stage).capacity;
  }
  return total;
}

/** Extra beds or seats that will open when current builds finish. */
export function pendingCapacity(state: GameState, zone: Zone): number {
  let total = 0;
  for (const b of state.map.buildings) {
    if (!b || b.zone !== zone || !b.rebuild) continue;
    const now = b.stage > 0 ? stageSpec(zone, b.stage).capacity : 0;
    total += stageSpec(zone, b.rebuild.toStage).capacity - now;
  }
  return total;
}

export function upkeepPerYear(state: GameState): number {
  let total = 0;
  for (const b of state.map.buildings) {
    if (b && b.stage > 0) total += stageSpec(b.zone, b.stage).upkeepPerYear;
  }
  for (const placed of state.map.placed) if (placed) total += PLACED[placed.type].upkeepPerYear;
  return total;
}

/** Net income per real hour at the current rates. The HUD's headline number. */
export function netPerRealHour(state: GameState): number {
  const perTick = (state.money.incomePerYear - state.money.spendingPerYear) / TICKS_PER_YEAR;
  return perTick * 60;
}
