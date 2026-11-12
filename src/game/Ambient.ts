import Phaser from 'phaser';
import { PLACED, type GameState, type PlacedType } from '../sim';
import type { Art } from './art';
import type { Iso } from './iso';

/**
 * Ambient motion made of light particles (DESIGN.md section 33.5): ripples on
 * ponds and fountains, and sprinklers on the lawns in the morning.
 *
 * The art packs have no animation for water or spray, so these are small
 * rings and dots, as rain will be. Each is a few shapes that are reused, and
 * only what is in view is drawn. When they run is decided by the plain rule
 * `scenesFor`, and Reduce effects turns them off. Nothing here is saved and
 * nothing changes a number.
 */

/** The most ripples at once, and how often a new one begins. */
const MAX_RIPPLES = 10;
const RIPPLE_EVERY_MS = 420;
const RIPPLE_LIFE_MS = 1900;
/** How many places on each kind of pond a ripple can begin, found once by looking at its picture. */
const POND_SPOTS = 14;
/** The most lawns with a sprinkler on at once, and the dots in each one's spray. */
const MAX_SPRAYS = 8;
const SPRAY_DOTS = 7;

interface Ripple {
  shape: Phaser.GameObjects.Ellipse;
  bornMs: number;
  /** In cells. */
  x: number;
  y: number;
  /** How far above the ground the water is, in pixels of the map, and how wide the ring grows: 1 for a pond. */
  lift: number;
  size: number;
}

interface Spray {
  dots: Phaser.GameObjects.Arc[];
  cell: number;
}

function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Ambient {
  private ripples: Ripple[] = [];
  private spare: Phaser.GameObjects.Ellipse[] = [];
  private sprays: Spray[] = [];
  /** Water a ripple can start on: each is a spot and how far from it, in cells. */
  private water: Array<{ x: number; y: number; lift: number; size: number }> = [];
  /** For each kind of pond, the places on it that are open water, in cells from its north corner. */
  private pondWater = new Map<PlacedType, Array<{ x: number; y: number }>>();
  /** Lawn cells, in the order sprinklers are given out. */
  private lawns: number[] = [];
  private width = 0;
  private nextRippleAt = 0;
  private wantRipples = false;
  private wantSprinklers = false;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  /**
   * Where the open water is on a kind of pond. A pond's picture has banks,
   * reeds and sometimes a bridge, so a ripple may only begin where the picture
   * itself is water for a little way to each side. Looked up once for each kind.
   */
  private waterOn(type: PlacedType): Array<{ x: number; y: number }> {
    const known = this.pondWater.get(type);
    if (known) return known;
    const spots: Array<{ x: number; y: number }> = [];
    const spec = PLACED[type];
    const drawn = this.art.has(spec.sprite) ? this.art.resolve(spec.sprite) : null;
    if (drawn && drawn.frame !== undefined) {
      const frame = this.scene.textures.getFrame(drawn.texture, drawn.frame);
      const corner = this.iso.toWorld(0, 0);
      const wet = (px: number, py: number): boolean => {
        const colour = this.scene.textures.getPixel(Math.round(px), Math.round(py), drawn.texture, drawn.frame);
        return !!colour && colour.alpha > 200 && colour.blue > 150 && colour.blue > colour.red + 50;
      };
      for (let n = 0; n < 400 && spots.length < POND_SPOTS && frame; n++) {
        // The same places every time, spread over the pond.
        const x = mix(n, 5) * spec.w;
        const y = mix(n, 9) * spec.h;
        const at = this.iso.toWorld(x, y);
        const px = at.x - corner.x + drawn.originX * frame.width;
        const py = at.y - corner.y + drawn.originY * frame.height;
        if (wet(px, py) && wet(px - 9, py) && wet(px + 9, py) && wet(px, py - 5) && wet(px, py + 5)) spots.push({ x, y });
      }
    }
    this.pondWater.set(type, spots);
    return spots;
  }

  setLife(ripples: boolean, sprinklers: boolean): void {
    this.wantRipples = ripples;
    this.wantSprinklers = sprinklers;
  }

  /** Read the ponds, the fountains and the lawns again. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.width = width;
    this.water = [];
    for (const placed of state.map.placed) {
      if (!placed || PLACED[placed.type].family !== 'water') continue;
      for (const spot of this.waterOn(placed.type)) this.water.push({ x: placed.x + spot.x, y: placed.y + spot.y, lift: 0, size: 1 });
    }
    const isQuad = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x]!.kind === 'quad';
    this.lawns = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isQuad(x, y)) continue;
        const links = Number(isQuad(x, y - 1)) + Number(isQuad(x + 1, y)) + Number(isQuad(x, y + 1)) + Number(isQuad(x - 1, y));
        // A quad of one cell is the fountain. Its basin is a small bowl, raised above the lawn.
        if (links === 0) this.water.push({ x: x + 0.5, y: y + 0.62, lift: 17, size: 0.5 });
        else this.lawns.push(y * width + x);
      }
    }
    // The same lawns have the sprinklers every morning.
    this.lawns.sort((a, b) => mix(a, 17) - mix(b, 17));
  }

  update(timeMs: number): void {
    const view = this.scene.cameras.main.worldView;
    const inView = (x: number, y: number): boolean => {
      const at = this.iso.toWorld(x, y);
      return at.x >= view.x - 60 && at.x <= view.right + 60 && at.y >= view.y - 60 && at.y <= view.bottom + 60;
    };

    // ---- ripples
    if (this.wantRipples && this.water.length > 0 && timeMs >= this.nextRippleAt && this.ripples.length < MAX_RIPPLES) {
      this.nextRippleAt = timeMs + RIPPLE_EVERY_MS;
      const seen = this.water.filter((spot) => inView(spot.x, spot.y));
      const spot = seen[Math.floor(Math.random() * seen.length)];
      if (spot) {
        const shape = this.spare.pop() ?? this.scene.add.ellipse(0, 0, this.iso.halfWidth * 0.5, this.iso.halfHeight * 0.5).setStrokeStyle(1.6, 0xffffff, 1).setFillStyle();
        shape.setVisible(true);
        this.ripples.push({ shape, bornMs: timeMs, x: spot.x, y: spot.y, lift: spot.lift, size: spot.size });
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!;
      const age = (timeMs - ripple.bornMs) / RIPPLE_LIFE_MS;
      if (age >= 1 || !this.wantRipples) {
        ripple.shape.setVisible(false);
        this.spare.push(ripple.shape);
        this.ripples.splice(i, 1);
        continue;
      }
      const at = this.iso.toWorld(ripple.x, ripple.y);
      ripple.shape
        .setPosition(at.x, at.y - ripple.lift)
        .setScale((0.25 + age * 0.9) * ripple.size)
        .setAlpha(0.5 * (1 - age))
        .setDepth((ripple.x + ripple.y - 1) * 4 + 2.3);
    }

    // ---- sprinklers
    const wanted: number[] = [];
    if (this.wantSprinklers) {
      for (const cell of this.lawns) {
        if (wanted.length >= MAX_SPRAYS) break;
        const x = cell % this.width;
        if (inView(x + 0.5, (cell - x) / this.width + 0.5)) wanted.push(cell);
      }
    }
    while (this.sprays.length > wanted.length) for (const dot of this.sprays.pop()!.dots) dot.destroy();
    wanted.forEach((cell, n) => {
      let spray = this.sprays[n];
      if (!spray) {
        spray = { dots: Array.from({ length: SPRAY_DOTS }, () => this.scene.add.circle(0, 0, 1.7, 0xffffff, 0.75)), cell };
        this.sprays.push(spray);
      }
      spray.cell = cell;
      const x = cell % this.width;
      const y = (cell - x) / this.width;
      // The jet sweeps round, and each drop is a little further out and a little higher or lower along its arc.
      const angle = timeMs / 900 + mix(cell, 3) * Math.PI * 2;
      spray.dots.forEach((dot, k) => {
        const along = (k + ((timeMs / 260) % 1)) / SPRAY_DOTS;
        const far = 0.06 + along * 0.5;
        const px = x + 0.5 + Math.cos(angle) * far;
        const py = y + 0.5 + Math.sin(angle) * far;
        const at = this.iso.toWorld(px, py);
        dot.setPosition(at.x, at.y - Math.sin(Math.PI * along) * 13 - 3).setDepth((px + py - 1) * 4 + 2.6).setAlpha(0.8 * (1 - along * 0.6));
      });
    });
  }

  clear(): void {
    for (const ripple of this.ripples) ripple.shape.destroy();
    for (const shape of this.spare) shape.destroy();
    for (const spray of this.sprays) for (const dot of spray.dots) dot.destroy();
    this.ripples = [];
    this.spare = [];
    this.sprays = [];
  }
}
