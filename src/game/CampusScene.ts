import Phaser from 'phaser';
import { clock } from '../app/clock';
import { session } from '../app/session';
import { store } from '../app/store';
import {
  previewPaint,
  rowBetween,
  stageSpec,
  TICK_MS,
  type Building,
  type GameState,
  type Point,
  type Zone,
} from '../sim';
import { Art, MANIFEST_KEY, type ArtManifest } from './art';
import { Iso } from './iso';

/** Empty zoned lots are tinted so the player can tell the zones apart at a glance. */
const ZONE_TINT: Record<Zone, number> = { housing: 0x9cc3ff, academic: 0xffc27a };
const NO_TINT = 0xffffff;

const MAX_ZOOM_FACTOR = 2.2;
const WHEEL_STEP = 1.12;

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number; travelled: number }
  | { kind: 'paint'; start: Point; last: Point }
  | { kind: 'pinch'; distance: number; midX: number; midY: number };

interface Visual {
  ground: Phaser.GameObjects.Image;
  object: Phaser.GameObjects.Image | null;
  works: Phaser.GameObjects.Image | null;
  signature: string;
}

function cellHash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/**
 * Draws the campus and turns touches into pans, zooms, taps and paints.
 * It reads the game state from the store and never changes it directly:
 * a finished drag is sent to the store as an action.
 */
export class CampusScene extends Phaser.Scene {
  private art!: Art;
  private iso!: Iso;
  private visuals: Visual[] = [];
  private mapWidth = 0;
  private mapHeight = 0;
  private gameId = '';
  private overlay!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private dirty = true;
  private overlayDirty = true;
  private nextBarsAt = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private dpr = 1;

  constructor() {
    super('campus');
  }

  create(): void {
    const manifest = (this.cache.json.get(MANIFEST_KEY) ?? null) as ArtManifest | null;
    this.art = new Art(this, manifest);
    this.iso = new Iso(this.art.halfWidth, this.art.halfHeight);
    this.dpr = 1 / this.scale.zoom;

    this.overlay = this.add.graphics().setDepth(1_000_000);
    this.bars = this.add.graphics().setDepth(1_000_001);

    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    const unsubscribeStore = store.subscribe(() => {
      this.dirty = true;
    });
    const unsubscribeSession = session.subscribe(() => {
      this.overlayDirty = true;
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeStore();
      unsubscribeSession();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  override update(time: number): void {
    if (!store.hasGame) {
      if (this.visuals.length > 0) this.clearMap();
      return;
    }
    const state = store.state;
    const id = `${state.seed}:${state.clock.createdAt}`;
    if (id !== this.gameId) {
      this.buildMap(state);
      this.gameId = id;
      this.dirty = true;
    }
    if (this.dirty) {
      this.syncMap(state);
      this.dirty = false;
      this.overlayDirty = true;
      this.nextBarsAt = 0;
    }
    if (this.overlayDirty) {
      this.drawOverlay();
      this.overlayDirty = false;
    }
    if (time >= this.nextBarsAt) {
      this.drawBars(state);
      this.nextBarsAt = time + 250;
    }
  }

  // ------------------------------------------------------------------ map --

  private clearMap(): void {
    for (const v of this.visuals) {
      v.ground.destroy();
      v.object?.destroy();
      v.works?.destroy();
    }
    this.visuals = [];
    this.gameId = '';
    this.overlay.clear();
    this.bars.clear();
  }

  private buildMap(state: GameState): void {
    this.clearMap();
    const { width, height } = state.map;
    this.mapWidth = width;
    this.mapHeight = height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = this.iso.toWorld(x, y);
        const ground = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(this.iso.depth(x, y, 0));
        this.visuals.push({ ground, object: null, works: null, signature: '' });
      }
    }
    this.frameCamera();
  }

  private pathMask(state: GameState, x: number, y: number): number {
    const { width, height, cells } = state.map;
    const isPath = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < width && cy < height && cells[cy * width + cx]!.kind === 'path';
    return (
      (isPath(x, y - 1) ? 1 : 0) | (isPath(x + 1, y) ? 2 : 0) | (isPath(x, y + 1) ? 4 : 0) | (isPath(x - 1, y) ? 8 : 0)
    );
  }

  private variantKey(prefix: string, variant: number): string {
    const count = this.art.variants(prefix);
    return `${prefix}.${count > 0 ? variant % count : 0}`;
  }

  /** Bring every sprite in line with the state. Only cells whose look changed are touched. */
  private syncMap(state: GameState): void {
    const { width, height, cells, buildings } = state.map;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cell = cells[i]!;
        let groundKey = 'ground.grass';
        let tint = NO_TINT;
        let objectKey = '';
        let works = false;

        if (cell.kind === 'path') {
          groundKey = `path.${this.pathMask(state, x, y)}`;
        } else if (cell.kind === 'quad') {
          groundKey = this.variantKey('quad', cellHash(x, y));
        } else if (cell.kind === 'lot' && cell.zone) {
          const building = cell.buildingId !== null ? (buildings[cell.buildingId] ?? null) : null;
          if (building && building.stage >= 1) {
            objectKey = this.variantKey(`${cell.zone}.${building.stage}`, building.variant);
            works = building.rebuild !== null;
          } else if (building?.rebuild) {
            groundKey = 'lot.site';
          } else {
            groundKey = 'lot.empty';
            tint = ZONE_TINT[cell.zone];
          }
        }

        const signature = `${groundKey}|${tint}|${objectKey}|${works ? 1 : 0}`;
        const visual = this.visuals[i]!;
        if (visual.signature === signature) continue;
        visual.signature = signature;

        this.art.apply(visual.ground, groundKey);
        visual.ground.setTint(tint);

        const pos = this.iso.toWorld(x, y);
        if (objectKey) {
          if (!visual.object) {
            visual.object = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(this.iso.depth(x, y, 1));
          }
          this.art.apply(visual.object, objectKey);
          visual.object.setVisible(true);
        } else if (visual.object) {
          visual.object.setVisible(false);
        }

        if (works) {
          if (!visual.works) {
            visual.works = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(this.iso.depth(x, y, 2));
            this.art.apply(visual.works, 'lot.works');
          }
          visual.works.setVisible(true);
        } else if (visual.works) {
          visual.works.setVisible(false);
        }
      }
    }
  }

  // ------------------------------------------------------------- overlays --

  private fillCell(x: number, y: number, colour: number, alpha: number): void {
    this.overlay.fillStyle(colour, alpha);
    this.overlay.fillPoints(this.iso.diamond(x, y), true);
  }

  /** The paint preview and the selected lot. */
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const preview = session.preview;
    if (preview) {
      const colour = preview.affordable ? 0x6fe38c : 0xff6b5e;
      for (const [x, y] of preview.cells) this.fillCell(x, y, colour, 0.5);
    }
    const selected = session.selected;
    if (selected) {
      g.lineStyle(4, 0xffffff, 0.95);
      g.strokePoints(this.iso.diamond(selected.x, selected.y), true);
    }
  }

  /** Real time at which a given tick will happen. */
  private realTimeOfTick(state: GameState, tick: number): number {
    return state.clock.nextTickAt + (tick - state.clock.tick - 1) * TICK_MS;
  }

  private barTop(building: Building): number {
    const visual = this.visuals[building.y * this.mapWidth + building.x];
    const pos = this.iso.toWorld(building.x, building.y);
    if (visual?.object?.visible) return visual.object.getBounds().top - 14;
    return pos.y - 16;
  }

  /** A progress bar over every lot that is building. */
  private drawBars(state: GameState): void {
    const g = this.bars;
    g.clear();
    const now = clock.now();
    for (const building of state.map.buildings) {
      if (!building?.rebuild) continue;
      const total = stageSpec(building.zone, building.rebuild.toStage).buildTicks * TICK_MS;
      const remaining = this.realTimeOfTick(state, building.rebuild.doneTick) - now;
      const done = Phaser.Math.Clamp(1 - remaining / total, 0, 1);
      const pos = this.iso.toWorld(building.x, building.y);
      const w = 64;
      const h = 9;
      const left = pos.x - w / 2;
      const top = this.barTop(building);
      g.fillStyle(0x10161c, 0.85);
      g.fillRoundedRect(left - 2, top - 2, w + 4, h + 4, 5);
      g.fillStyle(0xffd24a, 1);
      g.fillRoundedRect(left, top, Math.max(3, w * done), h, 3);
    }
  }

  // --------------------------------------------------------------- camera --

  private toWorld(screenX: number, screenY: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return {
      x: cam.scrollX + cam.width / 2 + (screenX - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (screenY - cam.height / 2) / cam.zoom,
    };
  }

  private cellAt(screenX: number, screenY: number): Point {
    const world = this.toWorld(screenX, screenY);
    const cell = this.iso.toCell(world.x, world.y);
    return [cell.x, cell.y];
  }

  private inMap(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.mapWidth && y < this.mapHeight;
  }

  private minZoom(): number {
    const cam = this.cameras.main;
    const bounds = this.iso.bounds(this.mapWidth, this.mapHeight);
    return Math.min(cam.width / bounds.width, cam.height / bounds.height) * 0.9;
  }

  /** Keep the middle of the view somewhere over the campus. */
  private clampCamera(): void {
    const cam = this.cameras.main;
    const bounds = this.iso.bounds(this.mapWidth, this.mapHeight);
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, bounds.x, bounds.x + bounds.width);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, bounds.y, bounds.y + bounds.height);
    cam.setScroll(cx - cam.width / 2, cy - cam.height / 2);
  }

  private zoomAt(screenX: number, screenY: number, zoom: number): void {
    const cam = this.cameras.main;
    const before = this.toWorld(screenX, screenY);
    cam.setZoom(Phaser.Math.Clamp(zoom, this.minZoom(), MAX_ZOOM_FACTOR * this.dpr));
    const after = this.toWorld(screenX, screenY);
    cam.setScroll(cam.scrollX + before.x - after.x, cam.scrollY + before.y - after.y);
    this.clampCamera();
  }

  /** Start centred on the middle of the campus, with a comfortable number of cells across. */
  private frameCamera(): void {
    const cam = this.cameras.main;
    const cssWidth = cam.width / this.dpr;
    const cellsAcross = Phaser.Math.Clamp(cssWidth / 62, 6.5, 18);
    const zoom = cam.width / (cellsAcross * this.iso.halfWidth * 2);
    cam.setZoom(Phaser.Math.Clamp(zoom, this.minZoom(), MAX_ZOOM_FACTOR * this.dpr));
    const centre = this.iso.toWorld(this.mapWidth / 2, this.mapHeight / 2);
    cam.setScroll(centre.x - cam.width / 2, centre.y - cam.height / 2);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.main.setSize(size.width, size.height);
    if (this.visuals.length > 0) this.clampCamera();
  }

  // ---------------------------------------------------------------- input --

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.touches.set(pointer.id, { x: pointer.x, y: pointer.y });
    if (!store.hasGame) return;

    if (this.touches.size >= 2) {
      // A second finger always means pan and zoom. Any paint in progress is dropped.
      if (this.gesture?.kind === 'paint') session.setPreview(null);
      this.gesture = this.startPinch();
      return;
    }

    if (session.tool === 'look') {
      this.gesture = { kind: 'pan', lastX: pointer.x, lastY: pointer.y, travelled: 0 };
      return;
    }

    const start = this.cellAt(pointer.x, pointer.y);
    this.gesture = { kind: 'paint', start, last: start };
    this.updatePaint(start);
  }

  private startPinch(): Gesture | null {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return null;
    return {
      kind: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  private updatePaint(to: Point): void {
    if (this.gesture?.kind !== 'paint' || session.tool === 'look') return;
    this.gesture.last = to;
    const cells = rowBetween(this.gesture.start, to);
    session.setPreview(previewPaint(store.state, session.tool, cells));
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const touch = this.touches.get(pointer.id);
    if (!touch || !this.gesture) return;
    touch.x = pointer.x;
    touch.y = pointer.y;
    const cam = this.cameras.main;

    if (this.gesture.kind === 'pinch') {
      const next = this.startPinch();
      if (!next || next.kind !== 'pinch') return;
      cam.setScroll(
        cam.scrollX - (next.midX - this.gesture.midX) / cam.zoom,
        cam.scrollY - (next.midY - this.gesture.midY) / cam.zoom,
      );
      if (this.gesture.distance > 0) {
        this.zoomAt(next.midX, next.midY, cam.zoom * (next.distance / this.gesture.distance));
      }
      this.gesture = next;
      return;
    }

    if (this.gesture.kind === 'pan') {
      const dx = pointer.x - this.gesture.lastX;
      const dy = pointer.y - this.gesture.lastY;
      this.gesture.travelled += Math.abs(dx) + Math.abs(dy);
      this.gesture.lastX = pointer.x;
      this.gesture.lastY = pointer.y;
      cam.setScroll(cam.scrollX - dx / cam.zoom, cam.scrollY - dy / cam.zoom);
      this.clampCamera();
      return;
    }

    const cell = this.cellAt(pointer.x, pointer.y);
    if (cell[0] !== this.gesture.last[0] || cell[1] !== this.gesture.last[1]) this.updatePaint(cell);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.touches.delete(pointer.id)) return;
    const gesture = this.gesture;
    if (!gesture) return;

    if (gesture.kind === 'pinch') {
      // One finger may still be down. Carry on as a pan that can no longer count as a tap.
      const rest = [...this.touches.values()][0];
      this.gesture = rest ? { kind: 'pan', lastX: rest.x, lastY: rest.y, travelled: Infinity } : null;
      return;
    }
    this.gesture = null;

    if (gesture.kind === 'pan') {
      if (gesture.travelled < 12 * this.dpr) this.tap(pointer.x, pointer.y);
      return;
    }

    const preview = session.preview;
    session.setPreview(null);
    if (session.tool === 'look' || !preview) return;
    if (preview.cells.length === 0) {
      session.notify(session.tool === 'clear' ? 'Nothing there to clear.' : 'Nothing there can take that.', 'error');
      return;
    }
    const result = store.dispatch({ type: 'paint', tool: session.tool, cells: preview.cells });
    if (!result.ok) session.notify(result.error, 'error');
  }

  /**
   * The building under a screen point. A tall building covers the cells behind
   * it, so look at the few cells in front of the ground cell first.
   */
  private buildingUnder(screenX: number, screenY: number): Point | null {
    const world = this.toWorld(screenX, screenY);
    const [gx, gy] = this.cellAt(screenX, screenY);
    for (let k = 4; k >= 1; k--) {
      for (const [dx, dy] of [[k, k], [k, k - 1], [k - 1, k]] as const) {
        const x = gx + dx;
        const y = gy + dy;
        if (!this.inMap(x, y)) continue;
        const object = this.visuals[y * this.mapWidth + x]?.object;
        if (object?.visible && object.getBounds().contains(world.x, world.y)) return [x, y];
      }
    }
    return null;
  }

  private tap(screenX: number, screenY: number): void {
    const [x, y] = this.buildingUnder(screenX, screenY) ?? this.cellAt(screenX, screenY);
    if (!this.inMap(x, y)) {
      session.clearSelection();
      return;
    }
    const cell = store.state.map.cells[y * this.mapWidth + x]!;
    if (cell.kind === 'lot') session.select(x, y);
    else session.clearSelection();
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!store.hasGame) return;
    const cam = this.cameras.main;
    this.zoomAt(pointer.x, pointer.y, dy > 0 ? cam.zoom / WHEEL_STEP : cam.zoom * WHEEL_STEP);
  }
}
