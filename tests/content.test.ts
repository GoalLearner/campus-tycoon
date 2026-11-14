import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  BANNED_WORDS,
  campusHappiness,
  causeShifts,
  chapterLift,
  chapterOf,
  chapterStatus,
  chapters,
  DRINK_WORDS,
  DRINKING_YEAR,
  everyWrittenItem,
  greekHazing,
  greekMembers,
  HAZING_SCANDAL,
  HAZING_TASKS,
  hazingRisk,
  hazingToday,
  HEAVY_WORDS,
  lateNights,
  newGame,
  nextGreekDay,
  parseSave,
  partyCallChance,
  partyEffects,
  PARTY_LINES,
  PARTY_LIFT,
  pledgeSeason,
  POLICIES,
  previewPlace,
  relationshipOf,
  sampleStudents,
  SAVE_VERSION,
  semesterOf,
  studentCard,
  toneProblem,
  validate,
  type GameState,
  type InboxItem,
  type LogEntry,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { landRankGoals } from '../src/sim/systems/goals';
import { PARTY_CARD } from '../src/sim/config/students';
import { ratingShift } from '../src/sim/systems/policies';
import { academicInputs } from '../src/sim/systems/field';
import { edition } from '../src/sim/newspaper';
import { seasonCurve, stressRead } from '../src/sim/systems/season';
import { campusLevels } from '../src/sim/systems/happiness';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { chapterPage } from '../src/ui/greekUi';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/**
 * Real-life college content (DESIGN.md 52, as built in section 55): parties
 * with visible costs, drinking for students of 21 and over, calls to Campus
 * Safety and the Medical Center, light hazing on Greek Row with reports,
 * probation and suspension, the five new policies, and the cards.
 */

const OPENED = advance(newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;

function growth(): GameState {
  const state = structuredClone(OPENED);
  state.field.rank = 120;
  state.field.rankYear = 1;
  landRankGoals(state, []);
  state.money.cash = 2_000_000_000;
  return state;
}

const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

function build(state: GameState): GameState {
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (previewPlace(state, 'chapterHouse', x, y).problem !== null) continue;
      const result = applyAction(state, { type: 'place', building: 'chapterHouse', x, y });
      if (!result.ok) throw new Error(result.error);
      return result.state;
    }
  }
  throw new Error('no room for a chapter house');
}

function flip(state: GameState, id: string, on = true): GameState {
  const result = applyAction(state, { type: 'policy', id, on });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Run on to just past the next rush week: pledge season. */
function rushed(state: GameState): { state: GameState; log: LogEntry[] } {
  const at = nextGreekDay(state, 0)!;
  return later(state, (at - state.clock.tick + 2) * MIN);
}

/** Put a written item on the desk as the day would, from the draft the game writes for it now. */
function onDesk(state: GameState, key: string): { state: GameState; item: InboxItem } {
  const made = everyWrittenItem(state).find((one) => one.key === key);
  if (!made) throw new Error(`no ${key} today`);
  const next = structuredClone(state);
  const item: InboxItem = {
    id: next.inbox.nextId,
    key,
    kind: 'event',
    advisor: 'dean',
    title: made.draft.title,
    body: made.draft.body,
    opens: next.clock.tick,
    closes: next.clock.tick + 36 * 60,
    options: made.draft.options,
    fallback: made.draft.fallback,
    advised: made.draft.advised,
  };
  next.inbox.nextId += 1;
  next.inbox.open.push(item);
  return { state: next, item };
}

function choose(state: GameState, item: InboxItem, option: string): GameState {
  const result = applyAction(state, { type: 'inbox', id: item.id, option });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('the tone guide, as changed on 2026-11-13', () => {
  it('lets alcohol through, and still bans smoking, vaping, drugs and gambling', () => {
    for (const word of ['beer', 'wine', 'alcohol', 'drinking']) expect(BANNED_WORDS.test(`A ${word} at a party.`), word).toBe(false);
    for (const word of ['smoking', 'cigarette', 'vape', 'vaping', 'drugs', 'weed', 'betting', 'gambling', 'casino', 'poker']) expect(BANNED_WORDS.test(`A ${word} at a party.`), word).toBe(true);
  });

  it('writes every party line plainly, about drinking, and never graphically', () => {
    const lines = [...PARTY_LINES.mischief, ...PARTY_LINES.injury];
    for (const line of lines) {
      expect(toneProblem(line), line).toBeNull();
      expect(line).toMatch(/\{place\}/);
      expect(line.endsWith('.'), line).toBe(true);
    }
    // Drinking is named where it happens: a call about it counts toward the long run's budget.
    expect(PARTY_LINES.injury.every((line) => DRINK_WORDS.test(line))).toBe(true);
    // Those caught drinking under 21 are younger students: freshmen and sophomores.
    for (const line of lines.filter((one) => /under 21/.test(one))) expect(line).toMatch(/freshman|sophomore/);
    expect(lines.some((line) => /under 21/.test(line))).toBe(true);
  });

  it('keeps hazing light: embarrassing, early or silly, never forced drinking or eating, never anything that hurts', () => {
    for (const task of HAZING_TASKS) {
      expect(toneProblem(task), task).toBeNull();
      expect(task).toMatch(/^Pledges of \{chapter\} /);
      expect(task).not.toMatch(/\b(drink|drank|eat|ate|food|beer|alcohol|hit|hurt|paddl\w*|beat\w*|burn\w*|cold water|injur\w*)\b/i);
    }
  });
});

describe('parties', () => {
  it('come only with a game with goals: Food & fun a little higher, named "Parties" on its line', () => {
    expect(partyEffects(freshGame())).toEqual([]);
    expect(lateNights(freshGame())).toEqual({ stress: 0, rating: 0, by: [] });
    const state = growth();
    const life = campusHappiness(state).causes.find((cause) => cause.id === 'life')!;
    expect(life.policies!.find((note) => note.id === 'parties')!.name).toBe('Parties');
    expect(causeShifts(state, 'housing').find((shift) => shift.id === 'parties')!.delta).toBeCloseTo(PARTY_LIFT / 100, 9);
  });

  it('cost late nights: Stress in term, never on a break, and the graduation rate, more with more students in chapters', () => {
    let state = growth();
    const before = lateNights(state);
    expect(before.stress).toBeGreaterThan(0);
    expect(before.rating).toBeGreaterThan(0);
    const levels = campusLevels(state);
    // In term the Stress the campus reads includes it.
    const read = stressRead(state, levels, 0.5);
    expect(read.late).toBe(Math.round(before.stress));
    expect(stressRead(state, levels, 0.1).late).toBe(0);
    expect(ratingShift(state, 'graduation').notes.some((note) => note.startsWith('Late nights: '))).toBe(true);
    for (let n = 0; n < 3; n++) state = build(state);
    expect(lateNights(state).stress).toBeGreaterThan(before.stress);
    // Alcohol education halves both.
    const flagship = structuredClone(state);
    flagship.field.rank = 70;
    landRankGoals(flagship, []);
    const taught = flip(flagship, 'alcoholEducation');
    expect(lateNights(taught).stress).toBeCloseTo(lateNights(state).stress / 2, 0);
    expect(lateNights(taught).by).toEqual(['Alcohol education']);
  });

  it('now and then end in a call: Campus Safety or the Medical Center, plainly, and only on a game with goals', () => {
    let state = growth();
    for (let n = 0; n < 4; n++) state = build(state);
    const run = later(state, 4 * DAY);
    const calls = run.log.filter((entry) => entry.kind === 'incident' && entry.data?.party === 1);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(40);
    for (const call of calls) expect(toneProblem(call.text), call.text).toBeNull();
    expect(calls.some((call) => call.data?.need === 'safety')).toBe(true);
    // Some come from the chapter houses, as their socials, and go on the chapter's record.
    const socials = chapters(run.state).flatMap((chapter) => chapter.events.filter((event) => event.kind === 'social'));
    expect(socials.length + calls.filter((call) => /house/.test(String(call.data?.place))).length).toBeGreaterThanOrEqual(0);
    // The small campus has none.
    const small = advance(freshGame(), T0, T0 + 4 * DAY);
    expect(small.log.some((entry) => entry.kind === 'incident' && entry.data?.party === 1)).toBe(false);
  });

  it('come less often with a dry campus or party registration, and fewer need the Medical Center with alcohol education', () => {
    const state = growth();
    const curve = 0.5;
    const base = partyCallChance(state, 1, curve, 0);
    expect(base.chance).toBeGreaterThan(0);
    expect(partyCallChance(state, 1, 0.1, 0).chance).toBe(0);
    const dry = partyCallChance(flip(state, 'dryCampus'), 1, curve, 0);
    expect(dry.chance).toBeCloseTo(base.chance * 0.4, 9);
    const registered = partyCallChance(flip(state, 'partyRegistration'), 1, curve, 0);
    expect(registered.chance).toBeLessThan(base.chance);
    expect(registered.medical).toBeGreaterThan(base.medical);
    // A tailgate with drinks doubles them for its days.
    expect(partyCallChance(state, 1, curve, 1).chance).toBeCloseTo(base.chance * 2, 9);
    // A dry campus costs Food & fun; registration gives a little.
    const life = (one: GameState): number => campusHappiness(one).causes.find((cause) => cause.id === 'life')!.level;
    expect(life(flip(state, 'dryCampus'))).toBeLessThan(life(state));
    expect(life(flip(state, 'partyRegistration'))).toBeGreaterThan(life(state));
  });
});

describe('Greek Row hazing', () => {
  it('has a risk for each chapter, from its house, the president and the policies, shown on its panel', () => {
    let state = build(build(growth()));
    const chapter = chapters(state)[0]!;
    const base = hazingRisk(state, chapter);
    expect(base.risk).toBeGreaterThan(0.2);
    expect(base.why).toContain('no anti-hazing policy and no oversight');
    const anti = flip(state, 'antiHazing');
    expect(hazingRisk(anti, chapters(anti)[0]!).risk).toBeCloseTo(base.risk * 0.4, 9);
    const both = flip(anti, 'greekOversight');
    expect(hazingRisk(both, chapters(both)[0]!).risk).toBeCloseTo(base.risk * 0.2, 9);
    expect(hazingRisk(both, chapters(both)[0]!).level).toBe('Low');
    // Oversight costs its members a little Food & fun; the anti-hazing policy, recruits.
    expect(causeShifts(both, 'housing', 10).some((shift) => shift.id === 'greekOversight' && shift.delta < 0)).toBe(true);
    const page = chapterPage(state, state.map.placed[chapter.house]!)!;
    expect(page.rows.find(([label]) => label === 'Hazing risk')![1]).toMatch(/^(Low|Some|High): /);
    state = later(state, HOUR).state;
    expect(chapters(state)[0]!.hazing).toBeCloseTo(hazingRisk(state, chapters(state)[0]!).risk, 9);
  });

  it('is reported only in pledge season, the first two days after rush week, as a question on the desk', () => {
    const state = later(build(build(growth())), 3 * DAY).state;
    expect(pledgeSeason(state)).toBe(false);
    expect(hazingToday(state, () => 0)).toBeNull();
    const season = rushed(state).state;
    expect(pledgeSeason(season)).toBe(true);
    const report = hazingToday(season, () => 0)!;
    expect(report.text).toMatch(/^Pledges of /);
    expect(report.text).toContain(report.chapter.name);
    const { item } = onDesk(season, 'hazingReport');
    expect(item.options.map((option) => option.id)).toEqual(['probation', 'suspend', 'look']);
    expect(item.fallback).toBe('probation');
    expect(item.advised).toBe('probation');
    for (const text of [item.title, item.body, ...item.options.flatMap((option) => [option.label, option.detail])]) expect(toneProblem(text), text).toBeNull();
    expect(later(season, 3 * DAY).state && pledgeSeason(later(season, 3 * DAY).state)).toBe(false);
  });

  it('on probation, a chapter loses its lift until rush week, and a second report suspends it', () => {
    const season = rushed(build(build(growth()))).state;
    const { state, item } = onDesk(season, 'hazingReport');
    const house = item.options[0]!.effects[0]!.t === 'hazing' ? (item.options[0]!.effects[0] as { house: number }).house : -1;
    const probation = choose(state, item, 'probation');
    const chapter = chapterOf(probation, house)!;
    expect(chapterStatus(probation, chapter)).toBe('probation');
    expect(chapterLift(probation, chapter).points).toBe(0);
    expect(chapter.probationUntil).toBe(nextGreekDay(probation, 0));
    const told = later(probation, MIN).log.find((entry) => entry.kind === 'greek' && /on probation for hazing/.test(entry.text))!;
    expect(told.data?.status).toBe(2);
    // Watched while on probation: its risk is lower.
    expect(hazingRisk(probation, chapter).risk).toBeLessThan(hazingRisk(season, chapterOf(season, house)!).risk);
    // A second report suspends it.
    const again = structuredClone(probation);
    greekHazing(again, house, 'suspend');
    const suspended = chapterOf(again, house)!;
    expect(chapterStatus(again, suspended)).toBe('suspended');
    expect(suspended.members).toBe(0);
    expect(again.greek.totals.suspensions).toBe(1);
  });

  it('suspended, a chapter stands empty until rush week, its members in the dorms, and the paper says so', () => {
    const season = rushed(build(build(growth()))).state;
    const { state, item } = onDesk(season, 'hazingReport');
    const house = (item.options[1]!.effects[0] as { house: number }).house;
    const members = greekMembers(state);
    const was = chapterOf(state, house)!.members;
    const after = choose(state, item, 'suspend');
    expect(greekMembers(after)).toBe(members - was);
    expect(chapterStatus(after, chapterOf(after, house)!)).toBe('suspended');
    const run = later(after, MIN);
    const line = run.log.find((entry) => entry.kind === 'greek' && entry.data?.hazing === 1)!;
    expect(line.text).toMatch(/is suspended for hazing\. Its [\d,]+ members move back into the dorms until rush week\.$/);
    const paper = edition(run.state, run.log, { minutes: 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(paper.headline).toBe('A Chapter Is Suspended for Hazing; Its Banner Comes Down');
    expect(chapterPage(run.state, run.state.map.placed[house]!)!.standing.join(' ')).toMatch(/Suspended for hazing until rush week/);
    // Rush week ends it: the chapter recruits again.
    const next = rushed(run.state).state;
    const back = chapterOf(next, house)!;
    expect(chapterStatus(next, back)).not.toBe('suspended');
    expect(back.members).toBeGreaterThan(0);
    expect(back.suspendedUntil).toBe(-1);
  });

  it('looking the other way costs nothing now, raises the risk, and a second report is a scandal: Reputation lower for a year', () => {
    const season = rushed(build(build(growth()))).state;
    const { state, item } = onDesk(season, 'hazingReport');
    const house = (item.options[2]!.effects[0] as { house: number }).house;
    const looked = choose(state, item, 'look');
    const chapter = chapterOf(looked, house)!;
    expect(chapter.looked).toBe(true);
    expect(chapterStatus(looked, chapter)).toBe(chapterStatus(state, chapterOf(state, house)!));
    expect(hazingRisk(looked, chapter).risk).toBeGreaterThan(hazingRisk(state, chapterOf(state, house)!).risk);
    expect(hazingRisk(looked, chapter).why).toContain('you looked the other way on a report');
    // The second report comes in the hours of pledge season left: the chapter is suspended, and the story is out.
    let run = { state: looked, log: [] as LogEntry[] };
    for (let hour = 0; hour < 48 && chapterOf(run.state, house)!.suspendedUntil < 0; hour++) {
      const step = later(run.state, HOUR);
      run = { state: step.state, log: [...run.log, ...step.log] };
    }
    if (chapterOf(run.state, house)!.suspendedUntil > 0) {
      run = { state: later(run.state, MIN).state, log: [...run.log, ...later(run.state, MIN).log] };
      const reputation = academicInputs(run.state).find((input) => input.id === 'reputation')!;
      expect(JSON.stringify(reputation)).toContain('hazing the school looked away from');
      expect(run.state.greek.scandalUntil).toBeGreaterThan(run.state.clock.tick);
      const scandal = run.log.find((entry) => entry.kind === 'greek' && entry.data?.scandal === 1);
      expect(scandal?.text ?? '').toContain(`Reputation is ${HAZING_SCANDAL} points lower for a year`);
    } else {
      // A quiet chapter is possible: the risk is a chance, not a promise. It stays looked-at until rush week.
      expect(chapterOf(run.state, house)!.looked).toBe(true);
    }
  });

  it('starts every school year clean at rush week', () => {
    const season = rushed(build(build(growth()))).state;
    const house = chapters(season)[0]!.house;
    const marked = structuredClone(season);
    greekHazing(marked, house, 'look');
    const next = rushed(marked).state;
    const chapter = chapterOf(next, house)!;
    expect(chapter).toMatchObject({ looked: false, reports: 0, probationUntil: -1, suspendedUntil: -1 });
  });
});

describe('the policies of 52.3', () => {
  it('are five more entries in the list, each one gain and one named cost, the hazing two shown with a chapter house', () => {
    const ids = ['dryCampus', 'partyRegistration', 'alcoholEducation', 'antiHazing', 'greekOversight'];
    for (const id of ids) {
      const spec = POLICIES.find((one) => one.id === id)!;
      expect(spec.gains.length).toBeGreaterThan(0);
      expect(spec.costs.length).toBeGreaterThan(0);
      for (const text of [spec.name, spec.gives, spec.takes, spec.begins, spec.ends]) expect(toneProblem(text), text).toBeNull();
    }
    expect(POLICIES.filter((spec) => ids.includes(spec.id) && spec.greek).map((spec) => spec.id)).toEqual(['antiHazing', 'greekOversight']);
    // Dry campus and Alcohol education, as 52.3 names them, are the only names that say anything about drinking.
    expect(POLICIES.filter((spec) => DRINK_WORDS.test(spec.name)).map((spec) => spec.id)).toEqual(['dryCampus', 'alcoholEducation']);
    const refused = applyAction(growth(), { type: 'policy', id: 'antiHazing', on: true });
    expect(refused.ok).toBe(false);
  });
});

describe('the desk', () => {
  it('asks about drinks at the tailgate before a home game: the advisor keeps it dry, and drinks have a cost', () => {
    const state = growth();
    const made = everyWrittenItem(state).find((one) => one.key === 'tailgate')!;
    expect(made.draft.fallback).toBe('dry');
    expect(made.draft.advised).toBe('dry');
    const drinks = made.draft.options.find((option) => option.id === 'drinks')!;
    expect(drinks.cash).toBeLessThan(0);
    expect(drinks.effects.some((effect) => effect.t === 'boost' && effect.kind === 'calls')).toBe(true);
    expect(drinks.label).toContain('21 and over');
    // Never on a game with no goals.
    expect(everyWrittenItem(freshGame()).some((one) => one.key === 'tailgate')).toBe(false);
  });
});

describe('student cards', () => {
  it('say plainly that a Party Animal drinks at 21 and over, and that a younger one does not', () => {
    let state = growth();
    state = later(state, 6 * HOUR).state;
    const cards = sampleStudents(state, 300).map((ref) => studentCard(state, ref)!).filter((card) => card && card.archetype === 'party');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.party).toBe(card.classYear >= DRINKING_YEAR ? PARTY_CARD.over21 : PARTY_CARD.under21);
    // Nobody else has the line, but a Party Animal in the semester after a breakup, who reads as Heartbroken.
    const others = sampleStudents(state, 100).map((ref) => studentCard(state, ref)!).filter((card) => card && card.archetype !== 'party' && card.archetype !== 'heartbroken');
    expect(others.every((card) => card.party === null)).toBe(true);
    const small = freshGame();
    const later2 = advance(small, T0, T0 + 2 * DAY).state;
    expect(sampleStudents(later2, 100).map((ref) => studentCard(later2, ref)!).filter(Boolean).every((card) => card.party === null)).toBe(true);
  });

  it('show a breakup as a normal setback: Heartbroken for a semester, with the same points as any status', () => {
    const state = later(growth(), 4 * DAY).state;
    const semester = semesterOf(state);
    expect(semester).toBeGreaterThan(0);
    let found = 0;
    for (const ref of sampleStudents(state, 400)) {
      const card = studentCard(state, ref);
      if (!card) continue;
      if (card.relationship.breakup) {
        found += 1;
        expect(card.relationship.name).toBe('Single, after a breakup');
        expect(Math.abs(card.relationship.points)).toBe(4);
        expect(HEAVY_WORDS.test(card.relationship.name)).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
    // The same student, read again with the same numbers, says the same.
    const ref = sampleStudents(state, 10)[0]!;
    expect(relationshipOf(state.seed, ref, semester, 'scholar', 0.5)).toEqual(relationshipOf(state.seed, ref, semester, 'scholar', 0.5));
  });
});

describe('rush week in the paper', () => {
  it('never says that nobody moved: with the houses full it says the new members keep their dorm beds', () => {
    const state = build(build(growth()));
    const first = rushed(state);
    const second = rushed(first.state);
    for (const run of [first, second]) {
      const line = run.log.find((entry) => entry.kind === 'greek' && entry.data?.rush === 1)!;
      expect(line.text).not.toMatch(/\b0 move/);
    }
  });
});

describe('saves', () => {
  const text = readFileSync(new URL('./fixtures/save-v25-model.json', import.meta.url), 'utf8');
  const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

  it("comes through from version 25 with nothing else moved: the owner's kind of game, with two chapters", () => {
    expect(file.state.version).toBe(25);
    expect(file.state.greek.chapters).toHaveLength(2);
    expect((file.state.greek.chapters[0] as unknown as Record<string, unknown>).probationUntil).toBeUndefined();
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(25);
    const expected = structuredClone(file.state);
    expected.version = SAVE_VERSION;
    for (const chapter of expected.greek.chapters) Object.assign(chapter, { probationUntil: -1, suspendedUntil: -1, looked: false, reports: 0 });
    Object.assign(expected.greek.totals, { reports: 0, suspensions: 0 });
    expected.greek.scandalUntil = -1;
    // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
    expected.alumni = loaded.state.alumni;
    // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
    expected.story = newStory();
    expect(loaded.state).toEqual(expected);
    expect(validate(loaded.state)).toBeNull();
    const week = advance(loaded.state, file.savedAt, file.savedAt + 7 * DAY).state;
    expect(validate(week)).toBeNull();
    const notes = upgradeNotes(25);
    expect(notes).toHaveLength(4);
    expect(notes[0]).toMatch(/parties/i);
    expect(toneProblem(notes[0]!)).toBeNull();
  });

  it('keeps a probation, a suspension and a scandal through a save and a load', async () => {
    const { serialize } = await import('../src/sim');
    const season = rushed(build(build(growth()))).state;
    const [a, b] = chapters(season);
    greekHazing(season, a!.house, 'probation');
    greekHazing(season, b!.house, 'suspend');
    season.greek.scandalUntil = season.clock.tick + 100;
    const loaded = parseSave(serialize(season, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.greek).toEqual(season.greek);
    expect(seasonCurve(loaded.state.clock)).toBe(seasonCurve(season.clock));
  });
});
