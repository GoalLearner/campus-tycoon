import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  BIG_PER_DAY,
  budget,
  campusHappiness,
  classYearOf,
  enrollment,
  mcDay,
  newGame,
  newStory,
  parseSave,
  planNotices,
  sampleStudents,
  SAVE_VERSION,
  serialize,
  studentCard,
  toneProblem,
  validate,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { edition } from '../src/sim/newspaper';
import { mcView } from '../src/ui/mcUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, HOUR, T0, webMetaFor } from './helpers';

/**
 * The Main Character (DESIGN.md 53.2, as built in section 57): chosen from a
 * card, stored with needs, goals, money and the people around them, living
 * the player's real days by the phone's own rules, and changing nothing on
 * the campus but the story told about it.
 */

const START = (() => {
  const state = newGame({ seed: 7, name: 'Larp University', now: T0, campus: 'model' });
  // The player's day starts at 7 in the morning, eight hours behind UTC: the anchor is two hours after.
  state.clock.anchor = 17 * 60;
  return advance(state, T0, T0 + 6 * HOUR).state;
})();

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

function chosen(state = START, where: 'dorm' | 'offCampus' = 'dorm', year?: number): GameState {
  const ref = sampleStudents(state, 60).find((one) => {
    const card = studentCard(state, one);
    return card !== null && card.residence === where && (year === undefined || card.classYear === year);
  })!;
  const result = applyAction(state, { type: 'makeMain', ref });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function days(state: GameState, n: number): { state: GameState; log: LogEntry[] } {
  let now = state;
  const log: LogEntry[] = [];
  for (let h = 0; h < n * 24; h++) {
    const run = later(now, HOUR);
    now = run.state;
    log.push(...run.log);
  }
  return { state: now, log };
}

const THREE = days(chosen(), 3);

describe('choosing a main character', () => {
  it('stores them from their card, with goals, money and the people around them, each with traits', () => {
    const state = chosen();
    const mc = state.story.mc!;
    const card = studentCard(state, mc.ref)!;
    expect(mc.name).toBe(card.name);
    expect(mc.major).toBe(card.major);
    expect(mc.goals).toHaveLength(2);
    expect(mc.money).toBeGreaterThan(0);
    const roles = mc.cast.map((one) => one.role);
    expect(roles).toContain('roommate');
    expect(roles.filter((role) => role === 'friend')).toHaveLength(2);
    for (const one of mc.cast) {
      expect(one.traits).toHaveLength(2);
      expect(one.traits[0]).not.toBe(one.traits[1]);
      expect(one.name).not.toBe(mc.name);
    }
    expect(new Set(mc.cast.map((one) => one.name)).size).toBe(mc.cast.length);
    expect(mc.memory[0]!.text).toMatch(/is your main character: a (freshman|sophomore|junior|senior) in /);
    // A student who lives in town has no roommate.
    expect(chosen(START, 'offCampus').story.mc!.cast.some((one) => one.role === 'roommate')).toBe(false);
  });

  it('is one at a time: choosing another sets the first aside, into the hall of fame', () => {
    const first = chosen();
    const other = sampleStudents(first, 60).find((ref) => ref.index !== first.story.mc!.ref.index || ref.entryYear !== first.story.mc!.ref.entryYear)!;
    const result = applyAction(first, { type: 'makeMain', ref: other });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.story.fame).toHaveLength(1);
    expect(result.state.story.fame[0]!.status).toBe('setAside');
    expect(result.state.story.mc!.ref).toEqual({ entryYear: other.entryYear, index: other.index });
    // The same one again is refused.
    expect(applyAction(result.state, { type: 'makeMain', ref: other }).ok).toBe(false);
    const aside = applyAction(result.state, { type: 'setAsideMain' });
    expect(aside.ok && aside.state.story.mc).toBeNull();
  });
});

describe('the life system', () => {
  it('plans each real day when the player’s day starts, with reasons, and keeps to it', () => {
    const plans = THREE.log.filter((entry) => entry.kind === 'mc' && /^Today's plan for /.test(entry.text));
    expect(plans.length).toBeGreaterThanOrEqual(3);
    for (const plan of plans) expect(plan.text).toMatch(/\(.+\)/);
    // A plan is made at the start of the player's day, about 7 in the morning in this test.
    const made = plans.slice(1).map((entry) => {
      const minute = Math.floor((T0 + (entry.tick - 1) * 60_000) / 60_000) % 1440;
      return (minute - 15 * 60 + 1440) % 1440;
    });
    for (const minute of made) expect(minute).toBeLessThan(15);
    const summaries = THREE.log.filter((entry) => entry.kind === 'mc' && /^Yesterday /.test(entry.text));
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    expect(summaries[0]!.text).toMatch(/asleep for \d+ hours/);
  });

  it('sleeps at night, goes to class on a weekday in term, eats, and keeps every need between 0 and 100', () => {
    const mc = THREE.state.story.mc!;
    for (const need of Object.values(mc.needs)) {
      expect(need).toBeGreaterThanOrEqual(0);
      expect(need).toBeLessThanOrEqual(100);
    }
    const said = THREE.log.filter((entry) => /^Yesterday /.test(entry.text)).map((entry) => entry.text).join(' ');
    expect(said).toMatch(/asleep/);
    expect(THREE.state.story.mc!.term.attended + THREE.state.story.mc!.semesters).toBeGreaterThan(0);
  });

  it('plans for a need that is low, and says why', () => {
    const state = chosen();
    state.story.mc!.needs.fitness = 5;
    state.story.mc!.plan = null;
    const run = later(state, 20 * 60_000);
    const plan = run.state.story.mc!.plan!;
    expect(plan.items.some((item) => item.activity === 'workout' && /fitness is low/.test(item.why))).toBe(true);
  });

  it('keeps its key moments to two a real day, and every line to the tone guide', () => {
    const big = THREE.log.filter((entry) => entry.kind === 'mc' && entry.data?.big === 1);
    const byDay = new Map<number, number>();
    for (const entry of big) {
      const day = Math.floor((T0 + (entry.tick - 1) * 60_000 - 15 * 3_600_000) / 86_400_000);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    for (const count of byDay.values()) expect(count).toBeLessThanOrEqual(BIG_PER_DAY);
    for (const entry of THREE.log.filter((one) => one.kind === 'mc')) expect(toneProblem(entry.text), entry.text).toBeNull();
    for (const entry of THREE.state.story.mc!.memory) expect(toneProblem(entry.text), entry.text).toBeNull();
  });

  it('lets a junior or senior drink at a party, which costs the morning; a younger one never drinks', () => {
    // A junior, who is 21: a senior would graduate inside the week.
    for (const [year, may] of [[0, false], [2, true]] as const) {
      let found = false;
      let drank = false;
      for (let seed = 0; seed < 6 && !(may ? drank : found); seed++) {
        const start = newGame({ seed: 100 + seed, name: 'Larp University', now: T0, campus: 'model' });
        start.clock.anchor = 17 * 60;
        const opened = advance(start, T0, T0 + 6 * HOUR).state;
        const state = chosen(opened, 'dorm', year);
        state.story.mc!.goals = ['fun', 'friends'];
        state.story.mc!.nature = 'party';
        const run = days(state, 7);
        const parties = run.log.filter((entry) => entry.kind === 'mc' && /went to a party/.test(entry.text));
        if (parties.length > 0) found = true;
        if (parties.some((entry) => /had a few drinks/.test(entry.text))) {
          drank = true;
          expect(run.log.some((entry) => /hangover/.test(entry.text))).toBe(true);
        }
        if (!may) for (const entry of parties) expect(entry.text).toMatch(/Under 21, so no drinks/);
      }
      if (may) expect(drank).toBe(true);
      else expect(found).toBe(true);
    }
  });

  it('gets grades when a semester closes, from their card, their studying and their classes', () => {
    let state = chosen();
    let graded = false;
    for (let day = 0; day < 6 && !graded; day++) {
      state = later(state, DAY).state;
      graded = state.story.mc !== null && state.story.mc.gpa !== null;
    }
    expect(graded).toBe(true);
    const mc = state.story.mc!;
    expect(mc.gpa).toBeGreaterThanOrEqual(1.5);
    expect(mc.gpa).toBeLessThanOrEqual(4);
    expect(mc.semesters).toBeGreaterThan(0);
  });

  it('changes nothing on the campus: the same game with and without one is the same game', () => {
    const without = later(START, 2 * DAY).state;
    const withOne = later(chosen(), 2 * DAY).state;
    expect(budget(withOne).kept).toBe(budget(without).kept);
    expect(enrollment(withOne)).toBe(enrollment(without));
    expect(campusHappiness(withOne).base).toBe(campusHappiness(without).base);
    expect(withOne.rng).toEqual(without.rng);
    expect(withOne.money).toEqual(without.money);
    expect(withOne.cohorts).toEqual(without.cohorts);
  });
});

describe('graduating, and the hall of fame', () => {
  it('a senior graduates with their class, into the hall of fame with their story, and another may be chosen', () => {
    let state = chosen(START, 'dorm', 3);
    const name = state.story.mc!.name;
    for (let day = 0; day < 8 && state.story.mc; day++) state = later(state, DAY).state;
    expect(state.story.mc).toBeNull();
    const fame = state.story.fame[state.story.fame.length - 1]!;
    expect(fame.name).toBe(name);
    expect(fame.status).toBe('graduated');
    expect(fame.story.length).toBeGreaterThan(0);
    const view = mcView(state);
    expect(view.chosen).toBeNull();
    expect(view.suggestion).not.toBeNull();
    expect(classYearOf(state, view.suggestion!.ref)).not.toBeNull();
    expect(view.fame[0]!.name).toBe(name);
  });
});

describe('where it shows', () => {
  it('opens the paper with what they did, decided and why, and their key moments use the notices', () => {
    const paper = edition(THREE.state, THREE.log, { minutes: 3 * 24 * 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(paper.main).not.toBeNull();
    expect(paper.main!.name).toBe(THREE.state.story.mc!.name);
    expect(paper.main!.lines.length).toBeGreaterThan(0);
    expect(paper.main!.lines.length).toBeLessThanOrEqual(6);
    expect(edition(START, later(START, DAY).log, { minutes: 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 }).main).toBeNull();
    // A close friend made, the Dean's list: the phone hears of it, within the day's two.
    const state = structuredClone(THREE.state);
    const notices = planNotices(state, { perDay: 3, wakeHour: 7, offsetMinutes: -480 });
    for (const notice of notices) expect(toneProblem(`${notice.title} ${notice.body}`)).toBeNull();
  });

  it('has a page: what they are doing and why, needs, the plan, goals, people and the timeline', () => {
    const view = mcView(THREE.state).chosen!;
    expect(view.doing).toMatch(/: /);
    expect(view.needs.map((need) => need.name)).toEqual(['Energy', 'Friends', 'Fun', 'Studies', 'Fitness']);
    expect(view.goals).toHaveLength(2);
    expect(view.people.length).toBeGreaterThanOrEqual(3);
    expect(view.timeline.length).toBeGreaterThan(0);
    for (const text of [view.doing, ...view.plan.map((one) => one.text), ...view.people.map(([, who]) => who), ...view.timeline]) expect(toneProblem(text), text).toBeNull();
    expect(mcDay(THREE.state).hour).toBeGreaterThanOrEqual(0);
  });
});

describe('saves', () => {
  it('keep the main character, their people and their timeline through a save and a load', () => {
    const loaded = parseSave(serialize(THREE.state, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.story).toEqual(THREE.state.story);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(29);
  });

  describe('from version 27', () => {
    const text = readFileSync(new URL('./fixtures/save-v27-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: no main character yet, and an empty hall of fame", () => {
      expect(file.state.version).toBe(27);
      expect(file.state.story).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(27);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.story = newStory();
      expected.web = webMetaFor(expected);
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      const notes = upgradeNotes(27);
      expect(notes).toHaveLength(3);
      expect(notes[0]).toMatch(/main character/);
      expect(toneProblem(notes[0]!)).toBeNull();
    });
  });
});
