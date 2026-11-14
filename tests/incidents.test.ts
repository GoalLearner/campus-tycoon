import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  campusHappiness,
  enrollment,
  INCIDENT_LINES,
  LINGER_TICKS,
  MAX_ACTIVE_INCIDENTS,
  openCapacity,
  parseSave,
  dormStudents,
  offCampusNow,
  safetyAt,
  SAFETY_LEVELS,
  SAVE_VERSION,
  serialize,
  type GameState,
  type LogEntry,
  type PlacedType,
} from '../src/sim';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

function place(state: GameState, building: PlacedType, x: number, y: number): GameState {
  const result = applyAction(state, { type: 'place', building, x, y });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A campus with students, money, and somewhere to play: courts by the first dorms. */
function busy(students = 3000): GameState {
  let state = advance(freshGame(), T0, T0 + 20 * MIN).state;
  state = structuredClone(state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  return place(state, 'courts', 8, 10);
}

function run(state: GameState, minutes: number): { state: GameState; log: LogEntry[] } {
  const result = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + minutes * MIN);
  return { state: result.state, log: result.log.filter((entry) => entry.kind === 'incident') };
}

describe('coverage', () => {
  it('makes a spot feel safer inside each kind of circle', () => {
    let state = busy();
    expect(safetyAt(state, 10, 13)).toBeCloseTo(SAFETY_LEVELS.base);
    state = place(state, 'medical', 6, 10);
    expect(safetyAt(state, 10, 13)).toBeCloseTo(SAFETY_LEVELS.base + SAFETY_LEVELS.medical);
    state = place(state, 'safety', 12, 10);
    expect(safetyAt(state, 10, 13)).toBeCloseTo(1);
    // Far from both, nothing has changed.
    expect(safetyAt(state, 30, 30)).toBeCloseTo(SAFETY_LEVELS.base);
  });

  it('raises happiness, with safety as one of its causes', () => {
    const bare = busy();
    const covered = place(place(bare, 'medical', 6, 10), 'safety', 12, 10);
    expect(campusHappiness(bare).causes.map((cause) => cause.id)).toContain('safety');
    expect(campusHappiness(covered).score).toBeGreaterThan(campusHappiness(bare).score);
  });
});

describe('incidents', () => {
  it('are handled when a circle covers them, sooner than they would linger', () => {
    const state = place(place(busy(), 'medical', 6, 10), 'safety', 12, 10);
    const { state: after, log } = run(state, 6 * 60);
    expect(log.length).toBeGreaterThan(3);
    expect(log.every((entry) => entry.data?.handled === 1)).toBe(true);
    expect(after.incidents.handled).toBe(log.length);
    expect(after.incidents.missed).toBe(0);
    expect(log.some((entry) => entry.text.startsWith('Medical Center handled it'))).toBe(true);
    // No incident was open for anything like the time it takes to pass unanswered.
    for (const incident of after.incidents.active) expect(incident.endTick - incident.startTick).toBeLessThan(LINGER_TICKS / 2);
  });

  it('linger with nobody coming, cost a little safety nearby, then pass and say what would have helped', () => {
    const state = busy();
    const { state: after, log } = run(state, 6 * 60);
    expect(after.incidents.handled).toBe(0);
    expect(after.incidents.missed).toBeGreaterThan(3);
    expect(log.every((entry) => entry.data?.handled === 0)).toBe(true);
    expect(log.some((entry) => /A Medical Center in reach of the Outdoor courts would have handled it/.test(entry.text))).toBe(true);
    expect(log.some((entry) => /Campus Safety in reach of that dorm would have handled it/.test(entry.text))).toBe(true);

    // While one is open, the spot beside it feels a little less safe. It is never below zero.
    let step = state;
    let dipped = false;
    for (let minute = 0; minute < 6 * 60; minute += 5) {
      step = run(step, 5).state;
      expect(step.incidents.active.length).toBeLessThanOrEqual(MAX_ACTIVE_INCIDENTS);
      for (const incident of step.incidents.active) {
        const level = safetyAt(step, incident.x, incident.y);
        expect(level).toBeGreaterThanOrEqual(0);
        if (level < SAFETY_LEVELS.base - 0.01) dipped = true;
      }
    }
    expect(dipped).toBe(true);
  });

  it('send the responder sooner from a nearer building', () => {
    const near = run(place(busy(), 'medical', 6, 10), 4 * 60).state;
    const far = run(place(busy(), 'medical', 0, 3), 4 * 60).state;
    const waits = (state: GameState): number[] => state.incidents.active.filter((i) => i.kind === 'injury' && i.responder !== null).map((i) => i.endTick - i.startTick);
    // The same incidents happen in both. Only the walk differs.
    let nearWait = 0;
    let farWait = 0;
    let a = place(busy(), 'medical', 6, 10);
    let b = place(busy(), 'medical', 0, 3);
    for (let minute = 0; minute < 4 * 60; minute += 1) {
      a = run(a, 1).state;
      b = run(b, 1).state;
      nearWait = Math.max(nearWait, ...waits(a), 0);
      farWait = Math.max(farWait, ...waits(b), 0);
    }
    expect(near.incidents.handled).toBeGreaterThan(0);
    expect(far.incidents.handled).toBeGreaterThan(0);
    expect(farWait).toBeGreaterThan(nearWait);
  });

  it('come more often with more students', () => {
    const few = run(busy(200), 2 * DAY / MIN).state;
    const many = run(busy(3000), 2 * DAY / MIN).state;
    const total = (state: GameState): number => state.incidents.handled + state.incidents.missed;
    expect(total(many)).toBeGreaterThan(total(few) * 3);
  });

  it('turn out the same whether the player watches or is away', () => {
    const start = place(busy(), 'medical', 6, 10);
    const end = start.clock.lastSimulatedAt + 8 * HOUR;
    const once = advance(start, start.clock.lastSimulatedAt, end);
    let stepped = start;
    const log: LogEntry[] = [];
    for (let at = start.clock.lastSimulatedAt + 7 * MIN; at < end; at += 7 * MIN) {
      const result = advance(stepped, stepped.clock.lastSimulatedAt, at);
      stepped = result.state;
      log.push(...result.log);
    }
    const last = advance(stepped, stepped.clock.lastSimulatedAt, end);
    log.push(...last.log);
    expect(last.state.incidents).toEqual(once.state.incidents);
    expect(log.filter((e) => e.kind === 'incident')).toEqual(once.log.filter((e) => e.kind === 'incident'));
  });

  it('never drag happiness down without end on a campus with no coverage', () => {
    let state = busy();
    // The four causes alone: the exam dip of the calendar is a separate line and is not what this is about.
    const first = campusHappiness(state).base;
    let lowest = first;
    for (let hour = 0; hour < 5 * 24; hour += 3) {
      state = run(state, 180).state;
      lowest = Math.min(lowest, campusHappiness(state).base);
    }
    // It dips while incidents are open and comes back. It cannot fall by more than the safety cause holds.
    expect(lowest).toBeGreaterThan(first - 12);
    expect(state.incidents.active.length).toBeLessThanOrEqual(MAX_ACTIVE_INCIDENTS);
  });

  it('keep every line inside the tone guide', () => {
    const banned = /\b(smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*)\b/i;
    for (const line of [...INCIDENT_LINES.injury, ...INCIDENT_LINES.mischief]) expect(line).not.toMatch(banned);
  });
});

describe('students with no bed', () => {
  it('leave at the end of the semester when their dorms are cleared', () => {
    let state = advance(freshGame(), T0, T0 + 20 * MIN).state;
    const before = enrollment(state);
    // Clear two of the three starter dorms.
    const cleared = applyAction(state, { type: 'paint', tool: 'clear', cells: [[10, 13], [11, 13]] });
    if (!cleared.ok) throw new Error(cleared.error);
    state = cleared.state;
    // More students live in dorms than there are beds left.
    expect(dormStudents(state)).toBeGreaterThan(openCapacity(state, 'housing'));
    // Still enrolled for now: room only limits who is admitted.
    expect(enrollment(state)).toBe(before);
    const result = advance(state, state.clock.lastSimulatedAt, T0 + 3 * DAY + HOUR);
    expect(result.state.admissions.lastSemester).not.toBeNull();
    // The dorm that was left may have grown meanwhile. Nobody stays in a dorm beyond the beds there
    // are now. Those who live in town are not affected.
    expect(dormStudents(result.state)).toBeLessThanOrEqual(openCapacity(result.state, 'housing'));
    expect(offCampusNow(result.state)).toBeGreaterThan(0);
    expect(result.state.admissions.lastSemester!.stayed).toBeLessThan(before);
  });
});

describe('upgrading a version 4 save', () => {
  const file = join(__dirname, 'fixtures', 'save-v4.json');

  it('gains an empty incident book and runs on', () => {
    if (!existsSync(file)) {
      const state = advance(freshGame(13), T0, T0 + 40 * MIN).state;
      const raw = JSON.parse(serialize(state, T0 + 40 * MIN)) as { v: number; state: Record<string, unknown> };
      raw.v = 4;
      raw.state.version = 4;
      delete raw.state.incidents;
      writeFileSync(file, JSON.stringify(raw));
    }
    const loaded = parseSave(readFileSync(file, 'utf8'));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(4);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.state.incidents).toEqual({ active: [], nextId: 1, handled: 0, missed: 0 });
    const later = advance(loaded.state, loaded.state.clock.lastSimulatedAt, loaded.state.clock.lastSimulatedAt + DAY).state;
    expect(enrollment(later)).toBeGreaterThan(0);
  });
});
