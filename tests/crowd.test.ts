import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUSY,
  CROWD_STEPS,
  CROWDS,
  FPS_DOWN_AFTER,
  FPS_UP_AFTER,
  FrameBudget,
  MIN_IN_VIEW,
  PLAY_NOW,
  playingNow,
  stepOf,
  walkersWanted,
  type CrowdFacts,
} from '../src/app/crowd';
import type { DayPeriod } from '../src/app/daylight';
import { townLook } from '../src/game/townLook';
import { newGame, PLACED, playUse, serialize, townHints } from '../src/sim';

/**
 * How many people the map shows (DESIGN.md section 28): the crowd setting, the
 * part of the day, the day of the week and the frame budget. All of it is for
 * show. These are the plain rules behind the layers that draw people and cars.
 */

const PERIODS: DayPeriod[] = ['morning', 'afternoon', 'evening', 'night'];

function facts(over: Partial<CrowdFacts> = {}): CrowdFacts {
  return { students: 2000, pathCells: 120, visiblePathCells: 60, period: 'afternoon', weekend: false, step: 2, ...over };
}

describe('crowd levels', () => {
  it('Low is the crowd of before, and each level above it shows more of everything', () => {
    expect(CROWDS).toEqual(['low', 'normal', 'high']);
    expect(CROWDS.map(stepOf)).toEqual([1, 2, 3]);
    // The cap before the crowd setting existed: 64 walkers wanted in view, 90 kept alive.
    expect(CROWD_STEPS[stepOf('low')]).toMatchObject({ inView: 64, alive: 90, density: 1 });
    for (let step = 1; step < CROWD_STEPS.length; step++) {
      const below = CROWD_STEPS[step - 1]!;
      const here = CROWD_STEPS[step]!;
      for (const key of ['inView', 'alive', 'density', 'extras', 'traffic'] as const) expect(here[key]).toBeGreaterThan(below[key]);
      // Room for the walkers just off screen.
      expect(here.alive).toBeGreaterThan(here.inView);
    }
  });

  it('wants more walkers at each higher setting, on the same campus at the same hour', () => {
    const counts = [0, 1, 2, 3].map((step) => walkersWanted(facts({ step, students: 6000, visiblePathCells: 400, pathCells: 600 })));
    expect(counts[0]!).toBeLessThan(counts[1]!);
    expect(counts[1]!).toBeLessThan(counts[2]!);
    expect(counts[2]!).toBeLessThan(counts[3]!);
  });

  it('never wants more than the level allows, however large the campus', () => {
    for (let step = 0; step < CROWD_STEPS.length; step++) {
      for (const period of PERIODS) {
        const wanted = walkersWanted(facts({ step, period, students: 50_000, pathCells: 3000, visiblePathCells: 3000 }));
        expect(wanted).toBeLessThanOrEqual(CROWD_STEPS[step]!.inView);
      }
    }
    expect(walkersWanted(facts({ step: 3, period: 'morning', students: 50_000, pathCells: 3000, visiblePathCells: 3000 }))).toBe(CROWD_STEPS[3]!.inView);
  });

  it('grows with enrollment', () => {
    const at = (students: number): number => walkersWanted(facts({ students, pathCells: 300, visiblePathCells: 60 }));
    expect(at(400)).toBeLessThan(at(1200));
    expect(at(1200)).toBeLessThan(at(2400));
    // Past the point where the paths are full, more students add nobody.
    expect(at(40_000)).toBe(at(80_000));
  });

  it('grows as more of the campus is in view', () => {
    const at = (visiblePathCells: number): number => walkersWanted(facts({ visiblePathCells, pathCells: 400 }));
    expect(at(20)).toBeLessThan(at(80));
    expect(at(80)).toBeLessThan(at(240));
  });

  it('follows the day: a morning rush, a quieter evening, a few at night', () => {
    const at = (period: DayPeriod): number => walkersWanted(facts({ period, students: 3000, pathCells: 300, visiblePathCells: 60 }));
    expect(at('morning')).toBeGreaterThan(at('afternoon'));
    expect(at('afternoon')).toBeGreaterThan(at('evening'));
    expect(at('evening')).toBeGreaterThan(at('night'));
    expect(BUSY.morning).toBeGreaterThan(1);
    // Never empty: someone who only plays at night still finds people about.
    expect(at('night')).toBeGreaterThanOrEqual(MIN_IN_VIEW);
  });

  it('is quieter on a weekend of the game calendar', () => {
    for (const period of PERIODS) {
      const weekday = walkersWanted(facts({ period, students: 3000, pathCells: 300, visiblePathCells: 60 }));
      const weekend = walkersWanted(facts({ period, weekend: true, students: 3000, pathCells: 300, visiblePathCells: 60 }));
      expect(weekend).toBeLessThanOrEqual(weekday);
    }
    expect(walkersWanted(facts({ weekend: true, students: 3000, pathCells: 300, visiblePathCells: 60 }))).toBeLessThan(
      walkersWanted(facts({ students: 3000, pathCells: 300, visiblePathCells: 60 })),
    );
  });

  it('wants nobody where there is no path to walk on, and a few on any path at all', () => {
    expect(walkersWanted(facts({ pathCells: 0, visiblePathCells: 0 }))).toBe(0);
    expect(walkersWanted(facts({ visiblePathCells: 0 }))).toBe(0);
    expect(walkersWanted(facts({ students: 0, pathCells: 40, visiblePathCells: 40, period: 'night' }))).toBe(MIN_IN_VIEW);
    // Two cells of path cannot hold four people.
    expect(walkersWanted(facts({ students: 0, pathCells: 2, visiblePathCells: 2 }))).toBe(2);
  });

  it('is a plain sum: the same facts always give the same count', () => {
    for (let step = 0; step < 4; step++) {
      for (const period of PERIODS) {
        const given = facts({ step, period, students: 1234, pathCells: 77, visiblePathCells: 33 });
        expect(walkersWanted(given)).toBe(walkersWanted({ ...given }));
      }
    }
  });
});

describe('who is at a recreation building right now', () => {
  it('shows the peak in the afternoon, most of it in the evening, some in the morning and almost nobody at night', () => {
    expect(PLAY_NOW.afternoon).toBe(1);
    expect(PLAY_NOW.evening).toBeGreaterThan(PLAY_NOW.morning);
    expect(PLAY_NOW.morning).toBeGreaterThan(PLAY_NOW.night);
    expect(playingNow(6, 8, 'afternoon')).toEqual({ playing: 6, waiting: 0 });
    expect(playingNow(6, 8, 'evening')).toEqual({ playing: 5, waiting: 0 });
    expect(playingNow(6, 8, 'morning')).toEqual({ playing: 2, waiting: 0 });
    expect(playingNow(6, 8, 'night')).toEqual({ playing: 0, waiting: 0 });
  });

  it('fills the building and lines up the rest', () => {
    expect(playingNow(13, 8, 'afternoon')).toEqual({ playing: 8, waiting: 5 });
    // The same court in the morning has room: the line is an afternoon thing.
    expect(playingNow(13, 8, 'morning')).toEqual({ playing: 5, waiting: 0 });
    expect(playingNow(0, 8, 'afternoon')).toEqual({ playing: 0, waiting: 0 });
    expect(playingNow(-3, 8, 'afternoon')).toEqual({ playing: 0, waiting: 0 });
  });
});

describe('the frame budget', () => {
  const run = (budget: FrameBudget, fps: number, seconds: number): number => {
    let step = budget.step;
    for (let n = 0; n < seconds; n++) step = budget.second(fps);
    return step;
  };

  it('starts at the setting and stays there while frames are good', () => {
    const budget = new FrameBudget(stepOf('high'));
    expect(budget.step).toBe(3);
    expect(run(budget, 60, 120)).toBe(3);
  });

  it('steps down a level after a few slow seconds, as far as the sparse crowd below Low', () => {
    const budget = new FrameBudget(stepOf('normal'));
    run(budget, 60, 5);
    expect(run(budget, 40, FPS_DOWN_AFTER - 1)).toBe(2);
    expect(budget.second(40)).toBe(1);
    expect(run(budget, 40, FPS_DOWN_AFTER)).toBe(0);
    // No further.
    expect(run(budget, 20, 60)).toBe(0);
  });

  it('takes one slow second in its stride', () => {
    const budget = new FrameBudget(stepOf('normal'));
    run(budget, 60, 5);
    for (let n = 0; n < 20; n++) {
      budget.second(35);
      run(budget, 60, 2);
    }
    expect(budget.step).toBe(2);
  });

  it('steps back up when frames recover, a level at a time, and never above the setting', () => {
    const budget = new FrameBudget(stepOf('normal'));
    run(budget, 60, 5);
    run(budget, 30, FPS_DOWN_AFTER * 2);
    expect(budget.step).toBe(0);
    expect(run(budget, 60, FPS_UP_AFTER - 1)).toBe(0);
    expect(budget.second(60)).toBe(1);
    expect(run(budget, 60, FPS_UP_AFTER)).toBe(2);
    expect(run(budget, 60, FPS_UP_AFTER * 5)).toBe(2);
  });

  it('does not take a screen that only draws 30 frames a second for a slow phone', () => {
    // Low Power Mode: 30 is all it ever shows, however little there is to draw.
    const budget = new FrameBudget(stepOf('high'));
    expect(run(budget, 30, 120)).toBe(3);
    // But a phone that falls well under that is slow.
    expect(run(budget, 18, FPS_DOWN_AFTER)).toBe(2);
  });

  it('judges a fast screen by its own best: 120 falling to 60 is a drop', () => {
    const budget = new FrameBudget(stepOf('high'));
    run(budget, 120, 10);
    expect(run(budget, 60, FPS_DOWN_AFTER)).toBe(2);
  });

  it('takes the new setting at once when the player changes it', () => {
    const budget = new FrameBudget(stepOf('high'));
    run(budget, 60, 5);
    run(budget, 20, FPS_DOWN_AFTER);
    expect(budget.step).toBe(2);
    budget.setCeiling(stepOf('low'));
    expect(budget.step).toBe(1);
    expect(run(budget, 60, 60)).toBe(1);
    budget.setCeiling(stepOf('high'));
    expect(budget.step).toBe(3);
  });
});

describe('for show only', () => {
  it('the numbers the map reads to draw people and markers change nothing in the game', () => {
    const state = newGame({ seed: 7, name: 'Show', now: Date.UTC(2026, 0, 5, 9) });
    const before = serialize(state, 0);
    for (const placed of state.map.placed) if (placed && PLACED[placed.type].family === 'recreation') playUse(state, placed);
    townHints(state);
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) townLook(state.map, x, y);
    for (const period of PERIODS) walkersWanted(facts({ period }));
    expect(serialize(state, 0)).toBe(before);
  });

  it('the layers that draw people and cars never reach for anything that changes, advances or saves the game', () => {
    const banned = ['applyAction', 'advance(', 'serialize', 'parseSave', "from '../app/store'", "from '../app/session'", 'localStorage', 'state.rng', 'nextRandom'];
    for (const file of ['src/game/Walkers.ts', 'src/game/Cars.ts', 'src/game/Activity.ts', 'src/game/townLook.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      for (const word of banned) expect(source.includes(word), `${file} uses ${word}`).toBe(false);
    }
    // The crowd setting is kept on the device, apart from the saved game.
    const crowd = readFileSync(join(__dirname, '..', 'src/app/crowd.ts'), 'utf8');
    expect(crowd).toContain("'campus-tycoon.crowd'");
    for (const word of ['applyAction', 'advance(', 'serialize', '../sim']) expect(crowd.includes(word), `crowd.ts uses ${word}`).toBe(false);
  });

  it('the town is always fully built: every plot has a look, and it never changes', () => {
    const state = newGame({ seed: 11, name: 'Town', now: Date.UTC(2026, 0, 5, 9) });
    const looks = (): string => {
      const out: string[] = [];
      for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) if (state.map.cells[y * state.map.width + x]!.kind === 'town') out.push(townLook(state.map, x, y));
      return out.join(',');
    };
    const first = looks();
    expect(first.length).toBeGreaterThan(0);
    expect(looks()).toBe(first);
    // Driveways, trees, gardens and lawn all appear in a town of eight streets.
    for (const look of ['driveway', 'tree', 'garden', 'lawn']) expect(first).toContain(look);
  });
});
