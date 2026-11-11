import { hasTimeSkip } from './platform';

/**
 * The app's one source of "now". The simulation never reads the wall clock
 * itself: it is handed times from here. The time-skip panel (dev builds and
 * tester builds only) shifts this clock to skip ahead, and the shift is
 * remembered so a reload does not look like the clock ran backward.
 */

const OFFSET_KEY = 'campus-tycoon.devClockOffset';

function readOffset(): number {
  if (!hasTimeSkip) return 0;
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeOffset(value: number): void {
  try {
    if (value === 0) localStorage.removeItem(OFFSET_KEY);
    else localStorage.setItem(OFFSET_KEY, String(value));
  } catch {
    // Private browsing may refuse storage. The skip still works until reload.
  }
}

let offsetMs = readOffset();

export const clock = {
  now(): number {
    return Date.now() + offsetMs;
  },

  /** Time-skip builds only: jump the clock forward. */
  skip(ms: number): void {
    if (!hasTimeSkip) return;
    offsetMs += ms;
    writeOffset(offsetMs);
  },

  offset(): number {
    return offsetMs;
  },

  /**
   * Time-skip builds only: a loaded save that is ahead of this clock was
   * skipped ahead by a tester whose remembered shift has since been lost.
   * Move the clock up to the save, so the campus does not sit frozen until
   * real time catches up.
   */
  follow(lastSimulatedAt: number): void {
    if (!hasTimeSkip) return;
    const behind = lastSimulatedAt - this.now();
    if (behind <= 0) return;
    offsetMs += behind;
    writeOffset(offsetMs);
  },

  /** Forget every skip. Used when starting a new game. */
  reset(): void {
    offsetMs = 0;
    writeOffset(0);
  },
};
