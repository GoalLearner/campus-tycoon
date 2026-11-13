import { describe, expect, it } from 'vitest';
import { CLOCK_SLACK_MS, clockMark, type ClockBefore } from '../../server/src/clock';

/** The clock rules of DESIGN.md 42.9, as the server keeps them (48). */

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T = Date.UTC(2026, 10, 13, 12);

/** A run of uploads: each is [server time, the save's own clock]. Returns each upload's mark. */
function run(uploads: Array<[number, number]>): Array<{ leadMs: number; ahead: boolean }> {
  let before: ClockBefore | null = null;
  return uploads.map(([server, simulated]) => {
    const mark = clockMark(before, simulated, server);
    before = { uploadedAt: server, simulatedAt: simulated, leadMs: mark.leadMs };
    return { leadMs: mark.leadMs, ahead: mark.aheadUntil > server };
  });
}

describe('the clock rules', () => {
  it('never marks honest play: every ten minutes for a week, with the phone a few minutes fast or slow', () => {
    for (const drift of [-30 * 60_000, -3 * 60_000, 0, 4 * 60_000]) {
      const uploads: Array<[number, number]> = [];
      for (let t = 0; t < 7 * DAY; t += 10 * 60_000) uploads.push([T + t, T + t + drift]);
      expect(run(uploads).some((one) => one.ahead), `drift ${drift}`).toBe(false);
    }
  });

  it('never marks a phone that was put away: days with no uploads, then catch-up', () => {
    expect(run([[T, T], [T + 3 * DAY, T + 3 * DAY], [T + 3 * DAY + HOUR, T + 3 * DAY + HOUR]]).some((one) => one.ahead)).toBe(false);
  });

  it('marks a save whose own clock runs ahead of the server’s, until the server’s catches up', () => {
    const marks = run([[T, T + DAY]]);
    expect(marks[0]!.ahead).toBe(true);
    expect(marks[0]!.leadMs).toBe(DAY);
    expect(clockMark(null, T + DAY, T).aheadUntil).toBe(T + DAY);
    // Slack: a phone ten minutes fast is not ahead.
    expect(clockMark(null, T + CLOCK_SLACK_MS, T).aheadUntil).toBe(0);
  });

  it('marks a save that advanced further between uploads than real time did, even once the phone’s clock is put right', () => {
    // A day of game in an hour: the phone's clock moved a day ahead, uploaded, then was put back.
    const marks = run([
      [T, T],
      [T + HOUR, T + DAY + HOUR],
      // Put back: the save sits still until real time reaches it, so its clock does not move.
      [T + 2 * HOUR, T + DAY + HOUR],
      [T + 12 * HOUR, T + DAY + HOUR],
      // A day later real time has caught up, and the save moves on with it.
      [T + DAY + 2 * HOUR, T + DAY + 2 * HOUR],
    ]);
    expect(marks.map((one) => one.ahead)).toEqual([false, true, true, true, false]);
    // A save from a phone whose clock was a day behind, put right: it gains a day it never played.
    expect(run([[T, T - DAY], [T + HOUR, T + HOUR]]).map((one) => one.ahead)).toEqual([false, true]);
  });

  it('bans nothing: a mark is only a time when real time catches up', () => {
    const mark = clockMark(null, T + 2 * DAY, T);
    expect(mark).toEqual({ leadMs: 2 * DAY, aheadUntil: T + 2 * DAY });
  });
});
