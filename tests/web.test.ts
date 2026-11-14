import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roomFor } from '../src/app/room';
import { socialWeb } from '../src/app/socialWeb';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { packRecord, unpackRecord } from '../src/app/webRecord';
import { advance, newGame, parseSave, sampleStudents, SAVE_VERSION, serialize, studentCard, toneProblem, validate, type GameState, type StudentRef } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { MEN_NAMES, NEUTRAL_EXTRA, WOMEN_NAMES } from '../src/sim/config/names';
import { FIRST_NAMES } from '../src/sim/config/students';
import { CATCHUP_FULL_WEEKS, EVENTS, KIND, REGROW_LIVED_WEEKS, SLOTS } from '../src/sim/config/web';
import { gender, genderOf } from '../src/sim/systems/identity';
import { firstNameOf, namedFresh, studentName } from '../src/sim/systems/students';
import { catchUp, census, decodeWeb, encodeWeb, idOf, newWeb, refAt, tiesOf, webRoommate, webWeekOf, type Web } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * The social web, stop 1 (DESIGN.md 63.5): every student's ties on typed arrays, stepped a game week at a time in a
 * worker, kept in a record of its own; roommates of a gender; and wider first names for students who arrive from now
 * on, with nobody who already exists renamed.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;

const grown = (state: GameState, week = webWeekOf(state)): Web => {
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, week);
  return web;
};
const WEB = grown(MODEL);

const SAVED: (keyof Web)[] = ['other', 'kind', 'strength', 'feeling', 'seen'];
const same = (a: Web, b: Web): void => {
  expect(a.week).toBe(b.week);
  expect(a.ring).toEqual(b.ring);
  for (const key of SAVED) expect(Buffer.from((a[key] as Uint8Array).buffer).equals(Buffer.from((b[key] as Uint8Array).buffer)), String(key)).toBe(true);
};

const fits = (seed: number, ref: StudentRef, name: string): boolean => {
  const g = genderOf(seed, ref);
  return g === 0 ? WOMEN_NAMES.includes(name) : g === 1 ? MEN_NAMES.includes(name) : FIRST_NAMES.includes(name) || NEUTRAL_EXTRA.includes(name);
};

describe('first names', () => {
  const text = readFileSync(new URL('./fixtures/save-v29-model.json', import.meta.url), 'utf8');
  const before = JSON.parse(readFileSync(new URL('./fixtures/names-v29-model.json', import.meta.url), 'utf8')) as {
    count: number;
    digest: number;
    sample: [number, number, string][];
  };
  const loaded = parseSave(text);
  if (!loaded.ok) throw new Error(loaded.reason);
  const OLD = loaded.state;

  it('are the lists the brief asked for: two hundred for women, two hundred for men, none on both', () => {
    expect(WOMEN_NAMES).toHaveLength(200);
    expect(MEN_NAMES).toHaveLength(200);
    expect(new Set(WOMEN_NAMES).size).toBe(200);
    expect(new Set(MEN_NAMES).size).toBe(200);
    expect(WOMEN_NAMES.filter((name) => MEN_NAMES.includes(name))).toEqual([]);
    expect(NEUTRAL_EXTRA.filter((name) => WOMEN_NAMES.includes(name) || MEN_NAMES.includes(name) || FIRST_NAMES.includes(name))).toEqual([]);
  });

  it('are unchanged for every one of the 46,000 students of a version 29 save, as main named them', () => {
    // tests/fixtures/names-v29-model.json was written by main's own code (save v29) from this same save.
    const year = calendarAt(OLD.clock).year;
    let digest = 0x811c9dc5;
    let count = 0;
    for (let c = 0; c < 4; c++) {
      for (let index = 0; index < OLD.cohorts[c]!; index++) {
        const ref = { entryYear: year - c, index };
        expect(namedFresh(OLD, ref)).toBe(false);
        const line = `${ref.entryYear}:${index}:${studentName(OLD, ref)}\n`;
        for (let i = 0; i < line.length; i++) digest = Math.imul(digest ^ line.charCodeAt(i), 0x01000193);
        count += 1;
      }
    }
    expect(count).toBe(before.count);
    expect(digest >>> 0).toBe(before.digest);
    for (const [entryYear, index, name] of before.sample) expect(studentCard(OLD, { entryYear, index })!.name).toBe(name);
  });

  it('are unchanged for the main character, and the story keeps the names it saved', () => {
    const mc = OLD.story.mc!;
    expect(mc.name).toBe('Kit Wrenley');
    expect(studentCard(OLD, mc.ref)!.name).toBe('Kit Wrenley');
    const file = JSON.parse(text) as { state: GameState };
    expect(OLD.story.mc!.cast.map((one) => one.name)).toEqual(file.state.story.mc!.cast.map((one) => one.name));
  });

  it('stay unchanged as the upgraded game plays on, and the students who arrive after it get names that fit them', () => {
    const later = advance(OLD, OLD.clock.lastSimulatedAt, OLD.clock.lastSimulatedAt + 2 * DAY).state;
    const year = calendarAt(later.clock).year;
    let kept = 0;
    for (const [entryYear, index, name] of before.sample) {
      const c = year - entryYear;
      if (c < 0 || c > 3 || index >= later.cohorts[c]!) continue;
      expect(studentCard(later, { entryYear, index })!.name).toBe(name);
      kept += 1;
    }
    expect(kept).toBeGreaterThan(1500);
    expect(studentCard(later, OLD.story.mc!.ref)!.name).toBe('Kit Wrenley');
    // The spring class joins the first-years after the save's last student: they, and only they, are new.
    const first = later.web.namesFrom;
    expect(first).toEqual({ entryYear: calendarAt(OLD.clock).year, index: OLD.cohorts[0] });
    const arrived = later.cohorts[0]! - OLD.cohorts[0]!;
    expect(arrived).toBeGreaterThan(100);
    for (let index = OLD.cohorts[0]!; index < later.cohorts[0]!; index += 7) {
      const ref = { entryYear: first.entryYear, index };
      expect(namedFresh(later, ref)).toBe(true);
      expect(fits(later.seed, ref, firstNameOf(later, ref)), firstNameOf(later, ref)).toBe(true);
    }
  });

  it('fit every student of a new game, and repeat on a dorm floor three times at most', () => {
    expect(MODEL.web.namesFrom.entryYear).toBe(-1000);
    let women = 0;
    let men = 0;
    const sample = sampleStudents(MODEL, 1000);
    for (const ref of sample) {
      expect(namedFresh(MODEL, ref)).toBe(true);
      const name = firstNameOf(MODEL, ref);
      expect(fits(MODEL.seed, ref, name), name).toBe(true);
      expect(studentCard(MODEL, ref)!.name.startsWith(`${name} `)).toBe(true);
      const g = genderOf(MODEL.seed, ref);
      if (g === 0) women += 1;
      if (g === 1) men += 1;
    }
    // About 58% of undergraduates are women (National Student Clearinghouse); 2% here are nonbinary.
    expect(women / sample.length).toBeGreaterThan(0.53);
    expect(women / sample.length).toBeLessThan(0.59);
    expect(men / sample.length).toBeGreaterThan(0.39);
    const floors = WEB.groups[0]!;
    let worst = 0;
    for (let key = 0; key + 1 < floors.start.length; key++) {
      const seen = new Map<string, number>();
      for (let i = floors.start[key]!; i < floors.start[key + 1]!; i++) {
        const name = firstNameOf(MODEL, refAt(WEB, floors.members[i]!));
        seen.set(name, (seen.get(name) ?? 0) + 1);
        worst = Math.max(worst, seen.get(name)!);
      }
    }
    expect(worst).toBeLessThanOrEqual(3);
  });
});

describe('roommates', () => {
  it('in the web are two of a gender on one floor, each with one roommate at most', () => {
    let pairs = 0;
    for (let a = 0; a < WEB.n; a++) {
      let mates = 0;
      for (let k = 0; k < SLOTS; k++) {
        const s = a * SLOTS + k;
        const b = WEB.other[s]!;
        if (b < 0 || WEB.kind[s] !== KIND.roommate) continue;
        mates += 1;
        expect(gender(WEB.identity[a]!)).toBe(gender(WEB.identity[b]!));
        expect(WEB.place[0]![a]).toBe(WEB.place[0]![b]);
        expect(WEB.place[0]![a]).toBeGreaterThanOrEqual(0);
        if (b > a) pairs += 1;
      }
      expect(mates).toBeLessThanOrEqual(1);
    }
    expect(pairs).toBeGreaterThan(5000);
    expect(census(WEB)[KIND.roommate]).toBe(pairs);
  });

  it('for a nonbinary student is another nonbinary student on their floor, or nobody: a room of their own', () => {
    let nonbinary = 0;
    let paired = 0;
    for (let a = 0; a < WEB.n; a++) {
      if (WEB.year[a]! < 0 || gender(WEB.identity[a]!) !== 2) continue;
      nonbinary += 1;
      const mate = webRoommate(WEB, refAt(WEB, a));
      if (!mate) continue;
      paired += 1;
      expect(gender(WEB.identity[idOf(WEB, mate)]!)).toBe(2);
    }
    expect(nonbinary).toBeGreaterThan(300);
    expect(paired).toBeGreaterThan(0);
    expect(paired).toBeLessThan(nonbinary);
  });

  it('in the room view are of a gender, from the seed before the web answers and from the web after', () => {
    const residents = sampleStudents(MODEL, 200).filter((ref) => studentCard(MODEL, ref)?.residence === 'dorm');
    const looks = { crowd: 16, look: () => 0 };
    socialWeb.view = null;
    let seeded = 0;
    for (const ref of residents) {
      const mate = roomFor(MODEL, ref, 12, looks)?.roommate;
      if (!mate) continue;
      seeded += 1;
      expect(genderOf(MODEL.seed, mate.ref)).toBe(genderOf(MODEL.seed, ref));
    }
    expect(seeded).toBeGreaterThan(20);
    socialWeb.view = { seed: WEB.seed, classSlot: WEB.classSlot, ring: [...WEB.ring], week: WEB.week, other: WEB.other, kind: WEB.kind, strength: WEB.strength, feeling: WEB.feeling, identity: WEB.identity };
    try {
      let fromWeb = 0;
      for (const ref of residents) {
        const room = roomFor(MODEL, ref, 12, looks)!;
        const mate = webRoommate(WEB, ref);
        if (!room.roommate) continue;
        expect(room.roommate.ref).toEqual(mate);
        expect(genderOf(MODEL.seed, mate!)).toBe(genderOf(MODEL.seed, ref));
        fromWeb += 1;
      }
      expect(fromWeb).toBeGreaterThan(20);
    } finally {
      socialWeb.view = null;
    }
  });
});

describe('the web', () => {
  it('holds each tie at both ends, the same strength and week together, a crush on one end only', () => {
    for (let s = 0; s < WEB.n * SLOTS; s++) {
      const b = WEB.other[s]!;
      if (b < 0) continue;
      const a = Math.floor(s / SLOTS);
      const back = WEB.back[s]!;
      expect(WEB.other[back]).toBe(a);
      expect(WEB.strength[back]).toBe(WEB.strength[s]);
      expect(WEB.seen[back]).toBe(WEB.seen[s]);
      if (WEB.kind[s] !== KIND.crush && WEB.kind[back] !== KIND.crush) expect(WEB.kind[back]).toBe(WEB.kind[s]);
    }
  });

  it('has friends, couples, exes and roommates after a first catch-up, and reads them as a card would', () => {
    const kinds = census(WEB);
    expect(kinds[KIND.friend]).toBeGreaterThan(50_000);
    expect(kinds[KIND.dating]! + kinds[KIND.exclusive]! + kinds[KIND.longterm]!).toBeGreaterThan(500);
    expect(kinds[KIND.ex]).toBeGreaterThan(0);
    const someone = sampleStudents(MODEL, 50).find((ref) => tiesOf(WEB, ref).length >= 3)!;
    const ties = tiesOf(WEB, someone);
    for (let i = 1; i < ties.length; i++) expect(ties[i - 1]!.strength).toBeGreaterThanOrEqual(ties[i]!.strength);
  });

  it('comes out the same however it is stepped: twice from the seed, a week at a time, or read back from its record', () => {
    const week = webWeekOf(MODEL);
    same(grown(MODEL), WEB);
    const once = grown(MODEL);
    catchUp(once, MODEL, week + 3);
    const weekly = grown(MODEL);
    for (let w = 1; w <= 3; w++) catchUp(weekly, MODEL, week + w);
    same(weekly, once);
    const read = decodeWeb(encodeWeb(WEB), MODEL)!;
    same(read, WEB);
    expect([...read.events]).toEqual([...WEB.events]);
    for (let s = 0; s < WEB.n * SLOTS; s++) if (WEB.other[s]! >= 0) expect(read.back[s]).toBe(WEB.back[s]);
    catchUp(read, MODEL, week + 3);
    same(read, once);
  });

  it('is caught up week by week after a short absence, and regrown with its last weeks lived after a long one', () => {
    const week = webWeekOf(MODEL);
    expect(catchUp(grown(MODEL), MODEL, week)).toEqual({ lived: 0, regrown: false });
    expect(catchUp(grown(MODEL), MODEL, week + CATCHUP_FULL_WEEKS)).toEqual({ lived: CATCHUP_FULL_WEEKS, regrown: false });
    expect(catchUp(grown(MODEL), MODEL, week + CATCHUP_FULL_WEEKS + 1)).toEqual({ lived: REGROW_LIVED_WEEKS, regrown: true });
    // Thirty real days away: 223 game weeks.
    const away = grown(MODEL);
    expect(catchUp(away, MODEL, week + 223)).toEqual({ lived: REGROW_LIVED_WEEKS, regrown: true });
    expect(away.week).toBe(week + 223);
    expect(catchUp(decodeWeb(encodeWeb(WEB), MODEL)!, MODEL, week + 2)).toEqual({ lived: 2, regrown: false });
    // A brand-new web is grown, not stepped from nobody knowing anybody.
    expect(catchUp(newWeb(MODEL.seed, 1024), MODEL, week)).toEqual({ lived: REGROW_LIVED_WEEKS, regrown: true });
  });

  it('is kept as squeezed text, read back byte for byte, and a broken one is grown again', async () => {
    const record = encodeWeb(WEB);
    const text = await packRecord(record);
    expect(text.startsWith('gz:')).toBe(true);
    expect(text.length).toBeLessThan(record.byteLength / 2);
    const back = await unpackRecord(text);
    expect(Buffer.from(back!).equals(Buffer.from(record))).toBe(true);
    expect(await unpackRecord('gz:not a record')).toBeNull();
    const broken = await unpackRecord('gz:' + text.slice(3, 4000));
    expect(broken === null || decodeWeb(broken, MODEL) === null).toBe(true);
  });

  it('reads back only its own campus’s record, whole, and lets go of students who have left', () => {
    const record = encodeWeb(WEB);
    expect(record.byteLength).toBe(64 + EVENTS.length * 8 + WEB.n * SLOTS * 9);
    expect(decodeWeb(record, { ...MODEL, seed: MODEL.seed + 1 })).toBeNull();
    expect(decodeWeb(record.subarray(0, record.byteLength - 1), MODEL)).toBeNull();
    expect(decodeWeb(new Uint8Array(40), MODEL)).toBeNull();
    const smaller = structuredClone(MODEL);
    smaller.cohorts[3] = 100;
    const read = decodeWeb(record, smaller)!;
    const seniors = WEB.ring.indexOf(calendarAt(MODEL.clock).year - 3);
    for (let s = 0; s < read.n * SLOTS; s++) {
      const b = read.other[s]!;
      if (b < 0) continue;
      for (const id of [Math.floor(s / SLOTS), b]) {
        if (Math.floor(id / read.classSlot) === seniors) expect(id % read.classSlot).toBeLessThan(100);
      }
    }
  });
});

describe('the save', () => {
  it('comes up to version 30 with where new names begin, and keeps it through a save and a load', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(30);
    const text = readFileSync(new URL('./fixtures/save-v29-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };
    expect(file.state.version).toBe(29);
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(29);
    expect(loaded.state.web).toEqual({ namesFrom: { entryYear: calendarAt(file.state.clock).year, index: file.state.cohorts[0] } });
    expect(validate(loaded.state)).toBeNull();
    const again = parseSave(serialize(loaded.state, file.savedAt));
    if (!again.ok) throw new Error(again.reason);
    expect(again.state.web).toEqual(loaded.state.web);
    // The web itself is not in the everyday save: it has a record of its own.
    expect(Object.keys(loaded.state.web)).toEqual(['namesFrom']);
  });

  it('tells the owner, once, in the game’s voice', () => {
    const notes = upgradeNotes(29);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/social campus/);
    expect(notes[0]).toMatch(/first names/);
    expect(toneProblem(notes[0]!)).toBeNull();
    expect(upgradeNotes(30)).toEqual([]);
  });
});
