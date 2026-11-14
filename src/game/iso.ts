/**
 * The isometric projection, and the turn of the view (DESIGN.md section 43).
 *
 * The map is always kept in its own cells: x grows to the south-east of the
 * screen and y to the south-west when the view is not turned. A turn lays the
 * same map down a quarter, a half or three quarters round. Everything that
 * draws gives the map's own cells and points, and this class says where they
 * fall in the turned view: its "view cells", which are drawn exactly as the
 * map's cells were before any turn existed.
 *
 * - A point of the map turns with the ground: a walker, a car, a tree's foot.
 * - A cell or a footprint keeps its shape: a building of two cells by one,
 *   turned a quarter, covers one cell by two of the view.
 * - A drawing is never turned, because the art is drawn from one side only. It
 *   keeps facing the viewer. A footprint that is not square is mirrored on a
 *   quarter or three-quarter turn so the drawing lies along it; mirroring a
 *   drawing about its top corner swaps the two ground axes of the view.
 * - Something placed on a drawing (a player on a court, a parked car) moves
 *   with the drawing: its spot is given in the drawing's own cells.
 *
 * Nothing here is saved and nothing in the simulation reads it.
 */

/** How far the view is turned: none, a quarter, a half or three quarters, clockwise on the screen. */
export type Turn = 0 | 1 | 2 | 3;
/** A way someone faces or walks, on the screen. */
export type Facing = 'ne' | 'se' | 'sw' | 'nw';
/** A way a car faces, along the ground: +x, +y, -x or -y. */
export type Heading = 'px' | 'py' | 'nx' | 'ny';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A quarter turn clockwise on the screen moves each of these to the next. */
const FACING_TURN: Record<Facing, Facing> = { se: 'sw', sw: 'nw', nw: 'ne', ne: 'se' };
const HEADING_TURN: Record<Heading, Heading> = { px: 'py', py: 'nx', nx: 'ny', ny: 'px' };
/** Mirroring a drawing swaps the view's two ground axes. */
const FACING_MIRROR: Record<Facing, Facing> = { se: 'sw', sw: 'se', ne: 'nw', nw: 'ne' };
const HEADING_MIRROR: Record<Heading, Heading> = { px: 'py', py: 'px', nx: 'ny', ny: 'nx' };

export function nextTurn(turn: Turn, by = 1): Turn {
  return ((((turn + by) % 4) + 4) % 4) as Turn;
}

export class Iso {
  private quarter: Turn = 0;
  private mapW = 0;
  private mapH = 0;

  constructor(
    readonly halfWidth: number,
    readonly halfHeight: number,
  ) {}

  /** The size of the map in its own cells. Needed before any turn. */
  setMap(width: number, height: number): void {
    this.mapW = width;
    this.mapH = height;
  }

  setTurn(turn: Turn): void {
    this.quarter = turn;
  }

  get turn(): Turn {
    return this.quarter;
  }

  /** True on a quarter or a three-quarter turn, when the view's axes are the map's swapped. */
  get odd(): boolean {
    return this.quarter % 2 === 1;
  }

  /** The size of the map in the view's cells. */
  get viewSize(): { w: number; h: number } {
    return this.odd ? { w: this.mapH, h: this.mapW } : { w: this.mapW, h: this.mapH };
  }

  // ---------------------------------------------------------------- turning --

  /** A point of the map, in the view's cells. */
  view(x: number, y: number): { x: number; y: number } {
    const W = this.mapW;
    const H = this.mapH;
    switch (this.quarter) {
      case 0:
        return { x, y };
      case 1:
        return { x: H - y, y: x };
      case 2:
        return { x: W - x, y: H - y };
      case 3:
        return { x: y, y: W - x };
    }
  }

  /** A point of the view's cells, back in the map's. */
  unview(x: number, y: number): { x: number; y: number } {
    const W = this.mapW;
    const H = this.mapH;
    switch (this.quarter) {
      case 0:
        return { x, y };
      case 1:
        return { x: y, y: H - x };
      case 2:
        return { x: W - x, y: H - y };
      case 3:
        return { x: W - y, y: x };
    }
  }

  /** The view cell a map cell becomes. */
  viewCell(x: number, y: number): { x: number; y: number } {
    const at = this.view(x + 0.5, y + 0.5);
    return { x: Math.round(at.x - 0.5), y: Math.round(at.y - 0.5) };
  }

  /** The map cell under a view cell. */
  unviewCell(x: number, y: number): { x: number; y: number } {
    const at = this.unview(x + 0.5, y + 0.5);
    return { x: Math.round(at.x - 0.5), y: Math.round(at.y - 0.5) };
  }

  /** A footprint of the map, in the view's cells: its top corner and its size. */
  viewBox(x: number, y: number, w: number, h: number): Box {
    const W = this.mapW;
    const H = this.mapH;
    switch (this.quarter) {
      case 0:
        return { x, y, w, h };
      case 1:
        return { x: H - y - h, y: x, w: h, h: w };
      case 2:
        return { x: W - x - w, y: H - y - h, w, h };
      case 3:
        return { x: y, y: W - x - w, w: h, h: w };
    }
  }

  /** The map cell one step of the view away: `dx` and `dy` are in the view's cells. */
  step(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
    const at = this.viewCell(x, y);
    return this.unviewCell(at.x + dx, at.y + dy);
  }

  /** A direction along the map's ground, as a direction of the view's. */
  dir(dx: number, dy: number): { x: number; y: number } {
    switch (this.quarter) {
      case 0:
        return { x: dx, y: dy };
      // Adding nought keeps a minus zero out of the answer.
      case 1:
        return { x: -dy + 0, y: dx };
      case 2:
        return { x: -dx + 0, y: -dy + 0 };
      case 3:
        return { x: dy, y: -dx + 0 };
    }
  }

  /** A way of facing worked out on the map, as it is on the screen. */
  face(facing: Facing): Facing {
    let out = facing;
    for (let n = 0; n < this.quarter; n++) out = FACING_TURN[out];
    return out;
  }

  /** A car's heading on the map, as it is drawn. */
  heading(heading: Heading): Heading {
    let out = heading;
    for (let n = 0; n < this.quarter; n++) out = HEADING_TURN[out];
    return out;
  }

  /** Which sides of a cell join a road or a path (1 north, 2 east, 4 south, 8 west), as the turned view draws them. */
  mask(mask: number): number {
    let out = mask & 15;
    for (let n = 0; n < this.quarter; n++) out = ((out << 1) | (out >> 3)) & 15;
    return out;
  }

  /** True when a drawing over this footprint is mirrored: a footprint that is not square, on a quarter or three-quarter turn. */
  mirrors(w: number, h: number): boolean {
    return this.odd && w !== h;
  }

  // ------------------------------------------------------------- the screen --

  /** World position of a point of the view's cells, with no turn: the projection itself. */
  project(x: number, y: number): { x: number; y: number } {
    return { x: (x - y) * this.halfWidth, y: (x + y) * this.halfHeight };
  }

  /** How far on the screen a step along the view's own ground axes is. For something drawn beside a figure. */
  offset(dx: number, dy: number): { x: number; y: number } {
    return this.project(dx, dy);
  }

  /** World position of a point of the map. Accepts fractions: a walker, a car, the middle of a building. */
  toWorld(x: number, y: number): { x: number; y: number } {
    const at = this.view(x, y);
    return this.project(at.x, at.y);
  }

  /** World position of the top corner of a cell's diamond, as drawn: where a tile or a one-cell drawing stands. */
  cellTop(x: number, y: number): { x: number; y: number } {
    const at = this.viewCell(x, y);
    return this.project(at.x, at.y);
  }

  /**
   * World position of the top corner of a one-cell drawing whose cell is
   * centred on a point of the map: where a car or a sign stands so that it is
   * on that point at every turn. Its drawing faces the viewer, so the spot it
   * stands on inside its cell is the same at every turn.
   */
  standTop(x: number, y: number): { x: number; y: number } {
    const at = this.toWorld(x, y);
    return { x: at.x, y: at.y - this.halfHeight };
  }

  /** World position of the top corner of a footprint, as drawn: where its drawing stands. */
  boxTop(x: number, y: number, w: number, h: number): { x: number; y: number } {
    const box = this.viewBox(x, y, w, h);
    return this.project(box.x, box.y);
  }

  /**
   * The point of the map under a spot given in a drawing's own cells, for the
   * thing with this footprint: a player on its court, a car on its lot. The
   * drawing faces the viewer at every turn, and is mirrored when `mirrors` says.
   */
  onDrawing(box: Box, localX: number, localY: number, mirrored = this.mirrors(box.w, box.h)): { x: number; y: number } {
    const top = this.viewBox(box.x, box.y, box.w, box.h);
    return this.unview(top.x + (mirrored ? localY : localX), top.y + (mirrored ? localX : localY));
  }

  /** The map point under a point of the world. */
  toMap(worldX: number, worldY: number): { x: number; y: number } {
    const u = worldX / this.halfWidth;
    const v = worldY / this.halfHeight;
    return this.unview((u + v) / 2, (v - u) / 2);
  }

  /** The map cell under a world point, as whole numbers. May be outside the map. */
  toCell(worldX: number, worldY: number): { x: number; y: number } {
    const u = worldX / this.halfWidth;
    const v = worldY / this.halfHeight;
    return this.unviewCell(Math.floor((u + v) / 2), Math.floor((v - u) / 2));
  }

  /** The four corners of a map cell's diamond as drawn, clockwise from the top. */
  diamond(x: number, y: number): Array<{ x: number; y: number }> {
    const top = this.cellTop(x, y);
    return [
      top,
      { x: top.x + this.halfWidth, y: top.y + this.halfHeight },
      { x: top.x, y: top.y + this.halfHeight * 2 },
      { x: top.x - this.halfWidth, y: top.y + this.halfHeight },
    ];
  }

  // ------------------------------------------------------------- draw order --

  /** Draw order for things standing on a map cell. Ground comes just before the things on it. */
  depth(x: number, y: number, layer: number): number {
    const at = this.viewCell(x, y);
    return (at.x + at.y) * 4 + layer;
  }

  /** How far forward a point of the map is drawn: the sum of its view cells. Draw order for people, cars and props. */
  sum(x: number, y: number): number {
    const at = this.view(x, y);
    return at.x + at.y;
  }

  /** The draw-order sum of a footprint's front cell, as drawn: everything behind it is behind all of it. */
  front(x: number, y: number, w: number, h: number): number {
    const box = this.viewBox(x, y, w, h);
    return box.x + box.w - 1 + box.y + box.h - 1;
  }

  /** The sum of a footprint's top cell, as drawn. */
  back(x: number, y: number, w: number, h: number): number {
    const box = this.viewBox(x, y, w, h);
    return box.x + box.y;
  }

  /** The world rectangle that holds a whole map, with room for tall buildings at the top. */
  bounds(width: number, height: number): { x: number; y: number; width: number; height: number } {
    const w = this.odd ? height : width;
    const h = this.odd ? width : height;
    const left = -h * this.halfWidth;
    const right = w * this.halfWidth;
    const bottom = (w + h) * this.halfHeight;
    return { x: left, y: -200, width: right - left, height: bottom + 200 + 120 };
  }
}

/** A way of facing, mirrored with a drawing. */
export function mirrorFacing(facing: Facing): Facing {
  return FACING_MIRROR[facing];
}

/** A car's heading, mirrored with the lot it stands on. */
export function mirrorHeading(heading: Heading): Heading {
  return HEADING_MIRROR[heading];
}

/** The way someone moving by this much on the screen's ground faces. Both are in the view's cells. */
export function facingOf(dx: number, dy: number): Facing {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
}
