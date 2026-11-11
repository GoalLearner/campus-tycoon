/** [T] Every number here is a tuning target for the first playable. */

export const START_CASH = 400_000;

/** Stand-in for the three price levers, which arrive in layer 2. */
export const TUITION_PER_STUDENT_PER_YEAR = 10_000;

/** Stand-in for the five funding sliders, which arrive in layer 2. */
export const OPERATING_COST_PER_STUDENT_PER_YEAR = 6_500;

/** One-off costs the player pays for permission and conditions. */
export const COST = {
  path: 2_000,
  quad: 15_000,
  zoneLot: 15_000,
  clear: 1_000,
} as const;
