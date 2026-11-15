import { describe, expect, it } from 'vitest';
import { mainPeopleOf, viewOf } from '../src/app/socialView';
import { advance, applyAction, newGame, parseSave, serialize, type GameState } from '../src/sim';
import { FRIEND_AT, KIND, SLOTS } from '../src/sim/config/web';
import { castable, peopleForMain } from '../src/sim/systems/mainWeb';
import { makeMain } from '../src/sim/systems/mc';
import { apply } from '../src/sim/systems/storyteller';
import { studentName } from '../src/sim/systems/students';
import { catchUp, idOf, newWeb, refAt, webWeekOf, type Web } from '../src/sim/systems/web';
import type { MainCharacter } from '../src/sim/types';
import { DAY, T0 } from './helpers';

/**
 * The Main Character on the social web, stop 7 (DESIGN.md 63.11): their people are their real ties, their story casts
 * real students, and the web holds to what their story says, never making or ending their romances itself.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, webWeekOf(MODEL));
for (let w = 1; w <= 4; w++) catchUp(WEB, MODEL, webWeekOf(MODEL) + w);
const VIEW = viewOf(WEB, false);
const same = (a: { entryYear: number; index: number }, b: { entryYear: number; index: number }): boolean => a.entryYear === b.entryYear && a.index === b.index;

/** A student with a roommate, two friends or more and people they have met: a Main Character with a full cast. */
function someoneWithPeople(): { entryYear: number; index: number } {
  for (let id = 0; id < WEB.n; id++) {
    if (WEB.year[id]! < 0) continue;
    const people = peopleForMain(WEB, id, (b) => refAt(WEB, b), WEB.week);
    if (people.roommate && people.friends.length >= 2 && people.met.length >= 2 && people.crushable.length >= 1 && !people.partner) return refAt(WEB, id);
  }
  throw new Error('nobody with people');
}

const REF = someoneWithPeople();
const PEOPLE = mainPeopleOf(VIEW, REF)!;

function chosen(): { state: GameState; mc: MainCharacter } {
  const state = structuredClone(MODEL) as GameState;
  expect(makeMain(state, REF, PEOPLE)).toBeNull();
  return { state, mc: state.story.mc! };
}

/** The tie between two students in a web, or null. */
function tie(web: Web, a: { entryYear: number; index: number }, b: { entryYear: number; index: number }): { kind: number; strength: number } | null {
  const ia = idOf(web, a);
  const ib = idOf(web, b);
  for (let k = 0; k < SLOTS; k++) if (web.other[ia * SLOTS + k] === ib) return { kind: web.kind[ia * SLOTS + k]!, strength: web.strength[ia * SLOTS + k]! };
  return null;
}

describe('the Main Character’s people', () => {
  it('are read from the web: roommate, partner and crush, friends closest first, people met, and single people of their type', () => {
    expect(PEOPLE.for).toEqual(REF);
    const roommate = tie(WEB, REF, PEOPLE.roommate!.ref)!;
    expect(roommate.kind).toBe(KIND.roommate);
    for (const one of PEOPLE.friends) expect([KIND.friend, KIND.best]).toContain(tie(WEB, REF, one.ref)!.kind);
    for (let i = 1; i < PEOPLE.friends.length; i++) expect(PEOPLE.friends[i - 1]!.strength).toBeGreaterThanOrEqual(PEOPLE.friends[i]!.strength);
    for (const one of PEOPLE.met) expect(tie(WEB, REF, one.ref)!.kind).toBe(KIND.met);
    for (const one of PEOPLE.friends) expect(one.strength).toBeGreaterThanOrEqual(FRIEND_AT);
  });

  it('are their real ties when they are chosen with the web, by their own names; made up without it, as before', () => {
    const { mc } = chosen();
    const roommate = mc.cast.find((one) => one.role === 'roommate')!;
    expect(roommate.ref).toEqual(PEOPLE.roommate!.ref);
    expect(roommate.name).toBe(studentName(MODEL, PEOPLE.roommate!.ref));
    const friends = mc.cast.filter((one) => one.role === 'friend');
    expect(friends.map((one) => one.ref)).toEqual(PEOPLE.friends.slice(0, 2).map((one) => one.ref));
    expect(mc.webPeople).toEqual(PEOPLE);
    const plain = structuredClone(MODEL) as GameState;
    expect(makeMain(plain, REF)).toBeNull();
    expect(plain.story.mc!.cast.every((one) => one.ref === undefined)).toBe(true);
    // A reading for someone else, or naming someone not here, is not used.
    const other = structuredClone(MODEL) as GameState;
    expect(makeMain(other, REF, { ...PEOPLE, for: PEOPLE.friends[0]!.ref })).toBeNull();
    expect(other.story.mc!.cast.every((one) => one.ref === undefined)).toBe(true);
  });

  it('are cast by their story from the web: a friend or a roommate from people met, a crush from people of their type', () => {
    const { state, mc } = chosen();
    apply(state, mc, { t: 'cast', change: 'newFriend' });
    const friend = mc.cast.at(-1)!;
    expect(friend.role).toBe('friend');
    expect(PEOPLE.met.some((one) => same(one.ref, friend.ref!))).toBe(true);
    expect(friend.name).toBe(studentName(state, friend.ref!));
    apply(state, mc, { t: 'cast', change: 'newCrush' });
    const crush = mc.cast.find((one) => one.role === 'crush')!;
    expect(PEOPLE.crushable.some((one) => same(one.ref, crush.ref!))).toBe(true);
    apply(state, mc, { t: 'cast', change: 'newRoommate' });
    const roommate = mc.cast.find((one) => one.role === 'roommate')!;
    expect(PEOPLE.met.some((one) => same(one.ref, roommate.ref!))).toBe(true);
    // Nobody is cast twice; with nobody left, someone is made up.
    expect(new Set(mc.cast.flatMap((one) => (one.ref ? [`${one.ref.entryYear}:${one.ref.index}`] : []))).size).toBe(mc.cast.filter((one) => one.ref).length);
    expect(castable(state, [], 0)).toBeNull();
  });

  it('are held in the web to what the story says: closeness, a couple the story made, an ex the story ended', () => {
    const { state, mc } = chosen();
    const friend = mc.cast.find((one) => one.role === 'friend')!;
    friend.closeness = 90;
    apply(state, mc, { t: 'cast', change: 'newCrush' });
    apply(state, mc, { t: 'cast', change: 'crushToPartner' });
    const partner = mc.cast.find((one) => one.role === 'partner')!;
    const web = newWeb(state.seed, 1024);
    catchUp(web, state, webWeekOf(state));
    expect(tie(web, REF, friend.ref!)).toEqual({ kind: KIND.best, strength: 90 });
    expect([KIND.dating, KIND.exclusive, KIND.longterm]).toContain(tie(web, REF, partner.ref!)!.kind);
    // A few weeks on, still: the web neither ends their couple nor starts another.
    for (let w = 1; w <= 6; w++) catchUp(web, state, webWeekOf(state) + w);
    expect([KIND.dating, KIND.exclusive, KIND.longterm]).toContain(tie(web, REF, partner.ref!)!.kind);
    const me = idOf(web, REF);
    let couples = 0;
    for (let k = 0; k < SLOTS; k++) if (web.other[me * SLOTS + k]! >= 0 && web.kind[me * SLOTS + k]! >= KIND.dating && web.kind[me * SLOTS + k]! <= KIND.longterm) couples += 1;
    expect(couples).toBe(1);
    // The story ends it: they are exes in the web.
    apply(state, mc, { t: 'cast', change: 'breakup' });
    expect(mc.exes).toContainEqual(partner.ref);
    catchUp(web, state, webWeekOf(state) + 7);
    expect(tie(web, REF, partner.ref!)!.kind).toBe(KIND.ex);
    // A model campus's web grown and lived: several seconds on a quiet PC, more when it is busy.
  }, 60_000);

  it('are kept through a save and a load; the weekly reading is refused for anyone but the Main Character', () => {
    const { state, mc } = chosen();
    apply(state, mc, { t: 'cast', change: 'newFriend' });
    const back = parseSave(serialize(state, T0 + DAY));
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.story.mc!.cast).toEqual(mc.cast);
    expect(back.state.story.mc!.webPeople).toEqual(PEOPLE);
    expect(applyAction(state, { type: 'mainPeople', people: { ...PEOPLE, week: PEOPLE.week + 1 } }).ok).toBe(true);
    expect(applyAction(state, { type: 'mainPeople', people: { ...PEOPLE, for: PEOPLE.friends[0]!.ref } }).ok).toBe(false);
    expect(applyAction(MODEL, { type: 'mainPeople', people: PEOPLE }).ok).toBe(false);
  });
});
