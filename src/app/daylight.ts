import { momentAt, type GameDate } from '../sim/calendar';
import { TICK_MS } from '../sim/config/time';
import type { Clock } from '../sim/types';
import { clock } from './clock';

/**
 * Time of day. It follows the game's own clock (the owner, 2026-11-17: "There needs to be a real in game functional
 * clock that represents the time for those in the simulation"; DESIGN.md 84), read from the same calendar as the date:
 * a game day is about 28 real minutes in the fall, a game hour about 70 real seconds. It replaced the player's own
 * clock (28.1, 75.1).
 *
 * It is for show only: the light over the map, the street lamps, and how many students are out and where they are
 * going. Nothing in the simulation reads it. It is worked out from the game's ticks, so a changed time zone or a wrong
 * device clock does not move it.
 */

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Daylight {
  period: DayPeriod;
  /** The colour laid over the map, multiplied into it. */
  colour: number;
  /** How strongly, from 0 for plain daylight to 1. */
  strength: number;
  /** How lit the street lamps are, from 0 to 1. */
  lamps: number;
}

/**
 * The light at each hour: [hour, red, green, blue, strength]. Hours between are blended.
 *
 * On the game's clock a whole day and night pass in about 28 real minutes, so the night is kept short and the campus
 * is mostly seen in daylight (DESIGN.md 84.2): about half of each game day is daylight, 6 AM to 6:15 PM, and full
 * night is 10:30 PM to 4 AM, about six and a half real minutes. Dusk, from 5:30 PM, and dawn, from 4 AM, each take
 * four or five game hours, about five real minutes, never a blink. The clock still reads the true hour.
 */
const LIGHT: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0x30, 0x3e, 0x78, 0.6],
  [4, 0x30, 0x3e, 0x78, 0.6],
  [5.25, 0xff, 0xb0, 0x7a, 0.22],
  [6.25, 0xff, 0xf1, 0xd6, 0.06],
  [8, 0xff, 0xff, 0xff, 0],
  [17.5, 0xff, 0xff, 0xff, 0],
  [19, 0xff, 0xb4, 0x6b, 0.2],
  [20.75, 0x8a, 0x6a, 0xa8, 0.4],
  [22.5, 0x30, 0x3e, 0x78, 0.6],
  [24, 0x30, 0x3e, 0x78, 0.6],
];

/** Lamps come on through the early evening and go off after dawn. */
const LAMPS_ON = [18.5, 19.5] as const;
const LAMPS_OFF = [5, 6] as const;

export function periodAt(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const ramp = (hour: number, from: number, to: number): number => Math.max(0, Math.min(1, (hour - from) / (to - from)));

/** The light at an hour of the day, from 0 up to 24. */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  let next = 1;
  while (next < LIGHT.length - 1 && LIGHT[next]![0] <= h) next += 1;
  const a = LIGHT[next - 1]!;
  const b = LIGHT[next]!;
  const t = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
  const mix = (i: 1 | 2 | 3): number => Math.round(a[i] + (b[i] - a[i]) * t);
  const lamps = h >= 12 ? ramp(h, LAMPS_ON[0], LAMPS_ON[1]) : 1 - ramp(h, LAMPS_OFF[0], LAMPS_OFF[1]);
  return { period: periodAt(h), colour: (mix(1) << 16) | (mix(2) << 8) | mix(3), strength: a[4] + (b[4] - a[4]) * t, lamps };
}

// ------------------------------------------------------ the hour shown --

/**
 * The "View at" slider (DESIGN.md 75.4): while the Today strip shows another hour, the light and the crowd show that
 * hour. It is never saved, and closing the strip puts the game's clock back. It replaced the Menu's "Daylight at any
 * hour" (28.4), whose old stored choice is forgotten here.
 */
let viewing: number | null = null;
/** Dev builds and screenshots: an hour to show instead of the clock's. */
let forcedHour: number | null = null;

try {
  localStorage.removeItem('campus-tycoon.alwaysDaylight');
} catch {
  // Storage is blocked: there is nothing stored to forget.
}

/** Show the campus at an hour of the day, from 0 up to 24, or null for the game's clock again. */
export function viewAt(hour: number | null): void {
  viewing = hour === null ? null : ((hour % 24) + 24) % 24;
}

/** The hour the slider shows, or null when the campus shows the game's clock. */
export function viewedHour(): number | null {
  return viewing;
}

export function forceHour(hour: number | null): void {
  forcedHour = hour;
}

/** Dev builds and screenshots: the game's clock set to an hour, under the View at slider (75.4). */
let clockAt: number | null = null;

export function forceClock(hour: number | null): void {
  clockAt = hour;
}

/** The game whose clock is shown: set once by the store, and read each time the hour is wanted. */
let game: (() => Pick<Clock, 'tick' | 'week' | 'nextTickAt'> | null) | null = null;

export function followGame(read: (() => Pick<Clock, 'tick' | 'week' | 'nextTickAt'> | null) | null): void {
  game = read;
}

/**
 * The game's clock at a real moment: its ticks, and how far it is through the real minute to the next one, so the hour
 * runs on smoothly between ticks instead of jumping a game hour each real minute. Only the part of a tick still to come
 * reads the real time, and never more than one tick of it.
 */
export function gameMoment(at: Pick<Clock, 'tick' | 'week' | 'nextTickAt'>, now: number): Pick<Clock, 'tick' | 'week'> {
  const through = Math.max(0, Math.min(0.999, 1 - (at.nextTickAt - now) / TICK_MS));
  return { tick: at.tick + through, week: at.week };
}

/** A day on the game's clock: its running count (one more each game midnight), its date and an hour of it. */
export interface ShownMoment {
  index: number;
  date: GameDate;
  hour: number;
}

const NO_GAME: ShownMoment = { index: 0, date: { month: 8, day: 19, weekday: 3 }, hour: 12 };

/** Asked many times a frame: the clock is read again only when the real time has moved on a little, or the game has. */
let last: { now: number; tick: number; next: number; moment: ShownMoment } = { now: -1, tick: -1, next: -1, moment: NO_GAME };

/** Where the game's clock stands now. Before a game is loaded, noon on the first day of the fall. */
export function gameNow(): ShownMoment {
  const at = game?.() ?? null;
  if (!at) return NO_GAME;
  const now = clock.now();
  if (Math.abs(now - last.now) >= 50 || at.tick !== last.tick || at.nextTickAt !== last.next) last = { now, tick: at.tick, next: at.nextTickAt, moment: momentAt(gameMoment(at, now)) };
  return last.moment;
}

/** The hour on the game's clock, from 0 up to 24. Noon before a game is loaded. */
export function clockHour(): number {
  if (clockAt !== null) return clockAt;
  return gameNow().hour;
}

/** The hour to show now: the slider's while the Today strip shows one, or the game's clock. */
export function shownHour(): number {
  if (forcedHour !== null) return forcedHour;
  if (viewing !== null) return viewing;
  return clockHour();
}

/** The game's day now, at the hour shown: what a student's day and the campus's are read at. */
export function shownMoment(): ShownMoment {
  const now = gameNow();
  return { index: now.index, date: now.date, hour: shownHour() };
}

export function currentDaylight(): Daylight {
  return daylightAt(shownHour());
}
