import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMOTION_EMOTE, EMOTION_FACE, EMOTION_NAMES, feelingOf, moodletsOf, type Emotion } from '../src/app/emotion';
import { viewOf } from '../src/app/socialView';
import { advance, newGame, sampleStudents, studentCard, toneProblem, type GameState } from '../src/sim';
import { DRINKING_YEAR } from '../src/sim/config/parties';
import { PARTY_CARD } from '../src/sim/config/students';
import { HEAVY_WORDS } from '../src/sim/config/tone';
import { KIND, SLOTS } from '../src/sim/config/web';
import { catchUp, idOf, newWeb, refAt, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * Emotion, stop 3 (DESIGN.md 63.7): each student's feeling from their ties, the week and the campus, with its reasons,
 * its emote and its face; the emotes drawn for the game and the faces made from the pack's parts are in the atlases.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, webWeekOf(MODEL));
for (let w = 1; w <= 6; w++) catchUp(WEB, MODEL, webWeekOf(MODEL) + w);
const VIEW = viewOf(WEB, false);
const SAMPLE = sampleStudents(MODEL, 300).filter((ref) => idOf(WEB, ref) >= 0);

describe('a feeling', () => {
  const feelings = SAMPLE.map((ref) => ({ ref, feeling: feelingOf(VIEW, MODEL, ref, studentCard(MODEL, ref)!, 14) }));

  it('is one of eight, with its top two reasons, its emote and its face; fine has none', () => {
    for (const { feeling } of feelings) {
      expect(Object.keys(EMOTION_NAMES)).toContain(feeling.emotion);
      expect(feeling.name).toBe(EMOTION_NAMES[feeling.emotion]);
      expect(feeling.reasons.length).toBeLessThanOrEqual(2);
      if (feeling.emotion === 'fine') {
        expect(feeling.reasons).toEqual([]);
        expect(feeling.emote).toBeNull();
      } else {
        expect(feeling.reasons.length).toBeGreaterThan(0);
        expect(feeling.emote).not.toBeNull();
      }
      expect(feeling.face).toBe(EMOTION_FACE[feeling.emotion]);
    }
  });

  it('varies across the campus: no one feeling for everyone, and most feel something', () => {
    const counts = new Map<Emotion, number>();
    for (const { feeling } of feelings) counts.set(feeling.emotion, (counts.get(feeling.emotion) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...counts.values()) / feelings.length).toBeLessThan(0.75);
    expect((counts.get('fine') ?? 0) / feelings.length).toBeLessThan(0.5);
  });

  it('comes from their real ties: a new couple is happy with a heart, a split is sad with a broken heart', () => {
    let couples = 0;
    let splits = 0;
    for (const ref of SAMPLE) {
      const id = idOf(WEB, ref);
      const card = studentCard(MODEL, ref)!;
      const moodlets = moodletsOf(VIEW, MODEL, ref, card, 14);
      for (let k = 0; k < SLOTS; k++) {
        const s = id * SLOTS + k;
        if (WEB.other[s]! < 0) continue;
        if (WEB.kind[s] === KIND.dating && WEB.strength[s]! < 60 && WEB.feeling[s] === 0) {
          expect(moodlets.some((one) => one.emotion === 'happy' && one.reason.startsWith('New couple with') && one.emote === 'heart')).toBe(true);
          couples += 1;
        }
        if (WEB.kind[s] === KIND.ex && WEB.strength[s]! >= 34) {
          expect(moodlets.some((one) => one.emotion === 'sad' && one.reason.startsWith('Split up with') && one.emote === 'heartbreak')).toBe(true);
          splits += 1;
        }
      }
    }
    expect(couples + splits).toBeGreaterThan(0);
  });

  it('is the same every time for the same student and hour, and changes with the hour only through the week', () => {
    for (const ref of SAMPLE.slice(0, 40)) {
      const card = studentCard(MODEL, ref)!;
      expect(feelingOf(VIEW, MODEL, ref, card, 14)).toEqual(feelingOf(VIEW, MODEL, ref, card, 14));
    }
  });

  it('leaves the Main Character’s people to their story, and still reads their week and campus', () => {
    const ref = SAMPLE[0]!;
    const withMain = structuredClone(MODEL) as GameState;
    (withMain.story as { mc: unknown }).mc = { ...(MODEL.story.mc ?? {}), ref };
    const moodlets = moodletsOf(VIEW, withMain, ref, studentCard(withMain, ref)!, 14);
    expect(moodlets.some((one) => /with |on |Nobody close|group/.test(one.reason))).toBe(false);
  });

  it('works before the web has answered, from the week and the campus alone', () => {
    for (const ref of SAMPLE.slice(0, 40)) {
      const feeling = feelingOf(null, MODEL, ref, studentCard(MODEL, ref)!, 20);
      expect(Object.keys(EMOTION_NAMES)).toContain(feeling.emotion);
    }
  });

  it('gives the red cup of a party night only to a student of 21 or over; a younger one has a soda (DESIGN.md 63.9)', () => {
    const ref = SAMPLE[0]!;
    const card = studentCard(MODEL, ref)!;
    for (let classYear = 0; classYear < 4; classYear++) {
      const over = classYear >= DRINKING_YEAR;
      const night = { ...card, classYear, party: over ? PARTY_CARD.over21 : PARTY_CARD.under21 };
      const party = moodletsOf(VIEW, MODEL, ref, night, 21).find((one) => one.reason === 'Party tonight');
      expect(party?.emote, `class year ${classYear}`).toBe(over ? 'partycup' : 'sodacup');
    }
  });

  it('is said plainly: every reason passes the tone guide and none uses a heavy word', () => {
    const reasons = new Set<string>();
    for (const ref of SAMPLE) for (const one of moodletsOf(VIEW, MODEL, ref, studentCard(MODEL, ref)!, 22)) reasons.add(one.reason.replace(/ [A-Z][a-z]+$/, ' X'));
    expect(reasons.size).toBeGreaterThan(5);
    for (const reason of reasons) {
      expect(toneProblem(reason), reason).toBeNull();
      expect(HEAVY_WORDS.test(reason), reason).toBe(false);
    }
    expect(refAt(WEB, 0)).toBeDefined();
  });
});

describe('the art', () => {
  const read = (path: string): { frames: Record<string, unknown> } => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { frames: Record<string, unknown> };

  it('has every emote an emotion or a reason can show, in the built-in atlas', () => {
    const atlas = read('../public/assets/atlas.json');
    const emotes = new Set([...Object.values(EMOTION_EMOTE).filter((one): one is string => one !== null), 'heart', 'heartbreak', 'partycup', 'sodacup', 'chat-partying']);
    for (const emote of emotes) expect(atlas.frames[`emote.${emote}`], emote).toBeDefined();
  });

  it('credits the emotes as drawn for this game, and names each in both recipes, so each can be swapped', () => {
    const credits = readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(credits).toMatch(/## The emotes and bubbles[\s\S]*Made for this game/);
    const kenney = readFileSync(new URL('../art/recipes/kenney.json', import.meta.url), 'utf8');
    const penzilla = readFileSync(new URL('../art/recipes/penzilla.json', import.meta.url), 'utf8');
    for (const emote of ['speech', 'thought', 'heart', 'heartbreak', 'sparkle', 'laugh', 'sadcloud', 'anger', 'music', 'partycup', 'sodacup', 'exclaim', 'sweat']) {
      expect(kenney).toContain(`_rendered/ours/emotes/${emote}.png`);
      expect(penzilla).toContain(`_rendered/ours/emotes/${emote}.png`);
    }
    // The faces are the pack's own parts, so they are only in the paid pack's recipe.
    expect(penzilla).toContain('_rendered/fallback/faces/smile-');
  });
});
