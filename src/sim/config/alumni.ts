/**
 * Alumni giving (DESIGN.md 54, as built in section 56): the last two stages
 * of the spine of 24.1, alumni success and donations. Only a game with goals
 * has a drive, so the small campus is untouched. Every size is [T].
 */

/**
 * The classes that graduated before the player arrived: a model campus opens with them, at middling numbers. Their
 * success is middling for a school of the model campus's standing: about the level its rating reads in its first
 * year, so the input they fill neither lifts nor drags the rating at the start.
 */
export const OPENING_CLASSES = 20;
export const OPENING_SUCCESS = 65;
export const OPENING_AFFINITY = 50;
/** How many years the opening pool has been out, on average, for the age lift. */
export const OPENING_AGE = 12;

/**
 * A class's success, 0 to 100, fixed the day it graduates: the academic rating that year, moved up or down by its
 * on-time share and its job placement against a middling class's. Placement follows the rating: so many in a hundred
 * have a job, and so many more for each point of the rating. Centred on the rating, so a class that does as well as
 * its school neither lifts nor drags the input it feeds.
 */
export const SUCCESS_PARTS = { onTime: 20, onTimeMiddle: 0.95, placement: 20, placementMiddle: 0.85 } as const;
export const PLACEMENT = { floor: 0.55, span: 0.4 } as const;

/**
 * A class's affinity, 0 to 100, fixed the day it graduates: how happy it was over its years, the traditions kept in
 * them, its share in chapters, and the football record in them, in these parts. A share in chapters of `GREEK_FULL`
 * or more counts in full; so do `TRADITIONS_FULL` traditions kept a year.
 */
export const AFFINITY_PARTS = { happiness: 0.6, traditions: 0.15, greek: 0.1, football: 0.15 } as const;
export const GREEK_FULL = 0.1;
export const TRADITIONS_FULL = 3;

/** The share of a class that gives in a drive: this at affinity 0, and up to this much more at 100. */
export const PARTICIPATION = { floor: 0.04, span: 0.16 } as const;
/** A donor's gift in a drive, in real dollars: this at success 0, and up to this much more at 100. */
export const GIFT = { floor: 15, span: 60 } as const;
/** Older classes give a little more: this much more for each year since they graduated, up to `AGE_MOST`. */
export const AGE_LIFT = 0.01;
export const AGE_MOST = 0.2;
/** A class's chapter members give at this many times its rate. */
export const GREEK_GIVING = 1.5;
/** A winning season this school year adds up to this share to the whole drive, by the share of games won. */
export const WIN_LIFT = 0.1;
/** The Alumni House (a reward building, DESIGN.md 40) lifts every class's rate by this share while it stands. */
export const ALUMNI_HOUSE_LIFT = 0.05;

/** The share of a drive donors restrict to the endowment, which earns its yield for good. The rest is cash, paid over the year. */
export const ENDOWED_SHARE = 0.6;

/** The academic rating's input from alumni success reads this many of the latest classes, the opening pool filling in. */
export const SUCCESS_CLASSES = 4;
/** Its weight in the academic rating, out of 100 when every input exists (DESIGN.md 24.4). */
export const ALUMNI_WEIGHT = 15;
