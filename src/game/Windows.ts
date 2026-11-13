import Phaser from 'phaser';
import { PLACED, type GameState } from '../sim';
import type { Art } from './art';
import type { Iso } from './iso';

/**
 * Lit windows at dusk and at night (DESIGN.md section 33.5).
 *
 * For each dorm and lecture hall the art build cuts a second picture from the
 * building's own window glass, in a pale warm colour, one for each of the two
 * walls that show. A lit wall is drawn twice:
 *
 * - once straight on top of its building, in the building's own place in the
 *   drawing order, so people, trees and buildings in front of it hide it as
 *   they hide the wall. The sheet of night colour laid over the whole map
 *   dims it with everything else;
 * - once more above that sheet, added as a soft orange, which is what makes
 *   the window glow. Nothing can hide this one, so it is left off any wall
 *   with a building in front of it, and it is faint enough that on a passer-by
 *   it reads as light falling on them.
 *
 * Which buildings are lit is the same every evening for a campus, and how
 * many comes from the plain rule `scenesFor`. It is for show: nothing here is
 * saved and nothing changes a number.
 */

/** The orange added over the night, and how strong it is with the lamps fully on. */
const GLOW_TINT = 0xff9a20;
const GLOW_ALPHA = 0.4;

interface Wall {
  id: string;
  x: number;
  y: number;
  key: string;
  /** A steady number from 0 to 1: the building is lit when the share of lit buildings is above it. */
  order: number;
  academic: boolean;
  /** Nothing tall stands in front of this wall, so its glow can be added. */
  open: boolean;
}

interface Lit {
  pane: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
}

function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Windows {
  private walls: Wall[] = [];
  private shown = new Map<string, Lit>();
  private spare: Phaser.GameObjects.Image[] = [];
  private lastShare = -1;
  private lastGlow = -1;
  private lastView = '';

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    /** The depth just above the sheet of night colour. */
    private above: number,
  ) {}

  /** Read the buildings again: which walls have windows, and which of them nothing stands in front of. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings, placed } = state.map;
    this.walls = [];
    // Something tall enough to hide the wall behind it: a building, a house in town, or anything placed that is not flat or small.
    const tall = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const cell = cells[y * width + x]!;
      if (cell.kind === 'house') return true;
      if (cell.kind === 'lot') return cell.buildingId !== null && (buildings[cell.buildingId]?.stage ?? 0) >= 1;
      if (cell.kind === 'placed' && cell.placedId !== null) {
        const thing = placed[cell.placedId];
        if (!thing) return false;
        const spec = PLACED[thing.type];
        return !spec.flat && spec.family !== 'seat' && spec.family !== 'bin' && spec.family !== 'water';
      }
      return false;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = cells[y * width + x]!;
        if (cell.kind !== 'lot' || !cell.zone || cell.buildingId === null) continue;
        const building = buildings[cell.buildingId];
        if (!building || building.stage < 1) continue;
        const prefix = `${cell.zone}.${building.stage}`;
        const count = this.art.variants(prefix);
        const base = `lit.${prefix}.${count > 0 ? building.variant % count : 0}`;
        const order = mix(y * width + x, 7);
        const academic = cell.zone === 'academic';
        // The building straight in front hides the lower half of both walls. In front is in front on the screen,
        // as the view is turned (DESIGN.md section 43): the walls are the drawing's own, which faces the viewer.
        const ahead = (dx: number, dy: number): boolean => {
          const at = this.iso.step(x, y, dx, dy);
          return tall(at.x, at.y);
        };
        const clear = !ahead(1, 1);
        if (this.art.has(`${base}.sw`)) this.walls.push({ id: `${x},${y},sw`, x, y, key: `${base}.sw`, order, academic, open: clear && !ahead(0, 1) });
        if (this.art.has(`${base}.se`)) this.walls.push({ id: `${x},${y},se`, x, y, key: `${base}.se`, order, academic, open: clear && !ahead(1, 0) });
      }
    }
    this.sync(0, 0);
    this.lastShare = -1;
  }

  /**
   * Light the windows. `share` is how many buildings are lit, from 0 to 1, and
   * `glow` how bright they are as the evening comes on. Only walls in view are drawn.
   */
  show(share: number, glow: number): void {
    const view = this.scene.cameras.main.worldView;
    const where = `${Math.round(view.x / 64)},${Math.round(view.y / 64)},${Math.round(view.width / 64)}`;
    if (share === this.lastShare && Math.abs(glow - this.lastGlow) < 0.02 && where === this.lastView) return;
    this.lastShare = share;
    this.lastGlow = glow;
    this.lastView = where;
    this.sync(share, glow);
  }

  private image(key: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    const image = this.spare.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
    this.art.apply(image, key);
    return image.setPosition(x, y).setDepth(depth).setVisible(true).setBlendMode(Phaser.BlendModes.NORMAL).clearTint();
  }

  private sync(share: number, glow: number): void {
    const view = this.scene.cameras.main.worldView;
    const wanted = new Set<string>();
    const bright = Math.min(1, glow);
    if (share > 0 && bright > 0.02) {
      for (const wall of this.walls) {
        // Lecture halls empty out late: half as many are lit as dorms.
        if (wall.order >= (wall.academic ? share * 0.5 : share)) continue;
        const at = this.iso.cellTop(wall.x, wall.y);
        if (at.x < view.x - 200 || at.x > view.right + 200 || at.y < view.y - 80 || at.y > view.bottom + 320) continue;
        wanted.add(wall.id);
        let lit = this.shown.get(wall.id);
        if (!lit) {
          // Just above its own building, and under whatever stands in front of that.
          const pane = this.image(wall.key, at.x, at.y, this.iso.depth(wall.x, wall.y, 1) + 0.02);
          const over = wall.open ? this.image(wall.key, at.x, at.y, this.above).setBlendMode(Phaser.BlendModes.ADD).setTint(GLOW_TINT) : null;
          lit = { pane, glow: over };
          this.shown.set(wall.id, lit);
        }
        lit.pane.setAlpha(bright);
        lit.glow?.setAlpha(bright * GLOW_ALPHA);
      }
    }
    for (const [id, lit] of this.shown) {
      if (wanted.has(id)) continue;
      lit.pane.setVisible(false);
      this.spare.push(lit.pane);
      if (lit.glow) {
        lit.glow.setVisible(false);
        this.spare.push(lit.glow);
      }
      this.shown.delete(id);
    }
  }

  /** How many walls are lit now. For the dev readout and for screenshots. */
  get count(): number {
    return this.shown.size;
  }

  clear(): void {
    for (const lit of this.shown.values()) {
      lit.pane.destroy();
      lit.glow?.destroy();
    }
    for (const image of this.spare) image.destroy();
    this.shown.clear();
    this.spare = [];
    this.walls = [];
  }
}
