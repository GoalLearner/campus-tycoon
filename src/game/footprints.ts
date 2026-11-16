import { PLACED, type GameState } from '../sim';
import type { Iso } from './iso';

/**
 * People in front of a building are drawn over it, and people behind it under it, at every turn of the view (DESIGN.md
 * 69.5, the owner's "This guy is stuck on building"). A person is drawn in order by where their feet are, a building by
 * its front cell, and the two disagree right beside a building: before a wide one's far corners a person was drawn
 * under it, and just behind a shallow one's back wall over it, as if they stood on the wall. This keeps each person on
 * the right side of any building next to them.
 */

/** The families of hand-placed things that stand up like a building. Flat ones (courts, lawns, ponds) and small ones
 * (benches, bins, lamps, decorations) sort by where people stand, as before. */
const STANDING: ReadonlySet<string> = new Set(['library', 'dining', 'store', 'recreation', 'tutoring', 'medical', 'safety', 'landmark', 'reward', 'era', 'lab', 'chapter', 'yard', 'athletics']);

/** How far past a building's own draw order a person is kept, before or behind it. */
const CLEAR = 0.6;

export class Footprints {
  /** For each cell, the footprint standing on it, or -1. */
  private at = new Int32Array(0);
  private boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  /** Each footprint as the view is turned now, and its own draw order: worked out once a turn, not each frame. */
  private viewed: Array<{ x0: number; y0: number; x1: number; y1: number; drawn: number }> = [];
  private viewedTurn = -1;
  /** For each cell, whether any footprint is on it or beside it: most people are nowhere near one. */
  private near = new Uint8Array(0);
  private width = 0;
  private height = 0;

  constructor(private iso: Iso) {}

  /** Read the buildings again. Called whenever the map changes. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings, placed } = state.map;
    this.width = width;
    this.height = height;
    this.at = new Int32Array(width * height).fill(-1);
    this.boxes = [];
    // A hall on a lot is drawn one cell at a time, each cell its own building; a house in town is one cell.
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const hall = cell.kind === 'lot' && cell.buildingId !== null && (buildings[cell.buildingId]?.stage ?? 0) >= 1;
      if (!hall && cell.kind !== 'house') continue;
      this.at[i] = this.boxes.length;
      this.boxes.push({ x: i % width, y: Math.floor(i / width), w: 1, h: 1 });
    }
    for (const one of placed) {
      if (!one) continue;
      const spec = PLACED[one.type];
      if (spec.flat || !STANDING.has(spec.family)) continue;
      const k = this.boxes.length;
      this.boxes.push({ x: one.x, y: one.y, w: one.w, h: one.h });
      for (let y = one.y; y < one.y + one.h; y++) for (let x = one.x; x < one.x + one.w; x++) if (x >= 0 && y >= 0 && x < width && y < height) this.at[y * width + x] = k;
    }
    this.near = new Uint8Array(width * height);
    for (let i = 0; i < this.at.length; i++) {
      if (this.at[i]! < 0) continue;
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height) this.near[(y + dy) * width + x + dx] = 1;
    }
    this.viewedTurn = -1;
  }

  /** The footprints as the view is turned now, worked out again only when the turn changes. */
  private viewBoxes(): Array<{ x0: number; y0: number; x1: number; y1: number; drawn: number }> {
    const turn = this.iso.turn;
    if (turn !== this.viewedTurn) {
      this.viewedTurn = turn;
      this.viewed = this.boxes.map((b) => {
        const box = this.iso.viewBox(b.x, b.y, b.w, b.h);
        // The building's own order: its front cell, as drawn (CampusScene and Placed draw it so).
        return { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h, drawn: (box.x + box.w - 1 + box.y + box.h - 1) * 4 + 1 };
      });
    }
    return this.viewed;
  }

  /** True when a point of the map is inside a building's footprint. */
  inside(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height && this.at[cy * this.width + cx]! >= 0;
  }

  /**
   * The draw order for a person standing at (x, y) of the map, whose own order (by where their feet are) is `own`:
   * over any building next to them that they stand in front of, under any they stand behind, at the view's turn.
   */
  depth(x: number, y: number, own: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height || !this.near[cy * this.width + cx]) return own;
    const boxes = this.viewBoxes();
    const v = this.iso.view(x, y);
    let out = own;
    let last = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const k = this.at[ny * this.width + nx]!;
        if (k < 0 || k === last) continue;
        last = k;
        const box = boxes[k]!;
        const before = v.x >= box.x1 || v.y >= box.y1;
        const behind = v.x < box.x0 || v.y < box.y0;
        if (before && !behind) out = Math.max(out, box.drawn + CLEAR);
        else if (behind && !before) out = Math.min(out, box.drawn - CLEAR);
      }
    }
    return out;
  }
}
