import { newInbox } from './systems/inbox';
import { STARTER } from './config/map';
import { plainWeek } from './calendar';
import { newTerm, startFootball } from './newGame';
import { seedStreams } from './rng';
import { FIRST_INTAKE_TICK, TICKS_PER_YEAR } from './config/time';
import { GROUNDS_QUIET_TICKS } from './config/grounds';
import { LOCAL_SHARE, WORLD } from './config/town';
import { recomputeDesirability } from './systems/desirability';
import { buildTown, startingParcels } from './systems/town';
import type { GameState, MapState } from './types';

/**
 * Versioned saves. A save file is { v, savedAt, state }. On load it is parsed,
 * migrated up to the current version, then validated. Where the bytes are kept
 * is the app's business, not the sim's. See DESIGN.md section 17.5.
 */

export const SAVE_VERSION = 14;

export interface SaveFile {
  v: number;
  /** Real time the save was written, in epoch ms. Supplied by the caller. */
  savedAt: number;
  state: unknown;
}

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] turns a version n state into a version n + 1 state.
 * Add one whenever the state shape changes after a release, with a test
 * that loads an old fixture.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // Version 2 added `variant` to every map cell, for the kind of tree planted there.
  1: (state) => {
    const map = state.map as { cells?: Array<Record<string, unknown>> } | undefined;
    for (const cell of map?.cells ?? []) {
      if (typeof cell.variant !== 'number') cell.variant = 0;
    }
    return state;
  },
  // Version 3 added hand-placed buildings, a record of each entering class, and how the last semester ended.
  2: (state) => {
    const map = state.map as { cells?: Array<Record<string, unknown>>; placed?: unknown } | undefined;
    for (const cell of map?.cells ?? []) {
      if (cell.placedId === undefined) cell.placedId = null;
    }
    if (map && !Array.isArray(map.placed)) map.placed = [];

    // The history of the classes already here is not known, so each starts from who is enrolled today.
    if (!Array.isArray(state.classes)) {
      const cohorts = Array.isArray(state.cohorts) ? (state.cohorts as number[]) : [];
      const tick = Number((state.clock as { tick?: number } | undefined)?.tick ?? 0);
      const year = tick < FIRST_INTAKE_TICK ? 0 : Math.floor((tick - FIRST_INTAKE_TICK) / TICKS_PER_YEAR) + 1;
      const classes: Array<Record<string, number>> = [];
      for (let classYear = 3; classYear >= 0; classYear--) {
        const size = Number(cohorts[classYear] ?? 0);
        if (size > 0 && year - classYear >= 1) {
          classes.push({ entryYear: year - classYear, entered: size, finishedOnTime: 0, finishedLate: 0, left: 0 });
        }
      }
      state.classes = classes;
    }
    const admissions = state.admissions as Record<string, unknown> | undefined;
    if (admissions && admissions.lastSemester === undefined) admissions.lastSemester = null;
    return state;
  },
  // Version 4 records when each thing was paid for, so clearing can refund it.
  // What the campus began with was never paid for. Everything else is treated as paid long ago.
  3: (state) => {
    const map = state.map as
      | { width?: number; cells?: Array<Record<string, unknown>>; placed?: Array<Record<string, unknown> | null> }
      | undefined;
    const width = Number(map?.width ?? 0);
    const starter = new Map<number, string>();
    const mark = (x: number, y: number, kind: string): void => void starter.set(y * width + x, kind);
    for (const spine of STARTER.spines) for (let x = spine.x0; x <= spine.x1; x++) mark(x, spine.y, 'path');
    const { ring, quad } = STARTER;
    for (let y = ring.y; y < ring.y + ring.h; y++) {
      for (let x = ring.x; x < ring.x + ring.w; x++) {
        if (x === ring.x || y === ring.y || x === ring.x + ring.w - 1 || y === ring.y + ring.h - 1) mark(x, y, 'path');
      }
    }
    for (let y = quad.y; y < quad.y + quad.h; y++) for (let x = quad.x; x < quad.x + quad.w; x++) mark(x, y, 'quad');
    for (const b of STARTER.buildings) mark(b.x, b.y, 'lot');

    for (const placed of map?.placed ?? []) {
      if (!placed || typeof placed.builtTick === 'number') continue;
      const given = STARTER.placed.some((p) => p.type === placed.type && p.x === placed.x && p.y === placed.y);
      placed.builtTick = given ? -1 : 0;
    }
    (map?.cells ?? []).forEach((cell, index) => {
      if (typeof cell.builtTick === 'number') return;
      if (cell.kind === 'empty') cell.builtTick = -1;
      else if (cell.kind === 'placed') {
        const placed = typeof cell.placedId === 'number' ? map?.placed?.[cell.placedId] : null;
        cell.builtTick = placed ? Number(placed.builtTick) : 0;
      } else cell.builtTick = starter.get(index) === cell.kind ? -1 : 0;
    });
    return state;
  },
  // Version 5 added incidents.
  4: (state) => {
    if (typeof state.incidents !== 'object' || state.incidents === null) {
      state.incidents = { active: [], nextId: 1, handled: 0, missed: 0 };
    }
    return state;
  },
  // Version 6 added the town, the land for sale, roads and parking (DESIGN.md 25.4).
  // The map grows east and south. Every cell keeps its x and y, so nothing the player built moves.
  5: (state) => {
    const map = state.map as Record<string, unknown>;
    const oldWidth = Number(map.width ?? 0);
    const oldHeight = Number(map.height ?? 0);
    const oldCells = (map.cells as Array<Record<string, unknown>> | undefined) ?? [];
    const width = Math.max(WORLD.width, oldWidth);
    const height = Math.max(WORLD.height, oldHeight);
    const cells: Array<Record<string, unknown>> = [];
    for (let i = 0; i < width * height; i++) cells.push({ kind: 'empty', zone: null, buildingId: null, variant: 0, placedId: null, builtTick: -1 });
    for (let y = 0; y < oldHeight; y++) {
      for (let x = 0; x < oldWidth; x++) {
        const cell = oldCells[y * oldWidth + x];
        if (cell) cells[y * width + x] = cell;
      }
    }
    map.width = width;
    map.height = height;
    map.cells = cells;
    map.score = new Array<number>(width * height).fill(0);
    map.walkMinutes = new Array<number>(width * height).fill(-1);
    map.parcels = startingParcels();
    // The town is made from the save's own seed, so the same save always gains the same town.
    const typed = map as unknown as MapState;
    typed.town = { street: '', neighbourhoods: [], access: { walk: [], spaces: 0, linked: [] } };
    typed.town = buildTown(typed, Number(state.seed ?? 0) >>> 0);
    recomputeDesirability(typed);

    // Four in ten of every class already lived off campus under the old rule. They keep coming until
    // they graduate, path or no path, so beds wanted and income are what they were and nobody is turned out.
    const cohorts = Array.isArray(state.cohorts) ? (state.cohorts as number[]) : [0, 0, 0, 0];
    state.offCampus = [0, 1, 2, 3].map((classYear) => Math.round(Number(cohorts[classYear] ?? 0) * LOCAL_SHARE));
    const admissions = state.admissions as Record<string, unknown> | undefined;
    if (admissions) admissions.waitlistLocals = Math.round(Number(admissions.waitlist ?? 0) * LOCAL_SHARE);
    const money = state.money as Record<string, unknown> | undefined;
    if (money) money.ratesDirty = true;
    return state;
  },
  // Version 7 added grounds: litter, bins, seating and Facilities Yards (DESIGN.md 29.7).
  // Nothing is added to the map and nothing is charged. No litter falls for the first 36 hours.
  6: (state) => {
    const tick = Number((state.clock as { tick?: number } | undefined)?.tick ?? 0);
    if (typeof state.grounds !== 'object' || state.grounds === null) {
      state.grounds = { litter: {}, bins: {}, broken: {}, brokenFrom: {}, lamps: {}, lampFrom: {}, workers: {}, lastBreak: {}, quietUntilTick: tick + GROUNDS_QUIET_TICKS, overflowed: 0, repaired: 0 };
    }
    const map = state.map as unknown as MapState;
    map.care = { users: {}, bins: {}, yard: {}, lots: 0 };
    recomputeDesirability(map);
    return state;
  },
  // Version 8 widened a Facilities Yard's reach from 8 cells to 12, so which yard looks after what is
  // worked out again, and began keeping what broke each street lamp.
  7: (state) => {
    const grounds = state.grounds as Record<string, unknown>;
    if (typeof grounds.lampFrom !== 'object' || grounds.lampFrom === null) grounds.lampFrom = {};
    recomputeDesirability(state.map as unknown as MapState);
    return state;
  },
  // Version 9 is play stop 5. A Facilities Yard reaches 16 cells, and what broke each bin, bench and table is kept.
  8: (state) => {
    const grounds = state.grounds as Record<string, unknown>;
    if (typeof grounds.brokenFrom !== 'object' || grounds.brokenFrom === null) grounds.brokenFrom = {};
    recomputeDesirability(state.map as unknown as MapState);
    // A campus now opens with all four class years. One whose founders have not moved in yet gets them
    // that way. Any other is spread at its next fall intake (spreadClassYears).
    const tick = Number((state.clock as { tick?: number } | undefined)?.tick ?? 0);
    if (typeof state.fourYears !== 'boolean') state.fourYears = tick < FIRST_INTAKE_TICK;
    // Money by what it buys (DESIGN.md 31). Costs start where they stood and climb in seven daily steps.
    const money = state.money as Record<string, unknown>;
    if (typeof money.endowment !== 'number') money.endowment = 0;
    if (typeof money.marketing !== 'number') money.marketing = 0;
    if (typeof money.phase !== 'number') money.phase = 0;
    money.ratesDirty = true;
    return state;
  },
  // Version 10: recreation fills up. Who shares which court is worked out with the rest of the map's care.
  9: (state) => {
    recomputeDesirability(state.map as unknown as MapState);
    return state;
  },
  // Version 11: places to eat earn a little, shared among those that reach a student. Who shares whom is
  // worked out with the rest of the map's care, and the income rates are read again.
  10: (state) => {
    recomputeDesirability(state.map as unknown as MapState);
    (state.money as Record<string, unknown>).ratesDirty = true;
    return state;
  },
  // Version 12 is the football and calendar layer.
  11: (state) => upgradeToLayerOne(state),
  // Version 13: the campus scale (DESIGN.md 35.7). Every campus that exists is the small game's own size, so its
  // scale is 1 and nothing else about it changes.
  12: (state) => {
    const map = state.map as Record<string, unknown>;
    if (typeof map.scale !== 'number') map.scale = 1;
    return state;
  },
  // Version 14: the desk. Four advisors, named once from the seed, and an empty inbox. Nothing arrives before the
  // next day of the game week begins, and nothing on it does anything until the player or its default chooses.
  13: (state) => {
    if (typeof state.inbox !== 'object' || state.inbox === null) state.inbox = newInbox(Number(state.seed ?? 0));
    return state;
  },
};

/**
 * Version 12. The clock keeps where the game year stands. A save from before
 * has the plain week it always had: no founding day, no stretched summer and
 * no anchor yet. The app chooses an anchor for it when it is next opened,
 * which stretches its next summer and shortens nothing.
 */
function upgradeToLayerOne(state: Record<string, unknown>): Record<string, unknown> {
  const clock = state.clock as Record<string, unknown>;
  const tick = Number(clock.tick ?? 0);
  if (typeof clock.week !== 'object' || clock.week === null) clock.week = plainWeek(tick);
  if (clock.anchor === undefined) clock.anchor = null;
  if (typeof clock.anchorMovedTick !== 'number') clock.anchorMovedTick = -1;
  if (typeof state.term !== 'object' || state.term === null) state.term = newTerm(tick);
  // Breaks and the summer now change what food and the stores earn.
  (state.money as Record<string, unknown>).ratesDirty = true;
  // Football and the national field. The football random stream starts where a new game's would, so the
  // streams the save already has are untouched. Its first season is the next fall: nothing is played, paid
  // or decided before then.
  const rng = state.rng as Record<string, number>;
  if (typeof rng.football !== 'number') rng.football = seedStreams(Number(state.seed ?? 0)).football;
  if (typeof state.football !== 'object' || state.football === null) {
    const year = tick < FIRST_INTAKE_TICK ? 0 : (clock.week as { year: number }).year;
    startFootball(state as unknown as GameState, year + 1);
  }
  if (typeof state.decisions !== 'object' || state.decisions === null) state.decisions = { open: [], nextId: 1, past: [] };
  return state;
}

export type LoadResult =
  | { ok: true; state: GameState; savedAt: number; migratedFrom: number | null; app: unknown }
  | { ok: false; reason: string };

/**
 * The save as text. `app` is whatever the app wants kept beside the game, such
 * as an away list the player has not read yet. The sim carries it and never
 * looks inside.
 */
export function serialize(state: GameState, savedAt: number, app?: unknown): string {
  const file: SaveFile = { v: SAVE_VERSION, savedAt, state };
  return JSON.stringify(app === undefined ? file : { ...file, app });
}

export function migrate(
  raw: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = SAVE_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  let state = raw;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from save version ${v}`);
    state = step(state);
    state.version = v + 1;
  }
  return state;
}

/** The first problem found in a state, or null when it looks sound. */
export function validate(state: unknown): string | null {
  if (!isObject(state)) return 'The save holds no game.';
  if (state.version !== SAVE_VERSION) return `Unexpected save version ${String(state.version)}.`;

  for (const key of ['clock', 'money', 'map', 'rng', 'school', 'admissions', 'stats', 'incidents', 'grounds', 'term', 'field', 'football', 'decisions', 'inbox'] as const) {
    if (!isObject(state[key])) return `The save is missing "${key}".`;
  }
  for (const key of ['cohorts', 'timers', 'offCampus'] as const) {
    if (!Array.isArray(state[key])) return `The save is missing "${key}".`;
  }

  const map = state.map as Record<string, unknown>;
  const { width, height, cells, buildings, score, walkMinutes } = map;
  if (typeof width !== 'number' || typeof height !== 'number') return 'The map has no size.';
  if (typeof map.scale !== 'number' || !Number.isInteger(map.scale) || map.scale < 1) return 'The campus has no scale.';
  if (!Array.isArray(cells) || cells.length !== width * height) return 'The map is the wrong size.';
  if (!Array.isArray(buildings)) return 'The map has no building list.';
  if (!Array.isArray(map.placed)) return 'The map has no list of placed buildings.';
  if (!Array.isArray(map.parcels)) return 'The map has no land records.';
  if (!isObject(map.care)) return 'The map has no grounds records.';
  if (!isObject(map.town) || !Array.isArray(map.town.neighbourhoods) || !isObject(map.town.access)) return 'The map has no town.';
  if ((state.offCampus as unknown[]).length !== 4) return 'The save has the wrong number of class years living off campus.';
  if (!Array.isArray(state.classes)) return 'The save has no class records.';
  if (typeof state.fourYears !== 'boolean') return 'The save does not say whether it has all four class years.';
  if (!Array.isArray(score) || score.length !== cells.length) return 'The map has no desirability.';
  if (!Array.isArray(walkMinutes) || walkMinutes.length !== cells.length) return 'The map has no walk times.';
  if ((state.cohorts as unknown[]).length !== 4) return 'The save has the wrong number of class years.';

  const bad = firstBadNumber(state, 'state');
  if (bad) return `The save holds a broken number at ${bad}.`;
  return null;
}

export function parseSave(
  text: string,
  migrations: Record<number, Migration> = MIGRATIONS,
): LoadResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The save could not be read.' };
  }
  if (!isObject(file) || typeof file.v !== 'number' || !isObject(file.state)) {
    return { ok: false, reason: 'This is not a Campus Tycoon save.' };
  }
  if (file.v > SAVE_VERSION) {
    return { ok: false, reason: 'This save comes from a newer version of the game.' };
  }

  let state = file.state;
  let migratedFrom: number | null = null;
  if (file.v < SAVE_VERSION) {
    try {
      state = migrate(state, file.v, SAVE_VERSION, migrations);
      migratedFrom = file.v;
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'The save could not be updated.' };
    }
  }

  const problem = validate(state);
  if (problem) return { ok: false, reason: problem };
  return {
    ok: true,
    state: state as unknown as GameState,
    savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0,
    migratedFrom,
    app: file.app ?? null,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Walks the whole state and returns the path of the first NaN or infinity. */
function firstBadNumber(value: unknown, path: string): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const bad = firstBadNumber(value[i], `${path}[${i}]`);
      if (bad) return bad;
    }
    return null;
  }
  if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const bad = firstBadNumber(value[key], `${path}.${key}`);
      if (bad) return bad;
    }
  }
  return null;
}
