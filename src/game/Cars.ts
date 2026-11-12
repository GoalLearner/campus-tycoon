import Phaser from 'phaser';
import { CROWD_STEPS } from '../app/crowd';
import type { DayPeriod } from '../app/daylight';
import { driversNow, hasRoadAccess, isPathKind, isRoadKind, PLACED, TOWN_X, townLiving, type GameState, placedCars } from '../sim';
import type { Art } from './art';
import type { Iso } from './iso';
import { driveways } from './townLook';

/**
 * Everything on wheels, for show.
 *
 * - Students who live too far to walk drive in: a car leaves a driveway,
 *   follows the street and the player's road, turns into a car park, and
 *   later one drives home again. How many follows how many students drive.
 * - The town has its own traffic, whether or not the campus is joined to it:
 *   neighbours driving the streets, and cars parked in driveways.
 * - A shuttle loops the roads, pausing where a road meets a path or a car
 *   park. It is scenery: the shuttle service of DESIGN.md 8.3 is not built.
 * - Delivery trucks call at dining halls and stores that have a road beside
 *   them.
 *
 * A car waits at a crossing while somebody is walking over it. That is the
 * whole of the traffic rules: there is no congestion, none of this is
 * simulation, none of it is saved, and nothing here runs while the game is
 * closed.
 */

/** Cells a second. */
const SPEED = 2.3;
const FADE_MS = 280;
const SPAWN_EVERY_MS = 650;
const MAX_STUDENT_CARS = 9;
/** One car on the road for about this many students who drive, before the time of day is counted. */
const DRIVERS_PER_CAR = 10;
/** Looks a car can have in the art. The last of them is the pack's yellow bus, which the town runs. */
const CAR_LOOKS = 7;
const SMALL_CARS = 6;

/** How busy the roads are in each part of the day, and the share of student cars heading to campus. */
const TRAFFIC: Record<DayPeriod, { busy: number; inbound: number }> = {
  morning: { busy: 1.4, inbound: 0.85 },
  afternoon: { busy: 0.8, inbound: 0.5 },
  evening: { busy: 1.2, inbound: 0.2 },
  night: { busy: 0.25, inbound: 0.3 },
};
/** The town's own cars on its streets in each part of the day. */
const TOWN_CARS: Record<DayPeriod, number> = { morning: 4, afternoon: 3, evening: 4, night: 1 };
/** The share of driveways with a car standing in them. People are home at night and out by day. */
const HOME: Record<DayPeriod, number> = { morning: 0.55, afternoon: 0.35, evening: 0.7, night: 0.95 };
const SHUTTLE_PAUSE_MS = 2600;
const TRUCK_PAUSE_MS = 7000;
/** A truck sets out about this often while there is somewhere to deliver to. */
const TRUCK_EVERY_MS = 16_000;
/** Shuttle stops nearer than this to one already chosen are left out. */
const STOP_SPACING = 4;

type Heading = 'px' | 'nx' | 'py' | 'ny';

/** Cars keep to one side of the road, as the look review placed them. */
const LANE: Record<Heading, { x: number; y: number }> = {
  px: { x: 0, y: 0.16 },
  nx: { x: 0, y: -0.16 },
  py: { x: -0.14, y: 0 },
  ny: { x: 0.14, y: 0 },
};

/** Which way each heading points, in cells. */
const AHEAD: Record<Heading, { x: number; y: number }> = {
  px: { x: 1, y: 0 },
  nx: { x: -1, y: 0 },
  py: { x: 0, y: 1 },
  ny: { x: 0, y: -1 },
};
/** The room a car keeps behind the one in front, in cells, and how much more a bus or a truck takes up. */
const GAP = 0.85;
const LONG_GAP = 0.3;

const NO_LANE = { x: 0, y: 0 };

/** One step of a route: a cell, and whether it is road. Driveways and car parks are not. */
interface Node {
  x: number;
  y: number;
  road: boolean;
}

interface Vehicle {
  sprite: Phaser.GameObjects.Image;
  kind: 'student' | 'town' | 'shuttle' | 'truck';
  /** The sprite name before the heading: car.3, shuttle, truck.0. */
  look: string;
  route: Node[];
  /** The leg being driven: from route[leg] to route[leg + 1]. */
  leg: number;
  /** How far along that leg, from 0 to 1. */
  along: number;
  alpha: number;
  fading: 'in' | 'out' | null;
  /** Standing still for this long yet: at a stop, or making a delivery. */
  pauseMs: number;
  /** Legs at whose end it pauses, and for how long. */
  pauseAt: Map<number, number>;
  /** The shuttle never leaves: at the end of its route it starts the next. */
  loop: number;
  heading: Heading;
  /** Where it was last drawn, in cells, and whether that was on the road. */
  x: number;
  y: number;
  onRoad: boolean;
  /** A delivery truck: its driver, who steps out with boxes while it stands at the kitchen or the store. */
  driver: { n: number; x: number; y: number; front: number; body: Phaser.GameObjects.Image; boxes: Phaser.GameObjects.Image } | null;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A steady number from two whole numbers, for choices that must not flicker from frame to frame. */
function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Cars {
  private vehicles: Vehicle[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  /** Cars standing in driveways. */
  private parked: Phaser.GameObjects.Image[] = [];
  private parkedFor = '';
  private width = 0;
  private height = 0;
  private drivable: boolean[] = [];
  private crossing: boolean[] = [];
  /** Car parks a road reaches: the road cell beside each, and the car park's own cell. */
  private parks: Array<{ door: number; x: number; y: number }> = [];
  /** Driveways of the streets students drive from. */
  private studentHomes: Array<{ x: number; y: number; row: number }> = [];
  /** Every driveway in the town, and the ends of its streets where a car can come and go. */
  private drives: Array<{ x: number; y: number; row: number }> = [];
  private ends: number[] = [];
  /** Where the shuttle stops, in the order it calls. */
  private stops: number[] = [];
  /** Road cells beside a dining hall or a store. */
  private deliveries: number[] = [];
  /** For each of those, the middle of the building's nearest cell: where the driver carries the boxes. */
  private dropAt = new Map<number, { x: number; y: number; front: number }>();
  private drivers = 0;
  private spawnClock = 0;
  private truckClock = TRUCK_EVERY_MS * 0.5;
  private step = 2;
  /** Crossings a vehicle is on or is driving onto. Walkers wait for them. */
  private taken = new Set<number>();
  /** Vehicles on screen at the last frame, for the sound of traffic. */
  private seen = 0;
  /** Asked each frame: is somebody walking over this crossing? */
  private busyCrossing: (cell: number) => boolean = () => false;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  /** The crowd step to show: fewer cars when frames are short. */
  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** Cars wait at a crossing while this says somebody is on it. */
  watchCrossings(busy: (cell: number) => boolean): void {
    this.busyCrossing = busy;
  }

  /** Read the roads, car parks and houses again. Called whenever the map changes. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.width = width;
    this.height = height;
    this.drivable = cells.map((cell) => isRoadKind(cell.kind));
    this.crossing = cells.map((cell) => cell.kind === 'crossing');
    // Student cars have a cap of their own, so they follow the real number who drive in.
    this.drivers = driversNow(state);

    const roadBeside = (x0: number, y0: number, w: number, h: number): number => {
      for (let y = y0 - 1; y <= y0 + h; y++) {
        for (let x = x0 - 1; x <= x0 + w; x++) {
          const beside = (x < x0 || x >= x0 + w) !== (y < y0 || y >= y0 + h);
          if (!beside || x < 0 || y < 0 || x >= width || y >= height) continue;
          if (this.drivable[y * width + x]) return y * width + x;
        }
      }
      return -1;
    };

    this.parks = [];
    this.deliveries = [];
    this.dropAt.clear();
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const spec = PLACED[placed.type];
      if (placedCars(placed.type, 1) > 0 && hasRoadAccess(state.map, placed)) {
        const door = roadBeside(placed.x, placed.y, placed.w, placed.h);
        if (door >= 0) this.parks.push({ door, x: placed.x, y: placed.y });
      }
      // A truck calls where there is food or a shop, and a road to pull up on.
      if (spec.family === 'dining' || spec.family === 'store') {
        const door = roadBeside(placed.x, placed.y, placed.w, placed.h);
        if (door >= 0) {
          this.deliveries.push(door);
          // The driver stands between the truck and the building, at the building's edge.
          const rx = door % width;
          const ry = Math.floor(door / width);
          const bx = Math.max(placed.x, Math.min(placed.x + placed.w - 1, rx));
          const by = Math.max(placed.y, Math.min(placed.y + placed.h - 1, ry));
          // On the road's kerb, outside the building's own ground. South or east of a building is in front
          // of it, however wide it is, so there the driver is drawn over it.
          const inFront = ry >= placed.y + placed.h || rx >= placed.x + placed.w;
          const front = inFront ? (placed.x + placed.w - 1 + placed.y + placed.h - 1) * 4 + 3.1 : 0;
          this.dropAt.set(door, { x: rx + 0.5 + (bx - rx) * 0.36, y: ry + 0.5 + (by - ry) * 0.36, front });
        }
      }
    }

    // The town: its driveways, and those on the streets students drive from.
    this.drives = driveways(state.map);
    const living = townLiving(state);
    const driving = new Set(state.map.town.neighbourhoods.filter((hood) => living[hood.id]?.mode === 'drive' && (living[hood.id]?.living ?? 0) > 0).map((hood) => hood.row));
    this.studentHomes = this.drives.filter((drive) => driving.has(drive.row));
    // A driving street with no driveway of its own still sends cars: they pull out from the kerb.
    for (const hood of state.map.town.neighbourhoods) {
      if (!driving.has(hood.row) || this.studentHomes.some((drive) => drive.row === hood.row)) continue;
      const plot = hood.plots[0];
      if (plot) this.studentHomes.push({ x: plot.x, y: hood.row, row: hood.row });
    }
    this.ends = [];
    for (const y of [0, height - 1]) if (this.drivable[y * width + TOWN_X]) this.ends.push(y * width + TOWN_X);
    for (const hood of state.map.town.neighbourhoods) if (this.drivable[hood.row * width + width - 1]) this.ends.push(hood.row * width + width - 1);

    this.stops = this.shuttleStops(state);

    // Anything whose road was dug up leaves quietly. The shuttle starts its round again.
    for (const vehicle of this.vehicles) {
      const broken = vehicle.route.slice(vehicle.leg).some((node) => node.road && !this.drivable[node.y * width + node.x]);
      if (broken || vehicle.kind === 'shuttle') vehicle.fading = 'out';
    }
    this.parkedFor = '';
  }

  /**
   * Where the shuttle calls: road cells where a road meets a path or a car
   * park, spaced out, in an order that makes a round. Empty when there are
   * fewer than two, or no road joins them.
   */
  private shuttleStops(state: GameState): number[] {
    const { width, height, cells } = state.map;
    const found: number[] = [];
    const far = (a: number, b: number): number => Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width));
    const add = (cell: number): void => {
      if (found.every((other) => far(other, cell) >= STOP_SPACING)) found.push(cell);
    };
    for (const park of this.parks) add(park.door);
    for (let i = 0; i < cells.length; i++) {
      if (!this.drivable[i]) continue;
      if (cells[i]!.kind === 'crossing') {
        add(i);
        continue;
      }
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (isPathKind(cells[ny * width + nx]!.kind)) {
          add(i);
          break;
        }
      }
    }
    if (found.length < 2) return [];
    // A round: clockwise about the middle of the stops.
    const cx = found.reduce((sum, cell) => sum + (cell % width), 0) / found.length;
    const cy = found.reduce((sum, cell) => sum + Math.floor(cell / width), 0) / found.length;
    found.sort((a, b) => Math.atan2(Math.floor(a / width) - cy, (a % width) - cx) - Math.atan2(Math.floor(b / width) - cy, (b % width) - cx));
    // Only stops a road joins to the first are kept.
    const joined = found.filter((cell, n) => n === 0 || this.cellsBetween(found[0]!, cell) !== null);
    return joined.length >= 2 ? joined : [];
  }

  /** The cells from one road cell to another, or null when no road joins them. */
  private cellsBetween(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const came = new Int32Array(this.width * this.height).fill(-1);
    came[from] = from;
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      if (i === to) break;
      const x = i % this.width;
      const y = (i - x) / this.width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const ni = ny * this.width + nx;
        if (came[ni] === -1 && this.drivable[ni]) {
          came[ni] = i;
          queue.push(ni);
        }
      }
    }
    if (came[to] === -1) return null;
    const route = [to];
    while (route[0] !== from) route.unshift(came[route[0]!]!);
    return route;
  }

  private nodes(cells: readonly number[]): Node[] {
    return cells.map((cell) => ({ x: cell % this.width, y: Math.floor(cell / this.width), road: true }));
  }

  /** The street cell a driveway opens onto. */
  private kerb(drive: { x: number; row: number }): number {
    return drive.row * this.width + drive.x;
  }

  private launch(kind: Vehicle['kind'], look: string, route: Node[], partWay: boolean, pauseAt = new Map<number, number>()): Vehicle | null {
    if (route.length < 2) return null;
    const sprite = this.pool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
    sprite.setVisible(true);
    const vehicle: Vehicle = { sprite, kind, look, route, leg: 0, along: 0, alpha: 0, fading: 'in', pauseMs: 0, pauseAt, loop: 0, heading: 'px', x: 0, y: 0, onRoad: false, driver: null };
    if (partWay) {
      // The first cars are already on their way, so the roads are not empty when the map opens.
      vehicle.leg = Math.floor(Math.random() * (route.length - 1));
      vehicle.alpha = 1;
      vehicle.fading = null;
    }
    this.vehicles.push(vehicle);
    this.draw(vehicle);
    return vehicle;
  }

  /** A student driving in from a driveway to a car park, or home again. */
  private startStudent(period: DayPeriod, partWay: boolean): void {
    const home = this.studentHomes[Math.floor(Math.random() * this.studentHomes.length)];
    const park = this.parks[Math.floor(Math.random() * this.parks.length)];
    if (!home || !park) return;
    const cells = this.cellsBetween(this.kerb(home), park.door);
    if (!cells) return;
    // Out of the driveway, along the roads, and into the car park.
    const route: Node[] = [{ x: home.x, y: home.y, road: home.y === home.row }, ...this.nodes(cells), { x: park.x, y: park.y, road: false }];
    if (Math.random() >= TRAFFIC[period].inbound) route.reverse();
    this.launch('student', `car.${Math.floor(Math.random() * SMALL_CARS)}`, route, partWay);
  }

  /** A neighbour's car: between two driveways, or to and from the edge of the map. */
  private startTown(partWay: boolean): void {
    const spots: Array<{ cell: number; drive?: { x: number; y: number } }> = [
      ...this.drives.map((drive) => ({ cell: this.kerb(drive), drive })),
      ...this.ends.map((cell) => ({ cell })),
    ];
    if (spots.length < 2) return;
    const from = spots[Math.floor(Math.random() * spots.length)]!;
    let to = spots[Math.floor(Math.random() * spots.length)]!;
    if (to === from) to = spots[(spots.indexOf(from) + 1) % spots.length]!;
    const cells = this.cellsBetween(from.cell, to.cell);
    if (!cells || cells.length < 2) return;
    const route = this.nodes(cells);
    if (from.drive) route.unshift({ x: from.drive.x, y: from.drive.y, road: false });
    if (to.drive) route.push({ x: to.drive.x, y: to.drive.y, road: false });
    // Now and then the town's yellow bus, which is the last of the car looks.
    const look = Math.random() < 0.08 && !from.drive && !to.drive ? CAR_LOOKS - 1 : Math.floor(Math.random() * SMALL_CARS);
    this.launch('town', `car.${look}`, route, partWay);
  }

  /** The shuttle's whole round, as one route with a pause at each stop. */
  private startShuttle(): void {
    if (this.stops.length < 2 || !this.art.has('shuttle.px')) return;
    const route: Node[] = [];
    const pauseAt = new Map<number, number>();
    for (let n = 0; n < this.stops.length; n++) {
      const cells = this.cellsBetween(this.stops[n]!, this.stops[(n + 1) % this.stops.length]!);
      if (!cells) return;
      // The end of one stretch is the start of the next.
      const stretch = this.nodes(n === 0 ? cells : cells.slice(1));
      route.push(...stretch);
      pauseAt.set(route.length - 2, SHUTTLE_PAUSE_MS);
    }
    const bus = this.launch('shuttle', 'shuttle', route, false, pauseAt);
    if (bus) bus.loop = 1;
  }

  /** A delivery: in from the edge of the map, a stop beside a dining hall or a store, and away again. */
  private startTruck(): void {
    if (this.deliveries.length === 0 || this.ends.length === 0 || !this.art.has('truck.0.px')) return;
    const at = this.deliveries[Math.floor(Math.random() * this.deliveries.length)]!;
    const from = this.ends[Math.floor(Math.random() * this.ends.length)]!;
    const away = this.ends[Math.floor(Math.random() * this.ends.length)]!;
    const there = this.cellsBetween(from, at);
    const back = this.cellsBetween(at, away);
    if (!there || !back || there.length < 2) return;
    const route = [...this.nodes(there), ...this.nodes(back.slice(1))];
    if (route.length < 3) return;
    const truck = this.launch('truck', `truck.${Math.floor(Math.random() * 2)}`, route, false, new Map([[there.length - 2, TRUCK_PAUSE_MS]]));
    // Its driver: the pack's mail carrier, with boxes beside them, seen only while the truck stands at the door.
    const look = this.art.people?.roles?.driver;
    const drop = this.dropAt.get(at);
    if (truck && look !== undefined && drop) {
      const body = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      const boxes = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      const facing = this.art.people?.flip?.sw ?? 'sw';
      this.art.apply(body, `person.${look}.${facing}.0`);
      body.setFlipX(this.art.people?.flip?.sw !== undefined);
      if (this.art.has('people.boxes')) {
        this.art.apply(boxes, 'people.boxes');
        boxes.setOrigin(0.5, 1);
      }
      truck.driver = { n: Math.floor(Math.random() * 40), x: drop.x, y: drop.y, front: drop.front, body, boxes };
    }
  }

  /**
   * Where in the road a vehicle is as it passes one step of its route: in the
   * lane of the way it came, the lane of the way it leaves, or, at a corner,
   * half way between the two. Off the road there is no lane.
   */
  private laneAt(vehicle: Vehicle, index: number): { x: number; y: number } {
    const route = vehicle.route;
    const here = route[index]!;
    if (!here.road) return NO_LANE;
    const way = (p: Node, q: Node): Heading | null => (q.x > p.x ? 'px' : q.x < p.x ? 'nx' : q.y > p.y ? 'py' : q.y < p.y ? 'ny' : null);
    const before = index > 0 ? way(route[index - 1]!, here) : null;
    const after = index < route.length - 1 ? way(here, route[index + 1]!) : null;
    const first = LANE[before ?? after ?? vehicle.heading];
    const second = LANE[after ?? before ?? vehicle.heading];
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  private draw(vehicle: Vehicle): void {
    const from = vehicle.route[vehicle.leg]!;
    const to = vehicle.route[Math.min(vehicle.leg + 1, vehicle.route.length - 1)]!;
    if (to.x !== from.x || to.y !== from.y) vehicle.heading = to.x > from.x ? 'px' : to.x < from.x ? 'nx' : to.y > from.y ? 'py' : 'ny';
    // On the road it keeps to its lane. At a corner it cuts across from the lane it was in to the lane it is
    // turning into, so it turns through the corner and does not jump sideways on the spot. Turning into a
    // driveway or a car park it leaves the lane behind.
    const a = this.laneAt(vehicle, vehicle.leg);
    const b = this.laneAt(vehicle, Math.min(vehicle.leg + 1, vehicle.route.length - 1));
    const x = from.x + a.x + (to.x + b.x - from.x - a.x) * vehicle.along;
    const y = from.y + a.y + (to.y + b.y - from.y - a.y) * vehicle.along;
    vehicle.x = x;
    vehicle.y = y;
    vehicle.onRoad = from.road && to.road;
    this.art.apply(vehicle.sprite, `${vehicle.look}.${vehicle.heading}`);
    const at = this.iso.toWorld(x, y);
    vehicle.sprite.setPosition(at.x, at.y).setAlpha(vehicle.alpha).setDepth((x + y) * 4 + 2.4);
  }

  /**
   * Is another vehicle close ahead in the same lane? Cars keep a gap, so they
   * queue behind a bus at its stop or a car waiting at a crossing, and never
   * drive through each other. Only the one behind ever waits, so nobody locks.
   */
  private blocked(vehicle: Vehicle, index: number): boolean {
    if (!vehicle.onRoad) return false;
    const way = AHEAD[vehicle.heading];
    const long = vehicle.kind === 'shuttle' || vehicle.kind === 'truck';
    for (let j = 0; j < this.vehicles.length; j++) {
      if (j === index) continue;
      const other = this.vehicles[j]!;
      if (!other.onRoad || other.heading !== vehicle.heading || other.fading === 'out') continue;
      const dx = other.x - vehicle.x;
      const dy = other.y - vehicle.y;
      if (Math.abs(dx * way.y - dy * way.x) > 0.3) continue;
      const ahead = dx * way.x + dy * way.y;
      const gap = GAP + (long ? LONG_GAP : 0) + (other.kind === 'shuttle' || other.kind === 'truck' ? LONG_GAP : 0);
      // Two on the same spot: the later one lets the earlier one go.
      if (ahead > 1e-6 ? ahead < gap : ahead > -1e-6 && j < index) return true;
    }
    return false;
  }

  private retire(index: number): void {
    const vehicle = this.vehicles[index]!;
    vehicle.driver?.body.destroy();
    vehicle.driver?.boxes.destroy();
    vehicle.sprite.setVisible(false);
    this.pool.push(vehicle.sprite);
    this.vehicles.splice(index, 1);
  }

  /** Cars standing in driveways: more at night, fewer by day. Redrawn only when the hour or the map changes. */
  private showParked(period: DayPeriod): void {
    const key = `${period}:${this.drives.length}`;
    if (key === this.parkedFor) return;
    this.parkedFor = key;
    for (const sprite of this.parked) sprite.destroy();
    this.parked = [];
    for (const drive of this.drives) {
      const cell = drive.y * this.width + drive.x;
      if (mix(cell, 7) >= HOME[period]) continue;
      const look = Math.floor(mix(cell, 3) * SMALL_CARS);
      // Nose to the street.
      const heading: Heading = drive.y < drive.row ? 'py' : 'ny';
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, `car.${look}.${heading}`);
      const at = this.iso.toWorld(drive.x, drive.y);
      sprite.setPosition(at.x, at.y).setDepth((drive.x + drive.y) * 4 + 2.3);
      this.parked.push(sprite);
    }
  }

  update(deltaMs: number, period: DayPeriod): void {
    const dt = Math.min(deltaMs, 100);
    this.showParked(period);
    const count = { student: 0, town: 0, shuttle: 0, truck: 0 };
    this.taken.clear();
    this.seen = 0;
    const view = this.scene.cameras.main.worldView;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const vehicle = this.vehicles[i]!;
      // On a crossing, or past the point where it could still stop short of the next one.
      if (vehicle.onRoad && vehicle.fading !== 'out') {
        const cell = Math.floor(vehicle.y + 0.5) * this.width + Math.floor(vehicle.x + 0.5);
        if (this.crossing[cell]) this.taken.add(cell);
        const ahead = vehicle.route[Math.min(vehicle.leg + 1, vehicle.route.length - 1)]!;
        const next = ahead.y * this.width + ahead.x;
        if (vehicle.along >= 0.6 && this.crossing[next]) this.taken.add(next);
      }
      if (vehicle.sprite.x >= view.x && vehicle.sprite.x <= view.right && vehicle.sprite.y >= view.y && vehicle.sprite.y <= view.bottom) this.seen += 1;
      if (vehicle.fading === 'in') {
        vehicle.alpha = Math.min(1, vehicle.alpha + dt / FADE_MS);
        if (vehicle.alpha >= 1) vehicle.fading = null;
      } else if (vehicle.fading === 'out') {
        vehicle.alpha -= dt / FADE_MS;
        if (vehicle.alpha <= 0) {
          this.retire(i);
          continue;
        }
      }
      count[vehicle.kind] += 1;
      if (vehicle.driver) {
        // Out with the boxes while the truck stands at the door, and back in the cab when it moves.
        const out = vehicle.pauseMs > 0 && vehicle.fading !== 'out';
        const who = vehicle.driver;
        who.body.setVisible(out);
        who.boxes.setVisible(out && this.art.has('people.boxes'));
        if (out) {
          const at = this.iso.toWorld(who.x, who.y);
          const depth = Math.max((who.x + who.y - 1) * 4 + 2.6, who.front);
          who.body.setPosition(at.x, at.y).setDepth(depth);
          // The boxes go down on the kerb beside them.
          const beside = this.iso.toWorld(who.x + 0.34, who.y + 0.08);
          who.boxes.setPosition(beside.x, beside.y).setDepth(depth + 0.05);
        }
      }
      if (vehicle.fading !== 'out') {
        if (vehicle.pauseMs > 0) vehicle.pauseMs -= dt;
        else {
          // Somebody on the crossing ahead: wait at its edge.
          const next = vehicle.route[Math.min(vehicle.leg + 1, vehicle.route.length - 1)]!;
          const ahead = next.y * this.width + next.x;
          const held = next.road && this.crossing[ahead] && vehicle.along >= 0.35 && vehicle.along < 0.6 && this.busyCrossing(ahead);
          if (!held && !this.blocked(vehicle, i)) vehicle.along += ((vehicle.kind === 'shuttle' || vehicle.kind === 'truck' ? SPEED * 0.8 : SPEED) * dt) / 1000;
          while (vehicle.along >= 1 && vehicle.leg < vehicle.route.length - 2) {
            const pause = vehicle.pauseAt.get(vehicle.leg);
            vehicle.along -= 1;
            vehicle.leg += 1;
            if (pause) {
              // Pulled up at a stop: stand at the start of the next leg until the pause is over.
              vehicle.along = 0;
              vehicle.pauseMs = pause;
              break;
            }
          }
          if (vehicle.along >= 1) {
            if (vehicle.loop > 0) {
              // The shuttle's round ends where it began.
              const pause = vehicle.pauseAt.get(vehicle.leg) ?? 0;
              vehicle.leg = 0;
              vehicle.along = 0;
              vehicle.pauseMs = pause;
            } else {
              // The end of the road: into the car park, onto a driveway, or off the edge of the map.
              vehicle.along = 1;
              vehicle.fading = 'out';
            }
          }
        }
      }
      this.draw(vehicle);
    }

    const scale = CROWD_STEPS[this.step]!.traffic;
    const students =
      this.drivers > 0 && this.parks.length > 0 && this.studentHomes.length > 0
        ? Phaser.Math.Clamp(Math.round((this.drivers / DRIVERS_PER_CAR) * TRAFFIC[period].busy * scale), 1, Math.round(MAX_STUDENT_CARS * scale))
        : 0;
    const town = this.drives.length + this.ends.length >= 2 ? Math.max(1, Math.round(TOWN_CARS[period] * scale)) : 0;

    if (count.student + count.town === 0 && students + town > 0) {
      // The map has just opened: the roads start with cars already on them.
      for (let n = 0; n < students; n++) this.startStudent(period, true);
      for (let n = 0; n < town; n++) this.startTown(true);
    }
    this.spawnClock += dt;
    if (this.spawnClock >= SPAWN_EVERY_MS) {
      this.spawnClock = 0;
      if (count.student < students) this.startStudent(period, false);
      if (count.town < town) this.startTown(false);
      if (count.shuttle === 0 && this.step >= 1) this.startShuttle();
    }
    this.truckClock += dt * scale;
    if (this.truckClock >= TRUCK_EVERY_MS) {
      this.truckClock = 0;
      if (count.truck < (this.step >= 3 ? 2 : 1) && period !== 'night') this.startTruck();
    }
  }

  /** True while a vehicle is on that crossing or driving onto it. */
  onCrossing(cell: number): boolean {
    return this.taken.has(cell);
  }

  /** Vehicles on screen now. */
  get inView(): number {
    return this.seen;
  }

  /** Dev screenshots: a delivery truck that is nearly at its door, so its driver is seen without a wait. */
  truckNow(): void {
    const before = this.vehicles.length;
    this.startTruck();
    const truck = this.vehicles[before];
    const stop = truck ? [...truck.pauseAt.keys()][0] : undefined;
    if (!truck || truck.kind !== 'truck' || stop === undefined) return;
    // It stands a full minute, so a screenshot taken on a slow machine still finds it there.
    truck.pauseAt.set(stop, 60_000);
    truck.leg = stop;
    truck.along = 0.8;
    truck.alpha = 1;
    truck.fading = null;
  }

  /** The delivery driver under a point of the world, by their number, or null. `reach` widens the figure for a thumb. */
  driverAt(worldX: number, worldY: number, reach: number): number | null {
    for (const vehicle of this.vehicles) {
      const who = vehicle.driver;
      if (!who || !who.body.visible) continue;
      const box = who.body.getBounds();
      if (worldX >= box.x - reach && worldX <= box.right + reach && worldY >= box.y - reach && worldY <= box.bottom + reach) return who.n;
    }
    return null;
  }

  /** Where each delivery driver stands now, in the world. For the dev screenshot helper. */
  get driversOut(): Array<{ n: number; x: number; y: number }> {
    const out: Array<{ n: number; x: number; y: number }> = [];
    for (const vehicle of this.vehicles) if (vehicle.driver?.body.visible) out.push({ n: vehicle.driver.n, x: vehicle.driver.body.x, y: vehicle.driver.body.y });
    return out;
  }

  /** How many vehicles are out. For the dev console. */
  get count(): number {
    return this.vehicles.length;
  }

  /** How many of each kind are out, and how many stand in driveways. For the dev readout. */
  get counts(): { student: number; town: number; shuttle: number; truck: number; parked: number } {
    const counts = { student: 0, town: 0, shuttle: 0, truck: 0, parked: this.parked.length };
    for (const vehicle of this.vehicles) counts[vehicle.kind] += 1;
    return counts;
  }

  clear(): void {
    for (const vehicle of this.vehicles) {
      vehicle.driver?.body.destroy();
      vehicle.driver?.boxes.destroy();
    }
    for (const vehicle of this.vehicles) vehicle.sprite.destroy();
    for (const sprite of this.pool) sprite.destroy();
    for (const sprite of this.parked) sprite.destroy();
    this.vehicles = [];
    this.pool = [];
    this.parked = [];
    this.parkedFor = '';
  }
}
