import { describe, expect, it } from 'vitest';
import { activityWords, findStudent, sceneWords, STAYING, stayingWords, type ActivityRole, type SceneRole } from '../src/app/activityPeople';
import { classYearOf, newGame, sampleStudents, studentCard, studentKey, type StudentRef } from '../src/sim';

/**
 * People in an activity or a small scene are enrolled students (DESIGN.md
 * 13.12): who each one is comes from the seed, the place and their spot in
 * it, and what they are doing is said in plain words. The drawing itself is
 * the map's, and is looked at in the browser.
 */

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);

function campus() {
  return newGame({ seed: 7, name: 'Test', now: T0, campus: 'model' });
}

describe('who a figure is', () => {
  const state = campus();
  const pool = sampleStudents(state);

  it('is an enrolled student, with the ordinary card', () => {
    expect(pool.length).toBeGreaterThan(100);
    for (let spot = 0; spot < 8; spot++) {
      const ref = findStudent(state.seed, pool, 41, spot)!;
      expect(classYearOf(state, ref)).not.toBeNull();
      expect(studentCard(state, ref)?.name).toBeTruthy();
    }
  });

  it('is the same student every time it is asked, and a different one at the next spot and the next place', () => {
    const at = (place: number, spot: number): string => studentKey(findStudent(state.seed, pool, place, spot)!);
    expect(at(41, 0)).toBe(at(41, 0));
    const court = Array.from({ length: 8 }, (_, spot) => at(41, spot));
    expect(new Set(court).size).toBeGreaterThanOrEqual(7);
    expect(Array.from({ length: 8 }, (_, spot) => at(42, spot))).not.toEqual(court);
    // Another game with another seed has other people on the same court.
    expect(Array.from({ length: 8 }, (_, spot) => studentKey(findStudent(state.seed + 1, pool, 41, spot)!))).not.toEqual(court);
  });

  it('is never somebody who is somewhere else on the map already', () => {
    const first = findStudent(state.seed, pool, 41, 0)!;
    const busy = new Set([studentKey(first)]);
    const second = findStudent(state.seed, pool, 41, 0, (key) => busy.has(key))!;
    expect(studentKey(second)).not.toBe(studentKey(first));
    // A whole campus of activities: every spot is found from those not yet standing somewhere.
    const staying = new Set<string>();
    for (let place = 0; place < 40; place++) {
      for (let spot = 0; spot < 8; spot++) {
        const ref = findStudent(state.seed, pool, place, spot, (key) => staying.has(key))!;
        expect(staying.has(studentKey(ref))).toBe(false);
        staying.add(studentKey(ref));
      }
    }
    expect(staying.size).toBe(320);
  });

  it('is nobody on a campus with no students, and still somebody when everyone the seed gives is busy', () => {
    expect(findStudent(1, [], 41, 0)).toBeNull();
    const two: StudentRef[] = [
      { entryYear: 1, index: 0 },
      { entryYear: 1, index: 1 },
    ];
    expect(findStudent(1, two, 41, 0, () => true)).not.toBeNull();
  });
});

describe('what the card says they are doing', () => {
  const place = (type: string, name: string, food = false) => ({ type, name, food });

  it('says it in plain words, with the name of the place', () => {
    expect(activityWords('court', place('courts', 'Outdoor courts'), 'afternoon')).toBe('Playing on the Outdoor courts');
    expect(activityWords('field', place('field', 'Recreation field'), 'afternoon')).toBe('In a match on the Recreation field');
    expect(activityWords('swimmer', place('pool', 'Aquatics pool'), 'afternoon')).toBe('Swimming at the Aquatics pool');
    expect(activityWords('runner', place('track', 'Track and field'), 'afternoon')).toBe('Running laps on the track');
    expect(activityWords('line', place('grill', 'Burger grill', true), 'evening')).toBe('In line at the Burger grill');
    expect(activityWords('line', place('courts', 'Outdoor courts'), 'evening')).toBe('Waiting for a turn at the Outdoor courts');
    expect(activityWords('stall', place('foodcourt', 'Food court', true), 'afternoon')).toBe('Getting food at the Food court');
    expect(activityWords('door', place('gym', 'Gym'), 'afternoon')).toBe('On the way into the Gym');
  });

  it('says what a seat is for by the time of day, by the food beside it and by the study group at it', () => {
    expect(activityWords('seat', place('table', 'Picnic table'), 'afternoon')).toBe('Studying at a picnic table');
    expect(activityWords('seat', place('bench', 'Bench'), 'morning')).toBe('Having coffee at a bench');
    expect(activityWords('seat', { ...place('table', 'Picnic table'), eating: true }, 'afternoon')).toBe('Eating at a picnic table');
    expect(activityWords('seat', { ...place('table', 'Picnic table'), eating: true, studying: true }, 'afternoon')).toBe('Studying with a group at a picnic table');
    expect(activityWords('seat', { ...place('bench', 'Bench'), eating: true }, 'evening')).toBe('Eating at a bench');
  });

  it('has a line for every role, and none of them is empty or says a number', () => {
    const roles: ActivityRole[] = ['court', 'field', 'runner', 'swimmer', 'door', 'line', 'seat', 'stall'];
    for (const role of roles) {
      for (const period of ['morning', 'afternoon', 'evening', 'night'] as const) {
        const words = activityWords(role, place('table', 'Picnic table'), period);
        expect(words.length).toBeGreaterThan(6);
        expect(words).not.toMatch(/undefined|\d/);
      }
    }
    const scenes: SceneRole[] = ['clubHost', 'clubVisitor', 'pickup', 'picnic', 'busker', 'tailgate', 'band', 'storm'];
    for (const role of scenes) {
      expect(sceneWords(role).length).toBeGreaterThan(6);
      expect(sceneWords(role)).not.toMatch(/undefined|\d/);
    }
    expect(new Set(scenes.map(sceneWords)).size).toBe(scenes.length);
  });

  it('marks someone staying put, so the card shows the words as they are and leaves Follow off', () => {
    expect(stayingWords(`${STAYING}Playing on the Outdoor courts`)).toBe('Playing on the Outdoor courts');
    expect(stayingWords('toClass')).toBeNull();
    expect(stayingWords('atPlace:Bench')).toBeNull();
    expect(stayingWords(null)).toBeNull();
  });
});
