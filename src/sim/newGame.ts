import { newInbox } from './systems/inbox';
import { stageSpec } from './config/buildings';
import { layModelCampus, type ModelDistrict } from './modelCampus';
import { openWithStudents } from './systems/admissions';
import { yardStatus } from './systems/grounds';
import { openCapacity } from './selectors';
import { WORK_PER_WORKER, YARD_MAX_WORKERS } from './config/grounds';
import { VARIANTS_PER_STAGE } from './config/buildings';
import { STARTER } from './config/map';
import { WORLD } from './config/town';
import { START_CASH, PHASE_STEPS } from './config/money';
import { FIRST_INTAKE_TICK, TICK_MS, TICKS_PER_DAY } from './config/time';
import { minutesToAnchor } from './calendar';
import { hashInts, seedStreams } from './rng';
import { SAVE_VERSION } from './save';
import { recomputeDesirability } from './systems/desirability';
import { addPlaced } from './systems/placed';
import { recomputeRates } from './systems/money';
import { buildTown, startingParcels } from './systems/town';
import { makeField } from './systems/field';
import { newFootball, scheduleScrimmage } from './systems/football';
import type { Cell, Football, GameState, MapState, Term, Zone } from './types';

export interface NewGameOptions {
  seed: number;
  name: string;
  /** Real time, in epoch ms, at which the game is created. */
  now: number;
  /**
   * The anchor: the minute of the UTC day at which each day of the week
   * begins, two hours after the player's day usually starts. Left out, the
   * week begins with the first class and there is no founding day.
   */
  anchor?: number;
  /**
   * Which campus to begin with: the small one every game has begun with, or
   * the model campus of DESIGN.md section 35, whole from the first minute.
   */
  campus?: 'small' | 'model';
  /**
   * The model campus only: its campus scale. Left out, it is the scale at
   * which the campus opens with 46,000 students in about nine tenths of its
   * seats. The tests also open it at 1, to check that a campus behaves the
   * same at every scale.
   */
  scale?: number;
}

/** The whole map, bare: the starting land, the fields for sale, and the town laid in down its east side. */
function emptyMap(width: number, height: number, seed: number): MapState {
  const cells: Cell[] = [];
  for (let i = 0; i < width * height; i++) cells.push({ kind: 'empty', zone: null, buildingId: null, variant: 0, placedId: null, builtTick: -1 });
  const map: MapState = {
    scale: 1,
    width,
    height,
    cells,
    buildings: [],
    placed: [],
    parcels: startingParcels(),
    town: { street: '', neighbourhoods: [], access: { walk: [], spaces: 0, linked: [] } },
    care: { users: {}, bins: {}, yard: {}, lots: 0 },
    score: new Array<number>(width * height).fill(0),
    walkMinutes: new Array<number>(width * height).fill(-1),
  };
  map.town = buildTown(map, seed);
  return map;
}

function setKind(map: MapState, x: number, y: number, kind: Cell['kind']): void {
  const cell = map.cells[y * map.width + x]!;
  cell.kind = kind;
}

function placeStarterBuilding(map: MapState, seed: number, zone: Zone, x: number, y: number): void {
  const id = map.buildings.length;
  map.buildings.push({
    id,
    x,
    y,
    w: 1,
    h: 1,
    zone,
    stage: 1,
    variant: hashInts(seed, id, 1) % VARIANTS_PER_STAGE,
    rebuild: null,
  });
  const cell = map.cells[y * map.width + x]!;
  cell.kind = 'lot';
  cell.zone = zone;
  cell.buildingId = id;
}

/** The starter campus: a quad, a ring of path, two spines, six small buildings. */
function buildStarterCampus(map: MapState, seed: number): void {
  const { quad, ring, spines } = STARTER;

  for (const spine of [...spines, STARTER.townLink]) {
    for (let x = spine.x0; x <= spine.x1; x++) setKind(map, x, spine.y, 'path');
  }
  for (let y = ring.y; y < ring.y + ring.h; y++) {
    for (let x = ring.x; x < ring.x + ring.w; x++) {
      const edge = x === ring.x || y === ring.y || x === ring.x + ring.w - 1 || y === ring.y + ring.h - 1;
      if (edge) setKind(map, x, y, 'path');
    }
  }
  for (let y = quad.y; y < quad.y + quad.h; y++) {
    for (let x = quad.x; x < quad.x + quad.w; x++) setKind(map, x, y, 'quad');
  }
  for (const b of STARTER.buildings) placeStarterBuilding(map, seed, b.zone, b.x, b.y);
  for (const p of STARTER.placed) addPlaced(map, p.type, p.x, p.y);
}

/** The academic year's small record, starting at a tick. */
export function newTerm(tick: number): Term {
  return { stressSum: 0, since: tick, lastTick: tick, lastStress: 0, factor: 0.6, examPeak: 0, examCause: 'season', facultyPeak: 0, lastAverage: 0, snowYear: 0 };
}

/**
 * Give a campus its national field and its football programme. `firstYear`
 * is the first game year with a season: 1 for a new campus, and the year
 * after this one for a save from before football.
 */
export function startFootball(state: GameState, firstYear: number): void {
  state.field = makeField(state.rng, state.school.name);
  state.football = newFootball(state.rng, state.field, firstYear);
}

/** A brand-new campus, fifteen minutes before its first class moves in. */
export function newGame(opts: NewGameOptions): GameState {
  const map = emptyMap(WORLD.width, WORLD.height, opts.seed >>> 0);
  const model = opts.campus === 'model';
  if (model) {
    // The model campus owns the starting land and both fields from the start.
    for (const parcel of map.parcels) parcel.owned = true;
    layModelCampus(map, opts.seed >>> 0);
    map.scale = opts.scale === undefined ? modelScale(map) : Math.max(1, Math.round(opts.scale));
  } else buildStarterCampus(map, opts.seed);
  recomputeDesirability(map);

  const anchor = opts.anchor === undefined ? null : ((Math.round(opts.anchor) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  // The model campus opens at the moment a first class would have moved in: its students are already there, so
  // its clock begins at that tick and no founding class is on its way. Its week still begins at the next anchor,
  // and never on the opening tick itself, so the first day of its fall is not skipped.
  const startTick = model ? FIRST_INTAKE_TICK : 0;
  let founding = anchor === null ? 0 : minutesToAnchor(opts.now + (FIRST_INTAKE_TICK - startTick) * TICK_MS, anchor);
  if (model && founding < 1) founding = anchor === null ? 1 : TICKS_PER_DAY;
  const state: GameState = {
    version: SAVE_VERSION,
    seed: opts.seed >>> 0,
    rng: seedStreams(opts.seed),
    clock: {
      tick: startTick,
      nextTickAt: opts.now + TICK_MS,
      lastSimulatedAt: opts.now,
      createdAt: opts.now,
      weeksSkipped: 0,
      // The first class moves in after fifteen minutes. The founding day runs from then to the first anchor.
      week: { year: 1, start: FIRST_INTAKE_TICK + founding, extra: 0 },
      anchor,
      anchorMovedTick: -1,
    },
    school: { name: opts.name },
    money: {
      cash: START_CASH,
      incomePerYear: 0,
      spendingPerYear: 0,
      ratesDirty: true,
      yearEarned: 0,
      yearSpent: 0,
      grants: 0,
      endowment: 0,
      marketing: 0,
      phase: PHASE_STEPS,
    },
    map,
    cohorts: [0, 0, 0, 0],
    offCampus: [0, 0, 0, 0],
    classes: [],
    fourYears: true,
    admissions: { waitlist: 0, waitlistUntilTick: 0, waitlistAdmitted: 0, waitlistLocals: 0, lastIntake: null, lastSemester: null },
    timers: [],
    timerSeq: 0,
    stats: { graduates: 0, yearsCompleted: 0, peakEnrollment: 0 },
    incidents: { active: [], nextId: 1, handled: 0, missed: 0 },
    grounds: { litter: {}, bins: {}, broken: {}, brokenFrom: {}, lamps: {}, lampFrom: {}, workers: {}, lastBreak: {}, quietUntilTick: 0, overflowed: 0, repaired: 0 },
    term: newTerm(0),
    // Filled in just below, from the football random stream.
    field: { schools: [], reputation: 0, academic: 0, rank: 0, rankYear: 0, moved: null },
    football: null as unknown as Football,
    decisions: { open: [], nextId: 1, past: [] },
    inbox: newInbox(opts.seed),
  };
  startFootball(state, 1);
  // A new campus has its stadium plot from the first day.
  state.football.stadium.plot = state.map.placed.find((placed) => placed?.type === 'stadium')?.id ?? null;
  scheduleScrimmage(state);
  if (model) openModelCampus(state, opts.scale === undefined);
  recomputeRates(state);
  return state;
}

/**
 * The numbers the model campus opens with (DESIGN.md 35.4): its yards
 * staffed, students in about nine tenths of its seats, and cash worth about a
 * tenth of a year's spending.
 */
function openModelCampus(state: GameState, fullSize: boolean): void {
  // At its own scale it opens with exactly the students it was asked to hold. At any other, with as many in proportion.
  const map = state.map;
  const own = modelScale({ ...map, scale: 1 });
  openWithStudents(state, fullSize ? MODEL_STUDENTS : Math.round((MODEL_STUDENTS * map.scale) / own));
  // Each yard is given the workers it needs to keep up with what it looks after, and never fewer than one.
  for (const yard of state.map.placed) {
    if (!yard || yard.type !== 'yard') continue;
    state.grounds.workers[yard.id] = 0;
    // Enough for the campus when it is full, which it is from its first fall: a crew sized for nine tenths falls behind.
    state.grounds.workers[yard.id] = Math.min(YARD_MAX_WORKERS, Math.max(1, Math.ceil((yardStatus(state, yard).need * MODEL_CREW_ROOM) / WORK_PER_WORKER)));
  }
  state.money.ratesDirty = true;
  recomputeRates(state);
  state.money.cash = Math.round((state.money.spendingPerYear * MODEL_CASH_SHARE) / 1000) * 1000;
}

/** The districts of the model campus as the script lays them: where each was aimed, and where it landed. */
export function modelDistricts(seed: number): ModelDistrict[] {
  const map = emptyMap(WORLD.width, WORLD.height, seed >>> 0);
  for (const parcel of map.parcels) parcel.owned = true;
  return layModelCampus(map, seed >>> 0);
}

/** The students the model campus opens with (DESIGN.md 35.7): the owner's number. */
export const MODEL_STUDENTS = 46_000;

/** The whole number that makes those students about nine tenths of the seats the campus has as laid. */
function modelScale(map: MapState): number {
  let seats = 0;
  for (const building of map.buildings) if (building && building.zone === 'academic') seats += stageSpec('academic', building.stage, 1).capacity;
  return Math.max(1, Math.round(MODEL_STUDENTS / MODEL_FULL / Math.max(1, seats)));
}

/** [T] How much more work the model campus's crews are sized for than it asks on the day it opens. */
export const MODEL_CREW_ROOM = 1.2;

/** [T] How full the model campus opens, and its cash as a share of a year's spending. */
export const MODEL_FULL = 0.9;
export const MODEL_CASH_SHARE = 0.1;
