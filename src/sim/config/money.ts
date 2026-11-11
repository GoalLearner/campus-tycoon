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
  /** One tree on one cell. Three trees lift nearby lots about as much as one quad cell, for a little more money. */
  tree: 6_000,
  zoneLot: 15_000,
  /** Clearing is free. What comes back is set by the refund rule below. */
  clear: 0,
} as const;

/**
 * Refunds. Clearing something within this many ticks of paying for it is an
 * undo: the whole price comes back. A tick is a minute, so the player always
 * has at least one full minute. After that, clearing returns a share.
 */
export const UNDO_TICKS = 1;
export const REFUND_SHARE = 0.5;
