/**
 * The app's one source of "now". The simulation never reads the wall clock
 * itself: it is handed times from here. The dev panel shifts this clock to
 * skip ahead, and the shift is remembered so a reload does not look like the
 * clock ran backward.
 */

const OFFSET_KEY = 'campus-tycoon.devClockOffset';

function readOffset(): number {
  if (!import.meta.env.DEV) return 0;
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

let offsetMs = readOffset();

export const clock = {
  now(): number {
    return Date.now() + offsetMs;
  },

  /** Dev builds only: jump the clock forward. */
  skip(ms: number): void {
    offsetMs += ms;
    try {
      localStorage.setItem(OFFSET_KEY, String(offsetMs));
    } catch {
      // Private browsing may refuse storage. The skip still works until reload.
    }
  },

  offset(): number {
    return offsetMs;
  },

  /** Dev builds only: forget every skip. Used when starting a new game. */
  reset(): void {
    offsetMs = 0;
    try {
      localStorage.removeItem(OFFSET_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
