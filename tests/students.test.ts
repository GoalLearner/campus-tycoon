import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  BED_NEED,
  classYearOf,
  enrollment,
  sampleStudents,
  studentCard,
  studentHome,
  teachingQuality,
  type GameState,
  type Point,
  type StudentRef,
} from '../src/sim';
import { ARCHETYPE_NAMES, CLUBS, GRADE_STEPS, QUIRKS, TEMPERAMENT_SPREAD, THOUGHTS } from '../src/sim/config/students';
import { DAY, freshGame, MIN, T0 } from './helpers';

/** A campus with its founding class moved in. */
function withStudents(): GameState {
  return advance(freshGame(), T0, T0 + 20 * MIN).state;
}

/** Empty cells within two cells of a spot, for planting a quad beside it. */
function emptyNear(state: GameState, cell: number): Point[] {
  const { width, height, cells } = state.map;
  const x = cell % width;
  const y = (cell - x) / width;
  const out: Point[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (cells[ny * width + nx]!.kind === 'empty') out.push([nx, ny]);
    }
  }
  return out;
}

function plantQuad(state: GameState, cells: Point[]): GameState {
  const rich = structuredClone(state);
  rich.money.cash = 10_000_000;
  const result = applyAction(rich, { type: 'paint', tool: 'quad', cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const GRADES = GRADE_STEPS.map(([, grade]) => grade);

describe('the student card', () => {
  it('has nobody to show before the first class arrives', () => {
    const state = freshGame();
    expect(sampleStudents(state)).toEqual([]);
    expect(studentCard(state, { entryYear: 1, index: 0 })).toBeNull();
  });

  it('fills every line for an enrolled student, the same way every time', () => {
    const state = withStudents();
    const students = sampleStudents(state);
    expect(students.length).toBe(enrollment(state));
    for (const ref of students) {
      const card = studentCard(state, ref)!;
      expect(card).not.toBeNull();
      expect(card.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(card.classYearName).toBe('Freshman');
      expect(card.major.length).toBeGreaterThan(0);
      expect(QUIRKS).toContain(card.quirk);
      expect(GRADES).toContain(card.grade);
      expect(card.happiness).toBeGreaterThanOrEqual(0);
      expect(card.happiness).toBeLessThanOrEqual(100);
      expect(card.reason).not.toBeNull();
      expect(studentCard(state, ref)).toEqual(card);
    }
  });

  it('knows only students who are enrolled', () => {
    const state = withStudents();
    const size = state.cohorts[0];
    expect(classYearOf(state, { entryYear: 1, index: size - 1 })).toBe(0);
    expect(classYearOf(state, { entryYear: 1, index: size })).toBeNull();
    expect(classYearOf(state, { entryYear: 2, index: 0 })).toBeNull();
    expect(classYearOf(state, { entryYear: 1, index: -1 })).toBeNull();
  });

  it('keeps the same name, major, quirk and club while the campus and the years change', () => {
    const before = withStudents();
    const ref: StudentRef = { entryYear: 1, index: 3 };
    const first = studentCard(before, ref)!;

    // A year on, with a quad planted beside every dorm.
    let later = before;
    for (const b of later.map.buildings) {
      if (b && b.zone === 'housing') {
        const spare = emptyNear(later, b.y * later.map.width + b.x).slice(0, 2);
        if (spare.length > 0) later = plantQuad(later, spare);
      }
    }
    later = advance(later, later.clock.lastSimulatedAt, T0 + 8 * DAY).state;
    const second = studentCard(later, ref)!;

    expect(second.classYearName).toBe('Sophomore');
    expect(second.name).toBe(first.name);
    expect(second.major).toBe(first.major);
    expect(second.quirk).toBe(first.quirk);
    expect(second.club).toBe(first.club);
  });

  it('houses about the share of students who need a bed, and only in open dorms', () => {
    const state = withStudents();
    let residents = 0;
    const total = 3000;
    for (let index = 0; index < total; index++) {
      const home = studentHome(state, { entryYear: 1, index });
      if (home === null) continue;
      residents += 1;
      const cell = state.map.cells[home]!;
      expect(cell.zone).toBe('housing');
      expect(state.map.buildings[cell.buildingId!]!.stage).toBeGreaterThan(0);
    }
    expect(residents / total).toBeGreaterThan(BED_NEED - 0.04);
    expect(residents / total).toBeLessThan(BED_NEED + 0.04);
  });

  it('reads happiness from the numbers at the student’s own dorm', () => {
    const state = withStudents();
    for (const ref of sampleStudents(state)) {
      const card = studentCard(state, ref)!;
      if (card.home === null) continue;
      expect(card.residence).toBe('dorm');
      const approval = approvalAt(state, card.home);
      expect(Math.abs(card.happiness - approval.score)).toBeLessThanOrEqual(TEMPERAMENT_SPREAD + 0.5);
      expect(approval.walkMinutes).toBe(state.map.walkMinutes[card.home]);
      // The thought is about that dorm, and tapping it goes there.
      expect(card.reason!.cell).toBe(card.home);
      if (card.reason!.cause === 'walk' && approval.walkMinutes >= 0) {
        expect(card.reason!.thought).toContain(`${Math.max(1, Math.round(approval.walkMinutes))} minute`);
      }
    }
  });

  it('gets happier when a quad is planted by the dorm', () => {
    const state = withStudents();
    const resident = sampleStudents(state).find((ref) => {
      const home = studentHome(state, ref);
      return home !== null && approvalAt(state, home).causes.some((c) => c.id === 'green' && c.level < 0.6) && emptyNear(state, home).length >= 3;
    });
    expect(resident).toBeDefined();
    const before = studentCard(state, resident!)!;
    const greener = plantQuad(state, emptyNear(state, before.home!).slice(0, 3));
    const after = studentCard(greener, resident!)!;
    expect(after.home).toBe(before.home);
    expect(after.happiness).toBeGreaterThan(before.happiness);
  });

  it('sends commuters’ thoughts to a lecture hall', () => {
    const state = withStudents();
    const commuter = sampleStudents(state).find((ref) => studentHome(state, ref) === null);
    expect(commuter).toBeDefined();
    const card = studentCard(state, commuter!)!;
    expect(card.home).toBeNull();
    expect(card.residence).toBe('offCampus');
    expect(state.map.cells[card.reason!.cell]!.zone).toBe('academic');
    expect(card.archetype).not.toBe('ra');
  });

  it('never marks a student down when the teaching side of campus improves', () => {
    const state = withStudents();
    let better = state;
    for (const b of state.map.buildings) {
      if (b && b.zone === 'academic') {
        const spare = emptyNear(better, b.y * better.map.width + b.x).slice(0, 2);
        if (spare.length > 0) better = plantQuad(better, spare);
      }
    }
    expect(teachingQuality(better)).toBeGreaterThan(teachingQuality(state));
    for (const ref of sampleStudents(state)) {
      const was = GRADES.indexOf(studentCard(state, ref)!.grade);
      const now = GRADES.indexOf(studentCard(better, ref)!.grade);
      // Earlier in the list is a better grade.
      expect(now).toBeLessThanOrEqual(was);
    }
  });

  it('changes nothing in the game and draws from no random stream', () => {
    const state = withStudents();
    const copy = structuredClone(state);
    for (const ref of sampleStudents(state)) studentCard(state, ref);
    expect(state).toEqual(copy);
  });

  it('keeps every line inside the tone guide', () => {
    const banned = /\b(beer|wine|drunk|alcohol|pub|vodka|smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?)\b/i;
    const lines = [
      ...Object.values(ARCHETYPE_NAMES),
      ...QUIRKS,
      ...CLUBS.map((club) => club.name),
      ...Object.values(THOUGHTS).flat(),
    ];
    for (const line of lines) expect(line).not.toMatch(banned);
  });
});
