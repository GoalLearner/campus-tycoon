import Phaser from 'phaser';
import { clock } from '../app/clock';
import { CROWD_STEPS, crowdSetting, FrameBudget, stepOf } from '../app/crowd';
import { effectsSetting, scenesFor, type Scenes as LifeScenes, type Weather } from '../app/life';
import { sound } from '../app/sound';
import { currentDaylight, type Daylight } from '../app/daylight';
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
  personKey,
  studentKey,
  type PersonRef,
  PLACED,
  previewPlace,
  reachCells,
  incidentText,
  hoodAt,
  parcelAt,
  driversNow,
  hasRoadAccess,
  isPathKind,
  isRoadKind,
  roadsByAccess,
  binState,
  enrollment,
  isBrokenThing,
  isMessSpot,
  isPathKind as isWalk,
  isBrokenLamp,
  lampAt,
  LITTER_CEILING,
  spotClean,
  workersAt,
  yardOver,
  START_LAND,
  TOWN_X,
  calendarAt,
  dateAt,
  townHints,
  townLiving,
  townPlaces,
  type Incident,
} from '../sim';
import { Activity } from './Activity';
import { Ambient } from './Ambient';
import { Scenes } from './Scenes';
import { Windows } from './Windows';
import { Art, MANIFEST_KEY, type ArtManifest } from './art';
import { Cars } from './Cars';
import { GroundsWorkers } from './GroundsWorkers';
import { Iso } from './iso';
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
/** Where cars park on a surface lot, as steps along it from its top corner. */
const PARKED_AT = [0.02, 0.5, 1.0] as const;

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
  private cars!: Cars;
  private crew!: GroundsWorkers;
  private activity!: Activity;
  /** Small scenes that come and go: club tables, pickup games, a busker, the boxes of move-in day. */
  private scenes!: Scenes;
  /** Ripples and sprinklers. */
  private ambient!: Ambient;
  /** Lit windows on dorms and lecture halls after dark. */
  private windows!: Windows;
  /** Trees that sway, by cell. */
  private swayers = new Map<number, Phaser.GameObjects.Image>();
  /** What the rule for small scenes asks for now, and when it is next read. */
  private life: LifeScenes | null = null;
  private nextLifeAt = 0;
  /** The sky. Clear until the calendar layer brings weather: everything here already answers to it. */
  private weather: Weather = 'clear';
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
    this.cars = new Cars(this, this.art, this.iso);
    this.crew = new GroundsWorkers(this, this.art, this.iso);
    this.activity = new Activity(this, this.art, this.iso);
    this.scenes = new Scenes(this, this.art, this.iso);
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
      // The ring goes under whoever's card is open: a student, or anyone else out walking.
      this.walkers.setMarked(session.student ? studentKey(session.student) : session.person ? `p:${personKey(session.person)}` : null);
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
    }
    this.visuals = [];
    this.gameId = '';
    this.walkers.clear();
    this.cars.clear();
    this.crew.clear();
    this.activity.clear();
    this.scenes.clear();
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
      cx >= 0 && cy >= 0 && cx < width && cy < height && isPathKind(cells[cy * width + cx]!.kind);
    return (
      (isPath(x, y - 1) ? 1 : 0) | (isPath(x + 1, y) ? 2 : 0) | (isPath(x, y + 1) ? 4 : 0) | (isPath(x - 1, y) ? 8 : 0)
    );
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
    const life = scenesFor({ period: this.light.period, weekend, month: date.month, day: date.day, term, weather: this.weather, students: enrollment(state), reduced: effectsSetting() === 'reduced' });
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
      zoom: this.cameras.main.zoom / this.homeZoom,
      period: this.light.period,
      month: date.month,
      weather: this.weather,
      hidden: document.hidden,
    });
  }

  /** Dev pages and the calendar layer: set the sky. Rain empties the lawns and is heard. */
  setWeather(weather: Weather): void {
    this.weather = weather;
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
      const pos = this.iso.toWorld(x, (cell - x) / width);
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

        if (cell.kind === 'path') {
          groundKey = `path.${this.pathMask(state, x, y)}`;
          // A street lamp every few cells along a walk. A broken one stays dark until a worker fixes it.
          if (hasLamps && lampAt(state.map, x, y)) {
            const out = (state.grounds.lamps[i] ?? 0) > 0;
            objectKey = out ? 'lamp.off' : lamp;
            if (!out) lampCells.push(i);
          }
        } else if (cell.kind === 'road' || cell.kind === 'street') {
          groundKey = `road.${this.roadMask(state, x, y)}`;
          if (hasLamps && lampAt(state.map, x, y)) {
            const out = (state.grounds.lamps[i] ?? 0) > 0;
            objectKey = out ? 'lamp.off' : lamp;
            if (!out) lampCells.push(i);
          }
        } else if (cell.kind === 'crossing') {
          // The bars lie across the road, whichever way it runs.
          groundKey = this.roadMask(state, x, y) & 5 ? 'road.cross.5' : 'road.cross.10';
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
          visual.object.setVisible(true).setPosition(pos.x, pos.y).setRotation(0);
          if (objectKey.startsWith('tree.') || objectKey === 'quad.tree') {
            // A tree turns about the foot of its trunk, so it can sway without its roots sliding.
            const foot = this.iso.toWorld(x + 0.5, y + 0.56);
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
            visual.works = this.add.image(pos.x, pos.y, '__DEFAULT').setDepth(this.iso.depth(x, y, 2));
            this.art.apply(visual.works, 'lot.works');
          }
          visual.works.setVisible(true);
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
      let key = sprite.key;
      if (placed.type === 'bin') {
        // A bin shows how full it is: the can, then heaped, then with a bag beside it.
        const how = binState(state, placed.id);
        const shown = how === 'full' ? 'grounds.bin.over' : how === 'filling' ? 'grounds.bin.full' : 'grounds.bin';
        if (this.art.has(shown)) key = shown;
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
        items.push({ key: `car.${(placed.id * 3 + k * 2) % 7}.ny`, x: placed.x + PARKED_AT[k]!, y: placed.y, forward: 2 });
      }
    }
    // A car park no road reaches holds no cars. A lowered barrier floats over it until one does.
    for (const placed of this.unlinkedCarParks(state)) {
      items.push({ key: 'icon.noroad', x: placed.x, y: placed.y, w: placed.w, h: placed.h, layer: 'float', lift: placed.type === 'garage' ? BADGE_LIFT.tall : BADGE_LIFT.low });
    }
    // A campus the town cannot get into says so at its edge: a sign beside College Avenue where a path,
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
      if (placed && PLACED[placed.type].cars && !hasRoadAccess(state.map, placed)) out.push(placed);
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
    if (session.placing && PLACED[session.placing].cars) return true;
    const selected = session.selected;
    const id = selected ? (state.map.cells[selected.y * state.map.width + selected.x]?.placedId ?? null) : null;
    const placed = id === null ? null : state.map.placed[id];
    return !!placed && !!PLACED[placed.type].cars;
  }

  /** Green where cars can get to, red where they cannot, and the avenue every road has to reach in blue. */
  private drawParkingOverlay(state: GameState): void {
    for (let y = 0; y < state.map.height; y++) this.fillCell(TOWN_X, y, PARKING_AVENUE, 0.3);
    const roads = roadsByAccess(state.map);
    for (const [x, y] of roads.linked) this.fillCell(x, y, PARKING_OK, 0.38);
    for (const [x, y] of roads.cut) this.fillCell(x, y, PARKING_CUT, 0.5);
    for (const placed of state.map.placed) {
      if (!placed || !PLACED[placed.type].cars) continue;
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
    // A walker is in front of whatever they are walking past.
    const walker = this.walkers.walkerAt(world.x, world.y, (14 * this.dpr) / this.cameras.main.zoom);
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
      session.select(building.x, building.y);
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
    const forSale = parcelAt(map, x, y)?.owned === false;
    // A lot or building shows its panel. So does a field for sale, and a street of the town.
    if (cell.kind === 'lot' || cell.kind === 'placed' || forSale || hoodAt(map, x, y)) session.select(x, y);
    else session.clearSelection();
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!store.hasGame) return;
    const cam = this.cameras.main;
    this.zoomAt(pointer.x, pointer.y, dy > 0 ? cam.zoom / WHEEL_STEP : cam.zoom * WHEEL_STEP);
  }
}
