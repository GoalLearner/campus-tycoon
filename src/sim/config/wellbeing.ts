/**
 * Homesickness, loneliness and flu season (DESIGN.md 65.5). Every size marked [T] is tuning.
 */

/**
 * Homesickness among first-years who moved away from home: 94% felt some in their first ten weeks, worst at the start
 * and easing slowly (a study in the journal Emotion, 2016). [T] The share feeling some at
 * move-in, how fast it fades over the fall (a share of the fall a day), the floor it fades to, and the bump in the two
 * weeks before Thanksgiving, when the trip home is close; then the first weeks back after winter break, and the rest
 * of the spring. Of those feeling some, this share feel it enough to read as Homesick.
 */
export const HOMESICK = {
  moveIn: 0.94,
  fadePerDay: 0.022,
  floor: 0.15,
  thanksgiving: 0.18,
  backFromBreak: 0.25,
  spring: 0.1,
  strong: 0.35,
} as const;

/**
 * Loneliness: about half of students score high on a short loneliness scale (Healthy Minds 2024-25: 51%; ACHA-NCHA
 * 2022: 58%), first-years and those living at home more. [T] The chance a student feels lonely: a base, more with
 * nobody close or only one, more in the first year or living in town, less with a partner or a group of friends.
 */
export const LONELY = {
  base: 0.58,
  nobodyClose: 0.32,
  oneClose: 0.12,
  firstYear: 0.1,
  commuter: 0.08,
  partner: -0.2,
  group: -0.12,
} as const;
/** Close enough to count: a tie this strong, of a friend, best friend, roommate or partner. */
export const LONELY_CLOSE_AT = 30;

/**
 * Flu season: in one season 37% of a university cohort had a flu-like illness (a cohort study), and
 * the season runs from December to February, at its height late in January and February (CDC). [T] The share who
 * fall ill in a year's season; the season's first day (December 1) and its length in days; where in it most fall ill
 * (a share of the way through); and how long a bout lasts, from fewest days to most.
 */
export const FLU = { share: 0.37, from: [12, 1] as const, days: 90, peak: 0.65, shortest: 3, longest: 6 } as const;
