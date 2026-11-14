import { describe, expect, it } from 'vitest';
import { quarterFor, spinAbout, stillSize, SWITCH_MARGIN, turntable } from '../src/app/spin';
import { Iso, nextTurn, type Turn } from '../src/game/iso';

/**
 * The turntable spin (DESIGN.md 43.6): the campus swings round under the
 * fingers, seen at the view's slant, and a quarter of it is exactly the view
 * drawn a quarter round.
 */

/** The penzilla pack's ground grid, as the art manifest gives it. */
const GRID = { halfWidth: 66, halfHeight: 37.640625 };
const SQUASH = GRID.halfHeight / GRID.halfWidth;

describe('the turntable', () => {
  it('does nothing at no angle, and comes home after a whole turn', () => {
    for (const degrees of [0, 360, -360]) {
      const m = turntable(degrees, SQUASH);
      expect(m.a).toBeCloseTo(1, 9);
      expect(m.b).toBeCloseTo(0, 9);
      expect(m.c).toBeCloseTo(0, 9);
      expect(m.d).toBeCloseTo(1, 9);
    }
  });

  it('turns the ground, so a point of it keeps its distance on the ground: it goes round an ellipse, not a circle', () => {
    const centre = { x: 400, y: 300 };
    const start = { x: 520, y: 300 };
    for (let degrees = 0; degrees <= 360; degrees += 15) {
      const at = spinAbout(start, centre, turntable(degrees, SQUASH));
      // Back on the ground's own scale, the distance from the middle is the same all the way round.
      const groundDistance = Math.hypot(at.x - centre.x, (at.y - centre.y) / SQUASH);
      expect(groundDistance).toBeCloseTo(120, 6);
    }
    // A quarter round, a point to the right of the middle is below it, closer in by the squash.
    const quarter = spinAbout(start, centre, turntable(90, SQUASH));
    expect(quarter.x).toBeCloseTo(400, 6);
    expect(quarter.y).toBeCloseTo(300 + 120 * SQUASH, 6);
  });

  it('a quarter of it is the view drawn a quarter round, at every turn, either way', () => {
    const iso = new Iso(GRID.halfWidth, GRID.halfHeight);
    iso.setMap(42, 48);
    const pivot = { x: 30.4, y: 17.8 };
    const points = [
      { x: 0, y: 0 },
      { x: 41.5, y: 3.25 },
      { x: 12, y: 47 },
      { x: 33.5, y: 7.5 },
      { x: 20.1, y: 30.9 },
    ];
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      for (const by of [1, -1, 2, 3]) {
        iso.setTurn(turn);
        const centre = iso.toWorld(pivot.x, pivot.y);
        const before = points.map((p) => iso.toWorld(p.x, p.y));
        iso.setTurn(nextTurn(turn, by));
        const centreAfter = iso.toWorld(pivot.x, pivot.y);
        const m = turntable(by * 90, SQUASH);
        points.forEach((p, n) => {
          const spun = spinAbout(before[n]!, centre, m);
          const drawn = iso.toWorld(p.x, p.y);
          // The same offset from the middle of the screen as the view drawn turned.
          expect(spun.x - centre.x).toBeCloseTo(drawn.x - centreAfter.x, 6);
          expect(spun.y - centre.y).toBeCloseTo(drawn.y - centreAfter.y, 6);
        });
      }
    }
  });

  it('spinning part of a quarter, then drawing the view a quarter round and spinning the rest back, is one spin', () => {
    const iso = new Iso(GRID.halfWidth, GRID.halfHeight);
    iso.setMap(42, 48);
    const pivot = { x: 25, y: 20 };
    const p = { x: 37.5, y: 9.25 };
    for (const total of [20, 50, 70, 100, 170, -60, -135]) {
      iso.setTurn(0);
      const whole = spinAbout(iso.toWorld(p.x, p.y), iso.toWorld(pivot.x, pivot.y), turntable(total, SQUASH));
      const quarter = quarterFor(total, 0);
      iso.setTurn(nextTurn(0, quarter));
      const centre = iso.toWorld(pivot.x, pivot.y);
      const rest = spinAbout(iso.toWorld(p.x, p.y), centre, turntable(total - quarter * 90, SQUASH));
      // Measured from the middle of the screen, which stays the same map point at every turn.
      iso.setTurn(0);
      const start = iso.toWorld(pivot.x, pivot.y);
      expect(rest.x - centre.x).toBeCloseTo(whole.x - start.x, 6);
      expect(rest.y - centre.y).toBeCloseTo(whole.y - start.y, 6);
    }
  });
});

describe('the view drawn a quarter further round', () => {
  it('moves on only a little past each 45-degree mark, and back the same way', () => {
    expect(quarterFor(0, 0)).toBe(0);
    expect(quarterFor(45 + SWITCH_MARGIN - 0.5, 0)).toBe(0);
    expect(quarterFor(45 + SWITCH_MARGIN + 0.5, 0)).toBe(1);
    // Back down past the mark, it stays a quarter round until it is as far past the mark the other way.
    expect(quarterFor(45, 1)).toBe(1);
    expect(quarterFor(45 - SWITCH_MARGIN - 0.5, 1)).toBe(0);
    expect(quarterFor(-50, 0)).toBe(-1);
  });

  it('keeps up with a spin of more than a quarter in one go', () => {
    expect(quarterFor(181, 0)).toBe(2);
    expect(quarterFor(275, 0)).toBe(3);
    expect(quarterFor(360, 0)).toBe(4);
    expect(quarterFor(-200, 0)).toBe(-2);
  });
});

describe('the picture of the ground', () => {
  it('covers the screen at every angle', () => {
    const screen = { width: 1170, height: 2532 };
    const size = stillSize(screen.width, screen.height, SQUASH);
    const centre = { x: 0, y: 0 };
    for (let degrees = 0; degrees < 360; degrees += 5) {
      // Each corner of the screen, taken back through the turn, must fall inside the picture.
      const back = turntable(-degrees, SQUASH);
      for (const corner of [
        { x: -screen.width / 2, y: -screen.height / 2 },
        { x: screen.width / 2, y: -screen.height / 2 },
        { x: screen.width / 2, y: screen.height / 2 },
        { x: -screen.width / 2, y: screen.height / 2 },
      ]) {
        const at = spinAbout(corner, centre, back);
        expect(Math.abs(at.x)).toBeLessThanOrEqual(size.width / 2);
        expect(Math.abs(at.y)).toBeLessThanOrEqual(size.height / 2);
      }
    }
  });
});
