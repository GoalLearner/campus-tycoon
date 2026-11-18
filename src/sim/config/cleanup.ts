export type SwitchedOff = 'orderTimers' | 'pointOrders' | 'dailyOrder' | 'yearGoals' | 'momentPassFail' | 'trusteesDip' | 'greekProbationTimer' | 'traditionAlarm' | 'erasByRank';

/**
 * What the goals clean-up switched off (DESIGN.md 85; the owner, 2026-11-17: "Hiding is better than removing: anything
 * cut stays in the code, switched off, so it can come back"). Each is still in the code, behind its name here: setting
 * one to false brings it back as it was. The tests of what each did run with it switched back on (tests/helpers.ts
 * `switchedOn`), so the code kept is still known to work.
 */
export const SWITCHED_OFF: Record<SwitchedOff, boolean> = {
  /** An order's clock: "1 d 12 h left", and "Time ran out" when it passes (85.3). */
  orderTimers: true,
  /** Orders measured at one point of the calendar, which can be missed: `point` kinds in `ORDER_KINDS` (85.3). */
  pointOrders: true,
  /** One new order each real day, and a second for today (85.3). The refill replaces it. */
  dailyOrder: true,
  /** Goals for the year, set each fall and paid at commencement (85.4). */
  yearGoals: true,
  /** A moment of the calendar that is met or missed (85.5). It is a Big day now, which always pays. */
  momentPassFail: true,
  /** The trustees' letter costing 2 points of Reputation when the campus is not calmer within 2 real days (85.6). */
  trusteesDip: true,
  /** Greek Row's Warning turning to Probation after 36 hours (85.6). Hazing's own probation stays. */
  greekProbationTimer: true,
  /** Traditions' "At risk" warning and its alarm in the paper (85.6). */
  traditionAlarm: true,
  /** The eras opening by rank (85.1). They open by University Level now. */
  erasByRank: true,
};

/** True while a thing the clean-up switched off is still off. */
export const off = (what: SwitchedOff): boolean => SWITCHED_OFF[what];
