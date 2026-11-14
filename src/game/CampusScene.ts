import Phaser from 'phaser';
import { STAYING, type Stander } from '../app/activityPeople';
import { kerbAt, planTraffic, type TrafficPlan } from '../app/traffic';
import { clock } from '../app/clock';
import { quarterFor, spinAbout, stillSize, turntable } from '../app/spin';
import { SETTLE_MS, settleDegrees, settling, twistMove, twistStart, type Twist } from '../app/twist';
import { CROWD_STEPS, crowdSetting, FrameBudget, stepOf } from '../app/crowd';
import { effectsSetting, scenesFor, type Scenes as LifeScenes, type Weather } from '../app/life';
import { sound } from '../app/sound';
import { currentDaylight, type Daylight } from '../app/daylight';
import { session } from '../app/session';
import { store } from '../app/store';
import { previewPaint, readyToCollect, rowBetween, stageSpec, TICK_MS, type Building, type GameState, type Point, type Zone, personKey, studentKey, type PersonRef, PLACED, previewPlace, craftsReady, decorSprite, reachCells, incidentText, hoodAt, parcelAt, driversNow, hasRoadAccess, isPathKind, isRoadKind, roadsByAccess, binState, enrollment, isBrokenThing, isMessSpot, isPathKind as isWalk, isBrokenLamp, lampAt, LITTER_CEILING, spotClean, workersAt, yardOver, START_LAND, TOWN_X, calendarAt, dateAt, dayRead, homeGameNow, SCHOOL_COLOURS, weatherAt, townHints, townLiving, townPlaces, type Incident, type Placed, placedCars, decorSpec } from '../sim';
import { Activity } from './Activity';
import { Ambient } from './Ambient';
import { Scenes } from './Scenes';
import { Windows } from './Windows';
import { Art, MANIFEST_KEY, type ArtManifest } from './art';
import { Cars } from './Cars';
import { GroundsWorkers } from './GroundsWorkers';
import { facingOf, Iso, nextTurn, type Turn } from './iso';
import { PlacedSprites, type PlacedItem } from './Placed';
import { townLook } from './townLook';
import { Walkers } from './Walkers';

/** Empty zoned lots are tinted so the player can tell the zones apart at a glance. */
const ZONE_TINT: Record<Zone, number> = { housing: 0x9cc3ff, academic: 0xffc27a };
const NO_TINT = 0xffffff;

/** Land the campus does not own yet is dimmed. */
const FOR_SALE_TINT = 0x9cb39a;
/** The light of the hour is laid over the map here: above everything on the ground, below the icons that float. */
const LIGHT_DEPTH = 800_000;
/** Fans stay on the field this many minutes after a big home win. */
const STORM_TICKS = 5;

/** A colour halfway to white, for tinting a figure without losing its face. */
function softened(colour: number): number {
  const mix = (shift: number): number => Math.round((((colour >> shift) & 0xff) + 255) / 2);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
/** The Cleanliness overlay: clean, getting messy, dirty or in need of a worker, and where a yard's workers reach. */
const CLEAN_OK = 0x6fe38c;
const CLEAN_SOME = 0xffd24a;
const CLEAN_BAD = 0xff5a4d;
const CLEAN_REACH = 0x7ab8ff;
/** The most pieces of litter drawn around one spot, and how near to it they lie. */
const LITTER_SHOWN = 9;
const LITTER_NEAR = 2;
/** The Parking overlay: what a road reaches, what it does not, and the avenue a road has to get to. */
const PARKING_OK = 0x6fe38c;
const PARKING_CUT = 0xff5a4d;
const PARKING_AVENUE = 0x7ab8ff;
/** How high the "no road access" badge floats over a surface lot and over a parking structure. */
const BADGE_LIFT = { low: 74, tall: 168 } as const;
/**
 * What the map says at the edge of a campus the town cannot get into. The
 * owner's words, 2026-11-11. Each stands with a sign from the art pack.
 */
const HINT_TEXT = { walk: 'Connect a path here\nso locals can walk in', drive: 'Build parking with a road\nhere so locals can drive in' } as const;
const HINT_LIFT = 26;

/** How long a collected building's medal takes to rise and fade. The dev page slows it, to take its picture. */
export const collectShow = { burstMs: 700 };

/** A building that is ready to collect: its block of cells, how high its medal floats, and what it holds. */
interface CollectSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  lift: number;
  xp: number;
}
/** Where cars park on a surface lot, as steps along it from its top corner. */
const PARKED_AT = [0.02, 0.5, 1.0] as const;

const MAX_ZOOM_FACTOR = 2.2;
/** How quickly the map catches up with twisting fingers: it has most of the way in this many milliseconds. */
const TWIST_FOLLOW_MS = 45;
/** The longest side of the spin's picture of the ground, in pixels: past it the picture is made a little softer. */
const SPIN_STILL_MAX = 3072;
/** Where the spin's picture of the ground is drawn, under everything, and where the upright drawings are sorted above it. */
const SPIN_STILL_DEPTH = -10;
const SPIN_DEPTH = 10_000;

/** An upright drawing during a spin (DESIGN.md 43.6): where its owner put it, and the ground it stands on. */
interface SpinPart {
  object: Phaser.GameObjects.Image;
  base: { x: number; y: number };
  depth: number;
  ground: { x: number; y: number };
  /** The corners of its ground, for which is in front as the ground swings round. None for one that keeps its order. */
  corners: Array<{ x: number; y: number }> | null;
  /** A little further forward, as a cone beside what it marks. */
  bias: number;
}

/** Something put away for the length of a spin, to be shown again at its end. */
type Shown = Phaser.GameObjects.GameObject & { visible: boolean; setVisible(value: boolean): unknown };

/** The turntable spin while two fingers twist the map, and while it settles (DESIGN.md 43.6). */
interface Spin {
  /** The angle it is shown at, in degrees from where it began, and the quarters the view has been drawn round since. */
  shown: number;
  quarter: number;
  settle: { from: number; to: number; at: number; done?: boolean } | null;
  /** The picture of the flat ground, and the container that turns it. */
  still: Phaser.GameObjects.Container;
  turner: Phaser.GameObjects.Container;
  textureKey: string;
  parts: SpinPart[];
  hidden: Shown[];
  /** Which ground tiles and sidewalks the view as drawn now shows, to show them again at the end. */
  ground: boolean[];
  kerb: boolean[];
}
const WHEEL_STEP = 1.12;

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number; travelled: number }
  | { kind: 'paint'; start: Point; last: Point }
  | {
      kind: 'pinch';
      distance: number;
      midX: number;
      midY: number;
      /** Whether two fingers are pinching or twisting (DESIGN.md section 43), and the camera as they found it. */
      twist: Twist;
      from: { zoom: number; scrollX: number; scrollY: number };
    };

interface Visual {
  ground: Phaser.GameObjects.Image;
  object: Phaser.GameObjects.Image | null;
  works: Phaser.GameObjects.Image | null;
  /** The sidewalk along a road's sides (DESIGN.md 59.1), drawn over its ground. */
  kerb: Phaser.GameObjects.Image | null;
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
  private cars!: Cars;
  private crew!: GroundsWorkers;
  private activity!: Activity;
  /** Small scenes that come and go: club tables, pickup games, a busker, the boxes of move-in day. */
  private scenes!: Scenes;
  /** Students standing in an activity or a small scene, by key. Shared with the walkers, so nobody is in two places. */
  private readonly staying = new Set<string>();
  /** The ring under such a student while their card is open. */
  private stayRing: Phaser.GameObjects.Ellipse | null = null;
  /** Ripples and sprinklers. */
  private ambient!: Ambient;
  /** Lit windows on dorms and lecture halls after dark. */
  private windows!: Windows;
  /** Trees that sway, by cell. */
  private swayers = new Map<number, Phaser.GameObjects.Image>();
  /** What the rule for small scenes asks for now, and when it is next read. */
  private life: LifeScenes | null = null;
  private nextLifeAt = 0;
  /** The sky, from the game's own weather. */
  private weather: Weather = 'clear';
  /** Set by a dev page to show one kind of weather. */
  private weatherHeld: Weather | null = null;
  private stormHeld = false;
  /** The zoom the map opened at: sound is fullest there and closer, and quieter zoomed out. */
  private homeZoom = 1;
  /** The sentence that stands with each edge marker, by which marker it is. */
  private hintTexts = new Map<'walk' | 'drive', Phaser.GameObjects.Text>();
  /** Where each edge marker stands, for taps. */
  private hintSpots = new Map<'walk' | 'drive', { x: number; y: number }>();
  /** Holds the frame rate: steps the crowd down when frames are short, and back up when they recover. */
  private budget = new FrameBudget(stepOf(crowdSetting()));
  private crowdCeiling = stepOf(crowdSetting());
  private frames = 0;
  private framesSince = 0;
  private fps = 60;
  /** Dev only: the milliseconds of work one frame takes, from the start of the step to the end of the draw. */
  private frameMs = 0;
  private workSum = 0;
  private workFrames = 0;
  private workFrom = 0;
  private swaying = false;
  /** Dev screenshots: keep the crowd at the setting whatever the frame rate. A screenshot machine draws slowly. */
  private crowdHeld = false;
  /** Dev screenshots: a weekend's visitors on any day. */
  private weekendHeld = false;
  /** Cells with litter drawn on them, and the place it came from. A tap there opens that place. */
  private litterCells = new Map<number, number>();
  private placed!: PlacedSprites;
  /** The light of the hour, multiplied over the whole map. */
  private lightLayer!: Phaser.GameObjects.Rectangle;
  /** The glow of each lit street lamp, by cell. Drawn over the night so the lamps shine. */
  private glows = new Map<number, Phaser.GameObjects.Image>();
  private light: Daylight = currentDaylight();
  private lampsLit = false;
  private nextLightAt = 0;
  /** Extra tinted cells: the reach of a building being placed, or a coverage overlay. */
  private tints: Array<{ cells: Point[]; colour: number; alpha: number }> = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private dirty = true;
  private overlayDirty = true;
  private nextBarsAt = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  /** Where two twisting fingers have the map, in degrees from where they began to twist (DESIGN.md 43.6). */
  private twistWanted = 0;
  /** The turntable spin while it lasts; asked for by the fingers and begun in the next frame. */
  private spin: Spin | null = null;
  private spinAsked = false;
  /** Where to settle a spin the fingers let go of before it began. */
  private spinSettleTo: number | null = null;
  private spinCount = 0;
  /** How long the last redraw a quarter round took in a spin, for the dev readout. */
  spinRedrawMs = 0;
  spinEndMs = 0;
  private dpr = 1;
  private pendingArrivals = 0;
  /** One walking responder for each incident that has help on the way. */
  private responders = new Map<number, Phaser.GameObjects.Image>();
  /** Items the dev previews put on the map, beside the buildings in the game state. */
  private devItems: PlacedItem[] = [];
  private placedDirty = true;
  /** Where a medal floats over each building that is ready to collect, by its key, with what it holds. */
  private collectSpots = new Map<string, CollectSpot>();
  /** Where the hammer floats while the Workshop holds something finished. null when it does not. */
  private craftSpot: CollectSpot | null = null;
  /** The experience and the game the markers were last drawn for: a marker gone with experience gained was collected. */
  private collectXp = -1;
  private collectGame = '';
  /** A point of the world the camera is gliding to, after a tap on a card's reason. */
  private glide: { x: number; y: number } | null = null;
  private focusSeq = 0;
  /** Where the glide should come to rest, as a share of the screen's height. */
  private glideAim = 0.4;
  /** The ring round a hall named on a card, while it shows (DESIGN.md 60). */
  private hallRing: Phaser.GameObjects.Graphics | null = null;
  private hallRingSeq = 0;
  private hallRingAt: { x: number; y: number; since: number } | null = null;

  constructor() {
    super('campus');
  }

  create(): void {
    const manifest = (this.cache.json.get(MANIFEST_KEY) ?? null) as ArtManifest | null;
    this.art = new Art(this, manifest);
    this.iso = new Iso(this.art.halfWidth, this.art.halfHeight);
    this.dpr = 1 / this.scale.zoom;
    this.walkers = new Walkers(this, this.art, this.iso);
    this.cars = new Cars(this, this.art, this.iso);
    this.crew = new GroundsWorkers(this, this.art, this.iso);
    // Students standing in an activity or a small scene. With the walkers' own list, nobody is in two places.
    const walking = (key: string): boolean => this.walkers.isOut(key);
    this.activity = new Activity(this, this.art, this.iso, this.staying, walking);
    this.scenes = new Scenes(this, this.art, this.iso, this.staying, walking);
    this.walkers.setElsewhere(this.staying);
    this.ambient = new Ambient(this, this.art, this.iso);
    this.windows = new Windows(this, this.art, this.iso, LIGHT_DEPTH + 1);
    // A car waits at a crossing while somebody is walking over it, and a walker waits at the kerb for a car.
    this.cars.watchCrossings((cell) => this.walkers.onCrossing(cell));
    this.walkers.watchCars((cell) => this.cars.onCrossing(cell));
    this.applyStep(this.budget.step);
    if (import.meta.env.DEV) {
      // How long a frame's work takes, for the report: a frame rate says nothing once the screen caps it.
      this.game.events.on(Phaser.Core.Events.PRE_STEP, () => (this.workFrom = performance.now()));
      this.game.events.on(Phaser.Core.Events.POST_RENDER, () => {
        this.workSum += performance.now() - this.workFrom;
        this.workFrames += 1;
      });
    }
    this.placed = new PlacedSprites(this, this.art, this.iso);
    this.lightLayer = this.add.rectangle(0, 0, 200_000, 200_000, 0xffffff, 0).setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
    // Photo mode asks the map for a picture of itself (DESIGN.md 42.5).
    session.snap = () => this.snapshot();
    // Dev builds: reach the scene from the console, for screenshots and checks.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__scene = this;
      (window as unknown as Record<string, unknown>).__sound = sound;
    }

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
      // The twist (DESIGN.md section 43). In the middle of a spin the view's own turn leads, until it ends.
      if (!this.spin && session.turn !== this.iso.turn && this.visuals.length > 0) this.applyTurn(session.turn);
      // The ring goes under whoever's card is open: a student, or anyone else out walking.
      this.walkers.setMarked(session.student ? studentKey(session.student) : session.person ? `p:${personKey(session.person)}` : null);
    });
    // Students who get a place while the player is watching are shown walking in.
    const unsubscribeLive = store.onLive((entries) => {
      let movedIn = 0;
      for (const entry of entries) {
        // The move-in crowd has a cap of its own, so it takes the real number who arrived.
        if (entry.kind === 'waitlist') movedIn += Number(entry.data?.count ?? 0);
        else if (entry.kind === 'intake') movedIn += Number(entry.data?.admitted ?? 0);
      }
      if (movedIn > 0) this.pendingArrivals += Math.ceil(movedIn);
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
    // The turntable spin (DESIGN.md 43.6). While it lasts the map waits: nothing else moves or is laid again.
    if (this.spinAsked && !this.spin) {
      this.spinAsked = false;
      this.startSpin();
      const started = this.spin as Spin | null;
      if (started && this.spinSettleTo !== null) started.settle = { from: 0, to: this.spinSettleTo, at: time };
      this.spinSettleTo = null;
    }
    let spinEnded = 0;
    if (this.spin) {
      this.watchFrames(time);
      spinEnded = performance.now();
      this.stepSpin(time, delta);
      if (this.spin) return;
    }
    // The hour moves slowly. Once a second is plenty.
    if (time >= this.nextLightAt) {
      this.nextLightAt = time + 1000;
      this.showLight();
    }
    this.watchFrames(time);
    if (this.dirty) {
      this.syncMap(state);
      this.walkers.setMap(state);
      // A Saturday or Sunday in the game's own calendar is quieter on the paths.
      const weekday = dateAt(state.clock).weekday;
      this.walkers.setWeekend(this.weekendHeld || weekday === 0 || weekday === 6);
      this.cars.setMap(state);
      this.crew.setMap(state);
      this.activity.setMap(state);
      this.scenes.setMap(state);
      this.ambient.setMap(state);
      this.windows.setMap(state);
      this.nextLifeAt = 0;
      this.placedDirty = true;
      this.dirty = false;
      this.overlayDirty = true;
      this.nextBarsAt = 0;
    }
    // How long the frame that ended a spin took to lay the view again, for the dev readout.
    if (spinEnded > 0) this.spinEndMs = performance.now() - spinEnded;
    if (this.pendingArrivals > 0) {
      // Move-in: the newcomers walk in with a parent or two, and boxes are stacked by their dorms.
      this.scenes.moveIn(this.walkers.arrive(this.pendingArrivals), time);
      this.pendingArrivals = 0;
    }
    if (time >= this.nextLifeAt) {
      this.nextLifeAt = time + 400;
      this.showLife(state);
    }
    if (this.placedDirty) {
      this.showPlaced(state);
      this.placedDirty = false;
    }
    this.walkers.update(delta);
    this.cars.update(delta, this.light.period);
    this.crew.update(time);
    this.activity.update(time, delta);
    this.scenes.update(time, delta);
    this.ambient.update(time);
    this.sway(time);
    this.showHintTexts();
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
      v.kerb?.destroy();
    }
    this.visuals = [];
    this.gameId = '';
    this.walkers.clear();
    this.cars.clear();
    this.crew.clear();
    this.activity.clear();
    this.scenes.clear();
    this.staying.clear();
    this.stayRing?.setVisible(false);
    this.ambient.clear();
    this.windows.clear();
    this.swayers.clear();
    for (const text of this.hintTexts.values()) text.destroy();
    this.hintTexts.clear();
    this.hintSpots.clear();
    this.litterCells.clear();
    this.placed.clear();
    for (const glow of this.glows.values()) glow.destroy();
    this.glows.clear();
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
    // The map opens facing the way the player last left it.
    this.iso.setMap(width, height);
    this.iso.setTurn(session.turn);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = this.iso.cellTop(x, y);
        const ground = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(this.iso.depth(x, y, 0));
        this.visuals.push({ ground, object: null, works: null, kerb: null, signature: '' });
      }
    }
    this.frameCamera();
  }

  /**
   * Turn the view (DESIGN.md section 43). The map is the same; it is laid down
   * a quarter further round. Every tile is placed again and every drawing
   * chosen again, once. The spot in the middle of the screen stays there.
   */
  private applyTurn(turn: Turn, clamp = true): void {
    const cam = this.cameras.main;
    const middle = this.iso.toMap(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    this.iso.setTurn(turn);
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const visual = this.visuals[y * this.mapWidth + x]!;
        const pos = this.iso.cellTop(x, y);
        visual.ground.setPosition(pos.x, pos.y).setDepth(this.iso.depth(x, y, 0));
        visual.signature = '';
      }
    }
    // Lamp glows and lit windows are placed again where their lamps and walls now stand.
    for (const glow of this.glows.values()) glow.destroy();
    this.glows.clear();
    this.windows.clear();
    this.dirty = true;
    this.placedDirty = true;
    this.overlayDirty = true;
    this.nextBarsAt = 0;
    this.glide = null;
    const at = this.iso.toWorld(middle.x, middle.y);
    cam.setScroll(at.x - cam.width / 2, at.y - cam.height / 2);
    // In the middle of a spin the middle of the screen must stay the same spot of the map, even at an edge.
    if (clamp) this.clampCamera();
  }

  private pathMask(state: GameState, x: number, y: number): number {
    const { width, height, cells } = state.map;
    const isPath = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < width && cy < height && isPathKind(cells[cy * width + cx]!.kind);
    return (
      (isPath(x, y - 1) ? 1 : 0) | (isPath(x + 1, y) ? 2 : 0) | (isPath(x, y + 1) ? 4 : 0) | (isPath(x - 1, y) ? 8 : 0)
    );
  }

  /** The sidewalk drawn over a road cell, as the view is turned (DESIGN.md 59.1), or '' for none. */
  private kerbKey(plan: TrafficPlan, x: number, y: number): string {
    const { sides, corners } = kerbAt(plan, x, y);
    if (sides === 0 && corners === 0) return '';
    const key = `kerb.${this.iso.mask(sides)}.${this.iso.mask(corners)}`;
    return this.art.has(key) ? key : '';
  }

  /** Which sides of a road cell join more road: the player's roads, crossings and the town's streets. */
  private roadMask(state: GameState, x: number, y: number): number {
    const { width, height, cells } = state.map;
    const isRoad = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < width && cy < height && isRoadKind(cells[cy * width + cx]!.kind);
    return (
      (isRoad(x, y - 1) ? 1 : 0) | (isRoad(x + 1, y) ? 2 : 0) | (isRoad(x, y + 1) ? 4 : 0) | (isRoad(x - 1, y) ? 8 : 0)
    );
  }

  /**
   * The light of the hour, from the player's own clock: a tint over the map,
   * the street lamps, and how busy the paths and roads are. For show only.
   */
  private showLight(): void {
    const light = currentDaylight();
    this.light = light;
    this.lightLayer.setFillStyle(light.colour, light.strength);
    const lit = light.lamps > 0.05;
    if (lit !== this.lampsLit) {
      this.lampsLit = lit;
      this.dirty = true;
    }
    for (const glow of this.glows.values()) glow.setAlpha(light.lamps).setVisible(lit);
    this.walkers.setPeriod(light.period);
    this.activity.setPeriod(light.period);
  }

  /**
   * Life and sound, a few times a second: which small scenes are on, how much
   * the trees sway, and what the soundscape should be for what is on screen.
   * The hour is the player's own and is only seen. The season and the weekday
   * are the game's.
   */
  private showLife(state: GameState): void {
    const date = dateAt(state.clock);
    const weekend = this.weekendHeld || date.weekday === 0 || date.weekday === 6;
    const term = calendarAt(state.clock).phase !== 'summer';
    // The calendar and the sky, from the game: who is on campus, exam weeks, a home game, and the weather.
    const day = dayRead(state.clock);
    const home = homeGameNow(state);
    const sky = weatherAt(state.seed, state.clock);
    this.weather = this.weatherHeld ?? (sky === 'rain' ? 'rain' : sky === 'snow' ? 'snow' : 'clear');
    const reduced = effectsSetting() === 'reduced';
    const life = scenesFor({
      period: this.light.period,
      weekend,
      month: date.month,
      day: date.day,
      term,
      weather: this.weather,
      students: enrollment(state),
      reduced,
      presence: day.walkers,
      exams: day.kind === 'midterms' || day.kind === 'finals',
      gameDay: home !== null,
    });
    // Fans, the band and the tailgates wear the school's colour, softened so faces still read.
    const colour = SCHOOL_COLOURS.find((one) => one.id === state.football.colour)?.hex ?? 0xffffff;
    const tint = home ? softened(colour) : null;
    const storming = this.stormHeld || (state.football.bigWin > 0 && state.clock.tick - state.football.bigWin < STORM_TICKS);
    // Before the first stadium the team plays at a rented field in town (DESIGN.md 10.2): nobody walks to the bare
    // plot, and no game is heard from it. The tailgates in the car parks are the day's only sign on the map.
    const built = state.football.stadium.tier >= 1;
    this.walkers.setGameDay(built ? tint : null);
    this.walkers.setPresence(day.walkers);
    this.scenes.setGame(tint ?? (storming ? softened(colour) : null), storming);
    this.ambient.setWeather(this.weather, reduced);
    this.life = life;
    this.scenes.setLife(life);
    this.ambient.setLife(life.ripples, life.sprinklers);
    this.windows.show(life.windows, this.light.lamps);
    this.activity.setStudy(life.studyGroups);
    this.walkers.setWind(life.wind);
    sound.setFacts({
      walkersInView: this.walkers.onScreen,
      vehiclesInView: this.cars.inView,
      buskerInView: this.scenes.buskerSeen,
      // The crowd is heard from kickoff to the final whistle: fully with the stadium on screen, faintly from across campus.
      stadium: home && built && state.clock.tick >= home.kick ? (this.walkers.stadiumSeen ? 1 : 0.3) : 0,
      zoom: this.cameras.main.zoom / this.homeZoom,
      period: this.light.period,
      month: date.month,
      weather: this.weather,
      hidden: document.hidden,
    });
  }

  /** Dev pages: hold the sky at one kind of weather, whatever the game's own is. Rain empties the lawns and is heard. */
  setWeather(weather: Weather): void {
    this.weatherHeld = weather;
    this.nextLifeAt = 0;
  }

  /** Dev screenshots: fans on the field, as after a big home win. */
  holdStorm(): void {
    this.stormHeld = true;
    this.nextLifeAt = 0;
  }

  /** Trees move a little in the wind: more in fall, hardly at all in summer, and not at all with Reduce effects on. */
  private sway(time: number): void {
    const wind = this.life?.wind ?? 0;
    if (wind <= 0) {
      if (this.swaying) for (const tree of this.swayers.values()) tree.setRotation(0);
      this.swaying = false;
      return;
    }
    this.swaying = true;
    const view = this.cameras.main.worldView;
    const seconds = time / 1000;
    for (const [cell, tree] of this.swayers) {
      if (tree.x < view.x - 80 || tree.x > view.right + 80 || tree.y < view.y - 40 || tree.y > view.bottom + 160) continue;
      // A slow lean and a quicker shiver, each tree in its own time.
      tree.setRotation((Math.sin(seconds * 0.9 + cell * 0.71) * 0.026 + Math.sin(seconds * 2.3 + cell * 1.3) * 0.008) * wind);
    }
  }

  /** Show the crowd step in force on everything that draws people or cars. */
  private applyStep(step: number): void {
    this.scenes.setStep(step);
    this.walkers.setStep(step);
    this.cars.setStep(step);
    this.activity.setStep(step);
  }

  /**
   * The frame budget. Once a second: count the frames drawn, and let the
   * budget step the crowd down a level if they were short, or back up toward
   * the player's setting if they have been good for a while.
   */
  private watchFrames(time: number): void {
    this.frames += 1;
    if (this.framesSince === 0) this.framesSince = time;
    const span = time - this.framesSince;
    if (span < 1000) return;
    this.fps = (this.frames * 1000) / span;
    if (this.workFrames > 0) this.frameMs = this.workSum / this.workFrames;
    this.workSum = 0;
    this.workFrames = 0;
    this.frames = 0;
    this.framesSince = time;
    const ceiling = stepOf(crowdSetting());
    if (ceiling !== this.crowdCeiling) {
      this.crowdCeiling = ceiling;
      this.budget.setCeiling(ceiling);
      this.applyStep(this.budget.step);
      return;
    }
    const before = this.budget.step;
    // A tab in the background draws no frames at all. That is not a slow phone.
    // Nor is one that draws a frame or two a second: that is a tab the browser has put to sleep.
    if (!this.crowdHeld && span < 2500 && this.fps >= 5 && this.budget.second(this.fps) !== before) this.applyStep(this.budget.step);
  }

  /** Dev screenshots: show a weekend's visitors whatever the day of the game's week. */
  holdWeekend(): void {
    this.weekendHeld = true;
    this.walkers.setWeekend(true);
  }

  /**
   * Dev screenshots: someone on the map who is not a student, by role, nearest
   * the middle of the view first. null when nobody of that role is out.
   */
  personInView(role: string): PersonRef | null {
    const camera = this.cameras.main;
    const midX = camera.scrollX + camera.width / 2;
    const midY = camera.scrollY + camera.height / 2;
    const far = (at: { x: number; y: number }): number => Math.hypot(at.x - midX, at.y - midY);
    if (role === 'worker') {
      const out = [...this.crew.workersOut].sort((a, b) => far(a) - far(b))[0];
      return out ? { role: 'worker', n: out.n, at: out.yard, job: out.thing } : null;
    }
    if (role === 'driver') {
      const out = [...this.cars.driversOut].sort((a, b) => far(a) - far(b))[0];
      return out ? { role: 'driver', n: out.n } : null;
    }
    if (role === 'medic' || role === 'officer') {
      for (const incident of store.state.incidents.active) {
        if (incident.responder === null || (incident.kind === 'injury') !== (role === 'medic') || !this.responders.has(incident.id)) continue;
        return { role, n: 0, at: incident.responder, job: incident.id };
      }
      return null;
    }
    return this.walkers.peopleNear(midX, midY).find((person) => person.role === role) ?? null;
  }

  /**
   * Dev screenshots: the first student standing in an activity or a small
   * scene in a role ('court', 'line', 'seat', 'pickup' and so on), with the
   * view put on them. null when nobody is.
   */
  standerIn(role: string): Stander | null {
    const who = this.activity.firstIn(role) ?? this.scenes.firstIn(role);
    if (!who) return null;
    const camera = this.cameras.main;
    camera.setScroll(who.x - camera.width / 2, who.y - camera.height / 2 + (camera.height * 0.12) / camera.zoom);
    return who;
  }

  /** Dev screenshots: a class moves in now, with its parents and boxes. */
  moveInNow(count: number): void {
    this.pendingArrivals += count;
  }

  /** Dev screenshots: the cell of the first small scene of a kind, or null when none is on. */
  sceneSpot(kind: 'club' | 'pickup' | 'busker' | 'boxes' | 'picnic'): { x: number; y: number } | null {
    return this.scenes.where(kind);
  }

  /** Dev screenshots: put the middle of the view on a person who is out on the map. */
  lookAtPerson(ref: PersonRef): void {
    let at: { x: number; y: number } | null = this.walkers.spot(`p:${personKey(ref)}`);
    if (ref.role === 'worker') at = this.crew.workersOut.find((one) => one.yard === ref.at && one.n === ref.n) ?? null;
    else if (ref.role === 'driver') at = this.cars.driversOut.find((one) => one.n === ref.n) ?? null;
    else if ((ref.role === 'medic' || ref.role === 'officer') && ref.job !== undefined) at = this.responders.get(ref.job) ?? null;
    if (!at) return;
    const camera = this.cameras.main;
    camera.setScroll(at.x - camera.width / 2, at.y - camera.height / 2 + (camera.height * 0.12) / camera.zoom);
  }

  /** Dev screenshots: show the crowd the setting asks for, and stop stepping it down when frames are short. */
  holdCrowd(): void {
    this.crowdHeld = true;
    this.crowdCeiling = stepOf(crowdSetting());
    this.budget.setCeiling(this.crowdCeiling);
    this.applyStep(this.budget.step);
  }

  /** Frames a second, the crowd step in force, and who is on screen. For the dev readout and the report. */
  stats(): { fps: number; frameMs: number; step: number; ceiling: number; walkers: Walkers['counts']; vehicles: Cars['counts']; extras: number; caps: (typeof CROWD_STEPS)[number] } {
    return { fps: Math.round(this.fps * 10) / 10, frameMs: Math.round(this.frameMs * 100) / 100, step: this.budget.step, ceiling: this.crowdCeiling, walkers: this.walkers.counts, vehicles: this.cars.counts, extras: this.activity.count, caps: CROWD_STEPS[this.budget.step]! };
  }

  /** Keep one glow for each street lamp, and drop those whose lamp has gone. */
  private syncGlows(lampCells: readonly number[], width: number): void {
    const wanted = new Set(lampCells);
    for (const [cell, glow] of this.glows) {
      if (wanted.has(cell)) continue;
      glow.destroy();
      this.glows.delete(cell);
    }
    if (!this.art.has('lamp.glow')) return;
    for (const cell of lampCells) {
      if (this.glows.has(cell)) continue;
      const x = cell % width;
      const pos = this.iso.cellTop(x, (cell - x) / width);
      const glow = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(LIGHT_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
      this.art.apply(glow, 'lamp.glow');
      glow.setAlpha(this.light.lamps).setVisible(this.lampsLit);
      this.glows.set(cell, glow);
    }
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
    // The town is always fully built: every plot has its house, whoever is enrolled from it.
    const forSale = state.map.parcels.filter((parcel) => !parcel.owned);
    const hasLamps = this.art.has('lamp.off') && this.art.has('lamp.on');
    // Where the marked crossings are: the same reading of the roads the cars and the people use.
    const crossings = planTraffic(state.map.width, state.map.height, state.map.cells.map((one) => one.kind), TOWN_X);
    const lamp = this.lampsLit ? 'lamp.on' : 'lamp.off';
    const lampCells: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cell = cells[i]!;
        let groundKey = 'ground.grass';
        let tint = NO_TINT;
        let objectKey = '';
        let works = false;
        let kerbKey = '';

        if (cell.kind === 'path') {
          // The piece the turned grid joins up with (DESIGN.md section 43).
          groundKey = `path.${this.iso.mask(this.pathMask(state, x, y))}`;
          // A street lamp every few cells along a walk. A broken one stays dark until a worker fixes it.
          if (hasLamps && lampAt(state.map, x, y)) {
            const out = (state.grounds.lamps[i] ?? 0) > 0;
            objectKey = out ? 'lamp.off' : lamp;
            if (!out) lampCells.push(i);
          }
        } else if (cell.kind === 'road' || cell.kind === 'street') {
          // Beside a junction on the avenue the road is a marked crossing: where people from the town walk over.
          const mask = this.iso.mask(this.roadMask(state, x, y));
          groundKey = crossings.zebra[i] ? (mask & 5 ? 'road.cross.5' : 'road.cross.10') : `road.${mask}`;
          kerbKey = this.kerbKey(crossings, x, y);
          if (hasLamps && lampAt(state.map, x, y)) {
            const out = (state.grounds.lamps[i] ?? 0) > 0;
            objectKey = out ? 'lamp.off' : lamp;
            if (!out) lampCells.push(i);
          }
        } else if (cell.kind === 'crossing') {
          // The bars lie across the road, whichever way it runs.
          groundKey = this.iso.mask(this.roadMask(state, x, y)) & 5 ? 'road.cross.5' : 'road.cross.10';
          kerbKey = this.kerbKey(crossings, x, y);
        } else if (cell.kind === 'house') {
          objectKey = `town.house.${cell.variant}`;
        } else if (cell.kind === 'town') {
          // Between and behind the houses: driveways, gardens, the odd pool, lawn and trees.
          const look = townLook(state.map, x, y);
          if (look === 'tree') objectKey = this.variantKey('tree', cellHash(x, y));
          else if (look !== 'lawn' && this.art.has(`town.${look}`)) groundKey = `town.${look}`;
        } else if (cell.kind === 'empty' && forSale.some((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h)) {
          // A field the campus has not bought: dimmer, and still wild.
          tint = FOR_SALE_TINT;
          if (cellHash(x, y) % 6 === 0) objectKey = this.variantKey('tree', cellHash(y, x));
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
          // The tile kept is the one at the drawing's top corner as the view is turned: the drawing lies over it,
          // and any other would be drawn over the drawing (DESIGN.md section 43).
          const top = placed ? this.iso.viewBox(placed.x, placed.y, placed.w, placed.h) : null;
          const here = this.iso.viewCell(x, y);
          hidden = !!placed && PLACED[placed.type].flat && this.art.has(PLACED[placed.type].sprite) && !(top!.x === here.x && top!.y === here.y);
        }

        // A driveway or a garden bed runs one way: on a quarter turn it is mirrored to run along the turned grid.
        const groundFlip = this.iso.odd && (groundKey === 'town.driveway' || groundKey === 'town.garden');
        const signature = `${groundKey}|${tint}|${objectKey}|${works ? 1 : 0}|${hidden ? 1 : 0}|${groundFlip ? 1 : 0}|${kerbKey}`;
        const visual = this.visuals[i]!;
        if (visual.signature === signature) continue;
        visual.signature = signature;

        this.art.apply(visual.ground, groundKey);
        if (groundFlip) visual.ground.setOrigin(1 - visual.ground.originX, visual.ground.originY);
        visual.ground.setFlipX(groundFlip);
        visual.ground.setTint(tint);
        visual.ground.setVisible(!hidden);

        const pos = this.iso.cellTop(x, y);
        if (kerbKey) {
          if (!visual.kerb) visual.kerb = this.add.image(pos.x, pos.y, '__DEFAULT');
          this.art.apply(visual.kerb, kerbKey);
          visual.kerb.setVisible(true).setPosition(pos.x, pos.y).setDepth(this.iso.depth(x, y, 0.3));
        } else if (visual.kerb) {
          visual.kerb.setVisible(false);
        }
        if (objectKey) {
          if (!visual.object) {
            visual.object = this.add.image(pos.x, pos.y, '__DEFAULT');
          }
          this.art.apply(visual.object, objectKey);
          visual.object.setVisible(true).setPosition(pos.x, pos.y).setRotation(0).setDepth(this.iso.depth(x, y, 1));
          if (objectKey.startsWith('tree.') || objectKey === 'quad.tree') {
            // A tree turns about the foot of its trunk, so it can sway without its roots sliding. The foot is a spot on
            // the tree's own drawing, which faces the viewer at every turn.
            const root = this.iso.onDrawing({ x, y, w: 1, h: 1 }, 0.5, 0.56);
            const foot = this.iso.toWorld(root.x, root.y);
            const tree = visual.object;
            tree.setOrigin(tree.originX + (foot.x - pos.x) / tree.width, tree.originY + (foot.y - pos.y) / tree.height);
            tree.setPosition(foot.x, foot.y);
            this.swayers.set(i, tree);
          } else this.swayers.delete(i);
        } else if (visual.object) {
          visual.object.setVisible(false);
          this.swayers.delete(i);
        }

        if (works) {
          if (!visual.works) {
            visual.works = this.add.image(pos.x, pos.y, '__DEFAULT');
            this.art.apply(visual.works, 'lot.works');
          }
          visual.works.setVisible(true).setPosition(pos.x, pos.y).setDepth(this.iso.depth(x, y, 2));
        } else if (visual.works) {
          visual.works.setVisible(false);
        }
      }
    }
    this.syncGlows(lampCells, width);
  }

  // ------------------------------------------------------------- overlays --

  private fillCell(x: number, y: number, colour: number, alpha: number): void {
    this.overlay.fillStyle(colour, alpha);
    this.overlay.fillPoints(this.iso.diamond(x, y), true);
  }

  /**
   * A picture of the campus as it is drawn now, for photo mode (DESIGN.md 42.5). The engine hands over the frame
   * it has just drawn, so nothing that is not on the map is in it.
   */
  snapshot(): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      this.game.renderer.snapshot((image) => resolve(image as HTMLImageElement));
    });
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

  /**
   * The stadium plot, two cells by three. What stands on it follows the
   * tier: mown lawn while it is bare, the stadium of tiers one to three on
   * four of its cells with the practice lawn on the other two, and tiers four
   * and five on all six. While a tier is going up, a building site stands
   * where the new part will be.
   */
  private showStadium(state: GameState, placed: Placed, items: PlacedItem[]): void {
    const stadium = state.football.stadium;
    const tier = stadium.tier;
    const lawn = this.art.has('quad.lawn') ? 'quad.lawn' : null;
    const big = tier >= 4;
    // The lawn under whatever part of the plot the stadium does not cover.
    if (lawn && !big) {
      for (let y = tier === 0 ? placed.y : placed.y + 2; y < placed.y + placed.h; y++) {
        for (let x = placed.x; x < placed.x + placed.w; x++) items.push({ key: lawn, x, y, layer: 'ground', id: placed.id });
      }
    }
    const key = `stadium.${tier}`;
    if (tier >= 1 && this.art.has(key)) items.push({ key, x: placed.x, y: placed.y, w: 2, h: big ? 3 : 2, layer: 'object', id: placed.id });
    else if (tier === 0 && !lawn) items.push({ key: this.spriteFor('stadium').key, x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: 'object', id: placed.id });
    if (stadium.work && this.art.has('lot.site')) {
      // Work on the first stadium is on the plot's four near cells. A bigger one is being built where the lawn is.
      const row = tier === 0 ? placed.y : placed.y + 2;
      for (let x = placed.x; x < placed.x + placed.w; x++) items.push({ key: 'lot.site', x, y: row, layer: 'ground', forward: 0 });
    }
  }

  /**
   * A big build going up: the pack's own building site for its block, two by
   * two or two by one, and a site on every cell of anything larger.
   */
  private showSite(placed: Placed, items: PlacedItem[]): void {
    const block = placed.w === 2 && placed.h === 2 ? 'build.site' : placed.w * placed.h === 2 ? 'build.site.wide' : null;
    if (block && this.art.has(block)) {
      items.push({ key: block, x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: 'object', id: placed.id });
      return;
    }
    const cell = this.art.has('lot.site') ? 'lot.site' : null;
    if (!cell) return;
    for (let y = placed.y; y < placed.y + placed.h; y++) {
      for (let x = placed.x; x < placed.x + placed.w; x++) items.push({ key: cell, x, y, layer: 'ground', id: placed.id });
    }
  }

  /** Draw the hand-placed buildings in the game state, and the one being placed. */
  private showPlaced(state: GameState): void {
    const items: PlacedItem[] = [...this.devItems];
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const sprite = this.spriteFor(placed.type);
      let key = sprite.key;
      if (placed.type === 'bin') {
        // A bin shows how full it is: the can, then heaped, then with a bag beside it.
        const how = binState(state, placed.id);
        const shown = how === 'full' ? 'grounds.bin.over' : how === 'filling' ? 'grounds.bin.full' : 'grounds.bin';
        if (this.art.has(shown)) key = shown;
      }
      if (placed.type === 'stadium') {
        this.showStadium(state, placed, items);
        continue;
      }
      if (placed.type === 'decor') {
        // A decoration's drawing is its own (DESIGN.md 42.5). One being moved is shown faint where it still stands.
        const shown = decorSprite(state, placed.decor);
        if (!this.art.has(shown)) continue;
        const item: PlacedItem = { key: shown, x: placed.x, y: placed.y, w: 1, h: 1, layer: 'object', id: placed.id };
        if (placed.flip) item.flip = true;
        if (decorSpec(placed.decor)?.turns) item.turns = true;
        if (session.moving === placed.id) item.alpha = 0.35;
        items.push(item);
        continue;
      }
      // A chapter house is drawn as its chapter's own look among the houses (DESIGN.md 51).
      if (placed.type === 'chapterHouse') {
        const look = state.greek?.chapters.find((chapter) => chapter.house === placed.id)?.look ?? placed.id;
        const shown = this.variantKey('chapter', look);
        if (this.art.has(shown)) key = shown;
      }
      // A big build of an era going up (DESIGN.md 45) is a building site until it opens.
      if (placed.done !== undefined) {
        this.showSite(placed, items);
        continue;
      }
      items.push({ key, x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: sprite.flat ? 'ground' : 'object', id: placed.id });
      // A cone stands beside anything broken until a worker has fixed it.
      if (isBrokenThing(state, placed.id) && this.art.has('grounds.cone')) items.push({ key: 'grounds.cone', x: placed.x, y: placed.y, forward: 1 });
    }
    if (this.art.has('grounds.cone')) {
      for (const key of Object.keys(state.grounds.lamps)) {
        const cell = Number(key);
        items.push({ key: 'grounds.cone', x: cell % state.map.width, y: Math.floor(cell / state.map.width), forward: 1 });
      }
    }
    this.showLitter(state, items);
    // Cars stand on a surface lot that a road reaches, more of them the fuller it is.
    const spaces = townPlaces(state.map).spaces;
    const fill = spaces > 0 ? driversNow(state) / spaces : 0;
    for (const placed of state.map.placed) {
      if (!placed || placed.type !== 'parking' || !hasRoadAccess(state.map, placed)) continue;
      const parked = Math.min(PARKED_AT.length, Math.ceil(fill * PARKED_AT.length));
      for (let k = 0; k < parked; k++) {
        items.push({ key: `car.${(placed.id * 3 + k * 2) % 7}.ny`, x: placed.x + PARKED_AT[k]!, y: placed.y, forward: 2, on: { x: placed.x, y: placed.y, w: placed.w, h: placed.h } });
      }
    }
    // A car park no road reaches holds no cars. A lowered barrier floats over it until one does.
    for (const placed of this.unlinkedCarParks(state)) {
      items.push({ key: 'icon.noroad', x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: 'float', lift: placed.type === 'garage' ? BADGE_LIFT.tall : BADGE_LIFT.low });
    }
    // A campus the town cannot get into says so at its edge: a sign beside Lantern Avenue where a path,
    // or a road to parking, would let locals in. Worked out from the same access data the rules use.
    const hints = townHints(state);
    this.hintSpots.clear();
    for (const which of ['walk', 'drive'] as const) {
      const hint = hints[which];
      const key = which === 'walk' ? 'icon.walkin' : 'icon.drivein';
      if (!hint || !this.art.has(key)) continue;
      this.hintSpots.set(which, { x: hint.x, y: hint.y });
      items.push({ key, x: hint.x, y: hint.y, layer: 'float', lift: HINT_LIFT });
    }
    // An icon floats over every open incident.
    for (const incident of state.incidents.active) {
      const over = this.incidentPlace(state, incident);
      items.push({ key: incident.kind === 'injury' ? 'icon.injury' : 'icon.mischief', x: over.x, y: over.y, w: over.w, h: over.h, layer: 'float', lift: over.lift });
    }
    this.showCollect(state, items);
    this.showCraft(state, items);
    if (session.placing && session.ghost) {
      const spec = PLACED[session.placing];
      const sprite = this.spriteFor(session.placing);
      // Drawn in front of whatever it overlaps, so the player can always see where it would go.
      const ghost: PlacedItem = { key: sprite.key, x: session.ghost.x, y: session.ghost.y, w: spec.w, h: spec.h, layer: 'object', alpha: 0.7, forward: 1 };
      if (session.placing === 'decor' && session.decor) {
        ghost.key = decorSprite(state, session.decor);
        if (session.decorFlip) ghost.flip = true;
        if (decorSpec(session.decor)?.turns) ghost.turns = true;
      }
      if (this.art.has(ghost.key)) items.push(ghost);
    }
    // Photo mode shows the campus and nothing floating over it: no medal, no icon, no marker.
    this.placed.set(session.photo ? items.filter((item) => item.layer !== 'float') : items);
  }

  // ----------------------------------------------------------- collecting --

  /**
   * The daily layer (DESIGN.md 42.4): a medal floats over every building that
   * is ready to collect. What is ready is the simulation's, worked out from
   * time. A medal that has gone since the last look, on the same game and
   * with experience gained, was collected: it rises and fades, with the
   * experience it paid. That covers a tap here and the Collect all button
   * alike.
   */
  private showCollect(state: GameState, items: PlacedItem[]): void {
    const ready = new Map<string, CollectSpot>();
    if (this.art.has('icon.collect')) {
      for (const one of readyToCollect(state)) {
        // A dorm or a lecture hall is a storey or two. A building placed by hand is as tall as its kind.
        const placed = one.key.startsWith('p') ? state.map.placed[Number(one.key.slice(1))] : null;
        const lift = placed ? (PLACED[placed.type].flat ? 40 : 122) : 112;
        ready.set(one.key, { x: one.x, y: one.y, w: one.w, h: one.h, lift, xp: one.xp });
        items.push({ key: 'icon.collect', x: one.x, y: one.y, w: one.w, h: one.h, layer: 'float', lift });
      }
    }
    const game = `${state.seed}:${state.school.name}`;
    const xp = state.daily?.xp ?? 0;
    if (game === this.collectGame && xp > this.collectXp) {
      for (const [key, spot] of this.collectSpots) if (!ready.has(key)) this.burst(spot);
    }
    this.collectGame = game;
    this.collectXp = xp;
    this.collectSpots = ready;
  }

  /** The medal of a building just collected rises and fades, with the experience it paid. For show only. */
  private burst(spot: CollectSpot): void {
    const at = this.iso.toWorld(spot.x + spot.w / 2, spot.y + spot.h / 2);
    const medal = this.add.image(at.x, at.y - spot.lift, '__DEFAULT');
    this.art.apply(medal, 'icon.collect');
    medal.setOrigin(0.5, 1).setDepth(1_000_000);
    const label = this.add
      .text(at.x, at.y - spot.lift - medal.displayHeight - 4, `+${spot.xp}`, {
        fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#16201b',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setDepth(1_000_001);
    this.tweens.add({
      targets: [medal, label],
      y: '-=64',
      alpha: 0,
      duration: collectShow.burstMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        medal.destroy();
        label.destroy();
      },
    });
  }

  /** The key of the ready building whose medal is under a point of the world, or null. */
  private collectUnder(worldX: number, worldY: number): string | null {
    const reach = (26 * this.dpr) / this.cameras.main.zoom;
    for (const [key, spot] of this.collectSpots) {
      const at = this.iso.toWorld(spot.x + spot.w / 2, spot.y + spot.h / 2);
      // The medal stands on its lift and is about fifty tall: its middle is half of that higher.
      if (Math.abs(worldX - at.x) <= reach && Math.abs(worldY - (at.y - spot.lift - 25)) <= reach * 1.3) return key;
    }
    return null;
  }

  /**
   * The Workshop (DESIGN.md 42.6): a hammer floats over the Makerspace while a bench holds something finished.
   * A tap on it opens the Makerspace's panel, which has the way in.
   */
  private showCraft(state: GameState, items: PlacedItem[]): void {
    this.craftSpot = null;
    if (!this.art.has('icon.craft') || craftsReady(state) === 0) return;
    const shop = state.map.placed.find((placed) => placed && placed.type === 'makerspace');
    if (!shop) return;
    this.craftSpot = { x: shop.x, y: shop.y, w: shop.w, h: shop.h, lift: 122, xp: 0 };
    items.push({ key: 'icon.craft', x: shop.x, y: shop.y, w: shop.w, h: shop.h, layer: 'float', lift: 122 });
  }

  /** Collect what one building holds. The burst follows from the marker going. */
  private collect(key: string): void {
    const result = store.dispatch({ type: 'collect', key });
    if (result.ok) sound.ui('collect');
  }

  /** While placing: the footprint in green or red, and the reach in blue. */
  private ghostTints(): Array<{ cells: Point[]; colour: number; alpha: number }> {
    if (!session.placing || !session.ghost || !store.hasGame) return [];
    const preview = previewPlace(store.state, session.placing, session.ghost.x, session.ghost.y);
    // A decoration being moved may be set down where it already stands.
    if (session.moving !== null) {
      const from = store.state.map.placed[session.moving];
      if (from && from.x === session.ghost.x && from.y === session.ghost.y) preview.problem = null;
    }
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
  /**
   * Litter: small pieces on the paths around each place students eat, shop or
   * play, more of them the more is lying there, and the odd piece along paths
   * nobody sweeps. The amount is the simulation's; where each piece lies is
   * only for show.
   */
  private showLitter(state: GameState, items: PlacedItem[]): void {
    this.litterCells.clear();
    if (!this.art.has('litter.0')) return;
    const { width, height, cells } = state.map;
    for (const spot of state.map.placed) {
      if (!spot || !isMessSpot(spot)) continue;
      const lying = state.grounds.litter[spot.id] ?? 0;
      if (lying < 3) continue;
      const near: Array<{ x: number; y: number; order: number }> = [];
      for (let y = Math.max(0, spot.y - LITTER_NEAR); y <= Math.min(height - 1, spot.y + spot.h - 1 + LITTER_NEAR); y++) {
        for (let x = Math.max(0, spot.x - LITTER_NEAR); x <= Math.min(width - 1, spot.x + spot.w - 1 + LITTER_NEAR); x++) {
          const kind = cells[y * width + x]!.kind;
          // On the paths first. Where a place has no path beside it, on the grass around it.
          if (isWalk(kind) || kind === 'empty') near.push({ x, y, order: (isWalk(kind) ? 0 : 1_000_000_000) + (cellHash(x, y) % 1_000_000) });
        }
      }
      near.sort((a, b) => a.order - b.order);
      const shown = Math.min(near.length, Math.ceil((lying / LITTER_CEILING) * LITTER_SHOWN));
      for (const cell of near.slice(0, shown)) {
        const piece = cellHash(cell.y, cell.x) % 6;
        items.push({ key: `litter.${piece}`, x: cell.x, y: cell.y });
        // Where it is deep, a second piece lies on the same cell. Each piece has its own spot on the ground.
        if (lying > LITTER_CEILING * 0.45) items.push({ key: `litter.${(piece + 2) % 6}`, x: cell.x, y: cell.y });
        this.litterCells.set(cell.y * width + cell.x, spot.id);
      }
    }
    // The thin litter of paths nobody sweeps: a piece here and there.
    if (enrollment(state) === 0 || state.clock.tick < state.grounds.quietUntilTick) return;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (cells[i]!.kind !== 'path' || cellHash(x, y) % 23 !== 0 || this.litterCells.has(i)) continue;
        const yard = yardOver(state.map, x, y);
        if (yard && workersAt(state, yard.id) > 0) continue;
        items.push({ key: `litter.${cellHash(y, x) % 6}`, x, y });
      }
    }
  }

  /** Green is clean, yellow is getting messy, red is dirty or needs a worker. Blue is where a yard's workers reach. */
  private drawCleanOverlay(state: GameState): void {
    const { width, height, cells } = state.map;
    for (const yard of state.map.placed) {
      if (!yard || yard.type !== 'yard') continue;
      const reach = PLACED.yard.radius;
      const staffed = workersAt(state, yard.id) > 0;
      for (let y = Math.max(0, yard.y - reach); y <= Math.min(height - 1, yard.y + yard.h - 1 + reach); y++) {
        for (let x = Math.max(0, yard.x - reach); x <= Math.min(width - 1, yard.x + yard.w - 1 + reach); x++) this.fillCell(x, y, CLEAN_REACH, staffed ? 0.2 : 0.08);
      }
    }
    const colourOf = (clean: number): number => (clean >= 0.8 ? CLEAN_OK : clean >= 0.5 ? CLEAN_SOME : CLEAN_BAD);
    for (const placed of state.map.placed) {
      if (!placed) continue;
      let colour: number | null = null;
      if (isBrokenThing(state, placed.id)) colour = CLEAN_BAD;
      else if (placed.type === 'bin') colour = { empty: CLEAN_OK, filling: CLEAN_SOME, full: CLEAN_BAD, broken: CLEAN_BAD }[binState(state, placed.id)];
      else if (isMessSpot(placed)) {
        colour = colourOf(spotClean(state, placed));
        // The paths around it take its colour too.
        for (let y = Math.max(0, placed.y - LITTER_NEAR); y <= Math.min(height - 1, placed.y + placed.h - 1 + LITTER_NEAR); y++) {
          for (let x = Math.max(0, placed.x - LITTER_NEAR); x <= Math.min(width - 1, placed.x + placed.w - 1 + LITTER_NEAR); x++) {
            if (isWalk(cells[y * width + x]!.kind)) this.fillCell(x, y, colour, 0.45);
          }
        }
      }
      if (colour === null) continue;
      for (let cy = placed.y; cy < placed.y + placed.h; cy++) for (let cx = placed.x; cx < placed.x + placed.w; cx++) this.fillCell(cx, cy, colour, 0.6);
    }
    for (const key of Object.keys(state.grounds.lamps)) {
      const cell = Number(key);
      this.fillCell(cell % width, Math.floor(cell / width), CLEAN_BAD, 0.6);
    }
  }

  /** Car parks that hold no cars because no road joins them to a street. */
  private unlinkedCarParks(state: GameState): Array<NonNullable<GameState['map']['placed'][number]>> {
    const out: Array<NonNullable<GameState['map']['placed'][number]>> = [];
    for (const placed of state.map.placed) {
      if (placed && placedCars(placed.type, 1) > 0 && !hasRoadAccess(state.map, placed)) out.push(placed);
    }
    return out;
  }

  /**
   * True while the Parking overlay should show: when the player asked for it,
   * while a road is being laid or a car park placed, and while a car park is
   * selected. Those are the moments it answers a question.
   */
  private parkingOverlayOn(state: GameState): boolean {
    if (session.overlay === 'parking' || session.tool === 'road') return true;
    if (session.placing && placedCars(session.placing, 1) > 0) return true;
    const selected = session.selected;
    const id = selected ? (state.map.cells[selected.y * state.map.width + selected.x]?.placedId ?? null) : null;
    const placed = id === null ? null : state.map.placed[id];
    return !!placed && placedCars(placed.type, 1) > 0;
  }

  /** Green where cars can get to, red where they cannot, and the avenue every road has to reach in blue. */
  private drawParkingOverlay(state: GameState): void {
    for (let y = 0; y < state.map.height; y++) this.fillCell(TOWN_X, y, PARKING_AVENUE, 0.3);
    const roads = roadsByAccess(state.map);
    for (const [x, y] of roads.linked) this.fillCell(x, y, PARKING_OK, 0.38);
    for (const [x, y] of roads.cut) this.fillCell(x, y, PARKING_CUT, 0.5);
    for (const placed of state.map.placed) {
      if (!placed || placedCars(placed.type, 1) <= 0) continue;
      const linked = hasRoadAccess(state.map, placed);
      for (let cy = placed.y; cy < placed.y + placed.h; cy++) {
        for (let cx = placed.x; cx < placed.x + placed.w; cx++) this.fillCell(cx, cy, linked ? PARKING_OK : PARKING_CUT, linked ? 0.5 : 0.62);
      }
    }
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    if (store.hasGame && session.overlay === 'clean') this.drawCleanOverlay(store.state);
    else if (store.hasGame && this.parkingOverlayOn(store.state)) this.drawParkingOverlay(store.state);
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
    const pos = this.iso.cellTop(building.x, building.y);
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
      const total = stageSpec(building.zone, building.rebuild.toStage, 1).buildTicks * TICK_MS;
      const remaining = this.realTimeOfTick(state, building.rebuild.doneTick) - now;
      const done = Phaser.Math.Clamp(1 - remaining / total, 0, 1);
      const pos = this.iso.cellTop(building.x, building.y);
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
        const way = this.iso.dir(toX - fromX, toY - fromY);
        const direction = facingOf(way.x, way.y);
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
        sprite.setPosition(at.x, at.y).setDepth((this.iso.sum(x, y) - 1) * 4 + 2.6);
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
      this.glideAim = focus.aim ?? 0.4;
    }
    this.ringHall();

    const student = session.student;
    const key = student ? studentKey(student) : null;
    const walking = key ? this.walkers.doing(key) : null;
    // Not out walking: they may be standing in a game, a line or a small scene, which the card says in its own words.
    const there = key && !walking ? (this.activity.find(key) ?? this.scenes.find(key)) : null;
    session.setDoing(walking ?? (there ? `${STAYING}${there.words}` : null), there?.look ?? null);
    // A ring on the ground under them, as under a walker whose card is open.
    if (there) {
      const ring = this.stayRing ?? this.add.ellipse(0, 0, 10, 10).setStrokeStyle(3, 0xffd24a, 1);
      this.stayRing = ring;
      ring.setSize(this.iso.halfWidth * 0.62, this.iso.halfHeight * 0.62);
      ring.setPosition(there.x, there.y).setDepth(there.depth - 0.2).setVisible(true);
    } else this.stayRing?.setVisible(false);
    const at = key && session.following ? this.walkers.spot(key) : null;
    // They went indoors: there is nobody left to follow.
    if (session.following && !at) session.setFollowing(false);

    const target = at ?? this.glide;
    if (!target) return;
    // The card covers the bottom of the screen, so aim a little above the middle, or higher when a card asks. With the
    // card put away to its strip (DESIGN.md 61), the student is kept nearer the middle of the open map.
    const aim = at ? (session.tucked ? 0.52 : 0.4) : this.glideAim;
    const wantX = target.x - cam.width / 2;
    const wantY = target.y - cam.height / 2 + (cam.height * (0.5 - aim)) / cam.zoom;
    const fromX = cam.scrollX;
    const fromY = cam.scrollY;
    cam.setScroll(fromX + (wantX - fromX) * ease, fromY + (wantY - fromY) * ease);
    this.clampCamera();
    // A glide ends when it arrives, or when the edge of the map stops it.
    if (!at && Math.abs(cam.scrollX - fromX) + Math.abs(cam.scrollY - fromY) < 0.3) this.glide = null;
  }

  /** A ring round the hall named on a card, pulsing three times over a few seconds, then gone (DESIGN.md 60). */
  private ringHall(): void {
    const mark = session.mark;
    if (mark && mark.seq !== this.hallRingSeq) {
      this.hallRingSeq = mark.seq;
      this.hallRingAt = { x: mark.x, y: mark.y, since: this.time.now };
    }
    const ring = this.hallRingAt;
    if (!ring) return;
    const age = (this.time.now - ring.since) / 1000;
    const g = this.hallRing ?? this.add.graphics().setDepth(900_000);
    this.hallRing = g;
    g.clear();
    if (age > 3) {
      this.hallRingAt = null;
      return;
    }
    const pulse = 0.55 + 0.45 * Math.cos(age * Math.PI * 2);
    g.lineStyle(5, 0xffd24a, pulse * Math.min(1, (3 - age) * 2));
    g.strokePoints(this.iso.diamond(ring.x, ring.y), true);
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
    this.homeZoom = cam.zoom;
    // The view opens on the campus's own land, not on the middle of the whole map.
    const centre = this.iso.toWorld(START_LAND.x + START_LAND.w / 2, START_LAND.y + START_LAND.h / 2);
    cam.setScroll(centre.x - cam.width / 2, centre.y - cam.height / 2);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.main.setSize(size.width, size.height);
    if (this.visuals.length > 0) this.clampCamera();
  }

  // ---------------------------------------------------------------- input --

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.touches.set(pointer.id, { x: pointer.x, y: pointer.y });
    // A finger down while the map spins or settles: it settles at once, so the new gesture starts on the view drawn.
    if (this.spin) this.finishSpin();
    this.spinAsked = false;
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

  /** The middle of the screen, in the world. */
  private screenMiddle(): { x: number; y: number } {
    const cam = this.cameras.main;
    return { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
  }

  /**
   * Begin the turntable spin (DESIGN.md 43.6). The flat ground (tiles, roads,
   * sidewalks, pads, water, flat buildings) is drawn once into a picture big
   * enough to cover the screen at any angle, and shown through the turntable:
   * squashed, turned and unsquashed, by three containers. Every upright drawing
   * stays as it is and is moved with the ground under it. Everything else
   * (people, moving cars, lights, markers) is put away until the end.
   */
  private startSpin(): void {
    const cam = this.cameras.main;
    const squash = this.iso.halfHeight / this.iso.halfWidth;
    const size = stillSize(cam.width, cam.height, squash);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const most = Math.min(SPIN_STILL_MAX, typeof renderer.getMaxTextureSize === 'function' ? renderer.getMaxTextureSize() : 4096);
    const scale = Math.min(1, most / Math.max(size.width, size.height));
    this.spinCount += 1;
    const textureKey = `spin-ground-${this.spinCount}`;
    const texture = this.textures.addDynamicTexture(textureKey, Math.ceil(size.width * scale), Math.ceil(size.height * scale));
    if (!texture) return;
    const middle = this.screenMiddle();
    texture.camera.setZoom(cam.zoom * scale);
    texture.camera.centerOn(middle.x, middle.y);
    // Everything that lies flat, in the order it is drawn.
    const flat: Phaser.GameObjects.Image[] = [];
    for (const visual of this.visuals) {
      if (visual.ground.visible) flat.push(visual.ground);
      if (visual.kerb?.visible) flat.push(visual.kerb);
    }
    for (const part of this.placed.spinParts()) if (part.flat && part.sprite.visible) flat.push(part.sprite);
    flat.sort((a, b) => a.depth - b.depth);
    texture.draw(flat);

    const image = this.add.image(0, 0, textureKey).setScale(1 / (cam.zoom * scale));
    const unsquash = this.add.container(0, 0, [image]).setScale(1, 1 / squash);
    const turner = this.add.container(0, 0, [unsquash]);
    const still = this.add.container(middle.x, middle.y, [turner]).setScale(1, squash).setDepth(SPIN_STILL_DEPTH);
    this.spin = { shown: 0, quarter: 0, settle: null, still, turner, textureKey, parts: [], hidden: [], ground: [], kerb: [] };
    this.takeUpSpin(true);
  }

  /** The upright drawings to move, as the view is drawn now, and everything else put away. */
  private takeUpSpin(first: boolean): void {
    const spin = this.spin;
    if (!spin) return;
    const parts: SpinPart[] = [];
    const keep = (object: Phaser.GameObjects.Image, ground: { x: number; y: number }, corners: SpinPart['corners'], bias = 0): void => {
      parts.push({ object, base: { x: object.x, y: object.y }, depth: object.depth, ground, corners, bias });
    };
    const iso = this.iso;
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const visual = this.visuals[y * this.mapWidth + x]!;
        const upright = [visual.object, visual.works].filter((one): one is Phaser.GameObjects.Image => !!one && one.visible);
        if (upright.length === 0) continue;
        const ground = iso.toWorld(x + 0.5, y + 0.5);
        const corners = [iso.toWorld(x, y), iso.toWorld(x + 1, y), iso.toWorld(x, y + 1), iso.toWorld(x + 1, y + 1)];
        for (const one of upright) keep(one, ground, corners);
      }
    }
    for (const part of this.placed.spinParts()) if (!part.flat && part.sprite.visible) keep(part.sprite, part.ground, part.corners, part.bias);
    for (const part of this.cars.spinParts()) if (part.sprite.visible) keep(part.sprite, part.ground, [part.ground]);
    spin.parts = parts;

    // The ground as the view draws it now, shown again at the end; the picture stands in for it until then.
    if (first) {
      spin.ground = this.visuals.map((visual) => visual.ground.visible);
      spin.kerb = this.visuals.map((visual) => visual.kerb?.visible === true);
      for (const visual of this.visuals) {
        visual.ground.setVisible(false);
        visual.kerb?.setVisible(false);
      }
    }
    const moving = new Set<Phaser.GameObjects.GameObject>(parts.map((part) => part.object));
    for (const child of this.children.list) {
      if (child === spin.still || child === this.lightLayer || moving.has(child)) continue;
      const shown = child as Shown;
      if (!shown.visible) continue;
      shown.setVisible(false);
      spin.hidden.push(shown);
    }
  }

  /** The spin follows the fingers, or settles. */
  private stepSpin(time: number, delta: number): void {
    const spin = this.spin;
    if (!spin) return;
    if (spin.settle) {
      const t = (time - spin.settle.at) / SETTLE_MS;
      if (spin.settle.done) {
        // The quarter has been on the screen for a frame. Laying the view again takes a moment on a slow phone, so it
        // is done while nothing moves.
        this.endSpin();
        return;
      }
      spin.shown = settling(spin.settle.from, spin.settle.to, t);
      this.showSpin();
      if (t >= 1) spin.settle.done = true;
      return;
    }
    spin.shown += (this.twistWanted - spin.shown) * (1 - Math.exp(-delta / TWIST_FOLLOW_MS));
    this.showSpin();
  }

  /**
   * Show the spin at its angle. Past each 45-degree mark the view is drawn a
   * quarter further round, so every drawing shows the side of the nearest
   * quarter; the rest of the angle swings the ground and moves the drawings.
   */
  private showSpin(): void {
    const spin = this.spin;
    if (!spin) return;
    const quarter = quarterFor(spin.shown, spin.quarter);
    if (quarter !== spin.quarter) {
      const began = performance.now();
      // The drawings go back where their owners put them, and are laid again a quarter further round.
      for (const part of spin.parts) part.object.setPosition(part.base.x, part.base.y).setDepth(part.depth);
      this.spinTurn(nextTurn(this.iso.turn, quarter - spin.quarter));
      spin.quarter = quarter;
      this.takeUpSpin(false);
      this.spinRedrawMs = performance.now() - began;
    }
    const middle = this.screenMiddle();
    const squash = this.iso.halfHeight / this.iso.halfWidth;
    const m = turntable(spin.shown - spin.quarter * 90, squash);
    spin.still.setPosition(middle.x, middle.y);
    spin.turner.setRotation(Phaser.Math.DegToRad(spin.shown));
    for (const part of spin.parts) {
      const to = spinAbout(part.ground, middle, m);
      part.object.setPosition(part.base.x + to.x - part.ground.x, part.base.y + to.y - part.ground.y);
      if (!part.corners) continue;
      let front = -Infinity;
      for (const corner of part.corners) front = Math.max(front, spinAbout(corner, middle, m).y);
      // In front by its ground's front corner, and within one spot in the order its owner gave it.
      const layer = (((part.depth % 4) + 4) % 4) * 0.01;
      part.object.setDepth(SPIN_DEPTH + front + part.bias + layer);
    }
  }

  /**
   * In the middle of a spin, the view a quarter further round: only what stands
   * up is laid again, quickly. The ground under the picture is laid again once,
   * when the spin ends. A drawing of one cell keeps its spot within its cell at
   * every turn, as it faces the viewer, so it moves with its cell.
   */
  private spinTurn(turn: Turn): void {
    const cam = this.cameras.main;
    const middle = this.iso.toMap(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    const moved: Array<{ object: Phaser.GameObjects.Image; x: number; y: number; dx: number; dy: number; layer: number }> = [];
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const visual = this.visuals[y * this.mapWidth + x]!;
        for (const one of [visual.object, visual.works]) {
          if (!one?.visible) continue;
          const top = this.iso.cellTop(x, y);
          moved.push({ object: one, x, y, dx: one.x - top.x, dy: one.y - top.y, layer: one.depth - this.iso.depth(x, y, 0) });
        }
      }
    }
    this.iso.setTurn(turn);
    for (const one of moved) {
      const top = this.iso.cellTop(one.x, one.y);
      one.object.setPosition(top.x + one.dx, top.y + one.dy).setDepth(this.iso.depth(one.x, one.y, 0) + one.layer);
    }
    const at = this.iso.toWorld(middle.x, middle.y);
    cam.setScroll(at.x - cam.width / 2, at.y - cam.height / 2);
    // Buildings placed by hand are mirrored or not as the turned view has them. The phone is told the way the view
    // faces when the spin ends: telling it redraws the screen's panels, which a spin has no time for.
    this.showPlaced(store.state);
    this.cars.relay(this.light.period);
  }

  /** The spin is over at a quarter: the view drawn turned takes over, and everything comes back. */
  private endSpin(): void {
    const spin = this.spin;
    if (!spin) return;
    this.spin = null;
    this.twistWanted = 0;
    for (const part of spin.parts) part.object.setPosition(part.base.x, part.base.y).setDepth(part.depth);
    spin.still.destroy(true);
    this.textures.remove(spin.textureKey);
    for (const shown of spin.hidden) if (shown.scene) shown.setVisible(true);
    session.setTurn(this.iso.turn);
    if (spin.quarter !== 0) {
      // Turned: the ground and everything on it are laid again for the view as it now faces, in this frame, as a
      // turn always was (43.1). The ground tiles show again as they are laid.
      this.applyTurn(this.iso.turn);
    } else {
      this.visuals.forEach((visual, n) => {
        visual.ground.setVisible(spin.ground[n] === true);
        visual.kerb?.setVisible(spin.kerb[n] === true);
      });
      this.clampCamera();
    }
    // The light of the hour back on its lamps.
    this.nextLightAt = 0;
  }

  /** Settle a spin at once, at the quarter it was going to. */
  private finishSpin(): void {
    const spin = this.spin;
    if (!spin) return;
    spin.shown = spin.settle ? spin.settle.to : Math.round(spin.shown / 90) * 90;
    this.showSpin();
    this.endSpin();
  }

  private startPinch(): Gesture | null {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return null;
    const cam = this.cameras.main;
    return {
      kind: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      twist: twistStart(a, b),
      from: { zoom: cam.zoom, scrollX: cam.scrollX, scrollY: cam.scrollY },
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
      const [a, b] = [...this.touches.values()];
      const was = this.gesture.twist.mode;
      const twist = a && b ? twistMove(this.gesture.twist, a, b) : this.gesture.twist;
      if (twist.mode === 'twist') {
        // A twist never zooms: the map goes back to where the fingers found it, and spins with them the whole way
        // until they lift and it settles to the nearest quarter (DESIGN.md 43.6).
        if (was !== 'twist') {
          cam.setZoom(this.gesture.from.zoom);
          cam.setScroll(this.gesture.from.scrollX, this.gesture.from.scrollY);
          if (!this.spin) this.spinAsked = true;
        }
        this.twistWanted = twist.turned;
        this.gesture = { ...next, twist, from: this.gesture.from };
        return;
      }
      cam.setScroll(
        cam.scrollX - (next.midX - this.gesture.midX) / cam.zoom,
        cam.scrollY - (next.midY - this.gesture.midY) / cam.zoom,
      );
      if (this.gesture.distance > 0) {
        this.zoomAt(next.midX, next.midY, cam.zoom * (next.distance / this.gesture.distance));
      }
      this.gesture = { ...next, twist, from: this.gesture.from };
      return;
    }

    if (this.gesture.kind === 'pan') {
      // The map holds still under a spin that is settling.
      if (this.spin) return;
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
      // A twist settles to the nearest quarter when its fingers lift, and the view is drawn turned that far.
      if (gesture.twist.mode === 'twist') {
        const to = settleDegrees(gesture.twist);
        if (this.spin) this.spin.settle = { from: this.spin.shown, to, at: this.game.loop.time };
        else if (this.spinAsked) this.spinSettleTo = to;
      }
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
        const { x, y } = this.iso.step(gx, gy, dx, dy);
        if (!this.inMap(x, y)) continue;
        if (store.state.map.cells[y * this.mapWidth + x]?.kind !== 'lot') continue;
        const object = this.visuals[y * this.mapWidth + x]?.object;
        if (object?.visible && object.getBounds().contains(world.x, world.y)) return [x, y];
      }
    }
    return null;
  }

  /** Keep each edge marker's sentence beside its sign, the same size on screen at any zoom. */
  private showHintTexts(): void {
    const camera = this.cameras.main;
    for (const which of ['walk', 'drive'] as const) {
      const spot = this.hintSpots.get(which);
      let text = this.hintTexts.get(which);
      if (!spot) {
        text?.setVisible(false);
        continue;
      }
      if (!text) {
        text = this.add
          .text(0, 0, HINT_TEXT[which], {
            fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#16201b',
            strokeThickness: 7,
            align: 'center',
          })
          .setOrigin(0.5, 1)
          .setDepth(1_000_002);
        this.hintTexts.set(which, text);
      }
      const at = this.iso.toWorld(spot.x + 0.5, spot.y + 0.5);
      // About 13 px tall on screen at any zoom, above the sign.
      text.setScale(0.5 / this.scale.zoom / camera.zoom);
      text.setPosition(at.x, at.y - (HINT_LIFT + 96)).setVisible(true);
    }
  }

  /** A broken street lamp under the finger: on its post, or on the cell it stands on. */
  private brokenLampAt(worldX: number, worldY: number, screenX: number, screenY: number): [number, number] | null {
    const state = store.state;
    const [gx, gy] = this.cellAt(screenX, screenY);
    const pad = (8 * this.dpr) / this.cameras.main.zoom;
    for (const key of Object.keys(state.grounds.lamps)) {
      const cell = Number(key);
      const x = cell % this.mapWidth;
      const y = (cell - x) / this.mapWidth;
      if (!isBrokenLamp(state, x, y)) continue;
      if (x === gx && y === gy) return [x, y];
      const post = this.visuals[cell]?.object;
      if (!post?.visible) continue;
      const box = post.getBounds();
      if (worldX >= box.x - pad && worldX <= box.right + pad && worldY >= box.y - pad && worldY <= box.bottom + pad) return [x, y];
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
    // A medal over a building that is ready: a tap on it collects.
    const medal = this.collectUnder(world.x, world.y);
    if (medal) {
      this.collect(medal);
      return;
    }
    // The hammer over the Makerspace: the Workshop has finished something.
    if (this.craftSpot) {
      const spot = this.craftSpot;
      const at = this.iso.toWorld(spot.x + spot.w / 2, spot.y + spot.h / 2);
      const near = (26 * this.dpr) / this.cameras.main.zoom;
      if (Math.abs(world.x - at.x) <= near && Math.abs(world.y - (at.y - spot.lift - 20)) <= near * 1.3) {
        session.closeStudent();
        session.select(spot.x, spot.y);
        return;
      }
    }
    // An incident's icon says what happened and whether anyone is coming.
    const reach = (26 * this.dpr) / this.cameras.main.zoom;
    for (const incident of store.state.incidents.active) {
      const spot = this.incidentSpot(incident);
      if (Math.abs(world.x - spot.x) > reach || Math.abs(world.y - (spot.y - reach * 0.6)) > reach * 1.4) continue;
      session.notify(`${incidentText(incident)} ${incident.responder === null ? 'Nobody is coming.' : 'Help is on the way.'}`);
      return;
    }
    // The barrier over a car park with no road: tapping it opens that car park's panel.
    for (const placed of this.unlinkedCarParks(store.state)) {
      const at = this.iso.toWorld(placed.x + placed.w / 2, placed.y + placed.h / 2);
      const lift = placed.type === 'garage' ? BADGE_LIFT.tall : BADGE_LIFT.low;
      if (Math.abs(world.x - at.x) > reach * 1.5 || Math.abs(world.y - (at.y - lift - reach * 0.4)) > reach * 1.3) continue;
      session.closeStudent();
      session.select(placed.x, placed.y);
      return;
    }
    // An edge marker: tapping it puts the right tool in hand, where it is needed.
    for (const [which, spot] of this.hintSpots) {
      const at = this.iso.toWorld(spot.x + 0.5, spot.y + 0.5);
      if (Math.abs(world.x - at.x) > reach * 2.2 || world.y > at.y + reach * 0.6 || world.y < at.y - (HINT_LIFT + 150)) continue;
      session.closeStudent();
      if (which === 'walk') session.setTool('path');
      else session.startPlacing('parking');
      session.lookAt(spot.x, spot.y);
      return;
    }
    // A person is in front of whatever they are standing on or walking past: a tap near one is a tap on them, not
    // on the court or the lawn behind. The nearest wins, whoever draws them.
    const thumb = (14 * this.dpr) / this.cameras.main.zoom;
    const walker = this.walkers.walkerAt(world.x, world.y, thumb);
    const figure = this.activity.figureAt(world.x, world.y, thumb);
    const actor = this.scenes.actorAt(world.x, world.y, thumb);
    const stander = figure && actor ? (figure.far <= actor.far ? figure : actor) : (figure ?? actor);
    if (stander && (!walker || stander.far < walker.far)) {
      // Someone in a game, a line, at a table or in a small scene is a student, with the ordinary card.
      if (stander.student) session.openStudent(stander.student, stander.look);
      else session.notify('Staff. Students arrive with the first class.');
      return;
    }
    if (walker) {
      if (walker.student) session.openStudent(walker.student);
      else if (walker.person) session.openPerson(walker.person);
      else if (walker.neighbour) session.notify('A neighbour from the town. Townspeople are not students.');
      else session.notify('Staff. Students arrive with the first class.');
      return;
    }
    // The people already at work on the map have cards too: a maintenance worker, a responder on a call, a driver.
    const near = (14 * this.dpr) / this.cameras.main.zoom;
    const worker = this.crew.workerAt(world.x, world.y, near);
    if (worker) {
      session.openPerson({ role: 'worker', n: worker.n, at: worker.yard, job: worker.thing });
      return;
    }
    for (const [id, sprite] of this.responders) {
      const box = sprite.getBounds();
      if (world.x < box.x - near || world.x > box.right + near || world.y < box.y - near || world.y > box.bottom + near) continue;
      const incident = store.state.incidents.active.find((one) => one.id === id);
      if (!incident || incident.responder === null) continue;
      session.openPerson({ role: incident.kind === 'injury' ? 'medic' : 'officer', n: 0, at: incident.responder, job: incident.id });
      return;
    }
    const driver = this.cars.driverAt(world.x, world.y, near);
    if (driver !== null) {
      session.openPerson({ role: 'driver', n: driver });
      return;
    }
    session.closeStudent();
    // A broken street lamp says what broke it and when it will be fixed.
    const lamp = this.brokenLampAt(world.x, world.y, screenX, screenY);
    if (lamp) {
      session.select(lamp[0], lamp[1]);
      return;
    }
    const building = this.placed.hit(world.x, world.y);
    if (building) {
      // A tap on a building that is ready collects it. The next tap opens its panel.
      if (building.id !== undefined && this.collectSpots.has(`p${building.id}`)) this.collect(`p${building.id}`);
      else session.select(building.x, building.y);
      return;
    }
    const [x, y] = this.buildingUnder(screenX, screenY) ?? this.cellAt(screenX, screenY);
    if (!this.inMap(x, y)) {
      session.clearSelection();
      return;
    }
    const cell = store.state.map.cells[y * this.mapWidth + x]!;
    const map = store.state.map;
    // Litter on the ground belongs to a place. Tapping it opens that place, which says what would fix it.
    const messy = this.litterCells.get(y * this.mapWidth + x);
    const from = messy === undefined ? null : map.placed[messy];
    if (from && cell.kind !== 'lot' && cell.kind !== 'placed') {
      session.select(from.x, from.y);
      return;
    }
    // A dorm or a lecture hall that has just opened: the first tap takes its opening bonus.
    if (cell.buildingId !== null && this.collectSpots.has(`b${cell.buildingId}`)) {
      this.collect(`b${cell.buildingId}`);
      return;
    }
    const forSale = parcelAt(map, x, y)?.owned === false;
    // A lot or building shows its panel. So does a field for sale, and a street of the town.
    if (cell.kind === 'lot' || cell.kind === 'placed' || forSale || hoodAt(map, x, y)) session.select(x, y);
    else session.clearSelection();
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!store.hasGame || this.spin) return;
    const cam = this.cameras.main;
    this.zoomAt(pointer.x, pointer.y, dy > 0 ? cam.zoom / WHEEL_STEP : cam.zoom * WHEEL_STEP);
  }
}
