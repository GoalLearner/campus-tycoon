/**
 * Parties and drinking (DESIGN.md 52.3, as built in section 55). Only a game
 * with goals has them, so the small campus is untouched.
 *
 * Tone (52.1 and 52.2): shown plainly, never graphically. Drinking belongs to
 * students of 21 and over; a younger student who drinks is breaking a rule,
 * and is caught. Every night out costs something the player can see: Stress,
 * the graduation rate, and now and then a call. Every size is [T].
 */

/** Points of Food & fun parties give everyone, named "Parties" on that cause's line. */
export const PARTY_LIFT = 3;
/** Points of Stress late nights add in a week of term, at a party scene of 1. Named "Late nights" beside Stress. */
export const LATE_NIGHT_STRESS = 2;
/** Points off the graduation input of the academic rating, at a party scene of 1: skipped classes. */
export const LATE_NIGHT_RATING = 1;
/** The party scene is 1 on a campus with no chapter, and this much more for each point of the share of students in chapters. */
export const SCENE_PER_GREEK = 5;

/** The chance of a call from a party at each incident check, for every thousand students on the small game's count, in term. */
export const PARTY_CALL_RATE = 0.012;
/** The share of calls that are the Medical Center's: someone who drank too much. The rest are Campus Safety's. */
export const PARTY_MEDICAL_SHARE = 0.3;
/** A call comes from a chapter house this many times as often as its members' share of those living on campus. */
export const CHAPTER_PARTY_WEIGHT = 3;
/** The most a tailgate's drinks (or anything else on the desk) may add to how often calls come: twice as often. */
export const CALLS_MOST = 1;

/** Students in this class year and later are taken to be 21: juniors and seniors (0 is the first year). */
export const DRINKING_YEAR = 2;
