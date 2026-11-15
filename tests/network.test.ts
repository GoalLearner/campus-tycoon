import { describe, expect, it } from 'vitest';
import { NETWORK_MOST, networkFor, viewOf, type NetworkPerson } from '../src/app/socialView';
import { advance, applyAction, landRankGoals, newGame, previewPlace, type GameState, type StudentRef } from '../src/sim';
import { nextGreekDay } from '../src/sim/systems/greek';
import { FEEL, KIND, SLOTS } from '../src/sim/config/web';
import { dormName } from '../src/sim/systems/people';
import { classYearOf, socialProfile } from '../src/sim/systems/students';
import { TIGHT_FROM, TIGHT_SHOWN, tightKnit } from '../src/app/tightKnit';
import { catchUp, idOf, newWeb, place, refAt, webWeekOf } from '../src/sim/systems/web';
import { DAY, MIN, T0 } from './helpers';

/**
 * Social stop 8 (DESIGN.md 63.12): a student's network, from the Network button on their card, and the campus-wide
 * reads on the Social tab, the most tight-knit halls, clubs, chapters and teams.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEEK0 = webWeekOf(MODEL);
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, WEEK0);
for (let w = 1; w <= 12; w++) catchUp(WEB, MODEL, WEEK0 + w);
const VIEW = viewOf(WEB, false);

const key = (ref: StudentRef): string => `${ref.entryYear}:${ref.index}`;
const enrolled = (ref: StudentRef): boolean => classYearOf(MODEL, ref) !== null;

/** Every tenth student on the web, with their network. */
const SAMPLE: Array<{ id: number; ref: StudentRef; people: NetworkPerson[] }> = [];
for (let id = 0; id < WEB.n; id += 10) {
  if (WEB.year[id]! < 0) continue;
  const ref = refAt(WEB, id);
  if (!enrolled(ref)) continue;
  SAMPLE.push({ id, ref, people: networkFor(VIEW, MODEL, ref) });
}

describe('a student’s network', () => {
  it('puts their people round them, nearest first, at most sixteen, never themself and never twice', () => {
    expect(SAMPLE.length).toBeGreaterThan(1000);
    for (const { ref, people } of SAMPLE) {
      expect(people.length).toBeLessThanOrEqual(NETWORK_MOST);
      const keys = people.map((one) => key(one.ref));
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain(key(ref));
      for (let i = 1; i < people.length; i++) expect(people[i - 1]!.ring).toBeLessThanOrEqual(people[i]!.ring);
      expect(people.every((one) => enrolled(one.ref))).toBe(true);
      // One partner at most, and they sit on the nearest ring with a best friend.
      expect(people.filter((one) => ['dating', 'exclusive', 'long-term'].includes(one.label)).length).toBeLessThanOrEqual(1);
    }
    const sizes = SAMPLE.map((one) => one.people.length);
    expect(sizes.reduce((a, b) => a + b, 0) / sizes.length).toBeGreaterThan(3);
  });

  it('names each tie as the card does and draws how it feels from their end', () => {
    const rings: Record<string, number> = { dating: 0, exclusive: 0, 'long-term': 0, 'best friend': 0, roommate: 1, friend: 1, 'friend, has a crush on them': 1, 'same group': 1, 'their crush': 2, ex: 2, 'arch-rival': 2, rival: 2, 'picks on': 2, 'picks on them': 2 };
    const feelings = { [FEEL.warm]: 'warm', [FEEL.tense]: 'tense', [FEEL.complicated]: 'complicated' } as Record<number, string>;
    const seen = new Map<string, number>();
    const felt = new Map<string, number>();
    for (const { id, people } of SAMPLE) {
      for (const one of people) {
        expect(rings[one.label], one.label).toBe(one.ring);
        seen.set(one.label, (seen.get(one.label) ?? 0) + 1);
        if (one.line === 'group') {
          // Someone only in their friend group: the same group, and no tie of their own between them.
          const b = idOf(WEB, one.ref);
          expect(VIEW.groupOf[b]).toBe(VIEW.groupOf[id]);
          continue;
        }
        felt.set(one.feeling, (felt.get(one.feeling) ?? 0) + 1);
        const b = idOf(WEB, one.ref);
        let slot = -1;
        for (let k = 0; k < SLOTS; k++) if (VIEW.other[id * SLOTS + k] === b) slot = id * SLOTS + k;
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(feelings[VIEW.feeling[slot]!] ?? 'warm').toBe(one.feeling);
      }
    }
    // A lived campus has all three feelings and the usual ties on show.
    for (const label of ['best friend', 'friend', 'roommate', 'same group', 'ex', 'rival']) expect(seen.get(label) ?? 0, label).toBeGreaterThan(0);
    expect(felt.get('warm') ?? 0).toBeGreaterThan(felt.get('tense') ?? 0);
    expect(felt.get('tense') ?? 0).toBeGreaterThan(0);
    expect(felt.get('complicated') ?? 0).toBeGreaterThan(0);
  });

  it('hops both ways: a partner or best friend finds them on their own nearest ring', () => {
    let checked = 0;
    for (const { ref, people } of SAMPLE) {
      for (const one of people.filter((p) => p.ring === 0)) {
        const back = networkFor(VIEW, MODEL, one.ref);
        const me = back.find((p) => key(p.ref) === key(ref));
        expect(me, `${one.label}`).toBeDefined();
        if (['dating', 'exclusive', 'long-term'].includes(one.label)) expect(me!.label).toBe(one.label);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is empty for someone not on the web', () => {
    expect(networkFor(VIEW, MODEL, { entryYear: 999, index: 0 })).toEqual([]);
  });
});

describe('the most tight-knit', () => {
  it('gives the best two halls, clubs, chapters and teams, the tightest first, each of a good size and named', () => {
    const tight = tightKnit(WEB, MODEL);
    expect(tight.length).toBeGreaterThan(0);
    for (let i = 1; i < tight.length; i++) expect(tight[i - 1]!.share).toBeGreaterThanOrEqual(tight[i]!.share);
    for (const kind of ['hall', 'club', 'chapter', 'team'] as const) expect(tight.filter((one) => one.kind === kind).length).toBeLessThanOrEqual(2);
    for (const one of tight) {
      expect(one.members).toBeGreaterThanOrEqual(TIGHT_FROM);
      expect(one.share).toBeGreaterThanOrEqual(TIGHT_SHOWN);
      expect(one.share).toBeLessThanOrEqual(1);
      expect(one.name.length).toBeGreaterThan(0);
    }
    // A hall keeps more of its students' friendships than any club: the floor is where most meet.
    const halls = tight.filter((one) => one.kind === 'hall');
    expect(halls).toHaveLength(2);
    const names = new Set(MODEL.map.buildings.flatMap((lot) => (lot ? [dormName(MODEL, lot.y * MODEL.map.width + lot.x)] : [])));
    for (const hall of halls) expect(names.has(hall.name)).toBe(true);
    const clubs = tight.filter((one) => one.kind === 'club');
    if (clubs.length > 0) expect(halls[0]!.share).toBeGreaterThan(clubs[0]!.share);
  });
});

describe('chapters on the web', () => {
  it('keep their number between placings, so a student placed on their own joins their own chapter', () => {
    // The model campus in the Growth era, three chapter houses and a rush week behind it.
    let state: GameState = structuredClone(MODEL);
    state.field.rank = 120;
    state.field.rankYear = 1;
    landRankGoals(state, []);
    state.money.cash = 2_000_000_000;
    for (let built = 0; built < 3; built++) {
      let at: [number, number] | null = null;
      for (let y = 0; y < state.map.height && !at; y++) for (let x = 0; x < state.map.width && !at; x++) if (previewPlace(state, 'chapterHouse', x, y).problem === null) at = [x, y];
      const result = applyAction(state, { type: 'place', building: 'chapterHouse', x: at![0], y: at![1] });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const rush = nextGreekDay(state, 0)!;
    state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + (rush - state.clock.tick + 2) * MIN).state;

    const web = newWeb(state.seed, 1024);
    catchUp(web, state, webWeekOf(state));
    expect(web.chapterIndex.size).toBeGreaterThanOrEqual(2);
    const chapterOf = (id: number): string | null => socialProfile(state, refAt(web, id))?.chapter ?? null;
    const members: number[] = [];
    for (let id = 0; id < web.n; id++) if (web.year[id]! >= 0 && web.place[4]![id]! >= 0) members.push(id);
    expect(members.length).toBeGreaterThan(20);
    // Members of a chapter numbered after the first, made new again and placed on their own.
    const later = members.filter((id) => web.place[4]![id]! > 0).slice(0, 12);
    expect(later.length).toBeGreaterThan(0);
    for (const id of later) web.identity[id] = 0;
    place(web, state);
    for (const id of members) expect(web.place[4]![id]).toBe(web.chapterIndex.get(chapterOf(id)!));
    // And a chapter can be among the most tight-knit.
    for (const one of tightKnit(web, state).filter((group) => group.kind === 'chapter')) expect([...web.chapterIndex.keys()]).toContain(one.name);
  }, 120_000);
});
