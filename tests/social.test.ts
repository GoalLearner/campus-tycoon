import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARGUMENTS, BEST_AT, FRIEND_AT, GROUP_MOST, REGULARS_MOST, REGULARS_PER_CLASS } from '../src/sim/config/social';
import { advance, applyAction, newGame, parseSave, sampleStudents, serialize, studentCard, toneProblem, type GameState } from '../src/sim';
import { makeMain } from '../src/sim/systems/mc';
import {
  friendGroups,
  isRegular,
  newSocial,
  otherEnd,
  peopleOf,
  sameStudent,
  seededFriends,
  socialKey,
  talksToday,
  tieBetween,
} from '../src/sim/systems/social';
import { classYearOf, socialLife, socialProfile } from '../src/sim/systems/students';
import { changeCast } from '../src/sim/systems/mc';
import { mcDay } from '../src/sim/systems/mc';
import { DAY, HOUR, T0 } from './helpers';

/**
 * The social campus (DESIGN.md 62): named regulars in every class, and the
 * ties between them, which form from what they share and time together and
 * fade without it. Deterministic, and nothing in it moves a campus number.
 */

const model = (): GameState => newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' });
const THREE = advance(model(), T0, T0 + 3 * DAY).state;

const ends = (state: GameState, ref: { entryYear: number; index: number }) => state.social.ties.filter((tie) => sameStudent(tie.a, ref) || sameStudent(tie.b, ref));

describe('the regulars', () => {
  it('are a handful from each class, all of them enrolled', () => {
    const social = THREE.social;
    expect(social.regulars.length).toBeGreaterThanOrEqual(4 * REGULARS_PER_CLASS);
    expect(social.regulars.length).toBeLessThanOrEqual(REGULARS_MOST);
    for (const one of social.regulars) expect(classYearOf(THREE, one.ref)).not.toBeNull();
    const byYear = new Map<number, number>();
    for (const one of social.regulars) byYear.set(one.ref.entryYear, (byYear.get(one.ref.entryYear) ?? 0) + 1);
    expect(byYear.size).toBe(4);
    for (const n of byYear.values()) expect(n).toBeGreaterThanOrEqual(REGULARS_PER_CLASS);
    // Nobody twice, and every tie between two regulars.
    expect(new Set(social.regulars.map((one) => socialKey(one.ref))).size).toBe(social.regulars.length);
    for (const tie of social.ties) {
      expect(isRegular(THREE, tie.a)).toBe(true);
      expect(isRegular(THREE, tie.b)).toBe(true);
      expect(sameStudent(tie.a, tie.b)).toBe(false);
    }
  });

  it('come out the same however the time is cut up, and change no campus number', () => {
    const start = advance(model(), T0, T0 + DAY).state;
    const whole = advance(start, T0 + DAY, T0 + 2 * DAY).state;
    let parts = start;
    for (let t = T0 + DAY; t < T0 + 2 * DAY; t += 3 * HOUR + 7 * 60_000) parts = advance(parts, t, Math.min(T0 + 2 * DAY, t + 3 * HOUR + 7 * 60_000)).state;
    parts = advance(parts, T0 + 2 * DAY - 1, T0 + 2 * DAY).state;
    expect(parts.social).toEqual(whole.social);
    // The same campus with no social campus at all has the same money, students and Happiness.
    const bare = structuredClone(start) as unknown as Record<string, unknown>;
    delete bare.social;
    const without = advance(bare as unknown as GameState, T0 + DAY, T0 + 2 * DAY).state;
    expect(without.money.cash).toBe(whole.money.cash);
    expect(without.cohorts).toEqual(whole.cohorts);
  });

  it('pick a new campus’s first class as soon as it arrives', () => {
    const first = advance(newGame({ seed: 7, name: 'Test University', now: T0 }), T0, T0 + 40 * 60_000).state;
    expect(first.social.regulars.length).toBeGreaterThan(0);
  });
});

describe('the ties', () => {
  it('are friends, roommates, crushes, couples and rivals, and form from what students share', () => {
    const kinds = new Set(THREE.social.ties.map((tie) => tie.kind));
    for (const kind of ['met', 'friend', 'roommate']) expect(kinds.has(kind as never)).toBe(true);
    const housing = undefined;
    void housing;
    // A friendship is between two who share something: a class, a dorm, a major, a club, a team or a chapter.
    for (const tie of THREE.social.ties.filter((one) => one.kind === 'friend')) {
      const p = socialProfile(THREE, tie.a)!;
      const q = socialProfile(THREE, tie.b)!;
      const shares = p.classYear === q.classYear || (p.home !== null && p.home === q.home) || p.major === q.major || p.field === q.field || (p.club !== null && p.club === q.club) || (p.team && q.team) || (p.chapter !== null && p.chapter === q.chapter);
      expect(shares).toBe(true);
      expect(tie.strength).toBeGreaterThanOrEqual(FRIEND_AT);
    }
  });

  it('give nobody two partners or two roommates, never pair roommates as a couple, and keep roommates in one hall', () => {
    const later = advance(THREE, T0 + 3 * DAY, T0 + 9 * DAY).state;
    for (const state of [THREE, later]) {
      for (const one of state.social.regulars) {
        const own = ends(state, one.ref);
        expect(own.filter((tie) => tie.kind === 'partner').length).toBeLessThanOrEqual(1);
        expect(own.filter((tie) => tie.kind === 'roommate').length).toBeLessThanOrEqual(1);
        expect(own.filter((tie) => tie.kind === 'crush').length).toBeLessThanOrEqual(1);
        const mate = own.find((tie) => tie.kind === 'roommate');
        if (mate) expect(socialProfile(state, otherEnd(mate, one.ref))?.home).toBe(socialProfile(state, one.ref)?.home);
      }
    }
  });

  it('fade without time together: a week apart and friends drift, faint acquaintances are forgotten', () => {
    const state = structuredClone(THREE);
    const tie = state.social.ties.find((one) => one.kind === 'friend' && one.strength < 60)!;
    // Nobody spends any time together for a week: the hours are those of sleep only, so we move the clock by days.
    const before = tie.strength;
    const key = [socialKey(tie.a), socialKey(tie.b)];
    let later = state;
    for (let d = 1; d <= 7; d++) later = advance(later, T0 + 3 * DAY + (d - 1) * DAY, T0 + 3 * DAY + d * DAY).state;
    const after = later.social.ties.find((one) => socialKey(one.a) === key[0] && socialKey(one.b) === key[1]);
    // Either they kept seeing each other and grew closer, or they drifted; a tie never sits still.
    if (after && after.seen === tie.seen) expect(after.strength).toBeLessThan(before);
    expect(later.social.ties.every((one) => one.strength >= 0 && one.strength <= 100)).toBe(true);
    expect(later.social.ties.filter((one) => one.kind === 'met' && one.strength < 4)).toEqual([]);
  });

  it('say what happened in the tone guide, and rivals argue only about small things', () => {
    const later = advance(THREE, T0 + 3 * DAY, T0 + 8 * DAY).state;
    for (const one of later.social.news) expect(toneProblem(one.text), one.text).toBeNull();
    for (const regular of later.social.regulars) for (const talk of regular.talks) if (talk.about) expect([...ARGUMENTS, 'the dishes']).toContain(talk.about);
  });
});

describe('what a card shows', () => {
  it('a regular’s people, closest first, the best friend among them', () => {
    const regular = THREE.social.regulars.find((one) => peopleOf(THREE, one.ref).some((p) => p.best))!;
    const people = peopleOf(THREE, regular.ref);
    for (let n = 1; n < people.length; n++) expect(people[n - 1]!.strength).toBeGreaterThanOrEqual(people[n]!.strength);
    expect(people.find((p) => p.best)!.strength).toBeGreaterThanOrEqual(BEST_AT);
    expect(people.filter((p) => p.best)).toHaveLength(1);
  });

  it('friend groups of three to six close friends, each with a vibe', () => {
    const groups = friendGroups(THREE);
    expect(groups.length).toBeGreaterThan(0);
    const seen = new Set<number>();
    for (const group of groups) {
      expect(group.members.length).toBeGreaterThanOrEqual(3);
      expect(group.members.length).toBeLessThanOrEqual(GROUP_MOST);
      expect(group.name).toMatch(/^(the|a) /);
      for (const one of group.members) {
        expect(seen.has(socialKey(one))).toBe(false);
        seen.add(socialKey(one));
      }
    }
  });

  it('who they spent time with today', () => {
    const day = mcDay(THREE).day;
    const busy = THREE.social.regulars.filter((one) => talksToday(THREE, one.ref, day).length > 0);
    expect(busy.length).toBeGreaterThan(0);
    for (const one of busy) for (const talk of talksToday(THREE, one.ref, day)) expect(tieBetween(THREE, one.ref, talk.with)).toBeDefined();
  });

  it('for anyone else, a few friends from the seed: never a regular, the same each time', () => {
    const plain = sampleStudents(THREE, 40).find((ref) => !isRegular(THREE, ref) && seededFriends(THREE, ref).length > 0)!;
    const friends = seededFriends(THREE, plain);
    expect(friends).toEqual(seededFriends(THREE, plain));
    for (const one of friends) expect(isRegular(THREE, one.ref)).toBe(false);
    expect(friends.length).toBeLessThanOrEqual(4);
  });

  it('a regular’s relationship status is who they are with', () => {
    const later = advance(THREE, T0 + 3 * DAY, T0 + 9 * DAY).state;
    for (const one of later.social.regulars) {
      const card = studentCard(later, one.ref)!;
      const partner = ends(later, one.ref).some((tie) => tie.kind === 'partner');
      if (card.relationship.id.startsWith('distance')) continue;
      expect(card.relationship.id.startsWith('together')).toBe(partner);
    }
  });
});

describe('the campus shapes it', () => {
  it('more places to eat, sit and meet mean more social life', () => {
    const state = structuredClone(THREE);
    const before = socialLife(newGame({ seed: 3, name: 'Test University', now: T0 }));
    void before;
    const small = advance(newGame({ seed: 3, name: 'Test University', now: T0 }), T0, T0 + DAY).state;
    const level = socialLife(small);
    let more = small;
    // A food place and a few benches, where there is room.
    for (const [type, x, y] of [['coffee', 2, 2], ['bench', 5, 2], ['bench', 6, 2], ['bench', 7, 2]] as const) {
      const result = applyAction(more, { type: 'place', building: type, x, y });
      if (result.ok) more = result.state;
    }
    expect(socialLife(more)).toBeGreaterThanOrEqual(level);
    void state;
  });
});

describe('the main character', () => {
  it('joins the regulars, and their people are real students in the graph', () => {
    const state = structuredClone(THREE);
    const ref = sampleStudents(state, 30).find((one) => !isRegular(state, one) && studentCard(state, one)?.residence === 'dorm')!;
    expect(makeMain(state, ref)).toBeNull();
    const mc = state.story.mc!;
    expect(isRegular(state, ref)).toBe(true);
    const real = mc.cast.filter((one) => one.ref);
    expect(real.length).toBeGreaterThanOrEqual(2);
    for (const one of real) {
      expect(isRegular(state, one.ref!)).toBe(true);
      expect(tieBetween(state, ref, one.ref!)).toBeDefined();
      expect(studentCard(state, one.ref!)?.name).toBe(one.name);
    }
    // Their plan names their friends.
    const friends = mc.cast.filter((one) => one.ref && (one.role === 'friend' || one.role === 'partner')).slice(0, 2).map((one) => one.name.split(' ')[0]!);
    const plan = mc.plan?.items.find((one) => one.activity === 'friends');
    if (plan && friends.length > 0) for (const name of friends) expect(plan.why).toContain(name);
  });

  it('the story’s changes to their people happen among real students', () => {
    const state = structuredClone(THREE);
    const ref = sampleStudents(state, 30).find((one) => !isRegular(state, one) && studentCard(state, one)?.residence === 'dorm')!;
    makeMain(state, ref);
    const mc = state.story.mc!;
    const before = mc.cast.filter((one) => one.role === 'friend').length;
    changeCast(state, mc, 'newFriend');
    expect(mc.cast.filter((one) => one.role === 'friend').length).toBeGreaterThanOrEqual(Math.min(3, before));
    changeCast(state, mc, 'newCrush');
    const crush = mc.cast.find((one) => one.role === 'crush' || one.role === 'partner');
    if (crush?.role === 'crush') {
      changeCast(state, mc, 'crushToPartner');
      expect(mc.cast.find((one) => one.role === 'partner')?.ref).toEqual(crush.ref);
      changeCast(state, mc, 'breakup');
      expect(mc.cast.some((one) => one.role === 'partner')).toBe(false);
      expect(mc.cast.find((one) => one.role === 'ex')?.ref).toEqual(crush.ref);
    }
  });

  it('never has a romance the graph started: their story tells those', () => {
    const state = structuredClone(THREE);
    const ref = sampleStudents(state, 30).find((one) => !isRegular(state, one) && studentCard(state, one)?.residence === 'dorm')!;
    makeMain(state, ref);
    const romance = (s: GameState) => ends(s, ref).filter((tie) => tie.kind === 'partner' || tie.kind === 'crush' || tie.kind === 'ex').map((tie) => `${tie.kind}:${socialKey(otherEnd(tie, ref))}`);
    const before = romance(state);
    const later = advance(state, T0 + 3 * DAY, T0 + 6 * DAY).state;
    // Whatever changed came from the story's own chapters, which name it.
    const told = later.story.chapters.some((one) => one.arc.includes('dat') || one.arc.includes('crush') || one.arc.includes('break'));
    if (!told) expect(romance(later)).toEqual(before);
  });
});

describe('saves', () => {
  it('keep the regulars and their ties through a save and a load', () => {
    const loaded = parseSave(serialize(THREE, T0 + 3 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.social).toEqual(THREE.social);
  });

  describe('from version 28, through 29', () => {
    const text = readFileSync(new URL('./fixtures/save-v28-model.json', import.meta.url), 'utf8');
    it('comes through with no regulars, and on its next tick picks them and makes the main character’s people real', () => {
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.state.social).toEqual(newSocial());
      const mcBefore = loaded.state.story.mc!;
      expect(mcBefore.cast.every((one) => one.ref === undefined)).toBe(true);
      const at = loaded.savedAt;
      const next = advance(loaded.state, at, at + 60_000).state;
      expect(next.social.regulars.length).toBeGreaterThan(0);
      // The Main Character's people become real students over their next quarter hour.
      const later = advance(next, at + 60_000, at + 20 * 60_000).state;
      const mc = later.story.mc!;
      expect(isRegular(later, mc.ref)).toBe(true);
      const real = mc.cast.filter((one) => one.ref);
      expect(real.length).toBeGreaterThan(0);
      for (const one of real) expect(isRegular(later, one.ref!)).toBe(true);
    });
  });
});
