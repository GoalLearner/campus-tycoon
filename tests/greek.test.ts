import { readFileSync } from 'node:fs';
import { newSocial } from '../src/sim/systems/social';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  campusHappiness,
  chapterBeds,
  chapterLift,
  chapterNoiseAt,
  chapterOf,
  chapterStatus,
  chapters,
  CHAPTER_WORDS,
  coverFor,
  greekDrag,
  greekMembers,
  GREEK_HOUSES_MOST,
  GREEK_LETTERS,
  newGame,
  newGreek,
  nextGreekDay,
  noiseAt,
  openCapacity,
  parseSave,
  PHILANTHROPY,
  previewPlace,
  PRANKS,
  PROBATION_HOURS,
  SAVE_VERSION,
  serialize,
  studentCard,
  sampleStudents,
  toneProblem,
  validate,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { landRankGoals } from '../src/sim/systems/goals';
import { approvalAt } from '../src/sim/systems/happiness';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { chapterPage } from '../src/ui/greekUi';
import { DAY, HOUR, MIN, T0 } from './helpers';

/**
 * Greek Row (DESIGN.md 14.1, adapted and built in section 51): chapter houses
 * from the Growth era on a game with goals, a chapter for each with a name of
 * the game's own words, rush week each fall, a standing the player can see
 * and fix, friendly pranks at the desk, philanthropy each spring, members who
 * feel it, neighbours who hear it, and a small drag on the rating.
 */

const OPENED = advance(newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;

/** The model campus in the Growth era, with money to spend. */
function growth(): GameState {
  const state = structuredClone(OPENED);
  state.field.rank = 120;
  state.field.rankYear = 1;
  landRankGoals(state, []);
  state.money.cash = 2_000_000_000;
  return state;
}

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

/** A free cell a house can go on, the first that suits. */
function spot(state: GameState, suits: (x: number, y: number) => boolean = () => true): [number, number] {
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (previewPlace(state, 'chapterHouse', x, y).problem === null && suits(x, y)) return [x, y];
    }
  }
  throw new Error('no room for a chapter house');
}

function build(state: GameState, at = spot(state)): GameState {
  const result = applyAction(state, { type: 'place', building: 'chapterHouse', x: at[0], y: at[1] });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Run on to just past the next rush week (ref 0) or philanthropy day (ref 1). */
function through(state: GameState, ref: number): { state: GameState; log: LogEntry[] } {
  const at = nextGreekDay(state, ref)!;
  return later(state, (at - state.clock.tick + 2) * MIN);
}

const housed = (state: GameState): number => chapters(state).reduce((sum, chapter) => sum + Math.min(chapter.members, chapterBeds(state)), 0);

describe('chapter houses', () => {
  it('come only with a game with goals, from the Growth era, eight at most', () => {
    const small = advance(newGame({ seed: 35, name: 'Small', now: T0 }), T0, T0 + 1.5 * DAY).state;
    small.money.cash = 1e9;
    expect(applyAction(small, { type: 'place', building: 'chapterHouse', x: 1, y: 1 }).ok).toBe(false);
    const early = structuredClone(OPENED);
    early.money.cash = 1e9;
    const refused = applyAction(early, { type: 'place', building: 'chapterHouse', x: spot(early)[0], y: spot(early)[1] });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/Growth era/);
    let state = growth();
    for (let n = 0; n < GREEK_HOUSES_MOST; n++) state = build(state);
    expect(chapters(state)).toHaveLength(GREEK_HOUSES_MOST);
    const ninth = applyAction(state, { type: 'place', building: 'chapterHouse', x: spot(state)[0], y: spot(state)[1] });
    expect(ninth.ok).toBe(false);
  });

  it('found a chapter at once, with a name of Greek letters and a plain word, never twice, and members from the dorms', () => {
    let state = growth();
    const beds = openCapacity(state, 'housing');
    for (let n = 0; n < 6; n++) state = build(state);
    const names = state.greek.used;
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      const words = name.split(' ');
      // Its last word is never a Greek letter, so it cannot be a real chapter's name: those are letters alone.
      expect(CHAPTER_WORDS).toContain(words[words.length - 1]);
      expect(GREEK_LETTERS).not.toContain(words[words.length - 1]);
      for (const letter of words.slice(0, -1)) expect(GREEK_LETTERS).toContain(letter);
      expect(toneProblem(name)).toBeNull();
    }
    for (const chapter of chapters(state)) {
      expect(chapter.members).toBeGreaterThanOrEqual(chapterBeds(state) / 2);
      expect(chapter.hazing).toBe(0);
      expect(chapter.events[0]!.kind).toBe('founded');
    }
    // Members who moved into a house left a dorm bed free: Housing counts the house's beds they fill.
    expect(openCapacity(state, 'housing')).toBe(beds + housed(state));
    const told = later(state, MIN).log.filter((entry) => entry.kind === 'greek');
    expect(told).toHaveLength(6);
    expect(told[0]!.text).toMatch(/is founded, with/);
  });

  it('never makes a name from words outside the pools, and every pool word keeps the tone guide', () => {
    for (const word of [...GREEK_LETTERS, ...CHAPTER_WORDS]) expect(toneProblem(word), word).toBeNull();
    expect(CHAPTER_WORDS.filter((word) => GREEK_LETTERS.includes(word))).toEqual([]);
    for (const line of [...PRANKS, ...PHILANTHROPY]) expect(toneProblem(line.replace('{chapter}', 'Kappa Llama')), line).toBeNull();
  });

  it('close with their house: its members move back to the dorms, and its name is not given again', () => {
    let state = build(growth());
    const chapter = chapters(state)[0]!;
    const house = state.map.placed[chapter.house]!;
    const cleared = applyAction(state, { type: 'paint', tool: 'clear', cells: [[house.x, house.y]] });
    if (!cleared.ok) throw new Error(cleared.error);
    state = cleared.state;
    expect(chapters(state)).toHaveLength(0);
    expect(state.greek.used).toEqual([chapter.name]);
    expect(later(state, MIN).log.some((entry) => entry.kind === 'greek' && entry.text.includes('move back into the dorms'))).toBe(true);
    state = build(state);
    expect(chapters(state)[0]!.name).not.toBe(chapter.name);
  });
});

describe('rush week', () => {
  it('comes early each fall: students join and move from dorm beds into the houses, and the paper leads with it', () => {
    let state = build(build(growth()));
    // Commencement takes the seniors; rush makes the chapters whole again.
    const run = through(state, 0);
    state = run.state;
    const line = run.log.find((entry) => entry.kind === 'greek' && entry.data?.rush === 1)!;
    expect(line.text).toMatch(/^Rush week: [\d,]+ students join Greek Row(, and [\d,]+ move from dorm beds into the 2 chapter houses|\. The houses were full already, so the new members keep their dorm beds)\.$/);
    expect(String(line.data?.headline)).toMatch(/^Rush Week: [\d,]+ Join Greek Row; /);
    expect(state.greek.rush?.joined).toBe(Number(line.data?.joined));
    expect(state.greek.totals.rushes).toBe(1);
    for (const chapter of chapters(state)) expect(chapter.events[chapter.events.length - 1]!.kind).toBe('rush');
    // The next is a school year on.
    expect(nextGreekDay(state, 0)! - state.clock.tick).toBeGreaterThan(6 * 24 * 60);
  });

  it('fills a lone house past its beds when more want in, and another house takes the extra members the day it opens', () => {
    let state = build(growth());
    const chapter = chapters(state)[0]!;
    chapter.members = Math.round(chapterBeds(state) * 1.25);
    expect(chapterStatus(state, chapter)).toBe('warning');
    state = build(state);
    expect(chapters(state)[0]!.members).toBe(chapterBeds(state));
    expect(chapterStatus(state, chapters(state)[0]!)).not.toBe('probation');
  });
});

describe('a chapter’s standing', () => {
  it('goes on Warning when its house is overfull, shows it first, and on Probation only if it stays so', () => {
    let state = build(growth(), spot(growth(), (x, y) => !!coverFor(growth().map, 'safety', x, y)));
    const chapter = chapters(state)[0]!;
    expect(chapterStatus(state, chapter)).toBe('good');
    chapter.members = chapterBeds(state) + 20;
    let run = later(state, HOUR + MIN);
    state = run.state;
    expect(chapters(state)[0]!.status).toBe('warning');
    const warned = run.log.find((entry) => entry.kind === 'greek' && entry.data?.status === 1)!;
    expect(warned.text).toMatch(/is on Warning: its house is overfull/);
    expect(warned.text).toMatch(/another chapter house would give them room/i);
    expect(chapterLift(state, chapters(state)[0]!).points).toBeGreaterThan(0);
    run = later(state, PROBATION_HOURS * HOUR);
    state = run.state;
    expect(chapterStatus(state, chapters(state)[0]!)).toBe('probation');
    expect(run.log.some((entry) => entry.kind === 'greek' && entry.data?.status === 2)).toBe(true);
    // On Probation its members feel nothing from the house.
    expect(chapterLift(state, chapters(state)[0]!).points).toBe(0);
    // Put right, it is in good standing at once, and the paper says so within the hour.
    chapters(state)[0]!.members = chapterBeds(state);
    expect(chapterStatus(state, chapters(state)[0]!)).toBe('good');
    run = later(state, HOUR + MIN);
    expect(run.log.some((entry) => entry.kind === 'greek' && entry.text.endsWith('is in good standing again.'))).toBe(true);
  });

  it('goes on Warning when Campus Safety does not reach its house', () => {
    const base = growth();
    const state = build(base, spot(base, (x, y) => !coverFor(base.map, 'safety', x, y)));
    expect(chapterStatus(state, chapters(state)[0]!)).toBe('warning');
    const page = chapterPage(state, state.map.placed[chapters(state)[0]!.house]!)!;
    expect(page.standing[0]).toBe('On Warning');
    expect(page.standing.join(' ')).toMatch(/Campus Safety does not reach the house/);
    expect(page.standing.join(' ')).toMatch(/Probation in/);
  });
});

describe('what Greek Row feels and does', () => {
  it('lifts its members’ Food & fun, more on the Row and by the stadium, named on the campus line', () => {
    const base = growth();
    base.football.stadium.tier = Math.max(1, base.football.stadium.tier);
    const loud = (x: number, y: number): boolean => noiseAt(base, x, y) > 0;
    let state = build(base, spot(base, loud));
    const first = chapters(state)[0]!;
    const lone = chapterLift(state, first);
    expect(lone.parts.map((part) => part.label)).toContain('Game days next door');
    const house = state.map.placed[first.house]!;
    state = build(state, spot(state, (x, y) => Math.max(Math.abs(x - house.x), Math.abs(y - house.y)) <= 2));
    expect(chapterLift(state, chapters(state)[0]!).parts.map((part) => part.label)).toContain('Another house beside it');
    const life = campusHappiness(state).causes.find((cause) => cause.id === 'life')!;
    expect(life.policies?.some((note) => note.name === 'Greek Row' && note.delta > 0)).toBe(true);
  });

  it('is heard by the dorms and lecture halls beside a house, inside Grounds', () => {
    let state = growth();
    const near = (x: number, y: number): boolean => state.map.buildings.some((lot) => !!lot && lot.stage > 0 && Math.max(Math.abs(lot.x - x), Math.abs(lot.y - y)) === 1);
    state = build(state, spot(state, near));
    const house = state.map.placed[chapters(state)[0]!.house]!;
    const lot = state.map.buildings.find((one) => !!one && one.stage > 0 && Math.max(Math.abs(one.x - house.x), Math.abs(one.y - house.y)) === 1)!;
    expect(chapterNoiseAt(state, lot.x, lot.y)).toBeGreaterThan(0);
    const here = approvalAt(state, lot.y * state.map.width + lot.x);
    const grounds = here.causes.find((cause) => cause.id === 'grounds')!;
    expect(grounds.parts.some((part) => part.id === 'noise' && part.level < 1)).toBe(true);
  });

  it('takes a little off the graduation rate the rating reads, by the share in chapters, and each policy halves it', () => {
    let state = growth();
    for (let n = 0; n < 4; n++) state = build(state);
    const drag = greekDrag(state);
    expect(drag.points).toBeGreaterThan(0);
    expect(drag.why).toMatch(/% of students are in chapters/);
    const flip = (now: GameState, id: string): GameState => {
      const result = applyAction(now, { type: 'policy', id, on: true });
      if (!result.ok) throw new Error(result.error);
      return result.state;
    };
    const deferred = flip(state, 'deferredRush');
    expect(greekDrag(deferred).points).toBeCloseTo(Math.round(drag.before * 0.5 * 10) / 10, 5);
    expect(greekDrag(deferred).why).toMatch(/eased by Deferred rush/);
    const both = flip(deferred, 'chapterGrades');
    expect(greekDrag(both).points).toBeCloseTo(Math.round(drag.before * 0.25 * 10) / 10, 5);
  });

  it('shows its two policies only once a chapter house stands', () => {
    const before = growth();
    expect(applyAction(before, { type: 'policy', id: 'deferredRush', on: true }).ok).toBe(false);
    const after = build(before);
    expect(applyAction(after, { type: 'policy', id: 'deferredRush', on: true }).ok).toBe(true);
  });

  it('gives a chapter’s members their tag, their house, and its whole lift on their cards', () => {
    let state = growth();
    for (let n = 0; n < 4; n++) state = build(state);
    const cards = sampleStudents(state, 400).map((ref) => studentCard(state, ref)!).filter(Boolean);
    const members = cards.filter((card) => card.chapter !== null);
    expect(members.length).toBeGreaterThan(0);
    for (const card of members) {
      expect(['Pledge', 'Greek Loyalist', 'Varsity Athlete', 'Superfan']).toContain(card.archetypeName);
      if (card.archetype === 'pledge') expect(card.classYear).toBe(0);
      expect(chapters(state).map((chapter) => chapter.name)).toContain(card.chapter);
    }
    expect(members.some((card) => card.residence === 'chapter')).toBe(true);
    expect(cards.filter((card) => card.chapter === null).every((card) => card.archetype !== 'pledge' && card.archetype !== 'greekLoyalist')).toBe(true);
    expect(greekMembers(state)).toBeGreaterThan(0);
  });
});

describe('pranks and philanthropy', () => {
  it('a prank comes to the desk from a chapter, friendly, and left alone it is laughed off', () => {
    let state = growth();
    for (let n = 0; n < 6; n++) state = build(state);
    let prank = null;
    for (let day = 0; day < 40 && !prank; day++) {
      state = later(state, DAY).state;
      prank = state.inbox.open.find((item) => item.key === 'chapterPrank') ?? null;
    }
    expect(prank).not.toBeNull();
    expect(prank!.fallback).toBe('laugh');
    expect(toneProblem(`${prank!.title} ${prank!.body}`)).toBeNull();
    expect(state.greek.totals.pranks).toBeGreaterThan(0);
    const from = chapters(state).find((chapter) => prank!.title.endsWith(chapter.name))!;
    expect(from.events.some((event) => event.kind === 'prank')).toBe(true);
    const giving = from.giving;
    const answered = applyAction(state, { type: 'inbox', id: prank!.id, option: 'service' });
    if (!answered.ok) throw new Error(answered.error);
    expect(chapterOf(answered.state, from.house)!.giving).toBe(giving + 1);
  });

  it('each spring every chapter not on Probation holds an event, in one line of the paper, and the campus is happier for two days', () => {
    let state = growth();
    for (let n = 0; n < 3; n++) state = build(state, spot(state, (x, y) => !!coverFor(state.map, 'safety', x, y)));
    for (const chapter of chapters(state)) chapter.members = Math.min(chapter.members, chapterBeds(state));
    const run = through(state, 1);
    const lines = run.log.filter((entry) => entry.kind === 'greek' && entry.data?.giving === 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toMatch(/^Greek Row gives back\. .+ 2 more chapters held events of their own\.$/);
    expect(chapters(run.state).every((chapter) => chapter.giving >= 1)).toBe(true);
    expect(run.state.inbox.boosts.some((boost) => boost.label === 'Greek Row gives back')).toBe(true);
  });
});

describe('saves', () => {
  it('keep the chapters, their records and their next days through a save and a load', () => {
    let state = growth();
    for (let n = 0; n < 3; n++) state = build(state);
    const loaded = parseSave(serialize(state, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.greek).toEqual(state.greek);
    expect(loaded.state.timers.filter((timer) => timer.kind === 'greek')).toHaveLength(2);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(29);
  });

  describe('from version 24', () => {
    const text = readFileSync(new URL('./fixtures/save-v24-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: the owner's own kind of game, with no chapter yet", () => {
      expect(file.state.version).toBe(24);
      expect(file.state.greek).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(24);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.greek = newGreek();
      // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
      expected.alumni = loaded.state.alumni;
      // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
      expected.story = newStory();
      expected.social = newSocial();
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      const week = advance(loaded.state, file.savedAt, file.savedAt + 7 * DAY).state;
      expect(validate(week)).toBeNull();
      const notes = upgradeNotes(24);
      expect(notes).toHaveLength(6);
      expect(notes[0]).toMatch(/Greek Row/);
    });
  });
});
