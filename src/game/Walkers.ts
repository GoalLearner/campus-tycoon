import Phaser from 'phaser';
import { enrollment, type GameState, type Zone } from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Iso } from './iso';

/**
 * Students walking the paths. Purely for show: nothing here is saved, nothing
 * here touches the simulation, and catch-up never runs it. The crowd is a
 * sample sized from enrollment and from how much of the campus is on screen.
 *
 * A walker steps out of a building, follows the paths to another building or
 * to a quad, and steps inside or lingers on the lawn. Every sprite comes from
 * the art manifest. With no people in the manifest there are no walkers.
 */

/** Cells walked per second, before each walker's own pace. */
const PACE = 0.85;
/** The most walkers alive at once, wherever they are. */
const MAX_WALKERS = 90;
/** The most walkers wanted in view. */
const MAX_IN_VIEW = 64;
/** Staff and faculty: a campus with buildings is never quite empty. */
const MIN_IN_VIEW = 4;
/** Path cells per student sample: lower means a busier campus. */
const STUDENTS_PER_PATH_CELL = 9;
const MIN_DENSITY = 0.07;
const MAX_DENSITY = 0.5;
/** Routes longer than this many cells are skipped, so nobody treks across the whole map. */
const MAX_ROUTE_CELLS = 36;
const FADE_MS = 260;
const SPAWN_EVERY_MS = 140;
const OFFSCREEN_LIMIT_MS = 3500;

interface Spot {
  x: number;
  y: number;
}

interface Stop {
  kind: 'building' | 'quad' | 'gate';
  zone: Zone | null;
  /** The cell the stop is on. */
  cell: Spot;
  /** Index of the path cell beside it. */
  door: number;
}

interface Walker {
  sprite: Phaser.GameObjects.Image;
  look: number;
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

export class Walkers {
  private walkers: Walker[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private banners: Banner[] = [];
  private width = 0;
  private height = 0;
  private isPath: boolean[] = [];
  private pathCells = 0;
  private stops: Stop[] = [];
  private gates: Stop[] = [];
  private students = 0;
  private spawnClock = 0;
  /** Arrivals still to step onto the map: each is a route and a delay. */
  private queue: Array<{ from: Stop; to: Stop; inMs: number }> = [];
  private readonly people: PeopleSpec | null;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {
    this.people = art.people;
  }

  // ------------------------------------------------------------- the map --

  /** Read the paths, buildings and quads again. Called whenever the map changes. */
  setMap(state: GameState): void {
    const { width, height, cells, buildings } = state.map;
    this.width = width;
    this.height = height;
    this.students = enrollment(state);
    this.isPath = cells.map((cell) => cell.kind === 'path');
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

    this.stops = [];
    this.gates = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cell = cells[i]!;
        if (cell.kind === 'lot' && cell.buildingId !== null) {
          const building = buildings[cell.buildingId];
          if (!building || building.stage < 1) continue;
          const door = doorOf(x, y);
          if (door >= 0) this.stops.push({ kind: 'building', zone: building.zone, cell: { x, y }, door });
        } else if (cell.kind === 'quad') {
          const door = doorOf(x, y);
          if (door >= 0) this.stops.push({ kind: 'quad', zone: null, cell: { x, y }, door });
        } else if (cell.kind === 'path') {
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

    // Anyone whose way ahead was dug up leaves quietly.
    for (const walker of this.walkers) {
      for (let k = walker.leg; k < walker.route.length - 1; k++) {
        const spot = walker.route[k]!;
        if (!this.isPath[Math.floor(spot.y) * width + Math.floor(spot.x)]) {
          walker.fading = 'out';
          break;
        }
      }
    }
  }

  /** New students moving in: a group walks in from the edge of campus to the dorms. */
  arrive(count: number): void {
    if (!this.people || count <= 0) return;
    const homes = this.stops.filter((stop) => stop.zone === 'housing');
    if (homes.length === 0) return;

    const view = this.scene.cameras.main.worldView;
    const centre = { x: view.centerX, y: view.centerY };
    const distance = (stop: Stop): number => {
      const at = this.iso.toWorld(stop.cell.x + 0.5, stop.cell.y + 0.5);
      return Math.hypot(at.x - centre.x, at.y - centre.y);
    };
    // Come in by the way onto campus nearest to where the player is looking.
    const ways = this.gates.length > 0 ? this.gates : this.stops;
    const gate = [...ways].sort((a, b) => distance(a) - distance(b))[0];
    if (!gate) return;

    const near = [...homes].sort((a, b) => distance(a) - distance(b)).slice(0, 6);
    const size = Phaser.Math.Clamp(Math.round(count / 6), 3, 18);
    for (let n = 0; n < size; n++) {
      const to = pick(near);
      if (to) this.queue.push({ from: gate, to, inMs: n * 230 });
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
  }

  // -------------------------------------------------------------- routes --

  /** Path cells from one door to another, or null when the paths do not join. */
  private pathBetween(from: number, to: number): number[] | null {
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
        if (!this.isPath[ni] || parent[ni] !== -1) continue;
        parent[ni] = i;
        queue.push(ni);
      }
    }
    if (parent[to] === -1) return null;
    const cells = [to];
    while (cells[cells.length - 1] !== from) cells.push(parent[cells[cells.length - 1]!]!);
    return cells.reverse();
  }

  /** The point where a stop meets its door: the edge of a lot, a spot on the lawn, or the gate itself. */
  private threshold(stop: Stop): Spot {
    const door = { x: (stop.door % this.width) + 0.5, y: Math.floor(stop.door / this.width) + 0.5 };
    if (stop.kind === 'gate') return door;
    const centre = { x: stop.cell.x + 0.5, y: stop.cell.y + 0.5 };
    // Buildings are entered at their edge. On a quad, people stop on the near part of the lawn.
    const reach = stop.kind === 'quad' ? 0.62 + Math.random() * 0.16 : 0.52;
    return { x: door.x + (centre.x - door.x) * reach, y: door.y + (centre.y - door.y) * reach };
  }

  private routeBetween(from: Stop, to: Stop): Spot[] | null {
    const cells = this.pathBetween(from.door, to.door);
    if (!cells || cells.length > MAX_ROUTE_CELLS) return null;
    // Each walker keeps a little to one side, so a crowd is not a single file.
    const side = { x: (Math.random() - 0.5) * 0.44, y: (Math.random() - 0.5) * 0.44 };
    const route: Spot[] = [this.threshold(from)];
    for (const i of cells) route.push({ x: (i % this.width) + 0.5 + side.x, y: Math.floor(i / this.width) + 0.5 + side.y });
    route.push(this.threshold(to));
    return route;
  }

  /** Somewhere to go next: mostly from home to class and back, sometimes to a quad. */
  private destinationFrom(origin: Stop): Stop | undefined {
    const others = this.stops.filter((stop) => stop !== origin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const homes = others.filter((stop) => stop.zone === 'housing');
    const quads = others.filter((stop) => stop.kind === 'quad');
    const roll = Math.random();
    let choice: readonly Stop[];
    if (origin.zone === 'housing') choice = roll < 0.65 ? classes : roll < 0.85 ? quads : homes;
    else if (origin.zone === 'academic') choice = roll < 0.5 ? homes : roll < 0.75 ? classes : quads;
    else choice = roll < 0.5 ? classes : homes;
    return pick(choice.length > 0 ? choice : others);
  }

  // ------------------------------------------------------------- walkers --

  private inView(view: Phaser.Geom.Rectangle, x: number, y: number, margin: number): boolean {
    const at = this.iso.toWorld(x, y);
    return (
      at.x >= view.x - margin && at.x <= view.right + margin && at.y >= view.y - margin && at.y <= view.bottom + margin
    );
  }

  private start(from: Stop, to: Stop, partWay: boolean): boolean {
    const people = this.people;
    if (!people || this.walkers.length >= MAX_WALKERS) return false;
    const route = this.routeBetween(from, to);
    if (!route) return false;

    const sprite = this.pool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
    sprite.setVisible(true).setAlpha(0);
    // Someone already part of the way along, so a view fills with people mid-stride.
    const leg = partWay ? 1 + Math.floor(Math.random() * Math.max(1, route.length - 2)) : 1;
    const begin = route[leg - 1]!;
    this.walkers.push({
      sprite,
      look: Math.floor(Math.random() * Math.min(people.looks, people.crowd ?? people.looks)),
      route,
      leg,
      x: begin.x,
      y: begin.y,
      pace: PACE * (0.8 + Math.random() * 0.45),
      direction: 'se',
      stride: Math.random() * 1000,
      alpha: 0,
      fading: 'in',
      lingerMs: 0,
      goal: to,
      offscreenMs: 0,
      shownKey: '',
    });
    return true;
  }

  private retire(index: number): void {
    const walker = this.walkers[index]!;
    walker.sprite.setVisible(false);
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
      this.start(arrival.from, arrival.to, false);
      this.queue.splice(i, 1);
    }

    // Walk.
    let seen = 0;
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
          const next = this.destinationFrom(walker.goal);
          const route = next ? this.routeBetween(walker.goal, next) : null;
          if (next && route) {
            route[0] = { x: walker.x, y: walker.y };
            walker.route = route;
            walker.leg = 1;
            walker.goal = next;
          } else {
            walker.fading = 'out';
          }
        }
      } else if (walker.fading !== 'out' || walker.leg < walker.route.length) {
        let step = (walker.pace * dt) / 1000;
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
        walker.stride += dt * (walker.pace / PACE);
        if (walker.leg >= walker.route.length && walker.fading !== 'out') {
          if (walker.goal?.kind === 'quad') walker.lingerMs = 2500 + Math.random() * 5000;
          else walker.fading = 'out';
        }
      }

      if (this.inView(view, walker.x, walker.y, 40)) {
        seen += 1;
        walker.offscreenMs = 0;
      } else {
        walker.offscreenMs += dt;
        if (walker.offscreenMs > OFFSCREEN_LIMIT_MS && this.queue.length === 0) {
          this.retire(i);
          continue;
        }
      }
      this.draw(walker, people);
    }

    // Top the view up. More students and a wider view both mean more people.
    this.spawnClock += dt;
    if (this.spawnClock >= SPAWN_EVERY_MS) {
      this.spawnClock = 0;
      const wanted = this.wantedInView(view);
      if (seen < wanted) {
        const here = this.stops.filter((stop) => this.inView(view, stop.cell.x + 0.5, stop.cell.y + 0.5, 0));
        const from = pick(here);
        const to = from ? this.destinationFrom(from) : undefined;
        // An emptier view is filled with people already on their way.
        if (from && to) this.start(from, to, seen < wanted * 0.6);
      }
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
    if (visible === 0) return 0;
    const density = Phaser.Math.Clamp(
      this.students / (this.pathCells * STUDENTS_PER_PATH_CELL),
      MIN_DENSITY,
      MAX_DENSITY,
    );
    return Phaser.Math.Clamp(Math.round(visible * density), Math.min(MIN_IN_VIEW, visible), MAX_IN_VIEW);
  }

  /** How many walkers are alive. For tests and the dev console. */
  get count(): number {
    return this.walkers.length;
  }

  clear(): void {
    for (const walker of this.walkers) walker.sprite.destroy();
    for (const sprite of this.pool) sprite.destroy();
    for (const banner of this.banners) banner.text.destroy();
    this.walkers = [];
    this.pool = [];
    this.banners = [];
    this.queue = [];
    this.stops = [];
    this.gates = [];
  }
}
