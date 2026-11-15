/**
 * What ties change (DESIGN.md 63.10, decision 7: light). Each student's friends, partner, a fresh breakup, a rival or
 * having nobody close moves their Happiness, their Stress in an exam week, their grades and how likely they are to
 * leave; the campus feels the average, held to a few points by the caps below so money, the level pace and the rank
 * pace stay where the long run holds them. Every size is [T].
 */

/** Points of Happiness on a student's card, from their ties. */
export const FRIENDS_HAPPY = {
  /**
   * Close friends (a friend, a best friend, a crush who is a friend, a roommate they get on with), or a friend group.
   * Proposed at 3, as was a good partner: most students have friends, so the campus came to 3.1 against its cap of 2,
   * and both were turned down to 2 rather than shrinking every card to fit (DESIGN.md 63.10).
   */
  close: 2,
  /** A partner they are happy with. */
  partner: 2,
  /** A partner it is not going well with: tense, on and off, or drifting. */
  strained: -2,
  /** An ex who still stings (`FRESH_EX_FROM`): on good terms or not. */
  split: -5,
  splitMessy: -7,
  /** A rival or an enemy. */
  rival: -2,
  /** Nobody close and no partner. */
  alone: -4,
  /** Picked on by someone (DESIGN.md 63.11). */
  bullied: -4,
} as const;
/** The most and the least a student's ties add to their Happiness. */
export const FRIENDS_HAPPY_MOST = 4;
export const FRIENDS_HAPPY_LEAST = -8;
/** The campus's Happiness moves at most this many points either way; past it, every card's points are scaled to fit. */
export const FRIENDS_CAMPUS_HAPPY = 2;

/** Points of Stress in an exam week (the whole in finals, a share at midterms, as the policies' exam help). */
export const FRIENDS_EXAM_STRESS = {
  /** A breakup in the last two weeks, or a fight: an enemy, or a roommate they do not get on with. */
  upset: 10,
  /** Supportive friends: a friend group, or two close friends or more. */
  supported: -5,
} as const;
/** The campus's exam Stress moves at most this many points either way. */
export const FRIENDS_CAMPUS_STRESS = 4;

/** Grades: a study partner (a close tie who likes studying, as they do), and a messy breakup in an exam week. */
export const FRIENDS_GPA = { study: 0.05, messyInExams: -0.1, bullied: -0.05 } as const;
/** A student's GPA moves at most this much either way. */
export const FRIENDS_GPA_MOST = 0.15;

/**
 * How likely a student is to leave at the end of a semester, against the campus's rate: alone more, in a group less.
 * Someone picked on is as likely to leave as someone alone, unless a friend group stands behind them (63.11).
 */
export const FRIENDS_LEAVE = { alone: 1.3, group: 0.85 } as const;
/** The share who stay each semester moves at most this much either way: 0.3 points. */
export const FRIENDS_STAY_MOST = 0.003;

/**
 * An ex this strong still stings: a breakup starts the ex at 40 and it fades by 2 a week, so this is the last two weeks,
 * or an ex they keep running into and getting on with.
 */
export const FRESH_EX_FROM = 36;
/** The strength a couple's ex starts at, however it ended. */
export const EX_START = 40;
