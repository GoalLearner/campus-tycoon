/**
 * The isometric projection. A cell's screen position is the top corner of its
 * ground diamond. Cells further from the camera have a smaller x + y and are
 * drawn first.
 */
export class Iso {
  constructor(
    readonly halfWidth: number,
    readonly halfHeight: number,
  ) {}

  /** World position of the top corner of a cell's diamond. Accepts fractions. */
  toWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - y) * this.halfWidth, y: (x + y) * this.halfHeight };
  }

  /** The cell under a world point, as whole numbers. May be outside the map. */
  toCell(worldX: number, worldY: number): { x: number; y: number } {
    const u = worldX / this.halfWidth;
    const v = worldY / this.halfHeight;
    return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) };
  }

  /** The four corners of a cell's diamond, clockwise from the top. */
  diamond(x: number, y: number): Array<{ x: number; y: number }> {
    const top = this.toWorld(x, y);
    return [
      top,
      { x: top.x + this.halfWidth, y: top.y + this.halfHeight },
      { x: top.x, y: top.y + this.halfHeight * 2 },
      { x: top.x - this.halfWidth, y: top.y + this.halfHeight },
    ];
  }

  /** Draw order for things standing on a cell. Ground comes just before the things on it. */
  depth(x: number, y: number, layer: 0 | 1 | 2): number {
    return (x + y) * 4 + layer;
  }

  /** The world rectangle that holds a whole map, with room for tall buildings at the top. */
  bounds(width: number, height: number): { x: number; y: number; width: number; height: number } {
    const left = -height * this.halfWidth;
    const right = width * this.halfWidth;
    const bottom = (width + height) * this.halfHeight;
    return { x: left, y: -200, width: right - left, height: bottom + 200 + 120 };
  }
}
