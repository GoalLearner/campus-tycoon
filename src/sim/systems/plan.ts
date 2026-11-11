import { STAGES } from '../config/buildings';
import { enrollment, openCapacity, pendingCapacity } from '../selectors';
import { ZONES, type GameState, type Zone } from '../types';
import { bedsForWaitlist, bedsWanted, expectedClass, studentsWanted } from './demand';

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
