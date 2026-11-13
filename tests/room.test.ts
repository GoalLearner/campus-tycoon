import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canLookInside, roomActivity, roomFor, ROOM_PLANS, roomShared, type Room } from '../src/app/room';
import { advance, newGame, sampleStudents, serialize, studentCard, toneProblem, type GameState, type StudentRef } from '../src/sim';
import { DAY, freshGame, T0 } from './helpers';

/**
 * A peek inside a student's room (DESIGN.md section 46): worked out from the
 * card and the hour, for show only.
 */

const model = (): GameState => advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;
const STATE = model();
const looks = { crowd: 16, look: (ref: StudentRef) => (ref.entryYear * 31 + ref.index) % 16 };

/** Students who live in a dorm, in the seed's order. */
const RESIDENTS = sampleStudents(STATE, 60).filter((ref) => {
  const card = studentCard(STATE, ref);
  return card !== null && card.residence === 'dorm' && card.home !== null;
});

const room = (ref: StudentRef, hour: number, state = STATE): Room => roomFor(state, ref, hour, looks)!;

describe('a room', () => {
  it('is for a student at home, in their dorm or their house in town, and the way in is the card once they are there', () => {
    expect(RESIDENTS.length).toBeGreaterThan(20);
    const commuter = sampleStudents(STATE, 60).find((ref) => studentCard(STATE, ref)?.residence === 'offCampus')!;
    // A room in town has no roommate.
    const town = roomFor(STATE, commuter, 12, looks)!;
    expect(town).not.toBeNull();
    expect(town.roommate).toBeNull();
    expect(canLookInside(STATE, commuter, 'walkingHome', false)).toBe(true);
    expect(canLookInside(STATE, commuter, 'walkingHome', true)).toBe(false);
    const ref = RESIDENTS[0]!;
    // Heading home, then indoors: the card may look in. Out walking, or indoors somewhere else, it may not.
    expect(canLookInside(STATE, ref, 'toDorm', false)).toBe(true);
    expect(canLookInside(STATE, ref, 'movingIn', false)).toBe(true);
    expect(canLookInside(STATE, ref, 'toDorm', true)).toBe(false);
    expect(canLookInside(STATE, ref, 'toClass', false)).toBe(false);
    expect(canLookInside(STATE, ref, null, false)).toBe(false);
    expect(canLookInside(STATE, ref, 'walkingHome', false)).toBe(false);
    expect(canLookInside(STATE, commuter, 'toDorm', false)).toBe(false);
    // A small campus has dorms too.
    const small = freshGame();
    expect(() => sampleStudents(small, 10).map((one) => roomFor(small, one, 12, looks))).not.toThrow();
  });

  it('is the same for the same student at the same hour, and changes nothing', () => {
    const before = serialize(STATE, STATE.clock.lastSimulatedAt);
    for (const ref of RESIDENTS.slice(0, 20)) {
      for (const hour of [3, 7.5, 12, 18, 22]) expect(room(ref, hour)).toEqual(room(ref, hour));
    }
    expect(serialize(STATE, STATE.clock.lastSimulatedAt)).toBe(before);
  });

  it('comes in each of its plans, chosen from the seed', () => {
    const layouts = new Set(RESIDENTS.map((ref) => room(ref, 12).layout));
    expect(layouts.size).toBe(ROOM_PLANS.length);
    expect(ROOM_PLANS.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps everything inside its two cells by two', () => {
    for (const ref of RESIDENTS) {
      for (const hour of [7, 12, 21]) {
        const one = room(ref, hour);
        for (const item of [...one.pieces, ...one.figures]) {
          expect(item.x, `${item.x}`).toBeGreaterThanOrEqual(0);
          expect(item.x).toBeLessThanOrEqual(2);
          expect(item.y).toBeGreaterThanOrEqual(0);
          expect(item.y).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('what they are doing', () => {
  it('follows the hour: asleep at night with the lights out, a night owl later, getting ready in the morning', () => {
    let owls = 0;
    for (const ref of RESIDENTS) {
      const card = studentCard(STATE, ref)!;
      const night = room(ref, 4);
      if (card.quirk === 'Night owl' || card.archetype === 'allNighter') {
        owls += 1;
        expect(room(ref, 1).activity).not.toBe('asleep');
        continue;
      }
      expect(night.activity).toBe('asleep');
      expect(night.lights).toBe('off');
      expect(night.figures).toEqual([]);
      expect(night.line).toBe('Asleep. The lights are out.');
      expect(room(ref, card.archetype === 'scholar' ? 7.2 : 8.2).activity).toBe('ready');
    }
    expect(owls).toBeGreaterThan(0);
  });

  it('reads the card: a scholar studies more, a music major plays, and a shared room can have a game', () => {
    const count = (pick: (card: NonNullable<ReturnType<typeof studentCard>>) => boolean, activity: string): [number, number] => {
      let yes = 0;
      let all = 0;
      for (const ref of RESIDENTS) {
        const card = studentCard(STATE, ref)!;
        if (!pick(card)) continue;
        for (let hour = 12; hour < 20; hour++) {
          all += 1;
          if (roomActivity(STATE, card, hour + 0.5, true) === activity) yes += 1;
        }
      }
      return [yes, all];
    };
    const [scholars, scholarHours] = count((card) => card.archetype === 'scholar', 'study');
    const [others, otherHours] = count((card) => card.archetype !== 'scholar' && card.archetype !== 'stressed', 'study');
    if (scholarHours > 0) expect(scholars / scholarHours).toBeGreaterThan(others / otherHours);
    const anyone = RESIDENTS.map((ref) => studentCard(STATE, ref)!);
    expect(anyone.some((card) => [12.5, 14.5, 16.5, 18.5].some((hour) => roomActivity(STATE, card, hour, true) === 'game'))).toBe(true);
    // Nobody plays a game with a roommate they do not have.
    for (const card of anyone) for (let hour = 12; hour < 20; hour++) expect(roomActivity(STATE, card, hour, false)).not.toBe('game');
  });

  it('shows who they are: the things in the room come from the card', () => {
    for (const ref of RESIDENTS) {
      const card = studentCard(STATE, ref)!;
      const keys = room(ref, 13).pieces.map((item) => item.key);
      if (card.archetype === 'scholar') expect(keys.some((key) => key === 'room.book' || key === 'room.scroll')).toBe(true);
      if (card.club) expect(keys).toContain(`decoration.banner.${STATE.football.colour}`);
      if (card.quirk === 'Caffeine-powered' || card.quirk === 'Always hungry') expect(keys.some((key) => key === 'room.cup' || key === 'room.apple')).toBe(true);
      // Every room has its desk, its shelf, its lamp and the drapes.
      for (const key of ['room.desk', 'room.shelf', 'decoration.globeLamp', 'room.drapes']) expect(keys).toContain(key);
    }
  });

  it('has a roommate only when the hall’s rooms are shared, and says who', () => {
    for (const ref of RESIDENTS.slice(0, 30)) {
      const card = studentCard(STATE, ref)!;
      const one = room(ref, 19);
      if (!roomShared(STATE, card.home!)) expect(one.roommate).toBeNull();
      if (one.roommate) {
        expect(one.roommate.name).not.toBe(card.name);
        expect(studentCard(STATE, one.roommate.ref)?.home).toBe(card.home);
      }
    }
  });

  it('says it in the card’s voice, within the tone guide', () => {
    const lines = new Set<string>();
    for (const ref of RESIDENTS) for (let hour = 0; hour < 24; hour += 1.5) lines.add(room(ref, hour).line);
    expect(lines.size).toBeGreaterThan(5);
    for (const line of lines) expect(toneProblem(line), line).toBeNull();
  });
});

describe('for show only', () => {
  it('is never read by the simulation', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    for (const file of files(join(__dirname, '..', 'src', 'sim'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/app\/room|ui\/roomView/);
    }
  });
});
