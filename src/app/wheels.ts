import type { DayPeriod } from './daylight';
import type { Weather } from './life';
import { CAUSE_TOPICS, POST, TONE } from '../sim/config/quadline';
import { WEB_WEEK_TICKS } from '../sim/config/web';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../sim/config/time';
import { hashInts, type GameState, type StudentRef } from '../sim';
import { classYearOf } from '../sim/systems/students';
import type { Post } from '../sim/systems/quadline';
import { refIn, type WebView } from './socialView';

/**
 * The living campus, L5 (DESIGN.md 64.6): wheels. Some students ride where they are going: a bike, a board, a scooter,
 * skates. Who rides is a plain rule of who they are, how far they are going and the weather; `src/game/Walkers.ts`
 * draws them and their small moments, and where they park. Visual and travel speed on the map only: no walk time and
 * no number in the game changes. The bike rack is the one thing to build, and it costs its price and nothing else.
 */

export type Wheel = 'bike' | 'skateboard' | 'longboard' | 'kick' | 'escooter' | 'skates';
export const WHEELS: readonly Wheel[] = ['bike', 'skateboard', 'longboard', 'kick', 'escooter', 'skates'];

/** What each is called on a card: "Heading to the Library, on a bike". */
export const WHEEL_NAMES: Record<Wheel, string> = {
  bike: 'on a bike',
  skateboard: 'on a skateboard',
  longboard: 'on a longboard',
  kick: 'on a scooter',
  escooter: 'on an e-scooter',
  skates: 'on skates',
};

/** How much faster than walking, on the paths and roads they share with the walkers. */
export const WHEEL_SPEED: Record<Wheel, number> = { bike: 2.3, skateboard: 1.7, longboard: 1.8, kick: 1.6, escooter: 2.1, skates: 1.7 };

/** Those parked at a rack when they get there; the others are carried in. */
export const PARKS: Record<Wheel, boolean> = { bike: true, skateboard: false, longboard: false, kick: false, escooter: true, skates: false };

export interface RiderFacts {
  weather: Weather;
  period: DayPeriod;
  /** Their quirk, from their card ("Skateboards everywhere"). */
  quirk: string | null;
  /** Their interests, by name. */
  likes: ReadonlySet<string>;
  /** A commuter from the town. */
  commuter: boolean;
  /** How far this trip is, in cells along the way. */
  distance: number;
  /** Their own steady number for the trip, 0 to 1, and another for which wheel. */
  roll: number;
  pick: number;
}

/**
 * Whether they ride, and on what (DESIGN.md 64.6). About one in ten rides on a fine day, more on a long trip (up to
 * about one in five), fewer at night, few in the rain and fewer in snow. Most of those with the "Skateboards
 * everywhere" quirk are on a board; gym and sports people take a bike; a commuter from the town often an e-scooter.
 */
export function wheelOf(facts: RiderFacts): Wheel | null {
  let share = 0.07 + Math.min(0.13, facts.distance / 160);
  const skater = facts.quirk === 'Skateboards everywhere';
  const sporty = facts.likes.has('fitness') || facts.likes.has('sports');
  if (skater) share = Math.max(share, 0.7);
  if (facts.commuter) share = Math.max(share, 0.45);
  if (sporty) share += 0.06;
  share *= facts.weather === 'rain' ? 0.3 : facts.weather === 'snow' ? 0.1 : 1;
  share *= facts.period === 'night' ? 0.6 : 1;
  if (facts.roll >= share) return null;
  const p = facts.pick;
  if (skater) return p < 0.65 ? 'skateboard' : p < 0.9 ? 'longboard' : 'skates';
  if (facts.commuter) return p < 0.55 ? 'escooter' : 'bike';
  if (sporty) return p < 0.75 ? 'bike' : p < 0.88 ? 'skates' : 'longboard';
  return p < 0.48 ? 'bike' : p < 0.62 ? 'skateboard' : p < 0.7 ? 'longboard' : p < 0.82 ? 'kick' : p < 0.94 ? 'escooter' : 'skates';
}

/** A rider's small moment on a trip, at most one (DESIGN.md 64.6), from their roll for it. */
export type RideMoment = 'bell' | 'nearMiss' | 'trick' | 'wipeout';

/**
 * Which, if any: a bike rings its bell at walkers in the way (a third of bike trips); a bike or an e-scooter has a near
 * miss with one now and then; a board does a trick off a kerb (two trips in five); a board, skates or a scooter
 * wipes out, rarely, and gets up again.
 */
export function rideMomentOf(wheel: Wheel, roll: number): RideMoment | null {
  if (wheel === 'bike') return roll < 0.33 ? 'bell' : roll < 0.4 ? 'nearMiss' : null;
  if (wheel === 'escooter') return roll < 0.08 ? 'nearMiss' : null;
  if (wheel === 'skateboard' || wheel === 'longboard') return roll < 0.06 ? 'wipeout' : roll < 0.46 ? 'trick' : null;
  return roll < 0.05 ? 'wipeout' : null;
}

/** One rack for every this many students: fewer than half of that, and bikes lean on walls and students complain. */
export const STUDENTS_PER_RACK = 500;

export function racksWanted(students: number): number {
  return Math.ceil(Math.max(0, students) / STUDENTS_PER_RACK);
}

/** The racks on the campus. */
export function racksBuilt(state: GameState): number {
  let n = 0;
  for (const placed of state.map.placed) if (placed && placed.type === 'rack') n += 1;
  return n;
}

/** True when the campus has fewer than half the racks its students want. */
export function racksShort(state: GameState, students: number): boolean {
  return students > 0 && racksBuilt(state) < racksWanted(students) / 2;
}

/** Complaints about bike parking a week, while racks are short. */
export const RACK_POSTS_A_WEEK = 2;

/**
 * Students complain about bike parking on Quadline while racks are short (DESIGN.md 64.6): two posts a game week,
 * by students from the web, at steady moments of the week so far. These are the app's, not the web's: they are
 * never kept, never go viral and move nothing; they go away when racks are built.
 */
export function rackPosts(view: WebView, state: GameState, students: number): Post[] {
  if (!racksShort(state, students)) return [];
  const topic = CAUSE_TOPICS.indexOf('racks');
  const week = view.week;
  const now = state.clock.tick - (week - 1) * WEB_WEEK_TICKS;
  const span = Math.max(1, Math.min(WEB_WEEK_TICKS - 1, now));
  const out: Post[] = [];
  for (let k = 0; k < RACK_POSTS_A_WEEK; k++) {
    const h = hashInts(view.seed, week, k, 6427) >>> 0;
    const author = authorOf(view, state, h);
    if (!author) continue;
    const minute = h % span;
    if (minute > now) continue;
    out.push({ week, minute, author, kind: POST.complaint, luck: h, a: topic, b: -1, tone: TONE.rough, line: (h >>> 8) % 8, scene: 0, viral: false });
  }
  return out;
}

/**
 * The bike path (DESIGN.md 71). The campus wants a cell of bike path for every this many cells of footpath: with fewer
 * than half that, riders share the footpaths and students say so.
 */
export const PATH_CELLS_PER_LANE = 10;

/**
 * How the bike lane painted on a footpath looks (DESIGN.md 74): `a` down one side of the walk (the west half of a walk
 * running north-south, the north half of one running east-west), `b` down the middle. The owner's pick is open; `a`, the
 * recommended one, until he answers. The map's pieces and where riders and walkers keep both follow it.
 */
export const LANE_LOOK: 'a' | 'b' = 'a';
/** Across a painted cell, in cells from its west or north side: the lane's line for riders, and where walkers keep. */
export const LANE_LINE: Record<'a' | 'b', number> = { a: 0.26, b: 0.5 };
export const WALK_LINE: Record<'a' | 'b', number> = { a: 0.73, b: 0.5 };

/** Cells of footpath and of bike path on the campus. */
export function laneCount(state: GameState): { paths: number; lanes: number } {
  let paths = 0;
  let lanes = 0;
  for (const cell of state.map.cells) {
    if (cell.kind === 'path' || cell.kind === 'crossing') paths += 1;
    else if (cell.kind === 'bike' || cell.kind === 'bikeCrossing') lanes += 1;
    // A walk with a lane painted on it counts as a lane too, and stays a footpath (DESIGN.md 74).
    if (cell.kind === 'path' && cell.lane !== undefined) lanes += 1;
  }
  return { paths, lanes };
}

/** True while riders share the footpaths: less than half the bike path the campus wants. */
export function lanesShort(state: GameState): boolean {
  const { paths, lanes } = laneCount(state);
  return paths > 0 && lanes < paths / PATH_CELLS_PER_LANE / 2;
}

/** Complaints about bikes on the footpaths a week, while bike paths are short; and praise for a new one. */
export const LANE_POSTS_A_WEEK = 2;
export const LANE_PRAISE = 2;
/** The praise goes up within two real hours of a bike path opening, and shows for a real day. */
const PRAISE_WITHIN = 2 * TICKS_PER_HOUR;
const PRAISE_SHOWN = TICKS_PER_DAY;

/**
 * Students on the bike path, on Quadline (DESIGN.md 71): "bikes on the sidewalk again" while riders share the
 * footpaths, two a game week, and praise within two hours of a new bike path opening. The app's own, as the bike-parking
 * complaints are: never kept, never viral, moving nothing.
 */
export function lanePosts(view: WebView, state: GameState): Post[] {
  const topic = CAUSE_TOPICS.indexOf('lanes');
  const week = view.week;
  const now = state.clock.tick - (week - 1) * WEB_WEEK_TICKS;
  const out: Post[] = [];
  if (lanesShort(state)) {
    const span = Math.max(1, Math.min(WEB_WEEK_TICKS - 1, now));
    for (let k = 0; k < LANE_POSTS_A_WEEK; k++) {
      const h = hashInts(view.seed, week, k, 6451) >>> 0;
      const author = authorOf(view, state, h);
      if (!author) continue;
      const minute = h % span;
      if (minute > now) continue;
      out.push({ week, minute, author, kind: POST.complaint, luck: h, a: topic, b: -1, tone: TONE.rough, line: (h >>> 8) % 8, scene: 0, viral: false });
    }
  }
  // The newest bike path, for a real day after it opened.
  let opened = -1;
  for (const cell of state.map.cells) if ((cell.kind === 'bike' || cell.kind === 'bikeCrossing') && cell.builtTick > opened) opened = cell.builtTick;
  if (opened >= 0 && state.clock.tick - opened < PRAISE_SHOWN) {
    for (let k = 0; k < LANE_PRAISE; k++) {
      const h = hashInts(view.seed, opened, k, 6453) >>> 0;
      const at = opened + 10 + (h % PRAISE_WITHIN);
      if (at > state.clock.tick) continue;
      const author = authorOf(view, state, h);
      if (!author) continue;
      const atWeek = Math.floor(at / WEB_WEEK_TICKS) + 1;
      out.push({ week: atWeek, minute: at - (atWeek - 1) * WEB_WEEK_TICKS, author, kind: POST.praise, luck: h, a: topic, b: -1, tone: TONE.good, line: (h >>> 8) % 4, scene: 0, viral: false });
    }
  }
  return out;
}

/** A student from the web, enrolled now, steady for the number given. */
function authorOf(view: WebView, state: GameState, h: number): StudentRef | null {
  const n = view.identity.length;
  for (let tries = 0; tries < 12 && n > 0; tries++) {
    const id = (h + tries * 7919) % n;
    if (view.identity[id] === 0) continue;
    const ref = refIn(view, id);
    if (classYearOf(state, ref) !== null) return ref;
  }
  return null;
}
