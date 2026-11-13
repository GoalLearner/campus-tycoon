import type { DayPeriod } from './daylight';
import { hashInts, studentKey, type StudentRef } from '../sim';

/**
 * Who the people in an activity are (DESIGN.md 13.12).
 *
 * Every figure the map draws in a game, a line, at a table or in one of the
 * small scenes is one enrolled student, so a tap on them opens the ordinary
 * student card. Who it is comes from the game's seed, the place and the
 * figure's own spot in it, as a walker's identity comes from the seed: the
 * same student for as long as they are there, and the same again when the
 * map is opened later that day.
 *
 * For show only. Nothing here is saved, nothing changes a number, and nothing
 * in `src/sim` reads it.
 */

/** A figure at a building: on its court, pitch, track or water, by its door, in its line, at a seat, among its stalls. */
export type ActivityRole = 'court' | 'field' | 'runner' | 'swimmer' | 'door' | 'line' | 'seat' | 'stall';
/** A figure in one of the small scenes of section 33.4. */
export type SceneRole = 'clubHost' | 'clubVisitor' | 'pickup' | 'picnic' | 'busker' | 'tailgate' | 'band' | 'storm';

const SALT = 7919;

/**
 * The student at one spot of one place. `pool` is the students walkers are
 * drawn from. `busy` says who is somewhere else on the map already, out
 * walking or in another activity, so nobody is in two places: the next
 * student the seed gives is taken instead. If the seed's first eight are all
 * somewhere else, the first stands here too, which is the one case where a
 * student can be seen twice. null only when no student is enrolled.
 */
export function findStudent(seed: number, pool: readonly StudentRef[], place: number, spot: number, busy: (key: string) => boolean = () => false): StudentRef | null {
  if (pool.length === 0) return null;
  for (let tries = 0; tries < 8; tries++) {
    const ref = pool[hashInts(seed, place, spot, tries, SALT) % pool.length]!;
    if (!busy(studentKey(ref))) return ref;
  }
  return pool[hashInts(seed, place, spot, 0, SALT) % pool.length]!;
}

/** What someone is doing at a seat, by the part of the player's day. Nobody in the pack can sit, so they stand at it. */
const AT_SEAT: Record<'bench' | 'table', Record<DayPeriod, string>> = {
  bench: { morning: 'Having coffee at a bench', afternoon: 'Reading at a bench', evening: 'Talking with friends at a bench', night: 'Out late at a bench' },
  table: { morning: 'Having breakfast at a picnic table', afternoon: 'Studying at a picnic table', evening: 'Talking with friends at a picnic table', night: 'Out late at a picnic table' },
};

export interface ActivityPlace {
  /** The building's type and its name as the game says it: 'courts' and 'Outdoor courts'. */
  type: string;
  name: string;
  /** True for a place to eat. */
  food: boolean;
  /** A seat: its kind of food is busy near it now, and a study group is at it now. */
  eating?: boolean;
  studying?: boolean;
}

/** The "Doing now" line of a figure at a building, in plain words. */
export function activityWords(role: ActivityRole, place: ActivityPlace, period: DayPeriod): string {
  switch (role) {
    case 'court':
      return `Playing on the ${place.name}`;
    case 'field':
      return `In a match on the ${place.name}`;
    case 'runner':
      return 'Running laps on the track';
    case 'swimmer':
      return `Swimming at the ${place.name}`;
    case 'door':
      return `On the way into the ${place.name}`;
    case 'stall':
      return `Getting food at the ${place.name}`;
    case 'line':
      return place.food ? `In line at the ${place.name}` : `Waiting for a turn at the ${place.name}`;
    case 'seat': {
      const seat = place.type === 'bench' ? 'bench' : 'table';
      if (place.studying && seat === 'table') return 'Studying with a group at a picnic table';
      if (place.eating) return seat === 'bench' ? 'Eating at a bench' : 'Eating at a picnic table';
      return AT_SEAT[seat][period];
    }
  }
}

const IN_SCENE: Record<SceneRole, string> = {
  clubHost: "Running a club's table",
  clubVisitor: "Stopping at a club's table",
  pickup: 'Keeping a ball in the air with friends on the quad',
  picnic: 'Having a picnic on the grass',
  busker: 'Playing music by the Coffee stand',
  tailgate: 'At a tailgate before the game',
  band: 'Marching with the band',
  storm: 'On the field after the win',
};

/** The "Doing now" line of a figure in a small scene. */
export function sceneWords(role: SceneRole): string {
  return IN_SCENE[role];
}

/** A `Doing` for someone staying put: the card shows the words as they are, and leaves Follow off. */
export const STAYING = 'now:';

/** The words of a staying `Doing`, or null for any other. */
export function stayingWords(doing: string | null): string | null {
  return doing !== null && doing.startsWith(STAYING) ? doing.slice(STAYING.length) : null;
}

/** Someone found under a tap, or looked up by their key: who, how they are drawn, and what they are doing. */
export interface Stander {
  student: StudentRef | null;
  /** The figure they are drawn as: a player on a court wears the kit, whatever they walk about in. */
  look: number;
  words: string;
  /** Where they stand, in the world. */
  x: number;
  y: number;
  /** How far the tap was from the middle of the figure. 0 when looked up by key. */
  far: number;
  /** The depth their figure is drawn at, for a ring under them. */
  depth: number;
}
