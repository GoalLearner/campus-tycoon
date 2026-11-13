import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  campusHappiness,
  causeShifts,
  chooseTradition,
  conditionHolds,
  fansMore,
  newGame,
  newTraditions,
  nextDay,
  parseSave,
  previewPlace,
  RIVALRY_SLOT,
  SAVE_VERSION,
  serialize,
  TRADITION_HALF,
  TRADITIONS,
  traditionEffects,
  traditionShare,
  traditionSlots,
  traditionsOnGame,
  toneProblem,
  validate,
  type GameState,
  type LogEntry,
  type PlacedType,
} from '../src/sim';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, T0 } from './helpers';

/**
 * Traditions (DESIGN.md 14.2, adapted and built in section 50): places that
 * open with the first commencement and the eras, a tradition kept on its day
 * when its condition holds, a lift that grows with the count, and nothing
 * lost when one is not met.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;

/** The model campus with its first commencement behind it, so the first place is open. */
function begun(): GameState {
  const state = structuredClone(MODEL);
  state.traditions.began = true;
  state.money.cash = 2_000_000_000;
  return state;
}

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

function choose(state: GameState, id: string): GameState {
  const result = applyAction(state, { type: 'chooseTradition', id });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function place(state: GameState, type: PlacedType): GameState {
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (previewPlace(state, type, x, y).problem !== null) continue;
      const result = applyAction(state, { type: 'place', building: type, x, y });
      if (result.ok) return result.state;
    }
  }
  throw new Error(`no room for ${type}`);
}

/** The same campus with its Late-night diners cleared away. */
function noDiner(state: GameState): GameState {
  let current = state;
  for (const placed of state.map.placed) {
    if (placed?.type !== 'diner') continue;
    const result = applyAction(current, { type: 'paint', tool: 'clear', cells: [[placed.x, placed.y]] });
    if (!result.ok) throw new Error(result.error);
    current = result.state;
  }
  return current;
}

/** Up to just past a tradition's next day. */
function toItsDay(state: GameState, id: string): { state: GameState; log: LogEntry[] } {
  const spec = TRADITIONS.find((one) => one.id === id)!;
  const next = nextDay(state, spec.day)!;
  return later(state, (next.at - state.clock.tick + 2) * 60_000);
}

describe('places for traditions', () => {
  it('open with the first commencement and with each era, four at most, and only on a campus with goals', () => {
    expect(traditionSlots(MODEL)).toBe(0);
    // A week on, the first commencement has passed.
    const week = later(MODEL, 7 * DAY).state;
    expect(week.traditions.began).toBe(true);
    expect(traditionSlots(week)).toBe(1);
    const eras = structuredClone(week);
    for (let n = 1; n <= 3; n++) eras.goals!.reached.push({ ladder: 'era', n, year: 1 });
    expect(traditionSlots(eras)).toBe(4);
    // The small campus has none.
    const small = freshGame();
    small.traditions.began = true;
    expect(traditionSlots(small)).toBe(0);
    expect(chooseTradition(small, 'rivalryTrophy')).toMatch(/goals/);
  });

  it('take one choice each, for good, and only while a place is open', () => {
    const state = choose(begun(), 'rivalryTrophy');
    expect(state.traditions.chosen.map((one) => one.id)).toEqual(['rivalryTrophy']);
    expect(applyAction(state, { type: 'chooseTradition', id: 'fightSong' }).ok).toBe(false);
    const more = structuredClone(state);
    more.goals!.reached.push({ ladder: 'era', n: 1, year: 1 });
    expect(applyAction(more, { type: 'chooseTradition', id: 'rivalryTrophy' }).ok).toBe(false);
    expect(applyAction(more, { type: 'chooseTradition', id: 'fightSong' }).ok).toBe(true);
    expect(TRADITIONS).toHaveLength(8);
  });
});

describe('a tradition’s day', () => {
  it('keeps it when its condition holds, says so in the paper with its count, and does it again each year', () => {
    // The model campus has a Late-night diner already.
    let state = begun();
    expect(conditionHolds(state, 'lateDiner')).toBe(true);
    state = choose(state, 'midnightBreakfast');
    const first = toItsDay(state, 'midnightBreakfast');
    const said = first.log.filter((entry) => entry.kind === 'tradition' && entry.data?.keep === 1);
    expect(said).toHaveLength(1);
    expect(said[0]!.text).toMatch(/^The 1st Midnight Breakfast: /);
    expect(said[0]!.data?.headline).toMatch(/Keeps Its 1st Midnight Breakfast/);
    expect(first.state.traditions.chosen[0]!.kept).toBe(1);
    const second = toItsDay(first.state, 'midnightBreakfast');
    expect(second.log.some((entry) => /^The 2nd Midnight Breakfast/.test(entry.text))).toBe(true);
    expect(second.state.traditions.chosen[0]!.years.map(([, kept]) => kept)).toEqual([1, 1]);
  });

  it('costs nothing when its condition does not hold: that year does not count, the count is kept, and nothing else moves', () => {
    const base = begun();
    expect(conditionHolds(base, 'bellTower')).toBe(false);
    const withIt = choose(base, 'luckyFountain');
    const fountain = conditionHolds(withIt, 'fountainByPath');
    const day = toItsDay(withIt, 'luckyFountain');
    const without = later(base, (day.state.clock.tick - base.clock.tick) * 60_000);
    const one = day.state.traditions.chosen[0]!;
    if (!fountain) {
      expect(one.kept).toBe(0);
      expect(one.years).toEqual([[day.state.clock.week.year, 0]]);
      expect(day.log.some((entry) => entry.text === 'No Lucky Fountain this year: it needs Founders’ Fountain, with a path beside it. It is kept for next year, and nothing is lost.')).toBe(true);
    }
    // Whatever its day brought, the campus is where it would have been without the tradition: money and Happiness alike.
    if (one.kept === 0) {
      expect(day.state.money.cash).toBe(without.state.money.cash);
      expect(campusHappiness(day.state).base).toBe(campusHappiness(without.state).base);
    }
  });

  it('is said to be at risk once, a day or two before, so it can be put right in time', () => {
    const state = choose(noDiner(begun()), 'midnightBreakfast');
    expect(conditionHolds(state, 'lateDiner')).toBe(false);
    const next = nextDay(state, 'springFinals')!;
    const near = later(state, (next.at - state.clock.tick - 40 * 60) * 60_000);
    const risk = near.log.filter((entry) => entry.kind === 'tradition' && entry.data?.atRisk === 1);
    expect(risk).toHaveLength(1);
    expect(risk[0]!.text).toMatch(/^The Midnight Breakfast is at risk: it needs a Late-night diner on campus\. Its day is in /);
    // Put right in time: a diner, and it is kept on its day.
    const fixed = place(near.state, 'diner');
    const day = toItsDay(fixed, 'midnightBreakfast');
    expect(day.state.traditions.chosen[0]!.kept).toBe(1);
    expect(day.log.filter((entry) => entry.data?.atRisk === 1)).toHaveLength(0);
  });

  it('holds the trophy for a rivalry won, and counts the trophy every year, won or lost', () => {
    const state = choose(begun(), 'rivalryTrophy');
    const log: LogEntry[] = [];
    traditionsOnGame(state, RIVALRY_SLOT, true, log);
    expect(state.traditions.trophy).toBe(true);
    expect(state.traditions.chosen[0]!.kept).toBe(1);
    const held = traditionShare(state, state.traditions.chosen[0]!);
    state.clock.week.year += 1;
    traditionsOnGame(state, RIVALRY_SLOT, false, log);
    expect(state.traditions.trophy).toBe(false);
    expect(state.traditions.chosen[0]!.kept).toBe(2);
    // Lost, it lifts half of what it would while held.
    expect(traditionShare(state, state.traditions.chosen[0]!)).toBeCloseTo((2 / (2 + TRADITION_HALF)) * 0.5, 5);
    expect(held).toBeCloseTo(1 / (1 + TRADITION_HALF), 5);
    expect(log.filter((entry) => /Rivalry Trophy/.test(entry.text))).toHaveLength(2);
  });
});

describe('what a tradition lifts', () => {
  it('grows with the count, with diminishing returns, inside the cause it belongs to and named on its line', () => {
    const state = choose(begun(), 'lanternWalk');
    state.traditions.chosen[0]!.kept = 9;
    const shift = causeShifts(state, 'housing').find((one) => one.name === 'Rivalry Lantern Walk')!;
    expect(shift.cause).toBe('safety');
    expect(shift.delta).toBeCloseTo((2 * (9 / 12)) / 100, 3);
    // Each time kept adds less than the time before, and the whole is never reached.
    const shares = [0, 1, 2, 3, 4, 5, 6, 40].map((kept) => kept / (kept + TRADITION_HALF));
    for (let n = 2; n < 7; n++) expect(shares[n]! - shares[n - 1]!).toBeLessThan(shares[n - 1]! - shares[n - 2]!);
    expect(shares[7]!).toBeLessThan(1);
    // The crowd, for the Fight Song.
    const fans = structuredClone(state);
    fans.traditions.chosen.push({ id: 'fightSong', chosen: 0, kept: 3, years: [], warned: 0 });
    expect(fansMore(fans)).toBeCloseTo(0.04 * 0.5, 4);
    // Nothing kept yet, nothing lifted.
    const fresh = choose(begun(), 'lanternWalk');
    expect(traditionEffects(fresh)).toEqual([]);
  });

  it('says everything within the tone guide', () => {
    for (const spec of TRADITIONS) {
      for (const line of [spec.name, spec.when, spec.needs, spec.lifts, spec.kept.replace('{n}', '4th').replace('{rival}', 'Whingarth State').replace('{wins}', '3 home wins')]) {
        expect(toneProblem(line), line).toBeNull();
      }
    }
  });
});

describe('saves', () => {
  it('keep the traditions chosen, their counts and their next days through a save and a load', () => {
    const state = toItsDay(choose(begun(), 'midnightBreakfast'), 'midnightBreakfast').state;
    const loaded = parseSave(serialize(state, state.clock.lastSimulatedAt));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.traditions).toEqual(state.traditions);
    expect(loaded.state.timers.filter((timer) => timer.kind === 'tradition')).toEqual(state.timers.filter((timer) => timer.kind === 'tradition'));
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBe(24);
  });

  describe('from version 23', () => {
    const text = readFileSync(new URL('./fixtures/save-v23-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: the owner's own kind of game, before its first commencement", () => {
      expect(file.state.version).toBe(23);
      expect(file.state.traditions).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(23);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.traditions = newTraditions();
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      const week = advance(loaded.state, file.savedAt, file.savedAt + 7 * DAY).state;
      expect(validate(week)).toBeNull();
      expect(traditionSlots(week)).toBe(1);
      const notes = upgradeNotes(23);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(/traditions/);
      expect(HOUR).toBe(3_600_000);
    });
  });
});
