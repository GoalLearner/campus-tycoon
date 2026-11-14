/**
 * The social web, tunables (DESIGN.md 63): every student's ties, updated once a game week.
 */
import { TICKS_PER_YEAR } from './time';

/** A game week: a 52nd of the game year, about 3 hours 14 minutes of real time. */
export const WEB_WEEK_TICKS = Math.round(TICKS_PER_YEAR / 52);

/** Tie slots each student holds. Both ends hold a tie. */
export const SLOTS = 12;

/** The kinds of tie, by number, as the slots keep them. A crush is one's own: the other end may say friend. */
export const KIND = { none: 0, met: 1, friend: 2, best: 3, crush: 4, dating: 5, exclusive: 6, longterm: 7, ex: 8, rival: 9, enemy: 10, roommate: 11 } as const;
export const KIND_NAMES = ['', 'acquaintance', 'friend', 'best friend', 'crush', 'dating', 'exclusive', 'long-term', 'ex', 'rival', 'enemy', 'roommate'] as const;
export const FEEL = { warm: 0, tense: 1, complicated: 2 } as const;
export const FEEL_NAMES = ['warm', 'tense', 'complicated'] as const;

/** Encounters a student has in a game week, before how outgoing they are (shy one fewer, outgoing up to two more). */
export const ENCOUNTERS = 4;
/** The share of them with someone they already know, the closer the likelier. */
export const KNOWN = 0.45;
/** Where the rest happen: the dorm floor, a class section, a club table, a team, a chapter, and a district's dining, rec and parties. */
export const WHERE = [0.28, 0.24, 0.14, 0.06, 0.06, 0.22] as const;
/** The size of a dorm floor, a class section and a club table. */
export const FLOOR_SIZE = 24;
export const SECTION_SIZE = 30;
export const TABLE_SIZE = 40;

/** Strength: a first meeting, friends, best friends (one each), a crush's floor, dating's, rivals, enemies. */
export const MET_AT = 8;
export const FRIEND_AT = 30;
export const BEST_AT = 85;
export const CRUSH_FROM = 30;
export const DATE_FROM = 45;
export const RIVAL_AT = 35;
export const ENEMY_AT = 80;
/** A pair this clashing grows sore, not close. */
export const CLASH_BELOW = -0.2;
/** Sparks: only pairs this lucky ever have a crush, and the second of them only this lucky. */
export const SPARK = 0.92;
export const SPARK_BACK = 0.945;
/** Weekly chances a couple ends, by how long they have lasted; exes who keep meeting may get back together. */
export const BREAKUP = { dating: 0.02, exclusive: 0.01, longterm: 0.004 } as const;
export const BACK_TOGETHER = 0.03;
/**
 * Points lost each week apart, by kind. Roommates do not drift: they share a room. A crush is one end of a friendship,
 * and fades as the friendship at the other end does, so both ends keep one strength.
 */
export const FADE = [0, 3, 1, 1, 1, 1, 1, 1, 2, 2, 1, 0] as const;

/** A short absence is lived week by week; a longer one is regrown and its last weeks lived. */
export const CATCHUP_FULL_WEEKS = 12;
export const REGROW_LIVED_WEEKS = 8;

/** What happened, counted for the cards and the paper later. */
export const EVENTS = ['met', 'friends', 'best friends', 'crush', 'mutual crush', 'started dating', 'exclusive', 'long-term', 'breakup, mutual', 'breakup, messy', 'cheating', 'back together', 'rivals', 'enemies', 'love triangle'] as const;
export const EVENT = {
  met: 0,
  friends: 1,
  best: 2,
  crush: 3,
  mutualCrush: 4,
  dating: 5,
  exclusive: 6,
  longterm: 7,
  splitMutual: 8,
  splitMessy: 9,
  cheating: 10,
  backTogether: 11,
  rivals: 12,
  enemies: 13,
  triangle: 14,
} as const;

/**
 * What the web remembers by name for the cards, the Campus social view and the paper (DESIGN.md 63.6): of each of
 * these kinds, a few each week, chosen by the pair's own luck so no class or hall is favoured, for the last 64 weeks.
 */
export const HAPPENING_KINDS = [EVENT.best, EVENT.dating, EVENT.longterm, EVENT.splitMutual, EVENT.splitMessy, EVENT.cheating, EVENT.backTogether, EVENT.enemies, EVENT.triangle] as const;
export const HAPPENINGS_KEPT = 6;
export const HAPPENING_WEEKS = 64;
/**
 * The heavy ones (63.3, decision 6): a messy breakup, cheating, a love triangle. At most one of them is shown in a
 * campus week, in the paper and the Campus social view together, so the game stays 13+.
 */
export const HEAVY_EVENTS: readonly number[] = [EVENT.splitMessy, EVENT.cheating, EVENT.triangle];

/** A friend group: three to six friends who are friends with one another. */
export const GROUP_MIN = 3;
export const GROUP_MAX = 6;
