/**
 * The whole game state. Plain JSON only: no classes, Maps, Sets or Dates,
 * so cloning and saving are exact. See DESIGN.md section 17.5.
 */

export type Zone = 'housing' | 'academic';
export const ZONES: readonly Zone[] = ['housing', 'academic'];

/**
 * 'road' is a road the player laid, and 'crossing' a cell where a road and a
 * path share the ground. 'street', 'house' and 'town' belong to the town
 * beside the campus: its streets, its house plots and its gardens. The player
 * cannot change those.
 */
export type CellKind = 'empty' | 'path' | 'quad' | 'lot' | 'tree' | 'placed' | 'road' | 'crossing' | 'street' | 'house' | 'town';

export interface Cell {
  kind: CellKind;
  /** Set on lots only. */
  zone: Zone | null;
  /** Index into map.buildings, or null when nothing stands here. */
  buildingId: number | null;
  /** Which kind the player picked. Trees only for now: the kind of tree. 0 everywhere else. */
  variant: number;
  /** Index into map.placed for a cell under a hand-placed building, or null. */
  placedId: number | null;
  /**
   * The tick the player paid for what is on this cell: a path, a quad, a tree
   * or a zoned lot. -1 for empty ground and for anything the campus began
   * with, which was never paid for and so refunds nothing.
   */
  builtTick: number;
}

/** The hand-placed buildings of the Build menu. Their numbers live in config/placed.ts. */
export type PlacedType =
  | 'library'
  | 'dining'
  | 'coffee'
  | 'store'
  | 'gym'
  | 'track'
  | 'pool'
  | 'courts'
  | 'field'
  | 'pondSmall'
  | 'pondMedium'
  | 'pondLarge'
  | 'medical'
  | 'safety'
  | 'parking'
  | 'garage'
  | 'admin';

/** A hand-placed building. It is whole from the moment it is placed. */
export interface Placed {
  id: number;
  type: PlacedType;
  /** The top corner of its footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The tick it was placed and paid for. -1 for one the campus began with. */
  builtTick: number;
}

export interface Rebuild {
  toStage: number;
  /** The look the new building will have. */
  variant: number;
  doneTick: number;
}

/**
 * Footprint is stored per building from day one so lot merging can arrive
 * later without a rewrite. Every grown building is 1 by 1 for now.
 */
export interface Building {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  zone: Zone;
  /** 0 until the first build completes. The old stage keeps serving during a rebuild. */
  stage: number;
  variant: number;
  rebuild: Rebuild | null;
}

/** A piece of land. The campus begins with one and can buy the others. Everything outside every parcel is town. */
export interface Parcel {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  price: number;
  owned: boolean;
}

/** A side street of the town with houses on both sides. Locals live here. */
export interface Neighbourhood {
  id: number;
  /** The street's name. */
  name: string;
  /** The row its side street runs along. */
  row: number;
  /** House plots, nearest the main street first. `look` picks the house drawn. */
  plots: Array<{ x: number; y: number; look: number }>;
}

/** The town beside the campus. Made once from the seed and stored. */
export interface Town {
  /** The name of the main street along the campus edge. */
  street: string;
  neighbourhoods: Neighbourhood[];
  /** Worked out after every action, like desirability. */
  access: {
    /** The walk from each neighbourhood to class, in minutes. -1 when no path joins it. */
    walk: number[];
    /** Parking spaces a road reaches. */
    spaces: number;
    /** Ids of the car parks a road links to a town street. */
    linked: number[];
  };
}

export interface MapState {
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  cells: Cell[];
  /** A building's id is its index. Cleared buildings leave a null. */
  buildings: (Building | null)[];
  /** Hand-placed buildings. An id is an index here too, and a cleared one leaves a null. */
  placed: (Placed | null)[];
  /** The land: what the campus owns and what is for sale. */
  parcels: Parcel[];
  town: Town;
  /** Desirability of each cell, read as its own zone. 0 where there is no lot. */
  score: number[];
  /** Walk to the nearest Academic lot along paths, in minutes. -1 when unreachable or unused. */
  walkMinutes: number[];
}

export type RngStream = 'growth' | 'intake' | 'names' | 'events';
export type RngState = Record<RngStream, number>;

export interface Clock {
  /** Whole ticks since the game was created. One tick is one real minute. */
  tick: number;
  /** Real time, in epoch ms, at which the next tick is due. */
  nextTickAt: number;
  /** Real time of the last advance() call. */
  lastSimulatedAt: number;
  createdAt: number;
  /** Whole weeks dropped by the catch-up cap, over the life of the save. */
  weeksSkipped: number;
}

export interface Money {
  cash: number;
  /** Current yearly rates. Recomputed whenever ratesDirty is set. */
  incomePerYear: number;
  spendingPerYear: number;
  ratesDirty: boolean;
  /** Running totals for the current game year. */
  yearEarned: number;
  yearSpent: number;
  /** Total of state grants received when cash would have gone below zero. */
  grants: number;
}

export type TimerKind = 'buildDone';

export interface Timer {
  due: number;
  /** Tie-break so timers due on the same tick fire in the order they were set. */
  seq: number;
  kind: TimerKind;
  ref: number;
}

export type Season = 'fall' | 'spring';

export interface IntakeResult {
  tick: number;
  season: Season;
  /** Students the forecast expected to enrol. */
  expected: number;
  admitted: number;
  turnedAway: number;
  /** The zone that capped the class, or null when everyone got in. */
  bottleneck: Zone | null;
}

export interface Admissions {
  /** Turned-away applicants still waiting for room. */
  waitlist: number;
  /** The waitlist closes at this tick. 0 when none is open. */
  waitlistUntilTick: number;
  /** How many the open waitlist has let in so far. */
  waitlistAdmitted: number;
  /** How many of those waiting are locals, who need no bed if a place in town opens. */
  waitlistLocals: number;
  lastIntake: IntakeResult | null;
  /** How the last semester ended: who stayed, who left, and how happy the campus was. */
  lastSemester: { tick: number; stayed: number; left: number; happiness: number } | null;
}

/**
 * What became of one entering class. Kept for good, because the history
 * cannot be rebuilt later. Graduation rates are read from it (DESIGN.md 24.8).
 */
export interface ClassRecord {
  entryYear: number;
  entered: number;
  finishedOnTime: number;
  finishedLate: number;
  left: number;
}

export interface Stats {
  graduates: number;
  yearsCompleted: number;
  peakEnrollment: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  clock: Clock;
  school: { name: string };
  money: Money;
  map: MapState;
  /** Headcount by class year: freshmen, sophomores, juniors, seniors. */
  cohorts: [number, number, number, number];
  /**
   * How many of each class year live off campus, in town. They found a way to
   * class when they enrolled and keep it until they graduate. Everyone else
   * needs a bed.
   */
  offCampus: [number, number, number, number];
  /** One record per entering class, oldest first. */
  classes: ClassRecord[];
  admissions: Admissions;
  timers: Timer[];
  timerSeq: number;
  stats: Stats;
  incidents: Incidents;
}

export type IncidentKind = 'injury' | 'mischief';

/** Something small going wrong on the map. Its outcome is fixed the moment it begins. */
export interface Incident {
  id: number;
  kind: IncidentKind;
  /** The cell it happened at. */
  x: number;
  y: number;
  /** Where, in words: "Gym", or "a dorm". */
  place: string;
  /** Which line describes it. */
  line: number;
  startTick: number;
  /** The building whose responder is on the way: an index into map.placed. null when no circle covers it. */
  responder: number | null;
  /** The tick the responder arrives, or the tick it passes with nobody coming. */
  endTick: number;
}

export interface Incidents {
  active: Incident[];
  nextId: number;
  /** Totals over the life of the save. */
  handled: number;
  missed: number;
}

export type LogKind =
  | 'built'
  | 'intake'
  | 'waitlist'
  | 'waitlistClosed'
  | 'graduation'
  | 'semester'
  | 'incident'
  | 'yearEnd'
  | 'grant'
  | 'paused';

/** Something notable that happened. The away list is built from these. */
export interface LogEntry {
  tick: number;
  kind: LogKind;
  text: string;
  /** Numbers the UI may want without parsing the text. */
  data?: Record<string, number | string>;
}

export interface AdvanceInfo {
  /** Ticks actually simulated by this call. */
  ticks: number;
  /** Whole weeks dropped by the 30-day cap in this call. */
  weeksSkipped: number;
  /** True when `to` was earlier than the last simulated moment. Nothing was advanced. */
  clockWentBack: boolean;
}

export interface AdvanceResult {
  state: GameState;
  log: LogEntry[];
  info: AdvanceInfo;
}
