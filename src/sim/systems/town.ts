import { PLACED } from '../config/placed';
import { WALK_MINUTES_PER_CELL } from '../config/desirability';
import {
  HOUSE_LOOKS,
  LAND_FOR_SALE,
  MAIN_STREET,
  PLOTS_MIN,
  PLOTS_SPREAD,
  SIDE_STREET_ROWS,
  START_LAND,
  STREET_NAMES,
  STUDENTS_PER_HOUSE,
  TOWN_GATE_ROWS,
  TOWN_WALK_EXTRA_MINUTES,
  TOWN_WALK_MAX_MINUTES,
  TOWN_X,
} from '../config/town';
import { hashInts } from '../rng';
import type { GameState, MapState, Neighbourhood, Parcel, Placed, Town } from '../types';

/**
 * The town beside the campus: who can live there, and how they get to class.
 *
 * Locals live in houses in town. A neighbourhood's students walk when a path
 * joins its street to campus and the walk is short enough. From any other
 * neighbourhood they drive, and each driver needs a parking space that a road
 * links to a town street. A local with no way in needs a bed instead.
 *
 * Everything here changes only when the player builds, so it is worked out
 * after an action and stored with the map. Nothing runs in catch-up.
 * See DESIGN.md section 25.
 */

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The parcels of a new map: the starting land, owned, and the fields for sale. */
export function startingParcels(): Parcel[] {
  const parcels: Parcel[] = [{ id: 0, name: START_LAND.name, x: START_LAND.x, y: START_LAND.y, w: START_LAND.w, h: START_LAND.h, price: 0, owned: true }];
  for (const field of LAND_FOR_SALE) parcels.push({ id: parcels.length, name: field.name, x: field.x, y: field.y, w: field.w, h: field.h, price: field.price, owned: false });
  return parcels;
}

/** The parcel a cell lies in, or null for the town. */
export function parcelAt(map: MapState, x: number, y: number): Parcel | null {
  for (const parcel of map.parcels) {
    if (x >= parcel.x && y >= parcel.y && x < parcel.x + parcel.w && y < parcel.y + parcel.h) return parcel;
  }
  return null;
}

/** True where the player may build. */
export function ownedAt(map: MapState, x: number, y: number): boolean {
  return parcelAt(map, x, y)?.owned === true;
}

/**
 * Lay the town into the cells east of the campus and return its record. It is
 * made from the seed by hashing alone, so the same seed always gives the same
 * town and no random stream is touched. The cells must be empty.
 */
export function buildTown(map: MapState, seed: number): Town {
  const { width, height, cells } = map;
  const at = (x: number, y: number) => cells[y * width + x]!;
  for (let y = 0; y < height; y++) {
    for (let x = TOWN_X; x < width; x++) {
      const cell = at(x, y);
      cell.kind = x === TOWN_X ? 'street' : 'town';
      // Gardens: most are lawn, some carry a tree.
      cell.variant = x === TOWN_X ? 0 : hashInts(seed, x, y, 77) % 10;
      cell.builtTick = -1;
    }
  }

  const start = hashInts(seed, 3, 41) % STREET_NAMES.length;
  const neighbourhoods: Neighbourhood[] = [];
  SIDE_STREET_ROWS.forEach((row, n) => {
    if (row - 1 < 0 || row + 1 >= height) return;
    for (let x = TOWN_X + 1; x < width; x++) {
      at(x, row).kind = 'street';
      at(x, row).variant = 0;
    }
    // Every cell either side of the street could hold a house. A hashed order picks which do.
    const spots: Array<{ x: number; y: number; order: number }> = [];
    for (let x = TOWN_X + 2; x < width; x++) {
      for (const y of [row - 1, row + 1]) spots.push({ x, y, order: hashInts(seed, n, x, y) });
    }
    spots.sort((a, b) => a.order - b.order || a.x - b.x || a.y - b.y);
    const count = Math.min(spots.length, PLOTS_MIN + (hashInts(seed, n, 5) % PLOTS_SPREAD));
    // Houses nearest the main street fill first.
    const plots = spots
      .slice(0, count)
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((spot) => ({ x: spot.x, y: spot.y, look: hashInts(seed, spot.x, spot.y, 11) % HOUSE_LOOKS }));
    for (const plot of plots) {
      const cell = at(plot.x, plot.y);
      cell.kind = 'house';
      cell.variant = plot.look;
    }
    neighbourhoods.push({ id: neighbourhoods.length, name: STREET_NAMES[(start + n) % STREET_NAMES.length]!, row, plots });
  });

  return { street: MAIN_STREET, neighbourhoods, access: { walk: neighbourhoods.map(() => -1), spaces: 0, linked: [] } };
}

// ----------------------------------------------------------------- access --

const drivable = (kind: string): boolean => kind === 'road' || kind === 'crossing' || kind === 'street';

/**
 * Refresh who can walk in and which car parks a road reaches. `steps` is the
 * count of walked cells from every path cell to the nearest Academic lot, as
 * desirability works it out.
 */
export function refreshTownAccess(map: MapState, steps: Int32Array): void {
  const { width, height, cells } = map;
  const town = map.town;

  // Walking: a path that meets the main street near a neighbourhood's side street joins it to campus.
  const gateX = TOWN_X - 1;
  town.access.walk = town.neighbourhoods.map((hood) => {
    let best = -1;
    for (let y = hood.row - TOWN_GATE_ROWS; y <= hood.row + TOWN_GATE_ROWS; y++) {
      if (y < 0 || y >= height) continue;
      const walked = steps[y * width + gateX]!;
      if (walked > 0 && (best === -1 || walked < best)) best = walked;
    }
    return best === -1 ? -1 : (best + 1) * WALK_MINUTES_PER_CELL + TOWN_WALK_EXTRA_MINUTES;
  });

  // Driving: every road cell that links back to a town street.
  const reached = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.kind === 'street') {
      reached[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (reached[ni] === 0 && drivable(cells[ni]!.kind)) {
        reached[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // A car park holds cars when a linked road, or a street, touches any side of it.
  let spaces = 0;
  const linked: number[] = [];
  for (const placed of map.placed) {
    if (!placed) continue;
    const cars = PLACED[placed.type].cars ?? 0;
    if (cars === 0) continue;
    let touches = false;
    for (let y = placed.y - 1; y <= placed.y + placed.h && !touches; y++) {
      for (let x = placed.x - 1; x <= placed.x + placed.w && !touches; x++) {
        const beside = (x < placed.x || x >= placed.x + placed.w) !== (y < placed.y || y >= placed.y + placed.h);
        if (!beside || x < 0 || y < 0 || x >= width || y >= height) continue;
        if (reached[y * width + x] === 1) touches = true;
      }
    }
    if (touches) {
      spaces += cars;
      linked.push(placed.id);
    }
  }
  town.access.spaces = spaces;
  town.access.linked = linked;
}

/** True when a road links this car park to a town street. Without one it holds no cars. */
export function hasRoadAccess(map: MapState, placed: Placed): boolean {
  return map.town.access.linked.includes(placed.id);
}

export function hoodCapacity(hood: Neighbourhood): number {
  return hood.plots.length * STUDENTS_PER_HOUSE;
}

/** True when this neighbourhood's students can walk to class. */
export function hoodWalks(map: MapState, hood: Neighbourhood): boolean {
  const minutes = map.town.access.walk[hood.id] ?? -1;
  return minutes >= 0 && minutes <= TOWN_WALK_MAX_MINUTES;
}

export interface TownPlaces {
  /** Places in neighbourhoods whose students can walk in. */
  walk: number;
  /** Places in the other neighbourhoods that a parking space lets in. */
  drive: number;
  /** Places in the other neighbourhoods, whether or not anyone can get in from them. */
  driveWanted: number;
  /** Parking spaces a road reaches. */
  spaces: number;
  total: number;
}

/** How many locals the town can send to campus as things stand. */
export function townPlaces(map: MapState): TownPlaces {
  let walk = 0;
  let driveWanted = 0;
  for (const hood of map.town.neighbourhoods) {
    if (hoodWalks(map, hood)) walk += hoodCapacity(hood);
    else driveWanted += hoodCapacity(hood);
  }
  const spaces = map.town.access.spaces;
  const drive = Math.min(driveWanted, spaces);
  return { walk, drive, driveWanted, spaces, total: walk + drive };
}

/** Students living off campus now, across every class. */
export function offCampusNow(state: GameState): number {
  const o = state.offCampus;
  return o[0] + o[1] + o[2] + o[3];
}

/** Places in town not yet taken by a student already enrolled. */
export function freeTownPlaces(state: GameState): number {
  return Math.max(0, townPlaces(state.map).total - offCampusNow(state));
}

export interface HoodLiving {
  id: number;
  name: string;
  capacity: number;
  living: number;
  /** How its students get to class. 'none' when nobody can get in from here yet. */
  mode: 'walk' | 'drive' | 'none';
  /** The walk to class in minutes, or -1 when no path joins it. */
  walkMinutes: number;
  /** Houses to show standing. */
  houses: number;
}

/**
 * Who lives where, for the map and the neighbourhood card. Students are not
 * tracked one by one: those living off campus fill the walking neighbourhoods
 * nearest first, then the driving ones as far as parking allows. Students who
 * were let in before a path or car park was cleared keep coming, and are shown
 * wherever there is still room.
 */
export function townLiving(state: GameState): HoodLiving[] {
  const map = state.map;
  const hoods = map.town.neighbourhoods;
  const living = hoods.map(() => 0);
  let left = offCampusNow(state);

  const walking = hoods.filter((hood) => hoodWalks(map, hood)).sort((a, b) => map.town.access.walk[a.id]! - map.town.access.walk[b.id]! || a.id - b.id);
  for (const hood of walking) {
    const take = Math.min(left, hoodCapacity(hood));
    living[hood.id] = take;
    left -= take;
  }
  let spaces = map.town.access.spaces;
  const driving = hoods.filter((hood) => !hoodWalks(map, hood));
  for (const hood of driving) {
    const take = Math.min(left, hoodCapacity(hood), spaces);
    living[hood.id] = take;
    left -= take;
    spaces -= take;
  }
  for (const hood of hoods) {
    const take = Math.min(left, hoodCapacity(hood) - living[hood.id]!);
    living[hood.id]! += take;
    left -= take;
  }

  return hoods.map((hood) => {
    const walks = hoodWalks(map, hood);
    const here = living[hood.id]!;
    return {
      id: hood.id,
      name: hood.name,
      capacity: hoodCapacity(hood),
      living: here,
      mode: walks ? 'walk' : map.town.access.spaces > 0 ? 'drive' : 'none',
      walkMinutes: map.town.access.walk[hood.id] ?? -1,
      houses: Math.min(hood.plots.length, Math.ceil(here / STUDENTS_PER_HOUSE)),
    };
  });
}

/** Students who drive to class now: those living in neighbourhoods too far to walk from. */
export function driversNow(state: GameState): number {
  let drivers = 0;
  for (const hood of townLiving(state)) if (hood.mode !== 'walk') drivers += hood.living;
  return Math.min(drivers, state.map.town.access.spaces);
}

/** The neighbourhood a cell belongs to: its side street or one of its plots. null elsewhere. */
export function hoodAt(map: MapState, x: number, y: number): Neighbourhood | null {
  if (x <= TOWN_X) return null;
  for (const hood of map.town.neighbourhoods) {
    if (Math.abs(y - hood.row) <= 1) return hood;
  }
  return null;
}

/** One line on what would let more of a neighbourhood's students come. '' when nothing is holding it back. */
export function hoodAdvice(state: GameState, hood: HoodLiving): string {
  if (hood.mode === 'walk') return '';
  if (hood.walkMinutes < 0) {
    return hood.mode === 'drive'
      ? `Its students drive. Lay a path from campus to ${state.map.town.street} beside it and they could walk instead.`
      : `Nobody can get to class from here. Lay a path from campus to ${state.map.town.street} beside it, or build parking with a road to the street.`;
  }
  const far = `The walk to class is ${Math.round(hood.walkMinutes)} minutes, and ${TOWN_WALK_MAX_MINUTES} is as far as anyone walks.`;
  return hood.mode === 'drive' ? `${far} Its students drive. Academic lots nearer the street would let them walk.` : `${far} Zone Academic lots nearer the street, or build parking with a road.`;
}
