import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  partLevel,
  BED_NEED,
  classYearOf,
  enrollment,
  relationshipOf,
  sampleStudents,
  semesterOf,
  socialLife,
  studentCard,
  studentHome,
  teachingQuality,
  type GameState,
  type Point,
  type StudentRef,
} from '../src/sim';
import {
  ARCHETYPE_NAMES,
  CLUBS,
  GPA_MAX,
  GPA_MIN,
  QUIRKS,
  RELATIONSHIP_NAMES,
  RELATIONSHIP_NOTES,
  RELATIONSHIP_POINTS,
  SOCIAL_THIN,
  TEMPERAMENT_SPREAD,
  THOUGHTS,
} from '../src/sim/config/students';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

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

const STATUSES = Object.values(RELATIONSHIP_NAMES);

/** The same campus with four full classes, for averages that need many students. */
function bigCampus(): GameState {
  const state = structuredClone(withStudents());
  state.cohorts = [300, 300, 300, 300];
  return state;
}

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
      expect(['Freshman', 'Sophomore', 'Junior', 'Senior']).toContain(card.classYearName);
      expect(card.major.length).toBeGreaterThan(0);
      expect(QUIRKS).toContain(card.quirk);
      expect(card.gpa).toBeGreaterThanOrEqual(GPA_MIN);
      expect(card.gpa).toBeLessThanOrEqual(GPA_MAX);
      // One decimal, as the card shows it.
      expect(card.gpa.toFixed(1)).toBe(String(card.gpa).includes('.') ? String(card.gpa) : `${card.gpa}.0`);
      expect(STATUSES).toContain(card.relationship.name);
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
      expect(Math.abs(card.happiness - approval.score)).toBeLessThanOrEqual(TEMPERAMENT_SPREAD + RELATIONSHIP_POINTS + 0.5);
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
      return home !== null && (partLevel(approvalAt(state, home).causes, 'green') ?? 1) < 0.6 && emptyNear(state, home).length >= 3;
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
      expect(studentCard(better, ref)!.gpa).toBeGreaterThanOrEqual(studentCard(state, ref)!.gpa);
    }
  });

  it('puts Scholars above Slackers on average', () => {
    const state = bigCampus();
    const mean = (who: string): number => {
      const cards = sampleStudents(state).map((ref) => studentCard(state, ref)!).filter((card) => card.archetype === who);
      expect(cards.length).toBeGreaterThan(5);
      return cards.reduce((sum, card) => sum + card.gpa, 0) / cards.length;
    };
    expect(mean('scholar')).toBeGreaterThan(mean('slacker') + 0.4);
  });

  it('changes nothing in the game and draws from no random stream', () => {
    const state = withStudents();
    const copy = structuredClone(state);
    for (const ref of sampleStudents(state)) studentCard(state, ref);
    expect(state).toEqual(copy);
  });

  it('keeps a relationship status for the whole semester and lets it change at an intake', () => {
    const fall = withStudents();
    const laterInFall = advance(fall, fall.clock.lastSimulatedAt, T0 + 2 * DAY).state;
    const spring = advance(fall, fall.clock.lastSimulatedAt, T0 + 3 * DAY + 2 * HOUR).state;
    expect(semesterOf(laterInFall)).toBe(semesterOf(fall));
    expect(semesterOf(spring)).toBe(semesterOf(fall) + 1);

    let changed = 0;
    const students = sampleStudents(fall);
    for (const ref of students) {
      const card = studentCard(fall, ref)!;
      const social = socialLife(fall);
      const first = relationshipOf(fall.seed, ref, semesterOf(fall), 'scholar', social);
      // The same semester and the same social life give the same status, whenever it is asked.
      expect(relationshipOf(laterInFall.seed, ref, semesterOf(laterInFall), 'scholar', social)).toEqual(first);
      const next = relationshipOf(spring.seed, ref, semesterOf(spring), 'scholar', social);
      if (next.id !== first.id) changed += 1;
      expect(STATUSES).toContain(card.relationship.name);
    }
    // A little story: some move on at the intake, most do not.
    expect(changed).toBeGreaterThan(students.length * 0.2);
    expect(changed).toBeLessThan(students.length * 0.8);
  });

  it('cancels the relationship points across the campus, except for what social life adds', () => {
    const mean = (social: number): number => {
      let sum = 0;
      const total = 8000;
      for (let index = 0; index < total; index++) {
        sum += relationshipOf(42, { entryYear: 1 + (index % 3), index }, 5, index % 2 === 0 ? 'charmer' : 'scholar', social).points;
      }
      return sum / total;
    };
    // A middling social life: the pushes up and down cancel.
    expect(Math.abs(mean(0.5))).toBeLessThan(0.2);
    // Only social life moves the average, and only a little.
    expect(mean(1)).toBeGreaterThan(1);
    expect(mean(0)).toBeLessThan(-1);
    expect(Math.abs(mean(1))).toBeLessThanOrEqual(RELATIONSHIP_POINTS);
  });

  it('keeps the same average for every nature', () => {
    for (const nature of ['charmer', 'scholar', 'commuter', 'butterfly', 'slacker'] as const) {
      let sum = 0;
      for (let index = 0; index < 6000; index++) sum += relationshipOf(7, { entryYear: 1, index }, 3, nature, 0.5).points;
      expect(Math.abs(sum / 6000)).toBeLessThan(0.25);
    }
  });

  it('never gives the relationship as the reason, and hints at thin social life', () => {
    const state = withStudents();
    for (const ref of sampleStudents(state)) {
      const card = studentCard(state, ref)!;
      expect(['walk', 'grounds', 'life', 'safety']).toContain(card.reason!.cause);
      expect(['walk', 'green', 'clean', 'seating', 'dining', 'recreation', 'safety']).toContain(card.reason!.part);
      expect(Math.abs(card.relationship.points)).toBe(RELATIONSHIP_POINTS);
    }
    const thin = relationshipOf(1, { entryYear: 1, index: 0 }, 0, 'scholar', 0);
    const looking = Array.from({ length: 400 }, (_, index) => relationshipOf(1, { entryYear: 1, index }, 0, 'scholar', SOCIAL_THIN - 0.1)).find(
      (status) => status.id === 'singleLooking',
    );
    expect(looking!.note).toBe(RELATIONSHIP_NOTES.thin);
    expect(thin.points).toBe(-RELATIONSHIP_POINTS);
    const lively = Array.from({ length: 400 }, (_, index) => relationshipOf(1, { entryYear: 1, index }, 0, 'scholar', 0.9)).find(
      (status) => status.id === 'singleLooking',
    );
    expect(lively!.note).toBe(RELATIONSHIP_NOTES.lessHappy);
  });

  it('reads social life from the places there are to meet', () => {
    const state = bigCampus();
    const dorm = state.map.buildings.find((b) => b && b.zone === 'housing')!;
    const livelier = plantQuad(state, emptyNear(state, dorm.y * state.map.width + dorm.x).slice(0, 4));
    expect(socialLife(livelier)).toBeGreaterThan(socialLife(state));
  });

  it('keeps every line inside the tone guide', () => {
    const banned = /\b(smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?)\b/i;
    const lines = [
      ...Object.values(ARCHETYPE_NAMES),
      ...QUIRKS,
      ...CLUBS.map((club) => club.name),
      ...Object.values(THOUGHTS).flat(),
      ...STATUSES,
      ...Object.values(RELATIONSHIP_NOTES),
    ];
    for (const line of lines) expect(line).not.toMatch(banned);
  });
});
