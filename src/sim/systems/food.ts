import { FOOD_INCOME_PER_STUDENT, PLACED, placedMeals, SMOOTHIE_CELLS, SMOOTHIE_TIMES, TUTOR_BELOW, TUTOR_ROOM, VARIETY_BONUS, VARIETY_KINDS } from '../config/placed';
import { hashInts } from '../rng';
import { MEAL_SHARE } from '../config/staffing';
import { scaleOf } from '../scale';
import { choosePlace, servedShare, spillOver } from './play';
import { enrollment } from '../selectors';
import type { GameState, MapState, Placed, PlacedType } from '../types';
import { shareBelow } from './grades';
import { drawWeight, ofFamily } from './placed';
import type { StudentRef } from './students';

/**
 * Places to eat (DESIGN.md sections 30 and 83). Every student eats, and every place to eat feeds every student who uses
 * it, wherever they live (the owner, 2026-11-17: "every student has access to them and are walking distance"):
 *
 * - Room. The students who want a meal at the busiest hour against the meals the campus's places can serve. Over that,
 *   those who cannot get in miss a meal on campus: Food & fun's dining for them, a share of the campus.
 * - Variety. A campus with three or more different kinds of food gets a tenth added to Food & fun, never past full. A
 *   fourth kind adds nothing.
 * - Income. Each student is worth a little a year, shared among the places they eat at, the nearest most. A second
 *   stall beside the first halves what each earns, so stalls cannot be stacked for money.
 *
 * Who eats where (`map.care.food` and `map.care.meals`, the nearer the more) decides only the lines on the map, the
 * takings and the followed student's walk; never who is fed. When a place is busy is seen on the map and never
 * counted: nothing here, or anywhere in the simulation, reads the time of day (28.1).
 */

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

/** The kinds of food on the campus, each named once (DESIGN.md 83.3). */
export function foodTypesOnCampus(map: MapState): PlacedType[] {
  const types: PlacedType[] = [];
  for (const placed of ofFamily(map, 'dining')) if (!types.includes(placed.type)) types.push(placed.type);
  return types;
}

/** How many kinds of food the campus has: two dining halls are one kind, the food court counts as three, 0 is none. */
export function foodKinds(map: MapState): number {
  let kinds = 0;
  for (const type of foodTypesOnCampus(map)) kinds += PLACED[type].kinds ?? 1;
  return kinds;
}

/** What variety adds to Food & fun: a tenth with three kinds of food or more on the campus, nothing with fewer. */
export function varietyOn(map: MapState): number {
  return foodKinds(map) >= VARIETY_KINDS ? VARIETY_BONUS : 0;
}

/**
 * Share every lot's students out among the places to eat, the nearer the more and none out of reach (DESIGN.md 83.5).
 * The result, for each place, is how many lots' worth of students it has to itself: what it earns. Called after every
 * action, with the rest of `care`.
 */
export function foodLoads(map: MapState, places: readonly Placed[]): Record<number, number> {
  return shareLots(map, places, () => 1);
}

/**
 * Share every lot's students out among the places to eat, in proportion to how many each can feed, the nearer the
 * more: a dining hall takes more of a dorm's meals than the coffee stand beside it. The result, for each place, is how
 * many lots' worth of students come to it first for a meal. Called after every action, with the rest of `care`.
 */
export function mealLoads(map: MapState, places: readonly Placed[]): Record<number, number> {
  return shareLots(map, places, (placed) => placedMeals(placed.type, 1));
}

function shareLots(map: MapState, places: readonly Placed[], size: (placed: Placed) => number): Record<number, number> {
  const load: Record<number, number> = {};
  for (const placed of places) load[placed.id] = 0;
  if (places.length === 0) return load;
  const { width, height, cells } = map;
  const weights = new Array<number>(places.length).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]!.kind !== 'lot') continue;
      let sum = 0;
      for (let i = 0; i < places.length; i++) {
        const placed = places[i]!;
        const w = size(placed) * drawWeight(placed, x, y, PLACED[placed.type].radius);
        weights[i] = w;
        sum += w;
      }
      if (sum <= 0) continue;
      for (let i = 0; i < places.length; i++) load[places[i]!.id]! += weights[i]! / sum;
    }
  }
  return load;
}

// ------------------------------------------------------------- capacity --

export interface CampusMeals {
  /** Meals the campus's places can serve at the busiest hour. */
  capacity: number;
  /** Students who want a meal at the busiest hour: every student's share, wherever they live. */
  demand: number;
  ratio: number;
  /** The share of those who want a meal at the busiest hour who get one: 0 with nowhere to eat. */
  served: number;
  /** Who each place has at the busiest hour, by its id, and who came to it first. */
  demands: Map<number, number>;
  firsts: Map<number, number>;
}

let memo: { map: MapState; care: unknown; students: number; scale: number; placed: number; value: CampusMeals } | null = null;

/** The campus's meals at the busiest hour against who wants one (DESIGN.md 38.5, 83.3), the same for every student. */
export function campusMeals(state: GameState): CampusMeals {
  const map = state.map;
  const students = enrollment(state);
  const scale = scaleOf(state);
  if (memo && memo.map === map && memo.care === map.care && memo.students === students && memo.scale === scale && memo.placed === map.placed.length) return memo.value;
  const places = ofFamily(map, 'dining');
  let capacity = 0;
  for (const placed of places) capacity += placedMeals(placed.type, scale);
  const demand = places.length > 0 ? students * MEAL_SHARE : 0;
  const ratio = capacity > 0 ? demand / capacity : 0;
  const care = map.care;
  // A save from before a place to eat could fill up shares its meals as its takings, until its map is next worked out.
  const shares = care?.meals ?? care?.food;
  const firsts = new Map<number, number>();
  const bases: number[] = [];
  const caps: number[] = [];
  for (const placed of places) {
    const first = care && care.lots > 0 ? ((shares?.[placed.id] ?? 0) * demand) / care.lots : 0;
    firsts.set(placed.id, first);
    bases.push(first);
    caps.push(placedMeals(placed.type, scale));
  }
  const spilled = spillOver(bases, caps);
  const demands = new Map<number, number>();
  places.forEach((placed, i) => demands.set(placed.id, spilled[i]!));
  const value: CampusMeals = { capacity, demand, ratio, served: places.length > 0 ? servedShare(capacity, demand) : 0, demands, firsts };
  memo = { map, care: map.care, students, scale, placed: map.placed.length, value };
  return value;
}

export interface MealUse {
  /** Students it can feed at the busiest hour. */
  capacity: number;
  /** Students who eat here at the busiest hour, those who came first and those who went on from a full one. */
  demand: number;
  /** Demand over capacity. */
  ratio: number;
  /** Turned away at the busiest hour: only when every place on the campus is full. */
  waiting: number;
  /** The share of those who want a meal who get one: the same for every place. */
  served: number;
}

/**
 * How busy a place to eat is at the busiest hour (DESIGN.md 38.5, 83.3). null for anything else. Over what the campus
 * can feed, those who cannot get in miss a meal on campus. It never blocks anything.
 */
export function mealUse(state: GameState, placed: Placed): MealUse | null {
  const capacity = placedMeals(placed.type, scaleOf(state));
  if (capacity <= 0) return null;
  const campus = campusMeals(state);
  const demand = campus.demands.get(placed.id) ?? 0;
  const ratio = demand / capacity;
  return { capacity, demand, ratio, waiting: Math.max(0, Math.round(demand) - capacity), served: campus.served };
}

/**
 * Food & fun's dining as the campus's halls read it (DESIGN.md 83.3): the share of its students who get a meal at the
 * busiest hour. Nothing on a campus with nowhere to eat.
 */
export function campusDining(state: GameState): number {
  return campusMeals(state).served;
}

/** True when a student gets a meal on campus (83.3): somewhere to eat with room for them, by their own luck. */
export function eatsOnCampus(state: GameState, ref: StudentRef): boolean {
  const served = campusMeals(state).served;
  if (served >= 1) return true;
  if (served <= 0) return false;
  return ((hashInts(state.seed, 9601, ref.entryYear, ref.index) >>> 0) + 0.5) / 4294967297 < served;
}

/**
 * The place to eat a student at a spot goes to (DESIGN.md 83.5), from their own `luck` (0 to 1): most often the
 * nearest, by how many each can feed, and another with room when the one they came to first is full. null with nowhere
 * to eat.
 */
export function foodPlaceFor(state: GameState, x: number, y: number, luck: number): Placed | null {
  const scale = scaleOf(state);
  const campus = campusMeals(state);
  const share = (placed: Placed, px: number, py: number): number => placedMeals(placed.type, 1) * drawWeight(placed, px, py, PLACED[placed.type].radius);
  return choosePlace(ofFamily(state.map, 'dining'), x, y, luck, share, (placed) => placedMeals(placed.type, scale), campus.firsts, campus.served < 1);
}

/** True when a recreation building stands within two cells of this place. It doubles what a smoothie bar earns. */
export function besideRecreation(map: MapState, placed: Placed): boolean {
  for (const other of map.placed) {
    if (other && PLACED[other.type].family === 'recreation' && gapBetween(other, placed) <= SMOOTHIE_CELLS) return true;
  }
  return false;
}

export interface FoodTrade {
  /** Students it has to itself, once every student has been shared among the places they eat at, the nearest most. */
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

/**
 * The share of the students whose classes are going badly that the campus's study centers have room to tutor this
 * semester, 0 to 1 (DESIGN.md 83.4): every study center takes students from anywhere on the campus.
 */
export function tutoringCover(state: GameState): number {
  const centers = ofFamily(state.map, 'tutoring').length;
  if (centers === 0) return 0;
  const need = enrollment(state) * shareBelow(TUTOR_BELOW);
  return need > 0 ? Math.min(1, (centers * TUTOR_ROOM * scaleOf(state)) / need) : 1;
}

/** Students the campus's study centers can tutor a semester, and how many have classes going badly. */
export function tutoringRoom(state: GameState): { room: number; need: number } {
  return { room: ofFamily(state.map, 'tutoring').length * TUTOR_ROOM * scaleOf(state), need: Math.round(enrollment(state) * shareBelow(TUTOR_BELOW)) };
}
