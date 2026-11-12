import Phaser from 'phaser';
import type { DayPeriod } from '../app/daylight';
import { driversNow, hasRoadAccess, isRoadKind, PLACED, townLiving, type GameState } from '../sim';
import type { Art } from './art';
import type { Iso } from './iso';

/**
 * Cars, for show. Locals who live too far to walk drive in: a car leaves a
 * house, follows the street and the player's road to a car park, and later
 * one drives home again. How many are out follows how many students drive
 * and the time of day.
 *
 * Like the walkers, none of this is simulation. Who drives is worked out from
 * parking spaces and roads alone; these cars only show it. There is no
 * congestion and nothing here runs while the game is closed.
 */

/** Cells a second. */
const SPEED = 2.3;
const FADE_MS = 280;
const SPAWN_EVERY_MS = 700;
const MAX_CARS = 9;
/** One car on the road for about this many students who drive, before the time of day is counted. */
const DRIVERS_PER_CAR = 10;
/** Looks a car can have in the art. */
const CAR_LOOKS = 7;

/** How busy the roads are in each part of the day, and the share of cars heading to campus. */
const TRAFFIC: Record<DayPeriod, { busy: number; inbound: number }> = {
  morning: { busy: 1.4, inbound: 0.85 },
  afternoon: { busy: 0.8, inbound: 0.5 },
  evening: { busy: 1.2, inbound: 0.2 },
  night: { busy: 0.25, inbound: 0.3 },
};

type Heading = 'px' | 'nx' | 'py' | 'ny';

/** Cars keep to one side of the road, as the look review placed them. */
const LANE: Record<Heading, { x: number; y: number }> = {
  px: { x: 0, y: 0.16 },
  nx: { x: 0, y: -0.16 },
  py: { x: -0.14, y: 0 },
  ny: { x: 0.14, y: 0 },
};

interface Car {
  sprite: Phaser.GameObjects.Image;
  /** Cell indexes from start to end. */
  route: number[];
  /** The leg being driven: from route[leg] to route[leg + 1]. */
  leg: number;
  /** How far along that leg, from 0 to 1. */
  along: number;
  look: number;
  alpha: number;
  fading: 'in' | 'out' | null;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Cars {
  private cars: Car[] = [];
  private width = 0;
  private height = 0;
  private drivable: boolean[] = [];
  /** Road cells beside a car park that a road reaches. */
  private parks: number[] = [];
  /** Street cells in front of the houses students drive from. */
  private homes: number[] = [];
  private drivers = 0;
  private spawnClock = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  /** Read the roads, car parks and houses again. Called whenever the map changes. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.width = width;
    this.height = height;
    this.drivable = cells.map((cell) => isRoadKind(cell.kind));
    this.drivers = driversNow(state);

    this.parks = [];
    for (const placed of state.map.placed) {
      if (!placed || !PLACED[placed.type].cars || !hasRoadAccess(state.map, placed)) continue;
      let door = -1;
      for (let y = placed.y - 1; y <= placed.y + placed.h && door < 0; y++) {
        for (let x = placed.x - 1; x <= placed.x + placed.w && door < 0; x++) {
          const beside = (x < placed.x || x >= placed.x + placed.w) !== (y < placed.y || y >= placed.y + placed.h);
          if (!beside || x < 0 || y < 0 || x >= width || y >= height) continue;
          if (this.drivable[y * width + x]) door = y * width + x;
        }
      }
      if (door >= 0) this.parks.push(door);
    }

    // Cars come from the houses that stand in the neighbourhoods students drive from.
    this.homes = [];
    const living = townLiving(state);
    for (const hood of state.map.town.neighbourhoods) {
      const here = living[hood.id];
      if (!here || here.mode !== 'drive') continue;
      for (const plot of hood.plots.slice(0, here.houses)) this.homes.push(hood.row * width + plot.x);
    }

    // Anyone whose road was dug up leaves quietly.
    for (const car of this.cars) {
      if (car.route.slice(car.leg).some((cell) => !this.drivable[cell])) car.fading = 'out';
    }
  }

  /** The cells from one road cell to another, or null when no road joins them. */
  private routeBetween(from: number, to: number): number[] | null {
    if (from === to) return null;
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

  private wanted(period: DayPeriod): number {
    if (this.drivers <= 0 || this.parks.length === 0 || this.homes.length === 0) return 0;
    const cars = Math.round((this.drivers / DRIVERS_PER_CAR) * TRAFFIC[period].busy);
    // At night the roads are nearly empty, but never dead: one car still comes or goes.
    return Phaser.Math.Clamp(cars, 1, MAX_CARS);
  }

  private start(period: DayPeriod, partWay: boolean): void {
    const home = this.homes[Math.floor(Math.random() * this.homes.length)]!;
    const park = this.parks[Math.floor(Math.random() * this.parks.length)]!;
    const inbound = Math.random() < TRAFFIC[period].inbound;
    const route = inbound ? this.routeBetween(home, park) : this.routeBetween(park, home);
    if (!route || route.length < 2) return;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT');
    const car: Car = { sprite, route, leg: 0, along: 0, look: Math.floor(Math.random() * CAR_LOOKS), alpha: 0, fading: 'in' };
    if (partWay) {
      // The first cars are already on their way, so the roads are not empty when the map opens.
      car.leg = Math.floor(Math.random() * (route.length - 1));
      car.alpha = 1;
      car.fading = null;
    }
    this.cars.push(car);
    this.draw(car);
  }

  private draw(car: Car): void {
    const from = car.route[car.leg]!;
    const to = car.route[Math.min(car.leg + 1, car.route.length - 1)]!;
    const fx = from % this.width;
    const fy = (from - fx) / this.width;
    const tx = to % this.width;
    const ty = (to - tx) / this.width;
    const heading: Heading = tx > fx ? 'px' : tx < fx ? 'nx' : ty > fy ? 'py' : 'ny';
    const x = fx + (tx - fx) * car.along + LANE[heading].x;
    const y = fy + (ty - fy) * car.along + LANE[heading].y;
    this.art.apply(car.sprite, `car.${car.look}.${heading}`);
    const at = this.iso.toWorld(x, y);
    car.sprite.setPosition(at.x, at.y).setAlpha(car.alpha).setDepth((x + y) * 4 + 2.4);
  }

  update(deltaMs: number, period: DayPeriod): void {
    const dt = Math.min(deltaMs, 100);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      if (car.fading === 'in') {
        car.alpha = Math.min(1, car.alpha + dt / FADE_MS);
        if (car.alpha >= 1) car.fading = null;
      } else if (car.fading === 'out') {
        car.alpha -= dt / FADE_MS;
        if (car.alpha <= 0) {
          car.sprite.destroy();
          this.cars.splice(i, 1);
          continue;
        }
      }
      if (car.fading !== 'out') {
        car.along += (SPEED * dt) / 1000;
        while (car.along >= 1 && car.leg < car.route.length - 2) {
          car.along -= 1;
          car.leg += 1;
        }
        // The end of the road: it turns into the car park, or onto a driveway.
        if (car.along >= 1) {
          car.along = 1;
          car.fading = 'out';
        }
      }
      this.draw(car);
    }

    const wanted = this.wanted(period);
    if (this.cars.length === 0 && wanted > 0) {
      for (let n = 0; n < wanted; n++) this.start(period, true);
      return;
    }
    this.spawnClock += dt;
    if (this.spawnClock >= SPAWN_EVERY_MS) {
      this.spawnClock = 0;
      if (this.cars.length < wanted) this.start(period, false);
    }
  }

  /** How many cars are out. For the dev console. */
  get count(): number {
    return this.cars.length;
  }

  clear(): void {
    for (const car of this.cars) car.sprite.destroy();
    this.cars = [];
  }
}
