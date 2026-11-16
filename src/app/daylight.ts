/**
 * Time of day. It follows the player's own clock, not the game's: a game day
 * passes in about half a real hour, far too fast for a day and a night.
 *
 * It is for show only: the light over the map, the street lamps, and how many
 * students are out and where they are going. Nothing in the simulation reads
 * it, so a changed time zone or a wrong device clock changes only what the
 * campus looks like. See DESIGN.md section 28.
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

/** The light at each hour: [hour, red, green, blue, strength]. Hours between are blended. */
const LIGHT: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0x30, 0x3e, 0x78, 0.6],
  [5, 0x30, 0x3e, 0x78, 0.6],
  [6.5, 0xff, 0xb0, 0x7a, 0.22],
  [8, 0xff, 0xf1, 0xd6, 0.06],
  [11, 0xff, 0xff, 0xff, 0],
  [16, 0xff, 0xff, 0xff, 0],
  [18, 0xff, 0xb4, 0x6b, 0.2],
  [19.5, 0x8a, 0x6a, 0xa8, 0.4],
  [21, 0x30, 0x3e, 0x78, 0.6],
  [24, 0x30, 0x3e, 0x78, 0.6],
];

/** Lamps come on through the early evening and go off after dawn. */
const LAMPS_ON = [17.5, 18.5] as const;
const LAMPS_OFF = [6, 7] as const;

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
 * hour. It is never saved, and closing the strip puts the player's own clock back. It replaced the Menu's "Daylight at
 * any hour" (28.4), whose old stored choice is forgotten here.
 */
let viewing: number | null = null;
/** Dev builds and screenshots: an hour to show instead of the clock's. */
let forcedHour: number | null = null;

try {
  localStorage.removeItem('campus-tycoon.alwaysDaylight');
} catch {
  // Storage is blocked: there is nothing stored to forget.
}

/** Show the campus at an hour of the day, from 0 up to 24, or null for the player's own clock again. */
export function viewAt(hour: number | null): void {
  viewing = hour === null ? null : ((hour % 24) + 24) % 24;
}

/** The hour the slider shows, or null when the campus shows the player's own clock. */
export function viewedHour(): number | null {
  return viewing;
}

export function forceHour(hour: number | null): void {
  forcedHour = hour;
}

/** Dev builds and screenshots: the player's own clock set to an hour, under the View at slider (75.4). */
let clockAt: number | null = null;

export function forceClock(hour: number | null): void {
  clockAt = hour;
}

/** The hour on the player's own clock, from 0 up to 24. */
export function clockHour(now: Date = new Date()): number {
  if (clockAt !== null) return clockAt;
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

/** The hour to show now: the slider's while the Today strip shows one, or the player's own. */
export function shownHour(now: Date = new Date()): number {
  if (forcedHour !== null) return forcedHour;
  if (viewing !== null) return viewing;
  return clockHour(now);
}

export function currentDaylight(now: Date = new Date()): Daylight {
  return daylightAt(shownHour(now));
}
