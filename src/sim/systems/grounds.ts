import {
  BIN_CAPACITY,
  BIN_CATCH,
  BIN_PER_WORK,
  BIN_REACH,
  BREAK_AT,
  BREAK_EVERY_TICKS,
  BREAK_LINES,
  BREAK_RATE,
  BREAK_REACH,
  BREAK_SAFETY_SHARE,
  DIRT_AT_CEILING,
  DIRT_INVITES,
  DROP_BUSY,
  FIX_WORK,
  GROUNDS_EVAL_TICKS,
  LITTER_CEILING,
  LITTER_STRENGTH,
  MESS_REACH_MIN,
  PATH_DIRT,
  SEAT_REACH,
  SEAT_UNITS,
  SEATS_PLENTY,
  SPOT_FULL_AT,
  WAGE_PER_YEAR,
  WORK_PER_WORKER,
  YARD_MAX_WORKERS,
} from '../config/grounds';
import { PLACED } from '../config/placed';
import { nextFloat } from '../rng';
import { enrollment } from '../selectors';
import type { GameState, LogEntry, MapState, Placed } from '../types';

/**
 * Grounds. Students drop litter where they eat and play. Bins catch most of
 * it. Workers from a Facilities Yard empty the bins, sweep up what missed, and
 * fix what gets broken. A dirty spot costs a little Happiness, up to a ceiling.
 *
 * Nothing here ever stops a building working, holds back growth or waits for
 * a tap. It is a handful of sums for each spot, bin and yard every twenty
 * minutes, so thirty days of catch-up stays cheap. See DESIGN.md section 29.
 */

/** Cells between a point and the nearest cell of a footprint. 0 inside it. */
function gapTo(placed: Placed, x: number, y: number): number {
  const dx = Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1));
  const dy = Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1));
  return Math.max(dx, dy);
}

/** Cells between two footprints. 0 when they touch or overlap. */
function gapBetween(a: Placed, b: Placed): number {
  const dx = Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), 0);
  const dy = Math.max(b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1), 0);
  return Math.max(dx, dy);
}

/** How much litter a kind of place makes. 0 for anything that is not a mess spot. */
export function messStrength(placed: Placed): number {
  return LITTER_STRENGTH[PLACED[placed.type].family] ?? 0;
}

/** A place where students eat, shop or play, and so drop litter. */
export function isMessSpot(placed: Placed): boolean {
  return messStrength(placed) > 0;
}

/** How far a mess spot's litter is felt: as far as the building itself reaches, and never less than a few cells. */
function messReach(placed: Placed): number {
  return Math.max(PLACED[placed.type].radius, MESS_REACH_MIN);
}

/** True where the game stands a street lamp: every fourth cell of path, every fifth of road or street. */
export function lampAt(map: MapState, x: number, y: number): boolean {
  const kind = map.cells[y * map.width + x]?.kind;
  if (kind === 'path') return (x + y) % 4 === 0;
  if (kind === 'road' || kind === 'street') return (x + y) % 5 === 2;
  return false;
}

// ------------------------------------------------------------------ care --

/**
 * Work out who serves what: the lots that use each mess spot, the bins beside
 * it, and the yard that looks after each thing. These change only when the
 * player builds, so they are worked out after an action and kept with the map.
 */
export function refreshCare(map: MapState): void {
  const users: Record<number, number> = {};
  const bins: Record<number, number[]> = {};
  const yard: Record<number, number> = {};
  const all = map.placed.filter((placed): placed is Placed => !!placed);
  const yards = all.filter((placed) => placed.type === 'yard');
  const binList = all.filter((placed) => placed.type === 'bin');
  let lots = 0;
  for (const cell of map.cells) if (cell.kind === 'lot') lots += 1;

  for (const placed of all) {
    if (isMessSpot(placed)) {
      // The lots within its reach are the students who use it.
      const reach = messReach(placed);
      let count = 0;
      for (let y = Math.max(0, placed.y - reach); y <= Math.min(map.height - 1, placed.y + placed.h - 1 + reach); y++) {
        for (let x = Math.max(0, placed.x - reach); x <= Math.min(map.width - 1, placed.x + placed.w - 1 + reach); x++) {
          if (map.cells[y * map.width + x]!.kind === 'lot') count += 1;
        }
      }
      users[placed.id] = count;
      bins[placed.id] = binList.filter((bin) => gapBetween(placed, bin) <= BIN_REACH).map((bin) => bin.id);
    }
    if (placed.type === 'yard') continue;
    // The nearer yard looks after it. A thing inside two circles is never counted twice.
    let best = -1;
    let bestGap = Infinity;
    for (const candidate of yards) {
      const gap = gapBetween(candidate, placed);
      if (gap <= PLACED.yard.radius && gap < bestGap) {
        best = candidate.id;
        bestGap = gap;
      }
    }
    yard[placed.id] = best;
  }
  const byFamily: Record<string, number[]> = {};
  for (const placed of all) (byFamily[PLACED[placed.type].family] ??= []).push(placed.id);
  map.care = { users, bins, yard, lots, byFamily };
}

/** The yard whose circle covers a cell, nearest first. null when none does. */
export function yardOver(map: MapState, x: number, y: number): Placed | null {
  let best: Placed | null = null;
  let bestGap = Infinity;
  for (const placed of map.placed) {
    if (!placed || placed.type !== 'yard') continue;
    const gap = gapTo(placed, x, y);
    if (gap <= PLACED.yard.radius && gap < bestGap) {
      best = placed;
      bestGap = gap;
    }
  }
  return best;
}

export function workersAt(state: GameState, yardId: number): number {
  return state.grounds.workers[yardId] ?? 0;
}

/** Every worker's wage for a game year, across all yards. */
export function wagesPerYear(state: GameState): number {
  let workers = 0;
  for (const placed of state.map.placed) if (placed && placed.type === 'yard') workers += workersAt(state, placed.id);
  return workers * WAGE_PER_YEAR;
}

// ---------------------------------------------------------------- litter --

/** Litter a spot drops at each check when nothing is lying there yet. */
export function dropOf(state: GameState, spot: Placed): number {
  const care = state.map.care;
  const students = care.lots > 0 ? (enrollment(state) * (care.users[spot.id] ?? 0)) / care.lots : 0;
  return Math.min(1, students / SPOT_FULL_AT) * messStrength(spot) * DROP_BUSY * litterTilt(state);
}

/**
 * How the mix of student types tilts littering, a tenth either way at most.
 * The types that would move it, Slackers and Party Animals, do not yet vary
 * from one campus to another, so today this is always 1. For the same reason
 * the Resident Advisor who empties a full bin in passing is not built yet.
 */
export function litterTilt(_state: GameState): number {
  return 1;
}

const isBroken = (state: GameState, id: number): boolean => (state.grounds.broken[id] ?? 0) > 0;

function nameOf(placed: Placed): string {
  return PLACED[placed.type].name;
}

/** One check: litter falls, bins fill, workers work, and now and then something gets broken. */
export function stepGrounds(state: GameState, log: LogEntry[]): void {
  const tick = state.clock.tick;
  if (tick % GROUNDS_EVAL_TICKS !== 0 || tick < state.grounds.quietUntilTick) return;
  const g = state.grounds;
  const map = state.map;
  const spots: Placed[] = [];
  const yards: Placed[] = [];
  for (const placed of map.placed) {
    if (!placed) continue;
    if (isMessSpot(placed)) spots.push(placed);
    else if (placed.type === 'yard') yards.push(placed);
  }

  // 1. Litter falls. Bins beside the spot catch most of it until they are full.
  for (const spot of spots) {
    const lying = g.litter[spot.id] ?? 0;
    const drop = dropOf(state, spot) * (1 + (DIRT_INVITES * lying) / LITTER_CEILING);
    if (drop <= 0) continue;
    const beside = map.care.bins[spot.id];
    let open = 0;
    if (beside) for (const id of beside) if (!((g.broken[id] ?? 0) > 0) && (g.bins[id] ?? 0) < BIN_CAPACITY) open += 1;
    let ground = drop;
    if (open > 0) {
      const each = (drop * BIN_CATCH) / open;
      ground = drop * (1 - BIN_CATCH);
      for (const id of beside!) {
        if ((g.broken[id] ?? 0) > 0 || (g.bins[id] ?? 0) >= BIN_CAPACITY) continue;
        const before = g.bins[id] ?? 0;
        const after = Math.min(BIN_CAPACITY, before + each);
        g.bins[id] = after;
        if (before < BIN_CAPACITY && after >= BIN_CAPACITY) {
          g.overflowed += 1;
          log.push({ tick, kind: 'grounds', text: `A trash bin by the ${nameOf(spot)} is full.`, data: { event: 'full', spot: spot.id } });
        }
      }
    }
    g.litter[spot.id] = Math.min(LITTER_CEILING, lying + ground);
  }

  // 2. Workers: the fullest bins first, then the dirtiest spot, then what is broken.
  // What each yard has to do is sorted out once, with plain loops: this runs on every beat of catch-up.
  const binsOf = new Map<number, number[]>();
  for (const key in g.bins) {
    const id = Number(key);
    if (!map.placed[id] || g.bins[id]! <= 0) continue;
    const yardId = map.care.yard[id] ?? -1;
    if (yardId < 0) continue;
    const list = binsOf.get(yardId);
    if (list) list.push(id);
    else binsOf.set(yardId, [id]);
  }
  const spotsOf = new Map<number, Placed[]>();
  for (const spot of spots) {
    if ((g.litter[spot.id] ?? 0) <= 0) continue;
    const yardId = map.care.yard[spot.id] ?? -1;
    if (yardId < 0) continue;
    const list = spotsOf.get(yardId);
    if (list) list.push(spot);
    else spotsOf.set(yardId, [spot]);
  }
  const brokenOf = new Map<number, number[]>();
  for (const key in g.broken) {
    const id = Number(key);
    if (!map.placed[id]) {
      delete g.broken[id];
      continue;
    }
    const yardId = map.care.yard[id] ?? -1;
    if (yardId < 0) continue;
    const list = brokenOf.get(yardId);
    if (list) list.push(id);
    else brokenOf.set(yardId, [id]);
  }
  /** Broken lamps under each yard, worked out the first time a yard has hands free for them. */
  let lampsOf: Map<number, number[]> | null = null;

  for (const yard of yards) {
    let work = workersAt(state, yard.id) * WORK_PER_WORKER;
    if (work <= 0) continue;
    const myBins = binsOf.get(yard.id);
    if (myBins) {
      myBins.sort((x, y) => g.bins[y]! - g.bins[x]! || x - y);
      for (const id of myBins) {
        if (work <= 0 || g.bins[id]! <= BIN_CAPACITY / 2) break;
        const used = Math.min(work, g.bins[id]! / BIN_PER_WORK);
        g.bins[id] = Math.max(0, g.bins[id]! - used * BIN_PER_WORK);
        work -= used;
      }
    }
    const mySpots = spotsOf.get(yard.id);
    if (mySpots && work > 0) {
      mySpots.sort((x, y) => g.litter[y.id]! - g.litter[x.id]! || x.id - y.id);
      for (const spot of mySpots) {
        if (work <= 0) break;
        const swept = Math.min(work, g.litter[spot.id]!);
        g.litter[spot.id] = g.litter[spot.id]! - swept;
        work -= swept;
      }
    }
    // Broken things in the circle, and broken lamps under it.
    const myBroken = brokenOf.get(yard.id);
    if (myBroken) {
      for (const id of myBroken) {
        if (work <= 0) break;
        const used = Math.min(work, g.broken[id]!);
        work -= used;
        const left = g.broken[id]! - used;
        if (left <= 1e-9) {
          delete g.broken[id];
          g.repaired += 1;
          log.push({ tick, kind: 'grounds', text: `A worker fixed a ${nameOf(map.placed[id]!).toLowerCase()}.`, data: { event: 'fixed', thing: map.placed[id]!.type } });
        } else g.broken[id] = left;
      }
    }
    if (work > 0 && lampsOf === null) {
      lampsOf = new Map();
      for (const key in g.lamps) {
        const cell = Number(key);
        const x = cell % map.width;
        const over = yardOver(map, x, (cell - x) / map.width);
        if (!over) continue;
        const list = lampsOf.get(over.id);
        if (list) list.push(cell);
        else lampsOf.set(over.id, [cell]);
      }
    }
    const myLamps = lampsOf?.get(yard.id);
    if (myLamps) {
      for (const cell of myLamps) {
        if (work <= 0) break;
        const used = Math.min(work, g.lamps[cell]!);
        work -= used;
        const left = g.lamps[cell]! - used;
        if (left <= 1e-9) {
          delete g.lamps[cell];
          g.repaired += 1;
          log.push({ tick, kind: 'grounds', text: 'A worker fixed a street lamp.', data: { event: 'fixed', thing: 'lamp' } });
        } else g.lamps[cell] = left;
      }
    }
    // Hands still free: the bins that were not yet half full.
    if (myBins) {
      for (const id of myBins) {
        if (work <= 0) break;
        if (g.bins[id]! <= 0) continue;
        const used = Math.min(work, g.bins[id]! / BIN_PER_WORK);
        g.bins[id] = Math.max(0, g.bins[id]! - used * BIN_PER_WORK);
        work -= used;
      }
    }
  }

  // 3. Where litter is deep, something nearby may get broken: at most one thing a day at each spot.
  for (const spot of spots) {
    if ((g.litter[spot.id] ?? 0) <= BREAK_AT) continue;
    if (tick - (g.lastBreak[spot.id] ?? -BREAK_EVERY_TICKS) < BREAK_EVERY_TICKS) continue;
    // Two draws at every check for every spot this dirty, whatever comes of them, so the stream never depends on the outcome.
    const roll = nextFloat(state.rng, 'events');
    const pick = nextFloat(state.rng, 'events');
    // The most the chance can ever be is checked first, so the search for a Campus Safety circle is rarely made.
    if (roll >= BREAK_RATE * 1.5 || roll >= breakChance(state, spot)) continue;
    const things: Array<{ placed: Placed } | { lamp: number }> = [];
    for (const placed of map.placed) {
      if (!placed || isBroken(state, placed.id)) continue;
      if ((placed.type === 'bin' || placed.type === 'bench' || placed.type === 'table') && gapBetween(spot, placed) <= BREAK_REACH) things.push({ placed });
    }
    for (let y = Math.max(0, spot.y - BREAK_REACH); y <= Math.min(map.height - 1, spot.y + spot.h - 1 + BREAK_REACH); y++) {
      for (let x = Math.max(0, spot.x - BREAK_REACH); x <= Math.min(map.width - 1, spot.x + spot.w - 1 + BREAK_REACH); x++) {
        const cell = y * map.width + x;
        if (lampAt(map, x, y) && !((g.lamps[cell] ?? 0) > 0)) things.push({ lamp: cell });
      }
    }
    if (things.length === 0) continue;
    const thing = things[Math.min(things.length - 1, Math.floor(pick * things.length))]!;
    g.lastBreak[spot.id] = tick;
    const kind = 'lamp' in thing ? 'lamp' : (thing.placed.type as 'bin' | 'bench' | 'table');
    if ('lamp' in thing) g.lamps[thing.lamp] = FIX_WORK;
    else g.broken[thing.placed.id] = FIX_WORK;
    const lines = BREAK_LINES[kind];
    log.push({ tick, kind: 'grounds', text: lines[Math.floor(pick * 97) % lines.length]!, data: { event: 'broken', thing: kind, spot: spot.id } });
  }
}

/**
 * The chance, at one check, that something near a filthy spot gets broken:
 * higher where students were unhappy last semester, and a quarter as high
 * inside a Campus Safety circle.
 */
export function breakChance(state: GameState, spot: Placed): number {
  const mood = state.admissions.lastSemester?.happiness ?? 60;
  const safe = state.map.placed.some((placed) => placed && PLACED[placed.type].family === 'safety' && gapBetween(placed, spot) <= PLACED[placed.type].radius);
  return BREAK_RATE * (0.5 + (100 - mood) / 100) * (safe ? BREAK_SAFETY_SHARE : 1);
}

// ------------------------------------------------------------ what it costs --

/** How clean a spot is, from 0 to 1. A spot at its ceiling of litter is about 30% clean. */
export function spotClean(state: GameState, spot: Placed): number {
  return 1 - (DIRT_AT_CEILING * (state.grounds.litter[spot.id] ?? 0)) / LITTER_CEILING;
}

/** True where a staffed yard's workers sweep the paths. */
function swept(state: GameState, x: number, y: number): boolean {
  const yard = yardOver(state.map, x, y);
  return !!yard && workersAt(state, yard.id) > 0;
}

/**
 * How clean it is where a lot's students spend their time, from 0 to 1: as
 * clean as the dirtiest place to eat, shop or play that reaches the lot, and
 * never above 85% where nobody sweeps the paths.
 */
export function cleanAt(state: GameState, x: number, y: number): number {
  let clean = swept(state, x, y) ? 1 : 1 - PATH_DIRT;
  for (const placed of state.map.placed) {
    if (!placed || !isMessSpot(placed) || gapTo(placed, x, y) > messReach(placed)) continue;
    clean = Math.min(clean, spotClean(state, placed));
  }
  return clean;
}

/** Somewhere to sit within a few cells, from 0 to 1. A quad's own benches count. A broken bench seats nobody. */
export function seatingAt(state: GameState, x: number, y: number): number {
  const map = state.map;
  let units = 0;
  for (let cy = Math.max(0, y - SEAT_REACH); cy <= Math.min(map.height - 1, y + SEAT_REACH); cy++) {
    for (let cx = Math.max(0, x - SEAT_REACH); cx <= Math.min(map.width - 1, x + SEAT_REACH); cx++) {
      const cell = map.cells[cy * map.width + cx]!;
      if (cell.kind === 'quad') units += SEAT_UNITS.quad;
      else if (cell.kind === 'placed' && cell.placedId !== null) {
        const placed = map.placed[cell.placedId];
        if (!placed || isBroken(state, placed.id)) continue;
        if (placed.type === 'bench') units += SEAT_UNITS.bench;
        else if (placed.type === 'table') units += SEAT_UNITS.table;
      }
      if (units >= SEATS_PLENTY) return 1;
    }
  }
  return Math.min(1, units / SEATS_PLENTY);
}

/** Picnic tables that count toward social life: unbroken, with a dining building or an Academic lot within a few cells. */
export function socialTables(state: GameState): number {
  const map = state.map;
  let count = 0;
  for (const placed of map.placed) {
    if (!placed || placed.type !== 'table' || isBroken(state, placed.id)) continue;
    let near = map.placed.some((other) => other && PLACED[other.type].family === 'dining' && gapBetween(other, placed) <= SEAT_REACH);
    for (let y = Math.max(0, placed.y - SEAT_REACH); y <= Math.min(map.height - 1, placed.y + SEAT_REACH) && !near; y++) {
      for (let x = Math.max(0, placed.x - SEAT_REACH); x <= Math.min(map.width - 1, placed.x + SEAT_REACH) && !near; x++) {
        const cell = map.cells[y * map.width + x]!;
        if (cell.kind === 'lot' && cell.zone === 'academic') near = true;
      }
    }
    if (near) count += 1;
  }
  return count;
}

// ------------------------------------------------------------- what to say --

/** A yard is keeping up when the mess already in its circle would be gone in this many checks: about a day. */
const CLEAR_WITHIN_CHECKS = (24 * 60) / GROUNDS_EVAL_TICKS;

export type GroundsFix = 'noBin' | 'binFull' | 'noYard' | 'noWorkers' | 'understaffed' | 'quiet' | null;

export interface YardStatus {
  workers: number;
  max: number;
  /** Work its circle asks for at each check, and what its workers can do. */
  need: number;
  supply: number;
  /** Workers to hire for it to keep up. 0 when it does. It may be more than the yard can hold. */
  hire: number;
  wagesPerYear: number;
}

/** Work a spot asks of its yard at each check, when it is kept clean: what misses the bins, and emptying them. */
function upkeepOf(state: GameState, spot: Placed): number {
  const drop = dropOf(state, spot);
  const bins = (state.map.care.bins[spot.id] ?? []).filter((id) => !isBroken(state, id));
  return bins.length > 0 ? drop * (1 - BIN_CATCH) + (drop * BIN_CATCH) / BIN_PER_WORK : drop;
}

export function yardStatus(state: GameState, yard: Placed): YardStatus {
  const workers = workersAt(state, yard.id);
  // What its places ask for at each check, as they are now: a dirty place draws more litter, and what is
  // already lying there, or broken, has to be cleared within about a day for the yard to count as keeping up.
  let need = 0;
  for (const placed of state.map.placed) {
    if (!placed || state.map.care.yard[placed.id] !== yard.id) continue;
    if (isMessSpot(placed)) {
      const lying = state.grounds.litter[placed.id] ?? 0;
      need += upkeepOf(state, placed) * (1 + (DIRT_INVITES * lying) / LITTER_CEILING) + lying / CLEAR_WITHIN_CHECKS;
    }
    need += (state.grounds.broken[placed.id] ?? 0) / CLEAR_WITHIN_CHECKS;
  }
  const supply = workers * WORK_PER_WORKER;
  const hire = need > supply + 1e-9 ? Math.ceil((need - supply) / WORK_PER_WORKER - 1e-9) : 0;
  return { workers, max: YARD_MAX_WORKERS, need, supply, hire, wagesPerYear: workers * WAGE_PER_YEAR };
}

/** One line on a yard: keeping up, or how many more to hire. */
export function yardLine(status: YardStatus): string {
  if (status.workers === 0) return status.need > 0 ? `Nobody works here. Hire ${Math.min(status.max, Math.max(1, status.hire))} to start.` : 'Nobody works here.';
  if (status.hire === 0) return 'Keeping up.';
  const room = status.max - status.workers;
  if (room <= 0) return 'Understaffed, and full. Build another yard near the busiest places.';
  return status.hire <= room ? `Understaffed: hire ${status.hire} more.` : `Understaffed: hire ${room} more, and build another yard.`;
}

/** The one fix a mess spot needs, or null when it is looked after. */
export function spotFix(state: GameState, spot: Placed): GroundsFix {
  // A broken bin is still a bin: what it needs is a worker, not a second bin beside it.
  const bins = state.map.care.bins[spot.id] ?? [];
  const yardId = state.map.care.yard[spot.id] ?? -1;
  const yard = yardId >= 0 ? state.map.placed[yardId] : null;
  if (bins.length === 0) return 'noBin';
  if (!yard) return 'noYard';
  if (workersAt(state, yard.id) === 0) return 'noWorkers';
  if (yardStatus(state, yard).hire > 0) return 'understaffed';
  return null;
}

const FIX_TEXT: Record<Exclude<GroundsFix, null | 'understaffed' | 'quiet'>, string> = {
  noBin: 'No bin within reach. Put a Trash bin beside it.',
  binFull: 'Its bin is full. A worker has to empty it.',
  noYard: 'Outside worker coverage. Build a Facilities Yard within eight cells.',
  noWorkers: 'Its Facilities Yard has no workers. Hire one.',
};

/** A fix in words. A yard that is short of workers says how many. */
export function fixText(state: GameState, placed: Placed, fix: GroundsFix): string {
  if (fix === null || fix === 'quiet') return '';
  if (fix !== 'understaffed') return FIX_TEXT[fix];
  const yardId = state.map.care.yard[placed.id] ?? -1;
  const yard = yardId >= 0 ? state.map.placed[yardId] : null;
  return yard ? `Yard ${yardLine(yardStatus(state, yard)).replace(/^U/, 'u')}` : FIX_TEXT.noYard;
}

/** What a bin, bench or table needs. A full bin needs emptying. A broken thing needs a worker in range. */
export function thingFix(state: GameState, placed: Placed): GroundsFix {
  const yardId = state.map.care.yard[placed.id] ?? -1;
  const yard = yardId >= 0 ? state.map.placed[yardId] : null;
  const needsWork = isBroken(state, placed.id) || (placed.type === 'bin' && (state.grounds.bins[placed.id] ?? 0) >= BIN_CAPACITY - 1e-9);
  if (!needsWork) return null;
  if (!yard) return 'noYard';
  if (workersAt(state, yard.id) === 0) return 'noWorkers';
  if (yardStatus(state, yard).hire > 0) return 'understaffed';
  return placed.type === 'bin' && !isBroken(state, placed.id) ? 'binFull' : null;
}

/** How a bin stands: empty, part full, full, or broken. For the picture and the panel. */
export function binState(state: GameState, id: number): 'broken' | 'full' | 'filling' | 'empty' {
  if (isBroken(state, id)) return 'broken';
  const fill = state.grounds.bins[id] ?? 0;
  return fill >= BIN_CAPACITY - 1e-9 ? 'full' : fill > BIN_CAPACITY * 0.6 ? 'filling' : 'empty';
}

export function isBrokenThing(state: GameState, id: number): boolean {
  return isBroken(state, id);
}

/** The average cleanliness of every place students eat, shop and play, from 0 to 1. 1 when there are none. */
export function campusClean(state: GameState): number {
  let sum = 0;
  let n = 0;
  for (const placed of state.map.placed) {
    if (!placed || !isMessSpot(placed)) continue;
    sum += spotClean(state, placed);
    n += 1;
  }
  return n === 0 ? 1 : sum / n;
}

/** The dirtiest mess spot, or null when every one is spotless. */
export function messiestSpot(state: GameState): Placed | null {
  let worst: Placed | null = null;
  let most = 0;
  for (const placed of state.map.placed) {
    if (!placed || !isMessSpot(placed)) continue;
    const lying = state.grounds.litter[placed.id] ?? 0;
    if (lying > most + 1e-9) {
      most = lying;
      worst = placed;
    }
  }
  return worst;
}

/**
 * Grounds in the away list: the messiest spot and its fix, how many bins
 * filled up, and what was repaired. '' when there is nothing worth saying.
 */
export function groundsLine(state: GameState, log: readonly LogEntry[]): string {
  let full = 0;
  let fixed = 0;
  let broken = 0;
  for (const entry of log) {
    if (entry.kind !== 'grounds') continue;
    if (entry.data?.event === 'full') full += 1;
    else if (entry.data?.event === 'fixed') fixed += 1;
    else if (entry.data?.event === 'broken') broken += 1;
  }
  const parts: string[] = [];
  const worst = messiestSpot(state);
  if (worst && spotClean(state, worst) < 0.75) {
    const fix = fixText(state, worst, spotFix(state, worst));
    parts.push(`The ${nameOf(worst)} is the messiest spot, ${Math.round(spotClean(state, worst) * 100)}% clean.${fix ? ` ${fix}` : ''}`);
  }
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  if (full > 0) parts.push(`${plural(full, 'bin', 'bins')} filled up.`);
  if (broken > 0) parts.push(`${plural(broken, 'thing was', 'things were')} broken.`);
  if (fixed > 0) parts.push(`Workers made ${plural(fixed, 'repair', 'repairs')}.`);
  return parts.join(' ');
}
