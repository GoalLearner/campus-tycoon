/**
 * PROTOTYPE for measuring (branch social-sim-measure, never merged): every student's identity and ties, and the weekly
 * batch that updates them, on typed arrays. Not the build: the shapes and the costs of what the build would do.
 *
 * Identity, from the seed, 29 bits in one u32 a student:
 *   gender 2 (0 woman, 1 man, 2 nonbinary), attraction 2 (0 to men, 1 to women, 2 to both, 3 to anyone),
 *   seven traits at 0..3 (outgoing, kind, loyal, calm, funny, ambitious, laid-back) 14, nine interests 9, values 2.
 * Ties: twelve slots a student, each the other's id (i32), the kind (u8), the strength (u8), the feeling (u8) and the
 * week last together (u16): 9 bytes a slot, 108 a student. Both ends hold the tie.
 */
import { hashInts } from '../src/sim/rng';
import { placeIndex, socialProfile, type SocialProfile } from '../src/sim/systems/students';
import { athleteShare } from '../src/sim/systems/football';
import { MAJORS, CLUBS } from '../src/sim/config/students';
import type { GameState } from '../src/sim';

export const SLOTS = 12;
export const KIND = { none: 0, met: 1, friend: 2, best: 3, crush: 4, dating: 5, exclusive: 6, longterm: 7, ex: 8, rival: 9, enemy: 10, roommate: 11 } as const;
export const KIND_NAMES = ['', 'acquaintance', 'friend', 'best friend', 'crush', 'dating', 'exclusive', 'long-term', 'ex', 'rival', 'enemy', 'roommate'];
export const FEEL = { warm: 0, tense: 1, complicated: 2 } as const;
export const FEEL_NAMES = ['warm', 'tense', 'complicated'];

const share = (h: number): number => (h >>> 0) / 4294967296;

function mix(h: number, v: number): number {
  h ^= v | 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995);
}
/** hashInts(seed, salt, x, y, z) with no array made: the hot loops call it millions of times. */
function hash5(seed: number, salt: number, x: number, y: number, z: number): number {
  let h = 0x811c9dc5;
  h = mix(h, seed);
  h = mix(h, salt);
  h = mix(h, x);
  h = mix(h, y);
  h = mix(h, z);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Attraction by gender, seeded at the rates Gallup reports for Gen Z (2025) and women at 58% of undergraduates. */
function identity(seed: number, entryYear: number, index: number, nature: string): number {
  const h = (salt: number): number => share(hashInts(seed, 9900, entryYear, index, salt));
  const g = h(1) < 0.56 ? 0 : h(1) < 0.98 ? 1 : 2;
  const a = h(2);
  // Women: 79% to men, 18% to both, 3% to women. Men: 90% to women, 6% to both, 4% to men. Nonbinary: most to anyone.
  const attraction = g === 0 ? (a < 0.79 ? 0 : a < 0.97 ? 2 : 1) : g === 1 ? (a < 0.9 ? 1 : a < 0.96 ? 2 : 0) : a < 0.6 ? 3 : 2;
  let bits = g | (attraction << 2);
  for (let t = 0; t < 7; t++) bits |= Math.min(3, Math.floor(h(10 + t) * 4)) << (4 + 2 * t);
  let interests = 0;
  for (let i = 0; i < 9; i++) if (h(20 + i) < 0.28) interests |= 1 << i;
  // Their nature leans them: a Party Animal parties, a Scholar studies, an athlete plays sport.
  if (nature === 'party') interests |= 1 << 4;
  if (nature === 'scholar' || nature === 'stressed') interests |= 1 << 5;
  if (nature === 'athlete' || nature === 'superfan') interests |= 1 | (1 << 3);
  bits |= interests << 18;
  const values = nature === 'scholar' ? 0 : nature === 'party' ? 1 : Math.floor(h(30) * 4);
  bits |= values << 27;
  return bits >>> 0;
}

const trait = (bits: number, t: number): number => (bits >>> (4 + 2 * t)) & 3;
const popcount = (n: number): number => {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

/** Does a, by their attraction, like b's gender? */
function likes(a: number, b: number): boolean {
  const attraction = (a >>> 2) & 3;
  const g = b & 3;
  return attraction === 3 || attraction === 2 ? true : attraction === 0 ? g === 1 || g === 2 : g === 0 || g === 2;
}

/** Chemistry, -1 to 1: shared interests, values, humour, kindness and calm, less jealousy against flirting. */
function chemistry(a: number, b: number, pair: number): number {
  const shared = popcount((a >>> 18) & (b >>> 18) & 0x1ff);
  const values = ((a >>> 27) & 3) === ((b >>> 27) & 3) ? 0.2 : -0.05;
  const humour = (trait(a, 4) + trait(b, 4)) * 0.04;
  const kind = (trait(a, 1) + trait(b, 1) - 3) * 0.05;
  const clash = Math.abs(trait(a, 3) - trait(b, 3)) * 0.06 + (trait(a, 3) === 0 && trait(b, 2) === 0 ? 0.15 : 0);
  return Math.max(-1, Math.min(1, shared * 0.12 + values + humour + kind - clash + (pair - 0.5) * 0.6));
}

export interface World {
  seed: number;
  classSlot: number;
  n: number;
  /** Who is enrolled: the class year (0..3) or -1. */
  year: Int8Array;
  identity: Uint32Array;
  /** Where they spend time: dorm floor, major and year, club, team, chapter, and a district for dining, rec and parties. */
  place: Int32Array[];
  groups: Array<{ start: Int32Array; members: Int32Array }>;
  other: Int32Array;
  kind: Uint8Array;
  strength: Uint8Array;
  feeling: Uint8Array;
  seen: Uint16Array;
  /** The slot of the same tie at its other end, and the pair's chemistry (-100 to 100), so a repeat meeting needs no search. */
  back: Int32Array;
  chem: Int8Array;
  week: number;
  /** Counts of what happened, for the measure, by EVENTS index. */
  events: Float64Array;
}

export const EVENTS = ['met', 'friends', 'best friends', 'crush, one-sided', 'crush, mutual', 'started dating', 'exclusive', 'long-term', 'breakup, mutual', 'breakup, messy', 'cheating', 'back together', 'rivals', 'enemies', 'love triangle'];

const PLACES = 6;

export function makeWorld(state: GameState, cohorts: readonly number[]): World {
  const classSlot = Math.max(...cohorts) + 1;
  const n = classSlot * 4;
  const world: World = {
    seed: state.seed,
    classSlot,
    n,
    year: new Int8Array(n).fill(-1),
    identity: new Uint32Array(n),
    place: Array.from({ length: PLACES }, () => new Int32Array(n).fill(-1)),
    groups: [],
    other: new Int32Array(n * SLOTS).fill(-1),
    kind: new Uint8Array(n * SLOTS),
    strength: new Uint8Array(n * SLOTS),
    feeling: new Uint8Array(n * SLOTS),
    seen: new Uint16Array(n * SLOTS),
    back: new Int32Array(n * SLOTS).fill(-1),
    chem: new Int8Array(n * SLOTS),
    week: 0,
    events: new Float64Array(EVENTS.length),
  };
  return world;
}

/** The id of a student: their class's ring slot, by entry year, and their place in it. */
export const idOf = (world: World, entryYear: number, index: number): number => (((entryYear % 4) + 4) % 4) * world.classSlot + index;

/** Who is enrolled and where they spend time: once a semester, from the campus. */
export function placeStudents(world: World, state: GameState, year: number, cohorts: readonly number[]): number {
  const t0 = performance.now();
  const housing = placeIndex(state, 'housing');
  const athletes = athleteShare(state);
  world.year.fill(-1);
  const majorIndex = new Map(MAJORS.map((m, i) => [m.name, i]));
  const clubIndex = new Map(CLUBS.map((c, i) => [c.name, i]));
  const chapterIndex = new Map<string, number>();
  const width = state.map.width;
  for (let classYear = 0; classYear < 4; classYear++) {
    const entryYear = year - classYear;
    for (let index = 0; index < cohorts[classYear]!; index++) {
      const id = idOf(world, entryYear, index);
      // A real student's profile: their dorm, major, club, team and chapter, as the card reads them.
      const p: SocialProfile | null = socialProfile(state, { entryYear, index }, housing, athletes);
      world.year[id] = classYear;
      if (world.identity[id] === 0) world.identity[id] = identity(world.seed, entryYear, index, p?.nature ?? 'commuter') | 0x80000000;
      const home = p?.home ?? null;
      // A floor of about two dozen: the model campus's dorms are big, so each has thirty-two.
      world.place[0]![id] = home === null ? -1 : home * 32 + (hashInts(world.seed, entryYear, index, 9911) & 31);
      // A class section of about thirty, a club table of a few dozen, a squad: the small groups that see each other.
      const sections = Math.max(1, Math.round(cohorts[classYear]! / MAJORS.length / 30));
      world.place[1]![id] = ((majorIndex.get(p?.major ?? '') ?? 0) * 4 + classYear) * 64 + (hashInts(world.seed, entryYear, index, 9912) % Math.min(64, sections));
      const tables = Math.max(1, Math.round((cohorts[classYear]! * 4) / CLUBS.length / 40));
      world.place[2]![id] = p?.club ? (clubIndex.get(p.club) ?? 0) * 256 + (hashInts(world.seed, entryYear, index, 9913) % Math.min(256, tables)) : -1;
      world.place[3]![id] = p?.team ? hashInts(world.seed, entryYear, index, 9914) % 8 : -1;
      if (p?.chapter && !chapterIndex.has(p.chapter)) chapterIndex.set(p.chapter, chapterIndex.size);
      world.place[4]![id] = p?.chapter ? chapterIndex.get(p.chapter)! : -1;
      const spot = home ?? 0;
      world.place[5]![id] = Math.floor((spot % width) / 10) * 64 + Math.floor(spot / width / 10);
    }
  }
  // Each place's members, grouped by key: counting sort into one array per place.
  world.groups = world.place.map((keys) => {
    let most = 0;
    for (let i = 0; i < world.n; i++) if (world.year[i]! >= 0 && keys[i]! > most) most = keys[i]!;
    const start = new Int32Array(most + 2);
    for (let i = 0; i < world.n; i++) if (world.year[i]! >= 0 && keys[i]! >= 0) start[keys[i]! + 1]! += 1;
    for (let k = 1; k < start.length; k++) start[k]! += start[k - 1]!;
    const fill = start.slice();
    const members = new Int32Array(start[start.length - 1]!);
    for (let i = 0; i < world.n; i++) if (world.year[i]! >= 0 && keys[i]! >= 0) members[fill[keys[i]!]!++] = i;
    return { start, members };
  });
  return performance.now() - t0;
}

/** A class graduates: their slots empty, and every tie to them goes. */
export function graduate(world: World, entryYear: number): void {
  const lo = idOf(world, entryYear, 0);
  const hi = lo + world.classSlot;
  for (let s = 0; s < world.n * SLOTS; s++) {
    const o = world.other[s]!;
    if ((o >= lo && o < hi) || (Math.floor(s / SLOTS) >= lo && Math.floor(s / SLOTS) < hi)) {
      world.other[s] = -1;
      world.kind[s] = 0;
    }
  }
  for (let i = lo; i < hi; i++) world.identity[i] = 0;
}

function slotOf(world: World, a: number, b: number): number {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) if (world.other[base + k] === b) return base + k;
  return -1;
}

/** A free slot, or the weakest acquaintance's, or -1 when every slot holds something that matters. */
function roomFor(world: World, a: number): number {
  const base = a * SLOTS;
  let weakest = -1;
  let low = 255;
  for (let k = 0; k < SLOTS; k++) {
    const s = base + k;
    if (world.other[s] === -1) return s;
    if (world.kind[s] === KIND.met && world.strength[s]! < low) {
      low = world.strength[s]!;
      weakest = s;
    }
  }
  if (weakest >= 0) {
    // The other end lets go too.
    const back = world.back[weakest]!;
    if (back >= 0) {
      world.other[back] = -1;
      world.kind[back] = 0;
    }
  }
  return weakest;
}

function setBoth(world: World, sa: number, sb: number, kind: number, feeling: number): void {
  world.kind[sa] = kind;
  world.kind[sb] = kind;
  world.feeling[sa] = feeling;
  world.feeling[sb] = feeling;
}

const count = (world: World, what: number): void => {
  world.events[what]! += 1;
};

function partnered(world: World, a: number): number {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) {
    const kd = world.kind[base + k]!;
    if (kd >= KIND.dating && kd <= KIND.longterm) return base + k;
  }
  return -1;
}

/** One encounter: a tie begins or grows, sours, turns romantic, or breaks. Both ends move together. */
function meet(world: World, a: number, b: number, h: number): void {
  let sa = slotOf(world, a, b);
  let sb: number;
  let chem: number;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (sa < 0) {
    chem = chemistry(world.identity[a]!, world.identity[b]!, share(hash5(world.seed, 9920, lo, hi, 0)));
    if (chem < -0.1 && share(h) < 0.6) return;
    sa = roomFor(world, a);
    sb = roomFor(world, b);
    if (sa < 0 || sb < 0) return;
    world.other[sa] = b;
    world.other[sb] = a;
    world.back[sa] = sb;
    world.back[sb] = sa;
    world.chem[sa] = world.chem[sb] = Math.round(chem * 100);
    world.strength[sa] = world.strength[sb] = 8;
    setBoth(world, sa, sb, KIND.met, FEEL.warm);
    count(world, 0);
  } else {
    sb = world.back[sa]!;
    chem = world.chem[sa]! / 100;
  }
  world.seen[sa] = world.seen[sb] = world.week;
  const ka = world.kind[sa]!;
  const kb = world.kind[sb]!;
  let st = world.strength[sa]!;
  // A pair who grate grows sorer: rivals, then enemies. Never cruel: they argue.
  if (ka === KIND.rival || ka === KIND.enemy || (chem < -0.2 && ka === KIND.met)) {
    st = Math.min(100, st + 3);
    const next = st >= 80 ? KIND.enemy : st >= 35 ? KIND.rival : KIND.met;
    if (next !== ka) count(world, next === KIND.enemy ? 13 : 12);
    world.strength[sa] = world.strength[sb] = st;
    setBoth(world, sa, sb, next, next === KIND.met ? FEEL.warm : FEEL.tense);
    return;
  }
  st = Math.max(0, Math.min(100, st + Math.round(2 + 7 * chem)));
  world.strength[sa] = world.strength[sb] = st;
  if (ka === KIND.met && st >= 30) {
    setBoth(world, sa, sb, KIND.friend, FEEL.warm);
    count(world, 1);
  } else if (ka === KIND.friend && st >= 85 && !hasKind(world, a, KIND.best) && !hasKind(world, b, KIND.best)) {
    setBoth(world, sa, sb, KIND.best, FEEL.warm);
    count(world, 2);
  }
  // Romance, between friends: a rare spark, and each must like the other's gender.
  if (st < 30 || ka === KIND.roommate || ka === KIND.ex || (ka >= KIND.dating && ka <= KIND.longterm)) return;
  const spark = share(hash5(world.seed, 9930, lo, hi, 0));
  if (spark < 0.92) return;
  const ia = world.identity[a]!;
  const ib = world.identity[b]!;
  if (likes(ia, ib) && ka !== KIND.crush && !hasKind(world, a, KIND.crush)) {
    world.kind[sa] = KIND.crush;
    world.feeling[sa] = partnered(world, a) >= 0 ? FEEL.complicated : FEEL.warm;
    count(world, kb === KIND.crush ? 4 : 3);
    // Two with a crush on the same person: a love triangle.
    if (crushedBy(world, b) >= 2) count(world, 14);
  }
  if (likes(ib, ia) && kb !== KIND.crush && spark > 0.945 && !hasKind(world, b, KIND.crush)) {
    world.kind[sb] = KIND.crush;
    world.feeling[sb] = partnered(world, b) >= 0 ? FEEL.complicated : FEEL.warm;
    count(world, world.kind[sa] === KIND.crush ? 4 : 3);
  }
  // Both with a crush, close enough, an evening together: they start dating, if both are free, or one cheats.
  if (world.kind[sa] === KIND.crush && world.kind[sb] === KIND.crush && st >= 45 && share(h >>> 5) < 0.35) {
    if (!freeOrCheats(world, a, h) || !freeOrCheats(world, b, h >>> 2)) return;
    setBoth(world, sa, sb, KIND.dating, FEEL.warm);
    count(world, 5);
  }
}

/** True when they are single, or taken and flirty enough to cheat: then the couple they were in ends messily. */
function freeOrCheats(world: World, who: number, h: number): boolean {
  const held = partnered(world, who);
  if (held < 0) return true;
  if (trait(world.identity[who]!, 2) !== 0 || share(h >>> 9) >= 0.25) return false;
  const back = world.back[held]!;
  world.kind[held] = KIND.ex;
  world.feeling[held] = FEEL.tense;
  if (back >= 0) {
    world.kind[back] = KIND.ex;
    world.feeling[back] = FEEL.tense;
  }
  count(world, 10);
  count(world, 9);
  return true;
}

function hasKind(world: World, a: number, kind: number): boolean {
  const base = a * SLOTS;
  for (let k = 0; k < SLOTS; k++) if (world.kind[base + k] === kind && world.other[base + k]! >= 0) return true;
  return false;
}

/** How many have a crush on b: their slots for b say crush. */
function crushedBy(world: World, b: number): number {
  let n = 0;
  const base = b * SLOTS;
  for (let k = 0; k < SLOTS; k++) {
    if (world.other[base + k]! < 0) continue;
    const back = world.back[base + k]!;
    if (back >= 0 && world.kind[back] === KIND.crush) n += 1;
  }
  return n;
}

/**
 * The week's end, each end of each tie on its own: both ends hold the same strength and the same week together, and
 * every roll here is the pair's, so the two ends come out the same without finding each other.
 */
function settle(world: World): void {
  const week = world.week;
  const total = world.n * SLOTS;
  for (let s = 0; s < total; s++) {
    const b = world.other[s]!;
    if (b === -1) continue;
    const a = (s / SLOTS) | 0;
    const kind = world.kind[s]!;
    let st = world.strength[s]!;
    if (world.seen[s] !== week) {
      const fade = kind === KIND.met ? 3 : kind === KIND.roommate ? 0 : kind === KIND.ex || kind === KIND.rival ? 2 : kind === KIND.crush ? 2 : 1;
      st = st > fade ? st - fade : 0;
      world.strength[s] = st;
    }
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (kind >= KIND.dating && kind <= KIND.longterm) {
      const h = share(hash5(world.seed, 9940, lo, hi, week));
      if (st < 30 || h < (kind === KIND.longterm ? 0.004 : kind === KIND.exclusive ? 0.01 : 0.02)) {
        world.kind[s] = KIND.ex;
        world.feeling[s] = h < 0.5 * (kind === KIND.longterm ? 0.004 : 0.02) ? FEEL.complicated : FEEL.tense;
        world.strength[s] = 40;
        if (a === lo) count(world, world.feeling[s] === FEEL.complicated ? 8 : 9);
      } else if (kind === KIND.dating && st >= 70) {
        world.kind[s] = KIND.exclusive;
        if (a === lo) count(world, 6);
      } else if (kind === KIND.exclusive && st >= 95) {
        world.kind[s] = KIND.longterm;
        if (a === lo) count(world, 7);
      }
    } else if (kind === KIND.ex && world.seen[s] === week && a === lo) {
      // On and off: exes who keep seeing each other, both free, may get back together.
      const h = share(hash5(world.seed, 9950, lo, hi, week));
      if (h < 0.03 && partnered(world, a) < 0 && partnered(world, b) < 0) {
        const back = world.back[s]!;
        if (back >= 0) {
          setBoth(world, s, back, KIND.dating, FEEL.complicated);
          world.strength[s] = world.strength[back] = 50;
          count(world, 11);
        }
      }
    } else if ((kind === KIND.friend || kind === KIND.best) && st < 25) world.kind[s] = KIND.met;
    else if (kind === KIND.crush && st < 20) world.kind[s] = KIND.friend;
    if (st === 0 && (kind === KIND.met || kind === KIND.ex || kind === KIND.rival || kind === KIND.crush)) {
      world.other[s] = -1;
      world.kind[s] = 0;
    }
  }
}

/** Where an encounter happens, by share: the dorm floor, a class section, a club table, a team, a chapter, and a district's dining, rec and parties. */
const WHERE = [0.28, 0.24, 0.14, 0.06, 0.06, 0.22];
/** The share of encounters spent with someone they already know, the closer the likelier. */
const KNOWN = 0.45;

/** One game week for everyone: `per` encounters each, then the week's settling. */
export function weekBatch(world: World, per: number): void {
  world.week += 1;
  const { seed, n } = world;
  const week = world.week;
  for (let a = 0; a < n; a++) {
    if (world.year[a]! < 0) continue;
    // Outgoing students meet more people.
    const encounters = per + trait(world.identity[a]!, 0) - 1;
    for (let e = 0; e < encounters; e++) {
      const h = hash5(seed, 9960, week, a, e);
      let b = -1;
      if (share(h) < KNOWN) {
        // Someone they know: the stronger of two picked at random.
        const s1 = a * SLOTS + ((h >>> 3) % SLOTS);
        const s2 = a * SLOTS + ((h >>> 11) % SLOTS);
        const pick = world.other[s2]! >= 0 && world.strength[s2]! > world.strength[s1]! ? s2 : s1;
        b = world.other[pick]!;
        if (b >= 0 && world.year[b]! < 0) b = -1;
      }
      if (b < 0) {
        let r = share(hash5(seed, 9961, week, a, e));
        let p = 0;
        while (p < PLACES - 1 && r >= WHERE[p]!) {
          r -= WHERE[p]!;
          p += 1;
        }
        const key = world.place[p]![a]!;
        if (key < 0) continue;
        const group = world.groups[p]!;
        const from = group.start[key]!;
        const size = group.start[key + 1]! - from;
        if (size < 2) continue;
        b = group.members[from + ((h >>> 7) % size)]!;
      }
      if (b === a || b < 0) continue;
      meet(world, a, b, h);
    }
  }
  settle(world);
}

/** Roommates: two of a dorm floor, paired once a year, who love or hate sharing. */
export function pairRoommates(world: World): void {
  const group = world.groups[0]!;
  for (let key = 0; key + 1 < group.start.length; key++) {
    const from = group.start[key]!;
    const to = group.start[key + 1]!;
    // Paired within a gender, as most dorms pair them: each waits for the next of theirs on the floor.
    const waiting = [-1, -1, -1];
    for (let i = from; i < to; i++) {
      const one = group.members[i]!;
      const g = world.identity[one]! & 3;
      if (waiting[g]! < 0) {
        waiting[g] = one;
        continue;
      }
      const a = waiting[g]!;
      const b = one;
      waiting[g] = -1;
      if (slotOf(world, a, b) >= 0) continue;
      const sa = roomFor(world, a);
      const sb = roomFor(world, b);
      if (sa < 0 || sb < 0) continue;
      world.other[sa] = b;
      world.other[sb] = a;
      world.back[sa] = sb;
      world.back[sb] = sa;
      const chem = chemistry(world.identity[a]!, world.identity[b]!, share(hash5(world.seed, 9920, Math.min(a, b), Math.max(a, b), 0)));
      world.chem[sa] = world.chem[sb] = Math.round(chem * 100);
      world.strength[sa] = world.strength[sb] = 40;
      setBoth(world, sa, sb, KIND.roommate, chem < -0.1 ? FEEL.tense : FEEL.warm);
    }
  }
}

export function bytes(world: World): Record<string, number> {
  const groups = world.groups.reduce((sum, g) => sum + g.start.byteLength + g.members.byteLength, 0);
  return {
    identity: world.identity.byteLength,
    year: world.year.byteLength,
    places: world.place.reduce((sum, p) => sum + p.byteLength, 0),
    groups,
    ties: world.other.byteLength + world.kind.byteLength + world.strength.byteLength + world.feeling.byteLength + world.seen.byteLength + world.back.byteLength + world.chem.byteLength,
  };
}

/** The ties as they would be saved: each once, as eight bytes, base64. */
export function savedTies(world: World): { ties: number; base64: number; json: number } {
  let ties = 0;
  const json: Array<[number, number, number, number, number]> = [];
  for (let s = 0; s < world.n * SLOTS; s++) {
    const b = world.other[s]!;
    if (b < 0 || b < Math.floor(s / SLOTS)) continue;
    ties += 1;
    if (json.length < 200_000) json.push([Math.floor(s / SLOTS), b, world.kind[s]!, world.strength[s]!, world.feeling[s]!]);
  }
  const perTie = JSON.stringify(json).length / Math.max(1, json.length);
  return { ties, base64: Math.ceil((ties * 8 * 4) / 3), json: Math.round(perTie * ties) };
}

/**
 * A long absence: the web grown again from the seed, as it would stand after years together, without the years.
 * Each student is tied to the floor-mates, section-mates and club-mates they get on with best, closer the older they
 * are; a share of the single ones who like each other are couples. Then the last weeks are lived in full.
 */
export function seedWeb(world: World): void {
  world.other.fill(-1);
  world.kind.fill(0);
  world.back.fill(-1);
  pairRoommates(world);
  const { seed, n } = world;
  for (let a = 0; a < n; a++) {
    if (world.year[a]! < 0) continue;
    const years = world.year[a]!;
    for (const [p, tries] of [[0, 6], [1, 5], [2, 4]] as const) {
      const key = world.place[p]![a]!;
      if (key < 0) continue;
      const group = world.groups[p]!;
      const from = group.start[key]!;
      const size = group.start[key + 1]! - from;
      if (size < 2) continue;
      for (let t = 0; t < tries; t++) {
        const b = group.members[from + (hash5(seed, 9970, a, p, t) % size)]!;
        if (b === a || b < a || slotOf(world, a, b) >= 0) continue;
        const lo = a;
        const hi = b;
        const chem = chemistry(world.identity[a]!, world.identity[b]!, share(hash5(seed, 9920, lo, hi, 0)));
        if (chem < 0) continue;
        const sa = roomFor(world, a);
        const sb = roomFor(world, b);
        if (sa < 0 || sb < 0) continue;
        world.other[sa] = b;
        world.other[sb] = a;
        world.back[sa] = sb;
        world.back[sb] = sa;
        world.chem[sa] = world.chem[sb] = Math.round(chem * 100);
        const st = Math.min(95, Math.round(15 + 40 * chem + 8 * Math.min(years, world.year[b]!)));
        world.strength[sa] = world.strength[sb] = st;
        world.seen[sa] = world.seen[sb] = world.week;
        const spark = share(hash5(seed, 9930, lo, hi, 0));
        const couple = spark > 0.93 && likes(world.identity[a]!, world.identity[b]!) && likes(world.identity[b]!, world.identity[a]!) && partnered(world, a) < 0 && partnered(world, b) < 0;
        setBoth(world, sa, sb, couple ? (st >= 70 ? KIND.longterm : KIND.dating) : st >= 30 ? KIND.friend : KIND.met, FEEL.warm);
      }
    }
  }
}
