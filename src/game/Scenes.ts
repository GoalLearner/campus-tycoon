import Phaser from 'phaser';
import type { Scenes as Wanted } from '../app/life';
import { dateAt, ownedAt, type GameState } from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Iso } from './iso';

/**
 * Small scenes that come and go (DESIGN.md section 33.4): a club's table on a
 * lawn, a pickup game on a quad, someone playing by the coffee stand, and the
 * boxes of move-in day stacked by the dorms.
 *
 * Which scenes are on is decided by the plain rule `scenesFor`, from the time
 * of day, the date in the game and the size of the campus. Where each one
 * stands is worked out here from the map and the day, so it is the same every
 * time the map is opened that day. Every piece is a sprite from the art pack.
 * Nothing here is saved, nothing changes a number, and nothing runs while
 * the game is closed.
 */

const FADE_MS = 450;
/** How often the scenes on the map are brought in line with what is wanted. */
const RECOUNT_MS = 1200;
/** Boxes stay by the dorms this long after a class moves in. */
const MOVE_IN_MS = 55_000;
/** People in a pickup game. */
const PICKUP_PLAYERS = 5;
/** Club tables stand at least this many cells apart. */
const CLUB_SPACING = 3;
const OPEN_GROUND = ['empty', 'path', 'quad', 'crossing'];

type Kind = 'club' | 'pickup' | 'busker' | 'boxes';

interface Actor {
  sprite: Phaser.GameObjects.Image;
  look: number;
  /** Where they stand, or the middle of where they run about. */
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  runs: boolean;
  phase: number;
  direction: WalkDirection;
  shownKey: string;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** The ball of a pickup game moves. Everything else stands where it was put. */
  ball: boolean;
}

interface Scene {
  key: string;
  kind: Kind;
  /** The cell at its north corner, and its size in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  actors: Actor[];
  props: Prop[];
  alpha: number;
  leaving: boolean;
  /** Boxes only: when they are carried in. */
  untilMs: number;
}

/** A steady number from two whole numbers, so a scene's place and people do not flicker. */
function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Scenes {
  private scenes = new Map<string, Scene>();
  private readonly people: PeopleSpec | null;
  private wanted: Wanted | null = null;
  private step = 2;
  private recountAt = 0;
  /** Lawn beside a path and near buildings, where a club can set out its table: best first for today. */
  private clubSpots: Array<{ x: number; y: number }> = [];
  /** Quads of two cells by two, where a game fits: best first for today. */
  private quadBlocks: Array<{ x: number; y: number }> = [];
  /** Where a busker stands by the first coffee stand, or null with none. */
  private buskerSpot: { x: number; y: number } | null = null;
  /** The day of the game's year: scenes move from day to day and stay put within one. */
  private day = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {
    this.people = art.people;
  }

  /** What the rule asks for now. */
  setLife(wanted: Wanted): void {
    this.wanted = wanted;
  }

  /** The crowd step in force: on a slow device only one of each scene is shown. */
  setStep(step: number): void {
    this.step = step;
  }

  /** Read the map again: where a club table, a game and a busker could go today. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings } = state.map;
    const date = dateAt(state.clock.tick);
    this.day = date.month * 32 + date.day;
    const kind = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? 'off' : cells[y * width + x]!.kind);
    const lots: Array<{ x: number; y: number }> = [];
    for (const building of buildings) if (building && building.stage >= 1) lots.push({ x: building.x, y: building.y });
    const nearLot = (x: number, y: number): boolean => lots.some((lot) => Math.max(Math.abs(lot.x - x), Math.abs(lot.y - y)) <= 4);

    // A club table: plain grass on the campus's own land, with a path along one side and buildings near.
    const clubs: Array<{ x: number; y: number; order: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (kind(x, y) !== 'empty' || !ownedAt(state.map, x, y)) continue;
        const paved = kind(x + 1, y) === 'path' || kind(x - 1, y) === 'path' || kind(x, y + 1) === 'path' || kind(x, y - 1) === 'path';
        if (paved && nearLot(x, y)) clubs.push({ x, y, order: mix(this.day, y * width + x) });
      }
    }
    clubs.sort((a, b) => a.order - b.order);
    this.clubSpots = [];
    for (const spot of clubs) {
      if (this.clubSpots.length >= 8) break;
      if (this.clubSpots.every((taken) => Math.max(Math.abs(taken.x - spot.x), Math.abs(taken.y - spot.y)) >= CLUB_SPACING)) this.clubSpots.push({ x: spot.x, y: spot.y });
    }

    // A pickup game: a quad at least two cells each way.
    const used = new Set<number>();
    const blocks: Array<{ x: number; y: number; order: number }> = [];
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const four = [y * width + x, y * width + x + 1, (y + 1) * width + x, (y + 1) * width + x + 1];
        if (four.some((cell) => used.has(cell) || cells[cell]!.kind !== 'quad')) continue;
        for (const cell of four) used.add(cell);
        blocks.push({ x, y, order: mix(this.day + 7, y * width + x) });
      }
    }
    blocks.sort((a, b) => a.order - b.order);
    this.quadBlocks = blocks.slice(0, 6).map((block) => ({ x: block.x, y: block.y }));

    // A busker: in front of the first coffee stand, or to its east when something stands in front.
    this.buskerSpot = null;
    const stand = state.map.placed.find((placed) => placed?.type === 'coffee');
    if (stand) {
      if (OPEN_GROUND.includes(kind(stand.x, stand.y + 1))) this.buskerSpot = { x: stand.x + 0.82, y: stand.y + 1.2 };
      else if (OPEN_GROUND.includes(kind(stand.x + 1, stand.y))) this.buskerSpot = { x: stand.x + 1.2, y: stand.y + 0.82 };
    }
    this.recountAt = 0;
  }

  /** Move-in day: boxes are stacked outside the dorms the new students are walking to. */
  moveIn(dorms: ReadonlyArray<{ x: number; y: number }>, timeMs: number): void {
    if (!this.art.has('people.boxes')) return;
    for (const dorm of dorms.slice(0, 6)) {
      const key = `boxes:${dorm.x},${dorm.y}`;
      const old = this.scenes.get(key);
      if (old) {
        old.untilMs = timeMs + MOVE_IN_MS;
        old.leaving = false;
        continue;
      }
      const scene = this.begin(key, 'boxes', dorm.x, dorm.y, 1, 1);
      scene.untilMs = timeMs + MOVE_IN_MS;
      // Two stacks by the door, in front of the building.
      this.prop(scene, 'people.boxes', dorm.x + 0.3, dorm.y + 1.12);
      this.prop(scene, 'people.boxes', dorm.x + 0.72, dorm.y + 1.2);
    }
  }

  private begin(key: string, kind: Kind, x: number, y: number, w: number, h: number): Scene {
    const scene: Scene = { key, kind, x, y, w, h, actors: [], props: [], alpha: 0, leaving: false, untilMs: 0 };
    this.scenes.set(key, scene);
    return scene;
  }

  private prop(scene: Scene, key: string, x: number, y: number, ball = false): void {
    if (!this.art.has(key)) return;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    this.art.apply(sprite, key);
    // It stands on its own base, at the spot it is given.
    sprite.setOrigin(0.5, 1);
    scene.props.push({ sprite, x, y, ball });
  }

  private actor(scene: Scene, look: number, x: number, y: number, runs: boolean, n: number): void {
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    scene.actors.push({ sprite, look, x, y, homeX: x, homeY: y, runs, phase: mix(scene.x * 131 + scene.y, n) * Math.PI * 2, direction: 'sw', shownKey: '' });
  }

  /** Bring the scenes on the map in line with what the rule asks for. */
  private recount(timeMs: number): void {
    const wanted = this.wanted;
    const people = this.people;
    const keep = new Set<string>();
    if (wanted && people) {
      const crowd = Math.max(1, Math.min(people.looks, people.crowd ?? people.looks));
      const look = (a: number, b: number): number => Math.floor(mix(a, b) * crowd);
      const few = this.step <= 0;

      const clubs = Math.min(this.clubSpots.length, few ? Math.min(1, wanted.clubTables) : wanted.clubTables);
      for (let n = 0; n < clubs; n++) {
        const at = this.clubSpots[n]!;
        const key = `club:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key)) continue;
        // A tent at the back, the table in front of it with the club's member behind, a sign board to one side, and a visitor.
        const scene = this.begin(key, 'club', at.x, at.y, 1, 1);
        this.prop(scene, 'scene.tent', at.x + 0.42, at.y + 0.42);
        this.prop(scene, 'scene.table', at.x + 0.62, at.y + 0.78);
        this.prop(scene, 'scene.sign', at.x + 0.16, at.y + 0.9);
        this.actor(scene, look(at.x * 97 + at.y, this.day), at.x + 0.52, at.y + 0.6, false, 0);
        this.actor(scene, look(at.x * 97 + at.y, this.day + 1), at.x + 0.86, at.y + 1.04, false, 1);
      }

      const games = Math.min(this.quadBlocks.length, few ? Math.min(1, wanted.pickupGames) : wanted.pickupGames);
      for (let n = 0; n < games; n++) {
        const at = this.quadBlocks[n]!;
        const key = `pickup:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key)) continue;
        const scene = this.begin(key, 'pickup', at.x, at.y, 2, 2);
        this.prop(scene, 'play.volleyball', at.x + 1, at.y + 1, true);
        for (let k = 0; k < PICKUP_PLAYERS; k++) {
          this.actor(scene, look(at.x * 53 + at.y + k, this.day + 3), at.x + 0.45 + (k % 3) * 0.55, at.y + 0.5 + Math.floor(k / 3) * 0.95 + (k % 2) * 0.2, true, k);
        }
      }

      if (wanted.busker && this.buskerSpot && this.art.has('scene.lute')) {
        const at = this.buskerSpot;
        const key = `busker:${Math.floor(at.x)},${Math.floor(at.y)}`;
        keep.add(key);
        if (!this.scenes.has(key)) {
          // A figure with the pack's lute on the ground beside them: no figure can hold anything.
          const scene = this.begin(key, 'busker', Math.floor(at.x), Math.floor(at.y), 1, 1);
          this.actor(scene, look(this.day, 11), at.x, at.y, false, 0);
          this.prop(scene, 'scene.lute', at.x - 0.24, at.y + 0.06);
        }
      }
    }
    for (const scene of this.scenes.values()) {
      if (scene.kind === 'boxes') scene.leaving = timeMs >= scene.untilMs;
      else scene.leaving = !keep.has(scene.key);
    }
  }

  update(timeMs: number, deltaMs: number): void {
    const people = this.people;
    if (timeMs >= this.recountAt) {
      this.recountAt = timeMs + RECOUNT_MS;
      this.recount(timeMs);
    }
    if (this.scenes.size === 0) return;
    const dt = Math.min(deltaMs, 100);
    const view = this.scene.cameras.main.worldView;
    const seconds = timeMs / 1000;
    for (const scene of this.scenes.values()) {
      scene.alpha = scene.leaving ? scene.alpha - dt / FADE_MS : Math.min(1, scene.alpha + dt / FADE_MS);
      if (scene.leaving && scene.alpha <= 0) {
        for (const actor of scene.actors) actor.sprite.destroy();
        for (const prop of scene.props) prop.sprite.destroy();
        this.scenes.delete(scene.key);
        continue;
      }
      const middle = this.iso.toWorld(scene.x + scene.w / 2, scene.y + scene.h / 2);
      const seen = middle.x >= view.x - 220 && middle.x <= view.right + 220 && middle.y >= view.y - 220 && middle.y <= view.bottom + 220;
      for (const actor of scene.actors) actor.sprite.setVisible(seen);
      for (const prop of scene.props) prop.sprite.setVisible(seen);
      if (!seen) continue;

      // The ball of a pickup game wanders the quad, and the players drift after it from their own places.
      let ballX = scene.x + scene.w / 2;
      let ballY = scene.y + scene.h / 2;
      if (scene.kind === 'pickup') {
        const t = seconds * 0.6 + mix(scene.x, scene.y) * 10;
        ballX += Math.sin(t) * (scene.w / 2 - 0.35);
        ballY += Math.sin(t * 0.67 + 1.1) * (scene.h / 2 - 0.35);
      }
      for (const prop of scene.props) {
        const x = prop.ball ? ballX : prop.x;
        const y = prop.ball ? ballY : prop.y;
        const at = this.iso.toWorld(x, y);
        // A ball in the air rises and falls a little.
        const lift = prop.ball ? Math.abs(Math.sin(seconds * 2.4 + scene.x)) * 9 : 0;
        prop.sprite.setPosition(at.x, at.y - lift).setDepth((x + y - 1) * 4 + 2.45).setAlpha(Math.max(0, scene.alpha));
      }
      if (!people) continue;
      for (const actor of scene.actors) {
        let x = actor.homeX;
        let y = actor.homeY;
        if (actor.runs) {
          x = actor.homeX * 0.62 + ballX * 0.38 + 0.08 * Math.sin(seconds * 2 + actor.phase);
          y = actor.homeY * 0.62 + ballY * 0.38 + 0.08 * Math.cos(seconds * 1.8 + actor.phase);
          const dx = x - actor.x;
          const dy = y - actor.y;
          if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) actor.direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
        }
        actor.x = x;
        actor.y = y;
        const flipFrom = people.flip?.[actor.direction];
        const frame = actor.runs ? Math.floor((timeMs + actor.phase * 300) / people.frameMs) % people.frames : 0;
        const key = `person.${actor.look}.${flipFrom ?? actor.direction}.${frame}`;
        if (key !== actor.shownKey) {
          this.art.apply(actor.sprite, key);
          actor.shownKey = key;
        }
        actor.sprite.setFlipX(flipFrom !== undefined);
        const at = this.iso.toWorld(x, y);
        actor.sprite.setPosition(at.x, at.y).setDepth((x + y - 1) * 4 + 2.5).setAlpha(Math.max(0, scene.alpha));
      }
    }
  }

  /** How many scenes of each kind are on the map. For the dev readout and for screenshots. */
  get counts(): Record<Kind, number> {
    const counts: Record<Kind, number> = { club: 0, pickup: 0, busker: 0, boxes: 0 };
    for (const scene of this.scenes.values()) if (!scene.leaving) counts[scene.kind] += 1;
    return counts;
  }

  /** The cell of the first scene of a kind, for a dev screenshot to look at. */
  where(kind: Kind): { x: number; y: number } | null {
    for (const scene of this.scenes.values()) if (scene.kind === kind && !scene.leaving) return { x: scene.x + scene.w / 2, y: scene.y + scene.h / 2 };
    return null;
  }

  clear(): void {
    for (const scene of this.scenes.values()) {
      for (const actor of scene.actors) actor.sprite.destroy();
      for (const prop of scene.props) prop.sprite.destroy();
    }
    this.scenes.clear();
  }
}
