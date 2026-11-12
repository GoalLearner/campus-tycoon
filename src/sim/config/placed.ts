import type { PlacedType } from '../types';
import { UTILITIES_PER_CELL, UTILITIES_PER_OPEN_CELL } from './money';

/**
 * Hand-placed buildings: what the Build menu offers. Each belongs to one
 * family, and a family has one rule (DESIGN.md section 23.1). A new look or a
 * new size inside a family is a row here and nothing else.
 *
 * Every number is a tuning target [T].
 */

export type PlacedFamily = 'library' | 'dining' | 'store' | 'recreation' | 'tutoring' | 'water' | 'medical' | 'safety' | 'parking' | 'bin' | 'seat' | 'yard' | 'landmark' | 'athletics';

export interface PlacedSpec {
  name: string;
  /** The heading it sits under in the Build menu. */
  category: 'Academics' | 'Food' | 'Campus life' | 'Recreation' | 'Water' | 'Safety & health' | 'Roads and parking' | 'Grounds' | 'Landmarks' | 'Athletics';
  family: PlacedFamily;
  w: number;
  h: number;
  /** Its price and upkeep in the small game. Read them through `placedCost` and `placedUpkeep`, which apply the campus scale. */
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
  /** Car parks only: the cars it holds in the small game once a road links it to a town street. Read it through `placedCars`. */
  cars?: number;
  /** Its utilities for a game year in the small game, where the rule by size does not fit. The pool uses far more than its size. */
  utilitiesPerYear?: number;
  /** Recreation only: how many students it holds at once in the small game. Read it through `placedRoom`. */
  capacity?: number;
  /** Food only: how many kinds of food it counts as toward variety. The food court is three. One when left out. */
  kinds?: number;
  /** Clearing it returns the whole price, whenever it is cleared. The food truck drives off. */
  fullRefund?: boolean;
}

export const PLACED: Record<PlacedType, PlacedSpec> = {
  library: {
    name: 'Library', category: 'Academics', family: 'library', w: 2, h: 2, cost: 60_000, upkeepPerYear: 4_000,
    radius: 6, strength: 14, effect: 'Lifts nearby Academic lots', sprite: 'build.library', flat: false, buildable: true,
  },
  dining: {
    name: 'Dining hall', category: 'Food', family: 'dining', w: 2, h: 1, cost: 45_000, upkeepPerYear: 6_000,
    radius: 6, strength: 1, effect: 'Feeds Housing within 6 cells', sprite: 'build.dining', flat: false, buildable: true,
  },
  coffee: {
    name: 'Coffee stand', category: 'Food', family: 'dining', w: 1, h: 1, cost: 12_000, upkeepPerYear: 1_500,
    radius: 3, strength: 1, effect: 'Feeds Housing within 3 cells', sprite: 'build.coffee', flat: false, buildable: true,
  },
  // Play stop 4b (DESIGN.md section 30). Every one is the dining rule at its own size: a look, a price and
  // a reach. Upkeep is about a twelfth of the price. When each is busy is seen on the map and never counted.
  foodcourt: {
    name: 'Food court', category: 'Food', family: 'dining', w: 2, h: 2, cost: 140_000, upkeepPerYear: 11_500,
    radius: 7, strength: 1, effect: 'Feeds Housing within 7 cells. Counts as three kinds of food', sprite: 'build.foodcourt', flat: false, buildable: true, kinds: 3,
  },
  diner: {
    name: 'Late-night diner', category: 'Food', family: 'dining', w: 2, h: 1, cost: 36_000, upkeepPerYear: 3_000,
    radius: 5, strength: 1, effect: 'Feeds Housing within 5 cells. Busiest at night', sprite: 'build.diner', flat: false, buildable: true,
  },
  burger: {
    name: 'Burger grill', category: 'Food', family: 'dining', w: 2, h: 1, cost: 30_000, upkeepPerYear: 2_500,
    radius: 5, strength: 1, effect: 'Feeds Housing within 5 cells. Busy at lunch', sprite: 'build.burger', flat: false, buildable: true,
  },
  pizza: {
    name: 'Pizza place', category: 'Food', family: 'dining', w: 2, h: 1, cost: 14_000, upkeepPerYear: 1_200,
    radius: 3, strength: 1, effect: 'Feeds Housing within 3 cells. Busiest in the evening and at night', sprite: 'build.pizza', flat: false, buildable: true,
  },
  taco: {
    name: 'Taco stand', category: 'Food', family: 'dining', w: 2, h: 1, cost: 10_000, upkeepPerYear: 850,
    radius: 3, strength: 1, effect: 'Feeds Housing within 3 cells. The cheap lunch spot', sprite: 'build.taco', flat: false, buildable: true,
  },
  smoothie: {
    name: 'Smoothie and juice bar', category: 'Food', family: 'dining', w: 1, h: 1, cost: 10_000, upkeepPerYear: 850,
    radius: 3, strength: 1, effect: 'Feeds Housing within 3 cells. Earns double with recreation within 2 cells', sprite: 'build.smoothie', flat: false, buildable: true,
  },
  convenience: {
    name: 'Convenience store', category: 'Food', family: 'dining', w: 1, h: 1, cost: 9_000, upkeepPerYear: 750,
    radius: 2, strength: 1, effect: 'Feeds Housing within 2 cells. Snacks, open late', sprite: 'build.convenience', flat: false, buildable: true,
  },
  truck: {
    name: 'Food truck', category: 'Food', family: 'dining', w: 1, h: 1, cost: 8_000, upkeepPerYear: 650,
    radius: 2, strength: 1, effect: 'Feeds Housing within 2 cells. Clear it and the whole price comes back, so moving it is free', sprite: 'build.truck', flat: false, buildable: true,
    fullRefund: true, utilitiesPerYear: 500,
  },
  // Academics (30.3). One effect each: the library's rule, the recreation rule, and tutoring.
  computerLab: {
    name: 'Computer lab', category: 'Academics', family: 'library', w: 2, h: 1, cost: 30_000, upkeepPerYear: 2_500,
    radius: 4, strength: 9, effect: 'Lifts Academic lots within 4 cells. The best lift in reach counts', sprite: 'build.computerlab', flat: false, buildable: true,
  },
  makerspace: {
    name: 'Makerspace', category: 'Academics', family: 'recreation', w: 2, h: 1, cost: 28_000, upkeepPerYear: 2_300,
    radius: 5, strength: 0.5, effect: 'Things to do and somewhere to meet within 5 cells', sprite: 'build.makerspace', flat: false, buildable: true, capacity: 16,
  },
  studyCenter: {
    name: 'Study center', category: 'Academics', family: 'tutoring', w: 2, h: 1, cost: 35_000, upkeepPerYear: 3_000,
    radius: 6, strength: 1, effect: 'Tutoring: a better GPA on the cards of students within 6 cells. It changes only student cards for now', sprite: 'build.studycenter', flat: false, buildable: true,
  },
  store: {
    name: 'Campus store', category: 'Campus life', family: 'store', w: 2, h: 1, cost: 35_000, upkeepPerYear: 3_000,
    radius: 0, strength: 0, effect: 'Earns more on a busy path', sprite: 'build.store', flat: false, buildable: true,
  },
  gym: {
    name: 'Gym', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 55_000, upkeepPerYear: 5_000,
    radius: 8, strength: 0.6, effect: 'Raises happiness within 8 cells', sprite: 'build.gym', flat: false, buildable: true, capacity: 40,
  },
  track: {
    name: 'Track and field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 120_000, upkeepPerYear: 8_000,
    radius: 6, strength: 0.7, effect: 'Raises happiness within 6 cells', sprite: 'build.track', flat: false, buildable: true, capacity: 30,
  },
  pool: {
    name: 'Aquatics pool', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 40_000, upkeepPerYear: 4_000,
    radius: 5, strength: 0.5, effect: 'Raises happiness within 5 cells', sprite: 'build.pool', flat: true, buildable: true, utilitiesPerYear: 9_000, capacity: 30,
  },
  courts: {
    name: 'Outdoor courts', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 18_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness within 4 cells', sprite: 'build.courts', flat: true, buildable: true, capacity: 8,
  },
  field: {
    name: 'Recreation field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 15_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness within 4 cells', sprite: 'build.field', flat: true, buildable: true, capacity: 22,
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
  medical: {
    name: 'Medical Center', category: 'Safety & health', family: 'medical', w: 2, h: 2, cost: 90_000, upkeepPerYear: 9_000,
    radius: 8, strength: 1, effect: 'Treats injuries within 8 cells', sprite: 'build.medical', flat: false, buildable: true,
  },
  safety: {
    name: 'Campus Safety', category: 'Safety & health', family: 'safety', w: 2, h: 2, cost: 80_000, upkeepPerYear: 8_000,
    radius: 8, strength: 1, effect: 'Handles mischief within 8 cells', sprite: 'build.safety', flat: false, buildable: true,
  },
  parking: {
    name: 'Parking lot', category: 'Roads and parking', family: 'parking', w: 2, h: 1, cost: 20_000, upkeepPerYear: 1_000,
    radius: 0, strength: 0, effect: 'Lets 20 locals drive in. Needs a road to a town street', sprite: 'build.parking', flat: false, buildable: true, cars: 20,
  },
  garage: {
    name: 'Parking structure', category: 'Roads and parking', family: 'parking', w: 2, h: 2, cost: 160_000, upkeepPerYear: 6_000,
    radius: 0, strength: 0, effect: 'Lets 100 locals drive in. Needs a road to a town street', sprite: 'build.garage', flat: false, buildable: true, cars: 100,
  },
  bin: {
    name: 'Trash bin', category: 'Grounds', family: 'bin', w: 1, h: 1, cost: 1_500, upkeepPerYear: 0,
    radius: 3, strength: 0, effect: 'Catches litter within 3 cells. Workers empty it', sprite: 'grounds.bin', flat: false, buildable: true,
  },
  bench: {
    name: 'Bench', category: 'Grounds', family: 'seat', w: 1, h: 1, cost: 2_500, upkeepPerYear: 0,
    radius: 3, strength: 0, effect: 'Somewhere to sit for the lots within 3 cells', sprite: 'grounds.bench', flat: false, buildable: true,
  },
  table: {
    name: 'Picnic table', category: 'Grounds', family: 'seat', w: 1, h: 1, cost: 4_000, upkeepPerYear: 0,
    radius: 3, strength: 0, effect: 'Seating, and more social life near dining or Academic lots', sprite: 'grounds.table', flat: false, buildable: true,
  },
  yard: {
    name: 'Facilities Yard', category: 'Grounds', family: 'yard', w: 2, h: 1, cost: 60_000, upkeepPerYear: 0,
    radius: 16, strength: 0, effect: 'Its workers empty bins, sweep and fix within 16 cells', sprite: 'build.yard', flat: false, buildable: true,
  },
  // The plot the stadium stands on. It is free, there is one, and what is drawn on it follows the tier.
  stadium: {
    name: 'Stadium plot', category: 'Athletics', family: 'athletics', w: 2, h: 3, cost: 0, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Where the stadium is built, once a season of sell-outs earns one', sprite: 'build.stadium', flat: false, buildable: true,
    utilitiesPerYear: 0,
  },
  admin: {
    name: 'Administration building', category: 'Landmarks', family: 'landmark', w: 2, h: 2, cost: 0, upkeepPerYear: 0,
    radius: 0, strength: 0, effect: 'Where the university began', sprite: 'build.admin', flat: false, buildable: false,
  },
};

/** The order of the Build menu. */
/** What a building costs on a campus of a given scale (DESIGN.md 35.7). */
export function placedCost(type: PlacedType, scale: number): number {
  return PLACED[type].cost * scale;
}

/** Its upkeep for a game year. */
export function placedUpkeep(type: PlacedType, scale: number): number {
  return PLACED[type].upkeepPerYear * scale;
}

/** Its own utilities bill for a game year, where it has one. undefined for a building billed by its size. */
export function placedUtilities(type: PlacedType, scale: number): number | undefined {
  const bill = PLACED[type].utilitiesPerYear;
  return bill === undefined ? undefined : bill * scale;
}

/** How many students a place to play holds at once. 0 for anything else. */
export function placedRoom(type: PlacedType, scale: number): number {
  return (PLACED[type].capacity ?? 0) * scale;
}

/** How many cars a car park holds. 0 for anything else. */
export function placedCars(type: PlacedType, scale: number): number {
  return (PLACED[type].cars ?? 0) * scale;
}

export const BUILD_ORDER: readonly PlacedType[] = [
  'library', 'computerLab', 'studyCenter', 'makerspace',
  'dining', 'foodcourt', 'diner', 'burger', 'pizza', 'taco', 'coffee', 'smoothie', 'convenience', 'truck',
  'store', 'gym', 'track', 'pool', 'courts', 'field', 'pondSmall', 'pondMedium', 'pondLarge', 'medical', 'safety', 'parking', 'garage', 'yard',
  'stadium',
];

/** A pond cell counts as this share of a quad cell in the one green-space input, which is capped. */
export const POND_GREEN_SHARE = 0.8;
/** A Housing lot needs dining in reach before it can grow to this stage. */
export const DINING_STAGE = 2;

/**
 * Food earns a little from foot traffic (DESIGN.md 30.2). Each student in
 * reach of food is worth this much a game year, shared equally among the
 * places that reach them, so a second stall beside the first halves what each
 * earns [T].
 */
export const FOOD_INCOME_PER_STUDENT = 30;
/** A lot with this many kinds of food in reach gets VARIETY_BONUS added to its Food & fun, never past full [T]. */
export const VARIETY_KINDS = 3;
export const VARIETY_BONUS = 0.1;
/** The smoothie and juice bar earns this many times as much with a recreation building within SMOOTHIE_CELLS [T]. */
export const SMOOTHIE_CELLS = 2;
export const SMOOTHIE_TIMES = 2;
/** Tutoring: what a study center in reach adds to the GPA on a student's card [T]. Nothing reads GPA until layer 2. */
export const TUTORING_GPA = 0.3;

/** The store's passers-by: students living or studying within this many path cells of its door. */
export const STORE_REACH_CELLS = 10;
/** Share of the beds and seats in reach that pass the door. */
export const STORE_PASSING_SHARE = 0.5;
export const STORE_INCOME_PER_PASSER = 45;

/**
 * Recreation fills up (the owner, 2026-11-11). Of the students a building
 * reaches, this share want to play at the busiest hour of the day [T].
 */
export const PLAY_SHARE = 0.05;
/**
 * A long wait takes a little off what a building is worth to Happiness: none
 * of it while there is room, falling to this share of its lift when demand
 * is CROWD_WORST_AT times what it holds, and no further [T].
 */
export const CROWD_LIFT_FLOOR = 0.7;
export const CROWD_WORST_AT = 2;
/** The wait a student talks about at a building that crowded. */
export const WAIT_MINUTES_AT_WORST = 20;

/** Places to meet: one recreation building is worth this many quad cells of social life. */
export const SOCIAL_SPOTS_PER_RECREATION = 4;

/**
 * Utilities for a hand-placed building, for a game year: by the cells it
 * stands on. Something that lies open on the ground, a court or a field,
 * has lights and little else. Water, bins and seats use nothing.
 */
export function utilitiesOf(type: PlacedType, scale = 1): number {
  const spec = PLACED[type];
  const own = placedUtilities(type, scale);
  if (own !== undefined) return own;
  if (spec.family === 'water' || spec.family === 'bin' || spec.family === 'seat' || spec.family === 'landmark') return 0;
  return spec.w * spec.h * (spec.flat ? UTILITIES_PER_OPEN_CELL : UTILITIES_PER_CELL) * scale;
}
