/**
 * Greek Row (DESIGN.md 14.1, adapted and built in section 51). Chapter houses
 * a campus with goals may build once the Growth era opens. A house holds a
 * few students; its worth is Happiness, and the retention Happiness brings,
 * not beds. Every size is [T].
 */

import type { CalDate } from './academicCalendar';

/** A chapter house's price and upkeep, on the small campus's count: the campus scale multiplies both. */
export const CHAPTER_COST = 20_000;
export const CHAPTER_UPKEEP = 1_500;
/** The most chapters a campus may have. */
export const GREEK_HOUSES_MOST = 8;

/** Rush week: early in the fall, after the first day of classes. Each chapter's philanthropy: in the spring. */
export const RUSH_DATE: CalDate = [8, 31, 0];
export const GIVING_DATE: CalDate = [4, 12, 1];
/** The share of each chapter that are seniors, and leave at commencement. */
export const SENIOR_SHARE = 0.25;
/** A chapter founded between rush weeks starts with at least this share of its beds. */
export const FOUNDING_SHARE = 0.5;

/** Real hours a chapter stays on Warning before, with the trouble still there, it goes on Probation. */
export const PROBATION_HOURS = 36;

/** Greek letters, as chapter names use them. */
export const GREEK_LETTERS: readonly string[] = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];

/**
 * The joke word every chapter's name ends with: a plain, friendly English word, never a Greek letter. A real chapter's
 * name is Greek letters alone, so a name with one of these cannot be one, by construction. The tone guide's blocklist
 * is checked as a second line.
 */
export const CHAPTER_WORDS: readonly string[] = ['Llama', 'Teapot', 'Waffle', 'Pancake', 'Kettle', 'Noodle', 'Pickle', 'Muffin', 'Walrus', 'Tuba', 'Biscuit', 'Lantern', 'Otter', 'Pretzel', 'Badger', 'Cardigan', 'Penguin', 'Turnip', 'Crumpet', 'Accordion'];

/** Students a house holds, on the small campus's count: a third of a grown dorm's. */
export const CHAPTER_BEDS = 10;
/** At most so many members a chapter takes at rush, as a share of its beds: past its beds, the house is overfull. */
export const RUSH_MOST = 1.25;
/** The share of the students who live in dorms who would join a chapter, given room. */
export const GREEK_INTEREST = 0.06;

/** What a house's members gain in Food & fun, in points of that cause for them: a house of their own, and more. */
export const GREEK_LIFE = 12;
/** More beside another house, within this many cells: the Row. */
export const ROW_BONUS = 4;
export const ROW_REACH = 2;
/** More inside the stadium's noise: members like a game day next door. */
export const GAME_DAY_BONUS = 4;
/** More for each philanthropy event its chapter has held since rush, up to two. */
export const GIVING_BONUS = 2;
export const GIVING_MOST = 2;

/** How loud a house is to the dorms and lecture halls within its reach: a share of full noise, read inside Grounds. */
export const CHAPTER_NOISE = 0.35;
export const CHAPTER_NOISE_REACH = 2;

/** Points off the academic rating's graduation input for each point of the Greek share of enrollment, and the most. */
export const GREEK_DRAG_PER_SHARE = 50;
export const GREEK_DRAG_MOST = 4;

/** A chapter's chance of a prank in a school year, by its status: friendly, and more often from a house in trouble. */
export const PRANK_CHANCE = { good: 0.25, warning: 0.6, probation: 1, suspended: 0 } as const;

/** The pranks: silly, harmless, and put right by morning. `{chapter}` is the chapter's name. */
export const PRANKS: readonly string[] = [
  'Members of {chapter} filled the fountain outside the library with bubbles. It smells of lemons.',
  'Overnight, {chapter} knitted a sweater for every lamp post on the main path.',
  'Two hundred paper cranes hang from the ceiling of the biggest lecture hall, folded by {chapter}.',
  'Every bench on the quad has been turned to face the sunrise, with a note from {chapter} saying it is better that way.',
  '{chapter} left a rubber duck on every desk in the library, each with a small paper hat.',
  'The campus map signs now point the way to "Snack Hall", in tidy hand lettering signed by {chapter}.',
];

/** The philanthropy events: one a chapter in good standing holds each spring. `{chapter}` is its name. */
export const PHILANTHROPY: readonly string[] = [
  '{chapter} held a charity car wash on Lantern Avenue for the town food bank.',
  '{chapter} ran a canned-food drive and filled the town pantry’s shelves.',
  '{chapter} walked laps of the track all day for the children’s library in town.',
  '{chapter} planted bulbs along the avenue with the town’s garden club.',
];

// ------------------------------------------------------------------ hazing --
// DESIGN.md 52.3, as built in section 55. Light hazing is a system with costs, never a joke at a pledge's expense, and
// never anything that hurts anyone: no forced drinking or eating, nothing dangerous (52.1).

/** Pledge season: the real hours after rush week in which a chapter's pledges may be hazed and it may be reported. */
export const PLEDGE_SEASON_HOURS = 48;
/** A chapter's hazing risk, 0 to 1: a base, more for a house in trouble, more again once the president looked away. */
export const HAZING_BASE = 0.3;
export const HAZING_TROUBLE = 0.2;
export const HAZING_LOOKED = 1.6;
/** A chapter on probation for hazing is watched: its risk is this many times as large. */
export const HAZING_WATCHED = 0.5;
/** The chance of a report on a day of pledge season, times the chapter's risk. */
export const HAZING_REPORT = 0.3;
/** Points off the academic rating's Reputation input while a case the president looked away from is in the news, and how long. */
export const HAZING_SCANDAL = 3;
export const HAZING_SCANDAL_HOURS = 7 * 24;
/** What a report says the pledges were made to do: embarrassing, early or silly, and nothing worse. `{chapter}` is its name. */
export const HAZING_TASKS: readonly string[] = [
  'Pledges of {chapter} were told to carry a rubber chicken to every class for a week and introduce it to each professor.',
  'Pledges of {chapter} were woken at five every morning to wash the members’ cars and rake the lawn.',
  'Pledges of {chapter} had to recite the chapter’s history on the quad at sunrise, in matching bathrobes.',
  'Pledges of {chapter} were sent out at midnight to collect forty signatures from strangers in the library.',
  'Pledges of {chapter} had to wear the same lime-green blazer to every class for two weeks.',
  'Pledges of {chapter} were made to clean the whole house with toothbrushes before a social.',
];
