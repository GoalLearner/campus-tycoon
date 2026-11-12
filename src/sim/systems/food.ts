import { FOOD_INCOME_PER_STUDENT, PLACED, SMOOTHIE_CELLS, SMOOTHIE_TIMES, TUTORING_GPA, VARIETY_BONUS, VARIETY_KINDS } from '../config/placed';
import { enrollment } from '../selectors';
import type { GameState, MapState, Placed, PlacedType } from '../types';
import { inReach } from './placed';

/**
 * Places to eat, beyond feeding the lots in reach (DESIGN.md section 30).
 *
 * Every food place is the dining rule at its own size. Two small rules sit on
 * top, and both have a ceiling:
 *
 * - Variety. A lot with three or more different kinds of food in reach gets a
 *   tenth added to its Food & fun, never past full. A fourth kind adds nothing.
 * - Income. Each student in reach of food is worth a little a year, shared
 *   equally among the places that reach them. A second stall beside the first
 *   halves what each earns, so stalls cannot be stacked for money.
 *
 * When a place is busy is seen on the map and never counted: nothing here, or
 * anywhere in the simulation, reads the time of day (28.1).
 *
 * Nothing is stored but the geometry (`map.care.food`), which changes only
 * when the player builds.
 */

/** Cells between a lot and the nearest cell of a building. */
function gap(placed: Placed, x: number, y: number): number {
  return Math.max(Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1)), Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1)));
}

/** Cells between two footprints. 0 when they touch. */
function gapBetween(a: Placed, b: Placed): number {
  const dx = Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), 0);
  const dy = Math.max(b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1), 0);
  return Math.max(dx, dy);
}

/** True for anything that feeds: the dining hall, the coffee stand and the eight places of play stop 4b. */
export function isFood(placed: Placed): boolean {
  return PLACED[placed.type].family === 'dining';
}

/** The kinds of food that reach a spot, each named once. */
export function foodTypesAt(map: MapState, x: number, y: number): PlacedType[] {
  const types: PlacedType[] = [];
  for (const placed of inReach(map, 'dining', x, y)) if (!types.includes(placed.type)) types.push(placed.type);
  return types;
}

/** How many kinds of food reach a spot. Two dining halls are one kind. The food court counts as three. */
export function foodKindsAt(map: MapState, x: number, y: number): number {
  let kinds = 0;
  for (const type of foodTypesAt(map, x, y)) kinds += PLACED[type].kinds ?? 1;
  return kinds;
}

/** What variety adds to Food & fun at a spot: a tenth with three kinds or more in reach, nothing with fewer. */
export function varietyAt(map: MapState, x: number, y: number): number {
  return foodKindsAt(map, x, y) >= VARIETY_KINDS ? VARIETY_BONUS : 0;
}

/**
 * Share the lots out among the places to eat that reach them, equally. The
 * result, for each place, is how many lots' worth of students it has to
 * itself. Called after every action, with the rest of `care`.
 */
export function foodLoads(map: MapState, places: readonly Placed[]): Record<number, number> {
  const load: Record<number, number> = {};
  for (const placed of places) load[placed.id] = 0;
  if (places.length === 0) return load;
  const { width, height, cells } = map;
  const near: Placed[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]!.kind !== 'lot') continue;
      near.length = 0;
      for (const placed of places) if (gap(placed, x, y) <= PLACED[placed.type].radius) near.push(placed);
      for (const placed of near) load[placed.id]! += 1 / near.length;
    }
  }
  return load;
}

/** True when a recreation building stands within two cells of this place. It doubles what a smoothie bar earns. */
export function besideRecreation(map: MapState, placed: Placed): boolean {
  for (const other of map.placed) {
    if (other && PLACED[other.type].family === 'recreation' && gapBetween(other, placed) <= SMOOTHIE_CELLS) return true;
  }
  return false;
}

export interface FoodTrade {
  /** Students it has to itself, once everyone in reach has been shared among the places that reach them. */
  students: number;
  /** Dollars a game year. */
  income: number;
  /** True for a smoothie bar with a recreation building within two cells: it earns double. */
  doubled: boolean;
}

/** What one place to eat earns, and from how many students. null for anything else. */
export function foodTrade(state: GameState, placed: Placed): FoodTrade | null {
  if (!isFood(placed)) return null;
  const care = state.map.care;
  const lots = care.lots > 0 ? (care.food?.[placed.id] ?? 0) : 0;
  const students = care.lots > 0 ? (lots * enrollment(state)) / care.lots : 0;
  const doubled = placed.type === 'smoothie' && besideRecreation(state.map, placed);
  return { students, income: students * FOOD_INCOME_PER_STUDENT * (doubled ? SMOOTHIE_TIMES : 1), doubled };
}

/** Yearly income of every place to eat. */
export function foodIncomePerYear(state: GameState): number {
  let total = 0;
  const ids = state.map.care?.byFamily?.dining;
  if (ids) {
    for (const id of ids) {
      const placed = state.map.placed[id];
      if (placed) total += foodTrade(state, placed)?.income ?? 0;
    }
    return total;
  }
  for (const placed of state.map.placed) if (placed) total += foodTrade(state, placed)?.income ?? 0;
  return total;
}

/** How many places to eat stand on the campus. */
export function foodPlaces(state: GameState): number {
  let count = 0;
  for (const placed of state.map.placed) if (placed && isFood(placed)) count += 1;
  return count;
}

/** True when a study center's tutoring reaches a spot. */
export function tutoredAt(map: MapState, x: number, y: number): boolean {
  return inReach(map, 'tutoring', x, y).length > 0;
}

/** What tutoring in reach adds to the GPA on a student's card. It changes nothing else until layer 2. */
export function tutoringLift(map: MapState, x: number, y: number): number {
  return tutoredAt(map, x, y) ? TUTORING_GPA : 0;
}
