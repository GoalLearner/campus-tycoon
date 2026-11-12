import { BED_NEED } from './demand';

/**
 * The town beside the campus, the land for sale, roads and parking.
 * Every number is a tuning target [T]. See DESIGN.md section 25.
 */

/** The whole map: the starting land, two fields to its south, and the town down its east side. */
export const WORLD = { width: 42, height: 48 } as const;

/** The land a new campus owns. */
export const START_LAND = { name: 'Campus', x: 0, y: 0, w: 32, h: 32 } as const;

/** Fields the player can buy. Each is one parcel of sixteen cells by sixteen. */
export const LAND_FOR_SALE = [
  { name: 'South-east field', x: 16, y: 32, w: 16, h: 16, price: 250_000 },
  { name: 'South-west field', x: 0, y: 32, w: 16, h: 16, price: 400_000 },
] as const;

/** The town's main street runs down this column, just beyond the campus edge. Everything east of it is town. */
export const TOWN_X = 32;
export const MAIN_STREET = 'Lantern Avenue';

/** Each neighbourhood is a side street running east from the main street on one of these rows, with houses on both sides. */
export const SIDE_STREET_ROWS: readonly number[] = [2, 7, 12, 17, 22, 27, 35, 42];
/** House plots in a neighbourhood: at least this many, and up to this many more. */
export const PLOTS_MIN = 9;
export const PLOTS_SPREAD = 6;
/** Looks a house can have in the art. */
export const HOUSE_LOOKS = 12;

export const STREET_NAMES: readonly string[] = [
  'Maple Street',
  'Elm Street',
  'Oak Lane',
  'Birch Avenue',
  'Cedar Street',
  'Willow Lane',
  'Aspen Court',
  'Juniper Street',
  'Linden Avenue',
  'Hazel Lane',
  'Poplar Street',
];

/** The share of every class that is local and would rather live at home in town. The rest always need a bed. */
export const LOCAL_SHARE = 1 - BED_NEED;
/** Local students one house plot stands for. */
export const STUDENTS_PER_HOUSE = 10;

/** A neighbourhood's students walk when a path joins its street to campus and the walk to class is no longer than this. */
export const TOWN_WALK_MAX_MINUTES = 12;
/** From the front door to the campus edge. */
export const TOWN_WALK_EXTRA_MINUTES = 2;
/** A path counts as joined to a neighbourhood when it meets the main street within this many rows of the side street. */
export const TOWN_GATE_ROWS = 2;

/** A cell of road: its price, and its upkeep a year. */
export const ROAD_COST = 3_000;
export const ROAD_UPKEEP_PER_YEAR = 150;

/** Desirability a Housing or Academic lot loses for a road or street right beside it, and for parking within a cell of it. */
export const ROAD_NOISE = 3;
export const PARKING_NOISE: Record<'parking' | 'garage', number> = { parking: 6, garage: 3 };
