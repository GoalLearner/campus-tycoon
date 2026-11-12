import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptanceRate,
  advance,
  applyAction,
  approvalAt,
  buildingAt,
  campusHappiness,
  enrollment,
  fedAt,
  lotStatus,
  parseSave,
  partLevel,
  PLACED,
  placedAt,
  previewPlace,
  recreationAt,
  retentionRate,
  RETENTION_FLOOR,
  RETENTION_SPAN,
  sampleStudents,
  SAVE_VERSION,
  scoreParts,
  storePassers,
  studentCard,
  studentHome,
  upkeepPerYear,
  type GameState,
  type PlacedType,
  type Point,
  type Tool,
} from '../src/sim';
import { DAY, freshGame, MIN, T0 } from './helpers';

function rich(state: GameState): GameState {
  const copy = structuredClone(state);
  copy.money.cash = 10_000_000;
  return copy;
}

function place(state: GameState, building: PlacedType, x: number, y: number): GameState {
  const result = applyAction(state, { type: 'place', building, x, y });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const cellOf = (state: GameState, x: number, y: number): number => y * state.map.width + x;

describe('placing buildings', () => {
  it('starts a campus with a dining hall and the Administration building', () => {
    const state = freshGame();
    const types = state.map.placed.map((p) => p?.type);
    // And two trash bins beside the dining hall.
    expect(types).toEqual(['dining', 'admin', 'bin', 'bin', 'stadium']);
    // The first dorms are fed, so they can grow past their first stage.
    expect(fedAt(state.map, 10, 13)).toBe(true);
  });

  it('takes the cost, covers its cells and adds its upkeep', () => {
    const before = rich(freshGame());
    const after = place(before, 'library', 3, 3);
    expect(before.money.cash - after.money.cash).toBe(PLACED.library.cost);
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]] as const) {
      expect(after.map.cells[cellOf(after, x, y)]!.kind).toBe('placed');
      expect(placedAt(after.map, x, y)?.type).toBe('library');
    }
    expect(upkeepPerYear(after) - upkeepPerYear(before)).toBe(PLACED.library.upkeepPerYear);
    // The state it was placed on is untouched.
    expect(before.map.cells[cellOf(before, 3, 3)]!.kind).toBe('empty');
  });

  it('refuses ground that is taken, off the map, or beyond the budget', () => {
    const state = freshGame();
    expect(previewPlace(state, 'library', 14, 14).problem).toBe('blocked');
    expect(previewPlace(state, 'library', 31, 31).problem).toBe('offMap');
    const poor = structuredClone(state);
    poor.money.cash = 100;
    expect(previewPlace(poor, 'library', 3, 3).problem).toBe('cash');
    expect(applyAction(poor, { type: 'place', building: 'library', x: 3, y: 3 }).ok).toBe(false);
    expect(applyAction(state, { type: 'place', building: 'admin', x: 3, y: 3 }).ok).toBe(false);
  });

  it('clears a whole building from any of its cells, but not the one the campus began with', () => {
    let state = place(rich(freshGame()), 'track', 3, 3);
    state = paint(state, 'clear', [[4, 4]]);
    expect(state.map.placed.find((p) => p?.type === 'track')).toBeUndefined();
    expect(state.map.cells[cellOf(state, 3, 3)]!.kind).toBe('empty');

    const admin = state.map.placed.find((p) => p?.type === 'admin')!;
    expect(applyAction(state, { type: 'paint', tool: 'clear', cells: [[admin.x, admin.y]] }).ok).toBe(false);
  });
});

describe('what the buildings do', () => {
  it('lifts Academic lots near a library, and only Academic lots', () => {
    let state = rich(freshGame());
    state = paint(state, 'academic', [[3, 6]]);
    state = paint(state, 'housing', [[4, 6]]);
    const academicBefore = state.map.score[cellOf(state, 3, 6)]!;
    const housingBefore = state.map.score[cellOf(state, 4, 6)]!;
    state = place(state, 'library', 3, 3);
    expect(state.map.score[cellOf(state, 3, 6)]!).toBeGreaterThan(academicBefore + 5);
    expect(state.map.score[cellOf(state, 4, 6)]!).toBe(housingBefore);
    expect(scoreParts(state.map, 3, 6, 'academic', -1).library).toBeGreaterThan(0);
  });

  it('counts water as green space, inside the same cap as quads', () => {
    let state = rich(freshGame());
    state = paint(state, 'housing', [[3, 6]]);
    const bare = scoreParts(state.map, 3, 6, 'housing', -1).green;
    state = place(state, 'pondSmall', 3, 5);
    const withPond = scoreParts(state.map, 3, 6, 'housing', -1).green;
    expect(withPond).toBeGreaterThan(bare);
    // A lake and a field of quads on top cannot push green space past its cap.
    state = place(state, 'pondLarge', 5, 4);
    state = paint(state, 'quad', [[2, 4], [2, 5], [2, 6], [2, 7], [3, 7], [4, 7]]);
    expect(scoreParts(state.map, 3, 6, 'housing', -1).green).toBe(40);
  });

  it('holds a dorm at its first stage until dining is in reach', () => {
    let state = rich(freshGame());
    // Far from the starter dining hall, with a quad so desirability is not the problem.
    state = paint(state, 'housing', [[22, 13]]);
    state = paint(state, 'quad', [[22, 12], [23, 12]]);
    state = advance(state, T0, T0 + 5 * MIN).state;
    expect(buildingAt(state.map, 22, 13)?.stage).toBe(1);
    expect(lotStatus(state, 22, 13)).toMatchObject({ kind: 'stalled', cause: 'noDining', nextStage: 2 });

    const now = state.clock.lastSimulatedAt;
    state = place(state, 'coffee', 24, 13);
    expect(fedAt(state.map, 22, 13)).toBe(true);
    expect(lotStatus(state, 22, 13)?.kind).toBe('building');
    state = advance(state, now, now + 15 * MIN).state;
    expect(buildingAt(state.map, 22, 13)?.stage).toBe(2);
  });

  it('adds recreation up to one cap', () => {
    let state = rich(freshGame());
    expect(recreationAt(state, 10, 13)).toBe(0);
    state = place(state, 'courts', 8, 10);
    expect(recreationAt(state, 10, 13)).toBeCloseTo(PLACED.courts.strength);
    state = place(state, 'gym', 10, 11);
    state = place(state, 'track', 12, 10);
    expect(recreationAt(state, 10, 13)).toBe(1);
  });

  it('earns more at a store beside a busier path', () => {
    let state = advance(freshGame(), T0, T0 + 20 * MIN).state;
    state = rich(state);
    // One store on the main walk, one on a path that leads nowhere.
    state = place(state, 'store', 8, 15);
    state = paint(state, 'path', [[2, 28], [3, 28]]);
    state = place(state, 'store', 2, 27);
    const [busy, quiet] = state.map.placed.filter((p) => p?.type === 'store');
    expect(storePassers(state, busy!)).toBeGreaterThan(0);
    expect(storePassers(state, quiet!)).toBe(0);

    const before = structuredClone(state);
    const removed = paint(state, 'clear', [[8, 15]]);
    const after = advance(removed, removed.clock.lastSimulatedAt, removed.clock.lastSimulatedAt + MIN).state;
    const withStore = advance(before, before.clock.lastSimulatedAt, before.clock.lastSimulatedAt + MIN).state;
    expect(withStore.money.incomePerYear).toBeGreaterThan(after.money.incomePerYear);
  });
});

describe('happiness', () => {
  function campus(): GameState {
    return advance(freshGame(), T0, T0 + 20 * MIN).state;
  }

  it('is the average of what the student cards read', () => {
    const state = structuredClone(campus());
    state.cohorts = [900, 0, 0, 0];
    let sum = 0;
    const students = sampleStudents(state, 900);
    for (const ref of students) {
      const card = studentCard(state, ref)!;
      const spots = card.home !== null ? [card.home] : [];
      // The card's own happiness carries small personal pushes that cancel across the campus.
      sum += card.happiness;
      expect(spots.length).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(sum / students.length - campusHappiness(state).score)).toBeLessThan(2.5);
  });

  it('names the cause whose fix would help most, and rises when it is fixed', () => {
    let state = rich(campus());
    const before = campusHappiness(state);
    // The cause it names is the one with the most to gain, and the part it names is that cause's weakest.
    const toGain = (cause: (typeof before.causes)[number]): number => cause.weight * (1 - cause.level);
    const named = before.causes.find((cause) => cause.id === before.worst)!;
    for (const cause of before.causes) expect(toGain(named)).toBeGreaterThanOrEqual(toGain(cause) - 1e-9);
    for (const part of named.parts) expect(partLevel(before.causes, before.worstPart!)).toBeLessThanOrEqual(part.level + 1e-9);
    // The starter campus has a dining hall by its dorms and nothing to do: inside Food & fun, food is fine and fun is not.
    expect(partLevel(before.causes, 'dining')).toBeGreaterThan(0.5);
    expect(partLevel(before.causes, 'recreation')).toBeLessThan(0.1);
    state = place(state, 'gym', 11, 11);
    state = place(state, 'courts', 17, 19);
    const after = campusHappiness(state);
    expect(after.score).toBeGreaterThan(before.score + 2);
    expect(partLevel(after.causes, 'recreation')).toBeGreaterThan(0.3);
    expect(after.causes.find((c) => c.id === 'life')!.level).toBeGreaterThan(before.causes.find((c) => c.id === 'life')!.level);
  });

  it('sets how many students stay', () => {
    const state = rich(campus());
    const dull = retentionRate(state);
    expect(dull).toBeGreaterThanOrEqual(RETENTION_FLOOR);
    expect(dull).toBeLessThanOrEqual(RETENTION_FLOOR + RETENTION_SPAN);
    const lively = retentionRate(place(place(state, 'gym', 11, 11), 'track', 17, 19));
    expect(lively).toBeGreaterThan(dull);
  });

  it('reads recreation and dining on a card as soon as they are built', () => {
    let state = rich(campus());
    const resident = sampleStudents(state).find((ref) => studentHome(state, ref) !== null)!;
    const home = studentHome(state, resident)!;
    const before = approvalAt(state, home);
    // Four causes, never more, and every one counts the same.
    expect(before.causes.map((c) => c.id)).toEqual(['walk', 'grounds', 'life', 'safety']);
    expect(before.causes.find((c) => c.id === 'grounds')!.parts.map((part) => part.id)).toEqual(['green', 'clean', 'seating']);
    expect(before.causes.every((c) => c.weight === 1)).toBe(true);
    expect(before.causes.find((c) => c.id === 'life')!.parts.map((part) => part.id)).toEqual(['dining', 'recreation']);
    expect(before.score).toBeCloseTo(25 * before.causes.reduce((sum, c) => sum + c.level, 0));
    state = place(state, 'gym', 11, 11);
    expect(approvalAt(state, home).score).toBeGreaterThan(before.score);
    expect(studentCard(state, resident)!.happiness).toBeGreaterThan(studentCard(rich(campus()), resident)!.happiness);
  });
});

describe('the metrics pieces', () => {
  it('keeps a record of every entering class that always adds up', () => {
    let state = freshGame();
    for (const days of [9, 18, 30]) {
      state = advance(state, state.clock.lastSimulatedAt, T0 + days * DAY).state;
      for (const record of state.classes) {
        const year = Math.floor((state.clock.tick - 15) / (7 * 24 * 60)) + 1;
        const classYear = year - record.entryYear;
        const here = classYear >= 0 && classYear <= 3 ? state.cohorts[classYear]! : 0;
        // Everyone who entered is still here, has left, or has finished.
        expect(record.entered).toBe(here + record.left + record.finishedOnTime + record.finishedLate);
      }
    }
    expect(state.classes.length).toBeGreaterThanOrEqual(4);
    expect(state.classes[0]!.finishedOnTime).toBeGreaterThan(0);
    expect(state.classes[0]!.left).toBeGreaterThan(0);
  });

  it('says how the last semester ended', () => {
    const result = advance(freshGame(), T0, T0 + 4 * DAY);
    const last = result.state.admissions.lastSemester!;
    expect(last.stayed + last.left).toBeGreaterThan(0);
    expect(result.log.some((entry) => entry.kind === 'semester')).toBe(true);
  });

  it('reports the acceptance rate of the last intake', () => {
    expect(acceptanceRate(freshGame())).toBeNull();
    const state = advance(freshGame(), T0, T0 + 20 * MIN).state;
    const last = state.admissions.lastIntake!;
    expect(acceptanceRate(state)).toBeCloseTo((last.admitted + state.admissions.waitlistAdmitted) / last.expected);
    expect(acceptanceRate(state)!).toBeLessThan(1);
  });
});

describe('upgrading an older save', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v2.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState }).state;

  it('loads a version 2 save with nothing moved and nothing lost', () => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(2);
    const state = loaded.state;
    expect(state.version).toBe(SAVE_VERSION);
    expect(enrollment(state)).toBe(old.cohorts.reduce((a, b) => a + b, 0));
    expect(state.money.cash).toBe(old.money.cash);
    expect(state.map.buildings).toEqual(old.map.buildings);
    // The map has grown since. Every old cell is where it was, by x and y.
    old.map.cells.forEach((was, i) => {
      const x = i % old.map.width;
      const y = Math.floor(i / old.map.width);
      const cell = state.map.cells[y * state.map.width + x]!;
      expect(cell.kind).toBe(was.kind);
      expect(cell.placedId).toBeNull();
    });
    expect(state.map.placed).toEqual([]);
    expect(state.admissions.lastSemester).toBeNull();
    // Each class already here gets a record that starts from today's headcount.
    expect(state.classes.reduce((sum, record) => sum + record.entered, 0)).toBe(enrollment(state));
  });

  it('gives the same result every time, and the game runs on from it', () => {
    const first = parseSave(text);
    const second = parseSave(text);
    if (!first.ok || !second.ok) throw new Error('The fixture did not load.');
    expect(second.state).toEqual(first.state);
    const later = advance(first.state, first.state.clock.lastSimulatedAt, first.state.clock.lastSimulatedAt + 10 * DAY).state;
    expect(enrollment(later)).toBeGreaterThan(0);
    expect(later.classes.length).toBeGreaterThan(first.state.classes.length);
  });
});
