import { BULLIED_REASON } from '../sim/config/bullying';
import { lonelyOf } from '../sim/systems/wellbeing';
import { semesterOf } from '../sim/systems/students';
import { BULLIED_FROM } from '../sim/config/web';
import type { GameState, StudentCard, StudentRef } from '../sim';
import { DRINKING_YEAR } from '../sim/config/parties';
import { FEEL, FRIEND_AT, KIND, SLOTS } from '../sim/config/web';
import { hashInts } from '../sim/rng';
import { homeGameNow } from '../sim/systems/football';
import { dayRead } from '../sim/systems/season';
import { firstNameOf } from '../sim/systems/students';
import { firstNamesOf, idIn, refIn, type WebView } from './socialView';

/**
 * What a student is feeling right now, as the Sims show it (DESIGN.md 63.7): small reasons, each pulling towards an
 * emotion with a weight (moodlets), from their ties in the social web, the week and how they find the campus. The
 * emotion with the most behind it wins; the card shows it with its top two reasons, the map shows its emote over
 * their head while their card is open, and their portrait wears its face. Nothing is stored: it is worked out from
 * the web, the card and the hour, the same every time.
 */

export type Emotion = 'happy' | 'excited' | 'flirty' | 'fine' | 'tense' | 'embarrassed' | 'sad' | 'lonely';
/** The people pack's own mouths and shut eyes, put together by tools/make_faces.py. */
export type MoodFace = 'smile' | 'frown' | 'flat' | 'small' | 'smirk' | 'laugh';

export const EMOTION_NAMES: Record<Emotion, string> = {
  happy: 'Happy',
  excited: 'Excited',
  flirty: 'Flirty',
  fine: 'Fine',
  tense: 'Tense',
  embarrassed: 'Embarrassed',
  sad: 'Sad',
  lonely: 'Lonely',
};

/** Each emotion's emote (an `emote.` sprite drawn by tools/make_emotes.py) and face. Fine has neither. */
export const EMOTION_EMOTE: Record<Emotion, string | null> = {
  happy: 'sparkle',
  excited: 'exclaim',
  flirty: 'heart',
  fine: null,
  tense: 'anger',
  embarrassed: 'sweat',
  sad: 'sadcloud',
  lonely: 'thought',
};
export const EMOTION_FACE: Record<Emotion, MoodFace | null> = {
  happy: 'smile',
  excited: 'laugh',
  flirty: 'smirk',
  fine: null,
  tense: 'flat',
  embarrassed: 'small',
  sad: 'frown',
  lonely: 'frown',
};

export interface Moodlet {
  emotion: Emotion;
  /** Plain and short, as the card says it: "New couple with Amira". */
  reason: string;
  weight: number;
  /** An emote of its own, in place of the emotion's: a heart for a new couple, a broken heart for a split. */
  emote?: string;
}

export interface Feeling {
  emotion: Emotion;
  name: string;
  /** The top two reasons behind it, strongest first. */
  reasons: string[];
  emote: string | null;
  face: MoodFace | null;
  moodlets: Moodlet[];
}

/** Below this, nothing pulls hard enough: they are fine. */
const FINE_BELOW = 1.2;

/** The game day: a day of the player's own clock, for what changes once a day. */
const dayOf = (state: GameState): number => Math.floor(state.clock.tick / (24 * 60));

/** The reasons pulling at a student now. */
export function moodletsOf(view: WebView | null, state: GameState, ref: StudentRef, card: StudentCard, hour: number): Moodlet[] {
  const out: Moodlet[] = [];
  const add = (emotion: Emotion, reason: string, weight: number, emote?: string): void => void out.push({ emotion, reason, weight, ...(emote ? { emote } : {}) });

  // Their people: the web's, the Main Character's too since their story's people are on the web (DESIGN.md 63.11).
  const id = view ? idIn(view, ref) : -1;
  if (view && id >= 0) {
    let friends = 0;
    let partnered = false;
    for (let k = 0; k < SLOTS; k++) {
      const s = id * SLOTS + k;
      const b = view.other[s]!;
      if (b < 0) continue;
      const kind = view.kind[s]!;
      const strength = view.strength[s]!;
      const feeling = view.feeling[s]!;
      // Told apart from the student themself: "Picked on by Lou R." on Lou S.'s card.
      const first = (): string => firstNamesOf(state, [ref, refIn(view, b)])[1]!;
      if (kind === KIND.dating || kind === KIND.exclusive || kind === KIND.longterm) {
        partnered = true;
        if (feeling === FEEL.complicated) add('tense', `It's complicated with ${first()}`, 2.5);
        else if (kind === KIND.dating && strength < 60) add('happy', `New couple with ${first()}`, 3, 'heart');
        else add('happy', `Together with ${first()}`, 1.5, 'heart');
      } else if (kind === KIND.crush) {
        add('flirty', `Has a crush on ${first()}`, 2.5);
        // Now and then, once a day, it goes wrong in front of them.
        if ((hashInts(state.seed, 9999, ref.entryYear, ref.index, dayOf(state)) >>> 0) / 4294967296 < 0.12) add('embarrassed', `Dropped their books in front of ${first()}`, 3.5);
      } else if (kind === KIND.ex && strength >= 30) {
        // A split fades: strongest the first weeks, while the ex is still close in mind.
        add('sad', `Split up with ${first()}`, strength >= 34 ? 4 : 2, 'heartbreak');
      } else if (kind === KIND.enemy) add('tense', `Not speaking to ${first()}`, 2);
      else if (kind === KIND.rival) add('tense', `A rivalry with ${first()}`, 1.2);
      else if (kind === KIND.roommate && feeling === FEEL.tense) add('tense', `Not getting on with ${first()}`, 1.8);
      // Picked on (DESIGN.md 63.11): it weighs, more the longer it goes on.
      else if (kind === KIND.bullied && strength >= BULLIED_FROM) add('sad', BULLIED_REASON.replace('{name}', first()), 2 + strength / 40);
      else if (kind === KIND.best && strength >= 85) add('happy', `Close with ${first()}`, 1.2);
      if ((kind === KIND.friend || kind === KIND.best || kind === KIND.roommate || kind === KIND.crush) && strength >= FRIEND_AT) friends += 1;
    }
    if (friends === 0 && !partnered) add('lonely', 'Nobody close yet', 3);
    else if (view.groupOf[id]! >= 0) add('happy', 'Has a group of friends', 0.8);
    // Lonely is common, friends or not (DESIGN.md 65.5): about half feel it, more in the first year or living in town.
    if (lonelyOf(state.seed, ref, semesterOf(state), { close: friends, partnered, group: view.groupOf[id]! >= 0, firstYear: card.classYear === 0, commuter: card.residence === 'offCampus' })) add('lonely', 'Feeling lonely', 1);
  }

  // The week.
  const day = dayRead(state.clock);
  if (day.kind === 'finals' || day.kind === 'midterms') add('tense', day.name ?? 'Exams', 1 + card.stress / 30);
  // An everyday hum of Stress is real (DESIGN.md 65.5): only the high end of it reads as exams ahead.
  else if (card.stress >= 65) add('tense', 'Exams ahead', card.stress / 45);
  if (day.kind === 'break' || day.kind === 'summer') add('happy', day.kind === 'summer' ? 'Summer' : (day.name ?? 'A break'), 1.5);
  if (homeGameNow(state)) add('excited', 'Game day', card.archetype === 'superfan' || card.archetype === 'athlete' ? 3 : 1.4);
  // The red cup is a drink: only a student of 21 or over carries it; a younger one goes with a soda (DESIGN.md 63.9).
  if (card.party && (hour >= 18 || hour < 2)) add('excited', 'Party tonight', 2.5, card.classYear >= DRINKING_YEAR ? 'partycup' : 'sodacup');

  // How they find the campus.
  if (card.mood >= 4) add('happy', 'Loves it here', 1.5);
  else if (card.mood <= 0) add('sad', 'Unhappy here', 2);
  else if (card.mood === 1) add('sad', 'Not happy here', 1);
  // Most first-years who moved away miss home at first, and those who feel it most read as Homesick (DESIGN.md 65.5).
  if (card.missesHome) add('sad', 'Misses home', card.archetype === 'homesick' ? 1.5 : 0.7);
  // Flu season: down with it for a few days.
  if (card.sick) add('sad', 'Down with the flu', 4, 'thermometer');
  return out;
}

export function feelingOf(view: WebView | null, state: GameState, ref: StudentRef, card: StudentCard, hour: number): Feeling {
  const moodlets = moodletsOf(view, state, ref, card, hour);
  const sums = new Map<Emotion, number>();
  for (const one of moodlets) sums.set(one.emotion, (sums.get(one.emotion) ?? 0) + one.weight);
  let emotion: Emotion = 'fine';
  let most = FINE_BELOW;
  // Ties go to the order the emotions are listed in, so the same reasons always give the same emotion.
  for (const name of Object.keys(EMOTION_NAMES) as Emotion[]) {
    const sum = sums.get(name) ?? 0;
    if (sum >= most && (sum > most || emotion === 'fine')) {
      most = sum;
      emotion = name;
    }
  }
  const behind = moodlets.filter((one) => one.emotion === emotion).sort((a, b) => b.weight - a.weight);
  return {
    emotion,
    name: EMOTION_NAMES[emotion],
    reasons: emotion === 'fine' ? [] : behind.slice(0, 2).map((one) => one.reason),
    emote: emotion === 'fine' ? null : (behind[0]?.emote ?? EMOTION_EMOTE[emotion]),
    face: EMOTION_FACE[emotion],
    moodlets,
  };
}
