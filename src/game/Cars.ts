import Phaser from 'phaser';
import { CROWD_STEPS } from '../app/crowd';
import type { DayPeriod } from '../app/daylight';
import { newCar, placeCar, planTraffic, Traffic, type RouteNode, type TrafficCar } from '../app/traffic';
import { driversNow, hasRoadAccess, isPathKind, isRoadKind, PLACED, TOWN_X, townLiving, type GameState, placedCars } from '../sim';
import type { Art } from './art';
import type { Heading, Iso } from './iso';
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
 * The rules of the road are in `src/app/traffic.ts`, where they are tested
 * without the game engine: a gap behind the car in front, a stop sign at
 * every junction with one car through at a time, and a crossing that belongs
 * to whoever is on it. This file draws what those rules decide. None of it
 * is simulation, none of it is saved, and nothing here runs while the game
 * is closed.
 */

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
  afternoon: { busy: 0.6, inbound: 0.5 },
  evening: { busy: 1.2, inbound: 0.2 },
  night: { busy: 0.25, inbound: 0.3 },
};
/** How busy the busiest part of the day is: the rush the caps are sized for. */
const RUSH_BUSY = 1.4;
/** The town's own cars on its streets in each part of the day. */
const TOWN_CARS: Record<DayPeriod, number> = { morning: 4, afternoon: 2, evening: 4, night: 1 };
/** The share of driveways with a car standing in them. People are home at night and out by day. */
const HOME: Record<DayPeriod, number> = { morning: 0.55, afternoon: 0.35, evening: 0.7, night: 0.95 };
const SHUTTLE_PAUSE_MS = 2600;
const TRUCK_PAUSE_MS = 7000;
/** A truck sets out about this often while there is somewhere to deliver to. */
const TRUCK_EVERY_MS = 16_000;
/** Shuttle stops nearer than this to one already chosen are left out. */
const STOP_SPACING = 4;

type Node = RouteNode;

/** A car as the rules of the road keep it, with what is needed to draw it. */
interface Vehicle extends TrafficCar {
  sprite: Phaser.GameObjects.Image;
  kind: 'student' | 'town' | 'shuttle' | 'truck';
  /** The sprite name before the heading: car.3, shuttle, truck.0. */
  look: string;
  alpha: number;
  fading: 'in' | 'out' | null;
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
  /** The rules of the road, and the signs that stand at its junctions and crossings. */
  private traffic = new Traffic(planTraffic(0, 0, [], TOWN_X));
  private signs: Phaser.GameObjects.Image[] = [];
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
    const plan = planTraffic(width, height, cells.map((cell) => cell.kind), TOWN_X);
    this.traffic.setPlan(plan);
    for (const vehicle of this.vehicles) {
      vehicle.zone = -1;
      vehicle.waitingAt = -1;
    }
    // A stop sign at every way into a junction, and a crossing sign at a crossing that stands by itself.
    for (const sprite of this.signs) sprite.destroy();
    this.signs = [];
    for (const sign of plan.signs) {
      const key = sign.kind === 'stop' ? 'sign.stop' : 'sign.crossing';
      if (!this.art.has(key)) continue;
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, key);
      const at = this.iso.toWorld(sign.x, sign.y);
      sprite.setPosition(at.x, at.y).setDepth(this.iso.sum(sign.x, sign.y) * 4 + 2.45);
      this.signs.push(sprite);
    }
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
          // On the road's kerb, outside the building's own ground. On the near sides of a building, as the view
          // is turned, they are in front of it however wide it is, so there the driver is drawn over it.
          const box = this.iso.viewBox(placed.x, placed.y, placed.w, placed.h);
          const kerb = this.iso.viewCell(rx, ry);
          const inFront = kerb.y >= box.y + box.h || kerb.x >= box.x + box.w;
          const front = inFront ? this.iso.front(placed.x, placed.y, placed.w, placed.h) * 4 + 3.1 : 0;
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
    const vehicle: Vehicle = { ...newCar(route, kind === 'shuttle' || kind === 'truck', pauseAt), sprite, kind, look, alpha: 0, fading: 'in', driver: null };
    if (partWay) {
      // The first cars are already on their way, so the roads are not empty when the map opens. None is set
      // down inside a junction or on a crossing, or within a car's length of another.
      const clear = (leg: number): boolean => {
        const zone = (node: Node | undefined): number => (node && node.road ? this.traffic.zoneOfCell(node.y * this.width + node.x) : -1);
        if (zone(route[leg]) >= 0 || zone(route[leg + 1]) >= 0) return false;
        const here = route[leg]!;
        return !this.vehicles.some((other) => Math.abs(other.x - here.x) < 1.6 && Math.abs(other.y - here.y) < 1.6);
      };
      let leg = -1;
      for (let tries = 0; tries < 8 && leg < 0; tries++) {
        const pick = Math.floor(Math.random() * (route.length - 1));
        if (clear(pick)) leg = pick;
      }
      if (leg < 0) {
        this.pool.push(sprite.setVisible(false));
        return null;
      }
      vehicle.leg = leg;
      vehicle.alpha = 1;
      vehicle.fading = null;
    }
    this.vehicles.push(vehicle);
    placeCar(vehicle);
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

  private draw(vehicle: Vehicle): void {
    // It drives the map. On a turned view its picture is the one for the way it goes on the screen.
    this.art.apply(vehicle.sprite, `${vehicle.look}.${this.iso.heading(vehicle.heading as Heading)}`);
    const at = this.iso.toWorld(vehicle.x, vehicle.y);
    vehicle.sprite.setPosition(at.x, at.y).setAlpha(vehicle.alpha).setDepth(this.iso.sum(vehicle.x, vehicle.y) * 4 + 2.4);
  }

  private retire(index: number): void {
    const vehicle = this.vehicles[index]!;
    this.traffic.forget(vehicle);
    vehicle.driver?.body.destroy();
    vehicle.driver?.boxes.destroy();
    vehicle.sprite.setVisible(false);
    this.pool.push(vehicle.sprite);
    this.vehicles.splice(index, 1);
  }

  /** Cars standing in driveways: more at night, fewer by day. Redrawn only when the hour or the map changes. */
  private showParked(period: DayPeriod): void {
    const key = `${period}:${this.drives.length}:${this.iso.turn}`;
    if (key === this.parkedFor) return;
    this.parkedFor = key;
    for (const sprite of this.parked) sprite.destroy();
    this.parked = [];
    for (const drive of this.drives) {
      const cell = drive.y * this.width + drive.x;
      if (mix(cell, 7) >= HOME[period]) continue;
      const look = Math.floor(mix(cell, 3) * SMALL_CARS);
      // Nose to the street.
      const heading = this.iso.heading(drive.y < drive.row ? 'py' : 'ny');
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, `car.${look}.${heading}`);
      const at = this.iso.toWorld(drive.x, drive.y);
      sprite.setPosition(at.x, at.y).setDepth(this.iso.sum(drive.x, drive.y) * 4 + 2.3);
      this.parked.push(sprite);
    }
  }

  update(deltaMs: number, period: DayPeriod): void {
    const dt = Math.min(deltaMs, 100);
    this.showParked(period);
    const count = { student: 0, town: 0, shuttle: 0, truck: 0 };
    this.seen = 0;
    const view = this.scene.cameras.main.worldView;
    // The rules of the road move every car: gaps, stop signs, and crossings with people on them.
    for (const vehicle of this.vehicles) vehicle.leaving = vehicle.leaving || vehicle.fading === 'out';
    this.traffic.step(this.vehicles, dt, this.busyCrossing);
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const vehicle = this.vehicles[i]!;
      // At the end of its road, or given up: it fades away.
      if ((vehicle.done || vehicle.leaving) && vehicle.fading !== 'out') vehicle.fading = 'out';
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
          const depth = Math.max((this.iso.sum(who.x, who.y) - 1) * 4 + 2.6, who.front);
          who.body.setPosition(at.x, at.y).setDepth(depth);
          // The boxes go down on the kerb beside them.
          const off = this.iso.offset(0.34, 0.08);
          who.boxes.setPosition(at.x + off.x, at.y + off.y).setDepth(depth + 0.05);
        }
      }
      this.draw(vehicle);
    }

    const scale = CROWD_STEPS[this.step]!.traffic;
    const students =
      this.drivers > 0 && this.parks.length > 0 && this.studentHomes.length > 0
        ? // The most on the road follows the time of day too: the full number at the morning rush, and fewer outside it,
          // so a large campus is not at its rush all day.
          Phaser.Math.Clamp(Math.round((this.drivers / DRIVERS_PER_CAR) * TRAFFIC[period].busy * scale), 1, Math.max(1, Math.round((MAX_STUDENT_CARS * scale * TRAFFIC[period].busy) / RUSH_BUSY)))
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

  /** True while a car has that crossing, or one is due it. People wait at the kerb. */
  onCrossing(cell: number): boolean {
    return this.traffic.claims(cell);
  }

  /** How many cars have given up because they could not move. For the dev readout: it should stay at nothing. */
  get gaveUp(): number {
    return this.traffic.gaveUp;
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
    for (const sprite of this.signs) sprite.destroy();
    this.signs = [];
    this.vehicles = [];
    this.pool = [];
    this.parked = [];
    this.parkedFor = '';
  }
}
