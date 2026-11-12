import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  besideRecreation,
  budget,
  buildingAt,
  BUILD_ORDER,
  campusHappiness,
  fedAt,
  FOOD_INCOME_PER_STUDENT,
  foodIncomePerYear,
  foodKindsAt,
  foodTrade,
  foodTypesAt,
  isFood,
  isMessSpot,
  libraryLift,
  lotStatus,
  parseSave,
  PLACED,
  playUse,
  previewPaint,
  recreationAt,
  REFUND_SHARE,
  sampleStudents,
  SAVE_VERSION,
  serialize,
  socialLife,
  studentCard,
  TUTORING_GPA,
  tutoredAt,
  VARIETY_BONUS,
  VARIETY_KINDS,
  varietyAt,
  type Action,
  type GameState,
  type Placed,
  type PlacedType,
} from '../src/sim';
import { FAVOURITES, THOUGHTS } from '../src/sim/config/students';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { buildEntries, moneyView, placedSummary } from '../src/ui/buildUi';
import { DAY, freshGame, MIN, T0 } from './helpers';

/**
 * Play stop 4b (DESIGN.md section 30): eight more places to eat, variety,
 * shared food income, and three Academics buildings with one effect each.
 *
 * The starter campus: dorms at 10 to 12, 13 with the dining hall just north of
 * them, and lecture halls at 19 to 21, 18, out of the dining hall's reach.
 */

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const place = (state: GameState, building: PlacedType, x: number, y: number): GameState => act(state, { type: 'place', building, x, y });

function campus(students: number): GameState {
  const state = structuredClone(advance(freshGame(), T0, T0 + 20 * MIN).state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  state.admissions.waitlist = 0;
  return state;
}

const first = (state: GameState, type: PlacedType): Placed => state.map.placed.find((placed) => placed?.type === type)!;
const life = (state: GameState, x: number, y: number) => approvalAt(state, y * state.map.width + x).causes.find((cause) => cause.id === 'life')!;

const NEW_FOOD: readonly PlacedType[] = ['truck', 'convenience', 'taco', 'smoothie', 'pizza', 'burger', 'diner', 'foodcourt'];
/** A dorm's cell, and a lecture hall's. */
const DORM = [11, 13] as const;
const HALL = [20, 18] as const;

describe('the eight new places to eat', () => {
  it('are each the dining rule at their own size, price and reach', () => {
    const table: Record<string, [number, number, number, number]> = {
      truck: [1, 1, 8_000, 2],
      convenience: [1, 1, 9_000, 2],
      taco: [2, 1, 10_000, 3],
      smoothie: [1, 1, 10_000, 3],
      pizza: [2, 1, 14_000, 3],
      burger: [2, 1, 30_000, 5],
      diner: [2, 1, 36_000, 5],
      foodcourt: [2, 2, 140_000, 7],
    };
    for (const type of NEW_FOOD) {
      const spec = PLACED[type];
      expect([spec.w, spec.h, spec.cost, spec.radius], type).toEqual(table[type]);
      expect(spec.family, type).toBe('dining');
      expect(spec.category, type).toBe('Food');
      expect(BUILD_ORDER, type).toContain(type);
      // Upkeep is about a twelfth of the price a year.
      expect(spec.upkeepPerYear, type).toBeGreaterThan(spec.cost / 14);
      expect(spec.upkeepPerYear, type).toBeLessThan(spec.cost / 10);
    }
    // The pizza place and the taco stand are two cells wide with their patios, as drawn.
    expect([PLACED.pizza.w, PLACED.taco.w]).toEqual([2, 2]);
  });

  it('feed the lots within their reach and no further', () => {
    for (const type of NEW_FOOD) {
      const spec = PLACED[type];
      // In open ground to the south-west, with a lot exactly at the edge of its reach and one a cell beyond.
      let state = campus(100);
      state = place(state, type, 4, 24);
      const edge = 4 + spec.w - 1 + spec.radius;
      expect(fedAt(state.map, edge, 24), type).toBe(true);
      expect(fedAt(state.map, edge + 1, 24), type).toBe(false);
      expect(isFood(first(state, type)), type).toBe(true);
    }
  });

  it('let Housing grow past its first stage: any of them, like the dining hall', () => {
    for (const type of NEW_FOOD) {
      let state = campus(100);
      // Far from the starter dining hall, with a quad so desirability is not the problem.
      state = act(state, { type: 'paint', tool: 'housing', cells: [[22, 13]] });
      state = act(state, { type: 'paint', tool: 'quad', cells: [[22, 12], [23, 12]] });
      state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 5 * MIN).state;
      expect(buildingAt(state.map, 22, 13)?.stage, type).toBe(1);
      expect(lotStatus(state, 22, 13), type).toMatchObject({ kind: 'stalled', cause: 'noDining', nextStage: 2 });
      state = place(state, type, 24, 12);
      expect(fedAt(state.map, 22, 13), type).toBe(true);
      expect(lotStatus(state, 22, 13)?.kind, type).not.toBe('stalled');
    }
  });

  it('drop litter like any place to eat, and stalls beside each other share a bin', () => {
    let state = campus(600);
    for (const type of NEW_FOOD) expect(isMessSpot({ id: 0, type, x: 0, y: 0, w: 1, h: 1, builtTick: 0 }), type).toBe(true);
    state = place(state, 'taco', 8, 15);
    state = place(state, 'pizza', 11, 15);
    state = act(state, { type: 'paint', tool: 'bin', cells: [[10, 15]] });
    const bin = first(state, 'bin');
    const mine = state.map.placed.filter((placed): placed is Placed => placed?.type === 'bin').find((placed) => placed.x === 10 && placed.y === 15)!;
    expect(bin).toBeTruthy();
    expect(state.map.care.bins[first(state, 'taco').id]).toContain(mine.id);
    expect(state.map.care.bins[first(state, 'pizza').id]).toContain(mine.id);
    // With students about, litter falls at a stall as it does at the dining hall.
    const bare = place(campus(600), 'taco', 8, 15);
    const later = advance(bare, bare.clock.lastSimulatedAt, bare.clock.lastSimulatedAt + 3 * DAY).state;
    expect(later.grounds.litter[first(later, 'taco').id] ?? 0).toBeGreaterThan(0);
  });
});

describe('variety', () => {
  it('counts the kinds of food in reach: two dining halls are one kind, and the food court is three', () => {
    let state = campus(600);
    expect(foodTypesAt(state.map, ...DORM)).toEqual(['dining']);
    expect(foodKindsAt(state.map, ...DORM)).toBe(1);
    state = place(state, 'dining', 8, 11);
    expect(foodKindsAt(state.map, ...DORM)).toBe(1);
    state = place(state, 'coffee', 9, 13);
    expect(foodKindsAt(state.map, ...DORM)).toBe(2);
    // Nothing reaches the lecture halls until a food court does, and it is three kinds by itself.
    expect(foodKindsAt(state.map, ...HALL)).toBe(0);
    state = place(state, 'foodcourt', 19, 20);
    expect(PLACED.foodcourt.kinds).toBe(3);
    expect(foodKindsAt(state.map, ...HALL)).toBe(3);
    expect(varietyAt(state.map, ...HALL)).toBe(VARIETY_BONUS);
  });

  it('adds a tenth to Food & fun at three kinds, and nothing more for a fourth', () => {
    expect(VARIETY_KINDS).toBe(3);
    expect(VARIETY_BONUS).toBe(0.1);
    let state = campus(600);
    const one = life(state, ...DORM);
    expect(varietyAt(state.map, ...DORM)).toBe(0);
    expect(one.bonus ?? 0).toBe(0);

    state = place(state, 'coffee', 9, 13);
    expect(life(state, ...DORM).level).toBeCloseTo(one.level, 9);
    expect(varietyAt(state.map, ...DORM)).toBe(0);

    const before = approvalAt(state, DORM[1] * state.map.width + DORM[0]).score;
    state = place(state, 'taco', 8, 15);
    expect(foodKindsAt(state.map, ...DORM)).toBe(3);
    const three = life(state, ...DORM);
    expect(three.level).toBeCloseTo(one.level + 0.1, 9);
    expect(three.bonus).toBeCloseTo(0.1, 9);
    // Food & fun is one of four causes, so the whole bonus is two and a half points of that lot's Happiness.
    expect(approvalAt(state, DORM[1] * state.map.width + DORM[0]).score - before).toBeCloseTo(2.5, 6);

    state = place(state, 'pizza', 11, 15);
    state = place(state, 'burger', 6, 11);
    expect(foodKindsAt(state.map, ...DORM)).toBe(5);
    expect(life(state, ...DORM).level).toBeCloseTo(three.level, 9);
    expect(life(state, ...DORM).bonus).toBeCloseTo(0.1, 9);
  });

  it('never lifts Food & fun past full', () => {
    let state = campus(600);
    // Plenty to do: recreation in reach until that half is full too.
    state = place(state, 'gym', 6, 11);
    state = place(state, 'courts', 8, 15);
    state = place(state, 'pool', 11, 15);
    state = place(state, 'track', 4, 15);
    state = structuredClone(state);
    state.cohorts = [40, 0, 0, 0];
    expect(recreationAt(state, ...DORM)).toBe(1);
    expect(life(state, ...DORM).level).toBe(1);
    state = place(state, 'coffee', 9, 13);
    state = place(state, 'truck', 13, 13);
    expect(foodKindsAt(state.map, ...DORM)).toBe(3);
    const full = life(state, ...DORM);
    expect(full.level).toBe(1);
    expect(full.bonus ?? 0).toBe(0);
    for (const cause of campusHappiness(state).causes) expect(cause.level).toBeLessThanOrEqual(1);
  });

  it('shows in the campus number exactly as it does on the lots', () => {
    let state = campus(600);
    const before = campusHappiness(state);
    state = place(state, 'coffee', 9, 13);
    state = place(state, 'taco', 8, 15);
    state = place(state, 'foodcourt', 19, 20);
    const after = campusHappiness(state);
    const campusLife = after.causes.find((cause) => cause.id === 'life')!;
    // Every dorm and every lecture hall now has three kinds in reach.
    expect(campusLife.bonus).toBeCloseTo(0.1, 9);
    const parts = campusLife.parts.reduce((sum, part) => sum + part.level, 0) / campusLife.parts.length;
    expect(campusLife.level).toBeCloseTo(parts + 0.1, 9);
    // The campus score is still the average of where students spend their days.
    const width = state.map.width;
    const dorm = approvalAt(state, DORM[1] * width + DORM[0]).score;
    const hall = approvalAt(state, HALL[1] * width + HALL[0]).score;
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.score).toBeGreaterThanOrEqual(Math.min(dorm, hall) - 1e-9);
    expect(after.score).toBeLessThanOrEqual(Math.max(dorm, hall) + 1e-9);
  });
});

describe('food income', () => {
  it('is $30 a year for each student in reach of food', () => {
    expect(FOOD_INCOME_PER_STUDENT).toBe(30);
    const state = campus(600);
    // The starter dining hall reaches the three dorms and not the three lecture halls: half the lots.
    const trade = foodTrade(state, first(state, 'dining'))!;
    expect(trade.students).toBeCloseTo(300, 9);
    expect(trade.income).toBeCloseTo(9_000, 6);
    expect(foodIncomePerYear(state)).toBeCloseTo(9_000, 6);
    expect(foodTrade(state, first(state, 'admin'))).toBeNull();
    // Nobody enrolled, nothing earned.
    const empty = structuredClone(state);
    empty.cohorts = [0, 0, 0, 0];
    expect(foodIncomePerYear(empty)).toBe(0);
  });

  it('is shared equally by the places that reach a student: a second stall halves the first', () => {
    let state = campus(600);
    state = place(state, 'coffee', 9, 13);
    const hall = foodTrade(state, first(state, 'dining'))!;
    const stand = foodTrade(state, first(state, 'coffee'))!;
    expect(hall.income).toBeCloseTo(4_500, 6);
    expect(stand.income).toBeCloseTo(4_500, 6);
    // The same students, so the campus earns no more for the second stall.
    expect(foodIncomePerYear(state)).toBeCloseTo(9_000, 6);
    // A third divides it again.
    state = place(state, 'taco', 8, 15);
    for (const type of ['dining', 'coffee', 'taco'] as const) expect(foodTrade(state, first(state, type))!.income, type).toBeCloseTo(3_000, 6);
    expect(foodIncomePerYear(state)).toBeCloseTo(9_000, 6);
    // Food where nobody could eat before is new custom: the lecture halls.
    state = place(state, 'truck', 20, 19);
    expect(foodTrade(state, first(state, 'truck'))!.income).toBeCloseTo(9_000, 6);
    expect(foodIncomePerYear(state)).toBeCloseTo(18_000, 6);
  });

  it('cannot be stacked: ten stalls on one spot earn what one did, and cost ten upkeeps', () => {
    let state = campus(600);
    const before = budget(state);
    for (const [x, y] of [[9, 13], [13, 13], [8, 13], [9, 11], [12, 11], [13, 12], [8, 12], [13, 11]] as const) state = place(state, 'coffee', x, y);
    const after = budget(state);
    expect(foodIncomePerYear(state)).toBeCloseTo(9_000, 6);
    expect(after.incomeTotal).toBeCloseTo(before.incomeTotal, 6);
    expect(after.fullSpending).toBeGreaterThan(before.fullSpending + 8 * PLACED.coffee.upkeepPerYear - 1);
  });

  it('has its own line in the Money panel, and each place its upkeep and utilities like any building', () => {
    let state = campus(600);
    const lines = budget(state).income.map((line) => line.id);
    expect(lines).toContain('food');
    const food = budget(state).income.find((line) => line.id === 'food')!;
    expect(food.name).toBe('Food places');
    expect(food.amount).toBeCloseTo(9_000, 6);
    expect(food.detail).toMatch(/1 place to eat/);
    expect(moneyView(state).income.map((row) => row.name)).toContain('Food places');
    const spendingBefore = budget(state).fullSpending;
    state = place(state, 'burger', 6, 11);
    // Upkeep, and utilities by its two cells.
    expect(budget(state).fullSpending - spendingBefore).toBeCloseTo(PLACED.burger.upkeepPerYear + 2 * 1_500, 6);
    expect(budget(state).income.find((line) => line.id === 'food')!.detail).toMatch(/2 places to eat/);
  });

  it('is counted into the rates the campus accrues by', () => {
    let state = campus(600);
    state = place(state, 'truck', 20, 19);
    const a = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 5 * MIN).state;
    expect(a.money.incomePerYear).toBeCloseTo(budget(a).incomeTotal, 6);
    expect(budget(a).incomeTotal).toBeGreaterThan(budget(campus(600)).incomeTotal);
  });
});

describe('the food truck', () => {
  it('gives its whole price back whenever it is cleared, so moving it is free', () => {
    let state = campus(600);
    const cash = state.money.cash;
    state = place(state, 'truck', 20, 19);
    state = place(state, 'coffee', 9, 13);
    expect(state.money.cash).toBe(cash - PLACED.truck.cost - PLACED.coffee.cost);
    // Days later, long past the undo minute.
    state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 3 * DAY).state;
    expect(previewPaint(state, 'clear', [[20, 19]])).toMatchObject({ refund: PLACED.truck.cost, buildings: ['truck'] });
    // Anything else gives half by then.
    expect(previewPaint(state, 'clear', [[9, 13]]).refund).toBe(PLACED.coffee.cost * REFUND_SHARE);

    const before = state.money.cash;
    state = act(state, { type: 'paint', tool: 'clear', cells: [[20, 19]] });
    expect(state.money.cash).toBeCloseTo(before + PLACED.truck.cost, 6);
    state = place(state, 'truck', 22, 19);
    expect(state.money.cash).toBeCloseTo(before, 6);
    expect(fedAt(state.map, 21, 18)).toBe(true);
    expect(PLACED.truck.fullRefund).toBe(true);
    for (const type of BUILD_ORDER) if (type !== 'truck') expect(PLACED[type].fullRefund ?? false, type).toBe(false);
  });
});

describe('the smoothie and juice bar', () => {
  it('earns double with a recreation building within two cells, and takes nothing from anyone else', () => {
    let state = campus(600);
    state = place(state, 'smoothie', 13, 13);
    const plain = foodTrade(state, first(state, 'smoothie'))!;
    expect(plain.doubled).toBe(false);
    expect(plain.income).toBeCloseTo(4_500, 6);
    const hallBefore = foodTrade(state, first(state, 'dining'))!.income;

    // Three cells away is too far.
    const far = place(state, 'courts', 8, 15);
    expect(besideRecreation(far.map, first(far, 'smoothie'))).toBe(false);
    expect(foodTrade(far, first(far, 'smoothie'))!.income).toBeCloseTo(plain.income, 6);

    const near = place(state, 'courts', 11, 15);
    expect(besideRecreation(near.map, first(near, 'smoothie'))).toBe(true);
    const doubled = foodTrade(near, first(near, 'smoothie'))!;
    expect(doubled.doubled).toBe(true);
    expect(doubled.income).toBeCloseTo(2 * plain.income, 6);
    expect(foodTrade(near, first(near, 'dining'))!.income).toBeCloseTo(hallBefore, 6);
    // Only the smoothie bar: a coffee stand beside a court earns what it would anywhere.
    const coffee = place(near, 'coffee', 13, 12);
    expect(foodTrade(coffee, first(coffee, 'coffee'))!.doubled).toBe(false);
    expect(placedSummary(near, first(near, 'smoothie'))).toMatch(/double/i);
  });
});

describe('the three Academics buildings', () => {
  it('computer lab: lifts Academic lots within four cells, the library rule at a smaller size', () => {
    expect(PLACED.computerLab).toMatchObject({ family: 'library', w: 2, h: 1, cost: 30_000, radius: 4, category: 'Academics' });
    expect(PLACED.computerLab.strength).toBeLessThan(PLACED.library.strength);
    let state = campus(600);
    expect(libraryLift(state.map, ...HALL)).toBe(0);
    state = place(state, 'computerLab', 19, 20);
    const lab = libraryLift(state.map, ...HALL);
    expect(lab).toBeGreaterThan(0);
    expect(lab).toBeLessThanOrEqual(PLACED.computerLab.strength);
    // Four cells from its edge is in, five is out.
    expect(libraryLift(state.map, 24, 20)).toBeGreaterThan(0);
    expect(libraryLift(state.map, 25, 20)).toBe(0);
  });

  it('computer lab: does not add to a library. The best lift in reach counts', () => {
    let state = campus(600);
    state = place(state, 'library', 22, 19);
    const library = libraryLift(state.map, ...HALL);
    state = place(state, 'computerLab', 19, 20);
    const lab = libraryLift(place(campus(600), 'computerLab', 19, 20).map, ...HALL);
    expect(libraryLift(state.map, ...HALL)).toBeCloseTo(Math.max(library, lab), 9);
    expect(libraryLift(state.map, ...HALL)).toBeLessThan(library + lab);
  });

  it('makerspace: things to do and somewhere to meet within five cells, with room for so many', () => {
    expect(PLACED.makerspace).toMatchObject({ family: 'recreation', w: 2, h: 1, cost: 28_000, radius: 5, category: 'Academics' });
    expect(PLACED.makerspace.capacity).toBeGreaterThan(0);
    let state = campus(600);
    expect(recreationAt(state, ...HALL)).toBe(0);
    const social = socialLife(state);
    state = place(state, 'makerspace', 19, 20);
    expect(recreationAt(state, ...HALL)).toBeCloseTo(PLACED.makerspace.strength, 9);
    expect(recreationAt(state, 26, 20)).toBe(0);
    expect(socialLife(state)).toBeGreaterThan(social);
    // It fills up like any place to play: half the lots, one student in twenty of them at the busiest hour.
    const use = playUse(state, first(state, 'makerspace'))!;
    expect(use.capacity).toBe(PLACED.makerspace.capacity);
    expect(use.demand).toBeCloseTo(15, 6);
    const crowded = structuredClone(state);
    crowded.cohorts = [2400, 0, 0, 0];
    expect(playUse(crowded, first(crowded, 'makerspace'))!.waiting).toBeGreaterThan(0);
    expect(placedSummary(crowded, first(crowded, 'makerspace'))).toMatch(/waiting at peak/);
  });

  it('study center: a better GPA on the cards of students within six cells, and nothing else', () => {
    expect(PLACED.studyCenter).toMatchObject({ family: 'tutoring', w: 2, h: 1, cost: 35_000, radius: 6, category: 'Academics' });
    const before = campus(600);
    const after = place(before, 'studyCenter', 8, 15);
    expect(tutoredAt(after.map, ...DORM)).toBe(true);
    expect(tutoredAt(after.map, ...HALL)).toBe(false);
    expect(tutoredAt(before.map, ...DORM)).toBe(false);

    let lifted = 0;
    let residents = 0;
    for (const ref of sampleStudents(before).slice(0, 300)) {
      const was = studentCard(before, ref)!;
      const now = studentCard(after, ref)!;
      if (was.home === null) {
        // A commuter is read at the lecture halls, which it does not reach.
        expect(now.tutored).toBe(false);
        expect(now.gpa).toBe(was.gpa);
        continue;
      }
      residents += 1;
      expect(was.tutored).toBe(false);
      expect(now.tutored).toBe(true);
      expect(now.gpa).toBeGreaterThanOrEqual(was.gpa);
      expect(now.gpa).toBeLessThanOrEqual(4);
      // Three tenths better, unless they were already near the top of the scale.
      if (was.gpa <= 4 - TUTORING_GPA) expect(now.gpa).toBeCloseTo(was.gpa + TUTORING_GPA, 6);
      if (now.gpa > was.gpa) lifted += 1;
      // The card is otherwise the same student.
      expect({ ...now, gpa: 0, tutored: false }).toEqual({ ...was, gpa: 0, tutored: false });
    }
    expect(residents).toBeGreaterThan(10);
    expect(lifted).toBeGreaterThan(residents * 0.8);

    // Nothing reads GPA yet: Happiness, who stays, and what comes in are untouched.
    expect(campusHappiness(after).score).toBe(campusHappiness(before).score);
    expect(campusHappiness(after).retention).toBe(campusHappiness(before).retention);
    expect(budget(after).incomeTotal).toBe(budget(before).incomeTotal);
  });

  it('study center: its menu card says it only changes student cards for now', () => {
    const card = buildEntries().find((entry) => entry.id === 'studyCenter')!;
    expect(card.category).toBe('Academics');
    expect(card.effect).toMatch(/GPA/);
    expect(card.effect).toMatch(/only student cards for now/);
    const state = place(campus(600), 'studyCenter', 8, 15);
    expect(placedSummary(state, first(state, 'studyCenter'))).toMatch(/changes nothing else yet/);
  });

  it('are in the Build menu under Academics, and the science lab is not built', () => {
    const academics = buildEntries().filter((entry) => entry.category === 'Academics').map((entry) => entry.name);
    expect(academics).toEqual(['Library', 'Computer lab', 'Study center', 'Makerspace']);
    expect(buildEntries().some((entry) => /science/i.test(entry.name))).toBe(false);
    const food = buildEntries().filter((entry) => entry.category === 'Food').map((entry) => entry.name);
    expect(food).toEqual(['Dining hall', 'Food court', 'Late-night diner', 'Burger grill', 'Pizza place', 'Taco stand', 'Coffee stand', 'Smoothie and juice bar', 'Convenience store', 'Food truck']);
  });
});

describe('a favourite place to eat', () => {
  it('is named by students who are pleased with the food, from the kinds in reach', () => {
    let state = campus(600);
    // A tended corner, so plenty of students are content, with tacos and pizza beside the dorms.
    state = place(state, 'taco', 8, 15);
    state = place(state, 'pizza', 11, 15);
    // Plenty to do as well, so Food & fun is the best thing about living here.
    state = place(state, 'gym', 6, 11);
    state = place(state, 'pool', 13, 11);
    state = place(state, 'medical', 3, 9);
    state = place(state, 'safety', 15, 9);
    state = act(state, { type: 'paint', tool: 'quad', cells: [[8, 13], [9, 13], [13, 13], [8, 12], [13, 12]] });
    expect(recreationAt(state, ...DORM)).toBe(1);
    const allowed = new Set<string>([...THOUGHTS.diningGood, ...(FAVOURITES.taco ?? []), ...(FAVOURITES.pizza ?? [])]);
    const said = new Set<string>();
    for (const ref of sampleStudents(state).slice(0, 600)) {
      const card = studentCard(state, ref)!;
      if (card.home === null || card.reason?.part !== 'dining' || !card.reason.positive) continue;
      expect(allowed.has(card.reason.thought), card.reason.thought).toBe(true);
      said.add(card.reason.thought);
    }
    // Somebody names tacos and somebody names pizza.
    expect([...said].some((line) => (FAVOURITES.taco ?? []).includes(line))).toBe(true);
    expect([...said].some((line) => (FAVOURITES.pizza ?? []).includes(line))).toBe(true);
    expect(FAVOURITES.taco).toContain('Taco Tuesday is the only reason I go to class.');
  });

  it('has a line for every kind of food but the dining hall, which keeps its own', () => {
    for (const type of [...NEW_FOOD, 'coffee']) expect((FAVOURITES[type] ?? []).length, type).toBeGreaterThan(0);
    // Tone: food and nothing else.
    for (const lines of Object.values(FAVOURITES)) for (const line of lines ?? []) expect(line).not.toMatch(/beer|wine|drunk|cigar|smok|\bbets?\b|gambl|casino/i);
  });
});

describe('nothing reads the clock', () => {
  afterEach(() => vi.useRealTimers());

  it('feeds, earns and scores the same at three in the morning as at three in the afternoon', () => {
    let state = campus(900);
    for (const [type, x, y] of [['taco', 8, 15], ['pizza', 11, 15], ['diner', 6, 11], ['burger', 19, 20], ['smoothie', 13, 13], ['makerspace', 22, 20], ['studyCenter', 4, 15], ['computerLab', 22, 19]] as const) {
      state = place(state, type, x, y);
    }
    const read = (): string => {
      const end = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 2 * DAY).state;
      const cards = sampleStudents(end).slice(0, 80).map((ref) => studentCard(end, ref));
      return JSON.stringify({ end, budget: budget(end), happy: campusHappiness(end), cards, food: end.map.placed.map((placed) => (placed ? foodTrade(end, placed) : null)) });
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 3, 0, 0));
    const night = read();
    vi.setSystemTime(new Date(2027, 5, 2, 15, 0, 0));
    const day = read();
    expect(day).toBe(night);
  });

  it('is the same however the time is cut up, and survives a save', () => {
    let state = campus(900);
    state = place(state, 'taco', 8, 15);
    state = place(state, 'foodcourt', 19, 20);
    state = place(state, 'smoothie', 13, 13);
    const end = state.clock.lastSimulatedAt + 2 * DAY;
    const once = advance(state, state.clock.lastSimulatedAt, end).state;
    let stepped = state;
    for (let at = state.clock.lastSimulatedAt + 7 * 60 * MIN; at < end; at += 7 * 60 * MIN) stepped = advance(stepped, stepped.clock.lastSimulatedAt, at).state;
    stepped = advance(stepped, stepped.clock.lastSimulatedAt, end).state;
    expect(JSON.stringify(stepped)).toBe(JSON.stringify(once));
    const loaded = parseSave(serialize(once, end));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state.version).toBe(SAVE_VERSION);
      expect(foodIncomePerYear(loaded.state)).toBeCloseTo(foodIncomePerYear(once), 6);
    }
  });
});

describe('an older save', () => {
  it('finds its dining halls earning, and is told once', () => {
    const state = campus(600);
    const file = JSON.parse(serialize(state, state.clock.lastSimulatedAt)) as { v: number; state: { version: number; map: { care: Record<string, unknown> } } };
    // As a save written before food earned anything: version 10, with no food shares worked out.
    file.v = 10;
    file.state.version = 10;
    delete file.state.map.care.food;
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(10);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(foodIncomePerYear(loaded.state)).toBeCloseTo(9_000, 6);
    expect(upgradeNotes(10).some((note) => /places to eat/.test(note))).toBe(true);
    expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
  });
});
