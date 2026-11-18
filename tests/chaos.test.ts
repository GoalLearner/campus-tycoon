import { describe, expect, it } from 'vitest';
import { advance, newGame, parseSave, serialize, toneProblem, type GameState, type LogEntry } from '../src/sim';
import { CHAOS_FROM, CHAOS_REACH_MOST, CHAOS_STEPS, LETTER, MAX_ACTIVE_CHAOS, ROWDY, SPIRIT } from '../src/sim/config/chaos';
import { happyParts } from '../src/sim/systems/boosts';
import { CHAOS_LINES, PROTEST_LINES } from '../src/sim/config/chaosLines';
import { MAX_ACTIVE_INCIDENTS } from '../src/sim/config/incidents';
import { WEB_WEEK_TICKS } from '../src/sim/config/web';
import { HARD_LINES } from '../src/sim/config/hardLines';
import { chaosOn, chaosReach, chaosStepName, chaosStepOf, chaosView, causes, newChaos, spawnChaos, spiritPoints, stepChaos, trusteesDip, trusteesOrder } from '../src/sim/systems/chaos';
import { academicInputs } from '../src/sim/systems/field';
import { safetyAt } from '../src/sim/systems/incidents';
import { scorecard } from '../src/sim/systems/scorecard';
import { edition } from '../src/sim/newspaper';
import { seedStreams } from '../src/sim/rng';
import { DAY, T0, switchedOn } from './helpers';

/** The chaos sandbox, stop C1 (DESIGN.md 68). */

const model = (days = 1): GameState => advance(newGame({ seed: 5, name: 'Chaos', now: T0, campus: 'model' }), T0, T0 + days * DAY).state;
/** The meter read at the start of the next game week, from what was set, with nothing else happening in between. */
const nextWeek = (from: GameState): { state: GameState; log: LogEntry[] } => {
  const state = structuredClone(from);
  state.clock.tick += WEB_WEEK_TICKS - (state.clock.tick % WEB_WEEK_TICKS);
  const log: LogEntry[] = [];
  stepChaos(state, log);
  return { state, log };
};

describe('the Chaos meter, C1', () => {
  it('runs on a game with goals only, so the small campus of before is untouched', () => {
    const small = advance(newGame({ seed: 5, name: 'Small', now: T0 }), T0, T0 + 2 * DAY);
    expect(chaosOn(small.state)).toBe(false);
    expect(small.state.incidents.active.some((one) => one.chaos)).toBe(false);
    expect(small.log.some((entry) => entry.kind === 'chaos' || entry.data?.chaos !== undefined)).toBe(false);
    expect(chaosOn(model())).toBe(true);
  });

  it('has six steps from Serene to Pandemonium, read once a game week and smoothed', () => {
    expect(CHAOS_STEPS).toEqual(['Serene', 'Calm', 'Lively', 'Rowdy', 'Chaotic', 'Pandemonium']);
    for (let i = 0; i < CHAOS_FROM.length; i++) {
      expect(chaosStepName(CHAOS_FROM[i]!)).toBe(CHAOS_STEPS[i]);
      if (i > 0) expect(chaosStepOf(CHAOS_FROM[i]! - 0.01)).toBe(i - 1);
    }
    // One wild week moves it part of the way, not all of it.
    const state = model();
    state.chaos.level = 15;
    state.chaos.tally = { dustUp: 40, shouting: 0, prank: 0, graffiti: 0, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
    const after = nextWeek(state).state;
    expect(after.chaos.last!.raw).toBe(100);
    expect(after.chaos.level).toBeGreaterThan(15);
    expect(after.chaos.level).toBeLessThan(100);
  });

  it('reads chaos for every thousand students, so a big campus is not punished for being big', () => {
    const a = model();
    a.chaos.tally = { dustUp: 3, shouting: 2, prank: 1, graffiti: 0, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
    a.chaos.level = 0;
    const b = structuredClone(a);
    b.chaos.tally = { dustUp: 6, shouting: 4, prank: 2, graffiti: 0, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
    b.cohorts = b.cohorts.map((n) => n * 2) as GameState['cohorts'];
    expect(nextWeek(b).state.chaos.last!.raw).toBeCloseTo(nextWeek(a).state.chaos.last!.raw, 0);
  });

  it('sets more going where Campus Safety does not reach the dorms, and keeps to a cap of its own', () => {
    const count = (covered: number): number => {
      let state = model();
      state.chaos.covered = covered;
      state.chaos.tension = 1;
      let n = 0;
      for (let k = 0; k < 400; k++) {
        state.incidents.active = [];
        state.clock.tick = Math.ceil(state.clock.tick / 20) * 20 + 20;
        spawnChaos(state);
        n += state.incidents.active.length;
      }
      return n;
    };
    expect(count(0)).toBeGreaterThan(count(1) * 2);
    // Never more than its own cap at once, and the incidents of before still have all of theirs.
    let state = model(2);
    for (let k = 0; k < 2_000; k++) {
      state.clock.tick = Math.ceil(state.clock.tick / 20) * 20 + 20;
      state.chaos.covered = 0;
      state.chaos.tension = 3;
      spawnChaos(state);
      expect(state.incidents.active.filter((one) => one.chaos).length).toBeLessThanOrEqual(MAX_ACTIVE_CHAOS);
    }
    expect(MAX_ACTIVE_INCIDENTS).toBe(6);
  });

  it('has protests about campus things, with no responder, that never make a place feel unsafe', () => {
    const state = model();
    state.chaos.grievance = { topic: 'beds', strength: 1, words: 'more beds' };
    const hall = state.map.buildings.find((b) => b && b.zone === 'academic' && b.stage > 0)!;
    const before = safetyAt(state, hall.x, hall.y);
    state.incidents.active.push({ id: 9999, kind: 'mischief', x: hall.x, y: hall.y, place: 'the quad', line: 0, startTick: state.clock.tick, responder: null, endTick: state.clock.tick + 90, chaos: 'protest', topic: 'beds' });
    expect(safetyAt(state, hall.x, hall.y)).toBe(before);
    const ended = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 91 * 60_000);
    expect(ended.log.some((entry) => entry.kind === 'chaos' && entry.data?.protest === 1)).toBe(true);
    // Nobody is said to have missed it: a protest is not an incident anyone answers.
    expect(ended.log.some((entry) => entry.kind === 'incident' && /rally|sit-in/i.test(entry.text))).toBe(false);
  });

  it('costs a little when it runs high: headlines off applicants, capped; and a letter from the trustees', () => {
    let state = model();
    state.chaos.level = 90;
    state.chaos.letter = null;
    state.chaos.letters.lastClosed = -1_000_000;
    state.chaos.reach = [];
    state.chaos.tally = { dustUp: 40, shouting: 10, prank: 10, graffiti: 10, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
    const read = nextWeek(state);
    state = read.state;
    expect(chaosStepOf(state.chaos.level)).toBeGreaterThanOrEqual(ROWDY);
    expect(chaosReach(state)).toBeLessThan(0);
    expect(read.log.some((entry) => entry.kind === 'chaos' && entry.data?.letter === 1)).toBe(true);
    expect(state.chaos.letter).not.toBeNull();
    // However long it lasts, the headlines never take more than the cap.
    for (let k = 0; k < 20; k++) state.chaos.reach.push({ at: state.clock.tick, size: -0.01 });
    expect(chaosReach(state)).toBeCloseTo(-CHAOS_REACH_MOST, 9);
  });

  it('pays a small reward when the trustees are answered, and takes a little off Reputation when they are not (switched off: trusteesDip)', () => {
    switchedOn(['trusteesDip'], () => {
      const asked = model(3);
      asked.chaos.level = 80;
      asked.chaos.letter = { from: asked.clock.tick, until: asked.clock.tick + LETTER.days * 1440 };
      // Answered: the meter is below Rowdy at the next reading.
      const met = structuredClone(asked);
      met.chaos.level = 10;
      const cash = met.money.cash;
      const answered = nextWeek(met);
      expect(answered.state.chaos.letter).toBeNull();
      expect(answered.state.chaos.letters.met).toBe(asked.chaos.letters.met + 1);
      expect(answered.state.money.cash).toBeGreaterThan(cash);
      // Ignored: past its day and still Rowdy.
      const missed = structuredClone(asked);
      missed.chaos.letter = { from: missed.clock.tick - 3000, until: missed.clock.tick };
      missed.chaos.tally = { dustUp: 60, shouting: 20, prank: 20, graffiti: 20, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
      const ignored = nextWeek(missed).state;
      expect(ignored.chaos.letters.missed).toBe(asked.chaos.letters.missed + 1);
      expect(trusteesDip(ignored)).toBe(LETTER.dip);
      const reputation = academicInputs(ignored).find((input) => input.id === 'reputation')!;
      if (reputation.level !== null) expect(reputation.detail).toMatch(/trustees/);
    });
  });

  it('asks by a letter with no clock: Rowdy for weeks past its old day costs no Reputation, and calmer it pays (DESIGN.md 85.6)', () => {
    const rowdy = { dustUp: 60, shouting: 20, prank: 20, graffiti: 20, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
    let state = model(3);
    const letters = { ...state.chaos.letters };
    state.chaos.level = 80;
    state.chaos.letter = { from: state.clock.tick - 3000, until: state.clock.tick };
    expect(trusteesOrder(state)).toEqual({ ask: 'Bring the Chaos meter below Rowdy', pays: expect.stringMatching(/^a gift of \$[\d.,]+[KM]? from the trustees$/) });
    for (let week = 0; week < 4; week++) {
      state.chaos.tally = { ...rowdy };
      state = nextWeek(state).state;
      expect(chaosStepOf(state.chaos.level)).toBeGreaterThanOrEqual(ROWDY);
      expect(state.chaos.letter).not.toBeNull();
      expect(trusteesDip(state)).toBe(0);
    }
    expect(state.chaos.letters.missed).toBe(letters.missed);
    const reputation = academicInputs(state).find((input) => input.id === 'reputation')!;
    if (reputation.level !== null) expect(reputation.detail).not.toMatch(/trustees/);
    expect(chaosView(state)!.letter).toMatch(/^The trustees would like it below Rowdy, and send \$/);
    // Calmer at last: the trustees' gift, as before.
    const calm = structuredClone(state);
    calm.chaos.level = 10;
    calm.chaos.tally = { ...rowdy, dustUp: 0, shouting: 0, prank: 0, graffiti: 0 };
    const answered = nextWeek(calm);
    expect(answered.state.chaos.letter).toBeNull();
    expect(trusteesOrder(answered.state)).toBeNull();
    expect(answered.state.chaos.letters.met).toBe(letters.met + 1);
    expect(answered.state.money.cash).toBeGreaterThan(calm.money.cash);
    expect(answered.log.find((entry) => entry.data?.letter === 2)!.text).toMatch(/^The trustees write again: the campus has calmed down, below Rowdy\. A gift of thanks/);
  });

  it('gives a legendary night now and then to a Lively campus that is happy and looked after: spirit, then it fades', () => {
    let spirited = 0;
    for (let seed = 0; seed < 60 && spirited === 0; seed++) {
      const state = model();
      state.seed = seed;
      state.rng.chaos = seedStreams(seed).chaos;
      state.chaos.level = (CHAOS_FROM[2]! + CHAOS_FROM[3]!) / 2;
      state.chaos.covered = 1;
      state.admissions.lastSemester = { ...(state.admissions.lastSemester ?? { tick: 0, stayed: 0, left: 0 }), happiness: 80 } as never;
      state.chaos.tally = { dustUp: 0, shouting: 3, prank: 1, graffiti: 0, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 };
      state.chaos.level = 28;
      const read = nextWeek(state);
      if (read.log.some((entry) => entry.data?.spirit === 1)) {
        spirited += 1;
        expect(happyParts(read.state)).toContainEqual({ label: 'Campus spirit', points: SPIRIT.happiness });
        expect(spiritPoints(read.state)).toBe(SPIRIT.happiness);
        expect(read.state.inbox.boosts.some((boost) => boost.label === 'Campus spirit')).toBe(false);
        expect(chaosReach(read.state)).toBeGreaterThan(0);
      }
    }
    expect(spirited).toBe(1);
  });

  it('is on the Scorecard with its step and its three biggest causes, each saying what would ease it', () => {
    const state = model();
    state.chaos.last = { tally: { dustUp: 4, shouting: 2, prank: 3, graffiti: 1, protest: 0, party: 1, goalposts: 0, street: 0, mascot: 0 }, missed: { dustUp: 3, shouting: 0, prank: 2, graffiti: 1, protest: 0, party: 0, goalposts: 0, street: 0, mascot: 0 }, drama: 0.05, thousands: 1.5, raw: 50, topic: null };
    state.chaos.level = 50;
    const view = chaosView(state)!;
    expect(view.step).toBe('Rowdy');
    expect(view.causes).toHaveLength(3);
    expect(view.causes[0]).toMatch(/Campus Safety/);
    expect(causes(state)[0]!.points).toBeGreaterThanOrEqual(causes(state)[1]!.points);
    const row = scorecard(state)!.find((one) => one.id === 'chaos')!;
    expect(row.value).toBe('Rowdy, 50 of 100');
    expect(row.more).toHaveLength(2);
  });

  it('says it all in comic words: no riot, brawl, crime or vandalism, nothing past the tone guide or a hard line', () => {
    const lines = [...Object.values(CHAOS_LINES).flat(), ...Object.values(PROTEST_LINES).flat()];
    for (const line of lines) {
      expect(toneProblem(line), line).toBeNull();
      expect(line, line).not.toMatch(/\b(riot\w*|brawl\w*|crime\w*|vandal\w*|punch\w*|blood\w*|fire|burn\w*|weapon\w*)\b/i);
      for (const hard of HARD_LINES.filter((one) => one.id !== 'body' && one.id !== 'threat')) expect(hard.pattern.test(line), `${hard.id}: ${line}`).toBe(false);
    }
    // The paper's lines for each kind of chaos news.
    const state = model();
    const tick = state.clock.tick;
    const log: LogEntry[] = [
      { tick, kind: 'chaos', text: 'The Chaos meter reads Rowdy.', data: { step: 3, was: 2 } },
      { tick, kind: 'chaos', text: 'A letter from the trustees.', data: { letter: 1 } },
      { tick, kind: 'chaos', text: 'A legendary night.', data: { spirit: 1 } },
      { tick, kind: 'chaos', text: 'The rally on the quad broke up.', data: { protest: 1, topic: 'beds' } },
    ];
    for (const entry of log) {
      const paper = edition(state, [entry], { minutes: 600, cashBefore: state.money.cash, cashAfter: state.money.cash, studentsBefore: 1, studentsAfter: 1 });
      expect(paper.headline.length).toBeGreaterThan(10);
      expect(toneProblem(paper.headline), paper.headline).toBeNull();
      expect(paper.headline).not.toMatch(/\b(riot|brawl|crime|vandal\w*)\b/i);
    }
  });

  it('comes to a version 32 save at its next game week, with a random stream of its own, and leaves the others alone', () => {
    const state = model();
    const old = JSON.parse(serialize(state, T0 + DAY));
    old.v = 32;
    old.state.version = 32;
    delete old.state.chaos;
    delete old.state.rng.chaos;
    const loaded = parseSave(JSON.stringify(old));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.chaos).toEqual(newChaos());
    expect(loaded.state.rng.chaos).toBe(seedStreams(state.seed).chaos);
    for (const stream of ['growth', 'intake', 'names', 'events', 'football', 'orders'] as const) expect(loaded.state.rng[stream]).toBe(state.rng[stream]);
    const later = nextWeek(nextWeek(loaded.state).state).state;
    expect(later.chaos.week).toBeGreaterThanOrEqual(0);
    expect(later.chaos.last).not.toBeNull();
  });

  it('turns out the same whether caught up in one step or many', () => {
    const start = model();
    const at = start.clock.lastSimulatedAt;
    const once = advance(start, at, at + 0.5 * DAY).state;
    let many = start;
    for (let k = 0; k < 24; k++) many = advance(many, many.clock.lastSimulatedAt, at + ((k + 1) * 0.5 * DAY) / 24).state;
    expect(many.chaos).toEqual(once.chaos);
    expect(many.incidents).toEqual(once.incidents);
  });

  it('keeps its rates at the weekly reading: stepChaos twice in one week reads once', () => {
    const state = model();
    const log: LogEntry[] = [];
    const week = state.chaos.week;
    stepChaos(state, log);
    stepChaos(state, log);
    expect(state.chaos.week).toBe(week);
  });
});
