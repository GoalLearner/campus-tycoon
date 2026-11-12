import { applicantsLift } from './boosts';
import { scaleOf } from '../scale';
import { calendarAt, GRADUATION_TICK_IN_YEAR, SPRING_INTAKE_TICK_IN_YEAR } from '../calendar';
import {
  DESIRABILITY_DRAW_FLOOR,
  DESIRABILITY_DRAW_SPAN,
  FOUNDING_CLASS,
  POOL_CEILING,
  SPRING_SHARE,
  WORD_OF_MOUTH,
} from '../config/demand';
import { FIRST_INTAKE_TICK } from '../config/time';
import { LOCAL_SHARE } from '../config/town';
import { enrollment, openCapacity, pendingCapacity } from '../selectors';
import type { GameState, Season, Zone } from '../types';
import { marketingLift } from './budget';
import { athleticLift } from './football';
import { freeTownPlaces, offCampusNow, townPlaces } from './town';

/**
 * The forecast: who is expected at the next intake, and how much room each
 * zone would need to take them all. Growth chases this number, and the demand
 * bars show it. See DESIGN.md sections 7 and 25.2.
 *
 * Every student needs a classroom seat. A bed is needed by everyone except
 * the locals who live in town and have a way to class: a path short enough to
 * walk, or a parking space a road reaches.
 */

/** Average desirability of every lot that has a building, from 0 to 100. */
export function averageDesirability(state: GameState): number {
  // Read from the list of buildings, not from every cell: most of the map is not a lot, and this runs in catch-up.
  const { buildings, score, width } = state.map;
  let sum = 0;
  let n = 0;
  for (const building of buildings) {
    if (!building) continue;
    sum += score[building.y * width + building.x]!;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

export function nextIntakeSeason(state: GameState): Season {
  const tick = state.clock.tick;
  if (tick < FIRST_INTAKE_TICK) return 'fall';
  return calendarAt(state.clock).tickInYear < SPRING_INTAKE_TICK_IN_YEAR ? 'spring' : 'fall';
}

/** A fall class as the campus would draw it today. */
export function fallClassDraw(state: GameState): number {
  const students = enrollment(state);
  const draw = DESIRABILITY_DRAW_FLOOR + DESIRABILITY_DRAW_SPAN * (averageDesirability(state) / 100);
  // Recruiting and marketing lifts applications. The ceiling is the wall it pushes against.
  // Athletic standing lifts it too, and so does a TV deal: football's applicants (DESIGN.md 10.1).
  // The least a campus draws and the most are head counts, so they follow the campus scale (DESIGN.md 35.7).
  // A profile in a college guide, a spring concert: what the desk has set going, for a few days.
  const scale = scaleOf(state);
  const pool = Math.max(FOUNDING_CLASS * scale, students * WORD_OF_MOUTH) * draw * (1 + marketingLift(state)) * (1 + athleticLift(state)) * (1 + applicantsLift(state));
  return Math.min(POOL_CEILING * scale, Math.round(pool));
}

/**
 * The class a given intake would bring if there were room for everyone.
 * The very first fall class is the founding class.
 */
export function classSize(state: GameState, season: Season, founding: boolean): number {
  if (founding) return FOUNDING_CLASS * scaleOf(state);
  const fall = fallClassDraw(state);
  return season === 'fall' ? fall : Math.round(fall * SPRING_SHARE);
}

/** Students expected to enrol at the next intake if there is room for all of them. */
export function expectedClass(state: GameState): number {
  const founding = state.clock.tick < FIRST_INTAKE_TICK;
  return classSize(state, nextIntakeSeason(state), founding);
}

/** Of a group of newcomers, how many are locals who would live in town if they had a way to class. */
export function localsAmong(count: number): number {
  return Math.round(count * LOCAL_SHARE);
}

/** Students who live in a dorm now. */
export function dormStudents(state: GameState): number {
  return enrollment(state) - offCampusNow(state);
}

/** True when the seniors graduate before the next intake arrives. */
function seniorsLeaveFirst(state: GameState): boolean {
  const tick = state.clock.tick;
  if (tick < FIRST_INTAKE_TICK) return false;
  const { tickInYear } = calendarAt(state.clock);
  // Graduation falls between the spring intake and the next fall.
  return tickInYear >= SPRING_INTAKE_TICK_IN_YEAR && tickInYear < GRADUATION_TICK_IN_YEAR;
}

/** Students who will still be enrolled when the next intake arrives. */
export function continuingStudents(state: GameState): number {
  if (state.clock.tick < FIRST_INTAKE_TICK) return 0;
  return enrollment(state) - (seniorsLeaveFirst(state) ? state.cohorts[3] : 0);
}

/** Everyone the campus would hold right after the next intake, waitlist included. */
export function studentsWanted(state: GameState): number {
  return continuingStudents(state) + expectedClass(state) + state.admissions.waitlist;
}

/**
 * Beds needed to take every student wanted: everyone except those who live in
 * town. Locals already enrolled keep their place. Locals among the newcomers
 * take whatever places in town are still free, and the rest need a bed.
 */
export function bedsWanted(state: GameState): number {
  const leaving = seniorsLeaveFirst(state);
  const offStaying = offCampusNow(state) - (leaving ? state.offCampus[3] : 0);
  const dormStaying = continuingStudents(state) - offStaying;
  const free = Math.max(0, townPlaces(state.map).total - offStaying);
  const expected = expectedClass(state);
  const newcomers = expected + state.admissions.waitlist;
  const newLocals = localsAmong(expected) + state.admissions.waitlistLocals;
  return Math.max(0, dormStaying + newcomers - Math.min(newLocals, free));
}

/** Beds needed right now to take everyone on the waitlist. */
export function bedsForWaitlist(state: GameState): number {
  const a = state.admissions;
  return dormStudents(state) + a.waitlist - Math.min(a.waitlistLocals, freeTownPlaces(state));
}

/** Beds or seats needed to take every student wanted. */
export function capacityWanted(state: GameState, zone: Zone): number {
  return zone === 'housing' ? bedsWanted(state) : studentsWanted(state);
}

/** Beds or seats still to find, counting what is already under construction. */
export function shortage(state: GameState, zone: Zone): number {
  return capacityWanted(state, zone) - openCapacity(state, zone) - pendingCapacity(state, zone);
}

/**
 * A demand bar. Above zero is a shortage and below zero is a surplus, as a
 * share of what is wanted. It counts open capacity only, so the bar moves when
 * a building actually opens.
 */
export function demandBar(state: GameState, zone: Zone): number {
  const wanted = capacityWanted(state, zone);
  if (wanted === 0) return 0;
  const value = (wanted - openCapacity(state, zone)) / wanted;
  return Math.max(-1, Math.min(1, value));
}

/** The zone that would cap the next class, or null when everyone fits. Each missing bed or seat turns one student away. */
export function bottleneck(state: GameState): Zone | null {
  const bedsShort = bedsWanted(state) - openCapacity(state, 'housing');
  const seatsShort = studentsWanted(state) - openCapacity(state, 'academic');
  if (bedsShort <= 0 && seatsShort <= 0) return null;
  return bedsShort >= seatsShort ? 'housing' : 'academic';
}

/** Locals among the students wanted who have no place in town and so need a bed. 0 when the town takes them all. */
export function localsNeedingBeds(state: GameState): number {
  const leaving = seniorsLeaveFirst(state);
  const offStaying = offCampusNow(state) - (leaving ? state.offCampus[3] : 0);
  const free = Math.max(0, townPlaces(state.map).total - offStaying);
  const newLocals = localsAmong(expectedClass(state)) + state.admissions.waitlistLocals;
  return Math.max(0, newLocals - free);
}
