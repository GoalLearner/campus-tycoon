import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  averageDesirability,
  budget,
  BUILD_ORDER,
  campusHappiness,
  edition,
  enrollment,
  fallApplicants,
  landRankGoals,
  landSizeGoals,
  newGame,
  newspaperLines,
  parseSave,
  PLACED,
  previewPaint,
  RANK_GOALS,
  RANK_REWARDS,
  rewardGoal,
  rewardLift,
  rewardName,
  rewardOf,
  rewardsEarned,
  rewardsWaiting,
  SAVE_VERSION,
  scoreParts,
  serialize,
  toneProblem,
  utilitiesOf,
  validate,
  type GameState,
  type LogEntry,
  type PlacedType,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { buildEntries, placedFacts, placedSummary } from '../src/ui/buildUi';
import { DAY, freshGame, T0 } from './helpers';

const WEEK = 7 * DAY;
const model = (seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });

/** A model campus that has reached every rank goal down to a rank, with what was said as each landed. */
function ranked(rank: number, start = model()): { state: GameState; log: LogEntry[] } {
  const state = structuredClone(start);
  state.field.rank = rank;
  state.field.rankYear = 1;
  const log: LogEntry[] = [];
  landRankGoals(state, log);
  return { state, log };
}

/** The first free ground a building fits on, scanning out from a cell. */
function spotFor(state: GameState, type: PlacedType, cx = 16, cy = 16): [number, number] {
  const spec = PLACED[type];
  const map = state.map;
  let best: [number, number] | null = null;
  let near = Infinity;
  for (let y = 0; y + spec.h <= map.height; y++) {
    for (let x = 0; x + spec.w <= map.width; x++) {
      const far = Math.abs(x - cx) + Math.abs(y - cy);
      if (far >= near) continue;
      let free = true;
      for (let dy = 0; dy < spec.h && free; dy++) for (let dx = 0; dx < spec.w && free; dx++) free = map.cells[(y + dy) * map.width + x + dx]!.kind === 'empty' && previewPaint(state, 'quad', [[x + dx, y + dy]]).cells.length === 1;
      if (!free) continue;
      near = far;
      best = [x, y];
    }
  }
  if (!best) throw new Error(`nowhere to put ${type}`);
  return best;
}

function place(state: GameState, type: PlacedType, at?: [number, number]): GameState {
  const [x, y] = at ?? spotFor(state, type);
  const result = applyAction(state, { type: 'place', building: type, x, y });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('a building for each rank goal', () => {
  it("is the owner's eight, in the order of his sheet, one to a goal", () => {
    expect(RANK_REWARDS.map((type) => PLACED[type].name)).toEqual(["Founders' Fountain", 'Campus Post Office', 'Campus Cinema', 'Campus Radio', 'University Museum', 'Alumni House', 'Broadcast Tower', 'Bell Tower']);
    expect(RANK_REWARDS.length).toBe(RANK_GOALS.length);
    RANK_REWARDS.forEach((type, n) => {
      expect(rewardOf(n)).toBe(type);
      expect(rewardGoal(type)).toBe(n);
    });
    expect(rewardGoal('library')).toBe(-1);
    expect(rewardOf(8)).toBeUndefined();
  });

  it('has one rule for all eight: free to place, free to keep, a little more lift for a later goal', () => {
    const specs = RANK_REWARDS.map((type) => PLACED[type]);
    for (const spec of specs) {
      expect(spec.family).toBe('reward');
      expect(spec.category).toBe('Earned');
      expect(spec.cost).toBe(0);
      expect(spec.upkeepPerYear).toBe(0);
      expect(spec.radius).toBe(specs[0]!.radius);
      expect(spec.effect).toBe('Lifts how the campus looks within 6 cells');
      expect(toneProblem(spec.name)).toBeNull();
      expect(toneProblem(spec.effect)).toBeNull();
    }
    for (const type of RANK_REWARDS) expect(utilitiesOf(type, 28)).toBe(0);
    for (let n = 1; n < specs.length; n++) expect(specs[n]!.strength).toBeGreaterThan(specs[n - 1]!.strength);
    // None is sold: the Build menu's own list does not have them.
    for (const type of RANK_REWARDS) expect(BUILD_ORDER).not.toContain(type);
  });

  it('is drawn from the pack as it is, on the block of cells its card says', () => {
    const recipe = JSON.parse(readFileSync(new URL('../art/recipes/penzilla.json', import.meta.url), 'utf8')) as { private?: boolean; sprites: Record<string, { layers: Array<{ file?: string; cut?: unknown; paste?: unknown; recolour?: string; flip?: boolean; render?: unknown }> }>; footprints: Record<string, [number, number]> };
    expect(recipe.private).toBe(true);
    for (const type of RANK_REWARDS) {
      const spec = PLACED[type];
      const sprite = recipe.sprites[spec.sprite]!;
      expect(sprite, spec.sprite).toBeDefined();
      expect(recipe.footprints[spec.sprite] ?? [1, 1]).toEqual([spec.w, spec.h]);
      // Nothing cut, pasted, recoloured, mirrored or rendered: the pack's own drawing, with grass under the one that lies flat.
      for (const layer of sprite.layers) {
        expect(layer.cut === undefined && layer.paste === undefined && layer.render === undefined && !layer.flip, spec.sprite).toBe(true);
        expect(layer.file).toMatch(/^penzilla\//);
      }
      const drawn = sprite.layers.filter((layer) => !/Tiles\/Grass\.png$/.test(layer.file ?? ''));
      expect(drawn.every((layer) => layer.recolour === undefined), spec.sprite).toBe(true);
      expect(drawn.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('a goal reached', () => {
  it('puts its building in the Build menu, free, and says so', () => {
    const fresh = model();
    expect(rewardsEarned(fresh)).toEqual([]);
    expect(rewardsWaiting(fresh)).toEqual([]);
    expect(buildEntries(28, fresh).some((entry) => entry.category === 'Earned')).toBe(false);

    const { state, log } = ranked(170);
    expect(rewardsEarned(state)).toEqual(['fountain']);
    expect(rewardsWaiting(state)).toEqual(['fountain']);
    expect(log[0]!.text).toBe("Test University is No. 170 of 200 for academics. The goal of the Top 175 is reached. It is kept for good. Founders' Fountain is yours to place, free, from the Build menu. It brings 5 Gold Seals.");
    const first = buildEntries(28, state)[0]!;
    expect(first).toMatchObject({ id: 'fountain', name: "Founders' Fountain", category: 'Earned', cost: 'Free', footprint: '2 x 2', upkeep: 'Costs nothing to run', effect: 'Lifts how the campus looks within 6 cells. Yours for the Top 175' });
    // The look preview, which has no game, shows none.
    expect(buildEntries(28).some((entry) => entry.category === 'Earned')).toBe(false);

    // Several goals in one day give several buildings, named together.
    const three = ranked(120);
    expect(rewardsWaiting(three.state)).toEqual(['fountain', 'postOffice', 'cinema']);
    expect(three.log[0]!.text).toContain("Founders' Fountain, the Campus Post Office and the Campus Cinema are yours to place, free, from the Build menu.");
    expect(buildEntries(28, three.state).slice(0, 3).map((entry) => entry.name)).toEqual(["Founders' Fountain", 'Campus Post Office', 'Campus Cinema']);
    expect(rewardsWaiting(ranked(1).state)).toEqual([...RANK_REWARDS]);
  });

  it('gives nothing for the size goal: a full campus is a headline and no building', () => {
    const state = structuredClone(model());
    state.cohorts = [14_000, 13_000, 12_000, 11_000];
    const log: LogEntry[] = [];
    landSizeGoals(state, log);
    expect(state.goals!.size).toBe(1);
    expect(log[0]!.text).not.toMatch(/Build menu/);
    expect(rewardsEarned(state)).toEqual([]);
  });

  it('never expires: left alone for years, it is still waiting', () => {
    let state = model();
    for (let year = 0; year < 4; year++) state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + WEEK).state;
    expect(state.goals!.rank).toBeGreaterThanOrEqual(2);
    expect(rewardsWaiting(state)).toEqual(RANK_REWARDS.slice(0, state.goals!.rank));
    expect(validate(state)).toBeNull();
  });

  it('gives nothing on a game begun on the small campus, which has no goals', () => {
    const small = advance(freshGame(), T0, T0 + 3 * WEEK).state;
    expect(small.goals).toBeNull();
    expect(rewardsEarned(small)).toEqual([]);
    expect(rewardsWaiting(small)).toEqual([]);
    expect(buildEntries(1, small).some((entry) => entry.category === 'Earned')).toBe(false);
    small.money.cash = 10_000_000;
    const tried = applyAction(small, { type: 'place', building: 'fountain', x: 10, y: 10 });
    expect(tried.ok).toBe(false);
    if (!tried.ok) expect(tried.error).toBe("Founders' Fountain comes with the Top 175.");
    // Its lots pay nothing for a rule it has no part in.
    for (const lot of small.map.buildings) if (lot) expect(rewardLift(small.map, lot.x, lot.y)).toBe(0);
  });
});

describe('placing one', () => {
  it('costs nothing, puts it on the map, and takes it out of the Build menu', () => {
    const { state } = ranked(170);
    const placed = place(state, 'fountain');
    expect(placed.money.cash).toBe(state.money.cash);
    expect(placed.map.placed.some((one) => one?.type === 'fountain')).toBe(true);
    expect(rewardsWaiting(placed)).toEqual([]);
    expect(rewardsEarned(placed)).toEqual(['fountain']);
    expect(buildEntries(28, placed).some((entry) => entry.category === 'Earned')).toBe(false);
    // It costs nothing to keep: the campus spends what it spent.
    expect(budget(placed).spending).toBe(budget(state).spending);
    expect(validate(placed)).toBeNull();
  });

  it('is refused for a building not yet earned, and for a second of one already standing', () => {
    const { state } = ranked(170);
    const early = applyAction(state, { type: 'place', building: 'bellTower', x: 0, y: 0 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toBe('Bell Tower comes with the Top 10.');
    const placed = place(state, 'fountain');
    const [x, y] = spotFor(placed, 'fountain');
    const twice = applyAction(placed, { type: 'place', building: 'fountain', x, y });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toBe("Founders' Fountain is already on the campus. Clear it first to move it.");
  });

  it('lifts how the campus looks around it, fading with distance, and so brings applicants', () => {
    const { state } = ranked(1);
    const placed = place(state, 'museum');
    const building = placed.map.placed.find((one) => one?.type === 'museum')!;
    const spec = PLACED.museum;
    let lifted = 0;
    for (const lot of placed.map.buildings) {
      if (!lot) continue;
      const cell = lot.y * placed.map.width + lot.x;
      const far = Math.max(Math.max(building.x - lot.x, 0, lot.x - (building.x + building.w - 1)), Math.max(building.y - lot.y, 0, lot.y - (building.y + building.h - 1)));
      const lift = rewardLift(placed.map, lot.x, lot.y);
      if (far > spec.radius) {
        expect(lift).toBe(0);
        expect(placed.map.score[cell]).toBe(state.map.score[cell]);
      } else {
        // Its strength at its wall, a seventh less for each cell further off.
        expect(lift).toBeCloseTo((spec.strength * (spec.radius + 1 - far)) / (spec.radius + 1), 9);
        expect(placed.map.score[cell]!).toBeGreaterThanOrEqual(state.map.score[cell]!);
        expect(scoreParts(placed.map, lot.x, lot.y, lot.zone, placed.map.walkMinutes[cell]!).reward).toBe(lift);
        lifted += 1;
      }
    }
    expect(lifted).toBeGreaterThan(3);
    expect(averageDesirability(placed)).toBeGreaterThan(averageDesirability(state));
    const looks = (of: GameState): number => fallApplicants(of).causes.find((cause) => cause.id === 'looks')!.students;
    expect(looks(placed)).toBeGreaterThan(looks(state));
    // The other three causes of applicants are what they were, and so is Happiness.
    for (const id of ['marketing', 'football', 'rank'] as const) expect(fallApplicants(placed).causes.find((cause) => cause.id === id)!.factor).toBe(fallApplicants(state).causes.find((cause) => cause.id === id)!.factor);
    expect(campusHappiness(placed).base).toBeCloseTo(campusHappiness(state).base, 9);
  });

  it('counts only the best one in reach, so eight in a corner lift it no more than the best of them', () => {
    const { state } = ranked(1);
    const one = place(state, 'bellTower', spotFor(state, 'bellTower', 14, 20));
    const tower = one.map.placed.find((placed) => placed?.type === 'bellTower')!;
    const two = place(one, 'fountain', spotFor(one, 'fountain', tower.x, tower.y));
    for (const lot of two.map.buildings) {
      if (!lot) continue;
      // Beside the Bell Tower, the weaker fountain adds nothing to what the tower already gives.
      const before = rewardLift(one.map, lot.x, lot.y);
      const after = rewardLift(two.map, lot.x, lot.y);
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeLessThanOrEqual(PLACED.bellTower.strength);
    }
    const beside = two.map.buildings.filter((lot) => lot && Math.max(Math.abs(lot.x - tower.x), Math.abs(lot.y - tower.y)) <= 1);
    for (const lot of beside) if (lot) expect(rewardLift(two.map, lot.x, lot.y)).toBe(rewardLift(one.map, lot.x, lot.y));
  });
});

describe('clearing one', () => {
  it('sends it back to the Build menu: a reward is never lost', () => {
    const { state } = ranked(120);
    const placed = place(place(state, 'cinema'), 'fountain');
    expect(rewardsWaiting(placed)).toEqual(['postOffice']);
    const cinema = placed.map.placed.find((one) => one?.type === 'cinema')!;
    const cleared = applyAction(placed, { type: 'paint', tool: 'clear', cells: [[cinema.x, cinema.y]] });
    if (!cleared.ok) throw new Error(cleared.error);
    // Nothing comes back but the building itself: it was free.
    expect(cleared.state.money.cash).toBe(placed.money.cash);
    expect(rewardsWaiting(cleared.state)).toEqual(['postOffice', 'cinema']);
    expect(rewardsEarned(cleared.state)).toEqual(['fountain', 'postOffice', 'cinema']);
    expect(buildEntries(28, cleared.state).filter((entry) => entry.category === 'Earned').map((entry) => entry.name)).toEqual(['Campus Post Office', 'Campus Cinema']);
    // The lots it lifted are as they were before it stood there.
    const without = place(state, 'fountain', [placed.map.placed.find((one) => one?.type === 'fountain')!.x, placed.map.placed.find((one) => one?.type === 'fountain')!.y]);
    expect(cleared.state.map.score).toEqual(without.map.score);
    // And it can be placed again, somewhere else.
    const again = place(cleared.state, 'cinema', spotFor(cleared.state, 'cinema', 8, 30));
    expect(rewardsWaiting(again)).toEqual(['postOffice']);
  });
});

describe('a save that has already reached rank goals', () => {
  it('finds their buildings waiting when it loads, with no change to the save', () => {
    // The buildings themselves added nothing to the save. Versions 17 to 19 came later, with policies, levels and orders.
    expect(SAVE_VERSION).toBe(28);
    // A game like the owner's own, which reached two goals before the buildings were switched on.
    const { state } = ranked(150);
    const text = serialize(state, T0);
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state).toEqual(state);
    expect(rewardsWaiting(loaded.state)).toEqual(['fountain', 'postOffice']);
    expect(buildEntries(28, loaded.state).slice(0, 2).map((entry) => entry.cost)).toEqual(['Free', 'Free']);

    // The version 15 fixture, with three goals reached before it was ever upgraded.
    const file = JSON.parse(readFileSync(new URL('./fixtures/save-v15-model.json', import.meta.url), 'utf8')) as { v: number; state: GameState };
    file.state.goals = { size: 0, rank: 3, rewards: 0, reached: [0, 1, 2].map((n) => ({ ladder: 'rank' as const, n, year: 1 })) };
    const older = parseSave(JSON.stringify(file));
    if (!older.ok) throw new Error(older.reason);
    expect(older.state.school.name).toBe('Larp University');
    expect(enrollment(older.state)).toBe(46_000);
    expect(rewardsWaiting(older.state)).toEqual(['fountain', 'postOffice', 'cinema']);
    expect(validate(older.state)).toBeNull();
  });
});

describe('the paper', () => {
  const facts = { minutes: 1440, cashBefore: 1, cashAfter: 1, studentsBefore: 46_000, studentsAfter: 46_000 };

  it("names the building in a rank goal's headline", () => {
    const first = ranked(170);
    expect(edition(first.state, first.log, facts).headline).toBe("Test Enters the Top 175; Founders' Fountain Is Yours to Build");
    // The Top 125 opens the Growth era too: the era leads, and the building is still named.
    const start = ranked(140).state;
    const era = structuredClone(start);
    era.field.rank = 120;
    const log: LogEntry[] = [];
    landRankGoals(era, log);
    expect(edition(era, log, facts).headline).toBe('The Growth Era Begins at Test; Campus Cinema Is Yours to Build');
    expect(edition(era, log, facts).deck).toContain('The Campus Cinema is yours to place, free, from the Build menu.');
    for (const line of newspaperLines()) expect(toneProblem(line), line).toBeNull();
    expect(newspaperLines()).toContain('Bell Tower Is Yours to Build');
  });

  it('says which are waiting, until they are placed, and leads to the Build menu', () => {
    const { state, log } = ranked(120);
    // The edition that announces them names them with the goal, and does not say them twice.
    const day = edition(state, log, facts);
    expect(day.top.some((item) => item.go === 'build')).toBe(false);
    // The next edition, and the first after an upgrade: nothing happened, and three are waiting.
    const later = edition(state, [], facts);
    const line = later.top.find((item) => item.go === 'build')!;
    expect(line.text).toBe("Founders' Fountain, the Campus Post Office and the Campus Cinema are waiting in the Build menu, free to place. Each lifts how the campus looks.");
    expect(toneProblem(line.text)).toBeNull();
    // One placed, two left. All placed, and the line is gone.
    const one = place(state, 'fountain');
    expect(edition(one, [], facts).top.find((item) => item.go === 'build')!.text).toBe('The Campus Post Office and the Campus Cinema are waiting in the Build menu, free to place. Each lifts how the campus looks.');
    const all = place(place(one, 'postOffice'), 'cinema');
    expect(edition(all, [], facts).top.some((item) => item.go === 'build')).toBe(false);
    const last = place(place(state, 'fountain'), 'postOffice');
    expect(edition(last, [], facts).top.find((item) => item.go === 'build')!.text).toBe('The Campus Cinema is waiting in the Build menu, free to place. It lifts how the campus looks.');
    expect(rewardName('radio')).toBe('Campus Radio');
    expect(rewardName('bellTower')).toBe('the Bell Tower');
  });
});

describe('tapping a placed one', () => {
  it('says what it does and which goal earned it', () => {
    const { state } = ranked(90);
    const placed = place(state, 'radio');
    const radio = placed.map.placed.find((one) => one?.type === 'radio')!;
    expect(placedSummary(placed, radio)).toMatch(/^Yours for reaching the Top 100\. It lifts how the campus looks at \d+ (dorm or lecture hall|dorms and lecture halls) within 6 cells, and looks are one of the four things that bring applicants\.$/);
    expect(placedFacts(placed, radio)).toBe('Costs nothing to run · Clear it and it goes back to the Build menu, free');
    expect(toneProblem(placedSummary(placed, radio))).toBeNull();
  });
});
