import { describe, expect, it } from 'vitest';
import { campusSocial, dramaOfTheWeek, gossip, happeningLine, happeningsOf, heavyOfTheWeek, partnerLine, peopleOf, relationshipWords, viewOf, type Happening } from '../src/app/socialView';
import { advance, newGame, sampleStudents, TICK_MS, toneProblem, type GameState, type StudentRef } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { DRINK_WORDS, HEAVY_WORDS } from '../src/sim/config/tone';
import { EVENT, EVENTS, FRIEND_AT, HAPPENING_KINDS, HAPPENINGS_KEPT, HEAVY_EVENTS, KIND, SLOTS, WEB_WEEK_TICKS } from '../src/sim/config/web';
import { classYearOf } from '../src/sim/systems/students';
import { catchUp, census, decodeWeb, encodeWeb, findGroups, HAPPENING_FIELDS, idOf, newWeb, pickRation, refAt, regrow, webWeekOf, type Web } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * The social campus, stop 2 (DESIGN.md 63.6): every card's people from the web, the Campus social page, the drama of
 * the week and the paper's gossip, with at most one heavy item shown in a campus week.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEEK0 = webWeekOf(MODEL);
const YEAR = 1;

/** A campus year lived a week at a time, the paper and the Campus social page read after every week. */
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, WEEK0);
const SHOWN: Array<{ week: number; line: string; heavy: boolean; from: 'paper' | 'drama' }> = [];
for (let w = 1; w <= 52; w++) {
  catchUp(WEB, MODEL, WEEK0 + w);
  const view = viewOf(WEB, false);
  for (const told of gossip(view, MODEL, WEEK0 + w - 1)) SHOWN.push({ week: w, line: told.line, heavy: told.heavy, from: 'paper' });
  const drama = dramaOfTheWeek(view, MODEL);
  if (drama) SHOWN.push({ week: w, line: drama.line, heavy: drama.heavy, from: 'drama' });
}
const VIEW = viewOf(WEB, false);

const enrolled = (ref: StudentRef): boolean => classYearOf(MODEL, ref) !== null;
const key = (ref: StudentRef): string => `${ref.entryYear}:${ref.index}`;

describe('happenings', () => {
  const all = happeningsOf(VIEW);

  it('keep a few of each kind each week, by name, and nothing of the kinds not told', () => {
    expect(all.length).toBeGreaterThan(500);
    const perWeek = new Map<string, number>();
    for (const one of all) {
      expect(HAPPENING_KINDS as readonly number[]).toContain(one.event);
      const k = `${one.week}:${one.event}`;
      perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
      expect(one.people.length).toBe(one.event === EVENT.cheating || one.event === EVENT.triangle ? 3 : 2);
    }
    expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(HAPPENINGS_KEPT);
    // Chosen by the pair's luck: from every class, not the first ring the web holds.
    expect(new Set(all.flatMap((one) => one.people.map((ref) => ref.entryYear))).size).toBe(4);
  });

  it('are the same twice from the seed', () => {
    const again = newWeb(MODEL.seed, 1024);
    catchUp(again, MODEL, WEEK0);
    for (let w = 1; w <= 3; w++) catchUp(again, MODEL, WEEK0 + w);
    const first = newWeb(MODEL.seed, 1024);
    catchUp(first, MODEL, WEEK0);
    for (let w = 1; w <= 3; w++) catchUp(first, MODEL, WEEK0 + w);
    expect(Buffer.from(again.happenings.buffer).equals(Buffer.from(first.happenings.buffer))).toBe(true);
    expect([...again.weekly]).toEqual([...first.weekly]);
    expect([...again.friendGroups.members]).toEqual([...first.friendGroups.members]);
  });

  it('tell couples the cards agree with: a new couple, still together, is dating on both cards', () => {
    const fresh = all.filter((one) => one.event === EVENT.dating && one.week === WEB.week);
    expect(fresh.length).toBeGreaterThan(0);
    for (const one of fresh) {
      const [a, b] = one.people;
      const theirs = peopleOf(VIEW, MODEL, a!).find((p) => key(p.ref) === key(b!));
      if (theirs) expect(['partner', 'ex']).toContain(theirs.role);
    }
  });

  it('are written plainly: no banned word, no drink, and only the heavy ones about breaking up', () => {
    const refs = sampleStudents(MODEL, 3).filter(enrolled).slice(0, 3);
    for (const event of HAPPENING_KINDS) {
      const one: Happening = { week: 0, event, year: YEAR, luck: 0, people: refs };
      const line = happeningLine(MODEL, one);
      expect(line, EVENTS[event]).not.toBeNull();
      expect(toneProblem(line!), line!).toBeNull();
      expect(DRINK_WORDS.test(line!), line!).toBe(false);
      if (!HEAVY_EVENTS.includes(event)) expect(HEAVY_WORDS.test(line!), line!).toBe(false);
    }
  });
});

describe('the heavy ration', () => {
  it('shows at most one heavy item in a campus week, in the paper and the drama of the week together', () => {
    const heavy = new Set(SHOWN.filter((one) => one.heavy).map((one) => one.line));
    expect(heavy.size).toBeLessThanOrEqual(1);
    // Read every three hours for a whole campus week, the paper still had plenty to tell.
    expect(SHOWN.filter((one) => !one.heavy && one.from === 'paper').length).toBeGreaterThan(100);
    // And the web did have more heavy happenings than the one it may show.
    expect(happeningsOf(VIEW).filter((one) => HEAVY_EVENTS.includes(one.event)).length).toBeGreaterThan(10);
  });

  it('is the first heavy happening of the campus week, shown in the paper once and as the drama of the week', () => {
    const pick = heavyOfTheWeek(VIEW, YEAR)!;
    expect(pick).not.toBeNull();
    const earliest = happeningsOf(VIEW).filter((one) => HEAVY_EVENTS.includes(one.event) && one.year === YEAR);
    expect(pick.week).toBe(Math.min(...earliest.map((one) => one.week)));
    const line = happeningLine(MODEL, pick);
    if (line) {
      expect(SHOWN.filter((one) => one.from === 'paper' && one.line === line).length).toBeLessThanOrEqual(1);
      expect(dramaOfTheWeek(VIEW, MODEL)?.line).toBe(line);
    }
  });

  it('is kept when the web is grown again, and a new campus week picks its own', () => {
    const copy = decodeWeb(encodeWeb(WEB), MODEL)!;
    copy.calYear = YEAR;
    regrow(copy, MODEL);
    expect(copy.happenings.every((v) => v === -1)).toBe(true);
    expect([...copy.ration]).toEqual([...WEB.ration]);
    pickRation(copy);
    expect([...copy.ration]).toEqual([...WEB.ration]);
    // A new campus week: nothing heavy has happened in it yet, so nothing heavy may be shown.
    copy.calYear = YEAR + 1;
    pickRation(copy);
    expect(copy.rationFor).toBe(YEAR + 1);
    expect(copy.ration.every((v) => v === -1)).toBe(true);
    expect(heavyOfTheWeek(viewOf(copy, false), YEAR)).toBeNull();
  });

  it('never tells the main character’s romances: their story does (stop 7)', () => {
    const pick = heavyOfTheWeek(VIEW, YEAR)!;
    const withMain = structuredClone(MODEL) as GameState;
    (withMain.story as { mc: unknown }).mc = { ...(MODEL.story.mc ?? {}), ref: pick.people[0] };
    expect(dramaOfTheWeek(VIEW, withMain)?.people.some((ref) => key(ref) === key(pick.people[0]!)) ?? false).toBe(false);
    for (const told of gossip(VIEW, withMain, -1, 50)) expect(told.people.some((ref) => key(ref) === key(pick.people[0]!))).toBe(false);
  });
});

describe('a card’s people', () => {
  const sample = sampleStudents(MODEL, 120).filter((ref) => idOf(WEB, ref) >= 0);

  it('are their real ties, in order: partner, best friend, roommate, friends from the closest, an ex, a rival', () => {
    const order = ['partner', 'best', 'roommate', 'friend', 'ex', 'rival'];
    let shown = 0;
    for (const ref of sample) {
      const list = peopleOf(VIEW, MODEL, ref);
      expect(list.length).toBeLessThanOrEqual(8);
      const id = idOf(WEB, ref);
      let last = -1;
      let lastFriend = 256;
      for (const one of list) {
        expect(enrolled(one.ref)).toBe(true);
        const at = order.indexOf(one.role);
        expect(at).toBeGreaterThanOrEqual(last);
        last = at;
        if (one.role === 'friend') {
          expect(one.strength).toBeLessThanOrEqual(lastFriend);
          lastFriend = one.strength;
        }
        // The tie is there in the web, of the kind the face says.
        const other = idOf(WEB, one.ref);
        let s = -1;
        for (let k = 0; k < SLOTS; k++) if (WEB.other[id * SLOTS + k] === other) s = id * SLOTS + k;
        expect(s).toBeGreaterThanOrEqual(0);
        const kind = WEB.kind[s]!;
        if (one.role === 'partner') expect([KIND.dating, KIND.exclusive, KIND.longterm]).toContain(kind);
        if (one.role === 'roommate') expect(kind).toBe(KIND.roommate);
        if (one.role === 'ex') expect(kind).toBe(KIND.ex);
        shown += 1;
      }
      expect(list.filter((one) => one.role === 'best').length).toBeLessThanOrEqual(1);
      expect(list.filter((one) => one.role === 'roommate').length).toBeLessThanOrEqual(1);
    }
    expect(shown).toBeGreaterThan(sample.length * 3);
  });

  it('say whom they are dating, and otherwise the status they arrived with', () => {
    const dating = sample.find((ref) => partnerLine(VIEW, MODEL, ref) !== null)!;
    expect(dating).toBeDefined();
    const line = partnerLine(VIEW, MODEL, dating)!;
    expect(line.text).toMatch(/^(Dating|Together with|Together a long while with) /);
    const seeded = { id: 'singleHappy', name: 'Happily single', note: 'a little happier' };
    expect(relationshipWords(VIEW, MODEL, dating, seeded).name).toBe(line.text);
    // Before the web answers, the card reads as it always has.
    expect(relationshipWords(null, MODEL, dating, seeded)).toEqual({ name: 'Happily single', note: 'a little happier' });
    // Someone the old status had in a couple, with nobody on campus in the web: single, happily or looking.
    const single = sample.find((ref) => partnerLine(VIEW, MODEL, ref) === null)!;
    expect(relationshipWords(VIEW, MODEL, single, { id: 'togetherHappy', name: 'In a happy relationship', note: 'n' }).name).toBe('Happily single');
    expect(relationshipWords(VIEW, MODEL, single, { id: 'togetherUnhappy', name: 'In an unhappy relationship', note: 'n' }).name).toBe('Single and looking');
    expect(relationshipWords(VIEW, MODEL, single, { id: 'distanceHappy', name: 'Happy long-distance', note: 'n' }).name).toBe('Happy long-distance');
  });
});

describe('friend groups', () => {
  it('are three to six friends, each in one group, each a friend of someone else in it', () => {
    const groups = WEB.friendGroups.start.length - 1;
    expect(groups).toBeGreaterThan(5000);
    const seen = new Set<number>();
    for (let g = 0; g < groups; g++) {
      const members = [...WEB.friendGroups.members.subarray(WEB.friendGroups.start[g]!, WEB.friendGroups.start[g + 1]!)];
      expect(members.length).toBeGreaterThanOrEqual(3);
      expect(members.length).toBeLessThanOrEqual(6);
      for (const m of members) {
        expect(seen.has(m)).toBe(false);
        seen.add(m);
        expect(WEB.groupOf[m]).toBe(g);
        let friends = 0;
        for (let k = 0; k < SLOTS; k++) {
          const s = m * SLOTS + k;
          if (members.includes(WEB.other[s]!) && WEB.strength[s]! >= FRIEND_AT) friends += 1;
        }
        expect(friends).toBeGreaterThanOrEqual(1);
      }
    }
    const again: Web = decodeWeb(encodeWeb(WEB), MODEL)!;
    findGroups(again);
    expect([...again.friendGroups.start].length).toBeGreaterThan(0);
  });
});

describe('the Campus social page', () => {
  const social = campusSocial(VIEW, MODEL);

  it('counts couples and groups as the web holds them, and this week from its weeks', () => {
    const kinds = census(WEB);
    expect(social.couples).toBe(kinds[KIND.dating]! + kinds[KIND.exclusive]! + kinds[KIND.longterm]!);
    expect(social.groups).toBe(WEB.friendGroups.start.length - 1);
    expect(social.inGroups).toBeGreaterThan(0.3);
    expect(social.inGroups).toBeLessThan(1);
    let couples = 0;
    let splits = 0;
    for (let row = 0; row < WEB.weeklyWeek.length; row++) {
      if (WEB.weeklyWeek[row]! < 0 || WEB.weeklyYear[row] !== YEAR) continue;
      couples += WEB.weekly[row * EVENTS.length + EVENT.dating]! + WEB.weekly[row * EVENTS.length + EVENT.backTogether]!;
      splits += WEB.weekly[row * EVENTS.length + EVENT.splitMutual]! + WEB.weekly[row * EVENTS.length + EVENT.splitMessy]!;
    }
    expect(social.week.couples).toBe(couples);
    expect(social.week.splits).toBe(splits);
    expect(couples).toBeGreaterThan(0);
  });

  it('names the most popular, the week’s news and the biggest groups: students still here, nothing heavy but the drama', () => {
    expect(social.popular).toHaveLength(5);
    // Ranked by reach, friends and friends' friends, which spreads out: a count of friends stops at twelve.
    for (let i = 1; i < 5; i++) expect(social.popular[i - 1]!.known).toBeGreaterThanOrEqual(social.popular[i]!.known);
    expect(social.popular[0]!.known).toBeGreaterThan(40);
    expect(new Set(social.popular.map((one) => one.known)).size).toBeGreaterThan(1);
    for (const one of social.popular) expect(one.known).toBeGreaterThan(one.friends);
    expect(social.lines.length).toBeGreaterThan(0);
    for (const told of social.lines) {
      expect(told.heavy).toBe(false);
      expect(told.people.every(enrolled)).toBe(true);
    }
    expect(social.groups3).toHaveLength(3);
    for (const group of social.groups3) {
      expect(group.members.length).toBeGreaterThanOrEqual(3);
      expect(group.vibe).toMatch(/^(the |a group)/);
    }
    expect(social.drama).not.toBeNull();
  });
});

describe('the record, version 2', () => {
  it('keeps the weeks, the happenings and the week’s heavy pick, and still reads a version 1 record whole', () => {
    const bytes = encodeWeb(WEB);
    const read = decodeWeb(bytes, MODEL)!;
    expect(Buffer.from(read.happenings.buffer).equals(Buffer.from(WEB.happenings.buffer))).toBe(true);
    expect([...read.weekly]).toEqual([...WEB.weekly]);
    expect([...read.ration]).toEqual([...WEB.ration]);
    expect(read.rationFor).toBe(WEB.rationFor);
    // Version 1, as stop 1 wrote it: the header, the counts, then the slots.
    const slots = WEB.n * SLOTS;
    const head = 64 + EVENTS.length * 8;
    const v1 = new Uint8Array(head + slots * 9);
    v1.set(bytes.subarray(0, head));
    new Int32Array(v1.buffer, 0, 16).set([1], 1);
    v1.set(bytes.subarray(bytes.byteLength - slots * 9), head);
    const old = decodeWeb(v1, MODEL)!;
    expect(old).not.toBeNull();
    expect(Buffer.from(old.other.buffer).equals(Buffer.from(WEB.other.buffer))).toBe(true);
    expect(old.happenings.every((v) => v === -1)).toBe(true);
    // Read back, it carries on a week at a time, as stop 1's did.
    expect(catchUp(old, MODEL, WEB.week + 1)).toEqual({ lived: 1, regrown: false });
    expect(happeningsOf(viewOf(old, false)).length).toBeGreaterThan(0);
    expect(refAt(old, 0)).toEqual(refAt(WEB, 0));
    expect(HAPPENING_FIELDS).toBe(10);
  });
});

describe('couples over the years', () => {
  it('hold level from year to year, played every day, and a long absence comes back close to it', () => {
    // The model campus, about two game years, a game week at a time, through commencements and move-ins.
    const WEEK_MS = WEB_WEEK_TICKS * TICK_MS;
    let state = newGame({ seed: 20261112, name: 'Test University', now: T0, campus: 'model' });
    let at = T0;
    const web = newWeb(state.seed, 1024);
    const seen: Array<{ year: number; phase: string; per1000: number; regrown?: number }> = [];
    for (let w = 0; w < 100; w++) {
      state = advance(state, at, at + WEEK_MS).state;
      at += WEEK_MS;
      catchUp(web, state, webWeekOf(state));
      const kinds = census(web);
      const enrolled = state.cohorts.reduce((a, b) => a + b, 0);
      const row: (typeof seen)[number] = { year: calendarAt(state.clock).year, phase: calendarAt(state.clock).phase, per1000: ((kinds[KIND.dating]! + kinds[KIND.exclusive]! + kinds[KIND.longterm]!) / enrolled) * 1000 };
      // At year two's commencement: what half a year away would bring back, grown again and its last weeks lived.
      if (w === 95) {
        const copy = decodeWeb(encodeWeb(web), state)!;
        copy.week = webWeekOf(state) - 26;
        catchUp(copy, state, webWeekOf(state));
        const back = census(copy);
        row.regrown = ((back[KIND.dating]! + back[KIND.exclusive]! + back[KIND.longterm]!) / enrolled) * 1000;
      }
      seen.push(row);
    }
    const first = (year: number, phase: string): number => seen.find((one) => one.year === year && one.phase === phase)!.per1000;
    for (const phase of ['fall', 'spring', 'graduation']) {
      const one = first(1, phase);
      const two = first(2, phase);
      expect(Math.abs(two - one) / one, phase).toBeLessThan(0.12);
    }
    // Lower as the fall begins (the first-years know no one yet), higher by spring.
    expect(first(2, 'spring')).toBeGreaterThan(first(2, 'fall') * 1.1);
    const away = seen.find((one) => one.regrown !== undefined)!;
    expect(Math.abs(away.regrown! - away.per1000) / away.per1000).toBeLessThan(0.15);
    // Two game years of the campus itself take a while.
  }, 90_000);
});
