/**
 * Admissions at real figures (DESIGN.md 70, the owner's "Make sure the acceptance and applications per year are real
 * stats...can't have 100% acceptance rate"). The real figures, from NCES IPEDS for fall 2024 (twenty large publics of
 * 40,000 to 61,000 students), NCES Digest table 305.40 and the schools' Common Data Sets: acceptance a median 47.6%
 * (9% to 86%), about 17% at the top ten publics, 61% at ranks 11 to 50 and 66% at 51 to 100; applications a median
 * 7.8 for every first-year who enrols, 98,000 to 146,000 at the top; yield a median 26.6%, 42% to 50% at the most
 * selective and 21% to 23% where half or more are admitted; transfers about a fifth of a first-year class, 35% to 40%
 * of their applicants admitted; a spring class of first-years about a hundredth of the fall's.
 *
 * Every number here is a game's [T]: fitted so a campus reads those figures at its rank.
 */

/**
 * The share of those admitted who enrol, by rank: about 20.5% far down the rankings, 22% at 40th, 45% to 49% at the
 * very top. floor + (top - floor) * e^-(rank - 1)/fade.
 */
export const YIELD = { floor: 0.205, top: 0.49, fade: 14 } as const;

/**
 * Applications for every first-year who would enrol, by rank: about 6 far down, 7.7 at 40th, 11.6 at tenth and 14 at
 * first. floor + (top - floor) * e^-(rank - 1)/fade. `past`: the share of those the campus has no place for who apply
 * all the same, so a full campus at the top admits 11% to 13%, not fewer than the most selective publics.
 */
export const APPLY = { floor: 6.0, top: 14, fade: 25, past: 0.25 } as const;

/** A spring's first-years, for every first-year of the fall. */
export const SPRING_FIRST_YEARS = 0.01;

/**
 * Transfers: a year's for every first-year who would enrol, the share who arrive in the fall (the rest in the spring),
 * the share of their applicants admitted and of those admitted who come.
 */
export const TRANSFERS = { share: 0.25, fall: 0.9, admitted: 0.37, yield: 0.6 } as const;
