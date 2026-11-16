import Phaser from 'phaser';
import { BIN_CAPACITY, isBrokenThing, isMessSpot, workersAt, type GameState, type Placed } from '../sim';
import type { Art } from './art';
import { facingOf, type Iso } from './iso';
import type { Footprints } from './footprints';

/**
 * Grounds workers, for show. One or two walk out from each staffed Facilities
 * Yard to whatever in its circle most needs them, stay a moment, and walk
 * back, with a broom or a cart beside them. What actually gets cleaned is
 * decided by the sums in the simulation; these only show it happening.
 */

/** Cells a second. */
const SPEED = 1.1;
/** How long a worker stays at the job before walking back. */
const WORK_MS = 3200;
/** At most this many are shown walking from one yard, however many it employs. */
const SHOWN_PER_YARD = 2;

interface Job {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** A cart for a bin, a broom for everything else. */
  cart: boolean;
  /** So two workers from one yard do not walk in step. */
  offsetMs: number;
  /** Whose worker this is, which of that yard's, and the thing they are walking to: what their card needs. */
  yard: number;
  n: number;
  thing: number;
  /** The box of cells of the thing, so the way ends beside it. */
  box: { x: number; y: number; w: number; h: number };
}

interface Trip extends Job {
  /** The way there on foot, along paths and open ground (DESIGN.md 69.5), and the length to each point. */
  pts: Array<{ x: number; y: number }>;
  at: number[];
  total: number;
  /** When its round began: out, work, back, a breather in the yard. */
  t0: number;
  /** The next job, or null to stop: taken up only in the yard, so nobody jumps from one way to another (69.2). */
  next: Job | null | undefined;
  body: Phaser.GameObjects.Image;
  tool: Phaser.GameObjects.Image;
}

/** A way between two places on foot, from the walkers who know the paths, or null for none. */
export type Router = (ax: number, ay: number, box: { x: number; y: number; w: number; h: number }) => Array<{ x: number; y: number }> | null;

export class GroundsWorkers {
  private trips: Trip[] = [];
  private router: Router | null = null;
  private nowMs = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  /** The buildings people sort against (DESIGN.md 69.5). */
  private feet: Footprints | null = null;

  /** The buildings people sort against, so nobody is drawn on a wall (DESIGN.md 69.5). */
  setFootprints(feet: Footprints): void {
    this.feet = feet;
  }

  /** The walkers' paths, so workers walk round buildings and not through them (DESIGN.md 69.5). */
  setRouter(router: Router): void {
    this.router = router;
  }

  /** Decide again where each yard's workers are needed. Called whenever the game state changes. */
  setMap(state: GameState): void {
    const wanted: Job[] = [];
    const g = state.grounds;
    for (const yard of state.map.placed) {
      if (!yard || yard.type !== 'yard') continue;
      const workers = workersAt(state, yard.id);
      if (workers <= 0) continue;
      // What in its care needs someone most: broken things, full bins, then the dirtiest places.
      const jobs: Array<{ thing: Placed; need: number }> = [];
      for (const thing of state.map.placed) {
        if (!thing || state.map.care.yard[thing.id] !== yard.id) continue;
        let need = 0;
        if (isBrokenThing(state, thing.id)) need = 3;
        else if (thing.type === 'bin') need = (g.bins[thing.id] ?? 0) / BIN_CAPACITY;
        else if (isMessSpot(thing)) need = (g.litter[thing.id] ?? 0) / 40;
        if (need > 0.15) jobs.push({ thing, need });
      }
      jobs.sort((a, b) => b.need - a.need || a.thing.id - b.thing.id);
      jobs.slice(0, Math.min(workers, SHOWN_PER_YARD)).forEach((job, n) => {
        wanted.push({
          fromX: yard.x + yard.w / 2,
          fromY: yard.y + yard.h + 0.25,
          toX: job.thing.x + job.thing.w / 2 + (job.thing.type === 'bin' ? 0.45 : 0),
          toY: job.thing.y + job.thing.h + 0.2,
          cart: job.thing.type === 'bin',
          offsetMs: n * 2600 + yard.id * 700,
          yard: yard.id,
          n,
          thing: job.thing.id,
          box: { x: job.thing.x, y: job.thing.y, w: job.thing.w, h: job.thing.h },
        });
      });
    }
    // Keep the sprites that are still needed, so nobody blinks when the minute turns. A worker out on a job finishes
    // it and takes up the next back in the yard; one no longer needed stays in when next there (69.2).
    const first = this.trips.length === 0;
    for (let i = 0; i < Math.max(wanted.length, this.trips.length); i++) {
      const job = wanted[i];
      const old = this.trips[i];
      if (old && job && old.yard === job.yard && old.thing === job.thing) {
        old.next = undefined;
        continue;
      }
      if (old) {
        old.next = job ?? null;
        continue;
      }
      if (!job) continue;
      const trip: Trip = { ...job, pts: [], at: [], total: 0, t0: 0, next: undefined, body: this.scene.add.image(0, 0, '__DEFAULT'), tool: this.scene.add.image(0, 0, '__DEFAULT') };
      this.route(trip);
      // At the first look they are about their rounds already; a new one starts in the yard.
      trip.t0 = first ? -job.offsetMs : this.nowMs - this.cycle(trip).inAt;
      this.trips.push(trip);
    }
  }

  /** The way there on foot: along paths and open ground, or straight when the walkers find none. */
  private route(trip: Trip): void {
    const pts = this.router?.(trip.fromX, trip.fromY, trip.box) ?? [
      { x: trip.fromX, y: trip.fromY },
      { x: trip.toX, y: trip.toY },
    ];
    trip.pts = pts;
    trip.at = [0];
    for (let k = 1; k < pts.length; k++) trip.at.push(trip.at[k - 1]! + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y));
    trip.total = trip.at[trip.at.length - 1]!;
  }

  /** A round's times: walking out, working, walking back, and the breather in the yard from `inAt` to `length`. */
  private cycle(trip: Trip): { walkMs: number; inAt: number; length: number } {
    const walkMs = (Math.max(0.5, trip.total) / SPEED) * 1000;
    return { walkMs, inAt: 2 * walkMs + WORK_MS, length: 2 * walkMs + 2 * WORK_MS };
  }

  update(timeMs: number): void {
    this.nowMs = timeMs;
    const people = this.art.people;
    for (let i = this.trips.length - 1; i >= 0; i--) {
      const trip = this.trips[i]!;
      let { walkMs, inAt, length } = this.cycle(trip);
      let at = (((timeMs - trip.t0) % length) + length) % length;
      // In the yard: the next job, or no more rounds.
      if (at >= inAt && trip.next !== undefined) {
        const next = trip.next;
        if (next === null) {
          trip.body.destroy();
          trip.tool.destroy();
          this.trips.splice(i, 1);
          continue;
        }
        Object.assign(trip, next, { next: undefined });
        this.route(trip);
        ({ walkMs, inAt, length } = this.cycle(trip));
        trip.t0 = timeMs - inAt;
        at = inAt;
      }
      const visible = !!people && people.roles?.worker !== undefined;
      trip.body.setVisible(visible);
      trip.tool.setVisible(visible);
      if (!people || !visible) continue;
      // Out, work, back, and a breather at the yard.
      let along: number;
      let outbound = true;
      let walking = true;
      if (at < walkMs) along = at / walkMs;
      else if (at < walkMs + WORK_MS) {
        along = 1;
        walking = false;
      } else if (at < 2 * walkMs + WORK_MS) {
        along = 1 - (at - walkMs - WORK_MS) / walkMs;
        outbound = false;
      } else {
        along = 0;
        walking = false;
        outbound = false;
      }
      const d = along * trip.total;
      let k = 1;
      while (k < trip.pts.length - 1 && trip.at[k]! < d) k += 1;
      const a = trip.pts[k - 1]!;
      const b = trip.pts[k]!;
      const span = Math.max(1e-6, trip.at[k]! - trip.at[k - 1]!);
      const f = Math.min(1, Math.max(0, (d - trip.at[k - 1]!) / span));
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      // The way they walk on the screen, as the view is turned.
      const way = this.iso.dir(outbound ? b.x - a.x : a.x - b.x, outbound ? b.y - a.y : a.y - b.y);
      const direction = facingOf(way.x, way.y);
      const facing = people.flip?.[direction] ?? direction;
      const frame = walking ? Math.floor(timeMs / people.frameMs) % people.frames : 0;
      this.art.apply(trip.body, `person.${people.roles!.worker}.${facing}.${frame}`);
      trip.body.setFlipX(people.flip?.[direction] !== undefined);
      const spot = this.iso.toWorld(x, y);
      const own = (this.iso.sum(x, y) - 1) * 4 + 2.6;
      const depth = this.feet ? this.feet.depth(x, y, own) : own;
      // Out of the yard's door and back in it: they fade only in the doorway.
      const door = Math.min(1, d / 0.35);
      trip.body.setPosition(spot.x, spot.y).setDepth(depth).setAlpha(door);
      // The broom or cart goes beside them: no figure in the pack can hold anything.
      this.art.apply(trip.tool, trip.cart ? 'grounds.cart' : 'grounds.broom');
      const off = this.iso.offset(-0.75, -0.3);
      trip.tool.setPosition(spot.x + off.x, spot.y + off.y).setDepth(depth - 0.1).setAlpha(door);
      // At rest in the yard between trips, they are indoors.
      const indoors = at >= inAt;
      trip.body.setVisible(!indoors);
      trip.tool.setVisible(!indoors);
    }
  }

  /** The worker under a point of the world, or null. `reach` widens the figure, because it is small under a thumb. */
  workerAt(worldX: number, worldY: number, reach: number): { yard: number; n: number; thing: number } | null {
    for (const trip of this.trips) {
      if (!trip.body.visible) continue;
      const box = trip.body.getBounds();
      if (worldX >= box.x - reach && worldX <= box.right + reach && worldY >= box.y - reach && worldY <= box.bottom + reach) return { yard: trip.yard, n: trip.n, thing: trip.thing };
    }
    return null;
  }

  /** The workers out now and where they are in the world. For the dev screenshot helper. */
  get workersOut(): Array<{ yard: number; n: number; thing: number; x: number; y: number }> {
    return this.trips.filter((trip) => trip.body.visible).map((trip) => ({ yard: trip.yard, n: trip.n, thing: trip.thing, x: trip.body.x, y: trip.body.y }));
  }

  get count(): number {
    return this.trips.length;
  }

  clear(): void {
    for (const trip of this.trips) {
      trip.body.destroy();
      trip.tool.destroy();
    }
    this.trips = [];
  }
}
