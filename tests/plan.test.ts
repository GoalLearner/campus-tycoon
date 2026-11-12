import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  enrollment,
  FOUNDING_CLASS,
  freeTownPlaces,
  localsAmong,
  offCampusNow,
  townPlaces,
  openCapacity,
  roomPlan,
  rowBetween,
  waitlistOpen,
  ZONES,
  type GameState,
  type Point,
  type Tool,
} from '../src/sim';
import { freshGame, MIN, T0 } from './helpers';

function paint(state: GameState, tool: Tool, cells: Point[]): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Empty cells that touch one of the starter spines. */
const NORTH = [...rowBetween([8, 13], [9, 13]), ...rowBetween([13, 13], [23, 13]), ...rowBetween([8, 15], [13, 15])];
const SOUTH = [...rowBetween([8, 18], [18, 18]), ...rowBetween([22, 18], [23, 18]), ...rowBetween([8, 16], [13, 16])];

describe('the room plan', () => {
  it('plans for the founding class before anyone has arrived', () => {
    const state = freshGame();
    const plan = roomPlan(state);
    expect(plan.goal).toBe('nextClass');
    expect(plan.students).toBe(FOUNDING_CLASS);
    // 400 students need 400 seats. 160 of them are locals, and the ones the first neighbourhood
    // has room for live there. Everyone else needs a bed. The starter campus has 36 beds and 60 seats.
    const places = townPlaces(state.map).total;
    expect(places).toBeGreaterThanOrEqual(90);
    const short = 400 - Math.min(localsAmong(400), places) - 36;
    expect(plan.zones.housing).toEqual({ short, building: 0, lots: Math.ceil(short / 12), perLot: 12 });
    expect(plan.zones.academic).toEqual({ short: 340, building: 0, lots: 17, perLot: 20 });
  });

  it('plans for the waitlist while one is open', () => {
    const state = advance(freshGame(), T0, T0 + 16 * MIN).state;
    expect(waitlistOpen(state)).toBe(true);
    const plan = roomPlan(state);
    expect(plan.goal).toBe('waitlist');
    expect(plan.students).toBe(state.admissions.waitlist);
    // Everyone enrolled plus everyone waiting is the founding class again.
    expect(enrollment(state) + plan.students).toBe(FOUNDING_CLASS);
    // Beds are for everyone who will not be living in town.
    const inTown = offCampusNow(state) + Math.min(state.admissions.waitlistLocals, freeTownPlaces(state));
    expect(plan.zones.housing.short).toBe(400 - inTown - openCapacity(state, 'housing'));
    expect(plan.zones.academic.short).toBe(400 - openCapacity(state, 'academic'));
  });

  it('asks for the fewest lots that cover the shortage', () => {
    const state = advance(freshGame(), T0, T0 + 16 * MIN).state;
    const plan = roomPlan(state);
    for (const zone of ZONES) {
      const z = plan.zones[zone];
      expect(z.building + z.lots * z.perLot).toBeGreaterThanOrEqual(z.short);
      if (z.lots > 0) expect(z.building + (z.lots - 1) * z.perLot).toBeLessThan(z.short);
    }
  });

  it('counts lots that are already building', () => {
    let state = advance(freshGame(), T0, T0 + 16 * MIN).state;
    state.money.cash = 5_000_000;
    const before = roomPlan(state).zones.academic;
    state = paint(state, 'academic', SOUTH.slice(0, 5));
    const after = roomPlan(state).zones.academic;
    // Five new lots are 100 seats on the way, so five fewer lots are asked for.
    expect(after.building).toBe(before.building + 100);
    expect(after.lots).toBe(before.lots - 5);
    expect(after.short).toBe(before.short);
  });

  it('zoning exactly what it asks for admits the whole waitlist', () => {
    let state = advance(freshGame(), T0, T0 + 16 * MIN).state;
    state.money.cash = 5_000_000;
    const plan = roomPlan(state);
    state = paint(state, 'housing', NORTH.slice(0, plan.zones.housing.lots));
    state = paint(state, 'academic', SOUTH.slice(0, plan.zones.academic.lots));
    // Long enough for anything the plan counted as already building to open.
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 15 * MIN).state;
    expect(later.admissions.waitlist).toBe(0);
    expect(enrollment(later)).toBe(FOUNDING_CLASS);
    expect(openCapacity(later, 'academic')).toBeGreaterThanOrEqual(FOUNDING_CLASS);
    const after = roomPlan(later);
    expect(after.goal).toBe('nextClass');
  });
});
