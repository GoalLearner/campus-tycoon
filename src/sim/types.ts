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
  | 'studyCenter';

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
export type RngStream = 'growth' | 'intake' | 'names' | 'events' | 'football';
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
export type TimerKind = 'buildDone' | 'kickoff' | 'final' | 'stadiumDone' | 'decision' | 'scrimmage';

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
  kind: 'happy' | 'stress' | 'fans' | 'applicants';
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
  | { t: 'mark'; key: 'donor' | 'boat' };

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
