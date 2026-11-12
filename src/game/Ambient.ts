import Phaser from 'phaser';
import { PLACED, type GameState } from '../sim';
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
/** The most lawns with a sprinkler on at once, and the dots in each one's spray. */
const MAX_SPRAYS = 8;
const SPRAY_DOTS = 7;

interface Ripple {
  shape: Phaser.GameObjects.Ellipse;
  bornMs: number;
  /** In cells. */
  x: number;
  y: number;
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
  private water: Array<{ x: number; y: number; reachX: number; reachY: number }> = [];
  /** Lawn cells, in the order sprinklers are given out. */
  private lawns: number[] = [];
  private width = 0;
  private nextRippleAt = 0;
  private wantRipples = false;
  private wantSprinklers = false;

  constructor(
    private scene: Phaser.Scene,
    private iso: Iso,
  ) {}

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
      this.water.push({ x: placed.x + placed.w / 2, y: placed.y + placed.h / 2, reachX: placed.w / 2 - 0.3, reachY: placed.h / 2 - 0.3 });
    }
    const isQuad = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x]!.kind === 'quad';
    this.lawns = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isQuad(x, y)) continue;
        const links = Number(isQuad(x, y - 1)) + Number(isQuad(x + 1, y)) + Number(isQuad(x, y + 1)) + Number(isQuad(x - 1, y));
        // A quad of one cell is the fountain. Its basin sits a little below the middle of the cell.
        if (links === 0) this.water.push({ x: x + 0.5, y: y + 0.62, reachX: 0.05, reachY: 0.05 });
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
        this.ripples.push({ shape, bornMs: timeMs, x: spot.x + (Math.random() * 2 - 1) * spot.reachX, y: spot.y + (Math.random() * 2 - 1) * spot.reachY });
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
        .setPosition(at.x, at.y)
        .setScale(0.25 + age * 0.9)
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
