/**
 * The two-finger twist that turns the view (DESIGN.md section 43). It is the
 * only way to turn it: the Turn button is gone, by the owner's word.
 *
 * Two fingers on the map are a pinch: they pan and zoom, as they always have.
 * A gesture becomes a twist when the fingers turn past the angle a pinch
 * drifts while they stay about as far apart. Once a gesture has zoomed it can
 * never turn, and once it has turned it never zooms. While they twist, the
 * campus spins with them the whole way, as on a turntable (src/app/spin.ts,
 * DESIGN.md 43.6). When they lift, it settles to the nearest quarter in a short
 * ease, and the view drawn turned that far takes over.
 *
 * Plain numbers in, a decision out: no Phaser, so it is tested on its own.
 */

/** How far the fingers must turn, in degrees, before a gesture is a twist. A pinch drifts under this before it has zoomed. */
export const TWIST_DEGREES = 15;
/** How long the map takes to settle to the nearest quarter once the fingers lift. */
export const SETTLE_MS = 220;
/** How much the gap between the fingers may change, as a share, before a gesture is a zoom for good. */
export const ZOOM_SHARE = 0.1;

export interface Finger {
  x: number;
  y: number;
}

export interface Twist {
  /** Undecided, a zoom for good, or a twist for good. */
  mode: 'open' | 'zoom' | 'twist';
  /** The gap between the fingers when the gesture began. */
  gap0: number;
  /** The angle of the line between them last time, in degrees, and how far it has turned since the start. */
  angle: number;
  turned: number;
}

const angleOf = (a: Finger, b: Finger): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const gapOf = (a: Finger, b: Finger): number => Math.hypot(b.x - a.x, b.y - a.y);

export function twistStart(a: Finger, b: Finger): Twist {
  return { mode: 'open', gap0: gapOf(a, b), angle: angleOf(a, b), turned: 0 };
}

/** The fingers have moved. Returns the gesture as it now stands. Turning clockwise on the screen counts up. */
export function twistMove(twist: Twist, a: Finger, b: Finger): Twist {
  const angle = angleOf(a, b);
  let step = angle - twist.angle;
  // The short way round: from 179 degrees to -179 is two degrees on, not 358 back.
  if (step > 180) step -= 360;
  if (step < -180) step += 360;
  const turned = twist.turned + step;
  let mode = twist.mode;
  if (mode === 'open') {
    const stretch = twist.gap0 > 0 ? Math.abs(gapOf(a, b) / twist.gap0 - 1) : 0;
    if (stretch >= ZOOM_SHARE) mode = 'zoom';
    else if (Math.abs(turned) >= TWIST_DEGREES) mode = 'twist';
  }
  return { ...twist, mode, angle, turned };
}

/** Quarters to turn when the fingers lift: the nearest quarter of the angle, clockwise counting up. 0 for anything but a twist. */
export function twistQuarters(twist: Twist): number {
  if (twist.mode !== 'twist') return 0;
  return Math.round(twist.turned / 90) + 0;
}

/** The angle the map settles to when the fingers lift, in degrees: the nearest quarter of the angle turned. */
export function settleDegrees(twist: Twist): number {
  return twistQuarters(twist) * 90;
}

/**
 * The map's angle part way through settling, `t` from 0 to 1: quick at first
 * and gentle at the end, from where the fingers left it to the quarter.
 */
export function settling(from: number, to: number, t: number): number {
  const done = Math.min(1, Math.max(0, t));
  return from + (to - from) * (1 - (1 - done) ** 3);
}
