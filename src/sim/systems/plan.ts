import { STAGES } from '../config/buildings';
import { WALK_MINUTES_PER_CELL } from '../config/desirability';
import { COST } from '../config/money';
import { PLACED } from '../config/placed';
import { TOWN_GATE_ROWS, TOWN_WALK_EXTRA_MINUTES, TOWN_WALK_MAX_MINUTES, TOWN_X } from '../config/town';
import { enrollment, openCapacity, pendingCapacity } from '../selectors';
import { ZONES, type GameState, type Zone } from '../types';
import { bedsForWaitlist, bedsWanted, expectedClass, localsNeedingBeds, studentsWanted } from './demand';
import { stepsToClass } from './desirability';
import { freeTownPlaces, hoodCapacity, hoodWalks, ownedAt, townPlaces } from './town';

/**
 * The answer to "what should I build?". It turns a shortage into a number of
 * lots, so the HUD can say exactly what would seat the students who are
 * waiting, or the next class when nobody is waiting.
 */

export interface ZonePlan {
  /** Beds or seats missing right now. */
  short: number;
  /** How many of those are already under construction. */
  building: number;
  /** New lots that would cover the rest, at the size a new lot opens with. */
  lots: number;
  /** Beds or seats a new lot opens with. */
  perLot: number;
}

export interface RoomPlan {
  /** Who the plan makes room for. */
  goal: 'waitlist' | 'nextClass';
  /** How many students that is. */
  students: number;
  zones: Record<Zone, ZonePlan>;
}

/** True while students who were turned away are still waiting for a place. */
export function waitlistOpen(state: GameState): boolean {
  return state.admissions.waitlist > 0 && state.clock.tick < state.admissions.waitlistUntilTick;
}

export function roomPlan(state: GameState): RoomPlan {
  const waiting = waitlistOpen(state);
  const students = waiting ? state.admissions.waitlist : expectedClass(state);
  // With a waitlist open the room is needed now. Otherwise it is needed by the next intake.
  // Beds are for everyone who does not live in town. Seats are for everyone.
  const wanted: Record<Zone, number> = waiting
    ? { housing: bedsForWaitlist(state), academic: enrollment(state) + students }
    : { housing: bedsWanted(state), academic: studentsWanted(state) };

  const zones = {} as Record<Zone, ZonePlan>;
  for (const zone of ZONES) {
    const perLot = STAGES[zone][0]!.capacity;
    const needed = wanted[zone];
    const short = Math.max(0, needed - openCapacity(state, zone));
    const building = Math.min(short, pendingCapacity(state, zone));
    zones[zone] = { short, building, lots: Math.ceil((short - building) / perLot), perLot };
  }
  return { goal: waiting ? 'waitlist' : 'nextClass', students, zones };
}

// ------------------------------------------------- fixes for a bed shortage --

export interface HousingFixes {
  /** Beds still to find for the plan's goal, after what is already being built. 0 when Housing is not short. */
  bedsShort: number;
  /** Zone more Housing lots: how many would cover the shortage, and what they cost. */
  lots: { count: number; perLot: number; cost: number } | null;
  /**
   * Lay a path to a street of the town, so its locals walk in and need no bed.
   * `cells` and `minutes` assume the straightest path from the nearest walk already on campus.
   */
  path: { hood: number; street: string; gate: [number, number]; cells: number; cost: number; minutes: number; brings: number } | null;
  /** Build parking with a road to a street, so locals too far to walk drive in. */
  parking: { spaces: number; lots: number; cost: number; brings: number } | null;
}

/**
 * What would clear a shortage of beds, each with its numbers: more Housing
 * lots, a path to a named street, or parking spaces (DESIGN.md 25.2). Each fix
 * stands by itself: `brings` is how many students it would let live in town,
 * which is how many fewer beds would be wanted.
 */
export function housingFixes(state: GameState): HousingFixes {
  const plan = roomPlan(state);
  const need = plan.zones.housing;
  const bedsShort = need.short - need.building;
  if (bedsShort <= 0) return { bedsShort: 0, lots: null, path: null, parking: null };
  const map = state.map;
  const lots = { count: need.lots, perLot: need.perLot, cost: need.lots * COST.zoneLot };

  // Locals among those the plan is for who have no place in town yet. Only they can be helped by a path or parking.
  const stuck = plan.goal === 'waitlist' ? Math.max(0, state.admissions.waitlistLocals - freeTownPlaces(state)) : localsNeedingBeds(state);
  if (stuck <= 0) return { bedsShort, lots, path: null, parking: null };
  const places = townPlaces(map);

  // A path: for each street nobody walks from, the shortest walk a straight path from campus would give.
  const steps = stepsToClass(map);
  const gateX = TOWN_X - 1;
  let path: HousingFixes['path'] = null;
  for (const hood of map.town.neighbourhoods) {
    if (hoodWalks(map, hood)) continue;
    // A street that is already joined is too long a walk. A path will not fix that.
    if ((map.town.access.walk[hood.id] ?? -1) >= 0) continue;
    let best: { cells: number; minutes: number; gate: [number, number] } | null = null;
    for (let y = hood.row - TOWN_GATE_ROWS; y <= hood.row + TOWN_GATE_ROWS; y++) {
      if (y < 0 || y >= map.height || !ownedAt(map, gateX, y)) continue;
      const kind = map.cells[y * map.width + gateX]!.kind;
      if (kind !== 'empty' && kind !== 'road') continue;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i]! <= 0) continue;
        const x = i % map.width;
        const cells = Math.abs(x - gateX) + Math.abs((i - x) / map.width - y);
        const minutes = (steps[i]! + cells + 1) * WALK_MINUTES_PER_CELL + TOWN_WALK_EXTRA_MINUTES;
        if (!best || minutes < best.minutes || (minutes === best.minutes && cells < best.cells)) best = { cells, minutes, gate: [gateX, y] };
      }
    }
    if (!best || best.minutes > TOWN_WALK_MAX_MINUTES) continue;
    // Its places stop needing a parking space and start counting whether or not there is one.
    const capacity = hoodCapacity(hood);
    const after = places.walk + capacity + Math.min(places.driveWanted - capacity, places.spaces);
    const brings = Math.min(stuck, after - places.total);
    if (brings <= 0) continue;
    if (!path || brings > path.brings || (brings === path.brings && best.cells < path.cells)) {
      path = { hood: hood.id, street: hood.name, gate: best.gate, cells: best.cells, cost: best.cells * COST.path, minutes: best.minutes, brings };
    }
  }

  // Parking: one space for each local who could drive in from a street too far to walk.
  let parking: HousingFixes['parking'] = null;
  const spaces = Math.min(stuck, places.driveWanted - places.spaces);
  if (spaces > 0) {
    const perLot = PLACED.parking.cars ?? 1;
    const count = Math.ceil(spaces / perLot);
    parking = { spaces, lots: count, cost: count * PLACED.parking.cost, brings: spaces };
  }
  return { bedsShort, lots, path, parking };
}
