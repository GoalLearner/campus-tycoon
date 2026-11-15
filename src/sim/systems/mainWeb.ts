import { FRIEND_AT, KIND, SLOTS } from '../config/web';
import type { CastMember, GameState, MainPeople, MainPerson } from '../types';
import { likes } from './identity';
import { classYearOf, studentName, type StudentRef } from './students';
import type { Ties } from './friends';

/**
 * The Main Character on the social web (DESIGN.md 63.11). Their people are their real ties: the web reads who is around
 * them once a game week (`peopleForMain`), the save keeps it on the Main Character, and the story casts from it when
 * someone new comes into their life. What the story does to their ties, the web holds to (`holdMain` in web.ts).
 */

/** How many of each the reading keeps. */
const FRIENDS_KEPT = 6;
const MET_KEPT = 12;
const CRUSHABLE_KEPT = 8;

const isPartner = (kind: number): boolean => kind === KIND.dating || kind === KIND.exclusive || kind === KIND.longterm;

/** Who the web has around the student at `id`: what the story casts from. `refOf` names a place in the web. */
export function peopleForMain(ties: Ties, id: number, refOf: (id: number) => StudentRef, week: number): MainPeople {
  let roommate: MainPerson | null = null;
  let partner: MainPerson | null = null;
  let crush: MainPerson | null = null;
  const friends: MainPerson[] = [];
  const met: MainPerson[] = [];
  const crushable: MainPerson[] = [];
  const mine = ties.identity[id]!;
  const single = (b: number): boolean => {
    for (let k = 0; k < SLOTS; k++) if (ties.other[b * SLOTS + k]! >= 0 && isPartner(ties.kind[b * SLOTS + k]!)) return false;
    return true;
  };
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = ties.other[s]!;
    if (b < 0) continue;
    const kind = ties.kind[s]!;
    const one: MainPerson = { ref: refOf(b), strength: ties.strength[s]! };
    if (kind === KIND.roommate) roommate = one;
    else if (isPartner(kind)) partner = one;
    else if (kind === KIND.crush) crush = one;
    else if ((kind === KIND.friend || kind === KIND.best) && one.strength >= FRIEND_AT) friends.push(one);
    else if (kind === KIND.met) met.push(one);
    // Someone they have met or are friends with, single, and each the other's type.
    if ((kind === KIND.met || kind === KIND.friend) && single(b) && likes(mine, ties.identity[b]!) && likes(ties.identity[b]!, mine)) crushable.push(one);
  }
  const closest = (a: MainPerson, b: MainPerson): number => b.strength - a.strength;
  return {
    week,
    for: refOf(id),
    roommate,
    partner,
    crush,
    friends: friends.sort(closest).slice(0, FRIENDS_KEPT),
    met: met.sort(closest).slice(0, MET_KEPT),
    crushable: crushable.sort(closest).slice(0, CRUSHABLE_KEPT),
  };
}

const same = (a: StudentRef, b: StudentRef): boolean => a.entryYear === b.entryYear && a.index === b.index;

/** True when a reading is one this version can use: its people all students here, none of them the one it is for. */
export function mainPeopleSound(state: GameState, people: MainPeople): boolean {
  const all = [people.roommate, people.partner, people.crush, ...people.friends, ...people.met, ...people.crushable].filter((one): one is MainPerson => one !== null);
  return (
    Number.isInteger(people.week) &&
    classYearOf(state, people.for) !== null &&
    all.every((one) => classYearOf(state, one.ref) !== null && !same(one.ref, people.for) && Number.isFinite(one.strength) && one.strength >= 0 && one.strength <= 100)
  );
}

/**
 * Someone from the reading for the story to cast, who is not already in the Main Character's life: by the story's own
 * luck, so the same moment always casts the same person. null when there is nobody, and the story makes someone up.
 */
export function castable(state: GameState, pool: readonly MainPerson[], luck: number): MainPerson | null {
  const mc = state.story.mc;
  if (!mc) return null;
  const taken = [mc.ref, ...mc.cast.flatMap((one) => (one.ref ? [one.ref] : [])), ...(mc.exes ?? [])];
  const open = pool.filter((one) => !taken.some((ref) => same(ref, one.ref)) && classYearOf(state, one.ref) !== null);
  return open.length > 0 ? open[luck % open.length]! : null;
}

/** A real student as one of the Main Character's people: their own name, the story's traits, and where they stand. */
export function castFromWeb(state: GameState, role: CastMember['role'], ref: StudentRef, closeness: number, traits: CastMember['traits']): CastMember {
  const story = state.story;
  const id = story.nextCast;
  story.nextCast += 1;
  return { id, role, name: studentName(state, ref), traits, closeness: Math.max(0, Math.min(100, Math.round(closeness))), since: state.clock.tick, ref: { entryYear: ref.entryYear, index: ref.index } };
}
