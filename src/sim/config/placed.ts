import type { PlacedType } from '../types';
import { DECOR_POINT, DECOR_REACH } from './decor';
import { UTILITIES_PER_CELL, UTILITIES_PER_OPEN_CELL } from './money';
import { COMMONS_POINTS, HONORS_RATE, UNION_REACH, UNION_STRENGTH, WELCOME_MORE } from './bigBuilds';
import { LAB_REPUTATION, LAB_SEAT_REACH } from './labs';
import { CHAPTER_BEDS, CHAPTER_COST, CHAPTER_NOISE_REACH, CHAPTER_UPKEEP } from './greek';

/** What a research lab does, for its card in the Build menu. */
const LAB_EFFECT = `Findings to collect, and discoveries of its own. Faster near lecture halls. Reputation ${LAB_REPUTATION} point higher`;

/**
 * Hand-placed buildings: what the Build menu offers. Each belongs to one
 * family, and a family has one rule (DESIGN.md section 23.1). A new look or a
 * new size inside a family is a row here and nothing else.
 *
 * Every number is a tuning target [T].
 */

export type PlacedFamily = 'library' | 'dining' | 'store' | 'recreation' | 'tutoring' | 'water' | 'medical' | 'safety' | 'parking' | 'bin' | 'seat' | 'rack' | 'yard' | 'landmark' | 'athletics' | 'reward' | 'decor' | 'era' | 'lab' | 'chapter';

export interface PlacedSpec {
  name: string;
  /** The heading it sits under in the Build menu. */
  category: 'Academics' | 'Food' | 'Campus life' | 'Recreation' | 'Water' | 'Safety & health' | 'Roads and parking' | 'Grounds' | 'Landmarks' | 'Athletics' | 'Earned' | 'Decor' | 'Flagship' | 'Legacy' | 'Greek Row';
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
  /**
   * Recreation only: how far it draws its players from, in cells, where that is wider than the reach it lifts
   * Happiness over: a full court or a pitch, where intramural games bring players from across the campus (DESIGN.md
   * 72.4). `radius` when left out.
   */
  draws?: number;
  /** Food only: how many kinds of food it counts as toward variety. The food court is three. One when left out. */
  kinds?: number;
  /** Food only: how many students it can feed at the busiest hour in the small game. Read it through `placedMeals`. */
  meals?: number;
  /** Clearing it returns the whole price, whenever it is cleared. The food truck drives off. */
  fullRefund?: boolean;
}

/** [T] How far a rank goal's building lifts the look of the campus, in cells from its wall. */
const REWARD_REACH = 6;

export const PLACED: Record<PlacedType, PlacedSpec> = {
  library: {
    name: 'Library', category: 'Academics', family: 'library', w: 2, h: 2, cost: 60_000, upkeepPerYear: 4_000,
    radius: 6, strength: 14, effect: 'Lifts nearby Academic lots', sprite: 'build.library', flat: false, buildable: true,
  },
  dining: {
    name: 'Dining hall', category: 'Food', family: 'dining', w: 2, h: 1, cost: 45_000, upkeepPerYear: 6_000,
    radius: 6, strength: 1, effect: 'Feeds students across campus', sprite: 'build.dining', flat: false, buildable: true, meals: 80,
  },
  coffee: {
    name: 'Coffee stand', category: 'Food', family: 'dining', w: 1, h: 1, cost: 12_000, upkeepPerYear: 1_500,
    radius: 3, strength: 1, effect: 'Feeds students across campus', sprite: 'build.coffee', flat: false, buildable: true, meals: 16,
  },
  // Play stop 4b (DESIGN.md section 30). Every one is the dining rule at its own size: a look, a price and
  // a reach. Upkeep is about a twelfth of the price. When each is busy is seen on the map and never counted.
  foodcourt: {
    name: 'Food court', category: 'Food', family: 'dining', w: 2, h: 2, cost: 140_000, upkeepPerYear: 11_500,
    radius: 7, strength: 1, effect: 'Feeds students across campus. Counts as three kinds of food', sprite: 'build.foodcourt', flat: false, buildable: true, meals: 140, kinds: 3,
  },
  diner: {
    name: 'Late-night diner', category: 'Food', family: 'dining', w: 2, h: 1, cost: 36_000, upkeepPerYear: 3_000,
    radius: 5, strength: 1, effect: 'Feeds students across campus. Busiest at night', sprite: 'build.diner', flat: false, buildable: true, meals: 45,
  },
  burger: {
    name: 'Burger grill', category: 'Food', family: 'dining', w: 2, h: 1, cost: 30_000, upkeepPerYear: 2_500,
    radius: 5, strength: 1, effect: 'Feeds students across campus. Busy at lunch', sprite: 'build.burger', flat: false, buildable: true, meals: 40,
  },
  pizza: {
    name: 'Pizza place', category: 'Food', family: 'dining', w: 2, h: 1, cost: 14_000, upkeepPerYear: 1_200,
    radius: 3, strength: 1, effect: 'Feeds students across campus. Busiest in the evening and at night', sprite: 'build.pizza', flat: false, buildable: true, meals: 24,
  },
  taco: {
    name: 'Taco stand', category: 'Food', family: 'dining', w: 2, h: 1, cost: 10_000, upkeepPerYear: 850,
    radius: 3, strength: 1, effect: 'Feeds students across campus. The cheap lunch spot', sprite: 'build.taco', flat: false, buildable: true, meals: 20,
  },
  smoothie: {
    name: 'Smoothie and juice bar', category: 'Food', family: 'dining', w: 1, h: 1, cost: 10_000, upkeepPerYear: 850,
    radius: 3, strength: 1, effect: 'Feeds students across campus. Earns double with recreation within 2 cells', sprite: 'build.smoothie', flat: false, buildable: true, meals: 14,
  },
  convenience: {
    name: 'Convenience store', category: 'Food', family: 'dining', w: 1, h: 1, cost: 9_000, upkeepPerYear: 750,
    radius: 2, strength: 1, effect: 'Feeds students across campus. Snacks, open late', sprite: 'build.convenience', flat: false, buildable: true, meals: 12,
  },
  truck: {
    name: 'Food truck', category: 'Food', family: 'dining', w: 1, h: 1, cost: 8_000, upkeepPerYear: 650,
    radius: 2, strength: 1, effect: 'Feeds students across campus. Clear it and the whole price comes back, so moving it is free', sprite: 'build.truck', flat: false, buildable: true, meals: 12,
    fullRefund: true, utilitiesPerYear: 500,
  },
  // Academics (30.3). One effect each: the library's rule, the recreation rule, and tutoring.
  computerLab: {
    name: 'Computer lab', category: 'Academics', family: 'library', w: 2, h: 1, cost: 30_000, upkeepPerYear: 2_500,
    radius: 4, strength: 9, effect: 'Lifts Academic lots within 4 cells. The best lift in reach counts', sprite: 'build.computerlab', flat: false, buildable: true,
  },
  makerspace: {
    name: 'Makerspace', category: 'Academics', family: 'recreation', w: 2, h: 1, cost: 28_000, upkeepPerYear: 2_300,
    radius: 5, strength: 0.5, effect: 'Things to do and somewhere to meet for students who use it', sprite: 'build.makerspace', flat: false, buildable: true, capacity: 16,
  },
  studyCenter: {
    name: 'Study center', category: 'Academics', family: 'tutoring', w: 2, h: 1, cost: 35_000, upkeepPerYear: 3_000,
    radius: 6, strength: 1, effect: 'Tutoring for any student whose class is going badly', sprite: 'build.studycenter', flat: false, buildable: true,
  },
  store: {
    name: 'Campus store', category: 'Campus life', family: 'store', w: 2, h: 1, cost: 35_000, upkeepPerYear: 3_000,
    radius: 0, strength: 0, effect: 'Earns more on a busy path', sprite: 'build.store', flat: false, buildable: true,
  },
  gym: {
    name: 'Gym', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 55_000, upkeepPerYear: 5_000,
    radius: 8, strength: 0.6, effect: 'Raises happiness for students who use it', sprite: 'build.gym', flat: false, buildable: true, capacity: 40,
  },
  track: {
    name: 'Track and field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 120_000, upkeepPerYear: 8_000,
    radius: 6, strength: 0.7, effect: 'Raises happiness for students who use it', sprite: 'build.track', flat: false, buildable: true, capacity: 30,
  },
  pool: {
    name: 'Aquatics pool', category: 'Recreation', family: 'recreation', w: 2, h: 1, cost: 40_000, upkeepPerYear: 4_000,
    radius: 5, strength: 0.5, effect: 'Raises happiness for students who use it', sprite: 'build.pool', flat: true, buildable: true, utilitiesPerYear: 9_000, capacity: 30,
  },
  courts: {
    name: 'Outdoor courts', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 18_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness for students who use it', sprite: 'build.courts', flat: true, buildable: true, capacity: 8,
  },
  field: {
    name: 'Recreation field', category: 'Recreation', family: 'recreation', w: 2, h: 2, cost: 15_000, upkeepPerYear: 1_000,
    radius: 4, strength: 0.4, effect: 'Raises happiness for students who use it', sprite: 'build.field', flat: true, buildable: true, capacity: 22,
  },
  // Full-size courts and a pitch (DESIGN.md 72), with room for a real game: their capacity is who plays at once. They draw
  // their players from wider than they lift Happiness over, as intramural games do (72.4).
  basketball: {
    name: 'Basketball court', category: 'Recreation', family: 'recreation', w: 2, h: 3, cost: 26_000, upkeepPerYear: 1_500,
    radius: 5, strength: 0.45, effect: 'Raises happiness for students who use it', sprite: 'build.basketball', flat: true, buildable: true, capacity: 10, draws: 8,
  },
  tennis: {
    name: 'Tennis court', category: 'Recreation', family: 'recreation', w: 2, h: 3, cost: 22_000, upkeepPerYear: 1_200,
    radius: 4, strength: 0.4, effect: 'Raises happiness for students who use it', sprite: 'build.tennis', flat: true, buildable: true, capacity: 4, draws: 6,
  },
  volleyball: {
    name: 'Volleyball court', category: 'Recreation', family: 'recreation', w: 2, h: 3, cost: 20_000, upkeepPerYear: 1_200,
    radius: 4, strength: 0.4, effect: 'Raises happiness for students who use it', sprite: 'build.volleyball', flat: true, buildable: true, capacity: 12, draws: 6,
  },
  soccer: {
    name: 'Soccer pitch', category: 'Recreation', family: 'recreation', w: 3, h: 4, cost: 32_000, upkeepPerYear: 2_000,
    radius: 5, strength: 0.5, effect: 'Raises happiness for students who use it', sprite: 'build.soccer', flat: true, buildable: true, capacity: 10, draws: 14,
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
  // Every decoration (DESIGN.md 42.5). One row for all of them: each is one cell, costs nothing to keep and
  // lifts how the campus looks near it. Which decoration a placed one is, its name and its drawing are in
  // config/decor.ts. It is not bought here: it comes from a shelf, an order or the Workshop.
  decor: {
    name: 'Decoration', category: 'Decor', family: 'decor', w: 1, h: 1, cost: 0, upkeepPerYear: 0,
    radius: DECOR_REACH, strength: DECOR_POINT, effect: `Lifts how the campus looks within ${DECOR_REACH} cells`, sprite: 'decoration.flowers', flat: false, buildable: false, utilitiesPerYear: 0,
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
  // The living campus, L5 (DESIGN.md 64.6): riders park at it. It is for show and costs only its price: no upkeep, no
  // utilities, no opening, nothing in any sum. Without enough of them bikes lean on trees and walls.
  rack: {
    name: 'Bike rack', category: 'Grounds', family: 'rack', w: 1, h: 1, cost: 1_200, upkeepPerYear: 0,
    radius: 4, strength: 0, effect: 'Somewhere to park bikes and scooters within 4 cells', sprite: 'grounds.rack', flat: false, buildable: true, utilitiesPerYear: 0,
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
  // A building for each rank goal (DESIGN.md section 40). One rule for all eight: each lifts how the campus
  // looks around it, by `strength` points of desirability at its wall, fading to nothing just past its reach.
  // They cost nothing to place and nothing to keep. A later goal's lifts a little more [T]. None is sold: a
  // goal reached puts its building in the Build menu, and it is there again if the building is ever cleared.
  fountain: {
    name: "Founders' Fountain", category: 'Earned', family: 'reward', w: 2, h: 2, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 6, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.fountain', flat: true, buildable: true, utilitiesPerYear: 0,
  },
  postOffice: {
    name: 'Campus Post Office', category: 'Earned', family: 'reward', w: 2, h: 1, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 7, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.post', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  cinema: {
    name: 'Campus Cinema', category: 'Earned', family: 'reward', w: 2, h: 2, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 8, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.cinema', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  radio: {
    name: 'Campus Radio', category: 'Earned', family: 'reward', w: 2, h: 1, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 9, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.radio', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  museum: {
    name: 'University Museum', category: 'Earned', family: 'reward', w: 2, h: 2, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 10, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.museum', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  alumniHouse: {
    name: 'Alumni House', category: 'Earned', family: 'reward', w: 2, h: 1, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 11, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.alumni', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  broadcastTower: {
    name: 'Broadcast Tower', category: 'Earned', family: 'reward', w: 1, h: 1, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 12, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.broadcast', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  bellTower: {
    name: 'Bell Tower', category: 'Earned', family: 'reward', w: 1, h: 1, cost: 0, upkeepPerYear: 0,
    radius: REWARD_REACH, strength: 14, effect: `Lifts how the campus looks within ${REWARD_REACH} cells`, sprite: 'reward.bell', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  // What the eras open (DESIGN.md 41.3 and 41.4, as built in section 45). One of each, bought once its era has
  // come, and built over real days. Each moves one number the game already has, named in config/bigBuilds.ts.
  // Prices are on the small campus's count and follow the campus scale: on the model campus, 28 times these.
  studentUnion: {
    name: 'Student Union', category: 'Flagship', family: 'era', w: 2, h: 2, cost: 1_200_000, upkeepPerYear: 300_000,
    radius: UNION_REACH, strength: UNION_STRENGTH, effect: 'Somewhere to meet for every student', sprite: 'era.union', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  honorsCollege: {
    name: 'Honors College', category: 'Flagship', family: 'era', w: 2, h: 1, cost: 1_000_000, upkeepPerYear: 250_000,
    radius: 0, strength: 0, effect: `Lifts the graduation rate the academic rating reads by ${Math.round(HONORS_RATE * 100)} points, across the campus`, sprite: 'era.honors', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  welcomeCenter: {
    name: 'Welcome Center', category: 'Flagship', family: 'era', w: 2, h: 1, cost: 800_000, upkeepPerYear: 220_000,
    radius: 0, strength: 0, effect: `Each step of marketing brings ${Math.round(WELCOME_MORE * 100)} in a hundred more`, sprite: 'era.welcome', flat: false, buildable: true, utilitiesPerYear: 0,
  },
  foundersCommons: {
    name: "Founders' Commons", category: 'Legacy', family: 'era', w: 3, h: 3, cost: 9_000_000, upkeepPerYear: 40_000,
    radius: 0, strength: 0, effect: `Grounds ${COMMONS_POINTS} points better for every student, wherever they live`, sprite: 'era.commons', flat: true, buildable: true, utilitiesPerYear: 0,
  },
  // The research labs (DESIGN.md 49): one for each field. Lecture-hall seats within its reach make it work faster.
  labSciences: {
    name: 'Sciences lab', category: 'Academics', family: 'lab', w: 2, h: 2, cost: 50_000, upkeepPerYear: 4_000,
    radius: LAB_SEAT_REACH, strength: 0, effect: LAB_EFFECT, sprite: 'lab.sciences', flat: false, buildable: true,
  },
  labEngineering: {
    name: 'Engineering lab', category: 'Academics', family: 'lab', w: 2, h: 2, cost: 50_000, upkeepPerYear: 4_000,
    radius: LAB_SEAT_REACH, strength: 0, effect: LAB_EFFECT, sprite: 'lab.engineering', flat: false, buildable: true,
  },
  labHealth: {
    name: 'Health lab', category: 'Academics', family: 'lab', w: 2, h: 2, cost: 50_000, upkeepPerYear: 4_000,
    radius: LAB_SEAT_REACH, strength: 0, effect: LAB_EFFECT, sprite: 'lab.health', flat: false, buildable: true,
  },
  // Greek Row (DESIGN.md 51): a chapter house is a chapter. Its reach is how far its noise carries.
  chapterHouse: {
    name: 'Chapter house', category: 'Greek Row', family: 'chapter', w: 1, h: 1, cost: CHAPTER_COST, upkeepPerYear: CHAPTER_UPKEEP,
    radius: CHAPTER_NOISE_REACH, strength: 0, sprite: 'chapter.0', flat: false, buildable: true,
    effect: `A chapter: ${CHAPTER_BEDS} beds, and Food & fun for its members. Likes the stadium and another house beside it. Noisy within ${CHAPTER_NOISE_REACH} cells`,
  },
};

/**
 * The building each rank goal gives, in the order of the goals: the Top 175
 * first, the Top 10 last (DESIGN.md 40.1, the owner's sheet). A goal reached
 * puts its building in the Build menu, free, for as long as it is not on the
 * map.
 */
export const RANK_REWARDS: readonly PlacedType[] = ['fountain', 'postOffice', 'cinema', 'radio', 'museum', 'alumniHouse', 'broadcastTower', 'bellTower'];

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

/** How many students a place to eat can feed at the busiest hour. 0 for anything else. */
export function placedMeals(type: PlacedType, scale: number): number {
  return (PLACED[type].meals ?? 0) * scale;
}

/** How many cars a car park holds. 0 for anything else. */
export function placedCars(type: PlacedType, scale: number): number {
  return (PLACED[type].cars ?? 0) * scale;
}

export const BUILD_ORDER: readonly PlacedType[] = [
  'library', 'computerLab', 'studyCenter', 'makerspace',
  'dining', 'foodcourt', 'diner', 'burger', 'pizza', 'taco', 'coffee', 'smoothie', 'convenience', 'truck',
  'store', 'gym', 'track', 'pool', 'courts', 'basketball', 'tennis', 'volleyball', 'field', 'soccer', 'pondSmall', 'pondMedium', 'pondLarge', 'medical', 'safety', 'parking', 'garage', 'yard', 'rack',
  'stadium',
];

/** A pond cell counts as this share of a quad cell in the one green-space input, which is capped. */
export const POND_GREEN_SHARE = 0.8;
/** A Housing lot needs somewhere to eat on campus before it can grow to this stage (DESIGN.md 83.3). */
export const DINING_STAGE = 2;

/**
 * Food earns a little from the students who eat there (DESIGN.md 30.2, 83.3). Each student is worth this much a game
 * year, shared among the places they use, the nearest most, so a second stall beside the first halves what each
 * earns [T].
 */
export const FOOD_INCOME_PER_STUDENT = 30;
/**
 * A campus with this many kinds of food adds VARIETY_BONUS to every student's Food & fun, never past full [T] (83.3).
 * A tenth when it reached only the lots with three kinds in reach; half that now it reaches every student, so its
 * average stays where it was (0.03 on the model campus before, 0.026 now).
 */
export const VARIETY_KINDS = 3;
export const VARIETY_BONUS = 0.05;
/** The smoothie and juice bar earns this many times as much with a recreation building within SMOOTHIE_CELLS [T]. */
export const SMOOTHIE_CELLS = 2;
export const SMOOTHIE_TIMES = 2;
/**
 * Tutoring (DESIGN.md 83.4): a student whose classes are going badly, their usual average under TUTOR_BELOW, goes to any
 * study center with room. Each study center tutors TUTOR_ROOM students a semester in the small game [T].
 */
export const TUTOR_BELOW = 2.5;
export const TUTOR_ROOM = 400;

/** A Capacity row for places to eat or play reads Tight from this share of what they hold at the busiest hour [T]. */
export const BUSY_FROM = 0.9;

/** The store's passers-by: students living or studying within this many path cells of its door. */
export const STORE_REACH_CELLS = 10;
/** Share of the beds and seats in reach that pass the door. */
export const STORE_PASSING_SHARE = 0.5;
export const STORE_INCOME_PER_PASSER = 45;

/**
 * Recreation fills up (the owner, 2026-11-11). Of the students who do a pastime, this share are at it at the busiest
 * hour of the day [T] (DESIGN.md 83.2): four in five of recreation's users go at least once a week (NIRSA, 2014), a
 * regular about three times for an hour and a half, so about one in twenty of them is in at any open hour, and twice
 * that at the busiest.
 */
export const PLAY_SHARE = 0.1;
/**
 * The wait at a full place: a student who comes at the busiest hour talks of WAIT_MINUTES_AT_WORST when demand is
 * CROWD_WORST_AT times what it holds. Who cannot get in misses its lift (DESIGN.md 83.2) [T].
 */
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
  if (spec.family === 'water' || spec.family === 'bin' || spec.family === 'seat' || spec.family === 'rack' || spec.family === 'landmark') return 0;
  return spec.w * spec.h * (spec.flat ? UTILITIES_PER_OPEN_CELL : UTILITIES_PER_CELL) * scale;
}
