import { calendarAt } from '../calendar';
import { CLUBS, MAJORS } from '../config/students';
import {
  BACK_TOGETHER,
  BEST_AT,
  BREAKUP,
  CATCHUP_FULL_WEEKS,
  CLASH_BELOW,
  CRUSH_FROM,
  DATE_FROM,
  ENCOUNTERS,
  ENEMY_AT,
  EVENT,
  EVENTS,
  FADE,
  FEEL,
  FLOOR_SIZE,
  FRIEND_AT,
  GROUP_MAX,
  GROUP_MIN,
  HAPPENING_KINDS,
  HAPPENING_WEEKS,
  HAPPENINGS_KEPT,
  HEAVY_EVENTS,
  KIND,
  KNOWN,
  MET_AT,
  REGROW_LIVED_WEEKS,
  RIVAL_AT,
  SECTION_SIZE,
  SLOTS,
  SPARK,
  SPARK_BACK,
  TABLE_SIZE,
  WEB_WEEK_TICKS,
  WHERE,
} from '../config/web';
import { enrollment, openCapacity } from '../selectors';
import type { GameState } from '../types';
import { athleteShare } from './football';
import { chemistry, gender, identityOf, likes, TRAIT, traitOf } from './identity';
import { placeIndex, socialProfile, studentHome, type PlaceIndex, type StudentRef } from './students';
import { offCampusNow } from './town';

/**
 * The social web (DESIGN.md 63): every student's ties, for all of them, on typed arrays. Twelve slots a student, both
 * ends of a tie holding it. Once a game week each student has a handful of encounters, on their dorm floor, in a class
 * section, at a club table, with their team or chapter, or in the dining hall, the rec center or at a party, and about
 * half of them with someone they already know; ties form, grow, sour, turn romantic, fade and break.
 *
 * It runs beside the game, not inside a tick: in a worker in the app, kept in a save record of its own (63.3,
 * decision 3), read by the cards. Everything is rolled from the seed, the pair and the week, never from the game's
 * random streams, so it comes out the same however it is stepped. Nothing in it moves a campus number yet (stop 6).
 */

export interface Group {
  start: Int32Array;
  members: Int32Array;
}

export interface Web {
  seed: number;
  /** Room for this many students in each class; a class that outgrows it grows it. */
  classSlot: number;
  /** The entry year each of the four class rings holds, or -1. */
  ring: number[];
  /** The game week the web has reached. */
  week: number;
  n: number;
  // Saved:
  other: Int32Array;
  kind: Uint8Array;
  strength: Uint8Array;
  feeling: Uint8Array;
  seen: Uint16Array;
  // Worked out again when loaded:
  identity: Uint32Array;
  /** The class year (0 to 3) of each student, or -1 for nobody. */
  year: Int8Array;
  /** Where they spend time: dorm floor, class section, club table, team, chapter, district. -1 for none. */
  place: Int32Array[];
  groups: Group[];
  back: Int32Array;
  chem: Int8Array;
  /** What the places were read for: the semester and the housing. */
  placedFor: string;
  /** The calendar year roommates were paired for. */
  roomsFor: number;
  /** What happened, counted since it began, by EVENTS. */
  events: Float64Array;
  /** The campus year the web is being stepped in, set by each catch-up: what the week's happenings are dated. */
  calYear: number;
  /**
   * What happened by name (DESIGN.md 63.6): HAPPENING_WEEKS weeks of HAPPENING_KINDS, HAPPENINGS_KEPT of each, as
   * HAPPENING_FIELDS numbers each (see `happeningAt`). A week no longer kept is written over.
   */
  happenings: Int32Array;
  /** Each kept week's counts by EVENTS, its week and its campus year. */
  weekly: Float64Array;
  weeklyWeek: Int32Array;
  weeklyYear: Int32Array;
  /**
   * The one heavy happening that may be shown this campus week (63.3, decision 6): the first of the week, kept even when
   * the web is grown again, so a second is never picked in the same week. `rationFor` is the campus year it is for.
   */
  ration: Int32Array;
  rationFor: number;
  /** Friend groups, worked out again after each catch-up: each student's group or -1, and each group's members. */
  groupOf: Int32Array;
  friendGroups: Group;
  /** Each group's vibe: the interest most of them share, by INTEREST. */
  groupVibe: Uint8Array;
}

/** A happening's numbers: its week, its event, its campus year, its luck, then up to three students as entry year and index. */
export const HAPPENING_FIELDS = 10;
const PER_WEEK = HAPPENING_KINDS.length * HAPPENINGS_KEPT;
const KIND_SLOT = new Map<number, number>(HAPPENING_KINDS.map((kind, i) => [kind, i]));

const PLACES = 6;
const share = (h: number): number => (h >>> 0) / 4294967296;

function mix(h: number, v: number): number {
  h ^= v | 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995);
}

/** The same as hashInts(seed, salt, x, y, z), with no array made: the weekly batch calls it a million times. */
function hash5(seed: number, salt: number, x: number, y: number, z: number): number {
  let h = 0x811c9dc5;
  h = mix(h, seed);
  h = mix(h, salt);
  h = mix(h, x);
  h = mix(h, y);
  h = mix(h, z);
  return (h ^ (h >>> 15)) >>> 0;
}

/** The game week a state has reached, by its clock. */
export function webWeekOf(state: GameState): number {
  return Math.floor(state.clock.tick / WEB_WEEK_TICKS);
}

export function newWeb(seed: number, classSlot: number): Web {
  const n = classSlot * 4;
  return {
    seed,
    classSlot,
    ring: [-1, -1, -1, -1],
    week: -1,
    n,
    other: new Int32Array(n * SLOTS).fill(-1),
    kind: new Uint8Array(n * SLOTS),
    strength: new Uint8Array(n * SLOTS),
    feeling: new Uint8Array(n * SLOTS),
    seen: new Uint16Array(n * SLOTS),
    identity: new Uint32Array(n),
    year: new Int8Array(n).fill(-1),
    place: Array.from({ length: PLACES }, () => new Int32Array(n).fill(-1)),
    groups: [],
    back: new Int32Array(n * SLOTS).fill(-1),
    chem: new Int8Array(n * SLOTS),
    placedFor: '',
    roomsFor: -1,
    events: new Float64Array(EVENTS.length),
    calYear: 0,
    happenings: new Int32Array(HAPPENING_WEEKS * PER_WEEK * HAPPENING_FIELDS).fill(-1),
    weekly: new Float64Array(HAPPENING_WEEKS * EVENTS.length),
    weeklyWeek: new Int32Array(HAPPENING_WEEKS).fill(-1),
    weeklyYear: new Int32Array(HAPPENING_WEEKS),
    ration: new Int32Array(HAPPENING_FIELDS).fill(-1),
    rationFor: -1,
    groupOf: new Int32Array(n).fill(-1),
    friendGroups: { start: new Int32Array(1), members: new Int32Array(0) },
    groupVibe: new Uint8Array(0),
  };
}

const ringOf = (entryYear: number): number => ((entryYear % 4) + 4) % 4;

/** A student's place in the web, or -1 when the web does not hold them. */
export function idOf(web: Web, ref: StudentRef): number {
  const r = ringOf(ref.entryYear);
  if (web.ring[r] !== ref.entryYear || ref.index < 0 || ref.index >= web.classSlot) return -1;
  const id = r * web.classSlot + ref.index;
  return web.year[id]! >= 0 ? id : -1;
}

/** The student in a place of the web. */
export function refAt(web: Web, id: number): StudentRef {
  const r = Math.floor(id / web.classSlot);
  return { entryYear: web.ring[r]!, index: id % web.classSlot };
}

// -------------------------------------------------------------- the layout --

/** Drop every tie at a place, both ends. */
function dropAll(web: Web, id: number): void {
  const base = id * SLOTS;
  for (let k = 0; k < SLOTS; k++) {
    const s = base + k;
    if (web.other[s] === -1) continue;
    const back = web.back[s]!;
    if (back >= 0 && web.other[back] === id) clear(web, back);
    clear(web, s);
  }
}

function clear(web: Web, s: number): void {
  web.other[s] = -1;
  web.kind[s] = 0;
  web.strength[s] = 0;
  web.feeling[s] = 0;
  web.back[s] = -1;
}

/** A bigger class slot, every place moved to its new number. */
function grow(web: Web, classSlot: number): void {
  const old = web;
  const next = newWeb(old.seed, classSlot);
  next.ring = [...old.ring];
  next.week = old.week;
  next.events = old.events;
  next.calYear = old.calYear;
  next.happenings = old.happenings;
  next.weekly = old.weekly;
  next.weeklyWeek = old.weeklyWeek;
  next.weeklyYear = old.weeklyYear;
  next.ration = old.ration;
  next.rationFor = old.rationFor;
  const move = (id: number): number => (id < 0 ? -1 : Math.floor(id / old.classSlot) * classSlot + (id % old.classSlot));
  for (let id = 0; id < old.n; id++) {
    const to = move(id);
    for (let k = 0; k < SLOTS; k++) {
      const s = id * SLOTS + k;
      const t = to * SLOTS + k;
      next.other[t] = move(old.other[s]!);
      next.kind[t] = old.kind[s]!;
      next.strength[t] = old.strength[s]!;
      next.feeling[t] = old.feeling[s]!;
      next.seen[t] = old.seen[s]!;
      next.chem[t] = old.chem[s]!;
      const b = old.back[s]!;
      next.back[t] = b < 0 ? -1 : move(Math.floor(b / SLOTS)) * SLOTS + (b % SLOTS);
    }
    next.identity[to] = old.identity[id]!;
  }
  Object.assign(web, next);
}

/**
 * The classes the campus has now: a class that has graduated leaves the web, and every tie to it; a new one comes in
 * with none; students who have left the school leave it. A class too big for the web grows it.
 */
export function fitClasses(web: Web, state: GameState): void {
  const year = calendarAt(state.clock).year;
  const most = Math.max(1, ...state.cohorts);
  if (most > web.classSlot) grow(web, Math.ceil((most * 1.25) / 512) * 512);
  for (let classYear = 0; classYear < 4; classYear++) {
    const entryYear = year - classYear;
    const r = ringOf(entryYear);
    if (web.ring[r] !== entryYear) {
      for (let id = r * web.classSlot; id < (r + 1) * web.classSlot; id++) {
        dropAll(web, id);
        web.identity[id] = 0;
        web.year[id] = -1;
      }
      web.ring[r] = entryYear;
    }
    const size = state.cohorts[classYear] ?? 0;
    for (let index = 0; index < web.classSlot; index++) {
      const id = r * web.classSlot + index;
      if (index < size) web.year[id] = classYear;
      else if (web.year[id]! >= 0 || web.identity[id] !== 0) {
        dropAll(web, id);
        web.year[id] = -1;
        web.identity[id] = 0;
      }
    }
  }
}

/** True when a hall's rooms are shared: grown to its second stage, and the campus's dorms more than half full. */
export function roomsShared(state: GameState, home: number): boolean {
  const hall = state.map.buildings[state.map.cells[home]?.buildingId ?? -1];
  if (!hall || hall.stage < 2) return false;
  const beds = openCapacity(state, 'housing');
  const residents = Math.max(0, enrollment(state) - offCampusNow(state));
  return beds > 0 && residents / beds > 0.5;
}

/** The capacity of each housing building, by cell, from the running totals. */
function capacities(housing: PlaceIndex): Map<number, number> {
  const out = new Map<number, number>();
  housing.cells.forEach((cell, i) => out.set(cell, housing.upTo[i]! - (i > 0 ? housing.upTo[i - 1]! : 0)));
  return out;
}

/**
 * Where everyone spends time: read from the campus when the semester or the housing changes, and for students who
 * are new since. A dorm floor is about two dozen, a class section about thirty, a club table about forty.
 */
export function place(web: Web, state: GameState): void {
  const housing = placeIndex(state, 'housing');
  const { year: calYear } = calendarAt(state.clock);
  const semester = `${calYear}:${calendarAt(state.clock).tickInYear >= 4 * 1440 ? 1 : 0}`;
  const key = `${semester}|${housing.cells.join(',')}|${housing.upTo.join(',')}`;
  const full = key !== web.placedFor;
  const athletes = athleteShare(state);
  const sizes = capacities(housing);
  const majors = new Map(MAJORS.map((m, i) => [m.name, i]));
  const clubs = new Map(CLUBS.map((c, i) => [c.name, i]));
  const chapters = new Map<string, number>();
  const width = state.map.width;
  for (let id = 0; id < web.n; id++) {
    const classYear = web.year[id]!;
    if (classYear < 0) continue;
    if (!full && web.identity[id] !== 0) continue;
    const ref = refAt(web, id);
    const p = socialProfile(state, ref, housing, athletes);
    if (!p) continue;
    if (web.identity[id] === 0) web.identity[id] = (identityOf(web.seed, ref, p.nature) | 0x80000000) >>> 0;
    const h = hash5(web.seed, 9911, ref.entryYear, ref.index, 0);
    const home = p.housed ? null : p.home;
    const floors = home === null ? 1 : Math.max(1, Math.round((sizes.get(home) ?? FLOOR_SIZE) / FLOOR_SIZE));
    web.place[0]![id] = home === null ? -1 : home * 64 + (h % Math.min(64, floors));
    const cohort = state.cohorts[classYear] ?? 1;
    const sections = Math.max(1, Math.min(64, Math.round(cohort / MAJORS.length / SECTION_SIZE)));
    web.place[1]![id] = ((majors.get(p.major) ?? 0) * 4 + classYear) * 64 + ((h >>> 6) % sections);
    const tables = Math.max(1, Math.min(256, Math.round((cohort * 4) / CLUBS.length / TABLE_SIZE)));
    web.place[2]![id] = p.club ? (clubs.get(p.club) ?? 0) * 256 + ((h >>> 12) % tables) : -1;
    web.place[3]![id] = p.team ? (h >>> 20) % 8 : -1;
    if (p.chapter && !chapters.has(p.chapter)) chapters.set(p.chapter, chapters.size);
    web.place[4]![id] = p.chapter ? chapters.get(p.chapter)! : -1;
    const spot = p.home ?? 0;
    web.place[5]![id] = Math.floor((spot % width) / 10) * 64 + Math.floor(spot / width / 10);
  }
  web.placedFor = key;
  web.groups = web.place.map((keys) => {
    let most = 0;
    for (let i = 0; i < web.n; i++) if (web.year[i]! >= 0 && keys[i]! > most) most = keys[i]!;
    const start = new Int32Array(most + 2);
    for (let i = 0; i < web.n; i++) if (web.year[i]! >= 0 && keys[i]! >= 0) start[keys[i]! + 1]! += 1;
    for (let k = 1; k < start.length; k++) start[k]! += start[k - 1]!;
    const fill = start.slice();
    const members = new Int32Array(start[start.length - 1]!);
    for (let i = 0; i < web.n; i++) if (web.year[i]! >= 0 && keys[i]! >= 0) members[fill[keys[i]!]!++] = i;
    return { start, members };
  });
  placeRoommates(web, state, calYear);
}

// ------------------------------------------------------------ slots --

function slotOf(web: Web, a: number, b: number): number {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) if (web.other[base + k] === b) return base + k;
  return -1;
}

/** A free slot, or the weakest acquaintance's, which lets go at both ends; -1 when every slot holds something more. */
function roomFor(web: Web, a: number): number {
  const base = a * SLOTS;
  let weakest = -1;
  let low = 256;
  for (let k = 0; k < SLOTS; k++) {
    const s = base + k;
    if (web.other[s] === -1) return s;
    if (web.kind[s] === KIND.met && web.strength[s]! < low) {
      low = web.strength[s]!;
      weakest = s;
    }
  }
  if (weakest >= 0) {
    const back = web.back[weakest]!;
    if (back >= 0) clear(web, back);
    clear(web, weakest);
  }
  return weakest;
}

function link(web: Web, a: number, b: number, kind: number, strength: number, chem: number): [number, number] | null {
  const sa = roomFor(web, a);
  const sb = roomFor(web, b);
  if (sa < 0 || sb < 0) {
    if (sa >= 0) clear(web, sa);
    if (sb >= 0) clear(web, sb);
    return null;
  }
  web.other[sa] = b;
  web.other[sb] = a;
  web.back[sa] = sb;
  web.back[sb] = sa;
  web.chem[sa] = web.chem[sb] = Math.round(chem * 100);
  web.strength[sa] = web.strength[sb] = strength;
  web.kind[sa] = web.kind[sb] = kind;
  web.feeling[sa] = web.feeling[sb] = FEEL.warm;
  web.seen[sa] = web.seen[sb] = web.week & 0xffff;
  return [sa, sb];
}

function setBoth(web: Web, sa: number, sb: number, kind: number, feeling: number): void {
  web.kind[sa] = web.kind[sb] = kind;
  web.feeling[sa] = web.feeling[sb] = feeling;
}

function has(web: Web, a: number, kind: number): number {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) if (web.kind[base + k] === kind && web.other[base + k]! >= 0) return base + k;
  return -1;
}

function partnered(web: Web, a: number): number {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) {
    const kind = web.kind[base + k]!;
    if (kind >= KIND.dating && kind <= KIND.longterm && web.other[base + k]! >= 0) return base + k;
  }
  return -1;
}

const pairChem = (web: Web, a: number, b: number): number => {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return chemistry(web.identity[a]!, web.identity[b]!, share(hash5(web.seed, 9920, lo, hi, 0)));
};

// --------------------------------------------------------- roommates --

/**
 * Roommates, two of a gender, as most dorms pair them (decision 4). A nonbinary student rooms with another nonbinary
 * student on their floor, and otherwise has a room of their own. Paired again each year; a pair whose rooms are no
 * longer shared, or who no longer share a floor, are roommates no more.
 */
function placeRoommates(web: Web, state: GameState, calYear: number): void {
  const newYear = web.roomsFor !== calYear;
  web.roomsFor = calYear;
  const floor = web.place[0]!;
  const shared = new Map<number, boolean>();
  const isShared = (key: number): boolean => {
    const home = Math.floor(key / 64);
    let v = shared.get(home);
    if (v === undefined) {
      v = roomsShared(state, home);
      shared.set(home, v);
    }
    return v;
  };
  // Pairs that no longer hold, and every pair at a new year, end: friends if they were close.
  for (let a = 0; a < web.n; a++) {
    const s = has(web, a, KIND.roommate);
    if (s < 0) continue;
    const b = web.other[s]!;
    if (b < a) continue;
    const ok = !newYear && web.year[a]! >= 0 && web.year[b]! >= 0 && floor[a] === floor[b] && floor[a]! >= 0 && isShared(floor[a]!) && gender(web.identity[a]!) === gender(web.identity[b]!);
    if (!ok) setBoth(web, s, web.back[s]!, web.strength[s]! >= FRIEND_AT ? KIND.friend : KIND.met, FEEL.warm);
  }
  const group = web.groups[0];
  if (!group) return;
  for (let key = 0; key + 1 < group.start.length; key++) {
    const from = group.start[key]!;
    const to = group.start[key + 1]!;
    if (to - from < 2 || !isShared(key)) continue;
    // Each waits for the next of their gender on the floor without a roommate.
    const waiting = [-1, -1, -1];
    for (let i = from; i < to; i++) {
      const one = group.members[i]!;
      if (has(web, one, KIND.roommate) >= 0) continue;
      const g = gender(web.identity[one]!);
      if (waiting[g]! < 0) {
        waiting[g] = one;
        continue;
      }
      const a = waiting[g]!;
      waiting[g] = -1;
      const chem = pairChem(web, a, one);
      const s = slotOf(web, a, one);
      if (s >= 0) {
        setBoth(web, s, web.back[s]!, KIND.roommate, chem < -0.1 ? FEEL.tense : FEEL.warm);
        web.strength[s] = web.strength[web.back[s]!] = Math.max(web.strength[s]!, 40);
      } else {
        const made = link(web, a, one, KIND.roommate, 40, chem);
        if (made) web.feeling[made[0]] = web.feeling[made[1]] = chem < -0.1 ? FEEL.tense : FEEL.warm;
      }
    }
  }
}

// ------------------------------------------------------ an encounter --

const count = (web: Web, what: number): void => {
  web.events[what]! += 1;
};

/**
 * Remember a happening by name, if it is of a kind the paper and the cards tell: of each kind, the week keeps the
 * HAPPENINGS_KEPT with the least luck, so who is told about owes nothing to their place in the web.
 */
function note(web: Web, what: number, a: number, b: number, c = -1): void {
  const kindSlot = KIND_SLOT.get(what);
  if (kindSlot === undefined) return;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const luck = hash5(web.seed, 9990, lo, hi, web.week * 16 + what) | 0;
  const base = ((((web.week % HAPPENING_WEEKS) + HAPPENING_WEEKS) % HAPPENING_WEEKS) * PER_WEEK + kindSlot * HAPPENINGS_KEPT) * HAPPENING_FIELDS;
  let at = -1;
  let worst = -2147483648;
  for (let k = 0; k < HAPPENINGS_KEPT; k++) {
    const f = base + k * HAPPENING_FIELDS;
    if (web.happenings[f] !== web.week) {
      at = f;
      break;
    }
    const theirs = web.happenings[f + 3]!;
    if (theirs > worst) {
      worst = theirs;
      at = f;
    }
  }
  if (web.happenings[at] === web.week && luck >= worst) return;
  const h = web.happenings;
  h[at] = web.week;
  h[at + 1] = what;
  h[at + 2] = web.calYear;
  h[at + 3] = luck;
  const put = (field: number, id: number): void => {
    if (id < 0) {
      h[at + field] = -1;
      h[at + field + 1] = -1;
      return;
    }
    const ref = refAt(web, id);
    h[at + field] = ref.entryYear;
    h[at + field + 1] = ref.index;
  };
  put(4, a);
  put(6, b);
  put(8, c);
}

/** Free to start dating: single (1), taken and flirty enough to cheat (2), or not (0). Changes nothing. */
function freeToDate(web: Web, who: number, h: number): number {
  if (partnered(web, who) < 0) return 1;
  return traitOf(web.identity[who]!, TRAIT.loyal) === 0 && share(h >>> 9) < 0.25 ? 2 : 0;
}

/** They cheat: the couple they were in ends messily, told once as the cheating, with whom it was for. */
function cheat(web: Web, who: number, other: number): void {
  const held = partnered(web, who);
  if (held < 0) return;
  setBoth(web, held, web.back[held]!, KIND.ex, FEEL.tense);
  count(web, EVENT.cheating);
  count(web, EVENT.splitMessy);
  note(web, EVENT.cheating, who, web.other[held]!, other);
}

/** How many have a crush on b: the other ends of b's ties that say crush. */
function crushedBy(web: Web, b: number): number {
  let n = 0;
  for (let k = 0; k < SLOTS; k++) {
    const s = b * SLOTS + k;
    if (web.other[s]! < 0) continue;
    const back = web.back[s]!;
    if (back >= 0 && web.kind[back] === KIND.crush) n += 1;
  }
  return n;
}

/** One encounter: a tie begins or grows, sours, turns romantic, or breaks. Both ends move together. */
function meet(web: Web, a: number, b: number, h: number): void {
  let sa = slotOf(web, a, b);
  let sb: number;
  let chem: number;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (sa < 0) {
    chem = pairChem(web, a, b);
    if (chem < -0.1 && share(h) < 0.6) return;
    const made = link(web, a, b, KIND.met, MET_AT, chem);
    if (!made) return;
    [sa, sb] = made;
    count(web, 0);
  } else {
    sb = web.back[sa]!;
    chem = web.chem[sa]! / 100;
  }
  web.seen[sa] = web.seen[sb] = web.week & 0xffff;
  const ka = web.kind[sa]!;
  const kb = web.kind[sb]!;
  let st = web.strength[sa]!;
  // A pair who grate grows sorer: rivals, then enemies. Never cruel: they argue.
  if (ka === KIND.rival || ka === KIND.enemy || (chem < CLASH_BELOW && ka === KIND.met)) {
    st = Math.min(100, st + 3);
    const next = st >= ENEMY_AT ? KIND.enemy : st >= RIVAL_AT ? KIND.rival : KIND.met;
    if (next !== ka) count(web, next === KIND.enemy ? EVENT.enemies : EVENT.rivals);
    if (next !== ka && next === KIND.enemy) note(web, EVENT.enemies, a, b);
    web.strength[sa] = web.strength[sb] = st;
    setBoth(web, sa, sb, next, next === KIND.met ? FEEL.warm : FEEL.tense);
    return;
  }
  st = Math.max(0, Math.min(100, st + Math.round(2 + 7 * chem)));
  web.strength[sa] = web.strength[sb] = st;
  if (ka === KIND.met && st >= FRIEND_AT) {
    setBoth(web, sa, sb, KIND.friend, FEEL.warm);
    count(web, 1);
  } else if (ka === KIND.friend && st >= BEST_AT && has(web, a, KIND.best) < 0 && has(web, b, KIND.best) < 0) {
    setBoth(web, sa, sb, KIND.best, FEEL.warm);
    count(web, EVENT.best);
    note(web, EVENT.best, a, b);
  }
  // Romance, between friends: a rare spark, and each must be the other's type.
  if (st < CRUSH_FROM || ka === KIND.roommate || ka === KIND.ex || (ka >= KIND.dating && ka <= KIND.longterm)) return;
  const spark = share(hash5(web.seed, 9930, lo, hi, 0));
  if (spark < SPARK) return;
  const ia = web.identity[a]!;
  const ib = web.identity[b]!;
  if (likes(ia, ib) && ka !== KIND.crush && has(web, a, KIND.crush) < 0) {
    web.kind[sa] = KIND.crush;
    web.feeling[sa] = partnered(web, a) >= 0 ? FEEL.complicated : FEEL.warm;
    count(web, kb === KIND.crush ? 4 : 3);
    if (crushedBy(web, b) >= 2) {
      count(web, EVENT.triangle);
      // a and another, both with a crush on b.
      let rival = -1;
      for (let k = 0; k < SLOTS && rival < 0; k++) {
        const s = b * SLOTS + k;
        const other = web.other[s]!;
        const back = web.back[s]!;
        if (other >= 0 && other !== a && back >= 0 && web.kind[back] === KIND.crush) rival = other;
      }
      note(web, EVENT.triangle, a, b, rival);
    }
  }
  if (likes(ib, ia) && kb !== KIND.crush && spark > SPARK_BACK && has(web, b, KIND.crush) < 0) {
    web.kind[sb] = KIND.crush;
    web.feeling[sb] = partnered(web, b) >= 0 ? FEEL.complicated : FEEL.warm;
    count(web, web.kind[sa] === KIND.crush ? 4 : 3);
  }
  // Both with a crush, close enough, a good evening: they start dating, if both are free, or one cheats.
  if (web.kind[sa] === KIND.crush && web.kind[sb] === KIND.crush && st >= DATE_FROM && share(h >>> 5) < 0.35) {
    // Both must be free, or ready to cheat; only then does anything end.
    const fa = freeToDate(web, a, h);
    const fb = freeToDate(web, b, h >>> 2);
    if (fa === 0 || fb === 0) return;
    if (fa === 2) cheat(web, a, b);
    if (fb === 2) cheat(web, b, a);
    setBoth(web, sa, sb, KIND.dating, FEEL.warm);
    count(web, EVENT.dating);
    note(web, EVENT.dating, a, b);
  }
}

/**
 * The week's end, each end of each tie on its own: both ends hold the same strength and week together, and every
 * roll here is the pair's, so the two ends come out the same without finding each other.
 */
function settle(web: Web): void {
  const week = web.week & 0xffff;
  const total = web.n * SLOTS;
  for (let s = 0; s < total; s++) {
    const b = web.other[s]!;
    if (b === -1) continue;
    const a = (s / SLOTS) | 0;
    const kind = web.kind[s]!;
    let st = web.strength[s]!;
    if (web.seen[s] !== week) {
      const fade = FADE[kind] ?? 1;
      st = st > fade ? st - fade : 0;
      web.strength[s] = st;
    }
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (kind >= KIND.dating && kind <= KIND.longterm) {
      const h = share(hash5(web.seed, 9940, lo, hi, web.week));
      const chance = kind === KIND.longterm ? BREAKUP.longterm : kind === KIND.exclusive ? BREAKUP.exclusive : BREAKUP.dating;
      if (st < 30 || h < chance) {
        web.kind[s] = KIND.ex;
        web.feeling[s] = h < chance / 2 ? FEEL.complicated : FEEL.tense;
        web.strength[s] = 40;
        if (a === lo) {
          // A cheating partner's couple has ended already, and was told as the cheating.
          const how = web.feeling[s] === FEEL.complicated ? EVENT.splitMutual : EVENT.splitMessy;
          count(web, how);
          note(web, how, lo, hi);
        }
      } else if (kind === KIND.dating && st >= 70) {
        web.kind[s] = KIND.exclusive;
        if (a === lo) count(web, 6);
      } else if (kind === KIND.exclusive && st >= 95) {
        web.kind[s] = KIND.longterm;
        if (a === lo) {
          count(web, EVENT.longterm);
          note(web, EVENT.longterm, lo, hi);
        }
      }
    } else if (kind === KIND.ex && web.seen[s] === week && a === hi && st > 0) {
      // On and off: exes who keep seeing each other, both free, may get back together. Decided at the end settled
      // second, so neither end is settled again after it.
      const h = share(hash5(web.seed, 9950, lo, hi, web.week));
      if (h < BACK_TOGETHER && partnered(web, a) < 0 && partnered(web, b) < 0) {
        const back = web.back[s]!;
        if (back >= 0) {
          setBoth(web, s, back, KIND.dating, FEEL.complicated);
          web.strength[s] = web.strength[back] = 50;
          count(web, EVENT.backTogether);
          note(web, EVENT.backTogether, lo, hi);
        }
      }
    } else if ((kind === KIND.friend || kind === KIND.best || kind === KIND.crush) && st < 25) web.kind[s] = KIND.met;
    if (st === 0 && (kind === KIND.met || kind === KIND.ex || kind === KIND.rival || kind === KIND.crush)) clear(web, s);
  }
}

/** One game week for everyone: a handful of encounters each, then the week's settling. */
export function stepWeek(web: Web): void {
  web.week += 1;
  const { seed, n } = web;
  const week = web.week;
  // This week's row of happenings and counts, written over the week HAPPENING_WEEKS ago.
  const row = ((week % HAPPENING_WEEKS) + HAPPENING_WEEKS) % HAPPENING_WEEKS;
  web.happenings.fill(-1, row * PER_WEEK * HAPPENING_FIELDS, (row + 1) * PER_WEEK * HAPPENING_FIELDS);
  web.weeklyWeek[row] = week;
  web.weeklyYear[row] = web.calYear;
  const before = web.events.slice();
  for (let a = 0; a < n; a++) {
    if (web.year[a]! < 0) continue;
    const encounters = ENCOUNTERS + traitOf(web.identity[a]!, TRAIT.outgoing) - 1;
    for (let e = 0; e < encounters; e++) {
      const h = hash5(seed, 9960, week, a, e);
      let b = -1;
      if (share(h) < KNOWN) {
        // Someone they know: the stronger of two picked at random.
        const s1 = a * SLOTS + ((h >>> 3) % SLOTS);
        const s2 = a * SLOTS + ((h >>> 11) % SLOTS);
        const pick = web.other[s2]! >= 0 && web.strength[s2]! > web.strength[s1]! ? s2 : s1;
        b = web.other[pick]!;
        if (b >= 0 && web.year[b]! < 0) b = -1;
      }
      if (b < 0) {
        let r = share(hash5(seed, 9961, week, a, e));
        let p = 0;
        while (p < PLACES - 1 && r >= WHERE[p]!) {
          r -= WHERE[p]!;
          p += 1;
        }
        const key = web.place[p]![a]!;
        if (key < 0) continue;
        const group = web.groups[p];
        if (!group || key + 1 >= group.start.length) continue;
        const from = group.start[key]!;
        const size = group.start[key + 1]! - from;
        if (size < 2) continue;
        b = group.members[from + ((h >>> 7) % size)]!;
      }
      if (b === a || b < 0) continue;
      meet(web, a, b, h);
    }
  }
  settle(web);
  for (let k = 0; k < EVENTS.length; k++) web.weekly[row * EVENTS.length + k] = web.events[k]! - before[k]!;
}

// ----------------------------------------------------------- regrowing --

/**
 * A long absence: the web grown again from the seed, as it would stand after time together, without the time
 * (decision 2). Each student is tied to the floor-mates, section-mates and club-mates they get on with, closer the
 * older they both are; a few single pairs who are each other's type are couples. Roommates are paired again.
 */
export function regrow(web: Web, state: GameState): void {
  // What happened by name belongs to the ties as they were: a new history begins. The week's heavy pick is kept.
  web.happenings.fill(-1);
  web.weekly.fill(0);
  web.weeklyWeek.fill(-1);
  web.other.fill(-1);
  web.kind.fill(0);
  web.strength.fill(0);
  web.feeling.fill(0);
  web.back.fill(-1);
  web.roomsFor = -1;
  placeRoommates(web, state, calendarAt(state.clock).year);
  const { seed, n } = web;
  for (let a = 0; a < n; a++) {
    const years = web.year[a]!;
    if (years < 0) continue;
    for (const [p, tries] of [[0, 6], [1, 5], [2, 4]] as const) {
      const key = web.place[p]![a]!;
      const group = web.groups[p];
      if (key < 0 || !group || key + 1 >= group.start.length) continue;
      const from = group.start[key]!;
      const size = group.start[key + 1]! - from;
      if (size < 2) continue;
      for (let t = 0; t < tries; t++) {
        const b = group.members[from + (hash5(seed, 9970, a, p, t) % size)]!;
        if (b <= a || slotOf(web, a, b) >= 0) continue;
        const chem = pairChem(web, a, b);
        if (chem < 0) continue;
        const st = Math.min(95, Math.round(15 + 40 * chem + 8 * Math.min(years, web.year[b]!)));
        const spark = share(hash5(seed, 9930, a, b, 0));
        const couple = spark > SPARK + 0.01 && likes(web.identity[a]!, web.identity[b]!) && likes(web.identity[b]!, web.identity[a]!) && partnered(web, a) < 0 && partnered(web, b) < 0;
        // A couple grown again is a couple that has lasted: never so weak it ends the first week it is lived.
        link(web, a, b, couple ? (st >= 70 ? KIND.longterm : KIND.dating) : st >= FRIEND_AT ? KIND.friend : KIND.met, couple ? Math.max(st, DATE_FROM + 5) : st, chem);
      }
    }
  }
}

/**
 * Bring the web up to a game week: the classes the campus has, where everyone spends time, then each week lived, or,
 * for a long absence, the web regrown and its last weeks lived (decision 2). Returns how it was done.
 */
export function catchUp(web: Web, state: GameState, toWeek: number): { lived: number; regrown: boolean } {
  fitClasses(web, state);
  place(web, state);
  web.calYear = calendarAt(state.clock).year;
  const fresh = web.week < 0;
  if (fresh) web.week = toWeek - 1;
  const gap = toWeek - web.week;
  if (gap <= 0) return { lived: 0, regrown: false };
  let regrown = false;
  if (gap > CATCHUP_FULL_WEEKS || fresh) {
    web.week = toWeek - REGROW_LIVED_WEEKS;
    regrow(web, state);
    regrown = true;
  }
  let lived = 0;
  while (web.week < toWeek) {
    stepWeek(web);
    lived += 1;
  }
  findGroups(web);
  pickRation(web);
  return { lived, regrown };
}

/** The week's heavy happening, once there is one: the earliest of the campus year, then the least luck. Never changed after. */
export function pickRation(web: Web): void {
  if (web.rationFor !== web.calYear) {
    web.rationFor = web.calYear;
    web.ration.fill(-1);
  }
  if (web.ration[0] !== -1) return;
  let pick = -1;
  for (let f = 0; f < web.happenings.length; f += HAPPENING_FIELDS) {
    const h = web.happenings;
    if (h[f] === -1 || h[f + 2] !== web.calYear || !HEAVY_EVENTS.includes(h[f + 1]!)) continue;
    if (pick < 0 || h[f]! < h[pick]! || (h[f] === h[pick] && h[f + 3]! < h[pick + 3]!)) pick = f;
  }
  if (pick >= 0) web.ration.set(web.happenings.subarray(pick, pick + HAPPENING_FIELDS));
}

// ------------------------------------------------------- friend groups --

/** The interest most of a group share, or -1. */
function vibeOf(web: Web, members: number[]): number {
  let best = -1;
  let most = 1;
  for (let i = 0; i < 9; i++) {
    let have = 0;
    for (const m of members) if ((web.identity[m]! >>> (18 + i)) & 1) have += 1;
    if (have > most) {
      most = have;
      best = i;
    }
  }
  return best;
}

const isFriend = (kind: number): boolean => kind === KIND.friend || kind === KIND.best || kind === KIND.crush || kind === KIND.roommate;

/**
 * Friend groups (DESIGN.md 63.6): three to six friends, each a friend of at least half the group so far. Formed in an
 * order taken from the week's luck, so no class or hall is first every time; each student in one group at most.
 */
export function findGroups(web: Web): void {
  const { n } = web;
  web.groupOf = new Int32Array(n).fill(-1);
  const starts: number[] = [0];
  const members: number[] = [];
  const vibes: number[] = [];
  const offset = hash5(web.seed, 9995, web.week, 0, 0) % Math.max(1, n);
  const candidates: number[] = [];
  for (let step = 0; step < n; step++) {
    const a = (step + offset) % n;
    if (web.year[a]! < 0 || web.groupOf[a] !== -1) continue;
    candidates.length = 0;
    for (let k = 0; k < SLOTS; k++) {
      const s = a * SLOTS + k;
      const b = web.other[s]!;
      if (b >= 0 && web.groupOf[b] === -1 && isFriend(web.kind[s]!) && web.strength[s]! >= FRIEND_AT) candidates.push(s);
    }
    if (candidates.length < GROUP_MIN - 1) continue;
    candidates.sort((x, y) => web.strength[y]! - web.strength[x]!);
    const group = [a];
    for (const s of candidates) {
      if (group.length >= GROUP_MAX) break;
      const b = web.other[s]!;
      let ties = 0;
      for (const m of group) {
        const t = slotOf(web, b, m);
        if (t >= 0 && isFriend(web.kind[t]!) && web.strength[t]! >= FRIEND_AT) ties += 1;
      }
      if (ties * 2 >= group.length) group.push(b);
    }
    if (group.length < GROUP_MIN) continue;
    for (const m of group) {
      web.groupOf[m] = vibes.length;
      members.push(m);
    }
    starts.push(members.length);
    vibes.push(vibeOf(web, group));
  }
  web.friendGroups = { start: Int32Array.from(starts), members: Int32Array.from(members) };
  web.groupVibe = Uint8Array.from(vibes.map((v) => (v < 0 ? 255 : v)));
}

// ----------------------------------------------------------- the record --

const MAGIC = 0x43545731; // CTW1
const HEADER = 16; // int32s

/**
 * The web as its save record, version 2 (DESIGN.md 63.6): a header, what has happened since it began, the kept weeks'
 * counts and happenings, then each slot's other end, week together, kind, strength and feeling. Version 1 (stop 1)
 * had no weeks kept, and is still read.
 */
export function encodeWeb(web: Web): Uint8Array {
  const slots = web.n * SLOTS;
  const kept = web.happenings.length;
  const bytes = new Uint8Array(HEADER * 4 + EVENTS.length * 8 + web.weekly.length * 8 + kept * 4 + HAPPENING_WEEKS * 8 + HAPPENING_FIELDS * 4 + slots * (4 + 2 + 1 + 1 + 1));
  const head = new Int32Array(bytes.buffer, 0, HEADER);
  head.set([MAGIC, 2, web.seed | 0, web.week, web.classSlot, ...web.ring, web.roomsFor, EVENTS.length, kept, HAPPENING_WEEKS, web.rationFor, 0, 0]);
  let at = HEADER * 4;
  new Float64Array(bytes.buffer, at, EVENTS.length).set(web.events);
  at += EVENTS.length * 8;
  new Float64Array(bytes.buffer, at, web.weekly.length).set(web.weekly);
  at += web.weekly.length * 8;
  new Int32Array(bytes.buffer, at, kept).set(web.happenings);
  at += kept * 4;
  new Int32Array(bytes.buffer, at, HAPPENING_WEEKS).set(web.weeklyWeek);
  at += HAPPENING_WEEKS * 4;
  new Int32Array(bytes.buffer, at, HAPPENING_WEEKS).set(web.weeklyYear);
  at += HAPPENING_WEEKS * 4;
  new Int32Array(bytes.buffer, at, HAPPENING_FIELDS).set(web.ration);
  at += HAPPENING_FIELDS * 4;
  new Int32Array(bytes.buffer, at, slots).set(web.other);
  at += slots * 4;
  new Uint16Array(bytes.buffer, at, slots).set(web.seen);
  at += slots * 2;
  bytes.set(web.kind, at);
  at += slots;
  bytes.set(web.strength, at);
  at += slots;
  bytes.set(web.feeling, at);
  return bytes;
}

/** A web read back from its record for this campus, or null when the record is for another campus or broken. */
export function decodeWeb(bytes: Uint8Array, state: GameState): Web | null {
  if (bytes.byteLength < HEADER * 4) return null;
  const copy = new Uint8Array(bytes);
  const head = new Int32Array(copy.buffer, 0, HEADER);
  const version = head[1];
  if (head[0] !== MAGIC || (version !== 1 && version !== 2) || head[2] !== (state.seed | 0)) return null;
  const classSlot = head[4]!;
  if (classSlot <= 0 || classSlot > 200_000) return null;
  const web = newWeb(state.seed, classSlot);
  const slots = web.n * SLOTS;
  const kept = web.happenings.length;
  const weeks = version === 2 ? web.weekly.length * 8 + kept * 4 + HAPPENING_WEEKS * 8 + HAPPENING_FIELDS * 4 : 0;
  if (head[10] !== EVENTS.length || copy.byteLength !== HEADER * 4 + EVENTS.length * 8 + weeks + slots * 9) return null;
  if (version === 2 && (head[11] !== kept || head[12] !== HAPPENING_WEEKS)) return null;
  web.week = head[3]!;
  web.ring = [head[5]!, head[6]!, head[7]!, head[8]!];
  web.roomsFor = head[9]!;
  let at = HEADER * 4;
  web.events.set(new Float64Array(copy.buffer, at, EVENTS.length));
  at += EVENTS.length * 8;
  if (version === 2) {
    web.weekly.set(new Float64Array(copy.buffer, at, web.weekly.length));
    at += web.weekly.length * 8;
    web.happenings.set(new Int32Array(copy.buffer, at, kept));
    at += kept * 4;
    web.weeklyWeek.set(new Int32Array(copy.buffer, at, HAPPENING_WEEKS));
    at += HAPPENING_WEEKS * 4;
    web.weeklyYear.set(new Int32Array(copy.buffer, at, HAPPENING_WEEKS));
    at += HAPPENING_WEEKS * 4;
    web.ration.set(new Int32Array(copy.buffer, at, HAPPENING_FIELDS));
    at += HAPPENING_FIELDS * 4;
    web.rationFor = head[13]!;
  }
  web.other.set(new Int32Array(copy.buffer, at, slots));
  at += slots * 4;
  web.seen.set(new Uint16Array(copy.buffer, at, slots));
  at += slots * 2;
  web.kind.set(copy.subarray(at, at + slots));
  at += slots;
  web.strength.set(copy.subarray(at, at + slots));
  at += slots;
  web.feeling.set(copy.subarray(at, at + slots));
  // Who is enrolled, then the other ends and the pairs' chemistry, worked out again.
  const year = calendarAt(state.clock).year;
  for (let classYear = 0; classYear < 4; classYear++) {
    const r = ringOf(year - classYear);
    if (web.ring[r] !== year - classYear) continue;
    const size = Math.min(web.classSlot, state.cohorts[classYear] ?? 0);
    for (let index = 0; index < size; index++) web.year[r * web.classSlot + index] = classYear;
  }
  web.placedFor = '';
  const keepRooms = web.roomsFor;
  // Identities first, from the campus, without touching the ties.
  for (let id = 0; id < web.n; id++) {
    if (web.year[id]! < 0) continue;
    const ref = refAt(web, id);
    const p = socialProfile(state, ref);
    if (p) web.identity[id] = (identityOf(web.seed, ref, p.nature) | 0x80000000) >>> 0;
  }
  for (let s = 0; s < slots; s++) {
    const b = web.other[s]!;
    if (b < 0) continue;
    const a = (s / SLOTS) | 0;
    if (b >= web.n || web.year[a]! < 0 || web.year[b]! < 0) {
      clear(web, s);
      continue;
    }
    const back = slotOf(web, b, a);
    if (back < 0) {
      clear(web, s);
      continue;
    }
    web.back[s] = back;
    web.chem[s] = Math.round(pairChem(web, a, b) * 100);
  }
  web.roomsFor = keepRooms;
  return web;
}

// ------------------------------------------------------------ the reads --

export interface TieView {
  ref: StudentRef;
  kind: number;
  strength: number;
  feeling: number;
  /** For a crush: theirs on the other, the other's on them, or both. */
  crushMine: boolean;
  crushTheirs: boolean;
}

/** A student's ties, closest first. */
export function tiesOf(web: Web, ref: StudentRef): TieView[] {
  const id = idOf(web, ref);
  if (id < 0) return [];
  const out: TieView[] = [];
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = web.other[s]!;
    if (b < 0) continue;
    const back = web.back[s]!;
    const mine = web.kind[s] === KIND.crush;
    const theirs = back >= 0 && web.kind[back] === KIND.crush;
    out.push({ ref: refAt(web, b), kind: mine || !theirs ? web.kind[s]! : KIND.friend, strength: web.strength[s]!, feeling: web.feeling[s]!, crushMine: mine, crushTheirs: theirs });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

/** Their roommate in the web, or null. */
export function webRoommate(web: Web, ref: StudentRef): StudentRef | null {
  const id = idOf(web, ref);
  if (id < 0) return null;
  const s = has(web, id, KIND.roommate);
  return s < 0 ? null : refAt(web, web.other[s]!);
}

/** How many of each kind of tie there are, each counted once. */
export function census(web: Web): number[] {
  const kinds = new Array(12).fill(0);
  for (let s = 0; s < web.n * SLOTS; s++) {
    const b = web.other[s]!;
    if (b < 0) continue;
    if (b > ((s / SLOTS) | 0)) kinds[web.kind[s]!] += 1;
  }
  return kinds;
}
