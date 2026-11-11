import Phaser from 'phaser';

/**
 * Art is data. One manifest maps every sprite the map can draw to a frame in
 * the atlas, the anchor point inside that frame, and the footprint it covers.
 * The code below never names an art file: swapping art is a manifest edit.
 * Anything the manifest does not supply is drawn as a labelled placeholder,
 * so missing art never breaks the game. See DESIGN.md section 17.7.
 */

export interface SpriteDef {
  /** Frame name inside the atlas. */
  frame: string;
  /** The pixel inside the frame that sits on the top corner of the cell's ground diamond. */
  anchor: [number, number];
  /** Cells covered, as [width, height]. */
  footprint: [number, number];
}

export interface ArtManifest {
  version: number;
  pack: string;
  /** Half the width and half the height of one cell's ground diamond, in source pixels. */
  tile: { halfWidth: number; halfHeight: number };
  atlas: { image: string; data: string };
  sprites: Record<string, SpriteDef>;
}

export const MANIFEST_KEY = 'art-manifest';
export const ATLAS_KEY = 'art-atlas';
export const ASSET_DIR = 'assets/';

const DEFAULT_TILE = { halfWidth: 66, halfHeight: 33 };

export interface Resolved {
  texture: string;
  frame: string | undefined;
  originX: number;
  originY: number;
}

export class Art {
  readonly halfWidth: number;
  readonly halfHeight: number;
  private resolved = new Map<string, Resolved>();
  private counts = new Map<string, number>();

  constructor(
    private scene: Phaser.Scene,
    private manifest: ArtManifest | null,
  ) {
    const tile = manifest?.tile ?? DEFAULT_TILE;
    this.halfWidth = tile.halfWidth;
    this.halfHeight = tile.halfHeight;
  }

  /** How many numbered variants exist under a prefix: "quad" counts quad.0, quad.1 and so on. */
  variants(prefix: string): number {
    const known = this.counts.get(prefix);
    if (known !== undefined) return known;
    let n = 0;
    while (this.manifest?.sprites[`${prefix}.${n}`]) n += 1;
    this.counts.set(prefix, n);
    return n;
  }

  /** The texture, frame and origin to draw for a sprite key. Falls back to a placeholder. */
  resolve(key: string): Resolved {
    const cached = this.resolved.get(key);
    if (cached) return cached;

    const def = this.manifest?.sprites[key];
    const texture = this.scene.textures.exists(ATLAS_KEY) ? this.scene.textures.get(ATLAS_KEY) : null;
    let result: Resolved;
    if (def && texture && texture.has(def.frame)) {
      const frame = texture.get(def.frame);
      result = {
        texture: ATLAS_KEY,
        frame: def.frame,
        originX: def.anchor[0] / frame.width,
        originY: def.anchor[1] / frame.height,
      };
    } else {
      result = this.placeholder(key);
    }
    this.resolved.set(key, result);
    return result;
  }

  /** Apply a sprite key to an image. */
  apply(image: Phaser.GameObjects.Image, key: string): void {
    const r = this.resolve(key);
    image.setTexture(r.texture, r.frame);
    image.setOrigin(r.originX, r.originY);
  }

  /** A flat diamond with the missing key written on it, so a gap in the art is obvious and harmless. */
  private placeholder(key: string): Resolved {
    const name = `placeholder:${key}`;
    const w = this.halfWidth * 2;
    const h = this.halfHeight * 2;
    const rise = key.includes('.') && !key.startsWith('path') && !key.startsWith('ground') ? 40 : 0;
    if (!this.scene.textures.exists(name)) {
      const canvas = this.scene.textures.createCanvas(name, w, h + rise);
      if (canvas) {
        const ctx = canvas.getContext();
        let hue = 0;
        for (let i = 0; i < key.length; i++) hue = (hue * 31 + key.charCodeAt(i)) % 360;
        ctx.fillStyle = `hsl(${hue} 45% 55%)`;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2, rise);
        ctx.lineTo(w, rise + h / 2);
        ctx.lineTo(w / 2, rise + h);
        ctx.lineTo(0, rise + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (rise > 0) {
          ctx.fillRect(w / 2 - 22, 4, 44, rise + h / 2 - 8);
          ctx.strokeRect(w / 2 - 22, 4, 44, rise + h / 2 - 8);
        }
        ctx.fillStyle = '#111';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(key, w / 2, rise + h / 2 + 5);
        canvas.refresh();
      }
    }
    return { texture: name, frame: undefined, originX: 0.5, originY: rise / (h + rise) };
  }
}
