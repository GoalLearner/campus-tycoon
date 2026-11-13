import Phaser from 'phaser';
import { BIN_CAPACITY, isBrokenThing, isMessSpot, workersAt, type GameState, type Placed } from '../sim';
import type { Art } from './art';
import { facingOf, type Iso } from './iso';

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

interface Trip {
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
  body: Phaser.GameObjects.Image;
  tool: Phaser.GameObjects.Image;
}

export class GroundsWorkers {
  private trips: Trip[] = [];

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {}

  /** Decide again where each yard's workers are needed. Called whenever the game state changes. */
  setMap(state: GameState): void {
    const wanted: Array<Omit<Trip, 'body' | 'tool'>> = [];
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
        });
      });
    }
    // Keep the sprites that are still needed, so nobody blinks when the minute turns.
    while (this.trips.length > wanted.length) {
      const gone = this.trips.pop()!;
      gone.body.destroy();
      gone.tool.destroy();
    }
    wanted.forEach((trip, i) => {
      const old = this.trips[i];
      if (old) this.trips[i] = { ...trip, body: old.body, tool: old.tool };
      else this.trips.push({ ...trip, body: this.scene.add.image(0, 0, '__DEFAULT'), tool: this.scene.add.image(0, 0, '__DEFAULT') });
    });
  }

  update(timeMs: number): void {
    const people = this.art.people;
    for (const trip of this.trips) {
      const visible = !!people && people.roles?.worker !== undefined;
      trip.body.setVisible(visible);
      trip.tool.setVisible(visible);
      if (!people || !visible) continue;
      const dx = trip.toX - trip.fromX;
      const dy = trip.toY - trip.fromY;
      const walkMs = (Math.max(0.5, Math.abs(dx) + Math.abs(dy)) / SPEED) * 1000;
      const at = (timeMs + trip.offsetMs) % (2 * walkMs + 2 * WORK_MS);
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
      const x = trip.fromX + dx * along;
      const y = trip.fromY + dy * along;
      // The way they walk on the screen, as the view is turned.
      const way = this.iso.dir(outbound ? dx : -dx, outbound ? dy : -dy);
      const direction = facingOf(way.x, way.y);
      const facing = people.flip?.[direction] ?? direction;
      const frame = walking ? Math.floor(timeMs / people.frameMs) % people.frames : 0;
      this.art.apply(trip.body, `person.${people.roles!.worker}.${facing}.${frame}`);
      trip.body.setFlipX(people.flip?.[direction] !== undefined);
      const spot = this.iso.toWorld(x, y);
      const depth = (this.iso.sum(x, y) - 1) * 4 + 2.6;
      trip.body.setPosition(spot.x, spot.y).setDepth(depth);
      // The broom or cart goes beside them: no figure in the pack can hold anything.
      this.art.apply(trip.tool, trip.cart ? 'grounds.cart' : 'grounds.broom');
      const off = this.iso.offset(-0.75, -0.3);
      trip.tool.setPosition(spot.x + off.x, spot.y + off.y).setDepth(depth - 0.1);
      // At rest in the yard between trips, they are indoors.
      const indoors = at >= 2 * walkMs + WORK_MS;
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
