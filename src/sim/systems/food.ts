import { FOOD_INCOME_PER_STUDENT, PLACED, placedMeals, SMOOTHIE_CELLS, SMOOTHIE_TIMES, TUTORING_GPA, VARIETY_BONUS, VARIETY_KINDS } from '../config/placed';
import { MEAL_SHARE } from '../config/staffing';
import { scaleOf } from '../scale';
import { crowdLift } from './play';
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

/** Every kind of food, each with a bit of its own, so the kinds in reach of a lot can be counted without a list. */
const FOOD_TYPES = (Object.keys(PLACED) as PlacedType[]).filter((type) => PLACED[type].family === 'dining');
const FOOD_BIT: Partial<Record<PlacedType, number>> = {};
FOOD_TYPES.forEach((type, n) => (FOOD_BIT[type] = 1 << n));

/**
 * How many kinds of food reach a spot. Two dining halls are one kind. The
 * food court counts as three. 0 means nothing to eat is in reach. This is
 * read for every lot whose Happiness is read, so it makes no lists.
 */
export function foodKindsAt(map: MapState, x: number, y: number): number {
  let seen = 0;
  const ids = map.care?.byFamily?.dining;
  if (ids) {
    for (const id of ids) {
      const placed = map.placed[id];
      if (placed && gap(placed, x, y) <= PLACED[placed.type].radius) seen |= FOOD_BIT[placed.type] ?? 0;
    }
  } else {
    for (const placed of map.placed) {
      if (placed && PLACED[placed.type].family === 'dining' && gap(placed, x, y) <= PLACED[placed.type].radius) seen |= FOOD_BIT[placed.type] ?? 0;
    }
  }
  if (seen === 0) return 0;
  let kinds = 0;
  for (let n = 0; n < FOOD_TYPES.length; n++) if (seen & (1 << n)) kinds += PLACED[FOOD_TYPES[n]!].kinds ?? 1;
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

// ------------------------------------------------------------- capacity --

/**
 * Share the lots out among the places to eat that reach them, in proportion
 * to how many each can feed: a dining hall takes more of a dorm's meals than
 * the coffee stand beside it. The result, for each place, is how many lots'
 * worth of students eat there. Called after every action, with the rest of
 * `care`.
 */
export function mealLoads(map: MapState, places: readonly Placed[]): Record<number, number> {
  const load: Record<number, number> = {};
  for (const placed of places) load[placed.id] = 0;
  if (places.length === 0) return load;
  const { width, height, cells } = map;
  const near: Placed[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]!.kind !== 'lot') continue;
      near.length = 0;
      let feeds = 0;
      for (const placed of places) {
        if (gap(placed, x, y) > PLACED[placed.type].radius) continue;
        near.push(placed);
        feeds += placedMeals(placed.type, 1);
      }
      if (feeds <= 0) continue;
      for (const placed of near) load[placed.id]! += placedMeals(placed.type, 1) / feeds;
    }
  }
  return load;
}

export interface MealUse {
  /** Students it can feed at the busiest hour. */
  capacity: number;
  /** Students who want a meal there at the busiest hour. */
  demand: number;
  /** Demand over capacity. */
  ratio: number;
  /** In line at the busiest hour. */
  waiting: number;
  /** What is left of its part in Happiness, from a floor to 1: a long line takes a little off. */
  lift: number;
}

/**
 * How busy a place to eat is at the busiest hour (DESIGN.md 38.5). null for
 * anything else. It is the recreation rule: over what it can feed, the rest
 * wait, and a long line takes a little off what the place is worth to the
 * students near it. It never blocks anything, and the loss has a floor.
 */
export function mealUse(state: GameState, placed: Placed): MealUse | null {
  const capacity = placedMeals(placed.type, scaleOf(state));
  if (capacity <= 0) return null;
  const care = state.map.care;
  const lots = care.lots > 0 ? (care.meals?.[placed.id] ?? 0) : 0;
  const demand = care.lots > 0 ? (lots * enrollment(state) * MEAL_SHARE) / care.lots : 0;
  const ratio = demand / capacity;
  return { capacity, demand, ratio, waiting: Math.max(0, Math.round(demand) - capacity), lift: crowdLift(ratio) };
}

/**
 * What the food in reach of a spot is worth, 0 to 1: nothing with none in
 * reach, all of it where any place in reach has room, and a little less where
 * every one of them has a line.
 */
export function diningAt(state: GameState, x: number, y: number): number {
  const map = state.map;
  // A save from before a place to eat could fill up reads as it always did until its map is next worked out.
  if (!map.care?.meals) return foodKindsAt(map, x, y) > 0 ? 1 : 0;
  const ids = map.care.byFamily?.dining ?? [];
  let best = 0;
  for (const id of ids) {
    const placed = map.placed[id];
    if (!placed || gap(placed, x, y) > PLACED[placed.type].radius) continue;
    best = Math.max(best, mealUse(state, placed)?.lift ?? 1);
    if (best >= 1) return 1;
  }
  return best;
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
