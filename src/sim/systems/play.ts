import { scaleOf } from '../scale';
import { PASTIMES, PASTIME_ODDS, PASTIME_OF, UNION_USE, type Pastime } from '../config/amenities';
import { CROWD_WORST_AT, PLACED, placedRoom, PLAY_SHARE, WAIT_MINUTES_AT_WORST } from '../config/placed';
import { PART_WEIGHTS } from '../config/students';
import { hashInts } from '../rng';
import { enrollment } from '../selectors';
import type { GameState, MapState, Placed } from '../types';
import { unionOpen } from './bigBuilds';
import { identityOf, INTEREST, TRAIT, traitOf } from './identity';
import { drawWeight, ofFamily } from './placed';
import type { StudentRef } from './students';
import { movedAway, natureOf } from './students';

/**
 * Places to play serve the students who use them, wherever they live (the owner, 2026-11-17: "It's whether the student
 * actually uses these facilities or not"; DESIGN.md 83.2).
 *
 * Each student does some things for fun, or none (`habitsOf`): works out, swims, runs laps, plays basketball, field
 * games, volleyball or tennis, makes things; and some meet friends at the Student Union once it is open. Each of those
 * needs its kind of place (`PASTIME_OF`). A student gets the lift of each thing they do that the campus has, with room
 * for them at the busiest hour: its place's own lift (a gym 0.6, a pool 0.5, a court 0.4), up to all of it; one they
 * do and the campus lacks, or cannot fit them in, is a lift they miss. A student who does none of it is neither helped
 * nor hurt by it.
 *
 * The campus reads the same in shares: who does what, how many of each want in at the busiest hour, and how much of it
 * the campus has room for. Who goes to which building (`map.care.play`, the nearer the more) decides only where the
 * lines form on the map, what a followed student walks to and where the Capacity page's fix points; never who is lifted.
 *
 * The numbers are for the busiest hour of the day, never for the hour it is now (DESIGN.md 28.1). Nothing is stored but
 * the geometry, which changes only when the player builds.
 */

const unit = (seed: number, ref: StudentRef, salt: number): number => ((hashInts(seed, 9600, ref.entryYear, ref.index, salt) >>> 0) + 0.5) / 4294967297;

/** What a student does for fun, and whether they meet friends at the Union: from who they are, the same all their years. */
export interface PlayHabits {
  activities: Pastime[];
  union: boolean;
}

const LEAN = { fitness: INTEREST.fitness, sports: INTEREST.sports, art: INTEREST.art } as const;

/** What a student does for fun (83.2): from their interests, which their nature leans (an athlete is into fitness and sports). */
export function habitsOf(seed: number, ref: StudentRef, nature: string): PlayHabits {
  const bits = identityOf(seed, ref, nature);
  const interests = bits >>> 18;
  const activities: Pastime[] = [];
  PASTIMES.forEach((activity, n) => {
    const odds = PASTIME_ODDS[activity];
    const leans = ((interests >>> LEAN[odds.lean]) & 1) === 1;
    if (unit(seed, ref, 10 + n) < (leans ? odds.with : odds.without)) activities.push(activity);
  });
  const outgoing = traitOf(bits, TRAIT.outgoing) >= 2;
  return { activities, union: unit(seed, ref, 9) < (outgoing ? UNION_USE.outgoing : UNION_USE.other) };
}

/** How far a recreation building draws its players from: wider than its own size at a full court or a pitch. */
export function drawsFrom(placed: Placed): number {
  const spec = PLACED[placed.type];
  return spec.draws ?? spec.radius;
}

/** How many students a recreation building holds at once. 0 for anything else. */
export function playCapacity(placed: Placed, scale = 1): number {
  return PLACED[placed.type].family === 'recreation' ? placedRoom(placed.type, scale) : 0;
}

/** The activity a place to play is for. */
export function pastimeOf(placed: Placed): Pastime | null {
  return PASTIME_OF[placed.type] ?? null;
}

/**
 * Share every lot's students out among the recreation buildings of each kind (DESIGN.md 83.5): in proportion to what
 * each holds, the nearer the more, and none of them out of reach. The result, for each building, is how many lots'
 * worth of students come to it first, among those of its kind. Called after every action, with the rest of `care`.
 */
export function playLoads(map: MapState, recreation: readonly Placed[]): Record<number, number> {
  const load: Record<number, number> = {};
  for (const placed of recreation) load[placed.id] = 0;
  const scale = scaleOf(map);
  const { width, height, cells } = map;
  for (const activity of PASTIMES) {
    const places = recreation.filter((placed) => PASTIME_OF[placed.type] === activity);
    if (places.length === 0) continue;
    const weights = new Array<number>(places.length).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y * width + x]!.kind !== 'lot') continue;
        let sum = 0;
        for (let i = 0; i < places.length; i++) {
          const placed = places[i]!;
          const w = playCapacity(placed, scale) * drawWeight(placed, x, y, drawsFrom(placed));
          weights[i] = w;
          sum += w;
        }
        if (sum <= 0) continue;
        for (let i = 0; i < places.length; i++) load[places[i]!.id]! += weights[i]! / sum;
      }
    }
  }
  return load;
}

/**
 * Who each building has at the busiest hour, from who comes to it first (DESIGN.md 83.5). Those who find it full go on
 * to one with room; when every one is full the rest wait where they came first, so the lines form at the buildings
 * most students reach first. `base` and `cap` are by building, in the same order.
 */
export function spillOver(base: readonly number[], cap: readonly number[]): number[] {
  let want = 0;
  let have = 0;
  for (let i = 0; i < base.length; i++) {
    want += base[i]!;
    have += cap[i]!;
  }
  if (have <= 0) return [...base];
  if (want > have) {
    // Every place is full. What is left over waits where it came first, in proportion to how far over each was.
    let over = 0;
    for (let i = 0; i < base.length; i++) over += Math.max(0, base[i]! - cap[i]!);
    return base.map((one, i) => cap[i]! + (over > 0 ? ((want - have) * Math.max(0, one - cap[i]!)) / over : 0));
  }
  let over = 0;
  let room = 0;
  for (let i = 0; i < base.length; i++) {
    over += Math.max(0, base[i]! - cap[i]!);
    room += Math.max(0, cap[i]! - base[i]!);
  }
  return base.map((one, i) => (one >= cap[i]! ? cap[i]! : one + (room > 0 ? (over * (cap[i]! - one)) / room : 0)));
}

/** The share of who wants in at the busiest hour that the places can take: all of them with room, fewer when full. */
export function servedShare(capacity: number, demand: number): number {
  if (capacity <= 0) return 0;
  return demand <= capacity ? 1 : capacity / demand;
}

/** Students sampled for the campus's shares: the same game's students, by the same rules as their cards. */
const SAMPLE = 1600;
let sampled: { seed: number; habits: PlayHabits[] } | null = null;

function sampleHabits(seed: number): PlayHabits[] {
  if (sampled && sampled.seed === seed) return sampled.habits;
  const habits: PlayHabits[] = [];
  for (let k = 0; k < SAMPLE; k++) {
    const ref = { entryYear: k % 8, index: 100_000 + k };
    habits.push(habitsOf(seed, ref, natureOf(seed, ref, movedAway(seed, ref))));
  }
  sampled = { seed, habits };
  return habits;
}

export interface PastimeRoom {
  /** True when the campus has a place for it. */
  has: boolean;
  /** The share of all students who do it. */
  share: number;
  /** Students its places hold at once, and who want in at the busiest hour. */
  capacity: number;
  demand: number;
  /** The share of those who want in that get in: 0 with nowhere to do it. */
  served: number;
  /** What it lifts a student who does it by: the lift of the best place of its kind the campus has, 0 with none. */
  lift: number;
}

export interface CampusPlay {
  rooms: Record<Pastime, PastimeRoom>;
  /** True when the Student Union is open. */
  union: boolean;
  /** The share of students who do something for fun, or meet at the open Union. */
  users: number;
  /** Their recreation, on average: the lift of what they do that the campus has, with room for them. */
  level: number;
  /** The share of students who do something the campus has no place for. */
  lacking: number;
  /** Each sampled student's recreation, null for one who does nothing for fun: what the campus's Food & fun averages. */
  levels: Array<number | null>;
  /** All the places hold at once, and who wants in at the busiest hour for what the campus has. */
  capacity: number;
  demand: number;
  /** Who each building has at the busiest hour, by its id, and who came to it first. */
  demands: Map<number, number>;
  firsts: Map<number, number>;
}

let memo: { map: MapState; care: unknown; students: number; scale: number; placed: number; union: boolean; seed: number; value: CampusPlay } | null = null;

/** What the campus offers its students to do, in shares (DESIGN.md 83.2). Worked out once for a map, its enrollment and the Union. */
export function campusPlay(state: GameState): CampusPlay {
  const map = state.map;
  const students = enrollment(state);
  const scale = scaleOf(state);
  const union = unionOpen(map);
  const seed = state.seed;
  if (memo && memo.map === map && memo.care === map.care && memo.students === students && memo.scale === scale && memo.placed === map.placed.length && memo.union === union && memo.seed === seed) return memo.value;
  const habits = sampleHabits(seed);
  const places = ofFamily(map, 'recreation');
  // Who does what: the share of students, and so the share of the busiest hour's players, for each.
  const share = {} as Record<Pastime, number>;
  for (const activity of PASTIMES) share[activity] = habits.filter((one) => one.activities.includes(activity)).length / habits.length;
  const rooms = {} as Record<Pastime, PastimeRoom>;
  let capacity = 0;
  let demand = 0;
  for (const activity of PASTIMES) {
    const mine = places.filter((placed) => PASTIME_OF[placed.type] === activity);
    const cap = mine.reduce((sum, placed) => sum + playCapacity(placed, scale), 0);
    const want = students * share[activity] * PLAY_SHARE;
    const lift = mine.reduce((best, placed) => Math.max(best, PLACED[placed.type].strength), 0);
    rooms[activity] = { has: mine.length > 0, share: share[activity], capacity: cap, demand: want, served: mine.length > 0 ? servedShare(cap, want) : 0, lift };
    if (mine.length > 0) {
      capacity += cap;
      demand += want;
    }
  }
  // Each sampled student's recreation: the lift of each thing they do that they can, and the Union's for those who meet
  // there, up to all of it.
  let users = 0;
  let sum = 0;
  let lacking = 0;
  const levels: Array<number | null> = [];
  for (const one of habits) {
    if (one.activities.some((activity) => !rooms[activity].has)) lacking += 1;
    const meets = union && one.union ? 1 : 0;
    const count = one.activities.length + meets;
    if (count === 0) {
      levels.push(null);
      continue;
    }
    users += 1;
    let got = meets * PLACED.studentUnion.strength;
    for (const activity of one.activities) got += rooms[activity].served * rooms[activity].lift;
    levels.push(Math.min(1, got));
    sum += Math.min(1, got);
  }
  // Who comes to each building first, among those of its kind, and where those who find it full go on to.
  const care = map.care;
  const firsts = new Map<number, number>();
  const demands = new Map<number, number>();
  for (const activity of PASTIMES) {
    const mine = places.filter((placed) => PASTIME_OF[placed.type] === activity);
    if (mine.length === 0) continue;
    const loads = mine.map((placed) => care?.play?.[placed.id] ?? 0);
    const total = loads.reduce((a, b) => a + b, 0);
    const bases = mine.map((_, i) => (total > 0 ? (rooms[activity].demand * loads[i]!) / total : rooms[activity].demand / mine.length));
    const spilled = spillOver(bases, mine.map((placed) => playCapacity(placed, scale)));
    mine.forEach((placed, i) => {
      firsts.set(placed.id, bases[i]!);
      demands.set(placed.id, spilled[i]!);
    });
  }
  const value: CampusPlay = { rooms, union, users: users / habits.length, level: users > 0 ? sum / users : 1, lacking: lacking / habits.length, levels, capacity, demand, demands, firsts };
  memo = { map, care: map.care, students, scale, placed: map.placed.length, union, seed, value };
  return value;
}

/**
 * The campus's recreation as its halls read it (DESIGN.md 83.2): what its students who do something for fun get of it,
 * and for those who do nothing, their food, so their Food & fun is their food alone.
 */
export function campusRecreation(state: GameState, dining: number): number {
  const campus = campusPlay(state);
  return campus.users * campus.level + (1 - campus.users) * dining;
}

let lifeMemo: { campus: CampusPlay; dining: number; bonus: number; value: number } | null = null;

/**
 * The campus's Food & fun as the average of every student's own, each held at full as their card holds it (DESIGN.md
 * 83.2): those who do something for fun with the share of it they can do, those who do nothing with their food alone,
 * and `bonus`, what variety adds, on each. A student who misses something costs the campus what it costs them.
 */
export function campusLife(state: GameState, dining: number, bonus: number): number {
  const campus = campusPlay(state);
  if (lifeMemo && lifeMemo.campus === campus && lifeMemo.dining === dining && lifeMemo.bonus === bonus) return lifeMemo.value;
  const wd = PART_WEIGHTS.dining;
  const wr = PART_WEIGHTS.recreation;
  let life = 0;
  for (const level of campus.levels) life += Math.min(1, (level === null ? dining : (wd * dining + wr * level) / (wd + wr)) + bonus);
  const value = life / Math.max(1, campus.levels.length);
  lifeMemo = { campus, dining, bonus, value };
  return value;
}

export interface StudentPlay {
  /** What they do that the campus has and has room for them; has but was full when they came; lacks. */
  got: Pastime[];
  full: Pastime[];
  missing: Pastime[];
  /** True when they meet friends at the open Union. */
  union: boolean;
  /** Their recreation, 0 to 1: the lift of each thing they do that they can, up to all of it. null when they do nothing for fun. */
  level: number | null;
}

/** One student's recreation (83.2): which of the things they do the campus lets them, by its room and their own luck. */
export function playOf(state: GameState, ref: StudentRef, habits: PlayHabits): StudentPlay {
  const campus = campusPlay(state);
  const got: Pastime[] = [];
  const full: Pastime[] = [];
  const missing: Pastime[] = [];
  for (const activity of habits.activities) {
    const room = campus.rooms[activity];
    if (!room.has) missing.push(activity);
    else if (room.served >= 1 || unit(state.seed, ref, 30 + PASTIMES.indexOf(activity)) < room.served) got.push(activity);
    else full.push(activity);
  }
  const union = campus.union && habits.union;
  const count = habits.activities.length + (union ? 1 : 0);
  const lift = got.reduce((sum, activity) => sum + campus.rooms[activity].lift, 0) + (union ? PLACED.studentUnion.strength : 0);
  return { got, full, missing, union, level: count > 0 ? Math.min(1, lift) : null };
}

export interface PlayUse {
  /** Students it holds at once. */
  capacity: number;
  /** Students here at the busiest hour, those who came first and those who went on from a full one. */
  demand: number;
  /** Playing at the busiest hour: demand, as far as there is room. */
  playing: number;
  /** Turned away at the busiest hour: only when every place of its kind is full. */
  waiting: number;
  /** Demand over capacity. */
  ratio: number;
  /** The share of those who want in for its kind that get in: the same for every building of the kind. */
  served: number;
}

/** How busy a recreation building is at the busiest hour. null for anything else. */
export function playUse(state: GameState, placed: Placed): PlayUse | null {
  const capacity = playCapacity(placed, scaleOf(state));
  if (capacity <= 0) return null;
  const campus = campusPlay(state);
  const activity = PASTIME_OF[placed.type];
  const demand = campus.demands.get(placed.id) ?? 0;
  const ratio = demand / capacity;
  const playing = Math.min(capacity, Math.round(demand));
  return { capacity, demand, playing, waiting: Math.max(0, Math.round(demand) - capacity), ratio, served: activity ? campus.rooms[activity].served : 1 };
}

/** Minutes a student waits at a crowded place at the busiest hour, to the nearest five. 0 when nobody waits. */
export function waitMinutes(use: { waiting: number; ratio: number }): number {
  if (use.waiting <= 0) return 0;
  const over = Math.min(1, (use.ratio - 1) / (CROWD_WORST_AT - 1));
  return Math.max(5, Math.round((WAIT_MINUTES_AT_WORST * over) / 5) * 5);
}

/**
 * Which of a family's places a student at a spot goes to (DESIGN.md 83.5), from their own `luck` (0 to 1). First the
 * one they come to first, as a lot's students share the places out (`share`, the nearer the more); when that one is full
 * of those who came first, a share of them go on to one with room, as the campus's lines are worked out (`spillOver`).
 * When every place is full, they wait at the one they came to first.
 */
export function choosePlace(
  places: readonly Placed[],
  x: number,
  y: number,
  luck: number,
  share: (placed: Placed, x: number, y: number) => number,
  room: (placed: Placed) => number,
  firsts: ReadonlyMap<number, number>,
  short: boolean,
): Placed | null {
  if (places.length === 0) return null;
  const weights = places.map((placed) => share(placed, x, y));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return places[0]!;
  let at = Math.min(0.999999, Math.max(0, luck)) * total;
  let chosen = places.length - 1;
  for (let i = 0; i < places.length; i++) {
    if (at < weights[i]!) {
      chosen = i;
      break;
    }
    at -= weights[i]!;
  }
  const placed = places[chosen]!;
  if (short) return placed;
  // Their own luck again, inside the share they fell in: who of those who came first is let in.
  const again = weights[chosen]! > 0 ? at / weights[chosen]! : 0;
  const first = firsts.get(placed.id) ?? 0;
  const admits = first <= room(placed) ? 1 : room(placed) / first;
  if (again < admits) return placed;
  // Turned away: on to a place with room, in proportion to the room each has to spare.
  let spare = 0;
  for (const other of places) spare += Math.max(0, room(other) - (firsts.get(other.id) ?? 0));
  if (spare <= 0) return placed;
  let left = ((again - admits) / Math.max(1e-9, 1 - admits)) * spare;
  for (const other of places) {
    const free = Math.max(0, room(other) - (firsts.get(other.id) ?? 0));
    if (left < free) return other;
    left -= free;
  }
  return placed;
}

/**
 * The place a student at a spot goes to for an activity (DESIGN.md 83.5), from their own `luck` (0 to 1): most often
 * the nearest, and another with room when the one they came to first is full. null when the campus has none.
 */
export function playPlaceFor(state: GameState, x: number, y: number, luck: number, activity: Pastime): Placed | null {
  const scale = scaleOf(state);
  const campus = campusPlay(state);
  const places = ofFamily(state.map, 'recreation').filter((placed) => PASTIME_OF[placed.type] === activity);
  const share = (placed: Placed, px: number, py: number): number => playCapacity(placed, scale) * drawWeight(placed, px, py, drawsFrom(placed));
  return choosePlace(places, x, y, luck, share, (placed) => playCapacity(placed, scale), campus.firsts, campus.rooms[activity].served < 1);
}

/** One line for a recreation building's card: how full at the busiest hour, who is turned away, and what would help. */
export function playLine(use: PlayUse): string {
  const playing = Math.round(Math.min(use.demand, use.capacity));
  if (use.waiting > 0) {
    const advice = use.ratio >= 1.25 ? ' Every place of its kind is full: another anywhere on campus lets them in.' : '';
    return `Full, ${use.waiting} turned away at peak.${advice}`;
  }
  if (playing >= use.capacity) return 'Full at peak, and nobody turned away.';
  if (playing >= use.capacity * 0.6) return `Busy: ${playing} of ${use.capacity} playing at peak.`;
  return playing > 0 ? `Room to spare: ${playing} of ${use.capacity} playing at peak.` : `Nobody playing here yet. It holds ${use.capacity}.`;
}
