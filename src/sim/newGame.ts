import { VARIANTS_PER_STAGE } from './config/buildings';
import { STARTER } from './config/map';
import { WORLD } from './config/town';
import { START_CASH } from './config/money';
import { TICK_MS } from './config/time';
import { hashInts, seedStreams } from './rng';
import { SAVE_VERSION } from './save';
import { recomputeDesirability } from './systems/desirability';
import { addPlaced } from './systems/placed';
import { recomputeRates } from './systems/money';
import { buildTown, startingParcels } from './systems/town';
import type { Cell, GameState, MapState, Zone } from './types';

export interface NewGameOptions {
  seed: number;
  name: string;
  /** Real time, in epoch ms, at which the game is created. */
  now: number;
}

/** The whole map, bare: the starting land, the fields for sale, and the town laid in down its east side. */
function emptyMap(width: number, height: number, seed: number): MapState {
  const cells: Cell[] = [];
  for (let i = 0; i < width * height; i++) cells.push({ kind: 'empty', zone: null, buildingId: null, variant: 0, placedId: null, builtTick: -1 });
  const map: MapState = {
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

/** A brand-new campus, fifteen minutes before its first class moves in. */
export function newGame(opts: NewGameOptions): GameState {
  const map = emptyMap(WORLD.width, WORLD.height, opts.seed >>> 0);
  buildStarterCampus(map, opts.seed);
  recomputeDesirability(map);

  const state: GameState = {
    version: SAVE_VERSION,
    seed: opts.seed >>> 0,
    rng: seedStreams(opts.seed),
    clock: {
      tick: 0,
      nextTickAt: opts.now + TICK_MS,
      lastSimulatedAt: opts.now,
      createdAt: opts.now,
      weeksSkipped: 0,
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
    },
    map,
    cohorts: [0, 0, 0, 0],
    offCampus: [0, 0, 0, 0],
    classes: [],
    admissions: { waitlist: 0, waitlistUntilTick: 0, waitlistAdmitted: 0, waitlistLocals: 0, lastIntake: null, lastSemester: null },
    timers: [],
    timerSeq: 0,
    stats: { graduates: 0, yearsCompleted: 0, peakEnrollment: 0 },
    incidents: { active: [], nextId: 1, handled: 0, missed: 0 },
    grounds: { litter: {}, bins: {}, broken: {}, lamps: {}, workers: {}, lastBreak: {}, quietUntilTick: 0, overflowed: 0, repaired: 0 },
  };
  recomputeRates(state);
  return state;
}
