/**
 * Decorations, the Workshop and the seasonal sets (DESIGN.md 42.5 and 42.6,
 * as built from 42.20). Only a game with goals has them.
 *
 * Everything here is data. A decoration is a name, a drawing and where it
 * comes from. A new one is one more row here and one more line in the art
 * recipe: nothing else names a decoration.
 *
 * Bonus only. A decoration lifts how the campus looks near it a little, and
 * does nothing else. One bought with Gold Seals does exactly what a free one
 * does. Nothing is ever sold or lost: putting one away sends it to storage.
 * Every size is [T].
 */

/** Where a decoration comes from. Cash is on the small campus's count, as every price is. */
export type DecorHome =
  /** The Decor shelf of the Build menu, for cash, once its level is reached. */
  | { kind: 'shelf'; level: number; cost: number }
  /** A reward from the town's orders. */
  | { kind: 'town' }
  /** The shelf for Gold Seals. */
  | { kind: 'seals'; price: number }
  /** Made in the Workshop, once its level has brought the recipe. `hours` is how long one takes. */
  | { kind: 'workshop'; level: number; hours: number; cost: number }
  /** On the shelf for cash while its season's set is live, and every year after. */
  | { kind: 'season'; season: string; cost: number }
  /** Kept back for the Founder's Pack of the store (42.7). It cannot be got yet. */
  | { kind: 'founder' };

export interface DecorSpec {
  id: string;
  name: string;
  /** As a sentence names one: "a flower box". */
  a: string;
  /** Sprite name in the art manifest. A banner that takes the school's colour has one for each colour, `sprite.colour`. */
  sprite: string;
  /** The heading it sits under. */
  group: string;
  home: DecorHome;
  /** Runs one way as drawn, and can be turned to run the other. */
  turns?: true;
  /** Takes the school's colour. */
  colour?: true;
}

const shelf = (level: number, cost: number): DecorHome => ({ kind: 'shelf', level, cost });
const made = (level: number, hours: number, cost: number): DecorHome => ({ kind: 'workshop', level, hours, cost });
const seals = (price: number): DecorHome => ({ kind: 'seals', price });
const season = (set: string, cost: number): DecorHome => ({ kind: 'season', season: set, cost });
const TOWN: DecorHome = { kind: 'town' };

const MONUMENTS = 'Statues and monuments';
const WATER = 'Fountains and water';
const FLOWERS = 'Flower beds and planters';
const LIGHTS = 'Lamps and lights';
const BANNERS = 'Banners and flags';
const SMALL = 'Seating and small things';
const OCCASIONS = 'Game day and commencement';

/** The forty the owner chose from the art sheet on 2026-11-13, and the two seasonal sets his packs can fill. */
export const DECOR: readonly DecorSpec[] = [
  { id: 'statue', name: 'Stone statue', a: 'a stone statue', sprite: 'decoration.statue', group: MONUMENTS, home: { kind: 'founder' } },
  { id: 'sculpture', name: 'Bronze sculpture', a: 'a bronze sculpture', sprite: 'decoration.sculpture', group: MONUMENTS, home: seals(6) },
  { id: 'cup', name: "Champions' cup", a: "a champions' cup", sprite: 'decoration.cup', group: MONUMENTS, home: seals(10) },
  { id: 'windmill', name: 'Windmill', a: 'a windmill', sprite: 'decoration.windmill', group: MONUMENTS, home: seals(14) },
  { id: 'lookout', name: 'Lookout tower', a: 'a lookout tower', sprite: 'decoration.lookout', group: MONUMENTS, home: seals(12) },
  { id: 'waterTower', name: 'Water tower', a: 'a water tower', sprite: 'decoration.waterTower', group: MONUMENTS, home: shelf(60, 12_000) },

  { id: 'fountain', name: 'Stone fountain', a: 'a stone fountain', sprite: 'decoration.fountain', group: WATER, home: seals(8) },
  { id: 'reflectingPool', name: 'Reflecting pool', a: 'a reflecting pool', sprite: 'decoration.reflectingPool', group: WATER, home: seals(8) },
  { id: 'gardenPool', name: 'Garden pool', a: 'a garden pool', sprite: 'decoration.gardenPool', group: WATER, home: shelf(45, 8_000) },
  { id: 'wishingWell', name: 'Wishing well', a: 'a wishing well', sprite: 'decoration.wishingWell', group: WATER, home: shelf(50, 6_000) },
  { id: 'stoneWell', name: 'Stone well', a: 'a stone well', sprite: 'decoration.stoneWell', group: WATER, home: shelf(28, 4_000) },

  { id: 'flowers', name: 'Red flowers', a: 'red flowers', sprite: 'decoration.flowers', group: FLOWERS, home: shelf(2, 600) },
  { id: 'flowerBox', name: 'Flower box', a: 'a flower box', sprite: 'decoration.flowerBox', group: FLOWERS, home: TOWN },
  { id: 'planters', name: 'Three planters', a: 'three planters', sprite: 'decoration.planters', group: FLOWERS, home: shelf(18, 1_500) },
  { id: 'topiary', name: 'Topiary', a: 'a topiary', sprite: 'decoration.topiary', group: FLOWERS, home: shelf(27, 1_800) },
  { id: 'hedge', name: 'Clipped hedge', a: 'a clipped hedge', sprite: 'decoration.hedge', group: FLOWERS, home: shelf(10, 1_200) },
  { id: 'hedgePlanter', name: 'Hedge in a planter', a: 'a hedge in a planter', sprite: 'decoration.hedgePlanter', group: FLOWERS, home: TOWN },
  { id: 'cottageGarden', name: 'Cottage garden', a: 'a cottage garden', sprite: 'decoration.cottageGarden', group: FLOWERS, home: TOWN },
  { id: 'flowerStall', name: 'Flower stall', a: 'a flower stall', sprite: 'decoration.flowerStall', group: FLOWERS, home: TOWN },

  { id: 'globeLamp', name: 'Globe lamp', a: 'a globe lamp', sprite: 'decoration.globeLamp', group: LIGHTS, home: shelf(6, 900) },
  { id: 'stringLights', name: 'String lights', a: 'a string of lights', sprite: 'decoration.stringLights', group: LIGHTS, home: made(8, 24, 800) },
  { id: 'lantern', name: 'Lantern', a: 'a lantern', sprite: 'decoration.lantern', group: LIGHTS, home: shelf(17, 700) },
  { id: 'tallLamp', name: 'Tall lamp', a: 'a tall lamp', sprite: 'decoration.tallLamp', group: LIGHTS, home: shelf(37, 1_500) },

  { id: 'banner', name: 'School banner', a: 'a school banner', sprite: 'decoration.banner', group: BANNERS, home: made(15, 24, 600), colour: true },
  { id: 'bunting', name: 'Bunting', a: 'a run of bunting', sprite: 'decoration.bunting', group: BANNERS, home: made(19, 24, 900), turns: true },
  { id: 'ribbonPole', name: 'Ribbon pole', a: 'a ribbon pole', sprite: 'decoration.ribbonPole', group: BANNERS, home: made(25, 36, 1_500) },

  { id: 'sofa', name: 'Sofa bench', a: 'a sofa bench', sprite: 'decoration.sofa', group: SMALL, home: shelf(31, 2_500) },
  { id: 'tableSet', name: 'Table and chairs', a: 'a table and chairs', sprite: 'decoration.tableSet', group: SMALL, home: shelf(22, 2_500) },
  { id: 'parasol', name: 'Garden parasol', a: 'a garden parasol', sprite: 'decoration.parasol', group: SMALL, home: shelf(21, 1_500) },
  { id: 'swingSet', name: 'Swing set', a: 'a swing set', sprite: 'decoration.swingSet', group: SMALL, home: shelf(40, 5_000) },
  { id: 'campusMap', name: 'Campus map', a: 'a campus map', sprite: 'decoration.campusMap', group: SMALL, home: shelf(33, 2_000) },
  { id: 'mailbox', name: 'Mailbox', a: 'a mailbox', sprite: 'decoration.mailbox', group: SMALL, home: shelf(14, 1_000) },
  { id: 'gumball', name: 'Gumball machine', a: 'a gumball machine', sprite: 'decoration.gumball', group: SMALL, home: TOWN },
  { id: 'boulder', name: 'Boulder', a: 'a boulder', sprite: 'decoration.boulder', group: SMALL, home: shelf(12, 800) },
  { id: 'steppingStones', name: 'Stepping stones', a: 'stepping stones', sprite: 'decoration.steppingStones', group: SMALL, home: shelf(24, 1_200) },
  { id: 'stoneWall', name: 'Low stone wall', a: 'a low stone wall', sprite: 'decoration.stoneWall', group: SMALL, home: shelf(29, 1_500), turns: true },

  { id: 'ropeLine', name: 'Gold rope line', a: 'a gold rope line', sprite: 'decoration.ropeLine', group: OCCASIONS, home: made(30, 36, 1_500), turns: true },
  { id: 'stage', name: 'Stage', a: 'a stage', sprite: 'decoration.stage', group: OCCASIONS, home: made(35, 48, 3_000) },
  { id: 'marquee', name: 'Marquee', a: 'a marquee', sprite: 'decoration.marquee', group: OCCASIONS, home: made(42, 48, 3_000) },
  { id: 'stall', name: 'Stall', a: 'a stall', sprite: 'decoration.stall', group: OCCASIONS, home: TOWN },

  // ---- the fall set
  { id: 'pumpkins', name: 'Pumpkins', a: 'pumpkins', sprite: 'decoration.pumpkins', group: 'Fall', home: season('fall', 800) },
  { id: 'hayBales', name: 'Hay bales', a: 'hay bales', sprite: 'decoration.hayBales', group: 'Fall', home: season('fall', 1_000) },
  { id: 'haystack', name: 'Haystack', a: 'a haystack', sprite: 'decoration.haystack', group: 'Fall', home: season('fall', 900) },
  { id: 'appleCrate', name: 'Apple crate', a: 'an apple crate', sprite: 'decoration.appleCrate', group: 'Fall', home: season('fall', 800) },
  { id: 'autumnHedge', name: 'Autumn hedge', a: 'an autumn hedge', sprite: 'decoration.autumnHedge', group: 'Fall', home: season('fall', 1_200), turns: true },

  // ---- the summer set
  { id: 'lounger', name: 'Sun lounger', a: 'a sun lounger', sprite: 'decoration.lounger', group: 'Summer', home: season('summer', 1_200) },
  { id: 'beachParasol', name: 'Beach parasol', a: 'a beach parasol', sprite: 'decoration.beachParasol', group: 'Summer', home: season('summer', 1_200) },
  { id: 'lifeguardChair', name: 'Lifeguard chair', a: 'a lifeguard chair', sprite: 'decoration.lifeguardChair', group: 'Summer', home: season('summer', 2_000) },
  { id: 'beachBall', name: 'Beach ball', a: 'a beach ball', sprite: 'decoration.beachBall', group: 'Summer', home: season('summer', 500) },
  { id: 'poolFloat', name: 'Pool float', a: 'a pool float', sprite: 'decoration.poolFloat', group: 'Summer', home: season('summer', 500) },
  { id: 'iceCreamSign', name: 'Ice-cream sign', a: 'an ice-cream sign', sprite: 'decoration.iceCreamSign', group: 'Summer', home: season('summer', 800) },
];

// ---------------------------------------------------------------- looks --

/** How many cells from itself a decoration lifts the look of a lot. */
export const DECOR_REACH = 3;
/**
 * Points of desirability one kind of decoration adds to a lot right beside
 * it, fading to nothing just past its reach. A second of the same kind near
 * the same lot adds nothing: it is variety that lifts a campus.
 */
export const DECOR_POINT = 1;
/** The most decorations can ever add to one lot, however many stand near it. The one cap of the one input. */
export const DECOR_CAP = 3;

// ----------------------------------------------------------- the seasons --

export interface SeasonSet {
  id: string;
  name: string;
  /** The first and last real days it is live, as [month, day], by the calendar of the game's own clock. The same every year. */
  from: readonly [number, number];
  to: readonly [number, number];
}

/**
 * The seasonal sets. Each is live between its two dates every year, and what
 * was bought stays for good. Winter and spring have no set: the owner's art
 * has nothing for them, and nothing stands in. A set for one is one more
 * entry here, with its decorations above.
 */
export const SEASON_SETS: readonly SeasonSet[] = [
  { id: 'summer', name: 'Summer', from: [6, 15], to: [8, 15] },
  { id: 'fall', name: 'Fall', from: [10, 1], to: [11, 30] },
];

// ---------------------------------------------------------- the Workshop --

/** Gold Seals for the Workshop's second bench, paid once. */
export const WORKSHOP_SECOND_SEALS = 20;
/** The most benches a Workshop has. */
export const WORKSHOP_BENCHES = 2;
/** Experience for collecting something the Workshop made. */
export const CRAFT_XP = 40;

/** The town gives each of its decorations this many times. After that its orders pay experience again. */
export const TOWN_DECOR_EACH = 3;
/** What a town order pays in place of a decoration once the town has no more to give. */
export const TOWN_DECOR_XP = 60;
