import { describe, expect, it } from 'vitest';
import { advance, newGame, PLACED, SAVE_VERSION, serialize, parseSave, toneProblem, TICK_MS, type Game, type GameState, type LogEntry } from '../src/sim';
import { CHAOS_KINDS, CHAOS_WEIGHT, FOOTBALL_CHAOS, RIVALRY_TEMPER, GAME_DAY_TEMPER } from '../src/sim/config/chaos';
import { RIVALRY_SLOT, SCHOOL_COLOURS } from '../src/sim/config/football';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { causes, newChaos, rivalryWeek } from '../src/sim/systems/chaos';
import { footballChaosNow, rivalColour, stepFootballChaos } from '../src/sim/systems/footballChaos';
import { MIGRATIONS } from '../src/sim/save';
import { scaleOf } from '../src/sim/scale';
import { upgradeNotes } from '../src/app/upgradeNotes';

/**
 * The chaos sandbox, stop C3: football chaos (DESIGN.md 77). A big home win storms the field and lifts spirit; where
 * Campus Safety does not reach the stadium the goalposts come down and are paid for; couches come out into the street
 * after a big win or a rivalry loss; in rivalry week the rival's mascot may be taken, once a season, and driven home.
 */

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const model = (): GameState => newGame({ seed: 77, name: 'Test University', now: T0, campus: 'model' });
const small = (): GameState => newGame({ seed: 77, name: 'Test University', now: T0 });

/** A model campus with its own stadium at tier one and a season under way, Campus Safety near the stadium or not. */
function withStadium(safety: boolean): GameState {
  const state = model();
  const f = state.football;
  let plot = state.map.placed.findIndex((one) => one?.type === 'stadium');
  if (plot < 0) plot = state.map.placed.findIndex((one) => !!one && PLACED[one.type].family === 'athletics');
  expect(plot).toBeGreaterThanOrEqual(0);
  f.stadium.plot = plot;
  f.stadium.tier = 1;
  if (!safety) {
    // No Campus Safety anywhere: nothing reaches the stadium or the halls.
    for (const placed of state.map.placed) if (placed && PLACED[placed.type].family === 'safety') placed.type = 'parking' as typeof placed.type;
    if (state.map.care?.byFamily) state.map.care.byFamily.safety = [];
    // As the weekly reading would find it: Campus Safety reaches none of the halls.
    state.chaos.covered = 0;
  }
  // A while into the game, so a game can have kicked off before now.
  state.clock.tick += 600;
  f.season = { year: 1, games: [], table: {}, pending: [], played: 0, champion: null, bowl: '', closed: false, streak: 0 };
  return state;
}

/** A finished game of ours, kicked off a little before now. */
function played(state: GameState, slot: number, home: boolean, us: number, them: number, upset = false): Game {
  const game: Game = { slot, label: '', opp: state.football.rival, home, kick: state.clock.tick - 40, us: [us, 0, 0, 0], them: [them, 0, 0, 0], crowd: 1000, seats: 1000, rating: 50, oppRating: upset ? 60 : 50, gap: '', done: true };
  state.football.season!.games.push(game);
  return game;
}

function whistle(state: GameState): LogEntry[] {
  const log: LogEntry[] = [];
  stepFootballChaos(state, log);
  return log;
}

describe('football chaos', () => {
  it('is on a game with goals only: the small campus is as it was', () => {
    const state = small();
    const before = structuredClone(state);
    expect(whistle(state)).toEqual([]);
    expect(state).toEqual(before);
    expect(footballChaosNow(state)).toEqual({ storm: null, street: null, mascot: null });
  });

  it('counts goalposts, couches and the mascot on the meter, with causes that say what eases them', () => {
    for (const kind of ['goalposts', 'street', 'mascot'] as const) {
      expect(CHAOS_KINDS).toContain(kind);
      expect(CHAOS_WEIGHT[kind]).toBeGreaterThan(0);
    }
    const state = model();
    state.chaos.last = { tally: { ...newChaos().tally, goalposts: 1, street: 1, mascot: 1 }, missed: newChaos().missed, drama: 0, thousands: 1, raw: 0, topic: null };
    const lines = causes(state).map((one) => one.text);
    expect(lines.some((line) => /Goalposts carried off/.test(line) && /Campus Safety/.test(line))).toBe(true);
    expect(lines.some((line) => /Couches in the street/.test(line))).toBe(true);
    expect(lines.some((line) => /mascot/.test(line))).toBe(true);
  });

  it('storms the field after a big home win and lifts spirit; the goalposts come down far more often where Campus Safety does not reach the stadium', () => {
    const down = { covered: 0, open: 0 };
    for (let seed = 0; seed < 60; seed++) {
      for (const safety of [true, false]) {
        const state = withStadium(safety);
        state.rng.chaos = seed * 7919 + 13;
        const cash = state.money.cash;
        played(state, RIVALRY_SLOT, true, 28, 7);
        const log = whistle(state);
        const storm = log.find((entry) => entry.data?.football === 1 || entry.data?.football === 2);
        expect(storm, 'a storming').toBeDefined();
        expect(state.chaos.storm).not.toBeNull();
        if (state.chaos.storm!.goalposts) {
          down[safety ? 'covered' : 'open'] += 1;
          expect(state.chaos.tally.goalposts).toBe(1);
          expect(cash - state.money.cash).toBeGreaterThanOrEqual(FOOTBALL_CHAOS.goalpostBill * scaleOf(state));
        }
        // Spirit is up: a legendary night's Happiness and a lift to reach.
        expect(state.chaos.spiritAt).toBe(state.clock.tick);
        expect(state.chaos.reach.some((one) => one.size > 0)).toBe(true);
      }
    }
    expect(down.open).toBeGreaterThan(down.covered * 2);
    expect(down.open).toBeGreaterThan(20);
  });

  it('reads each game once, at its whistle, and never a game long over', () => {
    const state = withStadium(false);
    played(state, 3, true, 35, 3);
    whistle(state);
    const after = structuredClone(state.chaos);
    expect(whistle(state)).toEqual([]);
    expect(state.chaos.tally).toEqual(after.tally);
    // A game from before the save had chaos is not read.
    const old = withStadium(false);
    const game = played(old, 3, true, 35, 3);
    game.kick = old.clock.tick - 24 * 60;
    expect(whistle(old).filter((entry) => entry.data?.football !== undefined)).toEqual([]);
  });

  it('has no storming away from home, after an ordinary win or a loss, or before the campus has its own stadium', () => {
    for (const [slot, home, us, them] of [[3, false, 35, 3], [3, true, 14, 10], [3, true, 3, 35]] as const) {
      const state = withStadium(false);
      played(state, slot, home, us, them);
      expect(whistle(state).some((entry) => entry.data?.football === 1 || entry.data?.football === 2)).toBe(false);
    }
    const rented = withStadium(false);
    rented.football.stadium.tier = 0;
    played(rented, RIVALRY_SLOT, true, 28, 7);
    expect(whistle(rented).some((entry) => entry.data?.football === 1 || entry.data?.football === 2)).toBe(false);
  });

  it('brings couches into the street now and then after a big win or a rivalry loss, by a dorm, for a while, and pays to haul them back', () => {
    let nights = 0;
    for (let seed = 0; seed < 60; seed++) {
      const state = withStadium(false);
      state.rng.chaos = seed * 104729 + 5;
      const cash = state.money.cash;
      played(state, RIVALRY_SLOT, false, 7, 28);
      const log = whistle(state);
      const street = log.find((entry) => entry.data?.football === 3);
      if (!street) continue;
      nights += 1;
      const s = state.chaos.street!;
      expect(state.map.buildings[s.dorm]?.zone).toBe('housing');
      expect(s.from).toBeGreaterThan(state.clock.tick);
      expect(s.until - s.from).toBe(FOOTBALL_CHAOS.street.lasts);
      expect(cash - state.money.cash).toBeCloseTo(FOOTBALL_CHAOS.couchBill * scaleOf(state), 6);
      expect(street.text).toMatch(/nobody the worse for it/);
      expect(street.text).not.toMatch(/burn|fire|riot/i);
    }
    expect(nights).toBeGreaterThan(10);
    expect(nights).toBeLessThan(60);
  });

  it("takes the rival's mascot in rivalry week at most once a season, and Campus Safety drives it home", () => {
    let taken = 0;
    let home = 0;
    let season = -1;
    for (let k = 0; k < 8 && taken === 0; k++) {
      const state = withStadium(false);
      // Into rivalry week: late November in the game's calendar.
      while (!rivalryWeek(state)) state.clock.tick += 30;
      state.rng.chaos = 991 + k * 17;
      const log: LogEntry[] = [];
      // The whole week, and long enough after it for the trip home.
      for (let t = 0; t < 2000; t++) {
        state.clock.tick += 1;
        stepFootballChaos(state, log);
      }
      taken = log.filter((entry) => entry.data?.football === 4).length;
      home = log.filter((entry) => entry.data?.football === 5).length;
      season = state.chaos.mascotSeason;
      if (taken > 0) {
        const at = log.find((entry) => entry.data?.football === 4)!.tick;
        const back = log.find((entry) => entry.data?.football === 5)!.tick;
        // No Campus Safety near the halls: a long trip home.
        expect(back - at).toBe(FOOTBALL_CHAOS.mascot.homeNone);
      }
    }
    expect(taken).toBe(1);
    expect(home).toBe(1);
    expect(season).toBe(1);
  });

  it('runs tempers higher on the rivalry game day than on any other home game day', () => {
    expect(RIVALRY_TEMPER).toBeGreaterThan(GAME_DAY_TEMPER);
  });

  it("dresses the rival in a school colour never the player's, the same every time", () => {
    const state = model();
    const colour = rivalColour(state);
    expect(SCHOOL_COLOURS.map((one) => one.id)).toContain(colour.id);
    expect(colour.id).not.toBe(state.football.colour);
    expect(rivalColour(structuredClone(state))).toEqual(colour);
    for (const id of SCHOOL_COLOURS.map((one) => one.id)) {
      const other = model();
      other.football.colour = id;
      expect(rivalColour(other).id).not.toBe(id);
    }
  });

  it('tells it all in comic words, inside the tone guide and its hard lines', () => {
    const lines: string[] = [...upgradeNotes(37)];
    for (let seed = 0; seed < 30; seed++) {
      for (const safety of [true, false]) {
        const state = withStadium(safety);
        state.rng.chaos = seed * 31 + 1;
        played(state, RIVALRY_SLOT, true, 28, 7);
        lines.push(...whistle(state).map((entry) => entry.text));
        const loss = withStadium(safety);
        loss.rng.chaos = seed * 37 + 3;
        played(loss, RIVALRY_SLOT, true, 7, 28);
        lines.push(...whistle(loss).map((entry) => entry.text));
      }
    }
    expect(lines.length).toBeGreaterThan(30);
    for (const line of lines) {
      expect(toneProblem(line), line).toBeNull();
      expect(hardLineProblem(line), line).toBeNull();
      expect(line.toLowerCase(), line).not.toMatch(/riot|brawl|crime|vandal|burn|fire|punch/);
    }
  });

  it('comes through a version 37 save with nothing read and nothing on the map, and nothing else moved', () => {
    expect(SAVE_VERSION).toBe(38);
    const state = model();
    const file = JSON.parse(serialize(state, T0));
    file.v = 37;
    const chaos = file.state.chaos;
    for (const key of ['lastKick', 'storm', 'street', 'mascot', 'mascotSeason']) delete chaos[key];
    for (const counts of [chaos.tally, chaos.missed]) for (const kind of ['goalposts', 'street', 'mascot']) delete counts[kind];
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(37);
    expect(loaded.state).toEqual(state);
    expect(typeof MIGRATIONS[37]).toBe('function');
  });

  it('is the same in one step or many', () => {
    const a = withStadium(false);
    played(a, RIVALRY_SLOT, true, 28, 7);
    const b = structuredClone(a);
    const span = 3 * 60 * TICK_MS;
    const one = advance(a, T0, T0 + span).state;
    let many = b;
    for (let k = 0; k < 12; k++) many = advance(many, T0 + (k * span) / 12, T0 + ((k + 1) * span) / 12).state;
    expect(many.chaos).toEqual(one.chaos);
    expect(many.money.cash).toBeCloseTo(one.money.cash, 6);
  });
});
