/**
 * Time constants. One tick is one real minute, so a real day and a game year
 * (one real week) are both whole numbers of ticks. See DESIGN.md section 4.
 */
export const TICK_MS = 60_000;
export const REAL_MS_PER_GAME_YEAR = 7 * 24 * 60 * 60 * 1000;

export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
export const TICKS_PER_YEAR = REAL_MS_PER_GAME_YEAR / TICK_MS;
export const DAYS_PER_YEAR = TICKS_PER_YEAR / TICKS_PER_DAY;

/** Catch-up never simulates more than this. Longer absences drop whole weeks. */
export const MAX_CATCHUP_TICKS = 30 * TICKS_PER_DAY;

/** A new game opens this many minutes before the first class moves in. */
export const FIRST_INTAKE_TICK = 15;

/** Days of the week, counted from 1. Day 1 is the fall intake. */
export const SPRING_INTAKE_DAY = 4;
export const GRADUATION_DAY = 6;
export const YEAR_END_DAY = 7;

/**
 * The shortest any window the player can act in may last (DESIGN.md 2.3).
 * Once a day is the slowest rhythm the game supports. Someone who looks in
 * every 24 hours always gets a visit inside a window this long, with half a
 * day left for what they build to open.
 */
export const MIN_WINDOW_TICKS = 36 * TICKS_PER_HOUR;

/** [T] Turned-away applicants wait this long after an intake. It was nine hours until 2026-11-11. */
export const WAITLIST_TICKS = MIN_WINDOW_TICKS;

/** [T] Forecasts and growth are re-evaluated this often. */
export const GROWTH_EVAL_TICKS = 15;

/** [T] The anchor hour is this long after the player's day usually starts (DESIGN.md 4.2). */
export const ANCHOR_AFTER_WAKE_TICKS = 2 * TICKS_PER_HOUR;
/** The hour a day is taken to start when the player has not said: seven in the morning, their own time. */
export const DEFAULT_WAKE_HOUR = 7;
/** The anchor can be moved again this long after it was last moved: four real weeks. */
export const ANCHOR_RECHARGE_TICKS = 4 * TICKS_PER_YEAR;
