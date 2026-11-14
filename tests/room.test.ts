import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bedArea,
  canLookInside,
  figureNow,
  homeActivity,
  homeName,
  roomActivity,
  roomFor,
  ROOM_PLANS,
  ROOM_SIZE,
  roomShared,
  roundSeconds,
  WALK_SPEED,
  type Room,
} from '../src/app/room';
import { advance, dormName, hallName, newGame, sampleStudents, serialize, studentCard, toneProblem, type GameState, type StudentRef } from '../src/sim';
import { DAY, freshGame, T0 } from './helpers';

/**
 * A peek inside a student's room (DESIGN.md sections 46 and 60): worked out
 * from the card and the hour, for show only. The people in it go round their
 * places, and sleep in their beds.
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
const asleepAt = (ref: StudentRef): boolean => {
  const card = studentCard(STATE, ref)!;
  return card.quirk !== 'Night owl' && card.archetype !== 'allNighter';
};

describe('a room', () => {
  it('is for a student at home, in their dorm, their chapter house or their house in town', () => {
    expect(RESIDENTS.length).toBeGreaterThan(20);
    const commuter = sampleStudents(STATE, 60).find((ref) => studentCard(STATE, ref)?.residence === 'offCampus')!;
    // A room in town has no roommate, and says the street.
    const town = roomFor(STATE, commuter, 12, looks)!;
    expect(town).not.toBeNull();
    expect(town.roommate).toBeNull();
    expect(town.beds).toHaveLength(1);
    expect(town.where.startsWith('on ') || town.where === 'in town').toBe(true);
    // A dorm room names its hall.
    const ref = RESIDENTS[0]!;
    expect(room(ref, 12).where).toBe(dormName(STATE, studentCard(STATE, ref)!.home!));
    // A small campus has dorms too.
    const small = freshGame();
    expect(() => sampleStudents(small, 10).map((one) => roomFor(small, one, 12, looks))).not.toThrow();
  });

  it('can be looked into once they are seen going in, or whenever their hours have them at home', () => {
    const commuter = sampleStudents(STATE, 60).find((ref) => studentCard(STATE, ref)?.residence === 'offCampus')!;
    expect(canLookInside(STATE, commuter, 'walkingHome', false, 13)).toBe(true);
    expect(canLookInside(STATE, commuter, 'walkingHome', true, 13)).toBe(false);
    expect(canLookInside(STATE, commuter, 'toDorm', false, 13)).toBe(false);
    const ref = RESIDENTS.find(asleepAt)!;
    // Heading home, then indoors: the card may look in. Out walking, or indoors somewhere else, it may not.
    expect(canLookInside(STATE, ref, 'toDorm', false, 13)).toBe(true);
    expect(canLookInside(STATE, ref, 'movingIn', false, 13)).toBe(true);
    expect(canLookInside(STATE, ref, 'toDorm', true, 13)).toBe(false);
    expect(canLookInside(STATE, ref, 'toClass', false, 13)).toBe(false);
    expect(canLookInside(STATE, ref, 'walkingHome', false, 13)).toBe(false);
    // Not seen at all: home asleep at night and in for the evening, in class in the middle of the day. This is the
    // main character opened from the top bar at night, who had no way in before.
    expect(canLookInside(STATE, ref, null, false, 3)).toBe(true);
    expect(canLookInside(STATE, ref, null, false, 19.5)).toBe(true);
    expect(canLookInside(STATE, ref, null, false, 13)).toBe(false);
    const card = studentCard(STATE, ref)!;
    expect(homeActivity(STATE, card, 3)).toBe('asleep');
    expect(homeActivity(STATE, card, card.archetype === 'scholar' ? 7.2 : 8.2)).toBe('ready');
    expect(homeActivity(STATE, card, 13)).toBeNull();
    expect(homeActivity(STATE, card, 19.5)).not.toBeNull();
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

  it('keeps everything inside its three cells by two, and nobody walks over a bed', () => {
    const inside = (x: number, y: number): void => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(ROOM_SIZE.x);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(ROOM_SIZE.y);
    };
    let walks = 0;
    for (const ref of RESIDENTS) {
      for (const hour of [7.5, 12, 15, 19, 21, 3]) {
        const one = room(ref, hour);
        for (const item of one.pieces) inside(item.x, item.y);
        const areas = one.beds.map(bedArea);
        for (const [x0, y0, x1, y1] of areas) {
          inside(x0, y0);
          inside(x1, y1);
        }
        for (const who of one.figures) {
          if (who.bed !== null) {
            expect(who.bed).toBeLessThan(one.beds.length);
            continue;
          }
          const total = roundSeconds(who);
          for (let t = 0; t < total + 1; t += 0.5) {
            const now = figureNow(who, t);
            inside(now.x, now.y);
            if (now.pose === 'walk') walks += 1;
            for (const [x0, y0, x1, y1] of areas) {
              const over = now.x > x0 + 0.02 && now.x < x1 - 0.02 && now.y > y0 + 0.02 && now.y < y1 - 0.02;
              expect(over, `${now.x.toFixed(2)},${now.y.toFixed(2)} on a bed in plan ${one.layout}`).toBe(false);
            }
          }
        }
      }
    }
    expect(walks).toBeGreaterThan(100);
  });

  it('has a bed for everyone who sleeps in it, and two when the room is shared', () => {
    for (const ref of RESIDENTS.slice(0, 40)) {
      const one = room(ref, 12);
      expect(one.beds.length).toBe(one.roommate ? 2 : 1);
      expect(one.beds[0]!.roommate).toBe(false);
      // A room of one has the sofa where the second bed would be.
      expect(one.pieces.some((item) => item.key === 'decoration.sofa')).toBe(one.roommate === null);
      if (one.roommate) expect(one.beds[1]!.roommate).toBe(true);
    }
  });
});

describe('what they are doing', () => {
  it('follows the hour: asleep in bed at night under a low light, a night owl later, getting ready in the morning', () => {
    let owls = 0;
    let shared = 0;
    for (const ref of RESIDENTS) {
      const card = studentCard(STATE, ref)!;
      const night = room(ref, 4);
      if (!asleepAt(ref)) {
        owls += 1;
        expect(room(ref, 1).activity).not.toBe('asleep');
        continue;
      }
      expect(night.activity).toBe('asleep');
      expect(night.lights).toBe('off');
      // They are in their own bed, and a roommate in the room is in theirs: nobody shares a bed.
      expect(night.figures.find((who) => !who.roommate)?.bed).toBe(0);
      const mate = night.figures.find((who) => who.roommate);
      if (mate) {
        shared += 1;
        expect(mate.bed).toBe(1);
      }
      expect(night.line.startsWith('Asleep')).toBe(true);
      expect(room(ref, card.archetype === 'scholar' ? 7.2 : 8.2).activity).toBe('ready');
    }
    expect(owls).toBeGreaterThan(0);
    expect(shared).toBeGreaterThan(0);
  });

  it('goes round: walking slowly between places, and the same round for the same hour', () => {
    const ref = RESIDENTS.find((one) => room(one, 14).activity === 'study' || room(one, 15).activity === 'study')!;
    const hour = room(ref, 14).activity === 'study' ? 14 : 15;
    const one = room(ref, hour);
    const who = one.figures.find((figure) => !figure.roommate)!;
    // At the desk, sitting, for a good while, then up and away and back.
    expect(who.stops[0]!.pose).toBe('sit');
    const poses = new Set<string>();
    let last = figureNow(who, 0);
    for (let t = 0.25; t < roundSeconds(who); t += 0.25) {
      const now = figureNow(who, t);
      poses.add(now.pose);
      // Never faster than a stroll.
      expect(Math.hypot(now.x - last.x, now.y - last.y)).toBeLessThanOrEqual(WALK_SPEED * 0.25 + 1e-9);
      last = now;
    }
    expect([...poses].sort()).toEqual(['sit', 'stand', 'walk']);
    expect(roomFor(STATE, ref, hour, looks)!.figures).toEqual(one.figures);
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

  it('shows who they are: the things in the room come from the card, and food and a cup go on the desk', () => {
    for (const ref of RESIDENTS) {
      const card = studentCard(STATE, ref)!;
      const pieces = room(ref, 13).pieces;
      const keys = pieces.map((item) => item.key);
      if (card.archetype === 'scholar') expect(keys.some((key) => key === 'room.book' || key === 'room.scroll')).toBe(true);
      if (card.club) expect(keys).toContain(`decoration.banner.${STATE.football.colour}`);
      if (card.quirk === 'Caffeine-powered' || card.quirk === 'Always hungry') expect(keys.some((key) => key === 'room.cup' || key === 'room.apple')).toBe(true);
      // Nothing to eat or drink on the floor: it read as a stain.
      for (const item of pieces) if (item.key === 'room.apple' || item.key === 'room.cup') expect(item.lift ?? 0).toBeGreaterThan(0);
      // Every room has its desk, its chair, its shelf, its lamp and the drapes.
      for (const key of ['room.desk', 'room.chairFront', 'room.shelf', 'decoration.globeLamp', 'room.drapes']) expect(keys).toContain(key);
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

describe('the name of a hall', () => {
  it('is the same every time, and no two dorms or halls share one', () => {
    const halls = STATE.map.buildings.filter((one) => one && one.zone === 'housing');
    expect(halls.length).toBeGreaterThan(10);
    const names = halls.map((one) => dormName(STATE, one!.y * STATE.map.width + one!.x));
    expect(names).toEqual(halls.map((one) => dormName(STATE, one!.y * STATE.map.width + one!.x)));
    expect(new Set(names).size).toBe(names.length);
    const lecture = STATE.map.buildings.filter((one) => one && one.zone === 'academic').map((one) => hallName(STATE, one!.y * STATE.map.width + one!.x));
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+ Hall$/);
      expect(lecture).not.toContain(name);
    }
    // The card says it, and a chapter's house by its chapter.
    const resident = studentCard(STATE, RESIDENTS[0]!)!;
    expect(homeName(STATE, resident)).toBe(dormName(STATE, resident.home!));
  });

  it('is never changed by a building put down later', () => {
    const halls = STATE.map.buildings.filter((one) => one && one.zone === 'housing');
    const first = halls[0]!;
    const cell = first.y * STATE.map.width + first.x;
    const before = dormName(STATE, cell);
    const later = { ...STATE, map: { ...STATE.map, buildings: [...STATE.map.buildings, { ...first, id: STATE.map.buildings.length, x: first.x + 1 }] } };
    expect(dormName(later, cell)).toBe(before);
  });
});

describe('for show only', () => {
  it('is never read by the simulation', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    for (const file of files(join(__dirname, '..', 'src', 'sim'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/app\/room|ui\/roomView/);
    }
    // The card's name for a hall is made in the sim's name pools, and nothing in the sim calls it.
    const callers = files(join(__dirname, '..', 'src', 'sim')).filter((file) => /dormName\(state/.test(readFileSync(file, 'utf8')) && !file.endsWith('people.ts'));
    expect(callers).toEqual([]);
  });

  it('hides a card row it hides, whatever its own display: the Weekends row', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'ui.css'), 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });
});
