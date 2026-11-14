import {
  ARGUMENTS,
  ASK_CHANCE,
  ASK_OUT_AT,
  BEST_AT,
  BOND_PULL,
  BREAKUP_BELOW,
  BREAKUP_PER_DAY,
  CAMPUS_HIGH,
  CAMPUS_LOW,
  CLASH_BELOW,
  CONTACT_RATE,
  CRUSH_FROM,
  EX_AT,
  EX_AVOID,
  FADE_PER_DAY,
  FORGET_BELOW,
  FRIEND_AT,
  GROUP_AT,
  GROUP_MOST,
  GROW,
  HOUR_PULL,
  MET_AT,
  NEWS_KEPT,
  REGULAR_POOL,
  REGULARS_MOST,
  REGULARS_PER_CLASS,
  RIVAL_AT,
  RIVAL_MEET,
  ROOMMATE_PULL,
  SHARED,
  SOCIAL_STEP,
  SPARK_ABOVE,
  TALKS_KEPT,
  VIBES,
  YES_SHARE,
  type TalkTone,
  type VibeId,
} from '../config/social';
import { calendarAt } from '../calendar';
import { TICKS_PER_DAY } from '../config/time';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, Regular, Social, SocialRef, Talk, Tie, TieKind } from '../types';
import { athleteShare } from './football';
import { classYearOf, placeIndex, sampleStudents, socialLife, socialProfile, studentHome, type PlaceIndex, type SocialProfile } from './students';
import { offCampusNow } from './town';

/**
 * The social campus (DESIGN.md 62). A handful of named regulars in every
 * entering class (13.5), stored in the save, with the ties between them:
 * acquaintances, friends, a best friend, roommates, a crush, a couple, rivals
 * and exes. Once a real hour each pair may spend time together, more likely
 * the more they share (a dorm, a class, a major, a club, a team, a chapter),
 * the closer they are, the livelier the campus and the busier the hour. Time
 * together brings friends closer and makes a clashing pair sorer; a real day
 * apart fades them. Everything is rolled from the seed, the pair and the hour,
 * never from the game's random streams, and nothing here moves a campus number.
 *
 * Everyone else gets friends worked out from the seed when their card is open
 * (`seededFriends`): the same each time, and never stored.
 */

export function newSocial(): Social {
  return { regulars: [], ties: [], news: [], lastDay: -1, level: 0.5 };
}

/** One number for a student, for hashing and for keys. */
export const socialKey = (ref: SocialRef): number => ref.entryYear * 100_000 + ref.index;
export const sameStudent = (a: SocialRef, b: SocialRef): boolean => a.entryYear === b.entryYear && a.index === b.index;
const refOf = (ref: SocialRef): SocialRef => ({ entryYear: ref.entryYear, index: ref.index });
const roll = (state: GameState, ...salt: number[]): number => (hashInts(state.seed, 7300, ...salt) % 100_000) / 100_000;

function mix(h: number, v: number): number {
  h ^= v | 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995);
}

/** hashInts(seed, 7300, 7, low, high, step) as a share, for the hourly roll of every pair, without the arrays. */
function pairRoll(seed: number, low: number, high: number, step: number): number {
  let h = 0x811c9dc5;
  h = mix(h, seed);
  h = mix(h, 7300);
  h = mix(h, 7);
  h = mix(h, low);
  h = mix(h, high);
  h = mix(h, step);
  return (((h ^ (h >>> 15)) >>> 0) % 100_000) / 100_000;
}

/** One number for a pair of students, the lower key first. */
const pairKey = (p: number, q: number): number => (p < q ? p * 10_000_000 + q : q * 10_000_000 + p);
const clamp = (n: number, low = 0, high = 100): number => Math.max(low, Math.min(high, n));

/** The other end of a tie. */
export function otherEnd(tie: Tie, ref: SocialRef): SocialRef {
  return sameStudent(tie.a, ref) ? tie.b : tie.a;
}

export function isRegular(state: GameState, ref: SocialRef): boolean {
  return state.social?.regulars.some((one) => sameStudent(one.ref, ref)) ?? false;
}

export function tieBetween(state: GameState, a: SocialRef, b: SocialRef): Tie | undefined {
  return state.social?.ties.find((tie) => (sameStudent(tie.a, a) && sameStudent(tie.b, b)) || (sameStudent(tie.a, b) && sameStudent(tie.b, a)));
}

/** True when the crush is `ref`'s own, on the other. */
export function crushIsTheirs(tie: Tie, ref: SocialRef): boolean {
  return tie.kind === 'crush' && (sameStudent(tie.a, ref) ? tie.aFirst === true : tie.aFirst === false);
}

// -------------------------------------------------------------- the reads --

/** How much two students share, in the points of SHARED: a class, a dorm, a major, a club, a team, a chapter. */
export function sharedBy(p: SocialProfile, q: SocialProfile): number {
  let w = 0;
  if (p.classYear === q.classYear) w += SHARED.year;
  if (p.home !== null && p.home === q.home && !p.housed && !q.housed) w += SHARED.dorm;
  if (p.major === q.major) w += SHARED.major;
  else if (p.field === q.field) w += SHARED.field;
  if (p.club !== null && p.club === q.club) w += SHARED.club;
  if (p.team && q.team) w += SHARED.team;
  if (p.chapter !== null && p.chapter === q.chapter) w += SHARED.chapter;
  return w;
}

/** Natures that pull together, and natures that grate (DESIGN.md 62): never cruel, just a bad fit. */
const CLASHES: ReadonlyArray<readonly [string, string]> = [
  ['scholar', 'slacker'],
  ['scholar', 'party'],
  ['stressed', 'clown'],
  ['stressed', 'party'],
  ['athlete', 'slacker'],
  ['ra', 'party'],
  ['attention', 'attention'],
];

const CLASH = new Set(CLASHES.flatMap(([x, y]) => [`${x}|${y}`, `${y}|${x}`]));

/** How well two students get on, 0 to 1: half their natures, half the seed of the pair. */
export function compatibility(state: GameState, p: SocialProfile, q: SocialProfile, kp: number, kq: number): number {
  const [low, high] = kp < kq ? [kp, kq] : [kq, kp];
  const pair = roll(state, 1, low, high);
  let natures = 0.6;
  if (p.nature === q.nature && p.nature !== 'attention') natures = 0.9;
  if (CLASH.has(`${p.nature}|${q.nature}`)) natures = 0.05;
  return clamp(0.5 * natures + 0.5 * pair, 0, 1);
}

/** The spark between a pair, 0 to 1, the same always: only the rare high ones ever become a crush. */
function spark(state: GameState, kp: number, kq: number): number {
  const [low, high] = kp < kq ? [kp, kq] : [kq, kp];
  return roll(state, 2, low, high);
}

/** How busy the hour of the player's day is for meeting people. */
export function hourShare(hour: number): number {
  for (const [from, to, share] of HOUR_PULL) if (hour >= from && hour < to) return share;
  return 0;
}

/** The rooms of a hall are shared once it has grown to its second stage and the campus's dorms are more than half full. */
export function roomsShared(state: GameState, home: number): boolean {
  const hall = state.map.buildings[state.map.cells[home]?.buildingId ?? -1];
  if (!hall || hall.stage < 2) return false;
  const beds = openCapacity(state, 'housing');
  const residents = Math.max(0, enrollment(state) - offCampusNow(state));
  return beds > 0 && residents / beds > 0.5;
}

// ------------------------------------------------------------- the news --

function tell(state: GameState, who: SocialRef[], text: string): void {
  const news = state.social.news;
  news.push({ tick: state.clock.tick, who: who.map(refOf), text });
  if (news.length > NEWS_KEPT) news.splice(0, news.length - NEWS_KEPT);
}

// ------------------------------------------------------- the regulars --

interface Person {
  regular: Regular;
  profile: SocialProfile;
  key: number;
}

function people(state: GameState, housing: PlaceIndex): Person[] {
  const out: Person[] = [];
  const athletes = athleteShare(state);
  for (const regular of state.social.regulars) {
    const profile = socialProfile(state, regular.ref, housing, athletes);
    if (profile) out.push({ regular, profile, key: socialKey(regular.ref) });
  }
  return out;
}

/** Ties a regular begins with: those they share most with know them already, more so in the older classes. */
function seedTies(state: GameState, fresh: Person, others: Person[]): void {
  for (const one of others) {
    if (tieBetween(state, fresh.regular.ref, one.regular.ref)) continue;
    const w = sharedBy(fresh.profile, one.profile);
    if (w < SHARED.year) continue;
    const compat = compatibility(state, fresh.profile, one.profile, fresh.key, one.key);
    const years = Math.min(fresh.profile.classYear, one.profile.classYear);
    let kind: TieKind = 'met';
    let strength = MET_AT + 4 * w;
    if (compat < CLASH_BELOW && w >= 1.2) {
      kind = 'rival';
      strength = RIVAL_AT + 5;
    } else if (w >= 1.2) {
      kind = 'friend';
      strength = clamp(FRIEND_AT + 30 * compat + 6 * years + 4 * (w - 1.2), FRIEND_AT, 85);
    }
    state.social.ties.push({ a: refOf(fresh.regular.ref), b: refOf(one.regular.ref), kind, strength: Math.round(strength), since: state.clock.tick, seen: state.clock.tick });
  }
  // Two who arrived together seeded as a couple, and share a class or more, are one.
  if (fresh.profile.kind === 'together') {
    const partnered = (person: Person): boolean => state.social.ties.some((tie) => tie.kind === 'partner' && (sameStudent(tie.a, person.regular.ref) || sameStudent(tie.b, person.regular.ref)));
    const match = others.find((one) => one.profile.kind === 'together' && !partnered(one) && sharedBy(fresh.profile, one.profile) >= SHARED.year && !roommates(state, fresh.regular.ref, one.regular.ref));
    if (match && !partnered(fresh)) {
      const tie = tieBetween(state, fresh.regular.ref, match.regular.ref)!;
      if (tie) {
        tie.kind = 'partner';
        tie.strength = 60;
      }
    }
  }
}

function roommates(state: GameState, a: SocialRef, b: SocialRef): boolean {
  return tieBetween(state, a, b)?.kind === 'roommate';
}

/** Make a student a regular, with the ties they begin with. False when the regulars are full or they are one already. */
export function addRegular(state: GameState, ref: SocialRef, housing: PlaceIndex = placeIndex(state, 'housing'), force = false): boolean {
  const social = state.social;
  if (isRegular(state, ref)) return false;
  if (!force && social.regulars.length >= REGULARS_MOST) return false;
  const profile = socialProfile(state, ref, housing);
  if (!profile) return false;
  const regular: Regular = { ref: refOf(ref), since: state.clock.tick, day: social.lastDay, talks: [] };
  const others = people(state, housing);
  social.regulars.push(regular);
  seedTies(state, { regular, profile, key: socialKey(ref) }, others);
  return true;
}

/** Each enrolled class has its regulars: picked from its first students, each sharing something with one picked before. */
function fillClasses(state: GameState, housing: PlaceIndex): void {
  const social = state.social;
  // The calendar's year, as every student read uses: not the week's, which runs ahead of it before the first intake.
  const year = calendarAt(state.clock).year;
  for (let classYear = 0; classYear < 4; classYear++) {
    const entryYear = year - classYear;
    const size = state.cohorts[classYear] ?? 0;
    if (size < 4) continue;
    const have = social.regulars.filter((one) => one.ref.entryYear === entryYear);
    if (have.length >= REGULARS_PER_CLASS || social.regulars.length >= REGULARS_MOST) continue;
    const pool = Math.min(size, REGULAR_POOL);
    const order: number[] = [];
    for (let index = 0; index < pool; index++) order.push(index);
    order.sort((x, y) => hashInts(state.seed, 7211, entryYear, x) - hashInts(state.seed, 7211, entryYear, y));
    const picked: SocialProfile[] = have.map((one) => socialProfile(state, one.ref, housing)).filter((one): one is SocialProfile => one !== null);
    const take: SocialRef[] = [];
    // Twice through: first only those who share something with a pick, then anyone, so a class always fills.
    for (const pass of [true, false]) {
      for (const index of order) {
        if (have.length + take.length >= REGULARS_PER_CLASS) break;
        const ref = { entryYear, index };
        if (isRegular(state, ref) || take.some((one) => sameStudent(one, ref))) continue;
        const profile = socialProfile(state, ref, housing);
        if (!profile) continue;
        if (pass && picked.length > 0 && !picked.some((one) => sharedBy(one, profile) > SHARED.year)) continue;
        picked.push(profile);
        take.push(ref);
      }
    }
    for (const ref of take) addRegular(state, ref, housing);
  }
}

/** Regulars who graduated or left go, and their ties with them. The Main Character stays a regular while they are one. */
function prune(state: GameState): void {
  const social = state.social;
  const gone = social.regulars.filter((one) => classYearOf(state, one.ref) === null);
  if (gone.length === 0) return;
  social.regulars = social.regulars.filter((one) => !gone.includes(one));
  social.ties = social.ties.filter((tie) => !gone.some((one) => sameStudent(one.ref, tie.a) || sameStudent(one.ref, tie.b)));
}

// ----------------------------------------------------------- roommates --

/** Regulars in a shared room have a roommate: another regular in their hall, or a hallmate who becomes one. */
function placeRoommates(state: GameState, housing: PlaceIndex, list: Person[]): void {
  const social = state.social;
  for (const person of list) {
    const { profile, regular } = person;
    const own = social.ties.find((tie) => tie.kind === 'roommate' && (sameStudent(tie.a, regular.ref) || sameStudent(tie.b, regular.ref)));
    const shared = profile.home !== null && !profile.housed && roomsShared(state, profile.home);
    if (own) {
      const mate = list.find((one) => sameStudent(one.regular.ref, otherEnd(own, regular.ref)));
      if (!shared || !mate || mate.profile.home !== profile.home || mate.profile.housed) {
        // Moved out, or the rooms are single again: still friends if they were close.
        own.kind = own.strength >= FRIEND_AT ? 'friend' : 'met';
        own.since = state.clock.tick;
      }
      continue;
    }
    if (!shared) continue;
    const free = (one: Person): boolean => !social.ties.some((tie) => tie.kind === 'roommate' && (sameStudent(tie.a, one.regular.ref) || sameStudent(tie.b, one.regular.ref)));
    let mate = list.find((one) => one !== person && one.profile.home === profile.home && !one.profile.housed && free(one) && !partners(state, one.regular.ref, regular.ref));
    if (!mate && social.regulars.length < REGULARS_MOST) {
      // A hallmate, chosen from the seed, joins the regulars.
      const hall = sampleStudents(state, 120).filter((ref) => !isRegular(state, ref) && studentHome(state, ref, housing) === profile.home);
      if (hall.length > 0) {
        const ref = hall[hashInts(state.seed, 7221, socialKey(regular.ref)) % hall.length]!;
        if (addRegular(state, ref, housing)) {
          const added = socialProfile(state, ref, housing);
          if (added && !added.housed) {
            const fresh = { regular: social.regulars[social.regulars.length - 1]!, profile: added, key: socialKey(ref) };
            list.push(fresh);
            mate = fresh;
          }
        }
      }
    }
    if (!mate) continue;
    const compat = compatibility(state, profile, mate.profile, person.key, mate.key);
    const tie = tieBetween(state, regular.ref, mate.regular.ref);
    const strength = Math.round(clamp(35 + 25 * compat, 20, 70));
    if (tie) {
      tie.kind = 'roommate';
      tie.strength = Math.max(tie.strength, strength);
      tie.since = state.clock.tick;
    } else social.ties.push({ a: refOf(regular.ref), b: refOf(mate.regular.ref), kind: 'roommate', strength, since: state.clock.tick, seen: state.clock.tick });
    tell(state, [regular.ref, mate.regular.ref], `${profile.firstName} and ${mate.profile.firstName} are roommates.`);
  }
}

function partners(state: GameState, a: SocialRef, b: SocialRef): boolean {
  return tieBetween(state, a, b)?.kind === 'partner';
}

function hasPartner(state: GameState, ref: SocialRef): boolean {
  return state.social.ties.some((tie) => tie.kind === 'partner' && (sameStudent(tie.a, ref) || sameStudent(tie.b, ref)));
}

function hasCrush(state: GameState, ref: SocialRef): boolean {
  return state.social.ties.some((tie) => tie.kind === 'crush' && (sameStudent(tie.a, ref) || sameStudent(tie.b, ref)));
}

/** The Main Character's romances are their story's to tell (DESIGN.md 58): the graph never starts or ends one. */
function isMain(state: GameState, ref: SocialRef): boolean {
  const mc = state.story?.mc;
  return !!mc && sameStudent(mc.ref, ref);
}

// ------------------------------------------------------ an hour together --

function talk(regular: Regular, day: number, entry: Talk): void {
  if (regular.day !== day) {
    regular.day = day;
    regular.talks = [];
  }
  regular.talks.push(entry);
  if (regular.talks.length > TALKS_KEPT) regular.talks.splice(0, regular.talks.length - TALKS_KEPT);
}

/** How friends spend an hour, by the hour: a meal, studying in the same major, or just laughing. */
function friendlyTone(hour: number, sameMajor: boolean): TalkTone {
  if ((hour >= 4.5 && hour < 6) || (hour >= 10 && hour < 11.5)) return 'ate';
  if (sameMajor && hour >= 2 && hour < 9) return 'studied';
  return 'laughed';
}

/** Who has a partner and who has a crush, by key, for one hour's pairs: kept in step as ties change. */
interface Taken {
  partnered: Set<number>;
  crushing: Set<number>;
}

function together(state: GameState, x: Person, y: Person, tie: Tie | undefined, hour: number, day: number, step: number, taken: Taken): Tie {
  const tick = state.clock.tick;
  const compat = compatibility(state, x.profile, y.profile, x.key, y.key);
  const sameMajor = x.profile.major === y.profile.major;
  const evening = hour >= 9 && hour < 13;
  let tone: TalkTone = friendlyTone(hour, sameMajor);
  let about: string | undefined;
  const names = `${x.profile.firstName} and ${y.profile.firstName}`;
  if (!tie) {
    tie = { a: refOf(x.regular.ref), b: refOf(y.regular.ref), kind: 'met', strength: MET_AT, since: tick, seen: tick };
    state.social.ties.push(tie);
    tone = 'met';
  } else {
    switch (tie.kind) {
      case 'met':
        if (compat < CLASH_BELOW) {
          tie.strength = clamp(tie.strength + GROW * (1 - compat) * 0.7);
          tone = 'argued';
          if (tie.strength >= RIVAL_AT) {
            tie.kind = 'rival';
            tie.since = tick;
            tell(state, [x.regular.ref, y.regular.ref], `${names} rub each other the wrong way. Rivals now.`);
          }
        } else {
          tie.strength = clamp(tie.strength + GROW * (0.4 + compat));
          if (tie.strength >= FRIEND_AT) {
            tie.kind = 'friend';
            tie.since = tick;
            tell(state, [x.regular.ref, y.regular.ref], `${names} are friends now.`);
          }
        }
        break;
      case 'friend': {
        const before = tie.strength;
        tie.strength = clamp(tie.strength + GROW * (0.4 + compat) * 0.8);
        if (before < BEST_AT && tie.strength >= BEST_AT) tell(state, [x.regular.ref, y.regular.ref], `${names} are close friends now.`);
        // A rare spark between two single friends who are not roommates becomes a crush.
        const single = (p: Person): boolean => p.profile.kind !== 'distance' && !isMain(state, p.regular.ref) && !taken.partnered.has(p.key) && !taken.crushing.has(p.key);
        if (tie.strength >= CRUSH_FROM && spark(state, x.key, y.key) >= SPARK_ABOVE && single(x) && single(y)) {
          taken.crushing.add(x.key);
          taken.crushing.add(y.key);
          tie.kind = 'crush';
          tie.aFirst = roll(state, 3, x.key, y.key) < 0.5;
          tie.since = tick;
          const [who, on] = sameStudent(tie.a, x.regular.ref) === tie.aFirst ? [x, y] : [y, x];
          tell(state, [who.regular.ref, on.regular.ref], `${who.profile.firstName} has a crush on ${on.profile.firstName}.`);
          tone = 'awkward';
        }
        break;
      }
      case 'roommate':
        if (compat < CLASH_BELOW) {
          tone = 'argued';
          about = 'the dishes';
          tie.strength = clamp(tie.strength - 2, 10);
        } else {
          tone = 'roommate';
          tie.strength = clamp(tie.strength + GROW * 0.5 * (0.4 + compat));
        }
        break;
      case 'crush': {
        tone = 'awkward';
        tie.strength = clamp(tie.strength + GROW * 0.6);
        // An evening together, and close enough: the one with the crush asks the other out.
        if (evening && tie.strength >= ASK_OUT_AT && roll(state, 4, x.key, y.key, step) < ASK_CHANCE) {
          const [who, on] = sameStudent(tie.a, x.regular.ref) === tie.aFirst ? [x, y] : [y, x];
          if (roll(state, 5, x.key, y.key, step) < YES_SHARE) {
            taken.partnered.add(x.key);
            taken.partnered.add(y.key);
            tie.kind = 'partner';
            tie.since = tick;
            delete tie.aFirst;
            tone = 'date';
            tell(state, [who.regular.ref, on.regular.ref], `${who.profile.firstName} asked ${on.profile.firstName} out. They are a couple now.`);
          } else {
            tie.kind = 'friend';
            tie.since = tick;
            delete tie.aFirst;
            tie.strength = clamp(tie.strength - 12);
            tell(state, [who.regular.ref, on.regular.ref], `${who.profile.firstName} asked ${on.profile.firstName} out. ${on.profile.firstName} said no, kindly. Still friends.`);
          }
        }
        break;
      }
      case 'partner':
        tone = evening ? 'date' : 'laughed';
        tie.strength = clamp(tie.strength + GROW * 0.7);
        break;
      case 'rival':
        tone = 'argued';
        about = ARGUMENTS[hashInts(state.seed, 7305, x.key, y.key, step) % ARGUMENTS.length]!;
        tie.strength = clamp(tie.strength + 3, 0, 80);
        break;
      case 'ex':
        tone = 'avoided';
        tie.strength = clamp(tie.strength - 2);
        break;
    }
  }
  tie.seen = tick;
  talk(x.regular, day, { with: refOf(y.regular.ref), tone, ...(about ? { about } : {}), tick });
  talk(y.regular, day, { with: refOf(x.regular.ref), tone, ...(about ? { about } : {}), tick });
  return tie;
}

/** A new real day: ties not seen fade, couples may part, the faint are forgotten, and the day's talks begin again. */
function newDay(state: GameState, list: Person[], day: number): void {
  const social = state.social;
  const tick = state.clock.tick;
  social.level = socialLife(state);
  const named = new Map(list.map((one) => [one.key, one.profile.firstName]));
  const name = (ref: SocialRef): string => named.get(socialKey(ref)) ?? 'Someone';
  for (const tie of social.ties) {
    const apart = tick - tie.seen >= TICKS_PER_DAY * 0.8;
    if (apart) tie.strength = clamp(tie.strength - FADE_PER_DAY[tie.kind]);
    if (tie.kind === 'friend' && tie.strength < FRIEND_AT) {
      tie.kind = 'met';
      tie.since = tick;
    } else if (tie.kind === 'crush' && tie.strength < CRUSH_FROM - 8) {
      tie.kind = 'friend';
      delete tie.aFirst;
      tie.since = tick;
    } else if (tie.kind === 'partner' && !isMain(state, tie.a) && !isMain(state, tie.b)) {
      const [low, high] = socialKey(tie.a) < socialKey(tie.b) ? [socialKey(tie.a), socialKey(tie.b)] : [socialKey(tie.b), socialKey(tie.a)];
      if (tie.strength < BREAKUP_BELOW || roll(state, 6, low, high, day) < BREAKUP_PER_DAY) {
        tie.kind = 'ex';
        tie.strength = EX_AT;
        tie.since = tick;
        tell(state, [tie.a, tie.b], `${name(tie.a)} and ${name(tie.b)} broke up.`);
      }
    }
  }
  social.ties = social.ties.filter((tie) => !((tie.kind === 'met' || tie.kind === 'ex' || tie.kind === 'rival') && tie.strength < FORGET_BELOW));
  for (const one of social.regulars) {
    one.day = day;
    one.talks = [];
  }
}

/** True for a campus with a class of students and no regulars yet: a new game's first class, or an upgraded save. */
export function socialWaiting(state: GameState): boolean {
  return !!state.social && state.social.regulars.length === 0 && state.cohorts.some((size) => size >= 4);
}

/**
 * Once a real hour each pair may spend the hour together. Once a real day, first: the regulars who have gone leave,
 * each class has its regulars, the ties fade, and roommates are placed.
 */
export function stepSocial(state: GameState, day: number, hour: number): void {
  const social = state.social;
  if (!social || (state.clock.tick % SOCIAL_STEP !== 0 && !socialWaiting(state))) return;
  const housing = placeIndex(state, 'housing');
  let list: Person[];
  // Who the regulars are, and who rooms with whom, change slowly: once a real day is enough, or at once when there are
  // students and no regulars yet.
  if (day !== social.lastDay || social.regulars.length === 0) {
    prune(state);
    fillClasses(state, housing);
    list = people(state, housing);
    newDay(state, list, day);
    social.lastDay = day;
    placeRoommates(state, housing, list);
  } else list = people(state, housing);
  const campus = CAMPUS_LOW + (CAMPUS_HIGH - CAMPUS_LOW) * social.level;
  const rate = CONTACT_RATE * campus * hourShare(hour);
  // Asleep: nobody spends the hour with anyone.
  if (rate <= 0) return;
  const step = Math.floor(state.clock.tick / SOCIAL_STEP);
  const ties = new Map<number, Tie>();
  const taken: Taken = { partnered: new Set(), crushing: new Set() };
  for (const tie of social.ties) {
    const a = socialKey(tie.a);
    const b = socialKey(tie.b);
    ties.set(pairKey(a, b), tie);
    if (tie.kind === 'partner') taken.partnered.add(a).add(b);
    if (tie.kind === 'crush') taken.crushing.add(a).add(b);
  }
  const seed = state.seed;
  for (let i = 0; i < list.length; i++) {
    const x = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const y = list[j]!;
      const key = pairKey(x.key, y.key);
      const tie = ties.get(key);
      let w = sharedBy(x.profile, y.profile);
      if (tie) {
        if (tie.kind === 'roommate') w += ROOMMATE_PULL;
        if (tie.kind !== 'rival' && tie.kind !== 'ex') w += tie.strength * BOND_PULL;
        if (tie.kind === 'ex') w *= EX_AVOID;
        if (tie.kind === 'rival') w *= RIVAL_MEET;
      }
      if (w <= 0) continue;
      const chance = 1 - Math.exp(-w * rate);
      const [low, high] = x.key < y.key ? [x.key, y.key] : [y.key, x.key];
      if (pairRoll(seed, low, high, step) >= chance) continue;
      ties.set(key, together(state, x, y, tie, hour, day, step, taken));
    }
  }
}

// ----------------------------------------------------- what cards show --

export interface Friend {
  ref: SocialRef;
  name: string;
  kind: TieKind;
  strength: number;
  best: boolean;
}

/** A regular's people, closest first: everyone they have a tie with, the best friend marked. */
export function peopleOf(state: GameState, ref: SocialRef): Friend[] {
  const housing = placeIndex(state, 'housing');
  const out: Friend[] = [];
  for (const tie of state.social?.ties ?? []) {
    if (!sameStudent(tie.a, ref) && !sameStudent(tie.b, ref)) continue;
    const other = otherEnd(tie, ref);
    const profile = socialProfile(state, other, housing);
    if (!profile) continue;
    out.push({ ref: refOf(other), name: profile.name, kind: tie.kind, strength: tie.strength, best: false });
  }
  out.sort((p, q) => q.strength - p.strength);
  const best = out.find((one) => (one.kind === 'friend' || one.kind === 'roommate' || one.kind === 'partner' || one.kind === 'crush') && one.strength >= BEST_AT);
  if (best) best.best = true;
  return out;
}

export interface FriendGroup {
  members: SocialRef[];
  vibe: VibeId;
  name: string;
  hangout: string;
}

const CLOSE: readonly TieKind[] = ['friend', 'roommate', 'crush', 'partner'];

/** What one student brings to a group's vibe. */
function leaning(profile: SocialProfile): VibeId {
  if (profile.team || profile.nature === 'athlete' || profile.nature === 'superfan') return 'athletes';
  if (profile.club === 'Improv Troupe' || profile.club === 'Film Society' || profile.club === 'Debate Society') return 'theatreKids';
  if (profile.club === 'A Cappella Group' || profile.club === 'Campus Radio' || /music/i.test(profile.major)) return 'musicians';
  if (profile.club === 'Chess Club' || profile.club === 'Board Game Club' || profile.club === 'Robotics Club' || profile.club === 'Coding Club' || profile.nature === 'clown') return 'gamers';
  if (profile.nature === 'party') return 'partyGroup';
  if (profile.chapter !== null) return 'greek';
  if (profile.nature === 'scholar' || profile.nature === 'stressed' || profile.nature === 'allNighter' || profile.nature === 'superSenior') return 'studyCrew';
  if (profile.nature === 'homesick' || profile.nature === 'lost' || profile.nature === 'commuter' || profile.nature === 'broke') return 'quiet';
  return 'mixed';
}

/** The vibe of the most of them, when at least two lean the same way; otherwise a mixed crowd. */
export function vibeOf(profiles: SocialProfile[]): VibeId {
  const count = new Map<VibeId, number>();
  for (const profile of profiles) {
    const vibe = leaning(profile);
    count.set(vibe, (count.get(vibe) ?? 0) + 1);
  }
  let best: VibeId = 'mixed';
  let most = 1;
  for (const [vibe, n] of count) if (vibe !== 'mixed' && n > most) [best, most] = [vibe, n];
  return best;
}

/**
 * The friend groups: three to six regulars who are close, gathered greedily from the closest tie outward, each with the
 * vibe of most of its members. Worked out from the save each time: never stored.
 */
export function friendGroups(state: GameState): FriendGroup[] {
  const social = state.social;
  if (!social) return [];
  const close = social.ties.filter((tie) => CLOSE.includes(tie.kind) && tie.strength >= GROUP_AT).sort((p, q) => q.strength - p.strength || socialKey(p.a) - socialKey(q.a));
  const taken = new Set<number>();
  const groups: SocialRef[][] = [];
  for (const seed of close) {
    if (taken.has(socialKey(seed.a)) || taken.has(socialKey(seed.b))) continue;
    const members = [seed.a, seed.b];
    // Grow by whoever is close to the most of the group, closest first, up to six.
    for (;;) {
      if (members.length >= GROUP_MOST) break;
      let pick: SocialRef | null = null;
      let pull = 0;
      for (const tie of close) {
        for (const [inside, outside] of [[tie.a, tie.b], [tie.b, tie.a]] as const) {
          if (!members.some((one) => sameStudent(one, inside)) || members.some((one) => sameStudent(one, outside)) || taken.has(socialKey(outside))) continue;
          const links = members.filter((one) => CLOSE.includes(tieBetween(state, one, outside)?.kind ?? 'met') && (tieBetween(state, one, outside)?.strength ?? 0) >= GROUP_AT).length;
          if (links >= 2 || (members.length === 2 && links >= 1)) {
            if (links + tie.strength / 100 > pull) {
              pull = links + tie.strength / 100;
              pick = outside;
            }
          }
        }
      }
      if (!pick) break;
      members.push(pick);
    }
    if (members.length < 3) continue;
    for (const one of members) taken.add(socialKey(one));
    groups.push(members.map(refOf));
  }
  const housing = placeIndex(state, 'housing');
  return groups.map((members) => {
    const profiles = members.map((one) => socialProfile(state, one, housing)).filter((one): one is SocialProfile => one !== null);
    const vibe = vibeOf(profiles);
    return { members, vibe, name: VIBES[vibe].name, hangout: VIBES[vibe].hangout };
  });
}

export function groupOf(state: GameState, ref: SocialRef): FriendGroup | null {
  return friendGroups(state).find((group) => group.members.some((one) => sameStudent(one, ref))) ?? null;
}

/** A regular's talks today, newest first: only those from the player's current day. */
export function talksToday(state: GameState, ref: SocialRef, day: number): Talk[] {
  const regular = state.social?.regulars.find((one) => sameStudent(one.ref, ref));
  if (!regular || regular.day !== day) return [];
  return [...regular.talks].reverse();
}

/** What happened lately between a regular and the others, newest first. */
export function newsOf(state: GameState, ref: SocialRef, most = 3): string[] {
  return (state.social?.news ?? [])
    .filter((one) => one.who.some((who) => sameStudent(who, ref)))
    .slice(-most)
    .reverse()
    .map((one) => one.text);
}

/**
 * Friends for a student who is not a regular, from the seed (DESIGN.md 62): the few of their classmates, dorm-mates and
 * club-mates they share most with, the same every time this semester. Never stored, and never a regular, so a
 * regular's own ties stay the whole story of who they know.
 */
export function seededFriends(state: GameState, ref: SocialRef, most = 4): Friend[] {
  const housing = placeIndex(state, 'housing');
  const own = socialProfile(state, ref, housing);
  if (!own) return [];
  const key = socialKey(ref);
  const scored: Array<{ ref: SocialRef; score: number; name: string }> = [];
  for (const one of sampleStudents(state, 120)) {
    if (sameStudent(one, ref) || isRegular(state, one)) continue;
    const profile = socialProfile(state, one, housing);
    if (!profile) continue;
    const w = sharedBy(own, profile);
    if (w < 1.2) continue;
    const other = socialKey(one);
    const [low, high] = key < other ? [key, other] : [other, key];
    const compat = compatibility(state, own, profile, key, other);
    if (compat < CLASH_BELOW) continue;
    scored.push({ ref: one, score: w + 2 * roll(state, 8, low, high), name: profile.name });
  }
  scored.sort((p, q) => q.score - p.score || socialKey(p.ref) - socialKey(q.ref));
  return scored.slice(0, most).map((one, n) => ({ ref: one.ref, name: one.name, kind: 'friend', strength: Math.round(40 + one.score * 10), best: n === 0 && one.score >= 3.5 }));
}

// ------------------------------------------------- the Main Character --

/**
 * The regular who suits a part in the Main Character's life best: the one they share most with, whose spark or fit is
 * best, that `fits`. When nobody fits, a student of their class they share something with joins the regulars.
 */
function castFor(state: GameState, mc: SocialRef, fits: (ref: SocialRef, tie: Tie | undefined, profile: SocialProfile) => boolean, romance: boolean): SocialRef | null {
  const housing = placeIndex(state, 'housing');
  const athletes = athleteShare(state);
  const own = socialProfile(state, mc, housing, athletes);
  if (!own) return null;
  const key = socialKey(mc);
  let best: SocialRef | null = null;
  let score = -Infinity;
  for (const regular of state.social.regulars) {
    if (sameStudent(regular.ref, mc)) continue;
    const profile = socialProfile(state, regular.ref, housing, athletes);
    if (!profile) continue;
    const tie = tieBetween(state, mc, regular.ref);
    if (!fits(regular.ref, tie, profile)) continue;
    const other = socialKey(regular.ref);
    const value = sharedBy(own, profile) + (romance ? 2 * spark(state, key, other) : compatibility(state, own, profile, key, other)) + (tie ? tie.strength / 100 : 0);
    if (value > score) {
      score = value;
      best = regular.ref;
    }
  }
  if (best) return best;
  // Nobody among the regulars: someone from their dorm or their classes joins them.
  for (const ref of sampleStudents(state, 120)) {
    if (sameStudent(ref, mc) || isRegular(state, ref)) continue;
    const profile = socialProfile(state, ref, housing, athletes);
    if (!profile || sharedBy(own, profile) < 1.2 || !fits(ref, undefined, profile)) continue;
    if (addRegular(state, ref, housing, true)) return ref;
  }
  return null;
}

function setTie(state: GameState, a: SocialRef, b: SocialRef, kind: TieKind, strength: number, aFirst?: boolean): Tie {
  let tie = tieBetween(state, a, b);
  if (!tie) {
    tie = { a: refOf(a), b: refOf(b), kind, strength, since: state.clock.tick, seen: state.clock.tick };
    state.social.ties.push(tie);
  }
  tie.kind = kind;
  tie.strength = Math.round(clamp(strength));
  tie.since = state.clock.tick;
  tie.seen = state.clock.tick;
  if (kind === 'crush') tie.aFirst = sameStudent(tie.a, a) ? aFirst !== false : aFirst === false;
  else delete tie.aFirst;
  return tie;
}

const free = (state: GameState) => (ref: SocialRef, tie: Tie | undefined, profile: SocialProfile): boolean =>
  profile.kind !== 'distance' && !hasPartner(state, ref) && tie?.kind !== 'roommate' && tie?.kind !== 'ex' && tie?.kind !== 'rival';

/**
 * The Main Character joins the regulars (DESIGN.md 62), with the people their life began with in section 57: a
 * roommate where rooms are shared, two friends at least, and a partner or a crush on campus as their seeded status
 * says. A partner far away is not a regular, and stays as section 57 made them.
 */
export function settleMain(state: GameState, mc: SocialRef, status: string): void {
  const housing = placeIndex(state, 'housing');
  addRegular(state, mc, housing, true);
  const own = socialProfile(state, mc, housing);
  if (!own) return;
  const ties = (): Tie[] => state.social.ties.filter((tie) => sameStudent(tie.a, mc) || sameStudent(tie.b, mc));
  if (own.home !== null && !own.housed && roomsShared(state, own.home) && !ties().some((tie) => tie.kind === 'roommate')) {
    const mate = castFor(state, mc, (ref, tie, profile) => profile.home === own.home && !profile.housed && tie?.kind !== 'partner' && !state.social.ties.some((one) => one.kind === 'roommate' && (sameStudent(one.a, ref) || sameStudent(one.b, ref))), false);
    if (mate) setTie(state, mc, mate, 'roommate', 45);
  }
  const friendly = (): number => ties().filter((tie) => tie.kind === 'friend' && tie.strength >= FRIEND_AT).length;
  for (const strength of [42, 34]) {
    if (friendly() >= 2) break;
    const friend = castFor(state, mc, (_ref, tie) => !tie || tie.kind === 'met', false);
    if (friend) setTie(state, mc, friend, 'friend', strength);
  }
  if (!ties().some((tie) => tie.kind === 'partner' || tie.kind === 'crush')) {
    if (status === 'togetherHappy' || status === 'togetherUnhappy') {
      const partner = castFor(state, mc, free(state), true);
      if (partner) setTie(state, mc, partner, 'partner', status === 'togetherHappy' ? 70 : 45);
    } else if (status === 'singleLooking') {
      const crush = castFor(state, mc, free(state), true);
      if (crush) setTie(state, mc, crush, 'crush', 20, true);
    }
  }
}

/**
 * A change the story makes to the Main Character's people (DESIGN.md 58), made in the graph: a new friend, the crush
 * becoming a partner, a breakup, a new crush, a new roommate. The person is a real student, a regular.
 */
export function mainCastChange(state: GameState, mc: SocialRef, change: 'newFriend' | 'crushToPartner' | 'breakup' | 'newCrush' | 'newRoommate'): void {
  const ties = state.social.ties.filter((tie) => sameStudent(tie.a, mc) || sameStudent(tie.b, mc));
  switch (change) {
    case 'newFriend': {
      const friend = castFor(state, mc, (_ref, tie) => !tie || tie.kind === 'met', false);
      if (friend) setTie(state, mc, friend, 'friend', 55);
      return;
    }
    case 'crushToPartner': {
      const crush = ties.find((tie) => crushIsTheirs(tie, mc));
      if (crush) setTie(state, mc, otherEnd(crush, mc), 'partner', Math.max(crush.strength, 60));
      return;
    }
    case 'breakup': {
      for (const tie of ties) if (tie.kind === 'partner') setTie(state, mc, otherEnd(tie, mc), 'ex', EX_AT);
      return;
    }
    case 'newCrush': {
      for (const tie of ties) if (crushIsTheirs(tie, mc)) setTie(state, mc, otherEnd(tie, mc), 'friend', Math.max(FRIEND_AT, tie.strength));
      if (ties.some((tie) => tie.kind === 'partner')) return;
      const crush = castFor(state, mc, (ref, tie, profile) => free(state)(ref, tie, profile) && tie?.kind !== 'crush', true);
      if (crush) setTie(state, mc, crush, 'crush', 15, true);
      return;
    }
    case 'newRoommate': {
      for (const tie of ties) if (tie.kind === 'roommate') setTie(state, mc, otherEnd(tie, mc), tie.strength >= FRIEND_AT ? 'friend' : 'met', tie.strength);
      const own = socialProfile(state, mc);
      const old = ties.filter((tie) => tie.kind === 'roommate').map((tie) => otherEnd(tie, mc));
      const mate = castFor(state, mc, (ref, tie, profile) => !old.some((one) => sameStudent(one, ref)) && profile.home === own?.home && !profile.housed && tie?.kind !== 'partner' && !state.social.ties.some((one) => one.kind === 'roommate' && (sameStudent(one.a, ref) || sameStudent(one.b, ref))), false);
      if (mate) setTie(state, mc, mate, 'roommate', 40);
      return;
    }
  }
}

/** Time the Main Character spends with someone, in points of closeness: their tie grows, and both remember the talk. */
export function spentTime(state: GameState, mc: SocialRef, with_: SocialRef, by: number, tone: TalkTone | null, day: number): Tie | undefined {
  const tie = tieBetween(state, mc, with_);
  if (!tie) return undefined;
  if (tie.kind === 'rival' || tie.kind === 'ex') tie.strength = clamp(tie.strength - Math.abs(by));
  else tie.strength = clamp(tie.strength + by);
  tie.seen = state.clock.tick;
  if (tie.kind === 'met' && tie.strength >= FRIEND_AT) {
    tie.kind = 'friend';
    tie.since = state.clock.tick;
  }
  if (tone) {
    for (const [one, other] of [[mc, with_], [with_, mc]] as const) {
      const regular = state.social.regulars.find((r) => sameStudent(r.ref, one));
      if (regular) talk(regular, day, { with: refOf(other), tone, tick: state.clock.tick });
    }
  }
  return tie;
}
