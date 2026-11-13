import Phaser from 'phaser';
import { CROWD_STEPS, othersWanted, TOUR_SIZE, walkersWanted } from '../app/crowd';
import type { DayPeriod } from '../app/daylight';
import { avenueCrossing, avenueCrossingBack, KERB_NEAR, onRoadway, planTraffic, type TrafficPlan } from '../app/traffic';
import {
  enrollment,
  isPathKind,
  peopleCounts,
  personKey,
  PLACED,
  placeIndex,
  sampleStudents,
  studentHome,
  studentKey,
  studentFigure,
  TOWN_X,
  townLiving,
  type GameState,
  type PersonRef,
  type StudentRef,
  type Zone,
} from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Iso } from './iso';

/**
 * People walking. Purely for show: nothing here is saved, nothing here
 * touches the simulation, and catch-up never runs it. The crowd is a sample
 * sized from enrollment, from how much of the campus is on screen, from the
 * part of the player's day and from the crowd setting.
 *
 * A walker steps out of a building, follows the paths to another building, a
 * quad or somewhere to eat or play, and steps inside or lingers. Every sprite
 * comes from the art manifest. With no people in the manifest there are none.
 *
 * Each student walker is one of the enrolled students (see the student card,
 * DESIGN.md section 13.8). Who they are is worked out from the game's seed,
 * never stored: the same student always has the same look, and only ever
 * goes home to their own dorm.
 *
 * Two more kinds walk the town's streets. Commuters are students who live in
 * a neighbourhood joined to campus by a path: they walk in from their houses
 * in the morning and home in the evening. Townspeople are neighbours, and are
 * never students: they walk the streets whether or not the campus is joined.
 *
 * And a few people on campus are not students (DESIGN.md section 32.2):
 * professors and staff by day, as many as the payroll has for each student,
 * and at weekends tour groups behind a guide with a pennant, and a booster.
 * Each has a look of their own and a card. Together they are never more than
 * about a quarter of the people on screen.
 */

/** What a walker is doing, for the student card. */
export type Doing = 'toClass' | 'nextClass' | 'toDorm' | 'toQuad' | 'onQuad' | 'movingIn' | 'walkingIn' | 'walkingHome' | `toPlace:${string}` | `atPlace:${string}`;

/** Cells walked per second, before each walker's own pace. */
const PACE = 0.85;
/** In the morning rush people hurry. */
const HURRY: Record<DayPeriod, number> = { morning: 1.2, afternoon: 1, evening: 0.95, night: 0.9 };
/** Routes on campus longer than this many cells are skipped, so nobody treks across the whole map. */
const MAX_ROUTE_CELLS = 36;
/** A walk in from town can be longer: a street, the avenue, and the path to class. */
const MAX_COMMUTE_CELLS = 90;
const FADE_MS = 260;
const SPAWN_EVERY_MS = 120;
const OFFSCREEN_LIMIT_MS = 3500;
/** Commuters out at once for this many who walk in, before the time of day, and the most there can be. */
const WALKERS_IN_PER_COMMUTER = 14;
const MAX_COMMUTERS = 26;
/** How many of them are out in each part of the day, and the share heading for campus. */
const COMMUTE: Record<DayPeriod, { busy: number; inbound: number }> = {
  morning: { busy: 1.7, inbound: 0.92 },
  afternoon: { busy: 0.5, inbound: 0.5 },
  evening: { busy: 1.4, inbound: 0.1 },
  night: { busy: 0.12, inbound: 0.1 },
};
/** Townspeople out on the streets in each part of the day. */
const NEIGHBOURS_OUT: Record<DayPeriod, number> = { morning: 7, afternoon: 6, evening: 7, night: 1 };
/** How far from the middle of a street its sidewalk runs. */
const SIDEWALK = 0.41;
/** Which sidewalk of its street a house is on: -1 above the street on the map, 1 below. */
const sideOf = (house: Stop): number => (house.row !== undefined && house.cell.y < house.row ? -1 : 1);
/** A tour ambles. */
const TOUR_PACE = 0.6;
/** On a home game day this share of walkers setting out are going to the stadium, and this many times the usual crowd is out. */
const FAN_SHARE = 0.65;
const GAME_DAY_CROWD = 1.5;
/** How far behind the one in front each member of a tour walks, in milliseconds. */
const TOUR_GAP_MS = 750;

type StopKind = 'building' | 'quad' | 'gate' | 'place' | 'house';
/** What a place is for, which decides when people go there. */
type Use = 'food' | 'play' | 'seat' | 'office' | 'other';

interface Spot {
  x: number;
  y: number;
  /** The crossing the walk up to this spot goes over: they wait before it while a car has that crossing. */
  cross?: number;
}

interface Stop {
  kind: StopKind;
  /** The name of a place, for the student card. */
  name?: string;
  use?: Use;
  /** A place that lies flat, such as a court: people walk onto it. */
  flat?: boolean;
  zone: Zone | null;
  /** The cell the stop is on. */
  cell: Spot;
  /** Index of the path or street cell beside it. */
  door: number;
  /** A house: the row of its street, and whether students who walk in live on it. */
  row?: number;
  commuters?: boolean;
  /** The middle of a place that covers more than one cell. */
  middle?: Spot;
  /** A hand-placed building: which one, and its family, so staff can be told whose they are. */
  placedId?: number;
  family?: string;
  /** A house: the neighbourhood it stands in. */
  hood?: number;
}

/** What a walker can be given beyond the usual: who they are, how they look, and where exactly they walk. */
interface Extra {
  person?: PersonRef;
  look?: number;
  route?: Spot[];
  pace?: number;
  /** A sprite drawn beside them, because no figure can hold anything: the guide's pennant. */
  prop?: string;
}

interface Walker {
  sprite: Phaser.GameObjects.Image;
  /** A student, a commuter (also a student), a neighbour from the town, or one of the people who work at or visit the campus. */
  kind: 'student' | 'commuter' | 'neighbour' | 'professor' | 'staff' | 'guide' | 'parent' | 'booster';
  /** The student this is, or null for everyone else. */
  student: StudentRef | null;
  /** Who this is, when they are not a student and have a card. */
  person: PersonRef | null;
  /** Something drawn beside them. */
  prop: Phaser.GameObjects.Image | null;
  key: string | null;
  look: number;
  /** Where this trip began. */
  from: Stop;
  route: Spot[];
  leg: number;
  x: number;
  y: number;
  pace: number;
  direction: WalkDirection;
  stride: number;
  alpha: number;
  fading: 'in' | 'out' | null;
  lingerMs: number;
  /** Where the route ends. A quad means linger and walk on. */
  goal: Stop | null;
  offscreenMs: number;
  shownKey: string;
  /** True while the figure is drawn in the school's colour. */
  tinted: boolean;
}

interface Banner {
  text: Phaser.GameObjects.Text;
  ageMs: number;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function pick<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

/** Pick one of several lists by weight, leaving out the empty ones. */
function pickWeighted(choices: ReadonlyArray<readonly [readonly Stop[], number]>): readonly Stop[] {
  let total = 0;
  for (const [list, weight] of choices) if (list.length > 0) total += weight;
  if (total <= 0) return [];
  let at = Math.random() * total;
  for (const [list, weight] of choices) {
    if (list.length === 0) continue;
    at -= weight;
    if (at < 0) return list;
  }
  return [];
}

export class Walkers {
  private walkers: Walker[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private banners: Banner[] = [];
  private width = 0;
  private height = 0;
  /** Campus paths and crossings. */
  private isPath: boolean[] = [];
  /** Paths, crossings and the town's streets: what someone walking in from town can use. */
  private isWalk: boolean[] = [];
  private isCrossing: boolean[] = [];
  private isStreet: boolean[] = [];
  /** Where the junctions and the marked crossings are (src/app/traffic.ts). */
  private plan: TrafficPlan | null = null;
  private pathCells = 0;
  private stops: Stop[] = [];
  private gates: Stop[] = [];
  /** Every house in the town, and those whose students walk in. */
  private houses: Stop[] = [];
  private commuterHouses: Stop[] = [];
  /** Students who walk in from town, as the simulation counts them. */
  private walkingIn = 0;
  private students = 0;
  private spawnClock = 0;
  private townClock = 0;
  /** Arrivals still to step onto the map: each is a route and a delay. */
  private queue: Array<{ from: Stop; to: Stop; inMs: number; student: StudentRef | null; kind?: Walker['kind']; extra?: Extra }> = [];
  /** Faculty and staff on the payroll: how many professors and staff there are to be seen. */
  private faculty = 0;
  private staffOnBooks = 0;
  private readonly people: PeopleSpec | null;
  private state: GameState | null = null;
  /** The students walkers are drawn from. */
  private everyone: StudentRef[] = [];
  /** Those of them who live in town. */
  private offCampus: StudentRef[] = [];
  /** Who lives in each dorm, by the dorm's cell. */
  private residents = new Map<number, StudentRef[]>();
  /** Each resident's dorm cell, by student key. */
  private homes = new Map<string, number>();
  private stopAt = new Map<number, Stop>();
  /** Students out walking now, so nobody is in two places. */
  private out = new Set<string>();
  /** Students standing somewhere for a while, in a game, a line or a small scene. They are not sent walking as well. */
  private elsewhere: ReadonlySet<string> = new Set();
  /** Crossing cells with somebody on them this frame. Cars wait for them. */
  private crossingNow = new Set<number>();
  private marked: string | null = null;
  private ring: Phaser.GameObjects.Ellipse | null = null;
  /** The part of the player's own day. It sets how many are out and where they go. */
  private period: DayPeriod = 'afternoon';
  private weekend = false;
  /** The school's colour while a home game is on, laid over the fans walking to it. null on any other day. */
  private fanTint: number | null = null;
  /** The share of the usual crowd that is out. */
  private presence = 1;
  /** The stadium's gate, when a path reaches the plot. People go there on a home game day only. */
  private stadiumStop: Stop | null = null;
  /** The crowd step in force: the player's setting, or lower while frames are short. */
  private step = 2;
  /** How much a pennant sways, from 0 for still. */
  private wind = 0;
  /** Everyone on screen at the last frame, for the sound of the crowd. */
  private seenAll = 0;
  /** Asked before stepping onto a crossing: is a car on it, or driving onto it? */
  private carOn: (cell: number) => boolean = () => false;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {
    this.people = art.people;
  }

  /** Told by the map when the hour moves into another part of the day. */
  setPeriod(period: DayPeriod): void {
    this.period = period;
  }

  /** Told by the map: a Saturday or Sunday in the game's calendar is quieter. */
  /**
   * A home game day: fans walk to the stadium in the school's colour, and
   * more people are out. null when no game is on.
   */
  setGameDay(tint: number | null): void {
    this.fanTint = tint;
  }

  /** The share of the usual crowd that is out: a quarter on a break, fewer in the summer term. */
  setPresence(share: number): void {
    this.presence = Math.max(0, Math.min(1, share));
  }

  /** True while the stadium's gate is on screen. The sound of a game is loudest there. */
  get stadiumSeen(): boolean {
    const stop = this.stadiumStop;
    return !!stop && this.inView(this.scene.cameras.main.worldView, stop.cell.x + 0.5, stop.cell.y + 0.5, 200);
  }

  setWeekend(weekend: boolean): void {
    this.weekend = weekend;
  }

  /** The crowd step to show: 0 is sparse, 1 Low, 2 Normal, 3 High. */
  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** Walkers wait at the kerb while this says a car is on the crossing ahead. */
  watchCars(busy: (cell: number) => boolean): void {
    this.carOn = busy;
  }

  /** How much things sway in the wind. 0 with Reduce effects on. */
  setWind(wind: number): void {
    this.wind = wind;
  }

  /** Everyone on screen now: students, staff, visitors and neighbours. */
  get onScreen(): number {
    return this.seenAll;
  }

  /** Is this spot on the road itself, at a crossing or a junction? */
  private onRoad(x: number, y: number): boolean {
    const cell = Math.floor(y) * this.width + Math.floor(x);
    if (this.isCrossing[cell]) return true;
    return !!this.plan && onRoadway(this.plan, x, y) >= 0;
  }

  /** True while somebody is walking over that crossing, or stepping onto it. */
  onCrossing(cell: number): boolean {
    return this.crossingNow.has(cell);
  }

  // ------------------------------------------------------------- the map --

  /** Read the paths, buildings, quads and the town again. Called whenever the map changes. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings } = state.map;
    this.width = width;
    this.height = height;
    // The crowd drawn follows the real enrollment, up to the limits that already hold it: the Crowd density setting, the caps of each step and the frame budget (DESIGN.md 35.9).
    this.students = enrollment(state);
    const onBooks = peopleCounts(state);
    this.faculty = onBooks.faculty;
    this.staffOnBooks = onBooks.staff;
    this.isPath = cells.map((cell) => isPathKind(cell.kind));
    this.isStreet = cells.map((cell) => cell.kind === 'street');
    this.isCrossing = cells.map((cell) => cell.kind === 'crossing');
    this.plan = planTraffic(this.width, this.height, cells.map((cell) => cell.kind), TOWN_X);
    this.isWalk = cells.map((cell, i) => this.isPath[i]! || cell.kind === 'street');
    this.pathCells = this.isPath.reduce((n, yes) => n + (yes ? 1 : 0), 0);

    const doorOf = (x: number, y: number): number => {
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (this.isPath[ny * width + nx]) return ny * width + nx;
      }
      return -1;
    };

    this.state = state;
    this.everyone = sampleStudents(state);
    this.offCampus = [];
    this.residents.clear();
    this.homes.clear();
    const housing = placeIndex(state, 'housing');
    for (const ref of this.everyone) {
      const home = studentHome(state, ref, housing);
      if (home === null) {
        this.offCampus.push(ref);
        continue;
      }
      this.homes.set(studentKey(ref), home);
      const list = this.residents.get(home);
      if (list) list.push(ref);
      else this.residents.set(home, [ref]);
    }

    this.stops = [];
    this.stadiumStop = null;
    this.gates = [];
    this.stopAt.clear();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cell = cells[i]!;
        if (cell.kind === 'lot' && cell.buildingId !== null) {
          const building = buildings[cell.buildingId];
          if (!building || building.stage < 1) continue;
          const door = doorOf(x, y);
          if (door >= 0) {
            const stop: Stop = { kind: 'building', zone: building.zone, cell: { x, y }, door };
            this.stops.push(stop);
            this.stopAt.set(i, stop);
          }
        } else if (cell.kind === 'quad') {
          const door = doorOf(x, y);
          if (door >= 0) this.stops.push({ kind: 'quad', zone: null, cell: { x, y }, door });
        } else if (isPathKind(cell.kind)) {
          // A path that stops dead is a way onto campus.
          let links = 0;
          for (const [dx, dy] of NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && this.isPath[ny * width + nx]) links += 1;
          }
          if (links === 1) this.gates.push({ kind: 'gate', zone: null, cell: { x, y }, door: i });
        }
      }
    }

    // Places to eat, shop, sit and play, when a path reaches them.
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const spec = PLACED[placed.type];
      // Places to go: not ponds, car parks, bins, the yard, or the offices people are sent from. The
      // Administration building is where staff work: they go there, and students do not.
      if (['water', 'parking', 'bin', 'yard', 'medical', 'safety'].includes(spec.family)) continue;
      // The stadium is somewhere to go on a home game day only. Its gate is the path cell beside the plot.
      if (spec.family === 'athletics') {
        for (let cy = placed.y; cy < placed.y + placed.h && !this.stadiumStop; cy++) {
          for (let cx = placed.x; cx < placed.x + placed.w && !this.stadiumStop; cx++) {
            const door = doorOf(cx, cy);
            if (door >= 0) this.stadiumStop = { kind: 'place', name: 'the stadium', use: 'play', zone: null, cell: { x: cx, y: cy }, door, placedId: placed.id, family: spec.family };
          }
        }
        continue;
      }
      if (spec.family === 'landmark' && placed.type !== 'admin') continue;
      const use: Use =
        spec.family === 'landmark' ? 'office' : spec.family === 'recreation' ? 'play' : spec.family === 'seat' ? 'seat' : spec.family === 'dining' || spec.family === 'store' ? 'food' : 'other';
      let found = false;
      for (let cy = placed.y; cy < placed.y + placed.h && !found; cy++) {
        for (let cx = placed.x; cx < placed.x + placed.w && !found; cx++) {
          const door = doorOf(cx, cy);
          if (door < 0) continue;
          this.stops.push({
            kind: 'place',
            name: spec.name,
            use,
            flat: spec.flat,
            zone: null,
            cell: { x: cx, y: cy },
            door,
            middle: { x: placed.x + placed.w / 2, y: placed.y + placed.h / 2 },
            placedId: placed.id,
            family: spec.family,
          });
          found = true;
        }
      }
    }

    // The town: every house, and the ones students walk in from.
    this.houses = [];
    this.commuterHouses = [];
    this.walkingIn = 0;
    const living = townLiving(state);
    for (const hood of state.map.town.neighbourhoods) {
      const here = living[hood.id];
      const walks = !!here && here.mode === 'walk' && here.living > 0;
      if (walks) this.walkingIn += here.living;
      hood.plots.forEach((plot, n) => {
        const door = hood.row * width + plot.x;
        if (!this.isStreet[door]) return;
        const stop: Stop = { kind: 'house', zone: null, cell: { x: plot.x, y: plot.y }, door, row: hood.row, hood: hood.id, commuters: walks && n < (here?.houses ?? 0) };
        this.houses.push(stop);
        if (stop.commuters) this.commuterHouses.push(stop);
      });
    }

    // Anyone whose way ahead was dug up leaves quietly.
    for (const walker of this.walkers) {
      for (let k = walker.leg; k < walker.route.length - 1; k++) {
        const spot = walker.route[k]!;
        if (!this.isWalk[Math.floor(spot.y) * width + Math.floor(spot.x)]) {
          walker.fading = 'out';
          break;
        }
      }
    }
  }

  /** New students moving in: a group walks in from the edge of campus to the dorms. */
  arrive(count: number): Array<{ x: number; y: number }> {
    if (!this.people || count <= 0) return [];
    const homes = this.stops.filter((stop) => stop.zone === 'housing');
    if (homes.length === 0) return [];

    const view = this.scene.cameras.main.worldView;
    const centre = { x: view.centerX, y: view.centerY };
    const distance = (stop: Stop): number => {
      const at = this.iso.toWorld(stop.cell.x + 0.5, stop.cell.y + 0.5);
      return Math.hypot(at.x - centre.x, at.y - centre.y);
    };
    // Come in by the way onto campus nearest to where the player is looking.
    const ways = this.gates.length > 0 ? this.gates : this.stops;
    const gate = [...ways].sort((a, b) => distance(a) - distance(b))[0];
    if (!gate) return [];

    const near = [...homes].sort((a, b) => distance(a) - distance(b)).slice(0, 6);
    const size = Phaser.Math.Clamp(Math.round(count / 6), 3, 18);
    const year = this.everyone[0]?.entryYear ?? 0;
    const taken = new Set<string>();
    for (let n = 0; n < size; n++) {
      const to = pick(near);
      if (!to) continue;
      let student: StudentRef | null = null;
      if (this.everyone.length > 0) {
        // The newest students who live in that dorm.
        const free = (this.residents.get(to.cell.y * this.width + to.cell.x) ?? []).filter(
          (ref) => this.free(ref) && !taken.has(studentKey(ref)),
        );
        const newest = free.filter((ref) => ref.entryYear === year);
        student = pick(newest.length > 0 ? newest : free) ?? null;
        if (!student) continue;
        taken.add(studentKey(student));
      }
      this.queue.push({ from: gate, to, inMs: n * 230, student });
      // Move-in day: every third newcomer has a parent beside them with the boxes. Nobody can carry anything,
      // so the boxes are drawn at the parent's side.
      const parent = this.people.roles?.parent;
      if (parent !== undefined && n % 3 === 0) {
        const who = Math.floor(Math.random() * 100_000);
        this.queue.push({ from: gate, to, inMs: n * 230 + 320, student: null, kind: 'parent', extra: { person: { role: 'parent', n: who }, look: parent + (who % 2), prop: 'people.boxes' } });
      }
    }

    const at = this.iso.toWorld(gate.cell.x + 0.5, gate.cell.y + 0.5);
    const text = this.scene.add
      .text(at.x, at.y - 40, `+${count} moving in`, {
        fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#16201b',
        strokeThickness: 7,
      })
      .setOrigin(0.5, 1)
      .setDepth(1_000_002);
    this.banners.push({ text, ageMs: 0 });
    // The dorms they are walking to, where the boxes are stacked.
    return near.map((stop) => ({ x: stop.cell.x, y: stop.cell.y }));
  }

  // -------------------------------------------------------------- routes --

  /** Cells from one door to another over a set of walkable cells, or null when they do not join. */
  private pathBetween(from: number, to: number, walkable: readonly boolean[]): number[] | null {
    if (from === to) return [from];
    const { width, height } = this;
    const parent = new Int32Array(width * height).fill(-1);
    const queue = [from];
    parent[from] = from;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      if (i === to) break;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!walkable[ni] || parent[ni] !== -1) continue;
        parent[ni] = i;
        queue.push(ni);
      }
    }
    if (parent[to] === -1) return null;
    const cells = [to];
    while (cells[cells.length - 1] !== from) cells.push(parent[cells[cells.length - 1]!]!);
    return cells.reverse();
  }

  /** The point where a stop meets its door: the edge of a lot, a spot on the lawn, a front garden, or the gate itself. */
  private threshold(stop: Stop): Spot {
    const door = { x: (stop.door % this.width) + 0.5, y: Math.floor(stop.door / this.width) + 0.5 };
    if (stop.kind === 'gate') return door;
    const centre = { x: stop.cell.x + 0.5, y: stop.cell.y + 0.5 };
    if (stop.kind === 'house') return { x: centre.x, y: centre.y + (door.y - centre.y) * 0.3 };
    // Buildings are entered at their edge. On a quad, people stop on the near part of the lawn.
    const reach = stop.kind === 'quad' || stop.kind === 'place' ? 0.62 + Math.random() * 0.16 : 0.52;
    return { x: door.x + (centre.x - door.x) * reach, y: door.y + (centre.y - door.y) * reach };
  }

  /** Where someone walks on a cell: to one side of a path, and along the sidewalk of a street. */
  private footing(cell: number, side: Spot, sidewalk: number): Spot {
    const x = cell % this.width;
    const y = (cell - x) / this.width;
    if (!this.isStreet[cell]) return { x: x + 0.5 + side.x, y: y + 0.5 + side.y };
    // The avenue runs up and down beside the campus: its campus side. A side street runs away from it.
    if (x <= TOWN_X) return { x: x + KERB_NEAR, y: y + 0.5 + side.y * 0.4 };
    return { x: x + 0.5 + side.x * 0.4, y: y + 0.5 + sidewalk * SIDEWALK };
  }

  private routeBetween(from: Stop, to: Stop): Spot[] | null {
    const town = from.kind === 'house' || to.kind === 'house';
    const cells = this.pathBetween(from.door, to.door, town ? this.isWalk : this.isPath);
    if (!cells || cells.length > (town ? MAX_COMMUTE_CELLS : MAX_ROUTE_CELLS)) return null;
    // Each walker keeps a little to one side, so a crowd is not a single file.
    const side = { x: (Math.random() - 0.5) * 0.44, y: (Math.random() - 0.5) * 0.44 };
    // On a street they keep to the sidewalk of the house they are leaving or going to on that street, so nobody
    // crosses a street in the middle of a block.
    const rows = new Map<number, number>();
    for (const house of [from, to]) if (house.kind === 'house' && house.row !== undefined) rows.set(house.row, sideOf(house));
    const any = Math.random() < 0.5 ? -1 : 1;
    const route: Spot[] = [this.threshold(from)];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const x = i % this.width;
      const y = (i - x) / this.width;
      // Where a side street meets the avenue they cross at the marked crossing beside the junction, not through it.
      if (this.plan && this.isStreet[i] && x === TOWN_X && (cells[k - 1] === i + 1 || cells[k + 1] === i + 1)) {
        const sidewalk = rows.get(y) ?? any;
        route.push(...(cells[k - 1] === i + 1 ? avenueCrossing(this.plan, y, sidewalk, SIDEWALK) : avenueCrossingBack(this.plan, y, sidewalk, SIDEWALK)));
        continue;
      }
      route.push(this.footing(i, side, rows.get(y) ?? any));
    }
    // People walk right onto a court or a field, to its middle. Anywhere else they stop at the edge.
    if (to.kind === 'place' && to.use === 'play' && to.flat && to.middle) {
      route.push({ x: to.middle.x + (Math.random() - 0.5) * 0.6, y: to.middle.y + (Math.random() - 0.5) * 0.6 });
    } else route.push(this.threshold(to));
    return route;
  }

  /** A student to step out of a stop: someone who lives there, when it is a dorm. */
  /** True for a student who is not on the map already: not out walking, and not standing in an activity or a scene. */
  private free(ref: StudentRef): boolean {
    const key = studentKey(ref);
    return !this.out.has(key) && !this.elsewhere.has(key);
  }

  /** Told by the map: who is standing in an activity or a small scene. */
  setElsewhere(staying: ReadonlySet<string>): void {
    this.elsewhere = staying;
  }

  /** True while that student is out walking. */
  isOut(key: string): boolean {
    return this.out.has(key);
  }

  private studentFor(from: Stop): StudentRef | null {
    if (from.zone === 'housing') {
      const here = this.residents.get(from.cell.y * this.width + from.cell.x) ?? [];
      return pick(here.filter((ref) => this.free(ref))) ?? null;
    }
    for (let tries = 0; tries < 8; tries++) {
      const ref = pick(this.everyone);
      if (ref && this.free(ref)) return ref;
    }
    return null;
  }

  /**
   * Somewhere to go next. Mornings are for class. Afternoons and evenings fill
   * the courts, the gym and the dining halls. At night people go home. A
   * student only ever goes home to their own dorm.
   */
  private destinationFrom(origin: Stop, student: StudentRef | null): Stop | undefined {
    // A home game: most of the campus is on its way to the stadium.
    if (this.fanTint !== null && this.stadiumStop && origin !== this.stadiumStop && Math.random() < FAN_SHARE) return this.stadiumStop;
    const others = this.stops.filter((stop) => stop !== origin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const quads = others.filter((stop) => stop.kind === 'quad');
    const places = others.filter((stop) => stop.kind === 'place');
    const play = places.filter((stop) => stop.use === 'play');
    const food = places.filter((stop) => stop.use === 'food');
    // Benches and tables are empty at night. A library or a store counts as somewhere to be.
    const sit = [...places.filter((stop) => (stop.use === 'seat' && this.period !== 'night') || stop.use === 'other'), ...quads];
    let homes: Stop[];
    if (student) {
      const home = this.stopAt.get(this.homes.get(studentKey(student)) ?? -1);
      homes = home && home !== origin ? [home] : [];
    } else {
      homes = others.filter((stop) => stop.zone === 'housing');
    }
    const from = origin.zone === 'housing' ? 'home' : origin.zone === 'academic' ? 'class' : 'out';
    let choice: readonly Stop[];
    if (this.period === 'morning') {
      // The rush: nearly everyone is on the way to class.
      if (from === 'home') choice = pickWeighted([[classes, 85], [food, 10], [sit, 5]]);
      else if (from === 'class') choice = pickWeighted([[classes, 60], [homes, 15], [food, 15], [sit, 10]]);
      else choice = pickWeighted([[classes, 80], [homes, 20]]);
    } else if (this.period === 'afternoon') {
      // Classes still, and the courts and fields fill up.
      if (from === 'home') choice = pickWeighted([[classes, 45], [play, 25], [food, 15], [sit, 15]]);
      else if (from === 'class') choice = pickWeighted([[homes, 30], [classes, 25], [play, 22], [food, 13], [sit, 10]]);
      else choice = pickWeighted([[classes, 35], [homes, 35], [play, 20], [sit, 10]]);
    } else if (this.period === 'evening') {
      // Dinner, the gym, a game. Few are going to class.
      if (from === 'home') choice = pickWeighted([[play, 40], [food, 30], [sit, 20], [classes, 10]]);
      else if (from === 'class') choice = pickWeighted([[homes, 45], [play, 30], [food, 25]]);
      else choice = pickWeighted([[homes, 55], [play, 25], [food, 20]]);
    } else if (from === 'home') {
      // Night: a few head to a night class, the library or a late bite. Everyone else is going home.
      choice = pickWeighted([[classes, 40], [food, 40], [sit, 20]]);
    } else choice = pickWeighted([[homes, 85], [food, 15]]);
    if (choice.length === 0) choice = classes.length > 0 ? classes : quads.length > 0 ? quads : homes;
    return pick(choice);
  }

  // ------------------------------------------------------------- walkers --

  private inView(view: Phaser.Geom.Rectangle, x: number, y: number, margin: number): boolean {
    const at = this.iso.toWorld(x, y);
    return (
      at.x >= view.x - margin && at.x <= view.right + margin && at.y >= view.y - margin && at.y <= view.bottom + margin
    );
  }

  private start(from: Stop, to: Stop, partWay: boolean, student: StudentRef | null, kind: Walker['kind'] = 'student', extra: Extra = {}): boolean {
    const people = this.people;
    if (!people || this.walkers.length >= CROWD_STEPS[this.step]!.alive) return false;
    // Nobody is in two places: a student by who they are, anyone else by their own card.
    const key = student ? studentKey(student) : extra.person ? `p:${personKey(extra.person)}` : null;
    if (key !== null && (this.out.has(key) || this.elsewhere.has(key))) return false;
    const route = extra.route ?? this.routeBetween(from, to);
    if (!route || route.length < 2) return false;
    const looks = Math.min(people.looks, people.crowd ?? people.looks);
    if (key !== null) this.out.add(key);

    const sprite = this.pool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
    sprite.setVisible(true).setAlpha(0);
    let prop: Phaser.GameObjects.Image | null = null;
    if (extra.prop && this.art.has(extra.prop)) {
      prop = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(prop, extra.prop);
      // It stands on its own base, so it can sway about it.
      prop.setOrigin(0.5, 1).setAlpha(0);
    }
    // Someone already part of the way along, so a view fills with people mid-stride.
    const leg = partWay ? 1 + Math.floor(Math.random() * Math.max(1, route.length - 2)) : 1;
    const begin = route[leg - 1]!;
    this.walkers.push({
      sprite,
      kind,
      student,
      person: extra.person ?? null,
      prop,
      key,
      // A student's look is part of who they are. Anyone with a job wears it.
      look: extra.look ?? (student && this.state ? studentFigure(this.state, student, looks, this.people?.roles?.athlete) : Math.floor(Math.random() * looks)),
      from,
      route,
      leg,
      x: begin.x,
      y: begin.y,
      pace: extra.pace ?? PACE * (kind === 'neighbour' ? 0.9 : HURRY[this.period]) * (0.8 + Math.random() * 0.45),
      direction: 'se',
      stride: Math.random() * 1000,
      alpha: 0,
      fading: 'in',
      lingerMs: 0,
      goal: to,
      offscreenMs: 0,
      shownKey: '',
      tinted: false,
    });
    sprite.clearTint();
    return true;
  }

  private retire(index: number): void {
    const walker = this.walkers[index]!;
    if (walker.key !== null) this.out.delete(walker.key);
    if (walker.key !== null && walker.key === this.marked) this.ring?.setVisible(false);
    walker.sprite.setVisible(false);
    walker.prop?.destroy();
    this.pool.push(walker.sprite);
    this.walkers.splice(index, 1);
  }

  private draw(walker: Walker, people: PeopleSpec): void {
    const flipFrom = people.flip?.[walker.direction];
    const facing = flipFrom ?? walker.direction;
    const frame = walker.lingerMs > 0 ? 0 : Math.floor(walker.stride / people.frameMs) % people.frames;
    const key = `person.${walker.look}.${facing}.${frame}`;
    if (key !== walker.shownKey) {
      this.art.apply(walker.sprite, key);
      walker.shownKey = key;
    }
    walker.sprite.setFlipX(flipFrom !== undefined);
    const at = this.iso.toWorld(walker.x, walker.y);
    walker.sprite.setPosition(at.x, at.y);
    // Just above the ground of the cell underfoot, and below anything on the next cell forward.
    walker.sprite.setDepth((walker.x + walker.y - 1) * 4 + 2.5);
    walker.sprite.setAlpha(walker.alpha);
    // A fan on the way to the game wears the school's colour: the figure itself is tinted, since none has a scarf.
    const fan = this.fanTint !== null && walker.kind === 'student' && walker.goal === this.stadiumStop;
    if (fan !== walker.tinted) {
      walker.tinted = fan;
      if (fan) walker.sprite.setTint(this.fanTint!);
      else walker.sprite.clearTint();
    }
    if (walker.prop) {
      // Beside them: no figure in the pack can hold anything. A pennant moves in the wind.
      const beside = this.iso.toWorld(walker.x + 0.2, walker.y + 0.04);
      const sway = walker.kind === 'guide' ? Math.sin(this.scene.time.now / 420 + walker.stride / 400) * 0.1 * this.wind : 0;
      walker.prop.setPosition(beside.x, beside.y).setRotation(sway).setDepth(walker.sprite.depth + 0.05).setAlpha(walker.alpha);
    }
    if (walker.key !== null && walker.key === this.marked) {
      // A ring on the ground under the student whose card is open.
      const ring = this.ring ?? this.scene.add.ellipse(0, 0, 10, 10).setStrokeStyle(3, 0xffd24a, 1);
      this.ring = ring;
      ring.setSize(this.iso.halfWidth * 0.62, this.iso.halfHeight * 0.62);
      ring.setPosition(at.x, at.y).setDepth(walker.sprite.depth - 0.2).setVisible(true).setAlpha(walker.alpha);
    }
  }

  // ------------------------------------------------------- student cards --

  /**
   * The walker at a point of the world, or null. `reach` widens each sprite,
   * because a walker is a small thing to hit with a thumb.
   */
  walkerAt(worldX: number, worldY: number, reach: number): { student: StudentRef | null; person: PersonRef | null; neighbour: boolean; far: number } | null {
    let found: Walker | null = null;
    let nearest = Infinity;
    for (const walker of this.walkers) {
      if (walker.fading === 'out') continue;
      const box = walker.sprite.getBounds();
      if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > box.bottom + reach) continue;
      const far = Math.hypot(worldX - box.centerX, worldY - box.centerY);
      if (far < nearest) {
        nearest = far;
        found = walker;
      }
    }
    return found ? { student: found.student, person: found.person, neighbour: found.kind === 'neighbour', far: nearest } : null;
  }

  private walkerOf(key: string): Walker | undefined {
    return this.walkers.find((walker) => walker.key === key && walker.fading !== 'out');
  }

  /** What that student is doing right now, or null when they are not out walking. */
  doing(key: string): Doing | null {
    const walker = this.walkerOf(key);
    if (!walker || !walker.goal) return null;
    if (walker.goal.kind === 'house') return 'walkingHome';
    if (walker.from.kind === 'house') return 'walkingIn';
    if (walker.goal.kind === 'place') return walker.lingerMs > 0 ? `atPlace:${walker.goal.name ?? ''}` : `toPlace:${walker.goal.name ?? ''}`;
    if (walker.lingerMs > 0) return 'onQuad';
    if (walker.goal.kind === 'quad') return 'toQuad';
    if (walker.goal.zone === 'academic') return walker.from.zone === 'academic' ? 'nextClass' : 'toClass';
    return walker.from.kind === 'gate' ? 'movingIn' : 'toDorm';
  }

  /** Where that student is in the world, for the camera to follow. */
  spot(key: string): { x: number; y: number } | null {
    const walker = this.walkerOf(key);
    return walker ? this.iso.toWorld(walker.x, walker.y) : null;
  }

  /** The students out walking, nearest to a point of the world first. For the dev screenshot helper. */
  studentsNear(worldX: number, worldY: number): StudentRef[] {
    const far = (walker: Walker): number => {
      const at = this.iso.toWorld(walker.x, walker.y);
      return Math.hypot(at.x - worldX, at.y - worldY);
    };
    return this.walkers
      .filter((walker) => walker.student !== null && walker.fading !== 'out')
      .sort((a, b) => far(a) - far(b))
      .map((walker) => walker.student!);
  }

  /** The people who are not students and are out walking, nearest to a point of the world first. For the dev screenshot helper. */
  peopleNear(worldX: number, worldY: number): PersonRef[] {
    const far = (walker: Walker): number => {
      const at = this.iso.toWorld(walker.x, walker.y);
      return Math.hypot(at.x - worldX, at.y - worldY);
    };
    return this.walkers
      .filter((walker) => walker.person !== null && walker.fading !== 'out')
      .sort((a, b) => far(a) - far(b))
      .map((walker) => walker.person!);
  }

  /** Ring the walker whose card is open: a student by their key, anyone else by `p:` and their own. */
  setMarked(key: string | null): void {
    this.marked = key;
    if (key === null || !this.walkerOf(key)) this.ring?.setVisible(false);
  }

  // ---------------------------------------------------------------- town --

  /**
   * Keep the walk in from town going, and the neighbours on their streets.
   * These are a small, steady number who walk their whole way whether or not
   * they are on screen: a stream is only a stream if it does not stop when
   * the player looks away.
   */
  private topUpTown(): void {
    const scale = CROWD_STEPS[this.step]!.traffic;
    // Commuters: students who live on a street a path joins to campus.
    const classes = this.stops.filter((stop) => stop.zone === 'academic');
    if (this.commuterHouses.length > 0 && classes.length > 0 && this.walkingIn > 0) {
      const flow = COMMUTE[this.period];
      const wanted = Math.min(MAX_COMMUTERS, Math.round((this.walkingIn / WALKERS_IN_PER_COMMUTER) * flow.busy * scale * (this.weekend ? 0.4 : 1)));
      let out = 0;
      for (const walker of this.walkers) if (walker.kind === 'commuter') out += 1;
      if (out < Math.max(wanted, this.period === 'night' ? 0 : 1)) {
        const house = pick(this.commuterHouses)!;
        const hall = pick(classes)!;
        const student = this.offCampus.length > 0 ? pick(this.offCampus.filter((ref) => this.free(ref))) ?? null : null;
        const inbound = Math.random() < flow.inbound;
        // A stream that has only just begun is seeded along its length, so the street is not empty.
        if (student || this.offCampus.length === 0) this.start(inbound ? house : hall, inbound ? hall : house, out < wanted * 0.5, student, 'commuter');
      }
    }
    // Neighbours: never students, and there whether or not a path joins the town.
    if (this.houses.length > 1) {
      const wanted = Math.round(NEIGHBOURS_OUT[this.period] * scale);
      let out = 0;
      for (const walker of this.walkers) if (walker.kind === 'neighbour') out += 1;
      if (out < wanted) {
        const from = pick(this.houses)!;
        // Mostly to a house on the same street or the next: a short walk, not a march across town.
        const near = this.houses.filter((house) => house !== from && Math.abs((house.row ?? 0) - (from.row ?? 0)) <= 6 && (house.row !== from.row || sideOf(house) === sideOf(from)));
        const to = pick(near.length > 0 ? near : this.houses.filter((house) => house.row !== from.row || sideOf(house) === sideOf(from)));
        // A neighbour wears one of the two looks kept for the town, and has a card: who they are follows their house.
        const townie = this.people?.roles?.townie;
        const n = from.cell.y * this.width + from.cell.x;
        const extra: Extra = townie === undefined || from.hood === undefined ? {} : { person: { role: 'townie', n, at: from.hood }, look: townie + (n % 2) };
        if (to && to !== from) this.start(from, to, out < wanted * 0.6, null, 'neighbour', extra);
      }
    }
  }

  /** Somewhere for a professor or a member of staff to be going. */
  private workDestination(kind: 'professor' | 'staff', origin: Stop): Stop | undefined {
    const others = this.stops.filter((stop) => stop !== origin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const dorms = others.filter((stop) => stop.zone === 'housing');
    const quads = others.filter((stop) => stop.kind === 'quad');
    const places = others.filter((stop) => stop.kind === 'place');
    const food = places.filter((stop) => stop.family === 'dining');
    const office = places.filter((stop) => stop.use === 'office');
    const books = places.filter((stop) => stop.family === 'library' || stop.family === 'tutoring');
    const lunch = this.period === 'afternoon' ? 22 : 10;
    const choice =
      kind === 'professor'
        ? pickWeighted([[classes, 55], [books, 15], [food, lunch], [office, 8], [quads, 5]])
        : pickWeighted([[office, 30], [classes, 25], [food, lunch], [dorms, 15], [quads, 10]]);
    return pick(choice.length > 0 ? choice : classes.length > 0 ? classes : others);
  }

  /** A guide with a pennant and two parents behind, on a walk round the campus and back to where they came in. */
  private startTour(here: readonly Stop[]): boolean {
    const roles = this.people?.roles;
    if (!roles || roles.guide === undefined || roles.parent === undefined) return false;
    // They set out where the player is looking: from a way onto campus when one is in view, or from any door.
    const gatesHere = this.gates.filter((gate) => here.some((stop) => stop.door === gate.door));
    const begin = pick(gatesHere.length > 0 ? gatesHere : here.filter((stop) => stop.kind !== 'quad'));
    if (!begin) return false;
    const others = this.stops.filter((stop) => stop !== begin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const dorms = others.filter((stop) => stop.zone === 'housing');
    const sights = others.filter((stop) => stop.kind === 'quad' || (stop.kind === 'place' && stop.use !== 'seat'));
    // A lecture hall, something worth seeing, a dorm, and back.
    const calls = [pick(classes), pick(sights), pick(dorms)].filter((stop): stop is Stop => !!stop);
    const route: Spot[] = [];
    let at = begin;
    for (const next of [...calls, begin]) {
      if (next === at) continue;
      const leg = this.routeBetween(at, next);
      if (!leg) continue;
      route.push(...(route.length === 0 ? leg : leg.slice(1)));
      at = next;
    }
    if (route.length < 4) return false;
    const tour = Math.floor(Math.random() * 100_000);
    const led = this.start(begin, begin, false, null, 'guide', {
      person: { role: 'guide', n: tour % Math.max(1, this.staffOnBooks) },
      look: roles.guide,
      route,
      pace: PACE * TOUR_PACE,
      prop: 'people.pennant',
    });
    if (!led) return false;
    for (let k = 1; k < TOUR_SIZE; k++) {
      const n = tour * 2 + k;
      this.queue.push({
        from: begin,
        to: begin,
        inMs: k * TOUR_GAP_MS,
        student: null,
        kind: 'parent',
        extra: { person: { role: 'parent', n }, look: roles.parent + (n % 2), route: route.map((spot) => ({ ...spot })), pace: PACE * TOUR_PACE },
      });
    }
    return true;
  }

  /**
   * Keep the people who are not students among the crowd: professors and
   * staff by day, visitors at weekends. How many is a plain rule (see
   * `othersWanted`): what the payroll has for each student, and never more
   * than about a quarter of the people on screen.
   */
  private topUpOthers(here: readonly Stop[], studentsSeen: number, neighboursSeen: number): void {
    const roles = this.people?.roles;
    if (!roles || roles.professor === undefined || this.students <= 0) return;
    const want = othersWanted({ studentsInView: studentsSeen, students: this.students, faculty: this.faculty, staff: this.staffOnBooks, period: this.period, weekend: this.weekend });
    let professors = 0;
    let staff = 0;
    let tours = 0;
    let boosters = 0;
    let people = 0;
    for (const walker of this.walkers) {
      if (walker.fading === 'out') continue;
      if (walker.kind === 'professor') professors += 1;
      else if (walker.kind === 'staff') staff += 1;
      else if (walker.kind === 'guide') tours += 1;
      else if (walker.kind === 'booster') boosters += 1;
      else if (walker.kind !== 'parent') continue;
      people += 1;
    }
    for (const waiting of this.queue) if (waiting.kind === 'parent') people += 1;
    // A neighbour who has wandered into view counts against the share too.
    const room = Math.floor(studentsSeen / 3) - people - neighboursSeen;
    if (room <= 0) return;

    // One newcomer at a time. A kind that cannot be started just now does not hold up the next.
    if (professors < want.professors) {
      const origin = pick(here.filter((stop) => stop.zone === 'academic' || stop.family === 'library')) ?? pick(here.filter((stop) => stop.kind === 'building'));
      const to = origin ? this.workDestination('professor', origin) : undefined;
      const n = Math.floor(Math.random() * Math.max(1, this.faculty));
      if (origin && to && this.start(origin, to, professors < want.professors * 0.6, null, 'professor', { person: { role: 'professor', n }, look: roles.professor })) return;
    }
    if (staff < want.staff) {
      const origin = pick(here.filter((stop) => stop.kind === 'building' || (stop.kind === 'place' && (stop.use === 'office' || stop.use === 'food'))));
      const to = origin ? this.workDestination('staff', origin) : undefined;
      // Whose they are follows where they step out from: a kitchen, the store, or an office.
      let person: PersonRef = { role: 'advisor', n: Math.floor(Math.random() * Math.max(1, this.staffOnBooks)) };
      let look = roles.advisor;
      if (origin?.family === 'dining' && origin.placedId !== undefined && roles.chef !== undefined) {
        person = { role: 'chef', n: 0, at: origin.placedId };
        look = roles.chef;
      } else if (origin?.family === 'store' && origin.placedId !== undefined && roles.clerk !== undefined) {
        person = { role: 'clerk', n: 0, at: origin.placedId };
        look = roles.clerk;
      }
      if (origin && to && look !== undefined && this.start(origin, to, staff < want.staff * 0.6, null, 'staff', { person, look })) return;
    }
    if (tours < want.tours && room >= TOUR_SIZE && this.startTour(here)) return;
    if (boosters < want.boosters && roles.booster !== undefined) {
      const from = pick(here.filter((stop) => stop.kind !== 'quad'));
      const office = this.stops.filter((stop) => stop.use === 'office');
      const to = pick(office.length > 0 ? office : this.stops.filter((stop) => stop.kind === 'quad'));
      if (from && to && from !== to) this.start(from, to, false, null, 'booster', { person: { role: 'booster', n: Math.floor(Math.random() * 60) }, look: roles.booster, pace: PACE * 0.8 });
    }
  }

  update(deltaMs: number): void {
    const people = this.people;
    if (!people) return;
    const dt = Math.min(deltaMs, 100);
    const camera = this.scene.cameras.main;
    const view = camera.worldView;

    // People due to arrive.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const arrival = this.queue[i]!;
      arrival.inMs -= dt;
      if (arrival.inMs > 0) continue;
      this.start(arrival.from, arrival.to, false, arrival.student, arrival.kind ?? 'student', arrival.extra ?? {});
      this.queue.splice(i, 1);
    }

    // Walk.
    let seen = 0;
    let neighboursSeen = 0;
    this.seenAll = 0;
    this.crossingNow.clear();
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const walker = this.walkers[i]!;

      if (walker.fading === 'in') {
        walker.alpha = Math.min(1, walker.alpha + dt / FADE_MS);
        if (walker.alpha >= 1) walker.fading = null;
      } else if (walker.fading === 'out') {
        walker.alpha -= dt / FADE_MS;
        if (walker.alpha <= 0) {
          this.retire(i);
          continue;
        }
      }

      if (walker.lingerMs > 0) {
        walker.lingerMs -= dt;
        if (walker.lingerMs <= 0 && walker.goal) {
          // Rested on the lawn. Off to the next place.
          const next = this.destinationFrom(walker.goal, walker.student);
          const route = next ? this.routeBetween(walker.goal, next) : null;
          if (next && route) {
            route[0] = { x: walker.x, y: walker.y };
            walker.route = route;
            walker.leg = 1;
            walker.from = walker.goal;
            walker.goal = next;
          } else {
            walker.fading = 'out';
          }
        }
      } else if (walker.fading !== 'out' || walker.leg < walker.route.length) {
        let step = (walker.pace * dt) / 1000;
        // At a crossing a car has, or is due, they wait at the kerb. Once on it they keep going.
        const ahead = walker.route[walker.leg];
        if (ahead) {
          const there = Math.floor(ahead.y) * this.width + Math.floor(ahead.x);
          const here = Math.floor(walker.y) * this.width + Math.floor(walker.x);
          const crossing = ahead.cross !== undefined ? ahead.cross : there !== here && this.isCrossing[there] ? there : -1;
          if (crossing >= 0 && !this.onRoad(walker.x, walker.y)) {
            if (this.carOn(crossing)) step = 0;
            // Stepping onto it: a car coming up to the line sees them this frame.
            else this.crossingNow.add(crossing);
          }
        }
        const waiting = step === 0;
        while (step > 0 && walker.leg < walker.route.length) {
          const target = walker.route[walker.leg]!;
          const dx = target.x - walker.x;
          const dy = target.y - walker.y;
          const left = Math.hypot(dx, dy);
          if (Math.abs(dx) >= Math.abs(dy)) walker.direction = dx >= 0 ? 'se' : 'nw';
          else walker.direction = dy >= 0 ? 'sw' : 'ne';
          if (left <= step) {
            walker.x = target.x;
            walker.y = target.y;
            walker.leg += 1;
            step -= left;
          } else {
            walker.x += (dx / left) * step;
            walker.y += (dy / left) * step;
            step = 0;
          }
        }
        if (!waiting) walker.stride += dt * (walker.pace / PACE);
        if (walker.leg >= walker.route.length && walker.fading !== 'out') {
          // On a lawn, at a bench or by a dining hall they stay a while. Onto a court they join the game.
          const stays = walker.goal?.kind === 'quad' || (walker.goal?.kind === 'place' && walker.goal.use !== 'play');
          if (stays && walker.kind === 'student') walker.lingerMs = 2500 + Math.random() * 5000;
          else walker.fading = 'out';
        }
      }

      const cell = Math.floor(walker.y) * this.width + Math.floor(walker.x);
      if (this.isCrossing[cell]) this.crossingNow.add(cell);
      // On the road at a town crossing or a junction: cars wait for them.
      else if (this.plan && this.isStreet[cell]) {
        const on = onRoadway(this.plan, walker.x, walker.y);
        if (on >= 0) this.crossingNow.add(on);
      }

      if (this.inView(view, walker.x, walker.y, 40)) {
        this.seenAll += 1;
        if (walker.kind === 'student') seen += 1;
        else if (walker.kind === 'neighbour') neighboursSeen += 1;
        walker.offscreenMs = 0;
      } else if (walker.kind !== 'commuter' && walker.kind !== 'neighbour') {
        // Students, and the staff and visitors among them, fill the view the player is looking at. The few
        // who walk the town keep going unseen.
        walker.offscreenMs += dt;
        if (walker.offscreenMs > OFFSCREEN_LIMIT_MS && this.queue.length === 0) {
          this.retire(i);
          continue;
        }
      }
      this.draw(walker, people);
    }

    // Top the view up. More students, a wider view and a higher crowd setting all mean more people.
    this.spawnClock += dt;
    if (this.spawnClock >= SPAWN_EVERY_MS) {
      this.spawnClock = 0;
      const wanted = this.wantedInView(view);
      if (seen < wanted) {
        const here = this.stops.filter((stop) => this.inView(view, stop.cell.x + 0.5, stop.cell.y + 0.5, 0));
        // A big gap is closed several walkers at a time, so a busy campus does not take a minute to fill.
        const batch = Math.max(1, Math.min(6, Math.ceil((wanted - seen) / 10)));
        for (let n = 0; n < batch; n++) {
          const from = pick(here);
          // Once there are students, every walker is one of them. Before that, staff.
          const student = from ? this.studentFor(from) : null;
          const to = from && (student || this.everyone.length === 0) ? this.destinationFrom(from, student) : undefined;
          // An emptier view is filled with people already on their way.
          if (from && to) this.start(from, to, seen < wanted * 0.6, student);
        }
      }
      // And among them, the people who work here or are visiting.
      this.topUpOthers(this.stops.filter((stop) => this.inView(view, stop.cell.x + 0.5, stop.cell.y + 0.5, 0)), seen, neighboursSeen);
    }
    this.townClock += dt;
    if (this.townClock >= 450) {
      this.townClock = 0;
      this.topUpTown();
    }

    // "+24 moving in" floats up and fades.
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const banner = this.banners[i]!;
      banner.ageMs += dt;
      const life = banner.ageMs / 3200;
      // About 15 px tall on screen at any zoom. The canvas is drawn at the screen's own pixel density.
      banner.text.setScale(0.5 / this.scene.scale.zoom / camera.zoom);
      banner.text.y -= (dt / 1000) * 14;
      banner.text.setAlpha(life < 0.7 ? 1 : Math.max(0, 1 - (life - 0.7) / 0.3));
      if (life >= 1) {
        banner.text.destroy();
        this.banners.splice(i, 1);
      }
    }
  }

  private wantedInView(view: Phaser.Geom.Rectangle): number {
    if (this.stops.length === 0 || this.pathCells === 0) return 0;
    let visible = 0;
    for (let i = 0; i < this.isPath.length; i++) {
      if (!this.isPath[i]) continue;
      const x = i % this.width;
      if (this.inView(view, x + 0.5, (i - x) / this.width + 0.5, 0)) visible += 1;
    }
    const wanted = walkersWanted({ students: this.students, pathCells: this.pathCells, visiblePathCells: visible, period: this.period, weekend: this.weekend, step: this.step });
    // Fewer on a break, half as many again on a home game day, and never an empty campus.
    return Math.max(Math.min(wanted, 3), Math.round(wanted * this.presence * (this.fanTint !== null ? GAME_DAY_CROWD : 1)));
  }

  /** How many walkers are alive. For tests and the dev console. */
  get count(): number {
    return this.walkers.length;
  }

  /** How many of each kind are out. For the dev readout. */
  get counts(): { students: number; commuters: number; neighbours: number; professors: number; staff: number; visitors: number } {
    const counts = { students: 0, commuters: 0, neighbours: 0, professors: 0, staff: 0, visitors: 0 };
    for (const walker of this.walkers) {
      const kind = walker.kind;
      counts[kind === 'student' ? 'students' : kind === 'commuter' ? 'commuters' : kind === 'neighbour' ? 'neighbours' : kind === 'professor' ? 'professors' : kind === 'staff' ? 'staff' : 'visitors'] += 1;
    }
    return counts;
  }

  clear(): void {
    for (const walker of this.walkers) walker.prop?.destroy();
    for (const walker of this.walkers) walker.sprite.destroy();
    for (const sprite of this.pool) sprite.destroy();
    for (const banner of this.banners) banner.text.destroy();
    this.ring?.destroy();
    this.ring = null;
    this.out.clear();
    this.crossingNow.clear();
    this.walkers = [];
    this.pool = [];
    this.banners = [];
    this.queue = [];
    this.stops = [];
    this.gates = [];
    this.houses = [];
    this.commuterHouses = [];
  }
}
