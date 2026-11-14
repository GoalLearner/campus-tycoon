/**
 * The turntable spin (DESIGN.md 43.6): while two fingers twist, the campus
 * swings round under them like a turntable seen from above at the view's
 * slant. Nothing leans and nothing turns upside down.
 *
 * On the screen that is the ground plane turned by the fingers' angle and
 * seen squashed, as the view squashes it: M(θ) = squash · turn(θ) · unsquash,
 * where the squash is the ground cell's height over its width. The flat ground
 * is one picture shown through M; every upright drawing keeps its picture and
 * only moves, by how far M moves the spot of ground it stands on.
 *
 * Past each 45-degree mark the view is drawn again a quarter further round,
 * so every drawing shows the side of the nearest quarter, and what is left of
 * the angle is never more than about 45 degrees.
 *
 * Plain numbers in and out: no Phaser, so it is tested on its own.
 */

/** A 2 by 2 matrix [[a, b], [c, d]], as a point x, y becomes a·x + b·y, c·x + d·y. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Degrees past a 45-degree mark before the view is drawn a quarter further round, so it does not flicker on the mark. */
export const SWITCH_MARGIN = 3;

/**
 * The turntable on the screen: the ground turned `degrees` clockwise as seen
 * on the screen, for a view whose ground cells are `squash` as tall as they
 * are wide.
 */
export function turntable(degrees: number, squash: number): Matrix {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // squash · turn · unsquash: [[1, 0], [0, k]] · [[cos, -sin], [sin, cos]] · [[1, 0], [0, 1 / k]]
  return { a: cos, b: -sin / squash, c: squash * sin, d: cos };
}

/** A point of the screen or the world, swung about `centre` by the matrix. */
export function spinAbout(point: Point, centre: Point, m: Matrix): Point {
  const x = point.x - centre.x;
  const y = point.y - centre.y;
  return { x: centre.x + m.a * x + m.b * y, y: centre.y + m.c * x + m.d * y };
}

/**
 * How many quarters round the view should be drawn for a spin of `degrees`,
 * given that it is drawn `shown` quarters round now: the nearest quarter, but
 * it moves on only once the angle is SWITCH_MARGIN past the mark between.
 */
export function quarterFor(degrees: number, shown: number): number {
  let quarter = shown;
  while (degrees - quarter * 90 > 45 + SWITCH_MARGIN) quarter += 1;
  while (degrees - quarter * 90 < -45 - SWITCH_MARGIN) quarter -= 1;
  return quarter;
}

/**
 * How big a picture of the ground must be, in the screen's pixels, to cover
 * the screen whatever the angle: the ellipse the screen's corners sweep as
 * the ground turns under them, a little over.
 */
export function stillSize(width: number, height: number, squash: number): { width: number; height: number } {
  const reach = Math.hypot(width / 2, height / 2 / squash) * 1.04;
  return { width: Math.ceil(reach * 2), height: Math.ceil(Math.max(height * 1.04, reach * 2 * squash)) };
}
