import type { GameState, MapState } from './types';

/**
 * The campus scale (DESIGN.md 35.7): one whole number, kept in the save, that
 * says how many of the small game's students each bed, seat, parking space,
 * place to play and town house stands for. It is 1 for every campus but the
 * model campus.
 *
 * Everything counted in heads or tied to a building is multiplied by it at
 * the point where its number is read: beds and seats, places at the gym and
 * the fields, parking spaces, town places, stadium seats, the applicant pool
 * and its ceiling, and every price, upkeep and utility bill. A campus at
 * scale 32 then behaves like the tuned small game with every count 32 times
 * larger, and its balance is inherited, not tuned a second time.
 *
 * Nothing counted for each student changes: tuition, cost per student, staff
 * ratios, Happiness, desirability, reach in cells, and every timer.
 */
export function scaleOf(of: GameState | MapState): number {
  const scale = 'map' in of ? of.map.scale : of.scale;
  return scale > 1 ? scale : 1;
}

/**
 * A head count as the small game would see it: for rules that are about how
 * busy a campus is, not how big, and for everything drawn on the map, which
 * is a sample and must not grow with the scale.
 */
export function smallCount(of: GameState | MapState, heads: number): number {
  return heads / scaleOf(of);
}
