import { describe, expect, it } from 'vitest';
import { twistMove, twistQuarters, twistStart, TWIST_DEGREES, type Finger, type Twist } from '../src/app/twist';

/**
 * The two-finger twist (DESIGN.md section 43): it must stay out of a pinch's
 * way, never zoom and turn in one gesture, and snap to the nearest quarter.
 */

/** Two fingers about a middle point, `gap` apart, the line between them at `degrees`. */
function fingers(gap: number, degrees: number, mid: Finger = { x: 200, y: 400 }): [Finger, Finger] {
  const r = (degrees * Math.PI) / 180;
  const dx = (Math.cos(r) * gap) / 2;
  const dy = (Math.sin(r) * gap) / 2;
  return [
    { x: mid.x - dx, y: mid.y - dy },
    { x: mid.x + dx, y: mid.y + dy },
  ];
}

/** Play a gesture from (gap, angle) to (gap, angle) in small steps, as fingers move. */
function play(from: [number, number], to: [number, number], steps = 30, start?: Twist): Twist {
  let twist = start ?? twistStart(...fingers(from[0], from[1]));
  for (let n = 1; n <= steps; n++) {
    const t = n / steps;
    twist = twistMove(twist, ...fingers(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t));
  }
  return twist;
}

describe('a pinch stays a pinch', () => {
  it('zooms in and out with the drift a hand makes, and never turns', () => {
    for (const drift of [-25, -12, 0, 12, 25]) {
      for (const [from, to] of [[160, 320], [300, 150], [180, 230]] as const) {
        const twist = play([from, 20], [to, 20 + drift]);
        expect(twist.mode).toBe('zoom');
        expect(twistQuarters(twist)).toBe(0);
      }
    }
  });

  it('stays a zoom for good, however far the fingers then turn', () => {
    const zoomed = play([200, 0], [260, 5]);
    expect(zoomed.mode).toBe('zoom');
    const after = play([260, 5], [260, 120], 30, zoomed);
    expect(after.mode).toBe('zoom');
    expect(twistQuarters(after)).toBe(0);
  });

  it('is undecided, and turns nothing, for a small twist of the hand', () => {
    const twist = play([200, 10], [205, 10 + TWIST_DEGREES - 6]);
    expect(twist.mode).toBe('open');
    expect(twistQuarters(twist)).toBe(0);
  });
});

describe('a twist turns the view', () => {
  it('is a twist once the fingers turn well past a pinch, at about the same gap', () => {
    const twist = play([200, 0], [204, 60]);
    expect(twist.mode).toBe('twist');
    expect(twistQuarters(twist)).toBe(1);
  });

  it('snaps to the nearest quarter, either way round', () => {
    expect(twistQuarters(play([200, 0], [200, 40]))).toBe(0);
    expect(twistQuarters(play([200, 0], [200, 50]))).toBe(1);
    expect(twistQuarters(play([200, 0], [200, 130]))).toBe(1);
    expect(twistQuarters(play([200, 0], [200, 140]))).toBe(2);
    expect(twistQuarters(play([200, 0], [200, -70]))).toBe(-1);
    expect(twistQuarters(play([200, 0], [200, -200], 60))).toBe(-2);
  });

  it('keeps counting across the line where angles wrap round', () => {
    const twist = play([200, 150], [200, 250]);
    expect(twist.turned).toBeCloseTo(100, 6);
    expect(twistQuarters(twist)).toBe(1);
  });

  it('stays a twist for good: spreading the fingers after does not zoom', () => {
    const twist = play([200, 0], [200, 60]);
    const after = play([200, 60], [320, 70], 30, twist);
    expect(after.mode).toBe('twist');
  });
});
