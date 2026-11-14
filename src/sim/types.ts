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
  /** A decoration (DESIGN.md 42.5): one type for all of them. Which one it is, is on the thing itself. */
  | 'decor'
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
  | 'bin'
  | 'bench'
  | 'table'
  | 'yard'
  | 'admin'
  // The football layer: the plot of two cells by three that the stadium is built on.
  | 'stadium'
  // Play stop 4b: eight more places to eat, and three Academics buildings.
  | 'truck'
  | 'convenience'
  | 'taco'
  | 'smoothie'
  | 'pizza'
  | 'burger'
  | 'diner'
  | 'foodcourt'
  | 'computerLab'
  | 'makerspace'
  | 'studyCenter'
  // A building for each rank goal (DESIGN.md section 40). Earned, never bought.
  | 'fountain'
  | 'postOffice'
  | 'cinema'
  | 'radio'
  | 'museum'
  | 'alumniHouse'
  | 'broadcastTower'
  | 'bellTower'
  // What the eras open (DESIGN.md 41.3 and 41.4, as built in section 45): bought, one of each, built over real days.
  | 'studentUnion'
  | 'honorsCollege'
  | 'welcomeCenter'
  | 'foundersCommons'
  // The research labs (DESIGN.md 42.6, as built in section 49): one for each field, bought from the Build menu.
  | 'labSciences'
  | 'labEngineering'
  | 'labHealth'
  // Greek Row (DESIGN.md 14.1, as built in section 51): a chapter house, bought from the Build menu once the Growth era opens.
  | 'chapterHouse';

/** A hand-placed building. It is whole from the moment it is placed, but for a big build of an era, which goes up first. */
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
  /** A decoration only: which one, an id from `DECOR`. */
  decor?: string;
  /** A decoration only: turned to run the other way. */
  flip?: boolean;
  /** A big build of an era (DESIGN.md 45) still going up: the tick it opens. Left out once it is open. */
  done?: number;
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

/** For grounds: the lots that use each mess spot, the bins beside it, and the yard that looks after each thing. */
export interface Care {
  /** Lots within reach of each mess spot, by its id. */
  users: Record<number, number>;
  /** Ids of the bins beside each mess spot. */
  bins: Record<number, number[]>;
  /** The yard that looks after each placed thing, by its id. -1 when no circle covers it. */
  yard: Record<number, number>;
  /** Every zoned lot on the map. */
  lots: number;
  /**
   * Ids of the placed things of each family, so a search for "dining in reach" does not walk every bin and bench.
   * Missing on a save written before it existed, until the next action rebuilds it.
   */
  byFamily?: Record<string, number[]>;
  /**
   * For each recreation building, how many lots' worth of students it has to
   * itself once every lot has shared its play among the buildings that reach
   * it. Missing on a save from before recreation could fill up.
   */
  play?: Record<number, number>;
  /**
   * Set for a zone when no lot of it could start growing. Until a build
   * finishes or the player changes the map, none can, so growth need not look
   * again. Without this a campus of stalled lots is searched on every beat of
   * catch-up for nothing.
   */
  idle?: Partial<Record<Zone, boolean>>;
  /**
   * For each place to eat, how many lots' worth of students it has to itself
   * once every lot has shared its custom equally among the places that reach
   * it. Missing on a save from before food earned anything.
   */
  food?: Record<number, number>;
  /**
   * For each place to eat, how many lots' worth of students eat there once
   * every lot has shared its meals among the places that reach it, in
   * proportion to how many each can feed. Missing on a save from before a
   * place to eat could fill up.
   */
  meals?: Record<number, number>;
}

export interface MapState {
  /**
   * The campus scale (DESIGN.md 35.7): how many of the small game's students each bed, seat, parking space and
   * town house stands for. 1 for every campus but the model campus. Read it through `scaleOf`.
   */
  scale: number;
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
  /** Who serves what on the grounds. Worked out after every action, like desirability. */
  care: Care;
  /** Desirability of each cell, read as its own zone. 0 where there is no lot. */
  score: number[];
  /** Walk to the nearest Academic lot along paths, in minutes. -1 when unreachable or unused. */
  walkMinutes: number[];
}

/** 'football' was added last, so the streams before it are what they always were. */
export type RngStream = 'growth' | 'intake' | 'names' | 'events' | 'football' | 'orders';
export type RngState = Record<RngStream, number>;

/** Where the game year stands. See calendar.ts. */
export interface Week {
  /** The game year this is: 1 for the first. */
  year: number;
  /** The tick day 1 of this year begins: the fall anchor. In year 1 it is the first intake plus the founding day. */
  start: number;
  /** Ticks added to this year's summer by a shift of the anchor: 0 up to a day. */
  extra: number;
}

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
  /** The game year in progress: which it is, when it began, and how far its summer is stretched. */
  week: Week;
  /**
   * The anchor: the minute of the UTC day, 0 to 1439, at which each day of
   * the week begins. It is two hours after the player's day usually starts.
   * null when none has been chosen, on a game made without one: its week
   * began fifteen minutes after it was made, at whatever hour that was.
   */
  anchor: number | null;
  /** The tick the anchor was last moved, or -1 when it never has been. It can be moved again four weeks later. */
  anchorMovedTick: number;
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
  /** Cash paid in for good. It earns a small income every year and is the campus's legacy number. */
  endowment: number;
  /** The recruiting and marketing step: 0 is off, 4 the most. */
  marketing: number;
  /**
   * How far the costs of play stop 5 have been phased in, out of PHASE_STEPS.
   * A new campus pays them in full. A save from before starts at 0 and takes
   * one step each day.
   */
  phase: number;
}

/** 'kickoff' and 'final' point at a slot of the season. 'decision' points at a decision's id. */
export type TimerKind = 'buildDone' | 'kickoff' | 'final' | 'stadiumDone' | 'decision' | 'scrimmage' | 'craftDone' | 'moment' | 'bigBuild' | 'discovery' | 'tradition' | 'greek';

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
  /** The zone that capped the class, or null when everyone the campus had room for under its cap got in. */
  bottleneck: Zone | null;
  /**
   * Applicants turned away because the campus was full at its cap (DESIGN.md 38.4). They are not in `turnedAway`,
   * which counts those who wait for a bed or a seat. Left out on a game with no cap, and on an older save.
   */
  capped?: number;
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
  /**
   * This year's applicants and how many of them got a place, the fall class and the spring class together. It
   * starts again at each fall intake. Selectivity is read from it, so one small spring class cannot speak for a
   * year.
   */
  year: { applied: number; admitted: number };
}

/**
 * The people a campus employs for its students (DESIGN.md section 38). They
 * are head counts kept in the save: hired at the start of a semester and
 * leaving at the start of one, a semester behind the students.
 */
/**
 * Policies (DESIGN.md section 41): the switches an era opens. Only a game
 * begun on the model campus can open any. What each one is lives in
 * `config/policies.ts`. The save keeps only which are on.
 */
export interface Policies {
  /** The ids of the policies that are on. */
  on: string[];
  /** Those changed since the last class moved in. Each stays as it is until the next one does. */
  locked: string[];
  /** Changes not yet told: each becomes one line in the log on the next tick. */
  news: Array<{ id: string; on: boolean }>;
}

/**
 * The daily layer (DESIGN.md section 42): the University Level, Gold Seals
 * and what there is to collect. Only a game with goals uses it. What each
 * source of experience pays, what a level gives and what a building holds
 * are in `config/daily.ts`.
 */
export interface Daily {
  /** Experience earned in all. It never falls, and the level is worked out from it. */
  xp: number;
  /** The level reached and paid for: its Seals given and its line told. */
  level: number;
  /** Gold Seals held. */
  seals: number;
  /** The tick the layer began in this game. A building never collected counts from a day before it. */
  began: number;
  /** When each filling building was last collected: a tick, by its id in `map.placed`. */
  since: Record<number, number>;
  /** Buildings that have just opened and hold their opening bonus: placed by hand, or a lot's own building. */
  opened: Array<{ kind: 'placed' | 'lot'; id: number }>;
  /** The ticks of the opening bonuses given in the last real day. */
  openings: number[];
  /** Home games played since the stadium was last collected, up to the few it holds. */
  games: number;
  /** The ticks of the last few home wins: the campus store fills faster for a day after each. */
  wins: number[];
  /** Lines not yet told: each becomes one line in the log on the next tick. */
  news: string[];
}

/** A goal for the year (DESIGN.md 44): a kind from `YEAR_KINDS`, how hard, where its number stood and where it must reach. */
export interface YearGoal {
  kind: string;
  level: 'easy' | 'medium' | 'stretch';
  from: number;
  target: number;
  /** Set at commencement: whether it was met. */
  met?: boolean;
}

/**
 * A moment of the calendar on the board (DESIGN.md 44): Homecoming, the
 * rivalry, finals week or commencement. What it asks is fixed when it opens.
 */
export interface Moment {
  id: number;
  kind: 'homecoming' | 'rivalry' | 'finals' | 'commencement';
  /** Which one: "homecoming:3", "finals:3:fallFinals". It opens once. */
  key: string;
  /** The tick the moment comes, and the tick it opened. */
  at: number;
  opened: number;
  /** The number to reach or stay under, and what it means: "fill" or "win" at Homecoming, "home" or "away" at the rivalry. */
  target: number;
  param: string;
  /** Set when measured: the number seen, whether it went well, and when. */
  result: number | null;
  met: boolean | null;
  measured: number | null;
}

export interface Rhythm {
  /** The player's day the gift was last taken (`giftDayNow`), or -1 for never. */
  giftDay: number;
  /** Boxes filled on the card now: 0 to 6. The seventh taken starts a fresh card. */
  box: number;
  /** This year's goals, from move-in to commencement. null between. */
  year: { year: number; set: number; until: number; goals: YearGoal[] } | null;
  /** How last year's goals went. */
  lastYear: { year: number; met: number; of: number; xp: number; seals: number } | null;
  moments: Moment[];
  nextId: number;
  /** The last few moments opened, so none opens twice. */
  opened: string[];
  /** Running counts for the long run's tables. */
  tally: Record<string, number>;
  /** Lines not yet told: each becomes one line in the log on the next tick. */
  news: string[];
}

/**
 * One order on the board (DESIGN.md 42.3). It is offered as a stub: who
 * gives it, and a number from the seeded stream. What it asks for is fixed
 * the first time the player sees it, which is when its clock starts.
 */
export interface Order {
  id: number;
  /** Who gives it: an id from `GIVERS`. */
  giver: 'advisors' | 'state' | 'town' | 'donors';
  /** A number drawn when it was offered. What it asks for is chosen from it when first seen. */
  roll: number;
  /** The tick it was offered. */
  offered: number;
  /** Set when first seen: the kind of order, an id from `ORDER_KINDS`. */
  kind?: string;
  /** The tick it was first seen, and the tick its time runs out. */
  seen?: number;
  until?: number;
  /** Where its number stood when first seen, and what it must reach. */
  from?: number;
  target?: number;
  /** The line of the Capacity page or the building it is about. */
  param?: string;
  /** The decoration it pays, fixed when it is first seen: an id from `DECOR`. */
  gift?: string;
  /** The tick it was found done. It then waits to be claimed, for as long as it takes. */
  done?: number;
}

/**
 * One bench of the Workshop (DESIGN.md 42.6). The recipe is a standing
 * choice: when a finished thing is collected, the next of the same begins.
 */
export interface Bench {
  /** What it makes: a decoration's id, or null while it stands idle. */
  recipe: string | null;
  /** What is on the bench now, and the tick it is finished. null with nothing on it. A finished thing waits for ever. */
  making: string | null;
  done: number | null;
}

/** Decorations owned and not on the map, and the Workshop (DESIGN.md 42.5 and 42.6). */
export interface Decor {
  /** In storage, by decoration id. Nothing is ever sold or lost. */
  stored: Record<string, number>;
  benches: Bench[];
  /** Running counts for the long run: bought, crafted, given, placed. */
  tally: Record<string, number>;
  /** The seasonal set that was live when the day last began, so a set opening is told once. '' for none. */
  season: string;
}

export interface Orders {
  open: Order[];
  nextId: number;
  /** Running counts, bumped where the thing happens: trees planted, home games won, orders claimed. */
  tally: Record<string, number>;
  /** What was measured at the last few points of the calendar: a graduation's seniors, a semester's Stress. */
  marks: Array<{ at: number; what: string; value: number }>;
  /** Lines not yet told: each becomes one line in the log on the next tick. */
  news: string[];
  /** What the board says once about an order whose time ran out. */
  note: string;
  /** Kinds of order the player dismissed, each with the tick it may be asked again: an unwanted one is not asked twice in a week. */
  rest: Record<string, number>;
  /** Cash paid by orders in one game year, for the money tables: the year, and the sum. */
  paidYear: number;
  paid: number;
}

export interface Staffing {
  /** Faculty and staff on the payroll now. */
  faculty: number;
  staff: number;
  /**
   * What each was last measured to need: at the start of the semester, when its waitlist closed, and when the
   * Instruction slider was moved. The next semester's hiring and leaving go this far and no further.
   */
  facultyPlan: number;
  staffPlan: number;
  /** The Instruction slider, 0 to 4: how many students one member of faculty is hired for. 2 is full funding. */
  instruction: number;
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

/**
 * Size goals, rank goals and eras (DESIGN.md section 37). Only a game begun
 * on the model campus has them.
 */
export interface Goals {
  /**
   * How many size goals are reached. Kept for good. There is one now, a full campus (DESIGN.md 38.4). A save
   * from when there were eight may hold more, and keeps every one.
   */
  size: number;
  /** How many of the eight rank goals are reached. Kept for good. */
  rank: number;
  /** Each goal and era as it was reached, oldest first. `n` counts from 0 on a ladder, and is the era's number for an era. */
  reached: Array<{ ladder: 'size' | 'rank' | 'era'; n: number; year: number }>;
  /**
   * Kept from before the buildings were switched on, and not read. Which of a game's buildings are waiting is
   * worked out from the rank goals it has reached and what stands on its map (DESIGN.md section 40).
   */
  rewards: number;
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
  /**
   * One record per entering class, oldest first. A campus opens with all four
   * class years, so its founding sophomores, juniors and seniors have entry
   * years 0, -1 and -2: they began somewhere else. Graduation rates leave
   * those records out (see `startedHere`).
   */
  classes: ClassRecord[];
  /**
   * True once the student body has all four class years. A new campus has it
   * from the first day. A save from before that rule gets it at its next fall
   * intake, when its students are spread across the years.
   */
  fourYears: boolean;
  admissions: Admissions;
  timers: Timer[];
  timerSeq: number;
  stats: Stats;
  incidents: Incidents;
  grounds: Grounds;
  term: Term;
  field: Field;
  football: Football;
  decisions: Decisions;
  inbox: Inbox;
  /** The goals of a game begun on the model campus. null on a game begun on the small campus, which has none. */
  goals: Goals | null;
  staffing: Staffing;
  policies: Policies;
  daily: Daily;
  orders: Orders;
  decor: Decor;
  /** The daily gift, the goals for the year and the moments of the calendar (DESIGN.md 42.8, as built in section 44). */
  rhythm: Rhythm;
  /** The big builds an era opens (DESIGN.md 45): how many can go up at once. What is built is on the map. */
  bigBuilds: BigBuilds;
  /** The research labs (DESIGN.md 49): what each holds, and every discovery made. The labs themselves are on the map. */
  labs: Labs;
  /** Traditions (DESIGN.md 50): those chosen, and how often each has been kept. */
  traditions: Traditions;
  /** Greek Row (DESIGN.md 51): a chapter for each chapter house on the map. */
  greek: Greek;
}

/** How a chapter stands (DESIGN.md 51): Good, on Warning while something is wrong, on Probation if it stays wrong. */
/** Suspended (DESIGN.md 55): closed for hazing until the next rush week, its house empty. */
export type ChapterStatus = 'good' | 'warning' | 'probation' | 'suspended';

/** A chapter of Greek Row (DESIGN.md 51): one to each chapter house. */
export interface Chapter {
  /** The id of its house on the map. */
  house: number;
  name: string;
  /** Which of the house drawings it is shown as. */
  look: number;
  /** The tick it was founded. */
  founded: number;
  /** Members now, on the campus's own count. Set at rush week; seniors leave at commencement. */
  members: number;
  /** Those who joined at the last rush, or at its founding. */
  pledges: number;
  /** The tick its trouble was first seen, while it has some. -1 when it has none. */
  since: number;
  /** Its standing when last checked, so a change is told once. */
  status: ChapterStatus;
  /** Philanthropy events since its last rush. */
  giving: number;
  /** Pranks since its last rush. */
  pranks: number;
  /**
   * Its hazing risk, 0 to 1 (DESIGN.md 55): the chance of a report in pledge season, worked out each hour from its
   * standing, the policies and what the president did about a report since rush.
   */
  hazing: number;
  /** The tick its probation for hazing ends, or -1 (DESIGN.md 55). Rush week ends it. */
  probationUntil: number;
  /** The tick its suspension ends, or -1: the next rush week. */
  suspendedUntil: number;
  /** True when the president looked the other way on a report since rush: the risk is higher, and a second report suspends it. */
  looked: boolean;
  /** Hazing reports since its last rush. */
  reports: number;
  /** What the chapter has done lately, newest last: its record on its panel, and the place a later stop adds to. */
  events: ChapterEvent[];
}

/** One thing a chapter did (DESIGN.md 51). Later stops may add kinds. */
export interface ChapterEvent {
  tick: number;
  kind: 'founded' | 'rush' | 'prank' | 'giving' | 'hazing' | 'social';
  text: string;
}

/** Greek Row (DESIGN.md 51). */
export interface Greek {
  /** In the order founded. */
  chapters: Chapter[];
  /** Every name this campus has given a chapter, so none is given twice. */
  used: string[];
  /** The last rush week: its school year, those who joined, and those who moved from dorm beds into the houses. */
  rush: { year: number; joined: number; moved: number } | null;
  /** Counts kept for the record: rush weeks, pranks, philanthropy events, hazing reports and suspensions. */
  totals: { rushes: number; pranks: number; giving: number; reports: number; suspensions: number };
  /** The tick a hazing case the president looked away from stops costing the rating, or -1 (DESIGN.md 55). */
  scandalUntil: number;
  /** Lines waiting from an action or a choice, said on the next tick. */
  news: string[];
}

/** A tradition a campus chose (DESIGN.md 50). */
export interface KeptTradition {
  /** An id from `TRADITIONS`. */
  id: string;
  /** The tick it was chosen. */
  chosen: number;
  /** The times it has been kept. What it lifts grows with it. It never falls. */
  kept: number;
  /** Every school year its day came since it was chosen: the year, and 1 when kept or 0 when not. The record book. */
  years: Array<[number, number]>;
  /** The school year it was last said to be at risk, so it is said once. 0 when never. */
  warned: number;
}

/** Traditions (DESIGN.md 50). */
export interface Traditions {
  /** True once the first commencement has passed: it opens the first place for a tradition. */
  began: boolean;
  /** Places open when last told, so a new one is told once. */
  slots: number;
  /** In the order chosen. A choice is for good. */
  chosen: KeptTradition[];
  /** True while the campus holds the Rivalry Trophy: it won the last rivalry game. */
  trophy: boolean;
  /** Lines waiting from an action, said on the next tick. */
  news: string[];
}

/** One discovery a research lab made (DESIGN.md 49). Kept for good, even when its lab is cleared. */
export interface Discovery {
  /** The lab's type, which is its field. */
  lab: PlacedType;
  /** Which of the field's discoveries it is, an index into its list. */
  line: number;
  tick: number;
  /** The game year it was made in. */
  year: number;
}

/** The research labs (DESIGN.md 49). */
export interface Labs {
  /** By the lab's placed id: the tick its findings count from, as a filling building's does. */
  since: Record<number, number>;
  /** Every discovery, oldest first. */
  found: Discovery[];
  /** Findings collected in all. */
  findings: number;
  /** The cash the labs have taken from this year's allowance, and the year it is for. */
  paid: number;
  paidYear: number;
}

/** The big builds of the eras (DESIGN.md 45). */
export interface BigBuilds {
  /** How many can go up at once: one, and two once the second builder is bought for Seals. */
  slots: number;
  /** Lines waiting from an action, said on the next tick. */
  news: string[];
}

// ------------------------------------------------------------- football --

/**
 * One of the other 199 schools of the national field (DESIGN.md section 11).
 * Made once from the seed, stored, and never made again. Short keys, because
 * there are 199 of them in every save.
 */
export interface School {
  name: string;
  /** The team's nickname: "Herons". */
  nick: string;
  /** Academics: long-run pedigree and current rating, 0 to 100. */
  ap: number;
  ar: number;
  /** Football: the same. */
  fp: number;
  fr: number;
  /** A steady rise or fall under way, for academics and for football: the yearly step, and the years left. */
  aa: number;
  an: number;
  fa: number;
  fn: number;
  /** This season's record: every game for a conference rival, one sampled record for the rest. */
  w: number;
  l: number;
  /** One fixed offset for each stage of the student pipeline, made once, for grading the player against the field. */
  off: number[];
}

export interface Field {
  schools: School[];
  /** The player's own academic standing: a slow reputation, and the rating and rank last published. */
  reputation: number;
  academic: number;
  /** 1 is the best of the 200. 0 before the first rankings day. */
  rank: number;
  rankYear: number;
  /** The school that climbed most in the last year's drift and the one that fell most, with how many places each moved. null before the first. */
  moved: { up: number; upBy: number; down: number; downBy: number } | null;
}

export interface Coach {
  name: string;
  /** 0 to 100, on the field's scale. */
  rating: number;
  trait: 'recruiter' | 'tactician' | 'developer' | 'showman';
  /** Pay for a year. */
  pay: number;
  /** The last game year the contract covers. */
  until: number;
}

/** One game of the player's team. Rolled whole at kickoff and shown a quarter at a time. */
export interface Game {
  /** 0 to 9 in the regular season, 10 for the conference title game, 11 for a bowl, -1 for the scrimmage. */
  slot: number;
  /** "Homecoming", "Conference title game", a bowl's name, or ''. */
  label: string;
  /** The opponent: an index into the field's schools. -1 for the scrimmage. */
  opp: number;
  home: boolean;
  kick: number;
  /** Points by quarter, ours and theirs. Empty until kickoff. */
  us: number[];
  them: number[];
  /** Through the gate, and the seats there were. 0 away from home. */
  crowd: number;
  seats: number;
  /** The two ratings at kickoff, and the part of ours furthest behind theirs, for the recap. */
  rating: number;
  oppRating: number;
  gap: string;
  done: boolean;
}

/** A team's record in a season: all games, conference games, and games in its own division. */
export interface Standing {
  w: number;
  l: number;
  cw: number;
  cl: number;
  dw: number;
  dl: number;
}

export interface SeasonState {
  year: number;
  games: Game[];
  /** Records of the twelve conference teams, by team: the key is the school's index, and -1 is the player. */
  table: Record<string, Standing>;
  /** Results of the other games of a slot, rolled at kickoff and added to the table at the final whistle: winner, loser, 1 for a conference game, 1 for a division game. */
  pending: Array<[number, number, number, number]>;
  /** Slots finished, 0 to 10. */
  played: number;
  /** Who won the conference: a school's index, -1 for the player, null until it is decided. */
  champion: number | null;
  /** The bowl the player's team reached, or ''. */
  bowl: string;
  /** True once the season's last game is over and its summary has been written. */
  closed: boolean;
  /** The winning streak going into the next game. */
  streak: number;
}

export interface Poll {
  year: number;
  /** "Preseason", "End of the regular season", "Final". */
  label: string;
  /** The top twenty-five: a school's index (-1 for the player), wins and losses. */
  rows: Array<[number, number, number]>;
  /** Where the player's team stands among the 200. */
  mine: number;
}

export interface Stadium {
  /** The plot on the map: an index into map.placed, or null when none has been placed. */
  plot: number | null;
  /** 0 is the rented field in town. 1 to 5 stand on the plot. */
  tier: number;
  /** The ticket price step, 0 to 4. */
  price: number;
  /** The highest tier earned by a season of near sell-outs. It stays earned until it is built. */
  earned: number;
  /** A tier under construction, and the tick it opens. */
  work: { tier: number; done: number } | null;
  /** This season's home crowds, as shares of the seats. */
  gate: number[];
  /** The average home crowd of the last season with home games, in people. It sets the yearly rate of ticket income. */
  average: number;
}

export interface Football {
  /** The first game year with a season. A save from before football starts at its next fall. */
  firstYear: number;
  nick: string;
  /** The school's colour: an id from SCHOOL_COLOURS. */
  colour: string;
  conference: string;
  /** The two divisions of six: school indexes, with -1 for the player, who is first in the first. */
  divisions: [number[], number[]];
  /** The rival: the school the last game of every season is against. */
  rival: number;
  coach: Coach;
  /** Candidates offered while a coach decision is open. */
  candidates: Coach[];
  /** The last four signing classes, oldest first. */
  classes: number[];
  /** The pitch for the class being recruited. */
  pitch: 'safe' | 'star';
  season: SeasonState | null;
  stadium: Stadium;
  /** The TV and conference deal: what it pays a year, and the last game year it covers. 0 and 0 with none. */
  tv: { perYear: number; until: number };
  /** Athletic standing, 0 to 100. It follows results slowly, and lifts applications and the crowd. */
  standing: number;
  record: { w: number; l: number; seasons: number; titles: number; bowls: number; best: number };
  poll: Poll | null;
  /** How the last finished season went, in a line. */
  last: { year: number; w: number; l: number; note: string } | null;
  /** The tick of the last big home win, for the Superfans. 0 when there has been none. */
  bigWin: number;
}

/** One choice the player is asked to make once a year (DESIGN.md 4.4). The inbox of the next layer shows these. */
export interface Decision {
  id: number;
  kind: 'pitch' | 'coach' | 'stadium' | 'tv';
  year: number;
  title: string;
  body: string;
  opens: number;
  closes: number;
  options: Array<{ id: string; label: string; detail: string; cost: number }>;
  /** The option that applies by itself when the window closes. */
  fallback: string;
  /** The advisor's pick, and who they are. */
  advised: string;
  advisor: string;
  /** What the player picked. Some choices take effect at once, and the pitch on signing day. null until they pick. */
  chosen: string | null;
}

export interface Decisions {
  open: Decision[];
  nextId: number;
  /** How the last few were settled, newest last, for the list to show. */
  past: Array<{ kind: Decision['kind']; year: number; title: string; outcome: string; byDefault: boolean; tick: number }>;
}

// ---------------------------------------------------------------- inbox --

export type AdvisorId = 'provost' | 'cfo' | 'athletics' | 'dean';

/**
 * A small, capped, dated push on a number the game already has (DESIGN.md
 * section 36): points of Happiness on the week's line, points of Stress taken
 * off, or a share added to the crowd at a game or to a class's applicants.
 */
export interface Boost {
  kind: 'happy' | 'stress' | 'fans' | 'applicants' | 'calls';
  amount: number;
  /** The tick it begins, when that is later than the moment it was chosen. */
  from?: number;
  /** The tick it ends. */
  until: number;
  /** A few words for wherever the number is shown: "Spring concert". */
  label: string;
}

/** What a choice on the desk does. Every one moves something that already exists. */
export type InboxEffect =
  | { t: 'boost'; kind: Boost['kind']; amount: number; ticks: number; label: string; fromClose?: boolean }
  | { t: 'endow'; amount: number }
  | { t: 'tidy'; share: number }
  | { t: 'fix' }
  | { t: 'mark'; key: 'donor' | 'boat' }
  /** A chapter holds a philanthropy event (DESIGN.md 51): `house` is its house's id. */
  | { t: 'giving'; house: number }
  /** What the president does about a hazing report (DESIGN.md 55). */
  | { t: 'hazing'; house: number; act: 'probation' | 'suspend' | 'look' };

export interface InboxOption {
  id: string;
  label: string;
  detail: string;
  /** Cash that changes hands when it is chosen: below zero is a cost, above zero comes in. */
  cash: number;
  effects: InboxEffect[];
}

/** A petition, a deal with strings or an event (DESIGN.md 12.1). Written once when it opens, and stored as written. */
export interface InboxItem {
  id: number;
  /** Which of the written items this is. */
  key: string;
  kind: 'petition' | 'deal' | 'event';
  advisor: AdvisorId;
  title: string;
  body: string;
  opens: number;
  closes: number;
  options: InboxOption[];
  /** The option that applies by itself when the window closes. */
  fallback: string;
  /** The advisor's pick. */
  advised: string;
}

export interface Inbox {
  open: InboxItem[];
  nextId: number;
  /** The game year each written item last opened in, by key. */
  last: Record<string, number>;
  /** How the last few were settled, newest last. */
  past: Array<{ key: string; title: string; outcome: string; byDefault: boolean; tick: number }>;
  boosts: Boost[];
  /** The four advisors' names, made once for this campus. */
  advisors: Record<AdvisorId, string>;
  /** Counters as they stood when an item about them last opened: incidents nobody came to, and the years of a sponsor's deal and of the boat. */
  marks: { missed: number; donor: number; boat: number };
}

/** Litter, bins, workers and broken things. Keys are ids of placed things unless said otherwise. See DESIGN.md section 29. */
export interface Grounds {
  /** Litter lying around each mess spot, from nothing up to its ceiling. */
  litter: Record<number, number>;
  /** How full each bin is. */
  bins: Record<number, number>;
  /** Broken bins, benches and tables: the work left to fix each. */
  broken: Record<number, number>;
  /** What broke each of those: the place whose litter led to it, and which of its stories it was. */
  brokenFrom: Record<number, { spot: number; line: number }>;
  /** Broken street lamps, by cell index: the work left to fix each. */
  lamps: Record<number, number>;
  /**
   * What broke each of those lamps: the place whose litter led to it, and which
   * of the lamp's stories it was. Missing for a lamp broken before this was kept.
   */
  lampFrom: Record<number, { spot: number; line: number }>;
  /** Workers hired at each Facilities Yard. */
  workers: Record<number, number>;
  /** The tick something last broke at each mess spot. */
  lastBreak: Record<number, number>;
  /** No litter falls before this tick. Set on an upgraded save, so the player reads about litter first. */
  quietUntilTick: number;
  /** Totals over the life of the save. */
  overflowed: number;
  repaired: number;
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
  /** A call from a party (DESIGN.md 55): its line is from the party lines. */
  party?: true;
}

export interface Incidents {
  active: Incident[];
  nextId: number;
  /** Totals over the life of the save. */
  handled: number;
  missed: number;
}

/**
 * The little the academic year keeps (DESIGN.md 27): the semester's running
 * Stress, the peak of the exam period in progress, and the year the first
 * snow was last reported. Stress itself is worked out, never stored.
 */
export interface Term {
  /** Stress added up tick by tick over the semester in progress. */
  stressSum: number;
  /** The tick that semester began, and the tick the sum was last brought up to. */
  since: number;
  lastTick: number;
  /** Stress as it stood at that tick. */
  lastStress: number;
  /** The campus's part of Stress, read once a day: what Stress would be at the height of finals, out of 1. */
  factor: number;
  /** The highest Stress of the exam period in progress, its main cause, and the faculty's. 0 outside one. */
  examPeak: number;
  examCause: string;
  facultyPeak: number;
  /** The average Stress of the semester that last ended. */
  lastAverage: number;
  /** The game year the first snow was last reported in. */
  snowYear: number;
}

export type LogKind =
  | 'inbox'
  | 'goal'
  | 'built'
  | 'intake'
  | 'waitlist'
  | 'waitlistClosed'
  | 'graduation'
  | 'classes'
  | 'semester'
  | 'incident'
  | 'grounds'
  | 'yearEnd'
  | 'costs'
  | 'staff'
  | 'policy'
  | 'level'
  | 'order'
  | 'craft'
  | 'season'
  | 'rhythm'
  | 'bigBuild'
  | 'lab'
  | 'tradition'
  | 'greek'
  | 'grant'
  | 'paused'
  // The football and calendar layer.
  | 'calendar'
  | 'exam'
  | 'weather'
  | 'anchor'
  | 'game'
  | 'football'
  | 'decision'
  | 'rankings';

/** Something notable that happened. The away list is built from these. */
export interface LogEntry {
  tick: number;
  kind: LogKind;
  text: string;
  /** Numbers the UI may want without parsing the text. */
  data?: Record<string, number | string>;
  /** The date in the game when it happened, as month * 100 + day, and the game year. Stamped by advance(), unless the line names its own. */
  date?: number;
  year?: number;
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
