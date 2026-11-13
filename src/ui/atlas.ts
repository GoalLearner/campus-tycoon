/**
 * The art atlas, for panels that show a sprite outside the map: a Build menu
 * thumbnail, a student's portrait. Fetched once and shared.
 */

interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}

export interface Atlas {
  sheet: HTMLImageElement;
  frames: Record<string, Frame>;
  /** The pack's walking people, when it has them. */
  people: { looks: number; crowd?: number; flip?: Record<string, string>; roles?: Record<string, number> } | null;
  /** Where each sprite meets the ground, in its own pixels: the top corner of its cell, or the feet of a person. */
  anchors: Record<string, [number, number]>;
}

let once: Promise<Atlas | null> | null = null;

/** Null when the atlas cannot be read. Panels then show no picture. */
export function loadAtlas(): Promise<Atlas | null> {
  once ??= (async () => {
    try {
      const manifest = (await (await fetch('./assets/manifest.json')).json()) as {
        atlas: { image: string; data: string };
        people?: Atlas['people'];
        sprites?: Record<string, { anchor?: [number, number] }>;
      };
      const frames = ((await (await fetch(`./assets/${manifest.atlas.data}`)).json()) as { frames: Record<string, Frame> }).frames;
      const sheet = new Image();
      sheet.src = `./assets/${manifest.atlas.image}`;
      await sheet.decode();
      const anchors: Record<string, [number, number]> = {};
      for (const [key, sprite] of Object.entries(manifest.sprites ?? {})) if (sprite.anchor) anchors[key] = sprite.anchor;
      return { sheet, frames, people: manifest.people ?? null, anchors };
    } catch {
      return null;
    }
  })();
  return once;
}

/** Draw one sprite as large as fits, standing on the bottom edge. Returns false when the atlas has no such sprite. */
export function drawSprite(canvas: HTMLCanvasElement, atlas: Atlas | null, key: string): boolean {
  const pen = canvas.getContext('2d');
  if (!pen) return false;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  const rect = atlas?.frames[key]?.frame;
  if (!atlas || !rect) return false;
  const scale = Math.min(canvas.width / rect.w, canvas.height / rect.h);
  const w = rect.w * scale;
  const h = rect.h * scale;
  pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, rect.h, (canvas.width - w) / 2, canvas.height - h, w, h);
  return true;
}
