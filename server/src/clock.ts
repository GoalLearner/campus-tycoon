/**
 * The clock rules of DESIGN.md 42.9, for the boards to come. The server is the
 * clock: it stamps every upload with its own time. A save whose own clock runs
 * ahead of the server's, or that has advanced further between uploads than
 * real time passed between them, is marked until real time catches up. Nothing
 * is banned: a marked campus syncs as any other, and would only be left off
 * the boards.
 */

/** A phone's clock a little fast, or an upload a little slow, is not a lead. */
export const CLOCK_SLACK_MS = 10 * 60_000;

export interface ClockBefore {
  /** The server's time at the last upload. */
  uploadedAt: number;
  /** The save's own clock at the last upload. */
  simulatedAt: number;
  /** How far ahead of real time the save stood then. */
  leadMs: number;
}

export interface ClockMark {
  /** How far the save's clock stands ahead of what real time allows, in milliseconds. 0 when it does not. */
  leadMs: number;
  /** When the lead is more than the slack: the server time at which real time catches up with the save. 0 otherwise. */
  aheadUntil: number;
}

/**
 * The lead is the larger of two things. How far the save's clock is ahead of the server's now. And the lead it had
 * at its last upload, plus however much further its clock has gone since than real time has: a save moved a day
 * ahead keeps that day's lead, even after the phone's clock is put right, until a day has passed without it.
 */
export function clockMark(before: ClockBefore | null, simulatedAt: number, serverNow: number): ClockMark {
  const ahead = simulatedAt - serverNow;
  const carried = before === null ? 0 : before.leadMs + (simulatedAt - before.simulatedAt) - (serverNow - before.uploadedAt);
  const leadMs = Math.max(0, Math.round(ahead), Math.round(carried));
  return { leadMs, aheadUntil: leadMs > CLOCK_SLACK_MS ? serverNow + leadMs : 0 };
}
