/**
 * Times as the player's device writes them (DESIGN.md 75.1): "9:48 AM" where the phone keeps a 12-hour clock, "09:48"
 * where it keeps a 24-hour one. The hour is the player's own; nothing in the simulation reads it.
 */

let forced: 12 | 24 | null = null;
let found: boolean | null = null;

/** Dev pages and tests: write times on a 12- or 24-hour clock whatever the device says, or null to follow it again. */
export function forceClockCycle(cycle: 12 | 24 | null): void {
  forced = cycle;
}

/** True where the device keeps a 24-hour clock, as its settings say. */
export function uses24Hour(): boolean {
  if (forced !== null) return forced === 24;
  if (found === null) {
    try {
      const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
      found = cycle === 'h23' || cycle === 'h24';
    } catch {
      found = false;
    }
  }
  return found;
}

/**
 * An hour of the day, from 0 up to 24 (and past it for the hours after midnight), as the device writes it: "9:48 AM"
 * or "09:48". With `short`, a whole hour drops its minutes on a 12-hour clock: "9 PM", as people say it.
 */
export function clockText(hour: number, short = false): string {
  const h = ((hour % 24) + 24) % 24;
  let whole = Math.floor(h + 1e-6);
  let minutes = Math.round((h - whole) * 60);
  if (minutes === 60) {
    whole = (whole + 1) % 24;
    minutes = 0;
  }
  const mm = String(minutes).padStart(2, '0');
  if (uses24Hour()) return `${String(whole).padStart(2, '0')}:${mm}`;
  const twelve = whole % 12 === 0 ? 12 : whole % 12;
  return `${twelve}${short && minutes === 0 ? '' : `:${mm}`} ${whole < 12 ? 'AM' : 'PM'}`;
}
