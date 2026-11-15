/**
 * The social web, tunables (DESIGN.md 63): every student's ties, updated once a game week.
 */
import { TICKS_PER_YEAR } from './time';

/** A game week: a 52nd of the game year, about 3 hours 14 minutes of real time. */
export const WEB_WEEK_TICKS = Math.round(TICKS_PER_YEAR / 52);

/** Tie slots each student holds. Both ends hold a tie. */
export const SLOTS = 12;

/**
 * The kinds of tie, by number, as the slots keep them. A crush is one's own: the other end may say friend. Picking on
 * someone (DESIGN.md 63.11) has two ends too: the one who does it holds `bully`, the one it is done to `bullied`.
 */
export const KIND = { none: 0, met: 1, friend: 2, best: 3, crush: 4, dating: 5, exclusive: 6, longterm: 7, ex: 8, rival: 9, enemy: 10, roommate: 11, bully: 12, bullied: 13 } as const;
export const KIND_NAMES = ['', 'acquaintance', 'friend', 'best friend', 'crush', 'dating', 'exclusive', 'long-term', 'ex', 'rival', 'enemy', 'roommate', 'picks on', 'picked on by'] as const;
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
/**
 * Sparks: only pairs this lucky ever have a crush, and the second of them only this lucky. Since R1 (DESIGN.md 65.6)
 * more pairs spark and more mutual crushes start dating, so about a fifth of students have a partner on campus and,
 * with the hometown partners on the cards, about a third are in a relationship (Online College Social Life Survey).
 */
export const SPARK = 0.84;
export const SPARK_BACK = 0.885;
/** Two with a crush on each other, close enough, start dating on a good evening: this share of such evenings. */
export const DATE_CHANCE = 0.5;
/**
 * Weekly chances a couple ends, by how long they have lasted; exes who keep meeting may get back together. Since R1
 * (DESIGN.md 65.6) couples last a little longer, so about a fifth of students have a partner on campus. No national
 * figure for how often students break up: judgement.
 */
export const BREAKUP = { dating: 0.012, exclusive: 0.006, longterm: 0.003 } as const;
export const BACK_TOGETHER = 0.03;
/**
 * Points lost each week apart, by kind. Roommates do not drift: they share a room. A crush is one end of a friendship,
 * and fades as the friendship at the other end does, so both ends keep one strength.
 */
export const FADE = [0, 3, 1, 1, 1, 1, 1, 1, 2, 2, 1, 0, 3, 3] as const;

/** A short absence is lived week by week; a longer one is regrown and its last weeks lived. */
export const CATCHUP_FULL_WEEKS = 12;
export const REGROW_LIVED_WEEKS = 8;
/**
 * Couples grown again (DESIGN.md 63.7), set from game years lived a week at a time on the model campus: played every
 * day, couples hold level from year to year, about 85 to a thousand students as the fall begins (the first-years have
 * no one yet), 109 by spring and 103 at commencement since R1 (DESIGN.md 65.6); before it, 50, 63 and 60. Of the pairs who would be a couple, the share kept grows with the
 * years both have been here, up to the most; a couple's closeness starts higher the longer, so most that have lasted
 * are long-term, as lived ones are. Set so a long absence comes back within a few couples a thousand of the campus
 * played every day: grown pairs still meet new people for months after, and pair up more than settled ones do.
 */
export const REGROW_COUPLES_A_YEAR = 0.55;
export const REGROW_COUPLES_KEPT = 0.46;
export const REGROW_COUPLE_FROM = 60;
export const REGROW_COUPLE_PER_YEAR = 25;
/** A pair grown again who would be a couple and are not, after half a year here: exes of a while ago. */
export const REGROW_EX_AT = 22;

/** What happened, counted for the cards and the paper later. */
export const EVENTS = ['met', 'friends', 'best friends', 'crush', 'mutual crush', 'started dating', 'exclusive', 'long-term', 'breakup, mutual', 'breakup, messy', 'cheating', 'back together', 'rivals', 'enemies', 'love triangle', 'picked on', 'left out', 'roommate pettiness', 'pile-on', 'stood up for', 'reported', 'rumour', 'room switch'] as const;
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
  /** Picking on someone (DESIGN.md 63.11): a mean comment, name-calling, a rumour, naming and shaming, a feud. */
  bullying: 15,
  /** A clique shutting someone out. */
  shutOut: 16,
  /** Roommates being petty with each other. */
  pettiness: 17,
  /** Someone joining in. */
  pileOn: 18,
  /** A friend standing up for the one picked on. */
  stoodUp: 19,
  /** Reported to the conduct office. */
  reported: 20,
  /** A rumour on Quadline that reached someone close to the one it was about (DESIGN.md 63.14). */
  rumour: 21,
  /** Roommates who could not get on, moved apart at the spring semester (DESIGN.md 65.6). */
  roomSwitch: 22,
} as const;

/**
 * Roommates (DESIGN.md 65.6): about half report some conflict with a roommate, and about 3% change rooms in a year
 * (HERI data, as cited 2024; weaker). [T] A pair this short of good chemistry has some friction; at the spring
 * semester, this share of the pairs at odds (tense) move apart, each to another room.
 */
export const ROOM_FRICTION_BELOW = 0.15;
export const ROOM_SWITCH = 0.18;

/**
 * What the web remembers by name for the cards, the Campus social view and the paper (DESIGN.md 63.6): of each of
 * these kinds, a few each week, chosen by the pair's own luck so no class or hall is favoured, for the last 64 weeks.
 */
export const HAPPENING_KINDS = [EVENT.best, EVENT.dating, EVENT.longterm, EVENT.splitMutual, EVENT.splitMessy, EVENT.cheating, EVENT.backTogether, EVENT.enemies, EVENT.triangle, EVENT.bullying, EVENT.shutOut, EVENT.pettiness, EVENT.pileOn, EVENT.stoodUp, EVENT.reported, EVENT.rumour] as const;
export const HAPPENINGS_KEPT = 6;
export const HAPPENING_WEEKS = 64;
/**
 * The heavy ones: a messy breakup, cheating, a love triangle, and since 63.11 someone picked on, shut out or piled on.
 * Shown as they happen since the owner's 16+ (63.9); they lead the paper's gossip and make the drama of the week.
 */
export const HEAVY_EVENTS: readonly number[] = [EVENT.splitMessy, EVENT.cheating, EVENT.triangle, EVENT.bullying, EVENT.shutOut, EVENT.pileOn];

/**
 * Picking on someone (DESIGN.md 63.11): from who they are, at the owner's word ("allow bullying and drama"). A student
 * who is not kind and is jealous (not loyal) or short-tempered (not calm) may start on someone they clash with: a rival,
 * an enemy, an acquaintance whose ways grate, or a roommate they do not get on with (that one stays petty). Friends of
 * theirs who are not kind and are outgoing may join in; friends of the one picked on who are kind or loyal stand up
 * for them. Kind friends of the one doing it drift away, and some of it is reported to the conduct office, which ends
 * it. Every size is [T].
 */
/**
 * Rumours on Quadline (DESIGN.md 63.14, decision 6, "Drama"): a few a week from those who like to talk. One spreads as
 * far as its teller is known, and may land on someone close to the one it is about: a partner, who is hurt by it, and
 * now and then ends it; a friend, who is put out. Every size is [T].
 */
export const RUMOUR = {
  /** Tellers tried each week, and how likely one who likes to talk starts one. */
  tries: 40,
  starts: 0.12,
  /** How likely it lands, at its most: a teller who knows this many people, and more, carries it all the way. */
  lands: 0.55,
  reach: 40,
  /** What a rumour that lands takes from the tie, and how likely it ends a couple. */
  sting: 8,
  split: 0.15,
} as const;

export const BULLY = {
  /** The weekly chance a student who would start on someone does, with someone they clash with to start on. */
  start: 0.02,
  /** How strong the tie begins, and how much it grows each week it goes on; it fades by 3 a week once it stops. */
  from: 40,
  grows: 8,
  /** The chance a friend who would join in does, and how many at most. */
  join: 0.5,
  joinMost: 2,
  /** The chance a kind or loyal friend stands up for the one picked on, and what it adds to their friendship. */
  defend: 0.4,
  rally: 6,
  /** What it costs the one doing it with each kind friend: a little closeness each week. */
  drift: 6,
  /** The weekly chance it is reported to the conduct office, which ends it. */
  reported: 0.12,
} as const;
/** A tie of picking on this strong or more is felt (the effects of 63.10 read it). */
export const BULLIED_FROM = 20;

/** A friend group: three to six friends who are friends with one another. */
export const GROUP_MIN = 3;
export const GROUP_MAX = 6;
