import Phaser from 'phaser';
import type { Art } from './art';
import type { Iso } from './iso';

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
    for (const item of items) {
      if (!this.art.has(item.key)) continue;
      const w = item.w ?? 1;
      const h = item.h ?? 1;
      const layer = item.layer ?? 'object';
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, item.key);
      sprite.setAlpha(item.alpha ?? 1).setFlipX(item.flip === true);

      let at = this.iso.toWorld(item.x, item.y);
      if (layer === 'ground') {
        // After the tiles behind it and before the tiles in front. A wide one would otherwise be
        // drawn before the tiles beside its far corners, and their earth would lie over its shore.
        sprite.setDepth((item.x + item.y + Math.max(0, Math.max(w, h) - 2)) * 4 + 0.5);
      } else if (layer === 'object') {
        // Sorted by its front cell, so things behind it stay behind all of it.
        sprite.setDepth((item.x + w - 1 + item.y + h - 1) * 4 + 1);
      } else if (layer === 'person') {
        at = this.iso.toWorld(item.x + 0.5, item.y + 0.5);
        sprite.setDepth((item.x + item.y) * 4 + 2.5);
      } else {
        at = this.iso.toWorld(item.x + w / 2, item.y + h / 2);
        at.y -= item.lift ?? 90;
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(900_000 + item.x + item.y);
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
