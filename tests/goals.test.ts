import { newGreek } from '../src/sim/systems/greek';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  advance,
  applyAction,
  budget,
  edition,
  enrollment,
  ENROLLMENT_CAP,
  ERA_AT_RANK,
  eraOf,
  ERAS,
  fallApplicants,
  fallClassDraw,
  GOAL_SCALE,
  goalsReached,
  landRankGoals,
  landSizeGoals,
  marketingCost,
  newGame,
  nextSizeGoal,
  openingStanding,
  OPENING_RANK,
  parseSave,
  RANK_GOALS,
  RANK_LIFT,
  rankLift,
  REACH,
  SAVE_VERSION,
  scaleOf,
  serialize,
  SIZE_GOALS,
  SIZE_GOALS_ONCE,
  sizeGoal,
  tuitionRate,
  validate,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { FOUNDING_CLASS, POOL_CEILING, SPRING_SHARE, WORD_OF_MOUTH, DESIRABILITY_DRAW_FLOOR, DESIRABILITY_DRAW_SPAN } from '../src/sim/config/demand';
import { TUITION_ESTABLISHED_PER_YEAR, TUITION_PER_STUDENT_PER_YEAR } from '../src/sim/config/money';
import { MAIN_STREET } from '../src/sim/config/town';
import { averageDesirability, classSize } from '../src/sim/systems/demand';
import { marketingLift } from '../src/sim/systems/budget';
import { athleticLift } from '../src/sim/systems/football';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { sizeView } from '../src/ui/sizeUi';
import { DAY, freshGame, T0 } from './helpers';

const WEEK = 7 * DAY;
const model = (scale?: number, seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });

/** Let whole game years pass with nobody looking in. Returns the state and everything that was logged. */
function years(start: GameState, count: number): { state: GameState; log: LogEntry[] } {
  let state = start;
  const log: LogEntry[] = [];
  for (let n = 0; n < count; n++) {
    const result = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + WEEK);
    state = result.state;
    log.push(...result.log);
  }
  return { state, log };
}

describe('the goals a game has', () => {
  it('are one size, a full campus of 50,000, and eight ranks from the Top 175 to the Top 10', () => {
    // The owner capped enrollment at 50,000 (DESIGN.md 38.4): the seven size goals above it are gone.
    expect(ENROLLMENT_CAP).toBe(50_000);
    expect(SIZE_GOALS).toEqual([50_000]);
    expect(RANK_GOALS).toEqual([175, 150, 125, 100, 75, 50, 25, 10]);
    expect(ERAS).toEqual(['Arrival', 'Growth', 'Flagship', 'Legacy']);
    // The rank alone opens an era: the Top 125, the Top 75 and the Top 25.
    expect(ERA_AT_RANK.map((count) => RANK_GOALS[count - 1])).toEqual([125, 75, 25]);
    // What the goals above 50,000 were called, for a save that reached one before the cap.
    expect(SIZE_GOALS_ONCE).toEqual([50_000, 55_000, 60_000, 66_000, 73_000, 81_000, 90_000, 100_000]);
    // They are written for the model campus's own scale.
    expect(scaleOf(model())).toBe(GOAL_SCALE);
    expect(sizeGoal(model(), 0)).toBe(50_000);
  });

  it('belong only to a game begun on the model campus', () => {
    expect(model().goals).toEqual({ size: 0, rank: 0, reached: [], rewards: 0 });
    expect(freshGame().goals).toBeNull();
    expect(nextSizeGoal(freshGame())).toBeNull();
    const small = years(freshGame(), 3);
    expect(small.state.goals).toBeNull();
    expect(small.log.some((entry) => entry.kind === 'goal')).toBe(false);
  });

  it('open an era by the rank alone, in order, and never close one a save has already opened', () => {
    const goals = { size: 0, rank: 0, reached: [], rewards: 0 };
    expect(eraOf(goals)).toBe(0);
    // A full campus opens no era. The rank does.
    expect(eraOf({ ...goals, size: 1 })).toBe(0);
    expect(eraOf({ ...goals, rank: 2 })).toBe(0);
    expect(eraOf({ ...goals, rank: 3 })).toBe(1);
    expect(eraOf({ ...goals, size: 1, rank: 5 })).toBe(2);
    expect(eraOf({ ...goals, rank: 7 })).toBe(3);
    expect(eraOf(null)).toBe(0);
    // A save from before the cap that reached 66,000 students opened Flagship by its size. It stays open.
    const before = { size: 4, rank: 1, rewards: 0, reached: [{ ladder: 'size' as const, n: 3, year: 5 }, { ladder: 'era' as const, n: 1, year: 3 }, { ladder: 'era' as const, n: 2, year: 5 }] };
    expect(eraOf(before)).toBe(2);
    expect(eraOf({ ...before, rank: 7 })).toBe(3);
  });
});

describe('size goals', () => {
  it('land at an intake and nowhere else', () => {
    // Enough students for the goal, in the middle of a term: nothing lands while no class moves in.
    const state = structuredClone(model());
    state.cohorts = [14_000, 13_000, 12_000, 11_000];
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + DAY);
    expect(enrollment(later.state)).toBe(50_000);
    expect(later.state.goals!.size).toBe(0);
    expect(later.log.some((entry) => entry.kind === 'goal' && entry.data?.ladder === 'size')).toBe(false);

    // Left to itself the campus fills, and its first goal lands at the very tick a class moves in.
    const run = years(model(), 3);
    const intakes = new Set(run.log.filter((entry) => entry.kind === 'intake').map((entry) => entry.tick));
    const reached = run.log.filter((entry) => entry.kind === 'goal' && entry.data?.ladder === 'size');
    expect(reached.length).toBe(1);
    for (const goal of reached) expect(intakes.has(goal.tick)).toBe(true);
    expect(reached[0]!.text).toBe('Test University has 50,000 students: the campus is full. The goal of 50,000 students is reached. It is kept for good. It brings 5 Gold Seals.');
  });

  it('are kept for good, whatever the campus does afterwards', () => {
    const grown = years(model(), 2).state;
    expect(grown.goals!.size).toBe(1);
    // Half the students leave. The goal stays, through the next intakes and for good.
    const shrunk = structuredClone(grown);
    shrunk.cohorts = shrunk.cohorts.map((count) => Math.floor(count / 2)) as GameState['cohorts'];
    shrunk.offCampus = shrunk.offCampus.map((count) => Math.floor(count / 2)) as GameState['offCampus'];
    const later = years(shrunk, 2).state;
    expect(enrollment(later)).toBeLessThan(50_000);
    expect(later.goals!.size).toBe(1);
    expect(later.goals!.reached.filter((entry) => entry.ladder === 'size').length).toBe(1);
    expect(goalsReached(later).some((line) => line.endsWith('50,000 students'))).toBe(true);
    expect(validate(later)).toBeNull();
  });

  it('are one goal and no more: a campus above the cap from before it reaches nothing new by its size', () => {
    const state = structuredClone(model());
    state.cohorts = [15_000, 14_500, 14_500, 14_000];
    const log: LogEntry[] = [];
    landSizeGoals(state, log);
    expect(state.goals!.size).toBe(1);
    // One goal line. The experience it brings may reach a level, which has a line of its own (tests/daily.test.ts).
    const goals = (): LogEntry[] => log.filter((entry) => entry.kind === 'goal');
    expect(goals().length).toBe(1);
    expect(log[0]!.data).toMatchObject({ ladder: 'size', count: 1, from: 0, era: -1 });
    expect(state.goals!.reached.map((entry) => entry.ladder)).toEqual(['size']);
    // Asked again with nothing new, it says nothing.
    landSizeGoals(state, log);
    expect(goals().length).toBe(1);
    // A save that reached three of the eight before the cap keeps all three, by their own names.
    const kept = structuredClone(model());
    kept.goals = { size: 3, rank: 0, rewards: 0, reached: [0, 1, 2].map((n) => ({ ladder: 'size' as const, n, year: 2 + n })) };
    landSizeGoals(kept, log);
    expect(kept.goals.size).toBe(3);
    expect(nextSizeGoal(kept)).toBeNull();
    expect(goalsReached(kept)).toEqual(['Year 4 · 60,000 students', 'Year 3 · 55,000 students', 'Year 2 · 50,000 students']);
  });
});

describe('the academic rank on a game with goals', () => {
  it('first lands near 150th, whatever the seed, and that is the first rank goal', () => {
    for (const seed of [35, 1, 2, 77]) {
      const first = years(model(undefined, seed), 1);
      const rankings = first.log.find((entry) => entry.kind === 'rankings')!;
      const rank = Number(rankings.data?.rank);
      expect(rank, `seed ${seed}`).toBeGreaterThanOrEqual(OPENING_RANK - 12);
      expect(rank, `seed ${seed}`).toBeLessThanOrEqual(OPENING_RANK + 8);
      expect(first.state.goals!.rank).toBeGreaterThanOrEqual(1);
      // A rank goal lands on rankings day and nowhere else.
      const goal = first.log.find((entry) => entry.kind === 'goal' && entry.data?.ladder === 'rank')!;
      expect(goal.tick).toBe(rankings.tick);
    }
    expect(openingStanding(model().field)).toBe(model().field.academic);
  });

  it('moves a little each year and never a hundred places in a day', () => {
    const run = years(model(), 12);
    const ranks = run.log.filter((entry) => entry.kind === 'rankings').map((entry) => Number(entry.data?.rank));
    expect(ranks.length).toBe(12);
    for (let n = 1; n < ranks.length; n++) expect(Math.abs(ranks[n]! - ranks[n - 1]!), `year ${n + 1}`).toBeLessThanOrEqual(20);
    // It climbs: a campus that is looked after even a little is better than where it was put.
    expect(ranks[11]!).toBeLessThan(ranks[0]!);
  });

  it('has a graduation rate from the first spring, since the classes it opened with count as begun there', () => {
    const graduation = (state: GameState): number | null => academicInputs(state).find((input) => input.id === 'graduation')!.level;
    expect(graduation(model())).toBeNull();
    // Commencement is on day 6 of the first year.
    const after = advance(model(), T0, T0 + 6 * DAY + 3_600_000).state;
    expect(graduation(after)).not.toBeNull();
    // A small campus still waits for a class of its own to have its four years.
    const small = advance(freshGame(), T0, T0 + 6 * DAY + 3_600_000).state;
    expect(graduation(small)).toBeNull();
  });

  it('gives its goals only on rankings day, and keeps them', () => {
    const state = structuredClone(model());
    const log: LogEntry[] = [];
    landRankGoals(state, log);
    expect(log).toEqual([]);
    state.field.rank = 120;
    landRankGoals(state, log);
    expect(state.goals!.rank).toBe(3);
    expect(log[0]!.text).toBe("Test University is No. 120 of 200 for academics. The goals of the Top 175, Top 150 and Top 125 are reached. They are kept for good. Founders' Fountain, the Campus Post Office and the Campus Cinema are yours to place, free, from the Build menu. They bring 25 Gold Seals. The Growth era begins. It opens the Policies page, with six switches: Reading days before finals, Tough grading, Freshmen live on campus, Free student section, Dry campus and Party registration; and Greek Row, with chapter houses in the Build menu.");
    state.field.rank = 190;
    landRankGoals(state, log);
    expect(state.goals!.rank).toBe(3);
  });
});

describe('applicants on a game with goals', () => {
  it("are the school's reach times four named causes, and add up to the student", () => {
    for (const state of [model(), years(model(), 3).state]) {
      const applicants = fallApplicants(state);
      expect(applicants.baseName).toBe('Reach');
      expect(applicants.base).toBe(REACH);
      expect(applicants.causes.map((cause) => cause.name)).toEqual(['How the campus looks', 'Marketing', 'Football', 'Academic rank']);
      expect(applicants.exact).toBe(true);
      // Each cause in turn, rounded to a whole student: the lines add up to the total exactly.
      let running = applicants.base;
      for (const cause of applicants.causes) {
        expect(cause.students).toBe(Math.round(running * cause.factor) - running);
        running += cause.students;
      }
      expect(running).toBe(applicants.total);
      expect(fallClassDraw(state)).toBe(applicants.total);
      expect(classSize(state, 'spring', false)).toBe(Math.round(applicants.total * SPRING_SHARE));
    }
  });

  it('do not follow the head count: a campus twice the size draws the same', () => {
    const state = model();
    const twice = structuredClone(state);
    twice.cohorts = twice.cohorts.map((count) => count * 2) as GameState['cohorts'];
    expect(fallApplicants(twice).total).toBe(fallApplicants(state).total);
  });

  it('rise with each cause: looks, marketing with what the desk sets going, football and the rank', () => {
    const state = model();
    const base = fallApplicants(state);
    const part = (of: GameState, id: string): number => fallApplicants(of).causes.find((cause) => cause.id === id)!.factor;

    const marketed = applyAction(state, { type: 'marketing', step: 4 });
    if (!marketed.ok) throw new Error(marketed.error);
    expect(part(marketed.state, 'marketing')).toBeCloseTo(1 + marketingLift(marketed.state), 9);
    expect(fallApplicants(marketed.state).total).toBeGreaterThan(base.total);

    // A profile in a college guide is counted inside marketing, so the causes stay four.
    const desk = structuredClone(state);
    desk.inbox.boosts.push({ kind: 'applicants', amount: 0.04, until: desk.clock.tick + 5000, label: 'College guide' });
    expect(part(desk, 'marketing')).toBeCloseTo(1.04, 9);
    expect(fallApplicants(desk).causes.length).toBe(4);

    const fans = structuredClone(state);
    fans.football.standing = 100;
    expect(part(fans, 'football')).toBeCloseTo(1 + athleticLift(fans), 9);
    expect(part(fans, 'football')).toBeGreaterThan(part(state, 'football'));

    // Rank: nothing before the first rankings day or at 200th, the most at 1st.
    expect(rankLift(state)).toBe(0);
    const ranked = structuredClone(state);
    ranked.field.rank = 200;
    expect(rankLift(ranked)).toBe(0);
    ranked.field.rank = 1;
    expect(rankLift(ranked)).toBeCloseTo(RANK_LIFT, 9);
    // A quarter more at 1st, the figure the owner approved (37.9), and half of that at the middle of the field.
    expect(RANK_LIFT).toBe(0.25);
    ranked.field.rank = 100;
    expect(rankLift(ranked)).toBeGreaterThan(0.12);
    expect(rankLift(ranked)).toBeLessThan(0.13);
    expect(part(ranked, 'rank')).toBeCloseTo(1 + rankLift(ranked), 9);
  });

  it('stay in proportion at any campus scale', () => {
    const big = fallApplicants(model()).total;
    const one = fallApplicants(model(1)).total;
    expect(Math.abs(big / (one * GOAL_SCALE) - 1)).toBeLessThan(0.01);
    expect(sizeGoal(model(1), 0)).toBe(Math.round(50_000 / GOAL_SCALE));
    // The same campus reaches its first goal in the same year at either scale.
    const reached = (start: GameState): number => years(start, 3).state.goals!.reached.find((entry) => entry.ladder === 'size')?.year ?? 0;
    expect(reached(model())).toBe(reached(model(1)));
    expect(reached(model())).toBeGreaterThan(0);
  });
});

describe('a game begun on the small campus', () => {
  it('keeps its old rule exactly: as many would enrol as are there, lifted by looks, marketing and football', () => {
    const state = years(freshGame(), 3).state;
    const students = enrollment(state);
    const draw = DESIRABILITY_DRAW_FLOOR + DESIRABILITY_DRAW_SPAN * (averageDesirability(state) / 100);
    const pool = Math.max(FOUNDING_CLASS, students * WORD_OF_MOUTH) * draw * (1 + marketingLift(state)) * (1 + athleticLift(state)) * (1 + 0);
    expect(fallClassDraw(state)).toBe(Math.min(POOL_CEILING, Math.round(pool)));
    const applicants = fallApplicants(state);
    expect(applicants.baseName).toBe('Word of mouth');
    expect(applicants.causes.map((cause) => cause.id)).toEqual(['looks', 'marketing', 'football']);
    // Its tuition and its marketing are what they were.
    expect(tuitionRate(state)).toBe(TUITION_PER_STUDENT_PER_YEAR);
    expect(marketingCost(state, 2)).toBe(students * 120);
  });

  it('shows what is true there on the Goals page, with no cap and no goals', () => {
    const view = sizeView(years(freshGame(), 2).state);
    expect(view.cap).toBeNull();
    expect(view.places).toBeNull();
    expect(view.era).toBe('');
    expect(view.rankNext).toBe('');
    expect(view.reached).toEqual([]);
    expect(view.applicants.rows[0]!.name).toBe('Word of mouth');
    expect(view.applicants.rows.length).toBe(4);
  });
});

describe('the Goals page on a game with goals', () => {
  const number = (text: string): number => Number(text.replace(/[^\d−+-]/g, '').replace('−', '-'));

  it('shows the students against the cap, applicants that add up to the student, and who gets a place', () => {
    const view = sizeView(model());
    expect(view.title).toBe('46,000 students');
    expect(view.cap).toEqual({ line: '4,000 places open of 50,000', note: 'A full campus is the first goal. It is counted when a class moves in.', percent: 92 });
    // Next fall the seniors have gone, so there is room for every applicant.
    expect(view.places).toEqual({ admitted: view.applicants.total, turnedAway: '0' });
    expect(view.applicants.head).toBe("This fall's applicants");
    expect(view.applicants.rows.map((row) => row.name)).toEqual(['Reach', 'How the campus looks', 'Marketing', 'Football', 'Academic rank']);
    expect(view.applicants.rows[0]!.value).toBe('11,000');
    expect(view.applicants.rows.reduce((sum, row) => sum + number(row.value), 0)).toBe(number(view.applicants.total));
    expect(view.rank).toBe('Not yet ranked. The first rankings come out in the spring.');
    expect(view.rankNext).toBe('Next goal: Top 175');
    expect(view.era).toBe('Era: Arrival');
    expect(view.reached).toEqual([]);
  });

  it('lists what is reached, newest first, and the era', () => {
    const state = years(model(), 2).state;
    const view = sizeView(state);
    expect(view.cap!.line).toMatch(/^(Full at 50,000|[\d,]+ places open of 50,000)$/);
    expect(view.cap!.note).toBe('A full campus turns the rest of its applicants away, and is ranked the higher for it.');
    expect(number(view.places!.admitted) + number(view.places!.turnedAway)).toBe(number(view.applicants.total));
    expect(view.reached.length).toBeGreaterThanOrEqual(2);
    expect(view.reached.every((line) => /^Year \d+ · /.test(line))).toBe(true);
    expect(view.rank).toMatch(/^No\. \d+ of 200 for academics$/);
    expect(view.applicants.rows.reduce((sum, row) => sum + number(row.value), 0)).toBe(number(view.applicants.total));
  });
});

describe('a goal in the paper', () => {
  it('is the headline of its day, said once, when it was reached while away', () => {
    // The campus fills with the spring class of its second year.
    const before = advance(model(), T0, T0 + 9 * DAY).state;
    const away = advance(before, before.clock.lastSimulatedAt, T0 + 11 * DAY);
    const goal = away.log.find((entry) => entry.kind === 'goal' && entry.data?.ladder === 'size')!;
    expect(goal).toBeDefined();
    const paper = edition(away.state, away.log, { minutes: 2 * 1440, cashBefore: before.money.cash, cashAfter: away.state.money.cash, studentsBefore: enrollment(before), studentsAfter: enrollment(away.state) });
    expect(paper.headline).toMatch(/^Test Is Full at 50,000 Students; /);
    // Said once on the front: in the line under the headline, and not again among the lines beneath.
    expect(paper.deck).toBe(goal.text);
    expect(paper.top.some((item) => item.text === goal.text)).toBe(false);
    expect(paper.more).not.toContain(goal.text);
    // A second goal on the same day, which is not the headline, is one of the lines at the top.
    const second = away.log.find((entry) => entry.kind === 'goal' && entry.text !== paper.deck);
    if (second) expect(paper.top.some((item) => item.text === second.text)).toBe(true);
    // It is in the dated list as well, on the day the class moved in.
    expect(paper.days.some((day) => day.lines.includes(goal.text))).toBe(true);
  });

  it('gives an era its own headline', () => {
    const state = structuredClone(model());
    state.field.rank = 120;
    const log: LogEntry[] = [];
    landRankGoals(state, log);
    const paper = edition(state, log, { minutes: 1440, cashBefore: 1, cashAfter: 1, studentsBefore: 46_000, studentsAfter: 46_000 });
    expect(paper.headline).toMatch(/^The Growth Era Begins at Test; /);
  });
});

describe('money on a game with goals', () => {
  it('opens inside $12 to $17 kept of every $100, with tuition for a school already standing', () => {
    const books = budget(model());
    expect(tuitionRate(model())).toBe(TUITION_ESTABLISHED_PER_YEAR);
    expect(books.kept).toBeGreaterThanOrEqual(12);
    expect(books.kept).toBeLessThanOrEqual(17);
    // The same campus at scale 1 keeps the same share, apart from its real-size football.
    expect(Math.abs(budget(model(1)).kept - books.kept)).toBeLessThan(2);
  });

  it("prices marketing by the school's reach, whatever the head count", () => {
    const state = model();
    const twice = structuredClone(state);
    twice.cohorts = twice.cohorts.map((count) => count * 2) as GameState['cohorts'];
    expect(marketingCost(state, 2)).toBe(46_000 * 120);
    expect(marketingCost(twice, 2)).toBe(marketingCost(state, 2));
    expect(marketingCost(model(1), 2)).toBe(Math.round(46_000 / GOAL_SCALE) * 120);
  });
});

describe('the main street', () => {
  const OLD = ['College', 'Avenue'].join(' ');

  it('is Lantern Avenue on every new campus', () => {
    expect(MAIN_STREET).toBe('Lantern Avenue');
    expect(freshGame().map.town.street).toBe('Lantern Avenue');
    expect(model().map.town.street).toBe('Lantern Avenue');
  });

  it('is renamed in a save from before, with everything else as it was and no goals on a small campus', () => {
    const text = readFileSync(new URL('./fixtures/save-v14.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { v: number; state: GameState };
    expect(file.v).toBe(14);
    expect(file.state.map.town.street).toBe(OLD);
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(14);
    expect(loaded.state.map.town.street).toBe('Lantern Avenue');
    expect(loaded.state.goals).toBeNull();
    // Nothing else moved: the save as it was, with those two things and its version changed, and what
    // version 16 keeps beside them (tests/capacity.test.ts has those).
    const expected = structuredClone(file.state) as GameState;
    expected.version = SAVE_VERSION;
    expected.map.town.street = 'Lantern Avenue';
    expected.goals = null;
    expected.staffing = loaded.state.staffing;
    expected.admissions.year = loaded.state.admissions.year;
    expected.map.care.meals = loaded.state.map.care.meals!;
    // Version 17 adds the policies, every one off (tests/policies.test.ts has those).
    expected.policies = { on: [], locked: [], news: [] };
    // Version 18 adds the daily layer, which a game with no goals never uses (tests/daily.test.ts).
    expected.daily = loaded.state.daily;
    // Version 19 adds the orders board, which a game with no goals never uses either (tests/orders.test.ts).
    expected.orders = loaded.state.orders;
    // Version 20 adds the decorations in storage and the Workshop (tests/decor.test.ts has those).
    expected.decor = loaded.state.decor;
    expected.rhythm = loaded.state.rhythm;
    expected.bigBuilds = loaded.state.bigBuilds;
    expected.labs = loaded.state.labs;
    expected.traditions = loaded.state.traditions;
    expected.greek = newGreek();
    expected.rng.orders = loaded.state.rng.orders;
    expect(loaded.state).toEqual(expected);
    expect(validate(advance(loaded.state, loaded.state.clock.lastSimulatedAt, loaded.state.clock.lastSimulatedAt + WEEK).state)).toBeNull();
  });

  it('gives a model-campus save from before its goals, none reached, and the standing a model campus opens with', () => {
    const state = model();
    const file = JSON.parse(serialize(state, T0)) as { v: number; state: Record<string, unknown> };
    file.v = 14;
    file.state.version = 14;
    delete file.state.goals;
    (file.state.field as { academic: number }).academic = 0;
    const loaded = parseSave(JSON.stringify(file));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.goals).toEqual({ size: 0, rank: 0, reached: [], rewards: 0 });
    expect(loaded.state.field.academic).toBe(state.field.academic);
    expect(loaded.state).toEqual(state);
  });

  it('tells an upgraded save once what is new, and says nothing to a save that is up to date', () => {
    expect(upgradeNotes(14).some((note) => /tap the student count/.test(note) && /Lantern Avenue/.test(note))).toBe(true);
    expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
  });

  it('is the only name any current file uses', () => {
    const root = join(__dirname, '..');
    const under = (path: string): string[] => (statSync(path).isFile() ? [path] : readdirSync(path).flatMap((name) => under(join(path, name))));
    const files = [join(root, 'src'), join(root, 'scripts'), join(root, 'tests'), join(root, 'DESIGN.md')].flatMap(under).filter((file) => /\.(ts|md|css|html|json)$/.test(file) && !file.includes('fixtures'));
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((file) => readFileSync(file, 'utf8').includes(OLD))).toEqual([]);
  });
});
