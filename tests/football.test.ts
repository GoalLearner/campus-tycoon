import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  academicRating,
  advance,
  applyAction,
  approvalAt,
  atHome,
  athleticLift,
  budget,
  calendarAt,
  dateAt,
  datedDays,
  driftField,
  expectedCrowd,
  fallClassDraw,
  fanDemand,
  FIELD_MEAN,
  FIELD_SIZE,
  fieldAverage,
  FIRST_INTAKE_TICK,
  footballBooks,
  GAME_DAY_FOOD,
  GAME_TICKS,
  hasSeason,
  homeGameNow,
  liveGame,
  ME,
  NAME_BLOCKLIST,
  newGame,
  NOISE_RADIUS,
  noiseAt,
  pairings,
  parseSave,
  partLevel,
  pollOrder,
  RATING_MAX,
  RATING_MIN,

  seatsNow,

  SELL_OUT,
  serialize,
  SLOT_KINDS,
  SLOTS,
  slotKick,
  standings,
  starChance,
  teamRating,
  TICK_MS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_YEAR,
  TIER_BUILD_TICKS,
  TIER_COST,
  winChance,
  type Decision,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { seedStreams } from '../src/sim/rng';
import { recomputeRates } from '../src/sim/systems/money';

/**
 * Football and the national field (DESIGN.md sections 10 and 11), and the
 * annual decisions (4.4).
 */

const NOW = Date.UTC(2026, 0, 5, 9, 0, 0);
const run = (state: GameState, ticks: number): { state: GameState; log: LogEntry[] } => {
  const result = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ticks * TICK_MS);
  return { state: result.state, log: result.log };
};
const to = (state: GameState, tick: number): { state: GameState; log: LogEntry[] } => run(state, tick - state.clock.tick);
const fresh = (seed = 31): GameState => newGame({ seed, name: 'Larkspur University', now: NOW });
/** A campus of a given size, on the first day of its fall. */
const campus = (students: number, seed = 31): GameState => {
  const state = run(fresh(seed), FIRST_INTAKE_TICK).state;
  const year = Math.round(students / 4);
  state.cohorts = [students - 3 * year, year, year, year];
  state.money.cash = 50_000_000;
  recomputeRates(state);
  return state;
};
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

describe('the national field', () => {
  it('is 199 other schools with invented names, made once from its own stream', () => {
    const state = fresh();
    const { schools } = state.field;
    expect(schools.length).toBe(FIELD_SIZE - 1);
    const names = schools.map((school) => school.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('larkspur university');
    for (const name of names) for (const blocked of NAME_BLOCKLIST) expect(name.includes(blocked), `${name} holds ${blocked}`).toBe(false);
    for (const school of schools) {
      for (const value of [school.ap, school.ar, school.fp, school.fr]) {
        expect(value).toBeGreaterThanOrEqual(RATING_MIN);
        expect(value).toBeLessThanOrEqual(RATING_MAX);
      }
      expect(school.off.length).toBe(7);
      expect(school.nick.length).toBeGreaterThan(2);
    }
    expect(fieldAverage(state.field, 'ar')).toBeCloseTo(FIELD_MEAN, 0);
    expect(fieldAverage(state.field, 'fr')).toBeCloseTo(FIELD_MEAN, 0);
    // The same seed makes the same field, and the streams the game had before football are untouched by it.
    expect(fresh().field).toEqual(state.field);
    expect(fresh(32).field.schools[0]!.name).not.toBe(state.field.schools[0]!.name);
    const streams = seedStreams(31);
    for (const stream of ['growth', 'intake', 'names', 'events'] as const) expect(state.rng[stream]).toBe(streams[stream]);
    expect(state.rng.football).not.toBe(streams.football);
  });

  it('drifts every year and never rises as a whole', () => {
    const state = fresh();
    const first = structuredClone(state.field.schools.map((school) => school.fr));
    let moved = 0;
    for (let year = 0; year < 40; year++) {
      driftField(state.field, state.rng);
      expect(Math.abs(fieldAverage(state.field, 'ar') - FIELD_MEAN)).toBeLessThan(0.6);
      expect(Math.abs(fieldAverage(state.field, 'fr') - FIELD_MEAN)).toBeLessThan(0.6);
      for (const school of state.field.schools) {
        expect(school.fr).toBeGreaterThanOrEqual(RATING_MIN);
        expect(school.ar).toBeLessThanOrEqual(RATING_MAX);
      }
    }
    state.field.schools.forEach((school, id) => {
      if (Math.abs(school.fr - first[id]!) > 5) moved += 1;
    });
    // Standing can fall while a school stands still: plenty of the field has moved.
    expect(moved).toBeGreaterThan(40);
    expect(state.field.moved!.upBy).toBeGreaterThan(0);
  });

  it('ranks the player from inputs they can read', () => {
    const state = campus(800);
    const inputs = academicInputs(state);
    expect(inputs.map((input) => input.id)).toEqual(['graduation', 'classSize', 'reputation', 'retention', 'selectivity']);
    expect(sum(inputs.map((input) => input.weight))).toBe(75);
    // An input with nothing to read is left out, and the others share its weight.
    expect(inputs.find((input) => input.id === 'graduation')!.level).toBeNull();
    const rating = academicRating(state);
    expect(rating).toBeGreaterThanOrEqual(RATING_MIN);
    expect(rating).toBeLessThanOrEqual(RATING_MAX);
  });

  it('rankings day places the school among the 200 and says who moved', () => {
    let state = fresh();
    const said: LogEntry[] = [];
    for (let day = 0; day < 13; day++) {
      const step = run(state, TICKS_PER_DAY);
      state = step.state;
      said.push(...step.log.filter((entry) => entry.kind === 'rankings'));
    }
    expect(said.length).toBe(2);
    expect(said[0]!.text).toMatch(/enters the national rankings at No\. \d+ of 200/);
    expect(said[1]!.text).toMatch(/is No\. \d+ of 200 for academics/);
    expect(said[1]!.text).toMatch(/climbed \d+ places/);
    expect(state.field.rank).toBeGreaterThanOrEqual(1);
    expect(state.field.rank).toBeLessThanOrEqual(200);
    expect(state.field.rankYear).toBe(2);
    expect(state.field.reputation).toBeGreaterThan(0);
    // Rankings day is the anchor of day 5.
    for (const entry of said) expect((entry.tick - FIRST_INTAKE_TICK) % TICKS_PER_YEAR).toBe(4 * TICKS_PER_DAY);
  });
});

describe('the conference and its schedule', () => {
  it('is twelve teams in two divisions, with the player first and a rival beside them', () => {
    const f = fresh().football;
    expect(f.divisions[0].length).toBe(6);
    expect(f.divisions[1].length).toBe(6);
    expect(f.divisions[0][0]).toBe(ME);
    expect(new Set([...f.divisions[0], ...f.divisions[1]]).size).toBe(12);
    expect(f.divisions[0]).toContain(f.rival);
    expect(f.conference).toMatch(/ Conference$/);
    expect(f.coach.until).toBe(3);
    expect(f.classes.length).toBe(4);
  });

  it('gives every team ten games: an opener, five division games and four crossovers', () => {
    for (const year of [1, 2, 3, 4, 7]) {
      const state = fresh();
      state.clock.week = { year, start: FIRST_INTAKE_TICK + (year - 1) * TICKS_PER_YEAR, extra: 0 };
      const f = state.football;
      const teams = [...f.divisions[0], ...f.divisions[1]];
      const met = new Map<number, number[]>(teams.map((team) => [team, []]));
      for (let slot = 0; slot < SLOTS.length; slot++) {
        const games = pairings(state, slot);
        const playing: number[] = [];
        for (const game of games) {
          for (const [team, other] of [[game.home, game.away], [game.away, game.home]] as const) {
            if (!met.has(team)) continue;
            playing.push(team);
            met.get(team)!.push(other);
          }
          if (SLOT_KINDS[slot] === 'opener') expect(met.has(game.home) && met.has(game.away)).toBe(false);
          else expect(met.has(game.home) && met.has(game.away)).toBe(true);
        }
        // Every team plays exactly once on every Saturday of the season.
        expect(playing.sort((a, b) => a - b)).toEqual([...teams].sort((a, b) => a - b));
        const mine = games.find((game) => game.home === ME || game.away === ME)!;
        expect(mine.home === ME).toBe(atHome(slot, year));
      }
      for (const division of f.divisions) {
        for (const team of division) {
          const opponents = met.get(team)!;
          expect(opponents.length).toBe(10);
          const mates = division.filter((other) => other !== team);
          // Each division mate once, and four different teams of the other division.
          for (const mate of mates) expect(opponents.filter((other) => other === mate).length).toBe(1);
          const across = opponents.filter((other) => met.has(other) && !division.includes(other));
          expect(across.length).toBe(4);
          expect(new Set(across).size).toBe(4);
        }
      }
      // The last game is the rivalry, at home in odd years.
      const last = pairings(state, 9).find((game) => game.home === ME || game.away === ME)!;
      expect(last.home === ME ? last.away : last.home).toBe(f.rival);
      expect(last.home === ME).toBe(year % 2 === 1);
    }
  });

  it('kicks off on the Saturdays of the calendar, home games in waking hours', () => {
    const state = run(fresh(), FIRST_INTAKE_TICK).state;
    const start = state.clock.week.start;
    const minutes = SLOTS.map((_, slot) => slotKick(state, slot) - start);
    // DESIGN.md 4.8: anchor + 8 h 00, 11 h 18, 14 h 35, 17 h 53, then day 2 at 0 h 28, 7 h 04, 10 h 21, 16 h 56, 20 h 14 and 23 h 32.
    const table = [8 * 60, 11 * 60 + 18, 14 * 60 + 35, 17 * 60 + 53, 24 * 60 + 28, 31 * 60 + 4, 34 * 60 + 21, 40 * 60 + 56, 44 * 60 + 14, 47 * 60 + 32];
    minutes.forEach((minute, slot) => expect(Math.abs(minute - table[slot]!), `game ${slot + 1}`).toBeLessThanOrEqual(1));
    for (let slot = 0; slot < SLOTS.length; slot++) {
      const clock = { tick: slotKick(state, slot), week: state.clock.week };
      expect(dateAt(clock).weekday).toBe(6);
      // The player's day is taken to start two hours before the anchor and last sixteen hours.
      const hour = ((slotKick(state, slot) - start) / 60) % 24;
      const awake = hour < 14 || hour >= 22;
      if (slot !== 9) expect(awake, `game ${slot + 1} at anchor + ${hour.toFixed(1)} h`).toBe(SLOTS[slot]!.home === true);
    }
    // The season's games are laid out on the first day, each with its kickoff.
    expect(state.football.season!.games.map((game) => game.kick)).toEqual(SLOTS.map((_, slot) => slotKick(state, slot)));
    expect(state.timers.filter((timer) => timer.kind === 'kickoff' && timer.ref < 100).length).toBe(10);
  });

  it("tells a game's result under the Saturday it kicked off, though the whistle blows a date or two later", () => {
    const start = run(fresh(), FIRST_INTAKE_TICK).state;
    const { log } = to(start, slotKick(start, 9) + GAME_TICKS + 5);
    const games = log.filter((entry) => entry.kind === 'game' && Number(entry.data?.slot) < 10);
    expect(games.length).toBe(10);
    for (const entry of games) {
      const [month, day] = SLOTS[Number(entry.data!.slot)]!.date;
      expect(entry.date, `game ${Number(entry.data!.slot) + 1}`).toBe(month * 100 + day);
      // Forty minutes is longer than a date in the game, so the date at the whistle is a later one.
      expect(dateAt({ tick: entry.tick, week: start.clock.week }).day).not.toBe(day);
    }
    // In the away list each date has one heading, and the games stand in the order they were played.
    const days = datedDays(log).days;
    const headings = days.map((day) => day.date);
    expect(new Set(headings).size).toBe(headings.length);
    const told = days.flatMap((day) => day.lines.filter((line) => games.some((game) => game.text === line)));
    expect(told).toEqual(games.map((game) => game.text));
    expect(headings).toContain('Sep 5');
    expect(headings).toContain('Nov 28');
  });

  it('a ten-point edge wins about three games in four', () => {
    expect(winChance(60, 50)).toBeCloseTo(0.75, 6);
    expect(winChance(50, 50)).toBeCloseTo(0.5, 6);
    expect(winChance(50, 60)).toBeCloseTo(0.25, 6);
    expect(winChance(50, 50, 3)).toBeGreaterThan(0.5);
  });
});

describe('a season', () => {
  const season = (() => {
    const start = run(fresh(), FIRST_INTAKE_TICK).state;
    return { start, ...to(start, start.clock.week.start + 4 * TICKS_PER_DAY) };
  })();

  it('plays ten games for every team, and the standings add up', () => {
    const { state } = season;
    const table = state.football.season!.table;
    const teams = Object.keys(table);
    expect(teams.length).toBe(12);
    let wins = 0;
    let losses = 0;
    let confWins = 0;
    let confLosses = 0;
    for (const team of teams) {
      const record = table[team]!;
      // The player's own record may hold a title game or a bowl on top of the ten.
      const extra = team === String(ME) ? state.football.season!.games.filter((game) => game.slot >= 10 && game.done).length : 0;
      expect(record.w + record.l, `team ${team}`).toBe(10 + extra);
      expect(record.cw + record.cl).toBe(9);
      expect(record.dw + record.dl).toBe(5);
      wins += record.w;
      losses += record.l;
      confWins += record.cw;
      confLosses += record.cl;
    }
    // Every conference game has one winner and one loser.
    expect(confWins).toBe(confLosses);
    expect(confWins).toBe((12 * 9) / 2);
    expect(wins + losses).toBeGreaterThanOrEqual(120);
    for (const division of [0, 1]) {
      const rows = standings(state, division);
      expect(rows.length).toBe(6);
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.record.cw).toBeGreaterThanOrEqual(rows[i]!.record.cw);
    }
    expect(state.football.season!.closed).toBe(true);
    expect(state.football.season!.champion).not.toBeNull();
  });

  it('tells each game once, with the score, and the season in a line that is kept', () => {
    const games = season.log.filter((entry) => entry.kind === 'game');
    expect(games.filter((entry) => Number(entry.data?.slot) < 10).length).toBe(10);
    for (const entry of games) {
      expect(entry.text).toMatch(/Larkspur University \d+|\d+, Larkspur University \d+/);
      expect(entry.date).toBeGreaterThan(100);
    }
    // A loss names the biggest gap, and a home game its crowd.
    const lost = games.find((entry) => entry.data?.won === 0);
    if (lost) expect(lost.text).toContain('The biggest gap was');
    const home = games.find((entry) => entry.data?.home === 1)!;
    expect(home.text).toMatch(/[\d,]+ came, \d+% of the seats/);
    const over = season.log.filter((entry) => entry.kind === 'football' && entry.data?.keep === 1 && entry.data?.wins !== undefined);
    expect(over.length).toBe(1);
    expect(over[0]!.text).toMatch(/\d+ wins? and \d+ loss(es)?\./);
    expect(season.state.football.last).toMatchObject({ year: 1 });
    expect(season.state.football.record.seasons).toBe(1);
    expect(season.state.football.poll!.label).toBe('Final');
    expect(season.state.football.poll!.rows.length).toBe(25);
  });

  it('is rolled whole at kickoff and shown a quarter at a time', () => {
    const before = to(season.start, slotKick(season.start, 0) - 1).state;
    expect(before.football.season!.games[0]!.us).toEqual([]);
    expect(liveGame(before)).toBeNull();
    const kicked = run(before, 1).state;
    const game = kicked.football.season!.games[0]!;
    expect(game.us.length).toBe(4);
    expect(game.them.length).toBe(4);
    expect(sum(game.us)).not.toBe(sum(game.them));
    expect(liveGame(kicked)).toMatchObject({ quarter: 1, us: 0, them: 0 });
    const half = run(kicked, 20).state;
    expect(liveGame(half)).toMatchObject({ quarter: 3, us: game.us[0]! + game.us[1]!, them: game.them[0]! + game.them[1]! });
    const done = run(kicked, GAME_TICKS).state;
    expect(liveGame(done)).toBeNull();
    expect(done.football.season!.games[0]!.done).toBe(true);
    expect(done.football.season!.games[0]!.us).toEqual(game.us);
    // It was a home game: the campus turns out from an hour before, and food earns more while it does.
    expect(homeGameNow(before)).not.toBeNull();
    expect(homeGameNow(done)).toBeNull();
    const food = (state: GameState): number => budget(state).income.find((line) => line.id === 'food')!.amount;
    expect(food(kicked)).toBeCloseTo(food(done) * GAME_DAY_FOOD, 6);
    expect(kicked.money.incomePerYear).toBeGreaterThan(done.money.incomePerYear);
  });

  it('is the same season however the time is reached', () => {
    const end = season.start.clock.lastSimulatedAt + 3 * 24 * 60 * TICK_MS;
    const once = advance(season.start, season.start.clock.lastSimulatedAt, end);
    let stepped = season.start;
    const log: LogEntry[] = [];
    for (let t = season.start.clock.lastSimulatedAt; t < end; t += 97 * TICK_MS) {
      const part = advance(stepped, stepped.clock.lastSimulatedAt, Math.min(end, t + 97 * TICK_MS));
      stepped = part.state;
      log.push(...part.log);
    }
    expect(serialize(stepped, 0)).toBe(serialize(once.state, 0));
    expect(log).toEqual(once.log);
    // And a saved game picks it up exactly.
    const mid = to(season.start, slotKick(season.start, 4) + 13).state;
    const loaded = parseSave(serialize(mid, 0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(serialize(run(loaded.state, 2000).state, 0)).toBe(serialize(run(mid, 2000).state, 0));
  });

  it('the poll orders all 200, and a better record ranks higher between equals', () => {
    const order = pollOrder(season.state);
    expect(order.length).toBe(FIELD_SIZE);
    expect(order.filter((row) => row.team === ME).length).toBe(1);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.score).toBeGreaterThanOrEqual(order[i]!.score);
    // The poll was published when the season closed. Signing day has moved the roster a little since.
    expect(Math.abs(season.state.football.poll!.mine - (order.findIndex((row) => row.team === ME) + 1))).toBeLessThanOrEqual(4);
  });
});

describe('the team', () => {
  it('rates from four things the player can see', () => {
    const state = fresh();
    const rating = teamRating(state);
    expect(rating.total).toBeCloseTo(0.35 * rating.coach + 0.35 * rating.roster + 0.15 * rating.stadium + 0.15 * rating.funding, 1);
    expect(rating.stadium).toBe(0);
    expect(rating.funding).toBe(100);
    const better = structuredClone(state);
    better.football.stadium.tier = 3;
    better.football.coach.rating += 20;
    better.football.classes = [70, 70, 70, 70];
    expect(teamRating(better).total).toBeGreaterThan(rating.total + 15);
  });

  it('signs a class on signing day: the safe one by default, or a chase that can miss', () => {
    const base = to(run(fresh(), FIRST_INTAKE_TICK).state, FIRST_INTAKE_TICK + 2 * TICKS_PER_DAY + 1).state;
    const pitch = base.decisions.open.find((item) => item.kind === 'pitch')!;
    expect(pitch).toBeDefined();
    expect(pitch.closes - pitch.opens).toBe(48 * TICKS_PER_HOUR);
    expect(pitch.fallback).toBe('safe');
    expect(starChance(base)).toBeGreaterThan(0.25);
    expect(starChance(base)).toBeLessThanOrEqual(0.6);
    // Left alone, the safe class signs.
    const left = to(base, pitch.closes);
    expect(left.state.decisions.open.some((item) => item.kind === 'pitch')).toBe(false);
    expect(left.log.some((entry) => entry.kind === 'decision' && entry.data?.byDefault === 1)).toBe(true);
    expect(left.log.find((entry) => entry.text.startsWith('Signing day'))!.text).toContain('A safe class signed');
    expect(left.state.football.classes.length).toBe(4);
    expect(left.state.football.classes.slice(0, 3)).toEqual(base.football.classes.slice(1));
    // Chosen, the chase is taken on signing day and can be changed until then.
    const chose = applyAction(base, { type: 'decide', id: pitch.id, option: 'star' });
    expect(chose.ok).toBe(true);
    expect(chose.state.decisions.open.find((item) => item.kind === 'pitch')!.chosen).toBe('star');
    expect(applyAction(chose.state, { type: 'decide', id: pitch.id, option: 'safe' }).state.football.pitch).toBe('safe');
    const chased = to(chose.state, pitch.closes);
    expect(chased.log.find((entry) => entry.text.startsWith('Signing day'))!.text).toMatch(/The star signed/);
    expect(chased.log.some((entry) => entry.kind === 'decision' && entry.data?.byDefault === 1)).toBe(false);
    expect(chased.state.decisions.past.at(-1)).toMatchObject({ kind: 'pitch', byDefault: false, outcome: 'Chased a star' });
    expect(applyAction(chased.state, { type: 'decide', id: pitch.id, option: 'safe' }).ok).toBe(false);
  });
});

describe('the annual decisions', () => {
  /** Six years on a campus big enough to fill a rented field. A new campus has its stadium plot from the first day. */
  const years = (() => {
    let state = campus(3000);
    state.football.standing = 60;
    if (state.football.stadium.plot === null) throw new Error('A new campus should have its stadium plot.');
    const opened: Decision[] = [];
    const log: LogEntry[] = [];
    const seen = new Set<number>();
    for (let day = 0; day < 6 * 7; day++) {
      const step = run(state, TICKS_PER_DAY);
      state = step.state;
      // Keep a healthy campus through the years: this is about football, not admissions.
      state.cohorts = [750, 750, 750, 750];
      log.push(...step.log);
      for (const item of state.decisions.open) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        opened.push(structuredClone(item));
      }
    }
    return { state, opened, log };
  })();

  it('are open for 48 hours or more, each with a default that applies by itself', () => {
    const kinds = new Set(years.opened.map((item) => item.kind));
    expect(kinds.has('pitch')).toBe(true);
    expect(kinds.has('coach')).toBe(true);
    expect(kinds.has('stadium')).toBe(true);
    for (const item of years.opened) {
      expect(item.closes - item.opens, item.title).toBeGreaterThanOrEqual(48 * TICKS_PER_HOUR);
      expect(item.options.map((option) => option.id)).toContain(item.fallback);
      expect(item.options.map((option) => option.id)).toContain(item.advised);
      expect(item.advisor.length).toBeGreaterThan(3);
    }
    // The coach and the stadium are open for 72 hours, to the fall anchor.
    for (const item of years.opened.filter((one) => one.kind === 'coach' || one.kind === 'stadium')) expect(item.closes - item.opens).toBe(72 * TICKS_PER_HOUR);
    // Every one that closed unanswered was settled by its default and said so.
    const byDefault = years.log.filter((entry) => entry.kind === 'decision' && entry.data?.byDefault === 1);
    expect(byDefault.length).toBeGreaterThanOrEqual(years.opened.length - years.state.decisions.open.length);
    expect(years.state.decisions.past.length).toBeGreaterThan(5);
    // Nobody chose, so the coach was kept a year at a time and the stadium was never built.
    expect(years.state.football.coach.until).toBeGreaterThanOrEqual(years.state.clock.week.year);
    expect(years.state.football.stadium.tier).toBe(0);
    expect(years.state.football.stadium.earned).toBe(1);
  });

  it('a season of sell-outs earns a stadium, which is built out of season on the plot', () => {
    const earned = years.log.find((entry) => entry.data?.earned === 1);
    expect(earned).toBeDefined();
    expect(earned!.text).toContain('That earns a bigger stadium');
    // Start again from the spring the choice first opens.
    let state = campus(3000);
    state.football.standing = 60;
    expect(expectedCrowd(state) / seatsNow(state)).toBeGreaterThanOrEqual(SELL_OUT);
    state = to(state, state.clock.week.start + 4 * TICKS_PER_DAY + 1).state;
    const ask = state.decisions.open.find((item) => item.kind === 'stadium')!;
    expect(ask).toBeDefined();
    expect(ask.options[0]!.cost).toBe(TIER_COST[1]);
    // With the plot cleared away it cannot be built, and says why.
    state = applyAction(state, { type: 'paint', tool: 'clear', cells: [[27, 9]] }).state;
    expect(state.football.stadium.plot).toBeNull();
    const early = applyAction(state, { type: 'decide', id: ask.id, option: 'build' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toContain('stadium plot');
    state = applyAction(state, { type: 'place', building: 'stadium', x: 3, y: 3 }).state;
    expect(state.football.stadium.plot).not.toBeNull();
    expect(applyAction(state, { type: 'place', building: 'stadium', x: 8, y: 3 }).ok).toBe(false);
    const cash = state.money.cash;
    const built = applyAction(state, { type: 'decide', id: ask.id, option: 'build' });
    expect(built.ok).toBe(true);
    state = built.state;
    expect(state.money.cash).toBe(cash - TIER_COST[1]!);
    expect(state.football.stadium.work).toEqual({ tier: 1, done: state.clock.tick + TIER_BUILD_TICKS[1]! });
    expect(state.decisions.open.some((item) => item.kind === 'stadium')).toBe(false);
    // The plot cannot be cleared while the stadium is going up or standing.
    expect(applyAction(state, { type: 'paint', tool: 'clear', cells: [[3, 3]] }).ok).toBe(false);
    const opened = run(state, TIER_BUILD_TICKS[1]!);
    expect(opened.state.football.stadium.tier).toBe(1);
    expect(opened.state.football.stadium.work).toBeNull();
    expect(opened.log.some((entry) => entry.text.includes('The new stadium is open'))).toBe(true);
    expect(seatsNow(opened.state)).toBeGreaterThan(seatsNow(state));
    expect(teamRating(opened.state).stadium).toBe(20);
    // With a stadium on the way there is a TV deal to talk about, the next day.
    const tv = opened.state;
    expect(tv.clock.tick).toBe(tv.clock.week.start + 5 * TICKS_PER_DAY + 1);
    const deal = tv.decisions.open.find((item) => item.kind === 'tv')!;
    expect(deal).toBeDefined();
    expect(deal.closes - deal.opens).toBeGreaterThanOrEqual(48 * TICKS_PER_HOUR);
    const signed = applyAction(tv, { type: 'decide', id: deal.id, option: 'safe' }).state;
    expect(signed.football.tv.perYear).toBeGreaterThan(0);
    expect(budget(signed).income.find((line) => line.id === 'tv')!.amount).toBe(signed.football.tv.perYear);
    expect(athleticLift(signed)).toBeGreaterThan(athleticLift(tv));
  });

  it('a bare plot can be moved, and clearing it forgets it', () => {
    const state = campus(500);
    const plot = state.football.stadium.plot;
    expect(plot).not.toBeNull();
    expect(state.map.placed[plot!]).toMatchObject({ type: 'stadium', x: 27, y: 9, w: 2, h: 3 });
    // Any cell of it clears the whole plot.
    const cleared = applyAction(state, { type: 'paint', tool: 'clear', cells: [[28, 11]] });
    expect(cleared.ok).toBe(true);
    expect(cleared.state.football.stadium.plot).toBeNull();
    expect(applyAction(cleared.state, { type: 'place', building: 'stadium', x: 8, y: 3 }).ok).toBe(true);
  });

  it('moving the anchor keeps every open decision open for the longer summer', () => {
    let state = campus(3000);
    state.football.standing = 60;
    state = to(state, state.clock.week.start + 4 * TICKS_PER_DAY + 1).state;
    const before = state.decisions.open.find((item) => item.kind === 'stadium')!;
    expect(before.closes).toBe(state.clock.week.start + TICKS_PER_YEAR);
    const moved = applyAction(state, { type: 'anchor', minute: 16 * 60 }).state;
    const after = moved.decisions.open.find((item) => item.kind === 'stadium')!;
    expect(moved.clock.week.extra).toBeGreaterThan(0);
    expect(after.closes).toBe(before.closes + moved.clock.week.extra);
    // It is still open the minute the old fall would have begun, and settled when the new one does.
    const late = to(moved, before.closes + 1).state;
    expect(late.decisions.open.some((item) => item.kind === 'stadium')).toBe(true);
    expect(calendarAt(late.clock).phase).toBe('summer');
    expect(to(late, after.closes).state.decisions.open.some((item) => item.kind === 'stadium')).toBe(false);
  });
});

describe("football's money", () => {
  it('costs and earns nothing before the first class, or on an empty campus', () => {
    const none = { tickets: 0, tv: 0, pay: 0, coach: 0, staff: 0, operations: 0, upkeep: 0, utilities: 0, crowd: 0 };
    expect(footballBooks(fresh())).toEqual(none);
    const empty = campus(400);
    empty.cohorts = [0, 0, 0, 0];
    expect(footballBooks(empty)).toEqual(none);
  });

  it('follows the size of the school, so a small campus is not sunk by it', () => {
    const net = (students: number): number => {
      const books = footballBooks(campus(students));
      return books.tickets + books.tv - books.pay * 1.3 - books.operations - books.upkeep - books.utilities;
    };
    const income = (students: number): number => budget(campus(students)).incomeTotal;
    for (const students of [60, 400, 1500, 5000]) {
      // At a rented field football is a cost, and a small one: never more than four dollars in a hundred.
      expect(net(students) / income(students), `${students} students`).toBeGreaterThan(-0.04);
      expect(net(students) / income(students), `${students} students`).toBeLessThan(0.02);
    }
    const small = footballBooks(campus(60));
    const large = footballBooks(campus(5000));
    expect(small.coach).toBeLessThan(large.coach);
    expect(large.coach).toBe(campus(5000).football.coach.pay);
    expect(small.staff).toBe(0);
    expect(large.staff).toBeGreaterThan(10);
    // The lines are in the budget where they belong.
    const b = budget(campus(1500));
    expect(b.income.map((line) => line.id)).toContain('tickets');
    expect(b.groups.find((group) => group.id === 'payroll')!.lines.map((line) => line.id)).toContain('coaches');
    expect(b.groups.find((group) => group.id === 'other')!.lines.map((line) => line.id)).toContain('athletics');
  });

  it('a cheaper ticket fills more seats, and a dearer one earns more from each', () => {
    const state = campus(800);
    const crowds = [0, 1, 2, 3, 4].map((step) => fanDemand(applyAction(state, { type: 'ticketPrice', step }).state));
    for (let step = 1; step < 5; step++) expect(crowds[step]!).toBeLessThan(crowds[step - 1]!);
    expect(applyAction(state, { type: 'ticketPrice', step: 5 }).ok).toBe(false);
    // Homecoming and the rivalry draw a quarter more.
    expect(fanDemand(state, true)).toBeGreaterThan(fanDemand(state) * 1.2);
  });

  it('athletic standing lifts applications, by an eighth at most', () => {
    const state = campus(2000);
    state.football.standing = 0;
    const none = fallClassDraw(state);
    state.football.standing = 100;
    const top = fallClassDraw(state);
    expect(athleticLift(state)).toBeCloseTo(0.12, 6);
    expect(top).toBeGreaterThan(none);
    expect(top / none).toBeLessThanOrEqual(1.13);
  });
});

describe('stadium noise', () => {
  it('is part of Grounds for the dorms inside its reach, and for nobody else', () => {
    let state = campus(600);
    // Where a new campus has it, the plot is out of earshot of every dorm, at any tier.
    for (const tier of [1, 3, 5]) {
      const far = structuredClone(state);
      far.football.stadium.tier = tier;
      for (const building of far.map.buildings) if (building && building.zone === 'housing') expect(noiseAt(far, building.x, building.y)).toBe(0);
    }
    // Moved to two cells west of the first starter dorm, which stands at (10, 13), it is not.
    state = applyAction(state, { type: 'paint', tool: 'clear', cells: [[27, 9]] }).state;
    state = applyAction(state, { type: 'place', building: 'stadium', x: 7, y: 10 }).state;
    const dorm = 13 * state.map.width + 10;
    const hall = 18 * state.map.width + 19;
    expect(noiseAt(state, 10, 13)).toBe(0);
    expect(partLevel(approvalAt(state, dorm).causes, 'noise')).toBeUndefined();
    const quiet = approvalAt(state, dorm).causes.find((cause) => cause.id === 'grounds')!.level;
    state.football.stadium.tier = 3;
    expect(NOISE_RADIUS[3]).toBe(4);
    expect(noiseAt(state, 10, 13)).toBeGreaterThan(0);
    expect(noiseAt(state, 10, 13)).toBeLessThan(1);
    expect(noiseAt(state, 30, 30)).toBe(0);
    const loud = approvalAt(state, dorm);
    expect(partLevel(loud.causes, 'noise')).toBeLessThan(1);
    expect(loud.causes.find((cause) => cause.id === 'grounds')!.level).toBeLessThan(quiet);
    // Happiness still has its four causes, and a lecture hall hears nothing.
    expect(loud.causes.length).toBe(4);
    expect(partLevel(approvalAt(state, hall).causes, 'noise')).toBeUndefined();
  });
});

describe('a save from before football', () => {
  it('gets its field and its team, and plays its first season the next fall', () => {
    const made = run(fresh(), 9 * TICKS_PER_DAY).state;
    const old = JSON.parse(serialize(made, 0)) as { v: number; state: Record<string, unknown> & { version: number; rng: Record<string, number>; clock: Record<string, unknown>; timers: Array<{ kind: string }> } };
    old.v = 11;
    old.state.version = 11;
    for (const key of ['field', 'football', 'decisions', 'term']) delete old.state[key];
    delete old.state.rng.football;
    for (const key of ['week', 'anchor', 'anchorMovedTick']) delete old.state.clock[key];
    old.state.timers = old.state.timers.filter((timer) => timer.kind === 'buildDone');
    const loaded = parseSave(JSON.stringify(old));
    if (!loaded.ok) throw new Error(loaded.reason);
    let state = loaded.state;
    expect(state.football.firstYear).toBe(3);
    expect(hasSeason(state)).toBe(false);
    expect(state.football.season).toBeNull();
    expect(state.field.schools.length).toBe(FIELD_SIZE - 1);
    // The streams it had are untouched, and football's begins where a new game's would.
    for (const stream of ['growth', 'intake', 'names', 'events'] as const) expect(state.rng[stream]).toBe(made.rng[stream]);
    expect(footballBooks(state).pay).toBe(0);
    expect(athleticLift(state)).toBe(0);
    // Nothing is played or asked until the next fall, and then a season opens.
    const rest = to(state, state.clock.week.start + TICKS_PER_YEAR - 1);
    expect(rest.log.filter((entry) => entry.kind === 'game' || entry.kind === 'decision').length).toBe(0);
    state = run(rest.state, 2).state;
    expect(state.clock.week.year).toBe(3);
    expect(hasSeason(state)).toBe(true);
    expect(state.football.season!.games.length).toBe(10);
    expect(footballBooks(state).pay).toBeGreaterThan(0);
  });
});
