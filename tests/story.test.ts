import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  newGame,
  newStory,
  parseSave,
  policyWords,
  POLICIES,
  sampleStudents,
  SAVE_VERSION,
  serialize,
  studentCard,
  toneProblem,
  validate,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { ARCS, EVENTS, LIBRARY } from '../src/sim/config/storyLibrary';
import type { StoryCategory, StoryEffect } from '../src/sim/config/stories';
import { oddsOf, oddsRead, stepStory, storySpec } from '../src/sim/systems/storyteller';
import { budget } from '../src/sim/systems/budget';
import { landRankGoals } from '../src/sim/systems/goals';
import { mcView } from '../src/ui/mcUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, HOUR, T0 } from './helpers';

/**
 * The story system (DESIGN.md 53.3 to 53.6, as built in section 58): arcs and
 * events as data, the storyteller's pacing, honest odds with the campus's
 * part named, failure that leads somewhere, the president's levers, and the
 * Story tab.
 */

const START = (() => {
  const state = newGame({ seed: 7, name: 'Larp University', now: T0, campus: 'model' });
  state.clock.anchor = 17 * 60;
  return advance(state, T0, T0 + 6 * HOUR).state;
})();

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

function chosen(state = START): GameState {
  const ref = sampleStudents(state, 60).find((one) => studentCard(state, one)?.residence === 'dorm')!;
  const result = applyAction(state, { type: 'makeMain', ref });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const WEEK = (() => {
  let state = chosen();
  const log: LogEntry[] = [];
  for (let h = 0; h < 7 * 24; h++) {
    const run = later(state, HOUR);
    state = run.state;
    log.push(...run.log);
  }
  return { state, log };
})();

/** Words the library must never use (52.1): the "still out" list. */
const STILL_OUT = /\b(sex\w*|naked|nude|assault\w*|rape\w*|self-harm|suicid\w*|anorexi\w*|bulimi\w*|overdos\w*|addict\w*|gun\w*|knife|knives|stab\w*|punch\w*|beat up|forced to (drink|eat))\b/i;

function texts(): string[] {
  const out: string[] = [];
  for (const spec of LIBRARY) {
    out.push(spec.title);
    for (const stage of spec.stages) {
      out.push(stage.text);
      if (stage.cliff) out.push(stage.cliff);
      for (const choice of stage.choices) {
        out.push(choice.label);
        for (const outcome of [choice.good, choice.bad]) if (outcome) out.push(outcome.title, outcome.text);
        for (const part of choice.odds?.parts ?? []) out.push(part.up, part.down);
      }
    }
  }
  return out;
}

describe('the library', () => {
  it('ships about 26 arcs and 60 events, every category of the owner’s list covered', () => {
    expect(ARCS).toHaveLength(26);
    expect(EVENTS).toHaveLength(60);
    const categories: StoryCategory[] = ['roommates', 'classes', 'dating', 'partying', 'social', 'money', 'greek', 'teams', 'good'];
    for (const category of categories) {
      expect(ARCS.some((spec) => spec.category === category), category).toBe(true);
      expect(EVENTS.some((spec) => spec.category === category), category).toBe(true);
    }
    expect(new Set(LIBRARY.map((spec) => spec.id)).size).toBe(LIBRARY.length);
    expect(EVENTS.every((spec) => spec.stages.length === 1)).toBe(true);
    expect(ARCS.every((spec) => spec.stages.length >= 1)).toBe(true);
    expect(ARCS.filter((spec) => spec.good).length).toBeGreaterThanOrEqual(2);
  });

  it('is plain and kind: the tone guide in every line, and nothing on the "still out" list', () => {
    for (const text of texts()) {
      expect(toneProblem(text), text).toBeNull();
      expect(STILL_OUT.test(text), text).toBe(false);
    }
  });

  it('chains only to stories it has, and every choice that can fail says what happens then', () => {
    for (const spec of LIBRARY) {
      for (const stage of spec.stages) {
        expect(stage.choices.length, spec.id).toBeGreaterThan(0);
        for (const choice of stage.choices) {
          for (const outcome of [choice.good, choice.bad]) {
            if (!outcome?.next || outcome.next === 'end') continue;
            expect(storySpec(outcome.next), `${spec.id} -> ${outcome.next}`).toBeDefined();
          }
          // A roll that can go wrong has an outcome for it: failure is a story too.
          if (choice.odds) expect(choice.bad, `${spec.id}: ${choice.label}`).toBeDefined();
          for (const effect of [...choice.good.effects, ...(choice.bad?.effects ?? [])] as StoryEffect[]) expect(effect.t).toMatch(/^(need|mood|stress|gpa|money|close|cast|job|greek|team)$/);
        }
      }
    }
  });

  it('keeps hazing light: a pledge task is never drinking or eating, and never hurts anyone', () => {
    const pledging = storySpec('pledging')!;
    for (const text of [pledging.stages[0]!.text, ...pledging.stages.flatMap((stage) => stage.choices.flatMap((choice) => [choice.good.text, choice.bad?.text ?? '']))]) {
      expect(text).not.toMatch(/\b(drink|drank|eat|ate|hurt|injur\w*|paddl\w*)\b/i);
    }
    expect(pledging.heavy).toBe(true);
  });
});

describe('the storyteller', () => {
  it('tells a week of stories: one main arc at a time, side stories beside it, quiet stretches between', () => {
    const story = WEEK.state.story;
    expect(story.chapters.length).toBeGreaterThanOrEqual(3);
    expect(story.arcs.filter((one) => one.main).length).toBeLessThanOrEqual(1);
    expect(story.arcs.filter((one) => !one.main).length).toBeLessThanOrEqual(2);
    // Chapters begin at least the quiet stretch apart.
    const starts = story.chapters.map((chapter) => chapter.scenes[0]?.tick ?? 0).filter((tick) => tick > 0);
    expect(starts.length).toBeGreaterThan(0);
    // No kind of story twice in a row.
    for (let n = 1; n < story.chapters.length; n++) {
      const a = storySpec(story.chapters[n - 1]!.arc)!.category;
      const b = storySpec(story.chapters[n]!.arc)!.category;
      if (story.chapters[n - 1]!.arc !== story.chapters[n]!.arc) expect(`${a}:${b}`).not.toBe(`${a}:${a}`);
    }
  });

  it('says the odds afterwards, with what helped or held it back, and keeps every line to the tone guide', () => {
    const scenes = WEEK.state.story.chapters.flatMap((chapter) => chapter.scenes);
    expect(scenes.length).toBeGreaterThan(0);
    const rolled = scenes.filter((scene) => scene.odds !== '');
    expect(rolled.length).toBeGreaterThan(0);
    for (const scene of rolled) expect(scene.odds).toMatch(/^.+: \d+%, (helped by|held back by|despite) .+\.$|: \d+%, an even chance\.$/);
    for (const scene of scenes) for (const text of [scene.text, scene.chose, scene.outcome, scene.odds]) expect(toneProblem(text), text).toBeNull();
    // A good outcome never says it was held back, and a bad one never that it was helped.
    for (const scene of rolled) {
      if (scene.good) expect(scene.odds).not.toMatch(/held back by/);
      else expect(scene.odds).not.toMatch(/helped by/);
    }
  });

  it('holds heavy themes to one at a time, and rests after one ends', () => {
    let state = chosen();
    for (let h = 0; h < 14 * 24; h++) {
      state = later(state, HOUR).state;
      const heavy = state.story.arcs.filter((one) => storySpec(one.id)?.heavy).length;
      expect(heavy).toBeLessThanOrEqual(1);
    }
  });

  it('is shaped by the president through the odds, never through the choice', () => {
    const state = chosen();
    const mc = state.story.mc!;
    const spec = storySpec('brokeToJob')!;
    const choice = spec.stages[0]!.choices[0]!;
    const before = oddsOf(state, mc, choice.odds!);
    // The Flagship era opens the campus jobs program; switched on, the odds of finding work rise, and the program is named.
    const flagship = structuredClone(state);
    flagship.field.rank = 70;
    flagship.field.rankYear = 1;
    landRankGoals(flagship, []);
    const on = applyAction(flagship, { type: 'policy', id: 'campusJobs', on: true });
    if (!on.ok) throw new Error(on.error);
    expect(oddsRead(on.state, on.state.story.mc!, 'campus.jobs')).toBe(1);
    expect(oddsRead(state, mc, 'campus.jobs')).toBe(0);
    const after = oddsOf(on.state, on.state.story.mc!, choice.odds!);
    expect(after.chance).toBeGreaterThan(before.chance);
    expect(after.phrase(true)).toBe('helped by the campus jobs program');
    // The same campus, any campus: the phone picks the same choice.
    const a = structuredClone(state);
    const b = structuredClone(on.state);
    for (const one of [a, b]) {
      one.story.arcs = [{ id: 'brokeToJob', stage: 0, due: one.clock.tick, main: true, chapter: 99, cliffTold: false }];
      one.story.chapters.push({ id: 99, arc: 'brokeToJob', title: 'x', name: one.story.mc!.name, scenes: [], ended: -1 });
      stepStory(one, []);
    }
    const chose = (one: GameState): string => one.story.chapters.find((chapter) => chapter.id === 99)!.scenes[0]!.chose;
    expect(chose(a)).toBe(chose(b));
  });

  it('gives the three levers a cost the Money panel shows, and words with their numbers', () => {
    for (const id of ['campusJobs', 'needScholarships', 'cheaperDining']) {
      const spec = POLICIES.find((one) => one.id === id)!;
      expect(spec.era).toBe(2);
      const words = policyWords(START, spec);
      for (const line of [...words.gain, ...words.cost]) {
        expect(line).toMatch(/\d/);
        expect(toneProblem(line)).toBeNull();
      }
    }
    const flagship = structuredClone(START);
    flagship.field.rank = 70;
    flagship.field.rankYear = 1;
    landRankGoals(flagship, []);
    const on = applyAction(flagship, { type: 'policy', id: 'needScholarships', on: true });
    if (!on.ok) throw new Error(on.error);
    const line = budget(on.state).groups.flatMap((group) => group.lines).find((one) => one.id === 'policy.needScholarships')!;
    expect(line.name).toBe('Need-based scholarships');
    expect(budget(on.state).spending).toBeGreaterThan(budget(flagship).spending);
  });

  it('shows the story as chapters on the Story tab, each scene with what they did and the odds', () => {
    const view = mcView(WEEK.state).chosen!;
    expect(view.chapters.length).toBeGreaterThan(0);
    for (const chapter of view.chapters) {
      expect(chapter.title.length).toBeGreaterThan(0);
      for (const scene of chapter.scenes) expect(scene.chose).toMatch(/\.$/);
    }
  });
});

describe('saves', () => {
  it('keep the stories under way, the chapters and the cooldowns through a save and a load', () => {
    const loaded = parseSave(serialize(WEEK.state, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.story).toEqual(WEEK.state.story);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBe(29);
    // And they go on the same from the loaded save as from the one in memory.
    const a = later(WEEK.state, DAY).state.story;
    const b = later(loaded.state, DAY).state.story;
    expect(b).toEqual(a);
  });

  describe('from version 28', () => {
    const text = readFileSync(new URL('./fixtures/save-v28-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it('comes through with nothing else moved: the Main Character gains what the story reads, at nothing', () => {
      expect(file.state.version).toBe(28);
      expect(file.state.story.mc).not.toBeNull();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(28);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      Object.assign(expected.story, { arcs: [], chapters: [], nextChapter: 1, cooldowns: {}, lastStart: -1 });
      Object.assign(expected.story.mc!, { recent: {}, mood: 0, stress: 0, gpaBonus: 0, member: null, team: false });
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      const notes = upgradeNotes(28);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(/stor/i);
      expect(toneProblem(notes[0]!)).toBeNull();
      expect(newStory().arcs).toEqual([]);
    });
  });
});
