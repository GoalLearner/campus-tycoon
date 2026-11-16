import { describe, expect, it } from 'vitest';
import { partnerLine, partnerWord, possessive, viewOf } from '../src/app/socialView';
import { advance, isVarsity, newGame, personName, sampleStudents, shownGender, studentFigure, type GameState, type StudentRef } from '../src/sim';
import { COVER_SHARE, LOOKS_BY_PACK, type LookGender } from '../src/sim/config/looks';
import { MEN_NAMES, WOMEN_NAMES } from '../src/sim/config/names';
import { FIRST_NAMES } from '../src/sim/config/students';
import { everydayLook, lookGender, lookOdds, type LookPack } from '../src/sim/systems/looks';
import { oldFigure } from '../src/sim/systems/students';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { personLook } from '../src/ui/personCard';
import { DAY, T0 } from './helpers';

/**
 * Figures that match gender, and a crowd that looks like a real campus (DESIGN.md 69.3, the owner's play feedback of
 * builds 33-34): every look tagged; a student drawn from their gender's looks; head coverings at a real campus's
 * share; no student in a uniform; an old figure kept wherever it fits; staff named to match their figure.
 */

const PENZILLA: LookPack = { looks: 30, crowd: 16, roles: { athlete: 12, professor: 16, advisor: 17, guide: 18, chef: 19, clerk: 20, booster: 21, driver: 22, townie: 23, parent: 25, medic: 27, officer: 28, worker: 29 }, pack: 'penzilla-giant-city' };
const KENNEY: LookPack = { looks: 13, pack: 'kenney-isometric' };
const TAGS = LOOKS_BY_PACK['penzilla-giant-city']!;

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const SAMPLE = sampleStudents(MODEL, 3000);

/** Many made-up students in one class, for the shares: more than any sample of one campus holds. */
function many(state: GameState, n: number): StudentRef[] {
  return Array.from({ length: n }, (_, index) => ({ entryYear: 1900, index }));
}

function shares(state: GameState, refs: readonly StudentRef[], pack: LookPack, g: LookGender): { n: number; by: number[] } {
  const by = new Array<number>(pack.looks).fill(0);
  let n = 0;
  for (const ref of refs) {
    if (shownGender(state, ref) !== g) continue;
    by[studentFigure(state, ref, pack)]! += 1;
    n += 1;
  }
  return { n, by };
}

describe('looks', () => {
  it('tags every look in both packs, and only the crowd’s looks are a student’s', () => {
    expect(TAGS).toHaveLength(PENZILLA.looks);
    expect(LOOKS_BY_PACK['kenney-isometric']).toHaveLength(KENNEY.looks);
    for (const [i, tag] of TAGS.entries()) {
      // The seated, sleeping and face drawings exist for the crowd only (art/recipes/penzilla.json).
      if (tag.use === 'student' || tag.use === 'athlete') expect(i, tag.what).toBeLessThan(PENZILLA.crowd!);
      // A beard is a man's.
      if (/beard/.test(tag.what)) expect(tag.g, tag.what).toBe('m');
    }
    // Every role wears a uniform or an older or neighbour's face; the athletes are the helmets.
    for (const [role, look] of Object.entries(PENZILLA.roles!)) {
      if (role === 'athlete') expect(TAGS[look]!.use).toBe('athlete');
      else expect(['uniform', 'older', 'town'], role).toContain(TAGS[look]!.use);
    }
  });

  it('draws a woman in a feminine look or one that is either, a man in a masculine one or either', () => {
    for (const pack of [PENZILLA, KENNEY]) {
      const tags = LOOKS_BY_PACK[pack.pack!]!;
      for (const ref of SAMPLE) {
        const look = studentFigure(MODEL, ref, pack);
        const g = shownGender(MODEL, ref);
        if (g === 'f') expect(tags[look]!.g).not.toBe('m');
        if (g === 'm') expect(tags[look]!.g).not.toBe('f');
      }
    }
  });

  it('never puts a student in a uniform, a costume or an older face; the helmets are the varsity’s alone', () => {
    let varsity = 0;
    for (const ref of SAMPLE) {
      const tag = TAGS[studentFigure(MODEL, ref, PENZILLA)]!;
      expect(['student', 'athlete']).toContain(tag.use);
      expect(tag.use === 'athlete').toBe(isVarsity(MODEL, ref));
      if (isVarsity(MODEL, ref)) varsity += 1;
    }
    expect(varsity).toBeGreaterThan(0);
  });

  it('keeps head coverings at a real campus’s share: about 2 in 100 women, under 1 in 100 men', () => {
    const refs = many(MODEL, 60_000);
    const women = shares(MODEL, refs, PENZILLA, 'f');
    const men = shares(MODEL, refs, PENZILLA, 'm');
    const hijab = TAGS.flatMap((tag, i) => (tag.cover === 'hijab' ? [i] : []));
    const turban = TAGS.flatMap((tag, i) => (tag.cover === 'turban' ? [i] : []));
    const hijabs = hijab.reduce((sum, i) => sum + women.by[i]!, 0) / women.n;
    const turbans = turban.reduce((sum, i) => sum + men.by[i]!, 0) / men.n;
    expect(hijabs).toBeGreaterThan(0.015);
    expect(hijabs).toBeLessThan(0.025);
    expect(turbans).toBeGreaterThan(0.004);
    expect(turbans).toBeLessThan(0.01);
    // No man in a hijab, no woman in a turban.
    expect(hijab.reduce((sum, i) => sum + men.by[i]!, 0)).toBe(0);
    expect(turban.reduce((sum, i) => sum + women.by[i]!, 0)).toBe(0);
    expect(COVER_SHARE.hijab).toBe(0.02);
    expect(COVER_SHARE.turban).toBeLessThan(0.01);
  });

  it('spreads everyday looks evenly among each gender’s', () => {
    const refs = many(MODEL, 60_000);
    for (const g of ['f', 'm'] as const) {
      const { n, by } = shares(MODEL, refs, PENZILLA, g);
      const odds = lookOdds(TAGS, g);
      const everyday = TAGS.flatMap((tag, i) => (odds[i]! > 0 && !tag.cover ? [i] : []));
      const each = everyday.map((i) => by[i]! / n);
      const mean = each.reduce((a, b) => a + b, 0) / each.length;
      for (const share of each) expect(Math.abs(share - mean) / mean, `${g}: ${each.map((x) => x.toFixed(3)).join(' ')}`).toBeLessThan(0.08);
    }
  });

  it('keeps a student’s old figure wherever it fits, and changes it where it did not', () => {
    let changed = 0;
    let wrong = 0;
    for (const ref of SAMPLE) {
      const before = oldFigure(MODEL, ref, PENZILLA);
      const after = studentFigure(MODEL, ref, PENZILLA);
      const tag = TAGS[before]!;
      const g = shownGender(MODEL, ref);
      const fitted = tag.use === 'athlete' || (!tag.cover && (g === 'x' || tag.g === 'x' || tag.g === g));
      if (fitted) expect(after, tag.what).toBe(before);
      if (after !== before) changed += 1;
      if (g !== 'x' && tag.g !== 'x' && tag.g !== g) wrong += 1;
    }
    // About two in five: a man's figure was a woman's or a turban, a woman's a beard or a hijab.
    expect(changed / SAMPLE.length).toBeGreaterThan(0.3);
    expect(changed / SAMPLE.length).toBeLessThan(0.55);
    expect(changed).toBeGreaterThanOrEqual(wrong);
  });

  it('is the same figure on every screen, and in a pack with no table keeps the old rule', () => {
    for (const ref of SAMPLE.slice(0, 200)) {
      expect(studentFigure(MODEL, ref, PENZILLA)).toBe(studentFigure(structuredClone(MODEL), ref, { ...PENZILLA }));
      expect(studentFigure(MODEL, ref, { looks: 30, crowd: 16, roles: { athlete: 12 } })).toBe(oldFigure(MODEL, ref, PENZILLA));
    }
  });

  it('gives the crowd’s strangers everyday looks only', () => {
    for (let n = 0; n < 2000; n++) {
      const tag = TAGS[everydayLook(PENZILLA, (n % 100) / 100, Math.floor(n / 100) / 20 + 0.0001)]!;
      expect(tag.use).toBe('student');
    }
  });

  it('names staff, parents and neighbours to match their figure', () => {
    const roles = PENZILLA.roles!;
    for (const role of ['professor', 'advisor', 'guide', 'chef', 'clerk', 'booster', 'driver', 'townie', 'parent', 'medic', 'officer', 'worker'] as const) {
      for (let n = 0; n < 12; n++) {
        const ref = { role, n };
        const g = lookGender(PENZILLA, personLook(roles, ref));
        const first = personName(MODEL.seed, ref, g).split(' ')[0]!;
        const pool = g === 'f' ? WOMEN_NAMES : g === 'm' ? MEN_NAMES : FIRST_NAMES;
        expect(pool, `${role} ${n} (${g})`).toContain(first);
      }
    }
    // Neighbours and parents wear one of two looks, one of each gender.
    expect(lookGender(PENZILLA, personLook(roles, { role: 'parent', n: 0 }))).not.toBe(lookGender(PENZILLA, personLook(roles, { role: 'parent', n: 1 })));
    expect(lookGender(PENZILLA, personLook(roles, { role: 'townie', n: 0 }))).not.toBe(lookGender(PENZILLA, personLook(roles, { role: 'townie', n: 1 })));
  });

  it('says girlfriend or boyfriend by the partner’s gender, and her, his or their by the student’s', () => {
    const web = newWeb(MODEL.seed, 1024);
    catchUp(web, MODEL, webWeekOf(MODEL));
    const view = viewOf(web, false);
    let lines = 0;
    for (const ref of sampleStudents(MODEL, 300)) {
      const line = partnerLine(view, MODEL, ref);
      if (!line || line.text.startsWith('Dating')) continue;
      const word = { f: 'girlfriend', m: 'boyfriend', x: 'partner' }[shownGender(MODEL, line.ref)];
      const own = possessive(MODEL, ref);
      expect(line.text.startsWith(`${own} `)).toBe(true);
      expect(line.text).toContain(`${word}, `);
      expect(partnerWord(MODEL, line.ref).toLowerCase()).toBe(word);
      lines += 1;
    }
    expect(lines).toBeGreaterThan(0);
  });
});
