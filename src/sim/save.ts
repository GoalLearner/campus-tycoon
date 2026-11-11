import type { GameState } from './types';

/**
 * Versioned saves. A save file is { v, savedAt, state }. On load it is parsed,
 * migrated up to the current version, then validated. Where the bytes are kept
 * is the app's business, not the sim's. See DESIGN.md section 17.5.
 */

export const SAVE_VERSION = 1;

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
export const MIGRATIONS: Record<number, Migration> = {};

export type LoadResult =
  | { ok: true; state: GameState; savedAt: number; migratedFrom: number | null }
  | { ok: false; reason: string };

export function serialize(state: GameState, savedAt: number): string {
  const file: SaveFile = { v: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
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

  for (const key of ['clock', 'money', 'map', 'rng', 'school', 'admissions', 'stats'] as const) {
    if (!isObject(state[key])) return `The save is missing "${key}".`;
  }
  for (const key of ['cohorts', 'timers'] as const) {
    if (!Array.isArray(state[key])) return `The save is missing "${key}".`;
  }

  const map = state.map as Record<string, unknown>;
  const { width, height, cells, buildings, score, walkMinutes } = map;
  if (typeof width !== 'number' || typeof height !== 'number') return 'The map has no size.';
  if (!Array.isArray(cells) || cells.length !== width * height) return 'The map is the wrong size.';
  if (!Array.isArray(buildings)) return 'The map has no building list.';
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
