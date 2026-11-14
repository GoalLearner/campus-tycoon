import { describe, expect, it } from 'vitest';
import { itemAt, regularDay, sleepHours } from '../src/app/regularDay';
import { happenedTo, heavyOfTheWeek, peopleOf, viewOf } from '../src/app/socialView';
import { advance, applyAction, newGame, parseSave, sampleStudents, serialize, studentCard, toneProblem, type GameState, type StudentRef } from '../src/sim';
import { calendarAt, dateAt } from '../src/sim/calendar';
import { HEAVY_WORDS } from '../src/sim/config/tone';
import { HEAVY_EVENTS } from '../src/sim/config/web';
import { FOLLOWED_KEPT, MEMORY_KEPT, NAMED_FROM, NAMED_PER_CLASS, namedRegulars, promoteRegular, regularRecord, regularsNow, regularWhy, rememberRegular } from '../src/sim/systems/regulars';
import { dayRead } from '../src/sim/systems/season';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * Regulars and the followed student's day, stop 5 (DESIGN.md 63.9): two named by the seed in every class, anyone the
 * player follows, and the Main Character; their day from waking to sleep; what the map showed happening to them.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, webWeekOf(MODEL));
const VIEW = viewOf(WEB, false);
const SAMPLE = sampleStudents(MODEL, 30);
const key = (ref: StudentRef): string => `${ref.entryYear}:${ref.index}`;

describe('regulars', () => {
  it('are two named in every class, from its first students, the same all their years', () => {
    const named = namedRegulars(MODEL);
    expect(named).toHaveLength(4 * NAMED_PER_CLASS);
    for (const ref of named) expect(ref.index).toBeLessThan(NAMED_FROM);
    const year = calendarAt(MODEL.clock).year;
    expect(new Set(named.map((one) => one.entryYear))).toEqual(new Set([year, year - 1, year - 2, year - 3]));
    // A day later, the same.
    const later = advance(MODEL, MODEL.clock.lastSimulatedAt, MODEL.clock.lastSimulatedAt + DAY / 2).state;
    expect(namedRegulars(later)).toEqual(named);
    expect(named.every((ref) => regularWhy(MODEL, ref) === 'named')).toBe(true);
  });

  it('take in anyone followed, kept from then on, at most thirty, the oldest giving way', () => {
    const state = structuredClone(MODEL) as GameState;
    const ref = SAMPLE.find((one) => regularWhy(state, one) === null)!;
    expect(regularWhy(state, ref)).toBeNull();
    const done = applyAction(state, { type: 'promoteRegular', ref });
    expect(done.ok).toBe(true);
    const next = done.ok ? done.state : state;
    expect(regularWhy(next, ref)).toBe('followed');
    expect(regularsNow(next)[0]).toEqual({ ref, why: 'followed' });
    expect(applyAction(next, { type: 'promoteRegular', ref: { entryYear: 99, index: 0 } }).ok).toBe(false);
    // Thirty-one followed: the first gives way.
    const many = structuredClone(MODEL) as GameState;
    const refs = sampleStudents(many, 40).slice(0, FOLLOWED_KEPT + 1);
    refs.forEach((one, i) => {
      many.clock.tick += i;
      expect(promoteRegular(many, one)).toBeNull();
    });
    expect(regularWhy(many, refs[refs.length - 1]!)).toBe('followed');
    expect((many.web.regulars ?? []).filter((one) => one.followed)).toHaveLength(FOLLOWED_KEPT);
    expect(regularWhy(many, refs[0]!)).not.toBe('followed');
  });

  it('remember what the map showed, a short memory, for regulars only, once for the same thing twice', () => {
    const state = structuredClone(MODEL) as GameState;
    const named = namedRegulars(state)[0]!;
    const stranger = SAMPLE.find((one) => regularWhy(state, one) === null)!;
    expect(rememberRegular(state, stranger, 'Waved at Sam')).not.toBeNull();
    for (let i = 0; i < MEMORY_KEPT + 5; i++) {
      state.clock.tick += 1;
      expect(rememberRegular(state, named, `Waved at Sam ${i}`)).toBeNull();
    }
    expect(rememberRegular(state, named, `Waved at Sam ${MEMORY_KEPT + 4}`)).toBeNull();
    const memory = regularRecord(state, named)!.memory;
    expect(memory).toHaveLength(MEMORY_KEPT);
    expect(memory.at(-1)!.text).toBe(`Waved at Sam ${MEMORY_KEPT + 4}`);
    expect(rememberRegular(state, named, 'x'.repeat(400))).toBeNull();
    expect(regularRecord(state, named)!.memory.at(-1)!.text.length).toBeLessThanOrEqual(120);
  });

  it('are kept through a save and a load, and a save from before has none and works', () => {
    const state = structuredClone(MODEL) as GameState;
    const ref = SAMPLE.find((one) => regularWhy(state, one) === null)!;
    promoteRegular(state, ref);
    rememberRegular(state, ref, 'High-fived Sam and talked about music');
    const back = parseSave(serialize(state, T0 + DAY));
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.web.regulars).toEqual(state.web.regulars);
    const before = structuredClone(MODEL) as GameState;
    delete before.web.regulars;
    const old = parseSave(serialize(before, T0 + DAY));
    if (!old.ok) throw new Error(old.reason);
    expect(regularsNow(old.state).length).toBe(4 * NAMED_PER_CLASS);
    expect(regularRecord(old.state, ref)).toBeNull();
  });
});

describe('a regular’s day', () => {
  const days = SAMPLE.slice(0, 20).map((ref) => ({ ref, card: studentCard(MODEL, ref)!, day: regularDay(VIEW, MODEL, ref, studentCard(MODEL, ref)!) }));

  it('runs from waking to sleep in order, ready first and asleep last, as Look inside has their hours', () => {
    for (const { card, day } of days) {
      expect(day.length).toBeGreaterThan(5);
      const [sleep, wake] = sleepHours(card);
      expect(day[0]!.words).toBe('Getting ready');
      expect(day[0]!.from % 24).toBeGreaterThanOrEqual(wake);
      expect(day.at(-1)!.words).toBe('Asleep');
      // One after another with no gaps: every hour awake is something.
      for (let i = 1; i < day.length; i++) expect(day[i]!.from).toBeCloseTo(day[i - 1]!.to, 9);
      for (let h = day[0]!.from; h < day.at(-1)!.from; h += 0.25) expect(itemAt(day, h % 24)?.words === 'Asleep' && h < day.at(-1)!.from - 0.01 && h % 24 >= day[0]!.from).toBe(false);
      // Asleep at the hours their room shows them asleep.
      const mid = ((sleep + (wake < sleep ? wake + 24 : wake)) / 2) % 24;
      expect(itemAt(day, mid)?.words).toBe('Asleep');
    }
  });

  it('has classes on a weekday, none at the weekend, and only real people by name', () => {
    const weekday = dateAt(MODEL.clock).weekday;
    expect(dayRead(MODEL.clock).kind === 'break' || dayRead(MODEL.clock).kind === 'summer').toBe(false);
    for (const { ref, day } of days) {
      const classes = day.filter((one) => one.where === 'class');
      if (weekday === 0 || weekday === 6) expect(classes).toHaveLength(0);
      else expect(classes.length).toBeGreaterThanOrEqual(2);
      const theirs = new Set(peopleOf(VIEW, MODEL, ref).map((one) => key(one.ref)));
      for (const item of day) for (const one of item.with) expect(theirs.has(key(one))).toBe(true);
    }
  });

  it('is the same every time, works before the web answers, and says everything plainly', () => {
    for (const { ref, card, day } of days) {
      expect(regularDay(VIEW, MODEL, ref, card)).toEqual(day);
      const alone = regularDay(null, MODEL, ref, card);
      expect(alone.every((one) => one.with.length === 0)).toBe(true);
      for (const item of [...day, ...alone]) {
        expect(toneProblem(item.words), item.words).toBeNull();
        expect(HEAVY_WORDS.test(item.words), item.words).toBe(false);
      }
    }
  });

  it('is away from campus on a break', () => {
    // Forward to the first break of the year.
    let state = MODEL;
    let at = MODEL.clock.lastSimulatedAt;
    for (let n = 0; n < 12 && dayRead(state.clock).kind !== 'break'; n++) {
      state = advance(state, at, at + DAY / 2).state;
      at += DAY / 2;
    }
    expect(dayRead(state.clock).kind).toBe('break');
    const ref = sampleStudents(state, 1)[0]!;
    const day = regularDay(null, state, ref, studentCard(state, ref)!);
    expect(day).toHaveLength(1);
    expect(day[0]!.where).toBe('away');
  });
});

describe('what happened to them', () => {
  it('is what the web knows about them, light, and heavy only when it is the week’s one heavy item', () => {
    let told = 0;
    const heavy = heavyOfTheWeek(VIEW, calendarAt(MODEL.clock).year);
    for (const ref of sampleStudents(MODEL, 400)) {
      for (const one of happenedTo(VIEW, MODEL, ref, 6)) {
        expect(one.people.some((p) => key(p) === key(ref))).toBe(true);
        if (one.heavy) expect(heavy && heavy.people.some((p) => key(p) === key(ref))).toBe(true);
        told += 1;
      }
    }
    expect(told).toBeGreaterThan(0);
    expect(HEAVY_EVENTS.length).toBe(3);
  });
});
