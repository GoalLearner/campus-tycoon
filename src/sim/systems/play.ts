import { scaleOf } from '../scale';
import { placedRoom } from '../config/placed';
import { CROWD_LIFT_FLOOR, CROWD_WORST_AT, PLACED, PLAY_SHARE, WAIT_MINUTES_AT_WORST } from '../config/placed';
import { enrollment } from '../selectors';
import type { GameState, MapState, Placed } from '../types';
import { unionAt } from './bigBuilds';

/**
 * How busy each recreation building is (the owner, 2026-11-11). A court, a
 * field, a pool, the track and the gym each hold so many students at once.
 * Demand comes from the students around them. When it is over what a
 * building holds, the rest wait their turn, and a long wait takes a little
 * off what that building is worth to Happiness. A second building nearby
 * shares the demand and clears the line.
 *
 * The numbers are for the busiest hour of the day, never for the hour it is
 * now: the simulation does not read the clock, so a player at night and a
 * player in the afternoon get the same campus (DESIGN.md 28.1). The map shows
 * who is playing right now, for show, from these same numbers.
 *
 * Nothing here is stored but the geometry (`map.care.play`), which changes
 * only when the player builds. Waiting never blocks anything.
 */

/** Cells between a lot and the nearest cell of a building. */
function gap(placed: Placed, x: number, y: number): number {
  return Math.max(Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1)), Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1)));
}

/** How many students a recreation building holds at once. 0 for anything else. */
export function playCapacity(placed: Placed, scale = 1): number {
  return PLACED[placed.type].family === 'recreation' ? placedRoom(placed.type, scale) : 0;
}

/**
 * Share the lots out among the recreation buildings that reach them. A lot's
 * students split their play between every building in reach, in proportion to
 * what each holds. The result, for each building, is how many lots' worth of
 * students it has to itself. Called after every action, with the rest of `care`.
 */
export function playLoads(map: MapState, recreation: readonly Placed[]): Record<number, number> {
  const load: Record<number, number> = {};
  for (const placed of recreation) load[placed.id] = 0;
  if (recreation.length === 0) return load;
  const scale = scaleOf(map);
  const { width, height, cells } = map;
  const near: Placed[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]!.kind !== 'lot') continue;
      near.length = 0;
      let holds = 0;
      for (const placed of recreation) {
        if (gap(placed, x, y) > PLACED[placed.type].radius) continue;
        near.push(placed);
        holds += playCapacity(placed, scale);
      }
      if (holds <= 0) continue;
      for (const placed of near) load[placed.id]! += playCapacity(placed, scale) / holds;
    }
  }
  return load;
}

/** What a building's lift is worth when demand is this many times what it holds: all of it up to full, falling to a floor at twice full. */
export function crowdLift(ratio: number): number {
  if (!(ratio > 1)) return 1;
  const over = Math.min(1, (ratio - 1) / (CROWD_WORST_AT - 1));
  return 1 - (1 - CROWD_LIFT_FLOOR) * over;
}

export interface PlayUse {
  /** Students it holds at once. */
  capacity: number;
  /** Students who want to play here at the busiest hour. */
  demand: number;
  /** Playing at the busiest hour: demand, as far as there is room. */
  playing: number;
  /** Waiting their turn at the busiest hour. */
  waiting: number;
  /** Demand over capacity. */
  ratio: number;
  /** What is left of its lift to Happiness, from the floor to 1. */
  lift: number;
}

/** How busy a recreation building is at the busiest hour. null for anything else. */
export function playUse(state: GameState, placed: Placed): PlayUse | null {
  const capacity = playCapacity(placed, scaleOf(state));
  if (capacity <= 0) return null;
  const care = state.map.care;
  const lots = care.lots > 0 ? (care.play?.[placed.id] ?? 0) : 0;
  const demand = care.lots > 0 ? (lots * enrollment(state) * PLAY_SHARE) / care.lots : 0;
  const ratio = demand / capacity;
  const playing = Math.min(capacity, Math.round(demand));
  return { capacity, demand, playing, waiting: Math.max(0, Math.round(demand) - capacity), ratio, lift: crowdLift(ratio) };
}

/** Minutes a student waits at a crowded building at the busiest hour, to the nearest five. 0 when nobody waits. */
export function waitMinutes(use: PlayUse): number {
  if (use.waiting <= 0) return 0;
  const over = Math.min(1, (use.ratio - 1) / (CROWD_WORST_AT - 1));
  return Math.max(5, Math.round((WAIT_MINUTES_AT_WORST * over) / 5) * 5);
}

/**
 * How much there is to do near a spot, 0 to 1. Every recreation building in
 * reach adds its share, less whatever a long wait takes off it, up to one cap.
 */
export function recreationAt(state: GameState, x: number, y: number): number {
  const map = state.map;
  const ids = map.care?.byFamily?.recreation;
  let sum = 0;
  if (ids) {
    for (const id of ids) {
      const placed = map.placed[id];
      if (!placed || gap(placed, x, y) > PLACED[placed.type].radius) continue;
      sum += PLACED[placed.type].strength * (playUse(state, placed)?.lift ?? 1);
    }
  } else {
    for (const placed of map.placed) {
      if (!placed || PLACED[placed.type].family !== 'recreation' || gap(placed, x, y) > PLACED[placed.type].radius) continue;
      sum += PLACED[placed.type].strength * (playUse(state, placed)?.lift ?? 1);
    }
  }
  // The Student Union (DESIGN.md 45): somewhere to meet over a wide circle. It has no line to wait in.
  sum += unionAt(map, x, y);
  return Math.min(1, sum);
}

/** The most crowded recreation building that reaches a spot, when students are waiting at it. null when none is. */
export function crowdedNear(state: GameState, x: number, y: number): { placed: Placed; use: PlayUse } | null {
  let worst: { placed: Placed; use: PlayUse } | null = null;
  for (const placed of state.map.placed) {
    if (!placed || PLACED[placed.type].family !== 'recreation' || gap(placed, x, y) > PLACED[placed.type].radius) continue;
    const use = playUse(state, placed);
    if (use && use.waiting > 0 && (!worst || use.ratio > worst.use.ratio)) worst = { placed, use };
  }
  return worst;
}

/** One line for a recreation building's card: how full at the busiest hour, who waits, and what would help. */
export function playLine(use: PlayUse): string {
  const playing = Math.round(Math.min(use.demand, use.capacity));
  if (use.waiting > 0) {
    const advice = use.ratio >= 1.25 ? ' Build another nearby to share the crowd.' : '';
    return `Full, ${use.waiting} waiting at peak.${advice}`;
  }
  if (playing >= use.capacity) return `Full at peak, and nobody waiting.`;
  if (playing >= use.capacity * 0.6) return `Busy: ${playing} of ${use.capacity} playing at peak.`;
  return playing > 0 ? `Room to spare: ${playing} of ${use.capacity} playing at peak.` : `Nobody near enough to use it yet. It holds ${use.capacity}.`;
}
