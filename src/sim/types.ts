/**
 * The whole game state. Plain JSON only: no classes, Maps, Sets or Dates,
 * so cloning and saving are exact. See DESIGN.md section 17.5.
 */

export type Zone = 'housing' | 'academic';
export const ZONES: readonly Zone[] = ['housing', 'academic'];

export type CellKind = 'empty' | 'path' | 'quad' | 'lot';

export interface Cell {
  kind: CellKind;
  /** Set on lots only. */
  zone: Zone | null;
  /** Index into map.buildings, or null when nothing stands here. */
  buildingId: number | null;
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

export interface MapState {
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  cells: Cell[];
  /** A building's id is its index. Cleared buildings leave a null. */
  buildings: (Building | null)[];
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
  lastIntake: IntakeResult | null;
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
  admissions: Admissions;
  timers: Timer[];
  timerSeq: number;
  stats: Stats;
}

export type LogKind =
  | 'built'
  | 'intake'
  | 'waitlist'
  | 'waitlistClosed'
  | 'graduation'
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
