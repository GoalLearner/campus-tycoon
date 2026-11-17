import { TICKS_PER_DAY } from './time';

/**
 * The Meddle menu and the calm tools (chaos C4, DESIGN.md 78): sixteen things the player can set going, each with a
 * cost, a cooldown, good and bad results, and the paper's coverage. The owner's answers 4 and 5 (2026-11-14): mixed
 * costs, cash for most, Gold Seals for the big ones; a real day's cooldown for most, a week for the big ones. Every
 * number here is [T], a first guess as the design said, to be tuned in the long run.
 *
 * On screen it is comic (16.2): a date, not a "blind date" (the hard lines keep "blind" out), a snowball battle.
 */

const DAY = TICKS_PER_DAY;
const WEEK = 7 * TICKS_PER_DAY;

export type MeddleId =
  | 'party'
  | 'rumour'
  | 'date'
  | 'roommates'
  | 'cancel'
  | 'mascot'
  | 'prankWar'
  | 'powerCut'
  | 'surpriseExam'
  | 'freeFood'
  | 'flashMob'
  | 'snowball'
  | 'counselling'
  | 'festival'
  | 'security'
  | 'dogs';

export interface MeddleSpec {
  id: MeddleId;
  /** Stir things up, or calm them down. */
  side: 'stir' | 'calm';
  name: string;
  /** What it is, in a line. */
  line: string;
  good: string;
  bad: string;
  /** Dollars in the small game, at the campus's scale. */
  cash?: number;
  seals?: number;
  /** Ticks before it can be used again. */
  cooldown: number;
  /** Only while it is snowing. */
  snowOnly?: boolean;
}

export const MEDDLE: readonly MeddleSpec[] = [
  { id: 'party', side: 'stir', name: 'Campus-wide party', line: 'Music in every hall and on every quad, all night.', good: 'Happiness, new friends, spirit', bad: 'Noise, mess, a bad grade or two, maybe a party broken up', cash: 12_000, cooldown: DAY },
  { id: 'rumour', side: 'stir', name: 'Start a rumour about two students', line: 'Two students, one whisper in the dining hall.', good: 'A new couple, sometimes', bad: 'Drama, a split, a feud', cooldown: DAY },
  { id: 'date', side: 'stir', name: 'Set two students up on a date', line: 'Two students who have never met, one table for two.', good: 'A couple if they click', bad: "An awkward night if they don't", cooldown: DAY },
  { id: 'roommates', side: 'stir', name: 'Pair incompatible roommates', line: 'A night owl and an early riser, one room.', good: 'Now and then, friends for life', bad: 'A tense room, a floor feud', cooldown: WEEK },
  { id: 'cancel', side: 'stir', name: 'Cancel classes', line: 'A day off for everyone, announced at breakfast.', good: 'Happiness, a quad full of people', bad: 'A little lost study, grumbling professors', cash: 8_000, cooldown: DAY },
  { id: 'mascot', side: 'stir', name: "Release the rival's mascot", line: "The rival's mascot, loose on campus for the afternoon.", good: 'Spirit, a comic chase', bad: 'Tempers with the rival, a prank back', seals: 5, cooldown: WEEK },
  { id: 'prankWar', side: 'stir', name: 'Start a prank war', line: 'Two dorms, one week, no rules but comic ones.', good: 'Spirit, stories', bad: 'Graffiti, repaints, a feud', seals: 5, cooldown: WEEK },
  { id: 'powerCut', side: 'stir', name: "Cut a dorm's power for a night", line: 'The lights go out in one dorm until morning.', good: 'A gathering by lantern light in the lounge', bad: 'Stress, lost study', cooldown: DAY },
  { id: 'surpriseExam', side: 'stir', name: 'Surprise exam', line: 'Every class, first thing tomorrow.', good: 'A small lift for the prepared', bad: 'Stress, groans, tense feelings', cooldown: DAY },
  { id: 'freeFood', side: 'stir', name: 'Free food on the quad', line: 'Tables of free food on the main quad at lunch.', good: 'Happiness, crowds, new acquaintances', bad: 'Litter', cash: 6_000, cooldown: DAY },
  { id: 'flashMob', side: 'stir', name: 'Flash mob', line: 'A hundred students, one song, the main path at noon.', good: 'Spirit, a headline beyond campus', bad: 'A blocked path for an hour', cash: 4_000, cooldown: DAY },
  { id: 'snowball', side: 'stir', name: 'Snowball battle', line: 'Every quad, everyone, while the snow lasts.', good: 'Happiness, new friends', bad: 'A few bruises for Medical', cooldown: DAY, snowOnly: true },
  { id: 'counselling', side: 'calm', name: 'Counselling drive', line: 'Counsellors in every hall for a day, doors open.', good: 'Stress down, fewer dust-ups', bad: 'It costs money', cash: 10_000, cooldown: DAY },
  { id: 'festival', side: 'calm', name: 'Campus festival', line: 'Two days of music, food and games on the quads.', good: 'Happiness, spirit, calm', bad: 'Litter', cash: 30_000, cooldown: WEEK },
  { id: 'security', side: 'calm', name: 'Extra security', line: 'Campus Safety on every path for a day.', good: 'Far fewer dust-ups and pranks for a day', bad: 'Some students find it heavy-handed', cash: 8_000, cooldown: DAY },
  { id: 'dogs', side: 'calm', name: 'Therapy dogs', line: 'Dogs to pet on the quad all afternoon.', good: 'Stress down, happy crowds', bad: 'It costs money', cash: 5_000, cooldown: DAY },
];

export const MEDDLE_BY_ID: Readonly<Record<MeddleId, MeddleSpec>> = Object.fromEntries(MEDDLE.map((spec) => [spec.id, spec])) as Record<MeddleId, MeddleSpec>;

/**
 * What each does [T]. Happiness and Stress go through the desk's dated boosts (36), so they share its caps: no pile of
 * meddling can run away with a number. `hours` is how long a boost lasts from now.
 */
export const MEDDLE_EFFECT = {
  /** Happiness for the night and the morning after; calls from parties two and a half times as often for the night. */
  party: { happy: 1.5, hours: 18, calls: 1.5, callHours: 12, litter: 15, spots: 8 },
  /** The chances of each outcome, in order: a couple, drama (a tense tie), a couple split by it, a feud. */
  rumour: { couple: 0.2, tense: 0.45, split: 0.2 },
  /** A couple if they click; an awkward night if not. */
  date: { click: 0.4 },
  /** Friends for life now and then; a tense room most of the time; a floor feud, with a shouting match at the dorm. */
  roommates: { friends: 0.15, tense: 0.6 },
  /** A day of Happiness and of Stress off; the professors grumble (told, no number). */
  cancel: { happy: 2, stressOff: 6, hours: 24 },
  /** On campus for four hours, as a kidnapping's visit; tempers with the rival for a week; the prank back in six hours. */
  mascot: { hours: 4, temper: 1.5, temperHours: 7 * 24, prankBackHours: 6 },
  /** A week of pranks three times as often and graffiti twice, at the two dorms. */
  prankWar: { pranks: 3, graffiti: 2, hours: 7 * 24 },
  /** Stress for the night; a little Happiness from the lounge by lantern light (no flame anywhere in the game, 77.3). */
  powerCut: { stress: 4, happy: 0.5, hours: 12 },
  surpriseExam: { stress: 6, hours: 14 },
  freeFood: { happy: 1, hours: 12, litter: 20, spots: 4 },
  /** A little Happiness, and a headline beyond campus: applicants' reach, fading as chaos's headlines do (68.3). */
  flashMob: { happy: 0.5, hours: 12, reach: 0.005 },
  snowball: { happy: 1.5, hours: 24, bruises: 2 },
  /** Stress off for the day, and dust-ups and shouting matches at 60% of their rate for two days. */
  counselling: { stressOff: 6, hours: 24, calm: 0.6, calmHours: 48 },
  /** Two days of Happiness, spirit, three days of calm at 75%, and litter. */
  festival: { happy: 2, hours: 48, calm: 0.75, calmHours: 72, litter: 25, spots: 12 },
  /** Dust-ups, pranks and graffiti at a quarter of their rate for a day; a little Happiness off for it. */
  security: { rein: 0.25, hours: 24, happy: -0.5 },
  dogs: { stressOff: 5, happy: 1, hours: 24 },
} as const;

/** Tension kept from falling below this share of its rate by calm, however many calm tools run at once. */
export const CALM_MOST = 0.45;
/** Stress a meddle can add at once, all of them together. */
export const MEDDLE_STRESS_MOST = 8;
/** Asks kept for the social web: it applies them at its next week, and drops any older than this many weeks. */
export const ASKS_KEPT_WEEKS = 4;

/**
 * How long the map shows a tool (view only, DESIGN.md 78.5), in hours from when it was used: what the lawns lean to
 * while it runs. A party is the night's; the festival its two days.
 */
export const MEDDLE_SHOW: Partial<Record<MeddleId, number>> = { party: 10, cancel: 10, freeFood: 3, flashMob: 1, snowball: 6, festival: 48, dogs: 6 };
