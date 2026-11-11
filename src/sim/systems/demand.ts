import { calendarAt, GRADUATION_TICK_IN_YEAR, SPRING_INTAKE_TICK_IN_YEAR } from '../calendar';
import {
  BED_NEED,
  DESIRABILITY_DRAW_FLOOR,
  DESIRABILITY_DRAW_SPAN,
  FOUNDING_CLASS,
  POOL_CEILING,
  SPRING_SHARE,
  WORD_OF_MOUTH,
} from '../config/demand';
import { FIRST_INTAKE_TICK } from '../config/time';
import { enrollment, openCapacity, pendingCapacity } from '../selectors';
import type { GameState, Season, Zone } from '../types';

/**
 * The forecast: who is expected at the next intake, and how much room each
 * zone would need to take them all. Growth chases this number, and the demand
 * bars show it. See DESIGN.md section 7.
 */

/** How much of one zone a single student needs. */
export const NEED: Record<Zone, number> = { housing: BED_NEED, academic: 1 };

/** Average desirability of every lot that has a building, from 0 to 100. */
export function averageDesirability(state: GameState): number {
  const { cells, score } = state.map;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.buildingId !== null) {
      sum += score[i]!;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

export function nextIntakeSeason(state: GameState): Season {
  const tick = state.clock.tick;
  if (tick < FIRST_INTAKE_TICK) return 'fall';
  return calendarAt(tick).tickInYear < SPRING_INTAKE_TICK_IN_YEAR ? 'spring' : 'fall';
}

/** A fall class as the campus would draw it today. */
export function fallClassDraw(state: GameState): number {
  const students = enrollment(state);
  const draw = DESIRABILITY_DRAW_FLOOR + DESIRABILITY_DRAW_SPAN * (averageDesirability(state) / 100);
  const pool = Math.max(FOUNDING_CLASS, students * WORD_OF_MOUTH) * draw;
  return Math.min(POOL_CEILING, Math.round(pool));
}

/**
 * The class a given intake would bring if there were room for everyone.
 * The very first fall class is the founding class.
 */
export function classSize(state: GameState, season: Season, founding: boolean): number {
  if (founding) return FOUNDING_CLASS;
  const fall = fallClassDraw(state);
  return season === 'fall' ? fall : Math.round(fall * SPRING_SHARE);
}

/** Students expected to enrol at the next intake if there is room for all of them. */
export function expectedClass(state: GameState): number {
  const founding = state.clock.tick < FIRST_INTAKE_TICK;
  return classSize(state, nextIntakeSeason(state), founding);
}

/** Students who will still be enrolled when the next intake arrives. */
export function continuingStudents(state: GameState): number {
  const tick = state.clock.tick;
  if (tick < FIRST_INTAKE_TICK) return 0;
  const { tickInYear } = calendarAt(tick);
  // Seniors leave at graduation, which falls between the spring intake and the next fall.
  const seniorsLeaveFirst =
    tickInYear >= SPRING_INTAKE_TICK_IN_YEAR && tickInYear < GRADUATION_TICK_IN_YEAR;
  return enrollment(state) - (seniorsLeaveFirst ? state.cohorts[3] : 0);
}

/** Everyone the campus would hold right after the next intake, waitlist included. */
export function studentsWanted(state: GameState): number {
  return continuingStudents(state) + expectedClass(state) + state.admissions.waitlist;
}

/** Beds or seats needed to take every student wanted. */
export function capacityWanted(state: GameState, zone: Zone): number {
  return Math.ceil(studentsWanted(state) * NEED[zone]);
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

/** Students who fit in a zone's open capacity. */
export function studentsThatFit(state: GameState, zone: Zone): number {
  return Math.floor(openCapacity(state, zone) / NEED[zone] + 1e-9);
}

/** The zone that would cap the next class, or null when everyone fits. */
export function bottleneck(state: GameState): Zone | null {
  const wanted = studentsWanted(state);
  const housing = studentsThatFit(state, 'housing');
  const academic = studentsThatFit(state, 'academic');
  if (Math.min(housing, academic) >= wanted) return null;
  return housing < academic ? 'housing' : 'academic';
}
