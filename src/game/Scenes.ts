import Phaser from 'phaser';
import { findStudent, sceneWords, type SceneRole, type Stander } from '../app/activityPeople';
import type { Scenes as Wanted } from '../app/life';
import { dateAt, ownedAt, sampleStudents, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Box, Iso } from './iso';

/**
 * Small scenes that come and go (DESIGN.md section 33.4): a club's table on a
 * lawn, a ring of friends keeping a ball in the air on a quad, a picnic rug by
 * a pond, someone playing by the coffee stand, and the boxes of move-in day
 * stacked by the dorms.
 *
 * Which scenes are on is decided by the plain rule `scenesFor`, from the time
 * of day, the date in the game and the size of the campus. Where each one
 * stands is worked out here from the map and the day, so it is the same every
 * time the map is opened that day. Every piece is a sprite from the art pack.
 * Nothing here is saved, nothing changes a number, and nothing runs while
 * the game is closed.
 *
 * Each person in a scene is one enrolled student (DESIGN.md 13.12), found
 * from the seed by `findStudent`, so a tap on them opens the ordinary student
 * card.
 */

const FADE_MS = 450;
/** How often the scenes on the map are brought in line with what is wanted. */
const RECOUNT_MS = 1200;
/** Boxes stay by the dorms this long after a class moves in. */
const MOVE_IN_MS = 55_000;
/** Friends in a ring on a quad, how wide the ring is in cells, and how long the ball takes from one to the next. */
const RING_PLAYERS = 5;
const RING_RADIUS = 0.42;
const PASS_S = 1.15;
/** Club tables stand at least this many cells apart, and picnic rugs this many. */
const CLUB_SPACING = 3;
const PICNIC_SPACING = 2;
const OPEN_GROUND = ['empty', 'path', 'quad', 'crossing'];

type Kind = 'club' | 'pickup' | 'busker' | 'boxes' | 'picnic' | 'tailgate' | 'band' | 'storm';
/** The order of the kinds, for the seeded pick of who is in which scene. */
const KINDS: readonly Kind[] = ['club', 'pickup', 'busker', 'boxes', 'picnic', 'tailgate', 'band', 'storm'];
/** People in the marching band, in two ranks, and fans on the field after a big win. */
const BAND_SIZE = 8;
const STORM_SIZE = 12;

interface Actor {
  sprite: Phaser.GameObjects.Image;
  /** What they are in the scene, and who they are. null until they are found, and on a campus with no students. */
  role: SceneRole;
  student: StudentRef | null;
  look: number;
  x: number;
  y: number;
  direction: WalkDirection;
  /** A player in a ring steps on the spot while the ball is theirs. */
  plays: boolean;
  /** Steps on the spot all the time: the band marking time, fans jumping on the field. */
  marches: boolean;
  phase: number;
  shownKey: string;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** The ball of a ring is passed around. Everything else stands where it was put. */
  ball: boolean;
  /** A banner moves a little in the wind. */
  sways: boolean;
  /** A rug lies on the ground, under the people on it. */
  flat: boolean;
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
  seen: boolean;
  /** Boxes only: when they are carried in. */
  untilMs: number;
  /**
   * The drawing the scene is laid out on, or null for one laid on the grass of the map. A scene on a drawing keeps
   * its look when the view is turned: its people and props go where the turned view draws that drawing, mirrored
   * with it (DESIGN.md section 43). Every spot below is given as the map has it with no turn.
   */
  host: Box | null;
}

/**
 * Where the pitch is in the stadium's picture, in cells from the plot's
 * north corner, and how far above the ground it is drawn. Measured from the
 * art, as the courts and the pool were.
 */
const STORM_FIELD = { x0: 1.15, x1: 1.95, y0: 0.75, y1: 1.85, lift: 4 };

/** A steady number from two whole numbers, so a scene's place and people do not flicker. */
function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The way someone at one spot faces to look at another. */
function facing(fromX: number, fromY: number, toX: number, toY: number): WalkDirection {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
}

export class Scenes {
  private scenes = new Map<string, Scene>();
  private readonly people: PeopleSpec | null;
  private wanted: Wanted | null = null;
  private step = 2;
  private recountAt = 0;
  /** Lawn beside a path and near buildings, where a club can set out its table: best first for today. */
  private clubSpots: Array<{ x: number; y: number }> = [];
  /** Quads of two cells by two, where a ring of friends fits: best first for today. */
  private quadBlocks: Array<{ x: number; y: number }> = [];
  /** Lawn beside a quad or a pond, where a rug can be spread: best first for today. */
  private picnicSpots: Array<{ x: number; y: number }> = [];
  /** Where a busker stands by the first coffee stand, or null with none. */
  private buskerSpot: { x: number; y: number } | null = null;
  /** The day of the game's year: scenes move from day to day and stay put within one. */
  private day = 0;
  /** Flat car parks, where a tailgate can be set up. */
  private carParks: Box[] = [];
  /** The stadium's plot and the tier that stands on it, or null with no plot. */
  private stadium: { x: number; y: number; w: number; h: number; tier: number } | null = null;
  /** The school's colour on a home game day, laid over fans and the band. null on any other day. */
  private tint: number | null = null;
  /** True for the few minutes fans are on the field after a big home win. */
  private storming = false;
  private state: GameState | null = null;
  /** The students people in scenes are found among: the same sample walkers are drawn from. */
  private everyone: StudentRef[] = [];

  /**
   * `staying` is every student standing somewhere on the map for a while, here
   * or in an activity, and `walking` says who is out walking. Between them
   * nobody is in two places.
   */
  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    private staying: Set<string> = new Set(),
    private walking: (key: string) => boolean = () => false,
  ) {
    this.people = art.people;
  }

  /** What the rule asks for now. */
  setLife(wanted: Wanted): void {
    this.wanted = wanted;
  }

  /** A home game day: the school's colour, and whether the field is being stormed. */
  setGame(tint: number | null, storming: boolean): void {
    if (tint !== this.tint || storming !== this.storming) this.recountAt = 0;
    this.tint = tint;
    this.storming = storming;
  }

  /** The crowd step in force: on a slow device only one of each scene is shown. */
  setStep(step: number): void {
    this.step = step;
  }

  /** Read the map again: where a club table, a ring, a rug and a busker could go today. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings, placed } = state.map;
    this.state = state;
    // A class came or went: everyone in a scene is found again, since one of them may have graduated.
    const sample = sampleStudents(state);
    if (sample.length !== this.everyone.length || sample[0]?.entryYear !== this.everyone[0]?.entryYear) {
      this.everyone = sample;
      for (const scene of this.scenes.values()) {
        for (const actor of scene.actors) this.release(actor);
        for (const actor of scene.actors) this.cast(scene, actor);
      }
    }
    const date = dateAt(state.clock);
    this.day = date.month * 32 + date.day;
    const kind = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? 'off' : cells[y * width + x]!.kind);
    const lots: Array<{ x: number; y: number }> = [];
    for (const building of buildings) if (building && building.stage >= 1) lots.push({ x: building.x, y: building.y });
    const nearLot = (x: number, y: number): boolean => lots.some((lot) => Math.max(Math.abs(lot.x - x), Math.abs(lot.y - y)) <= 4);
    const apart = (list: Array<{ x: number; y: number }>, spot: { x: number; y: number }, cells: number): boolean =>
      list.every((taken) => Math.max(Math.abs(taken.x - spot.x), Math.abs(taken.y - spot.y)) >= cells);

    // A club table: plain grass on the campus's own land, with a path along one side and buildings near.
    const clubs: Array<{ x: number; y: number; order: number }> = [];
    // A picnic rug: plain grass on the campus's own land, beside a quad or a pond.
    const rugs: Array<{ x: number; y: number; order: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (kind(x, y) !== 'empty' || !ownedAt(state.map, x, y)) continue;
        const paved = kind(x + 1, y) === 'path' || kind(x - 1, y) === 'path' || kind(x, y + 1) === 'path' || kind(x, y - 1) === 'path';
        if (paved && nearLot(x, y)) clubs.push({ x, y, order: mix(this.day, y * width + x) });
        let pleasant = false;
        for (let dy = -1; dy <= 1 && !pleasant; dy++) {
          for (let dx = -1; dx <= 1 && !pleasant; dx++) {
            if (kind(x + dx, y + dy) === 'quad') pleasant = true;
            else if (kind(x + dx, y + dy) !== 'off') {
              const id = cells[(y + dy) * width + x + dx]!.placedId;
              const thing = id === null || id === undefined ? null : placed[id];
              if (thing && thing.type.startsWith('pond')) pleasant = true;
            }
          }
        }
        if (pleasant) rugs.push({ x, y, order: mix(this.day + 13, y * width + x) });
      }
    }
    clubs.sort((a, b) => a.order - b.order);
    this.clubSpots = [];
    for (const spot of clubs) {
      if (this.clubSpots.length >= 8) break;
      if (apart(this.clubSpots, spot, CLUB_SPACING)) this.clubSpots.push({ x: spot.x, y: spot.y });
    }
    rugs.sort((a, b) => a.order - b.order);
    this.picnicSpots = [];
    for (const spot of rugs) {
      if (this.picnicSpots.length >= 6) break;
      if (apart(this.picnicSpots, spot, PICNIC_SPACING) && apart(this.clubSpots, spot, 2)) this.picnicSpots.push({ x: spot.x, y: spot.y });
    }

    // A ring of friends: a quad at least two cells each way. They stand where its four cells meet.
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

    // Tailgates set up on flat car parks. The band forms up on the stadium's plot.
    this.carParks = [];
    this.stadium = null;
    for (const thing of placed) {
      if (!thing) continue;
      if (thing.type === 'parking') this.carParks.push({ x: thing.x, y: thing.y, w: thing.w, h: thing.h });
      if (thing.type === 'stadium') this.stadium = { x: thing.x, y: thing.y, w: thing.w, h: thing.h, tier: state.football.stadium.tier };
    }

    // A busker: at a front corner of the first coffee stand, out of the way of its line, on open ground with nothing on it.
    this.buskerSpot = null;
    const stand = placed.find((thing) => thing?.type === 'coffee');
    if (stand) {
      const clear = (x: number, y: number): boolean => OPEN_GROUND.includes(kind(x, y)) && (cells[y * width + x]!.placedId ?? null) === null;
      if (clear(stand.x - 1, stand.y + 1)) this.buskerSpot = { x: stand.x - 0.3, y: stand.y + 1.22 };
      else if (clear(stand.x + 1, stand.y + 1)) this.buskerSpot = { x: stand.x + 1.3, y: stand.y + 1.3 };
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
      const scene = this.begin(key, 'boxes', dorm.x, dorm.y, 1, 1, { x: dorm.x, y: dorm.y, w: 1, h: 1 });
      scene.untilMs = timeMs + MOVE_IN_MS;
      // Two stacks by the door, in front of the building.
      this.prop(scene, this.art.has('scene.boxes') ? 'scene.boxes' : 'people.boxes', dorm.x + 0.3, dorm.y + 1.12);
      this.prop(scene, 'people.boxes', dorm.x + 0.74, dorm.y + 1.2);
    }
  }

  private begin(key: string, kind: Kind, x: number, y: number, w: number, h: number, host: Box | null = null): Scene {
    const scene: Scene = { key, kind, x, y, w, h, actors: [], props: [], alpha: 0, leaving: false, seen: false, untilMs: 0, host };
    this.scenes.set(key, scene);
    return scene;
  }

  private prop(scene: Scene, key: string, x: number, y: number, how: { ball?: boolean; sways?: boolean; flat?: boolean } = {}): void {
    if (!this.art.has(key)) return;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    this.art.apply(sprite, key);
    // It stands on its own base at the spot it is given. A rug lies with its middle there.
    sprite.setOrigin(0.5, how.flat ? 0.5 : 1);
    scene.props.push({ sprite, x, y, ball: how.ball ?? false, sways: how.sways ?? false, flat: how.flat ?? false });
  }

  /** `look` is the figure they are drawn as on a campus with no students yet. With students, they are drawn as themselves. */
  private actor(scene: Scene, role: SceneRole, look: number, x: number, y: number, direction: WalkDirection, plays = false, marches = false): void {
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    // On a game day the fans and the band are in the school's colour: the figure itself is tinted.
    if (marches || scene.kind === 'tailgate') {
      if (this.tint !== null) sprite.setTint(this.tint);
    }
    const actor: Actor = { sprite, role, student: null, look, x, y, direction, plays, marches, phase: mix(scene.x * 131 + scene.y, scene.actors.length) * Math.PI * 2, shownKey: '' };
    scene.actors.push(actor);
    this.cast(scene, actor);
  }

  /** Someone in a scene stops being anybody: the scene has gone, or the classes changed. */
  private release(actor: Actor): void {
    if (actor.student) this.staying.delete(studentKey(actor.student));
    actor.student = null;
  }

  /** Find who someone in a scene is: a student nobody else on the map is, from the seed, the scene, the day and their place in it. */
  private cast(scene: Scene, actor: Actor): void {
    const state = this.state;
    const people = this.people;
    if (!state || !people) return;
    const place = (scene.x * 131 + scene.y) * KINDS.length + KINDS.indexOf(scene.kind) + this.day * 100_003;
    const student = findStudent(state.seed, this.everyone, place, scene.actors.indexOf(actor), (key) => this.staying.has(key) || this.walking(key));
    actor.student = student;
    if (!student) return;
    this.staying.add(studentKey(student));
    actor.look = studentFigure(state, student, Math.max(1, Math.min(people.looks, people.crowd ?? people.looks)), people.roles?.athlete);
    actor.shownKey = '';
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
      // A scene is only set out when its own art is in the pack in use: two people standing by nothing are not a club table.
      const shown = (asked: number, room: number, needs: string): number => (this.art.has(needs) ? Math.min(room, few ? Math.min(1, asked) : asked) : 0);

      for (let n = 0; n < shown(wanted.clubTables, this.clubSpots.length, 'scene.table'); n++) {
        const at = this.clubSpots[n]!;
        const key = `club:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key)) continue;
        // A table under a parasol with the club's member behind it, a sign board in front, a banner behind, and a visitor.
        const scene = this.begin(key, 'club', at.x, at.y, 1, 1, { x: at.x, y: at.y, w: 1, h: 1 });
        this.prop(scene, 'scene.banner', at.x + 0.82, at.y + 0.1, { sways: true });
        this.prop(scene, 'scene.parasol', at.x + 0.36, at.y + 0.36);
        this.prop(scene, 'scene.table', at.x + 0.64, at.y + 0.64);
        this.prop(scene, 'scene.sign', at.x + 0.28, at.y + 1.0);
        this.actor(scene, 'clubHost', look(at.x * 97 + at.y, this.day), at.x + 0.26, at.y + 0.52, 'se');
        this.actor(scene, 'clubVisitor', look(at.x * 97 + at.y, this.day + 1), at.x + 1.08, at.y + 0.56, 'nw');
      }

      for (let n = 0; n < shown(wanted.pickupGames, this.quadBlocks.length, 'play.volleyball'); n++) {
        const at = this.quadBlocks[n]!;
        const key = `pickup:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key)) continue;
        // Friends in a ring where the quad's four cells meet, keeping a ball in the air between them.
        const scene = this.begin(key, 'pickup', at.x, at.y, 2, 2, { x: at.x, y: at.y, w: 2, h: 2 });
        this.prop(scene, 'play.volleyball', at.x + 1, at.y + 1, { ball: true });
        const turn = mix(at.x, at.y + this.day) * Math.PI * 2;
        for (let k = 0; k < RING_PLAYERS; k++) {
          const angle = turn + (k / RING_PLAYERS) * Math.PI * 2;
          const x = at.x + 1 + Math.cos(angle) * RING_RADIUS;
          const y = at.y + 1 + Math.sin(angle) * RING_RADIUS;
          this.actor(scene, 'pickup', look(at.x * 53 + at.y + k, this.day + 3), x, y, facing(x, y, at.x + 1, at.y + 1), true);
        }
      }

      for (let n = 0; n < shown(wanted.picnics, this.picnicSpots.length, 'scene.rug'); n++) {
        const at = this.picnicSpots[n]!;
        const key = `picnic:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key)) continue;
        // A rug on the grass with a basket on it, and two friends. No figure in the pack sits or lies, so they stand.
        const scene = this.begin(key, 'picnic', at.x, at.y, 1, 1, { x: at.x, y: at.y, w: 1, h: 1 });
        this.prop(scene, 'scene.rug', at.x + 0.5, at.y + 0.5, { flat: true });
        this.prop(scene, 'scene.basket', at.x + 0.4, at.y + 0.44);
        this.actor(scene, 'picnic', look(at.x * 71 + at.y, this.day + 5), at.x + 0.36, at.y + 0.76, 'se');
        this.actor(scene, 'picnic', look(at.x * 71 + at.y, this.day + 6), at.x + 0.8, at.y + 0.42, 'sw');
      }

      // A home game: tailgates in the car parks, each a parasol, a table and a few fans.
      for (let n = 0; n < Math.min(this.carParks.length, wanted.tailgates); n++) {
        const at = this.carParks[n]!;
        const key = `tailgate:${at.x},${at.y}`;
        keep.add(key);
        if (this.scenes.has(key) || !this.art.has('scene.table')) continue;
        // Laid out on the car park's own drawing, mirrored with it on a quarter turn.
        const scene = this.begin(key, 'tailgate', at.x, at.y, 2, 2, at);
        this.prop(scene, 'scene.parasol', at.x + 0.3, at.y + 1.5);
        this.prop(scene, 'scene.table', at.x + 0.62, at.y + 1.82);
        this.actor(scene, 'tailgate', look(at.x * 61 + at.y, 1), at.x + 0.2, at.y + 1.9, 'se');
        this.actor(scene, 'tailgate', look(at.x * 61 + at.y, 2), at.x + 1.0, at.y + 1.55, 'sw');
        this.actor(scene, 'tailgate', look(at.x * 61 + at.y, 3), at.x + 1.05, at.y + 2.05, 'nw');
      }

      // The band, in two ranks on the practice lawn beside the stadium, marking time with a drum before each rank.
      const ground = this.stadium;
      if (wanted.band && ground && ground.tier >= 1 && ground.tier <= 3) {
        const key = `band:${ground.x},${ground.y}`;
        keep.add(key);
        if (!this.scenes.has(key)) {
          const scene = this.begin(key, 'band', ground.x, ground.y + 2, 2, 1);
          for (let k = 0; k < BAND_SIZE; k++) {
            const rank = Math.floor(k / (BAND_SIZE / 2));
            this.actor(scene, 'band', look(ground.x * 43 + k, 9), ground.x + 0.28 + (k % (BAND_SIZE / 2)) * 0.48, ground.y + 2.3 + rank * 0.42, 'sw', false, true);
          }
          this.prop(scene, 'scene.drum', ground.x + 0.2, ground.y + 2.96);
          this.prop(scene, 'scene.drum', ground.x + 1.2, ground.y + 2.96);
        }
      }

      // A big home win: fans all over the field for a few minutes.
      if (this.storming && ground && ground.tier >= 1) {
        const key = `storm:${ground.x},${ground.y}`;
        keep.add(key);
        if (!this.scenes.has(key)) {
          // On the stadium's own pitch: two cells by two at tiers one to three, and by three at four and five.
          const scene = this.begin(key, 'storm', ground.x, ground.y, 2, 2, { x: ground.x, y: ground.y, w: 2, h: ground.tier >= 4 ? 3 : 2 });
          for (let k = 0; k < STORM_SIZE; k++) {
            const x = ground.x + STORM_FIELD.x0 + mix(k, 3) * (STORM_FIELD.x1 - STORM_FIELD.x0);
            const y = ground.y + STORM_FIELD.y0 + mix(k, 5) * (STORM_FIELD.y1 - STORM_FIELD.y0);
            this.actor(scene, 'storm', look(k * 17 + ground.x, 13), x, y, (['se', 'sw', 'nw', 'ne'] as const)[k % 4]!, false, true);
          }
        }
      }

      if (wanted.busker && this.buskerSpot && this.art.has('scene.lute')) {
        const at = this.buskerSpot;
        const key = `busker:${Math.floor(at.x)},${Math.floor(at.y)}`;
        keep.add(key);
        if (!this.scenes.has(key)) {
          // A figure with the pack's drum in front of them and its lute beside them: no figure can hold anything.
          const scene = this.begin(key, 'busker', Math.floor(at.x), Math.floor(at.y), 1, 1);
          this.actor(scene, 'busker', look(this.day, 11), at.x, at.y, 'sw');
          this.prop(scene, 'scene.drum', at.x + 0.06, at.y + 0.24);
          this.prop(scene, 'scene.lute', at.x - 0.26, at.y + 0.06);
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
    const wind = this.wanted?.wind ?? 0;
    for (const scene of this.scenes.values()) {
      scene.alpha = scene.leaving ? scene.alpha - dt / FADE_MS : Math.min(1, scene.alpha + dt / FADE_MS);
      if (scene.leaving && scene.alpha <= 0) {
        for (const actor of scene.actors) this.release(actor);
        for (const actor of scene.actors) actor.sprite.destroy();
        for (const prop of scene.props) prop.sprite.destroy();
        this.scenes.delete(scene.key);
        continue;
      }
      const middle = this.iso.toWorld(scene.x + scene.w / 2, scene.y + scene.h / 2);
      const seen = middle.x >= view.x - 220 && middle.x <= view.right + 220 && middle.y >= view.y - 220 && middle.y <= view.bottom + 220;
      scene.seen = seen;
      for (const actor of scene.actors) actor.sprite.setVisible(seen);
      for (const prop of scene.props) prop.sprite.setVisible(seen);
      if (!seen) continue;
      const alpha = Math.max(0, scene.alpha);

      // The ball of a ring goes from one friend to the next but one, and rises and falls on the way.
      let ballX = 0;
      let ballY = 0;
      let lift = 0;
      let from = -1;
      let to = -1;
      if (scene.kind === 'pickup' && scene.actors.length > 1) {
        const t = seconds / PASS_S + mix(scene.x, scene.y) * 10;
        const pass = Math.floor(t);
        const part = t - pass;
        from = (pass * 2) % scene.actors.length;
        to = ((pass + 1) * 2) % scene.actors.length;
        const a = scene.actors[from]!;
        const b = scene.actors[to]!;
        ballX = a.x + (b.x - a.x) * part;
        ballY = a.y + (b.y - a.y) * part;
        lift = 20 + Math.sin(part * Math.PI) * 30;
      }
      // Where a spot of the scene falls in the turned view: on its drawing, or on the map's own grass.
      const host = scene.host;
      const place = (x: number, y: number): { x: number; y: number } => (host ? this.iso.onDrawing(host, x - host.x, y - host.y) : { x, y });
      for (const prop of scene.props) {
        const spot = place(prop.ball ? ballX : prop.x, prop.ball ? ballY : prop.y);
        const at = this.iso.toWorld(spot.x, spot.y);
        // A rug is under everyone on its cell. Everything else stands among the people by where its base is.
        const depth = prop.flat ? this.iso.depth(scene.x, scene.y, 0) + 0.5 : (this.iso.sum(spot.x, spot.y) - 1) * 4 + 2.45;
        prop.sprite.setPosition(at.x, at.y - (prop.ball ? lift : 0)).setDepth(depth).setAlpha(alpha);
        if (prop.sways) prop.sprite.setRotation(Math.sin(seconds * 1.7 + prop.x * 3.1) * 0.05 * wind);
      }
      if (!people) continue;
      for (let n = 0; n < scene.actors.length; n++) {
        const actor = scene.actors[n]!;
        // Whoever is sending or getting the ball steps on the spot. Everyone else stands.
        const busy = actor.marches || (actor.plays && (n === from || n === to));
        const flipFrom = people.flip?.[actor.direction];
        const frame = busy ? Math.floor((timeMs + actor.phase * 300) / people.frameMs) % people.frames : 0;
        const key = `person.${actor.look}.${flipFrom ?? actor.direction}.${frame}`;
        if (key !== actor.shownKey) {
          this.art.apply(actor.sprite, key);
          actor.shownKey = key;
        }
        actor.sprite.setFlipX(flipFrom !== undefined);
        // The way they face is the scene's own, on the screen: a scene keeps its look at every turn.
        const spot = place(actor.x, actor.y);
        const at = this.iso.toWorld(spot.x, spot.y);
        // Fans on the field are drawn over the stadium they are standing in.
        const depth =
          scene.kind === 'storm' && host
            ? this.iso.front(host.x, host.y, host.w, host.h) * 4 + 1.2 + this.iso.sum(spot.x, spot.y) * 0.01
            : (this.iso.sum(spot.x, spot.y) - 1) * 4 + 2.5;
        actor.sprite.setPosition(at.x, at.y - (scene.kind === 'storm' ? STORM_FIELD.lift : 0)).setDepth(depth).setAlpha(alpha);
      }
    }
  }

  // ------------------------------------------------------- student cards --

  private stander(actor: Actor, far: number): Stander {
    return { student: actor.student, look: actor.look, words: sceneWords(actor.role), x: actor.sprite.x, y: actor.sprite.y, far, depth: actor.sprite.depth };
  }

  /** The person in a scene at a point of the world, or null. `reach` widens each one, as it does a walker. */
  actorAt(worldX: number, worldY: number, reach: number): Stander | null {
    let found: Stander | null = null;
    for (const scene of this.scenes.values()) {
      if (scene.leaving || !scene.seen || scene.alpha < 0.5) continue;
      for (const actor of scene.actors) {
        const box = actor.sprite.getBounds();
        if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > box.bottom + reach) continue;
        const far = Math.hypot(worldX - box.centerX, worldY - box.centerY);
        if (!found || far < found.far) found = this.stander(actor, far);
      }
    }
    return found;
  }

  /** Where a student is and what they are doing, when they are in one of the scenes. */
  find(key: string): Stander | null {
    for (const scene of this.scenes.values()) {
      if (scene.leaving) continue;
      for (const actor of scene.actors) if (actor.student && studentKey(actor.student) === key) return this.stander(actor, 0);
    }
    return null;
  }

  /** The first person in a role, for a dev screenshot. */
  firstIn(role: string): Stander | null {
    for (const scene of this.scenes.values()) {
      if (scene.leaving || !scene.seen) continue;
      for (const actor of scene.actors) if (actor.role === role && actor.student) return this.stander(actor, 0);
    }
    return null;
  }

  /** How many scenes of each kind are on the map. For the dev readout and for screenshots. */
  get counts(): Record<Kind, number> {
    const counts: Record<Kind, number> = { club: 0, pickup: 0, busker: 0, boxes: 0, picnic: 0, tailgate: 0, band: 0, storm: 0 };
    for (const scene of this.scenes.values()) if (!scene.leaving) counts[scene.kind] += 1;
    return counts;
  }

  /** True while the busker is on screen: the soundscape plays their tune. */
  get buskerSeen(): boolean {
    for (const scene of this.scenes.values()) if (scene.kind === 'busker' && !scene.leaving && scene.seen) return true;
    return false;
  }

  /** The cell of the first scene of a kind, for a dev screenshot to look at. */
  where(kind: Kind): { x: number; y: number } | null {
    for (const scene of this.scenes.values()) if (scene.kind === kind && !scene.leaving) return { x: scene.x + scene.w / 2, y: scene.y + scene.h / 2 };
    return null;
  }

  clear(): void {
    for (const scene of this.scenes.values()) {
      for (const actor of scene.actors) this.release(actor);
      for (const actor of scene.actors) actor.sprite.destroy();
      for (const prop of scene.props) prop.sprite.destroy();
    }
    this.scenes.clear();
  }
}
