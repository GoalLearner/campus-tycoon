import type { DayPeriod } from './daylight';
import type { Emotion } from './emotion';
import type { Weather } from './life';

/**
 * The living campus, L2 (DESIGN.md 64.3): how a student's feeling shows on the map. The feeling is stop 3's
 * (`feelingOf`, 63.7); this is only how it looks: how they move, the ring at their feet, what they carry, and the big
 * bubble for a big moment. For show only: nothing here is saved, nothing changes a number. `src/game/Walkers.ts` draws it.
 */

/** How a feeling moves the body, drawn over the pack's own walk. */
export type Motion = 'bounce' | 'hop' | 'slump' | 'stomp' | 'pace' | 'fidget' | 'none';

/** A tense student is angry when it is about someone (a rival, not speaking, a fight), stressed when it is exams. */
const EXAM_WORDS = /exam|midterm|final/i;

export function motionOf(emotion: Emotion, reasons: readonly string[]): Motion {
  switch (emotion) {
    case 'happy':
    case 'flirty':
      return 'bounce';
    case 'excited':
      return 'hop';
    case 'sad':
    case 'lonely':
      return 'slump';
    case 'embarrassed':
      return 'fidget';
    case 'tense':
      return reasons.length > 0 && reasons.every((reason) => EXAM_WORDS.test(reason)) ? 'pace' : 'stomp';
    default:
      return 'none';
  }
}

/** How fast they walk against the usual pace: slower when sad, brisker when angry or excited. */
export const MOTION_PACE: Record<Motion, number> = { bounce: 1.05, hop: 1.08, slump: 0.78, stomp: 1.12, pace: 1, fidget: 1, none: 1 };

/** Where the body is drawn this moment, against where it stands: lifted, shaken sideways, squashed, turned about. */
export interface Pose {
  lift: number;
  shake: number;
  squash: number;
  /** True when they face the other way for now: the quick turns of anger and the pacing of stress, when stopped. */
  turned: boolean;
}

const STILL: Pose = { lift: 0, shake: 0, squash: 1, turned: false };

/**
 * The body at `ms` (any steady clock), `moving` or stopped, with `phase` (0 to 1) their own so no two move together.
 * Pixels at the map's scale, for a figure about 37 tall.
 */
export function motionAt(motion: Motion, ms: number, moving: boolean, phase: number): Pose {
  const s = ms / 1000 + phase * 10;
  switch (motion) {
    case 'bounce':
      // A spring in the step: two small lifts a stride.
      return moving ? { lift: Math.abs(Math.sin(s * 9)) * 1.6, shake: 0, squash: 1, turned: false } : STILL;
    case 'hop': {
      // Now and then a jump, walking or not.
      const t = s % 2.6;
      return { lift: t < 0.36 ? Math.sin((t / 0.36) * Math.PI) * 5 : 0, shake: 0, squash: 1, turned: false };
    }
    case 'slump':
      // Lower and heavier: a little shorter, a pixel down.
      return { lift: -1, shake: 0, squash: 0.93, turned: false };
    case 'stomp':
      // Hard steps when walking; stopped, quick turns one way and back.
      return moving ? { lift: Math.max(0, Math.sin(s * 11)) * 1.4, shake: 0, squash: 1, turned: false } : { ...STILL, turned: Math.floor(s / 0.55) % 2 === 1 };
    case 'pace':
      // Stopped, they turn about every second, as if walking up and down.
      return moving ? STILL : { lift: 0, shake: Math.sin(s * 2.2) * 2, squash: 1, turned: Math.floor(s / 1.1) % 2 === 1 };
    case 'fidget':
      // Stopped, a small quick shift from foot to foot.
      return moving ? STILL : { lift: 0, shake: Math.sin(s * 22) * 0.8, squash: 1, turned: false };
    default:
      return STILL;
  }
}

/** Laughing, whatever they feel: bouncing and shaking while the laugh shows. */
export function laughingAt(ms: number, phase: number): Pose {
  const s = ms / 1000 + phase * 10;
  return { lift: Math.abs(Math.sin(s * 14)) * 1.5, shake: Math.sin(s * 31) * 0.7, squash: 1, turned: false };
}

/** Cheering: a jump a second while the cheer lasts. */
export function cheeringAt(ms: number, phase: number): Pose {
  const t = (ms / 1000 + phase) % 1;
  return { lift: t < 0.4 ? Math.sin((t / 0.4) * Math.PI) * 6 : 0, shake: 0, squash: 1, turned: false };
}

/** Dancing: a sway from side to side, in radians, and a bob. */
export function swayAt(ms: number, phase: number): { rotation: number; lift: number } {
  const s = ms / 1000 + phase * 10;
  return { rotation: Math.sin(s * 4.4) * 0.12, lift: Math.abs(Math.sin(s * 4.4)) * 2 };
}

/** The ring at their feet for each feeling: our own mark, one colour each (DESIGN.md 64.3). Fine has none. */
export const RING: Record<Emotion, string | null> = {
  happy: 'emote.mood-happy',
  excited: 'emote.mood-excited',
  flirty: 'emote.mood-flirty',
  tense: 'emote.mood-tense',
  embarrassed: 'emote.mood-embarrassed',
  sad: 'emote.mood-sad',
  lonely: 'emote.mood-lonely',
  fine: null,
};

/** What a student may carry as they walk. */
export type Held = 'phone' | 'cup' | 'apple' | 'book' | 'ball' | 'guitar' | 'bag' | 'umbrella';
export const HELD_KEY: Record<Held, string> = {
  phone: 'prop.phone',
  cup: 'room.cup',
  apple: 'room.apple',
  book: 'room.book',
  ball: 'room.ball',
  guitar: 'room.lute',
  bag: 'prop.bag',
  umbrella: 'prop.umbrella',
};
/** Ours (drawn for this game) or the pack's own. */
export const HELD_OURS: ReadonlySet<Held> = new Set<Held>(['phone', 'bag', 'umbrella']);

export interface Trip {
  weather: Weather;
  period: DayPeriod;
  /** Where they come from and go: a place to eat, a class (an academic building), somewhere to play, a quad, home. */
  from: 'food' | 'class' | 'play' | 'quad' | 'home' | 'other';
  to: 'food' | 'class' | 'play' | 'quad' | 'home' | 'other';
  /** Their interests, by name ('music', 'sports', ...). */
  likes: ReadonlySet<string>;
  /** Their own steady number for the trip, 0 to 1. */
  roll: number;
}

/**
 * What they carry (DESIGN.md 64.3), chosen from the trip and who they are: an umbrella in the rain; a bag or a book on
 * the way to class; a ball on the way to play; an apple from a place to eat; a guitar now and then for those who like
 * music; a phone for some. About a quarter carry something in fine weather, so the drawing stays light. A cup or a tray from a place to eat is
 * chosen first, by the walk (64.2).
 */
export function heldOf(trip: Trip): Held | null {
  const r = trip.roll;
  if (trip.weather === 'rain') return r < 0.6 ? 'umbrella' : null;
  if (trip.to === 'class') {
    if (r < 0.2) return 'bag';
    if (r < 0.28) return 'book';
  }
  if (trip.to === 'play' && r < 0.4) return trip.likes.has('sports') || r < 0.2 ? 'ball' : null;
  if (trip.from === 'food' && r < 0.15) return 'apple';
  if (trip.likes.has('music') && r > 0.95) return 'guitar';
  if (r > 0.9) return 'phone';
  return null;
}

/** The big moments that get a big bubble (DESIGN.md 64.3). */
export type BigMoment = 'heartbreak' | 'kiss' | 'win' | 'argue' | 'bid' | 'fail' | 'ring';
export const BIG_KEY: Record<BigMoment, string> = {
  heartbreak: 'emote.big-heartbreak',
  kiss: 'emote.big-kiss',
  win: 'emote.big-win',
  argue: 'emote.big-argue',
  bid: 'emote.big-bid',
  fail: 'emote.big-fail',
  ring: 'emote.big-ring',
};

/** What is going on campus today that a student might have a big moment about. */
export interface Today {
  /** A home win within the last few hours. */
  homeWin: boolean;
  /** The hours after rush week, while bids go out. */
  bids: boolean;
  /** Midterm or finals week. */
  exams: boolean;
}

/** What one student brings to it: their feeling's top reason, their chapter, their year and their grades. */
export interface Who {
  emotion: Emotion;
  reasons: readonly string[];
  chapter: string | null;
  classYear: number;
  gpa: number;
  /** Their own steady number for the day, 0 to 1. */
  roll: number;
}

/** A big moment of their own, if they have one today: shown once, as they pass. Partners and rivals meeting are the walk's. */
export function bigMomentOf(who: Who, today: Today): BigMoment | null {
  if (who.emotion === 'sad' && who.reasons.some((reason) => reason.startsWith('Split up with'))) return 'heartbreak';
  if (today.bids && who.chapter !== null && who.classYear <= 1) return 'bid';
  if (today.exams && who.gpa < 2 && who.roll < 0.5) return 'fail';
  if (today.homeWin && who.roll < 0.25) return 'win';
  return null;
}
