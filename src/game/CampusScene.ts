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
  studentKey,
  PLACED,
  previewPlace,
  reachCells,
  incidentText,
  type Incident,
} from '../sim';
import { Art, MANIFEST_KEY, type ArtManifest } from './art';
import { Iso } from './iso';
import { PlacedSprites, type PlacedItem } from './Placed';
import { Walkers } from './Walkers';

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
  /** Read by the dev tools to find the responder looks. */
  art!: Art;
  private iso!: Iso;
  private visuals: Visual[] = [];
  private mapWidth = 0;
  private mapHeight = 0;
  private gameId = '';
  private walkers!: Walkers;
  private placed!: PlacedSprites;
  /** Extra tinted cells: the reach of a building being placed, or a coverage overlay. */
  private tints: Array<{ cells: Point[]; colour: number; alpha: number }> = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private dirty = true;
  private overlayDirty = true;
  private nextBarsAt = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private dpr = 1;
  private pendingArrivals = 0;
  /** One walking responder for each incident that has help on the way. */
  private responders = new Map<number, Phaser.GameObjects.Image>();
  /** Items the dev previews put on the map, beside the buildings in the game state. */
  private devItems: PlacedItem[] = [];
  private placedDirty = true;
  /** A point of the world the camera is gliding to, after a tap on a card's reason. */
  private glide: { x: number; y: number } | null = null;
  private focusSeq = 0;

  constructor() {
    super('campus');
  }

  create(): void {
    const manifest = (this.cache.json.get(MANIFEST_KEY) ?? null) as ArtManifest | null;
    this.art = new Art(this, manifest);
    this.iso = new Iso(this.art.halfWidth, this.art.halfHeight);
    this.dpr = 1 / this.scale.zoom;
    this.walkers = new Walkers(this, this.art, this.iso);
    this.placed = new PlacedSprites(this, this.art, this.iso);
    // Dev builds: reach the scene from the console, for screenshots and checks.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__scene = this;

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
      this.placedDirty = true;
      this.walkers.setMarked(session.student ? studentKey(session.student) : null);
    });
    // Students who get a place while the player is watching are shown walking in.
    const unsubscribeLive = store.onLive((entries) => {
      let movedIn = 0;
      for (const entry of entries) {
        if (entry.kind === 'waitlist') movedIn += Number(entry.data?.count ?? 0);
        else if (entry.kind === 'intake') movedIn += Number(entry.data?.admitted ?? 0);
      }
      if (movedIn > 0) this.pendingArrivals += movedIn;
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeStore();
      unsubscribeSession();
      unsubscribeLive();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  override update(time: number, delta: number): void {
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
      this.walkers.setMap(state);
      this.placedDirty = true;
      this.dirty = false;
      this.overlayDirty = true;
      this.nextBarsAt = 0;
    }
    if (this.pendingArrivals > 0) {
      this.walkers.arrive(this.pendingArrivals);
      this.pendingArrivals = 0;
    }
    if (this.placedDirty) {
      this.showPlaced(state);
      this.placedDirty = false;
    }
    this.walkers.update(delta);
    this.moveResponders(state, time);
    this.watchStudent(delta);
    this.placed.update(time);
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
    this.walkers.clear();
    this.placed.clear();
    for (const sprite of this.responders.values()) sprite.destroy();
    this.responders.clear();
    this.tints = [];
    this.pendingArrivals = 0;
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

  /**
   * What stands on a quad cell, chosen from where the cell sits in its quad so a
   * lawn looks laid out rather than scattered: trees at the corners and ends,
   * benches along the edges, flowers in the middle, and plain lawn between.
   * A quad of one cell gets the showpiece.
   */
  private quadTop(state: GameState, x: number, y: number): string {
    const { width, height, cells } = state.map;
    const isQuad = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < width && cy < height && cells[cy * width + cx]!.kind === 'quad';
    const north = isQuad(x, y - 1);
    const east = isQuad(x + 1, y);
    const south = isQuad(x, y + 1);
    const west = isQuad(x - 1, y);
    const links = Number(north) + Number(east) + Number(south) + Number(west);

    // How far this cell is from the west and north ends of its run of quad cells. Counting
    // from the quad's own corner keeps the pattern the same wherever the quad is built.
    let fromWest = 0;
    while (isQuad(x - fromWest - 1, y)) fromWest += 1;
    let fromNorth = 0;
    while (isQuad(x, y - fromNorth - 1)) fromNorth += 1;

    let top = '';
    if (links === 0) top = 'quad.feature';
    else if (links === 1) top = 'quad.tree';
    else if (links === 2 && !(north && south) && !(east && west)) top = 'quad.tree';
    else if (links === 2) top = ['', 'quad.bench', 'quad.flowers'][(east && west ? fromWest : fromNorth) % 3]!;
    else if (links === 3) top = (north && south ? fromNorth : fromWest) % 2 === 1 ? 'quad.bench' : '';
    else top = fromWest % 2 === 1 && fromNorth % 2 === 1 ? 'quad.flowers' : '';
    return top && this.art.has(top) ? top : '';
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
          if (this.art.has('quad.lawn')) {
            groundKey = 'quad.lawn';
            objectKey = this.quadTop(state, x, y);
          } else {
            // An older pack: whole quad tiles with their trees drawn in.
            groundKey = this.variantKey('quad', cellHash(x, y));
          }
        } else if (cell.kind === 'tree') {
          objectKey = this.variantKey('tree', cell.variant);
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

        // A flat building is drawn in place of the ground under it, from its top corner.
        let hidden = false;
        if (cell.kind === 'placed' && cell.placedId !== null) {
          const placed = state.map.placed[cell.placedId];
          hidden = !!placed && PLACED[placed.type].flat && this.art.has(PLACED[placed.type].sprite) && !(placed.x === x && placed.y === y);
        }

        const signature = `${groundKey}|${tint}|${objectKey}|${works ? 1 : 0}|${hidden ? 1 : 0}`;
        const visual = this.visuals[i]!;
        if (visual.signature === signature) continue;
        visual.signature = signature;

        this.art.apply(visual.ground, groundKey);
        visual.ground.setTint(tint);
        visual.ground.setVisible(!hidden);

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

  /** Extra things for the dev look previews to put on the map. */
  setPlaced(items: readonly PlacedItem[]): void {
    this.devItems = [...items];
    this.placedDirty = true;
  }

  /** The sprite for a building, or a plain stand-in when the art pack in use does not draw it. */
  private spriteFor(type: keyof typeof PLACED): { key: string; flat: boolean } {
    const spec = PLACED[type];
    if (this.art.has(spec.sprite)) return { key: spec.sprite, flat: spec.flat };
    return { key: spec.flat ? 'quad.lawn' : this.variantKey('academic.2', 0), flat: false };
  }

  /** Draw the hand-placed buildings in the game state, and the one being placed. */
  private showPlaced(state: GameState): void {
    const items: PlacedItem[] = [...this.devItems];
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const sprite = this.spriteFor(placed.type);
      items.push({ key: sprite.key, x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: sprite.flat ? 'ground' : 'object', id: placed.id });
    }
    // An icon floats over every open incident.
    for (const incident of state.incidents.active) {
      const over = this.incidentPlace(state, incident);
      items.push({ key: incident.kind === 'injury' ? 'icon.injury' : 'icon.mischief', x: over.x, y: over.y, w: over.w, h: over.h, layer: 'float', lift: over.lift });
    }
    if (session.placing && session.ghost) {
      const spec = PLACED[session.placing];
      const sprite = this.spriteFor(session.placing);
      // Drawn in front of whatever it overlaps, so the player can always see where it would go.
      items.push({ key: sprite.key, x: session.ghost.x, y: session.ghost.y, w: spec.w, h: spec.h, layer: 'object', alpha: 0.7, forward: 1 });
    }
    this.placed.set(items);
  }

  /** While placing: the footprint in green or red, and the reach in blue. */
  private ghostTints(): Array<{ cells: Point[]; colour: number; alpha: number }> {
    if (!session.placing || !session.ghost || !store.hasGame) return [];
    const preview = previewPlace(store.state, session.placing, session.ghost.x, session.ghost.y);
    return [
      { cells: reachCells(store.state.map, session.placing, session.ghost.x, session.ghost.y), colour: 0x8fd3ff, alpha: 0.2 },
      { cells: preview.cells, colour: preview.problem === null ? 0x6fe38c : 0xff6b5c, alpha: 0.55 },
    ];
  }

  /** Tint groups of cells, for a reach or coverage area. */
  setTints(tints: Array<{ cells: Point[]; colour: number; alpha: number }>): void {
    this.tints = tints;
    this.overlayDirty = true;
  }

  /** The paint preview and the selected lot. */
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    for (const tint of [...this.tints, ...this.ghostTints()]) {
      for (const [x, y] of tint.cells) this.fillCell(x, y, tint.colour, tint.alpha);
    }
    const preview = session.clearing ?? session.preview;
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

  // ------------------------------------------------------------ incidents --

  /** The block of cells an incident's icon hovers over, and how high: the middle of the building it happened at. */
  private incidentPlace(state: GameState, incident: Incident): { x: number; y: number; w: number; h: number; lift: number } {
    const id = state.map.cells[incident.y * state.map.width + incident.x]?.placedId ?? null;
    const placed = id === null ? null : state.map.placed[id];
    if (placed) return { x: placed.x, y: placed.y, w: placed.w, h: placed.h, lift: PLACED[placed.type].flat ? 56 : 120 };
    return { x: incident.x, y: incident.y, w: 1, h: 1, lift: 112 };
  }

  /** Where an incident's icon sits in the world. */
  private incidentSpot(incident: Incident): { x: number; y: number } {
    const over = this.incidentPlace(store.state, incident);
    const at = this.iso.toWorld(over.x + over.w / 2, over.y + over.h / 2);
    return { x: at.x, y: at.y - over.lift };
  }

  /**
   * Walk a responder from the covering building to each incident with help on
   * the way. For show: the outcome and its time were fixed when the incident
   * began, and the walk is drawn to arrive on that minute.
   */
  private moveResponders(state: GameState, timeMs: number): void {
    const people = this.art.people;
    const seen = new Set<number>();
    if (people) {
      const now = clock.now();
      for (const incident of state.incidents.active) {
        const home = incident.responder === null ? null : state.map.placed[incident.responder];
        if (!home) continue;
        const began = this.realTimeOfTick(state, incident.startTick);
        const ends = this.realTimeOfTick(state, incident.endTick);
        const along = Phaser.Math.Clamp((now - began) / Math.max(1, ends - began), 0, 1);
        const fromX = home.x + home.w / 2;
        const fromY = home.y + home.h + 0.2;
        const over = this.incidentPlace(state, incident);
        const toX = over.x + over.w / 2;
        const toY = over.y + over.h / 2;
        const x = fromX + (toX - fromX) * along;
        const y = fromY + (toY - fromY) * along;
        const dx = toX - fromX;
        const dy = toY - fromY;
        const direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
        const facing = people.flip?.[direction] ?? direction;
        const look = (incident.kind === 'injury' ? people.roles?.medic : people.roles?.officer) ?? 0;
        const frame = along >= 1 ? 0 : Math.floor(timeMs / people.frameMs) % people.frames;
        let sprite = this.responders.get(incident.id);
        if (!sprite) {
          sprite = this.add.image(0, 0, '__DEFAULT');
          this.responders.set(incident.id, sprite);
        }
        this.art.apply(sprite, `person.${look}.${facing}.${frame}`);
        sprite.setFlipX(people.flip?.[direction] !== undefined);
        const at = this.iso.toWorld(x, y);
        sprite.setPosition(at.x, at.y).setDepth((x + y - 1) * 4 + 2.6);
        seen.add(incident.id);
      }
    }
    for (const [id, sprite] of this.responders) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.responders.delete(id);
    }
  }

  // --------------------------------------------------------- student card --

  /** Keep the open card in step with its walker, and the camera on them when asked. */
  private watchStudent(delta: number): void {
    const cam = this.cameras.main;
    const ease = 1 - Math.pow(0.004, delta / 1000);

    const focus = session.focus;
    if (focus && focus.seq !== this.focusSeq) {
      this.focusSeq = focus.seq;
      this.glide = this.iso.toWorld(focus.x + 0.5, focus.y + 0.5);
    }

    const student = session.student;
    const key = student ? studentKey(student) : null;
    session.setDoing(key ? this.walkers.doing(key) : null);
    const at = key && session.following ? this.walkers.spot(key) : null;
    // They went indoors: there is nobody left to follow.
    if (session.following && !at) session.setFollowing(false);

    const target = at ?? this.glide;
    if (!target) return;
    // The card covers the bottom of the screen, so aim a little above the middle.
    const wantX = target.x - cam.width / 2;
    const wantY = target.y - cam.height / 2 + (cam.height * 0.1) / cam.zoom;
    const fromX = cam.scrollX;
    const fromY = cam.scrollY;
    cam.setScroll(fromX + (wantX - fromX) * ease, fromY + (wantY - fromY) * ease);
    this.clampCamera();
    // A glide ends when it arrives, or when the edge of the map stops it.
    if (!at && Math.abs(cam.scrollX - fromX) + Math.abs(cam.scrollY - fromY) < 0.3) this.glide = null;
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
    // Touching the map again drops a clear that was waiting for a yes.
    session.cancelClear();
    if (!store.hasGame) return;

    if (this.touches.size >= 2) {
      // A second finger always means pan and zoom. Any paint in progress is dropped.
      if (this.gesture?.kind === 'paint') session.setPreview(null);
      this.gesture = this.startPinch();
      return;
    }

    if (session.tool === 'look' || session.tool === 'place') {
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
    if (this.gesture?.kind !== 'paint' || session.tool === 'look' || session.tool === 'place') return;
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
      // Dragging the map takes the camera back from a follow or a glide.
      if (this.gesture.travelled >= 12 * this.dpr) {
        this.glide = null;
        if (session.following) session.setFollowing(false);
      }
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
    if (session.tool === 'look' || session.tool === 'place' || !preview) return;
    if (preview.cells.length === 0) {
      session.notify(session.tool === 'clear' ? 'Nothing there to clear.' : 'Nothing there can take that.', 'error');
      return;
    }
    if (session.tool === 'clear') {
      // Nothing is cleared until the player has seen what comes back.
      session.askClear(preview);
      return;
    }
    const result = store.dispatch({
      type: 'paint',
      tool: session.tool,
      cells: preview.cells,
      ...(session.tool === 'tree' ? { variant: session.treeKind } : {}),
    });
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
        if (store.state.map.cells[y * this.mapWidth + x]?.kind !== 'lot') continue;
        const object = this.visuals[y * this.mapWidth + x]?.object;
        if (object?.visible && object.getBounds().contains(world.x, world.y)) return [x, y];
      }
    }
    return null;
  }

  private tap(screenX: number, screenY: number): void {
    const world = this.toWorld(screenX, screenY);
    if (session.tool === 'place' && session.placing) {
      // The building goes where the finger is: its footprint is centred on the tapped cell.
      const spec = PLACED[session.placing];
      const [cx, cy] = this.cellAt(screenX, screenY);
      session.setGhost(cx - Math.floor((spec.w - 1) / 2), cy - Math.floor((spec.h - 1) / 2));
      return;
    }
    // An incident's icon says what happened and whether anyone is coming.
    const reach = (26 * this.dpr) / this.cameras.main.zoom;
    for (const incident of store.state.incidents.active) {
      const spot = this.incidentSpot(incident);
      if (Math.abs(world.x - spot.x) > reach || Math.abs(world.y - (spot.y - reach * 0.6)) > reach * 1.4) continue;
      session.notify(`${incidentText(incident)} ${incident.responder === null ? 'Nobody is coming.' : 'Help is on the way.'}`);
      return;
    }
    // A walker is in front of whatever they are walking past.
    const walker = this.walkers.walkerAt(world.x, world.y, (14 * this.dpr) / this.cameras.main.zoom);
    if (walker) {
      if (walker.student) session.openStudent(walker.student);
      else session.notify('Staff. Students arrive with the first class.');
      return;
    }
    session.closeStudent();
    const building = this.placed.hit(world.x, world.y);
    if (building) {
      session.select(building.x, building.y);
      return;
    }
    const [x, y] = this.buildingUnder(screenX, screenY) ?? this.cellAt(screenX, screenY);
    if (!this.inMap(x, y)) {
      session.clearSelection();
      return;
    }
    const cell = store.state.map.cells[y * this.mapWidth + x]!;
    if (cell.kind === 'lot' || cell.kind === 'placed') session.select(x, y);
    else session.clearSelection();
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!store.hasGame) return;
    const cam = this.cameras.main;
    this.zoomAt(pointer.x, pointer.y, dy > 0 ? cam.zoom / WHEEL_STEP : cam.zoom * WHEEL_STEP);
  }
}
