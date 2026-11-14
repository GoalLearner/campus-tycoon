import Phaser from 'phaser';
import type { Art } from './art';
import { mirrorHeading, type Box, type Heading, type Iso } from './iso';

/**
 * Draws things that are placed by hand and can cover more than one cell:
 * buildings, ponds, and the icons that float over an incident. Each is a
 * sprite from the art manifest, so swapping the art never touches this file.
 *
 * It only draws what it is given. Today the dev look-preview gives it a list.
 * The hand-placed buildings will give it theirs once they exist.
 */
export interface PlacedItem {
  /** Sprite name in the art manifest. */
  key: string;
  /** The cell at the top corner of the item. Fractions are allowed for people and props. */
  x: number;
  y: number;
  /** Cells covered. One by one when left out. */
  w?: number;
  h?: number;
  /**
   * ground: lies flat in place of the ground tile, such as water.
   * object: stands on its cells, such as a building. The default.
   * person: stands at a spot on a cell, drawn like a walker.
   * float: hovers over the middle of its cells and bobs, such as an incident icon.
   */
  layer?: 'ground' | 'object' | 'person' | 'float';
  /** Faded, for the preview of something not yet placed. */
  alpha?: number;
  /** Pixels a floating item hovers above the ground. */
  lift?: number;
  /** Mirror the sprite. */
  flip?: boolean;
  /** Set on a building from the game state: its index in the map's list. */
  id?: number;
  /** Draw this many cells further forward than its spot, for something resting on a flat item such as a car on a car park. */
  forward?: number;
  /**
   * The footprint of the drawing this stands on, such as the car park a car
   * stands on. Its spot then moves with that drawing when the view is turned,
   * and it is mirrored with it (DESIGN.md section 43).
   */
  on?: Box;
  /** A drawing that runs one way, such as bunting: mirrored on a quarter turn, as a footprint that is not square is. */
  turns?: boolean;
}

const HEADINGS: readonly string[] = ['px', 'py', 'nx', 'ny'];

/** A car's sprite, mirrored with the lot it stands on: car.3.ny becomes car.3.nx. Anything else is as it was. */
function mirroredKey(key: string): string {
  const cut = key.lastIndexOf('.');
  const heading = key.slice(cut + 1);
  return cut > 0 && HEADINGS.includes(heading) ? `${key.slice(0, cut)}.${mirrorHeading(heading as Heading)}` : key;
}

interface Drawn {
  item: PlacedItem;
  sprite: Phaser.GameObjects.Image;
  baseY: number;
}

export class PlacedSprites {
  private drawn: Drawn[] = [];

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  set(items: readonly PlacedItem[]): void {
    this.clear();
    const iso = this.iso;
    for (const item of items) {
      if (!this.art.has(item.key)) continue;
      const w = item.w ?? 1;
      const h = item.h ?? 1;
      const layer = item.layer ?? 'object';
      // On a turned view (DESIGN.md section 43) a drawing still faces the viewer. One whose footprint is not square
      // is mirrored about its top corner on a quarter turn, so it lies along its turned footprint. Something standing
      // on another drawing goes where that drawing has it, mirrored with it.
      const host = item.on;
      const hostMirrored = host ? iso.mirrors(host.w, host.h) : false;
      const key = hostMirrored ? mirroredKey(item.key) : item.key;
      const mirrored = !host && (iso.mirrors(w, h) || (item.turns === true && iso.odd));
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, this.art.has(key) ? key : item.key);
      if (mirrored) sprite.setOrigin(1 - sprite.originX, sprite.originY);
      sprite.setAlpha(item.alpha ?? 1).setFlipX((item.flip === true) !== mirrored);

      let at = iso.boxTop(item.x, item.y, w, h);
      if (host) {
        // Its spot on the host's drawing, in the drawing's own cells.
        const spot = iso.onDrawing(host, item.x - host.x, item.y - host.y);
        at = iso.toWorld(spot.x, spot.y);
        sprite.setDepth((iso.sum(spot.x, spot.y) + w - 1 + h - 1) * 4 + 1);
      } else if (layer === 'ground') {
        // After the tiles behind it and before the tiles in front. A wide one would otherwise be
        // drawn before the tiles beside its far corners, and their earth would lie over its shore.
        sprite.setDepth((iso.back(item.x, item.y, w, h) + Math.max(0, Math.max(w, h) - 2)) * 4 + 0.5);
      } else if (layer === 'object') {
        // Sorted by its front cell, so things behind it stay behind all of it.
        sprite.setDepth(iso.front(item.x, item.y, w, h) * 4 + 1);
      } else if (layer === 'person') {
        at = iso.toWorld(item.x + 0.5, item.y + 0.5);
        sprite.setDepth((iso.sum(item.x + 0.5, item.y + 0.5) - 1) * 4 + 2.5);
      } else {
        at = iso.toWorld(item.x + w / 2, item.y + h / 2);
        at.y -= item.lift ?? 90;
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(900_000 + iso.sum(item.x + w / 2, item.y + h / 2));
      }
      if (item.forward) sprite.setDepth(sprite.depth + item.forward * 4);
      sprite.setPosition(at.x, at.y);
      this.drawn.push({ item, sprite, baseY: at.y });
    }
  }

  /** The front-most building from the game state under a point of the world, or null. */
  hit(worldX: number, worldY: number): PlacedItem | null {
    let found: Drawn | null = null;
    for (const drawn of this.drawn) {
      if (drawn.item.id === undefined) continue;
      if (!drawn.sprite.getBounds().contains(worldX, worldY)) continue;
      if (!found || drawn.sprite.depth > found.sprite.depth) found = drawn;
    }
    return found ? found.item : null;
  }

  /**
   * Each drawing, for the turntable spin (DESIGN.md 43.6): whether it lies
   * flat, the spot of ground in the world it stands on, and the corners of its
   * ground, which say what is in front as the ground swings round. A floating
   * icon keeps its place in the drawing order, over everything.
   */
  spinParts(): Array<{ sprite: Phaser.GameObjects.Image; flat: boolean; ground: { x: number; y: number }; corners: Array<{ x: number; y: number }> | null; bias: number }> {
    const iso = this.iso;
    return this.drawn.map(({ item, sprite }) => {
      const w = item.w ?? 1;
      const h = item.h ?? 1;
      const layer = item.layer ?? 'object';
      const bias = (item.forward ?? 0) * iso.halfHeight;
      if (item.on) {
        // Stood on its host's drawing, at a spot of it, as a car is: the middle of that one cell is its ground.
        const spot = iso.onDrawing(item.on, item.x - item.on.x, item.y - item.on.y);
        const at = iso.toWorld(spot.x, spot.y);
        const ground = { x: at.x, y: at.y + iso.halfHeight };
        return { sprite, flat: false, ground, corners: [ground], bias };
      }
      if (layer === 'person') {
        const ground = iso.toWorld(item.x + 0.5, item.y + 0.5);
        return { sprite, flat: false, ground, corners: [ground], bias };
      }
      const ground = iso.toWorld(item.x + w / 2, item.y + h / 2);
      if (layer === 'ground') return { sprite, flat: true, ground, corners: null, bias };
      if (layer === 'float') return { sprite, flat: false, ground, corners: null, bias };
      const corners = [iso.toWorld(item.x, item.y), iso.toWorld(item.x + w, item.y), iso.toWorld(item.x, item.y + h), iso.toWorld(item.x + w, item.y + h)];
      return { sprite, flat: false, ground, corners, bias };
    });
  }

  /** Floating icons bob gently so they catch the eye. */
  update(timeMs: number): void {
    for (const drawn of this.drawn) {
      if (drawn.item.layer !== 'float') continue;
      drawn.sprite.y = drawn.baseY + Math.sin(timeMs / 320 + drawn.item.x) * 4;
    }
  }

  clear(): void {
    for (const drawn of this.drawn) drawn.sprite.destroy();
    this.drawn = [];
  }
}
