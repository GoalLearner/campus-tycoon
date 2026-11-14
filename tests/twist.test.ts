import { describe, expect, it } from 'vitest';
import { settleDegrees, settling, twistMove, twistQuarters, twistStart, TWIST_DEGREES, type Finger, type Twist } from '../src/app/twist';

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

describe('the map turns with the fingers (DESIGN.md 43.5)', () => {
  it('is a twist from 15 degrees, with the fingers as far apart', () => {
    expect(TWIST_DEGREES).toBe(15);
    expect(play([200, 0], [201, 20]).mode).toBe('twist');
    expect(play([200, 0], [201, 12]).mode).toBe('open');
  });

  it('settles to the nearest quarter of the angle turned, either way round', () => {
    expect(settleDegrees(play([200, 0], [200, 30]))).toBe(0);
    expect(settleDegrees(play([200, 0], [200, 70]))).toBe(90);
    expect(settleDegrees(play([200, 0], [200, -170], 60))).toBe(-180);
    // A pinch settles nowhere.
    expect(settleDegrees(play([160, 0], [320, 5]))).toBe(0);
  });

  it('settles quickly at first and gently at the end, and ends on the quarter', () => {
    const from = 63;
    const to = 90;
    let last = from;
    for (let n = 1; n <= 20; n++) {
      const angle = settling(from, to, n / 20);
      expect(angle).toBeGreaterThanOrEqual(last);
      last = angle;
    }
    expect(settling(from, to, 0)).toBe(from);
    expect(settling(from, to, 1)).toBe(to);
    expect(settling(from, to, 1.4)).toBe(to);
    expect(settling(from, to, 0.5) - from).toBeGreaterThan((to - from) * 0.8);
  });
});
