import type { PlacedType } from '../types';

/**
 * Hand-placed buildings: what the Build menu offers. Each belongs to one
 * family, and a family has one rule (DESIGN.md section 23.1). A new look or a
 * new size inside a family is a row here and nothing else.
 *
 * Every number is a tuning target [T].
 */

export type PlacedFamily = 'library' | 'dining' | 'store' | 'recreation' | 'water' | 'landmark';

export interface PlacedSpec {
  name: string;
  /** The heading it sits under in the Build menu. */
  category: 'Academics' | 'Campus life' | 'Recreation' | 'Water' | 'Landmarks';
  family: PlacedFamily;
  w: number;
  h: number;
  cost: number;
  upkeepPerYear: number;
  /** Cells its effect reaches from its edge. 0 for none. */
  radius: number;
  /** How much of its family's effect it brings to a spot in reach. */
  strength: number;
  /** One line for the menu card. */
  effect: string;
  /** Sprite name in the art manifest. */
  sprite: string;
  /** Lies flat on the ground: nothing is hidden behind it. */
  flat: boolean;
  /** False for things that come with the campus and cannot be bought or cleared. */
  buildable: boolean;
}

export const PLACED: Record<PlacedType, PlacedSpec> = {
  library: {
    name: 'Library', category: 'Academics', family: 'library', w: 2, h: 2, cost: 60_000, upkeepPerYear: 4_000,
    radius: 6, strength: 14, effect: 'Lifts nearby Academic lots', sprite: 'build.library', flat: false, buildable: true,
  },
  dining: {
    name: 'Dining hall', category: 'Campus life', family: 'dining', w: 2, h: 1, cost: 45_000, upkeepPerYear: 6_000,
    radius: 6, strength: 1, effect: 'Feeds Housing within 6 cells', sprite: 'build.dining', flat: false, buildable: true,
  },
  coffee: {
    name: 'Coffee stand', category: 'Campus life', family: 'dining', w: 1, h: 1, cost: 12_000, upkeepPerYear: 1_500,
    radius: 3, strength: 1, effect: 'Feeds Housing within 3 cells', sprite: 'build.coffee', flat: false, buildable: true,
  },
  store: {
    name: 'Campus store', category: 'Campus life', family: 'store', w: 2, h: 1, cost: 35_000, upkeepPerYear: 3_000,
    radius: 0, strength: 0, effect: 'Earns more on a busy path', sprite: 'build.store', flat: false, buildable: true,
  },
  gym: {
    name: 'Gym', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 55_000, upkeepPerYear: 5_000,
    radius: 8, strength: 0.6, effect: 'Raises happiness within 8 cells', sprite: 'build.gym', flat: false, buildable: true,
  },
  track: {
    name: 'Track and field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 120_000, upkeepPerYear: 8_000,
    radius: 6, strength: 0.7, effect: 'Raises happiness within 6 cells', sprite: 'build.track', flat: false, buildable: true,
  },
  pool: {
    name: 'Aquatics pool', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 40_000, upkeepPerYear: 4_000,
    radius: 5, strength: 0.5, effect: 'Raises happiness within 5 cells', sprite: 'build.pool', flat: true, buildable: true,
  },
  courts: {
    name: 'Outdoor courts', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 18_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness within 4 cells', sprite: 'build.courts', flat: true, buildable: true,
  },
  field: {
    name: 'Recreation field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 15_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness within 4 cells', sprite: 'build.field', flat: true, buildable: true,
  },
  pondSmall: {
    name: 'Small pond', category: 'Water', family: 'water', w: 1, h: 1, cost: 8_000, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Green space. Every zone likes water', sprite: 'pond.small', flat: true, buildable: true,
  },
  pondMedium: {
    name: 'Pond', category: 'Water', family: 'water', w: 2, h: 2, cost: 24_000, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Green space. Every zone likes water', sprite: 'pond.medium', flat: true, buildable: true,
  },
  pondLarge: {
    name: 'Lake', category: 'Water', family: 'water', w: 3, h: 3, cost: 50_000, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Green space. Every zone likes water', sprite: 'pond.large', flat: true, buildable: true,
  },
  admin: {
    name: 'Administration building', category: 'Landmarks', family: 'landmark', w: 2, h: 2, cost: 0, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Where the university began', sprite: 'build.admin', flat: false, buildable: false,
  },
};

/** The order of the Build menu. */
export const BUILD_ORDER: readonly PlacedType[] = [
  'library', 'dining', 'coffee', 'store', 'gym', 'track', 'pool', 'courts', 'field', 'pondSmall', 'pondMedium', 'pondLarge',
];

/** A pond cell counts as this share of a quad cell in the one green-space input, which is capped. */
export const POND_GREEN_SHARE = 0.8;
/** A Housing lot needs dining in reach before it can grow to this stage. */
export const DINING_STAGE = 2;

/** The store's passers-by: students living or studying within this many path cells of its door. */
export const STORE_REACH_CELLS = 10;
/** Share of the beds and seats in reach that pass the door. */
export const STORE_PASSING_SHARE = 0.5;
export const STORE_INCOME_PER_PASSER = 45;

/** Places to meet: one recreation building is worth this many quad cells of social life. */
export const SOCIAL_SPOTS_PER_RECREATION = 4;
