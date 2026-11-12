/**
 * Order on the streets (DESIGN.md section 39). For show only: none of this
 * is simulation, none of it is saved, and nothing here is counted.
 *
 * The rules, in plain functions that need no game engine:
 *
 * - A car keeps a gap behind the one in front, so cars queue and never drive
 *   through each other.
 * - A junction has a stop sign on every approach. A car stops at the line,
 *   and then they go one at a time, first come first served. Nobody enters
 *   until the way out has room, so a junction always clears.
 * - A marked crossing belongs to whoever is on it. A car stops at the line
 *   while anybody is on the crossing, and a person waits at the kerb while a
 *   car has it. A car that has waited a while for a stream of people is let
 *   through: the next people wait at the kerb.
 * - People cross the avenue at the crossings beside its junctions.
 *
 * A junction and the crossings beside it are one zone. One car holds a zone
 * at a time, but for two that go straight through it in opposite directions:
 * their paths do not cross, so they may pass. That is the whole of why two
 * cars never cross paths.
 */

export type Heading = 'px' | 'nx' | 'py' | 'ny';

/**
 * Cars keep to one side of the road. Offsets from the middle of a cell, in
 * cells. A little wider apart than they were (0.16 and 0.14), so two cars
 * passing in opposite lanes overlap less. The pack's cars are wider than half
 * its road, so they still brush.
 */
export const LANE: Record<Heading, { x: number; y: number }> = {
  px: { x: 0, y: 0.21 },
  nx: { x: 0, y: -0.21 },
  py: { x: -0.2, y: 0 },
  ny: { x: 0.2, y: 0 },
};

/** Which way each heading points, in cells. */
export const AHEAD: Record<Heading, { x: number; y: number }> = {
  px: { x: 1, y: 0 },
  nx: { x: -1, y: 0 },
  py: { x: 0, y: 1 },
  ny: { x: 0, y: -1 },
};

/** Cells a second: a town speed, not a highway's. A bus or a truck is slower. */
export const CAR_SPEED = 1.6;
export const LONG_SPEED = 1.3;
/** The room a car keeps behind the one in front, in cells, and how much more a bus or a truck takes. */
export const GAP = 1.0;
export const LONG_GAP = 0.3;
/** How far along the leg into a zone the stop line is. Half way is the edge of the zone's first cell. */
export const LINE = 0.25;
/** How far along the leg out of a zone a car is right out of it: its tail is clear of the last cell. */
export const OUT = 0.72;
/** How long a car stands at a stop sign before it may go. */
export const STOP_MS = 650;
/** A car that has waited this long for people to finish crossing is let through next. */
export const WALKERS_FIRST_MS = 2500;
/** A car pulling out of a driveway or a car park waits for this much clear road around where it joins, in cells. */
export const MERGE_ROOM = 1.05;
/** A car that cannot move for this long gives up and leaves the road. It is a safety net, and the tests expect it never to be used. */
export const GIVE_UP_MS = 60_000;
/** Where people stand on the avenue: its campus-side walk, and its far kerb, as shares of the cell from its campus edge. */
export const KERB_NEAR = 0.09;
export const KERB_FAR = 0.92;

const NO_LANE = { x: 0, y: 0 };
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Zone {
  id: number;
  cells: number[];
  /** True when it holds a junction: every car stops at its sign. False for a crossing by itself: a car stops only for people. */
  stop: boolean;
}

export interface TrafficSign {
  kind: 'stop' | 'crossing';
  /** Where it stands, in cells, with the middle of a cell at a whole number. */
  x: number;
  y: number;
}

export interface TrafficPlan {
  width: number;
  height: number;
  /** The column of the avenue along the campus edge. */
  avenue: number;
  drivable: boolean[];
  /** A road cell with three or four road neighbours. */
  junction: boolean[];
  /** A marked crossing for people. */
  zebra: boolean[];
  /** Which zone a cell is in, or -1. */
  zoneOf: number[];
  zones: Zone[];
  signs: TrafficSign[];
  /** Avenue cells with no road joining from the campus side: people on its near walk and its far kerb are off the road there. */
  kerbed: boolean[];
}

/**
 * Read the roads once: where the junctions are, where people cross, which
 * cells make up each zone and where each sign stands.
 *
 * `kinds` is each cell's kind, as the map has it. A 'crossing' is a path over
 * a road the player laid. The town's own crossings are worked out here and
 * are not in the map: they are the avenue cells beside each junction with a
 * side street, where people walking in from town cross.
 */
export function planTraffic(width: number, height: number, kinds: readonly string[], avenue: number): TrafficPlan {
  const size = width * height;
  const drivable = kinds.map((kind) => kind === 'road' || kind === 'street' || kind === 'crossing');
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x);
  const roadAt = (x: number, y: number): boolean => {
    const i = at(x, y);
    return i >= 0 && drivable[i]!;
  };
  const junction = new Array<boolean>(size).fill(false);
  for (let i = 0; i < size; i++) {
    if (!drivable[i] || kinds[i] === 'crossing') continue;
    const x = i % width;
    const y = (i - x) / width;
    let arms = 0;
    for (const [dx, dy] of NEIGHBOURS) if (roadAt(x + dx, y + dy)) arms += 1;
    junction[i] = arms >= 3;
  }

  const zebra = kinds.map((kind) => kind === 'crossing');
  // The town: beside each junction where a side street meets the avenue, the avenue cell to each side is a crossing.
  for (let y = 0; y < height; y++) {
    const here = at(avenue, y);
    if (here < 0 || !junction[here] || kinds[here] !== 'street' || !roadAt(avenue + 1, y)) continue;
    for (const dy of [-1, 1]) {
      const beside = at(avenue, y + dy);
      if (beside >= 0 && kinds[beside] === 'street' && !junction[beside]) zebra[beside] = true;
    }
  }

  const kerbed = new Array<boolean>(size).fill(false);
  for (let y = 0; y < height; y++) {
    const here = at(avenue, y);
    if (here >= 0 && kinds[here] === 'street') kerbed[here] = !roadAt(avenue - 1, y);
  }

  // A zone is a run of junctions and crossings that touch: one car holds it at a time.
  const zoneOf = new Array<number>(size).fill(-1);
  const zones: Zone[] = [];
  for (let start = 0; start < size; start++) {
    if (zoneOf[start] !== -1 || !(junction[start] || zebra[start])) continue;
    const zone: Zone = { id: zones.length, cells: [], stop: false };
    const queue = [start];
    zoneOf[start] = zone.id;
    while (queue.length > 0) {
      const cell = queue.pop()!;
      zone.cells.push(cell);
      if (junction[cell]) zone.stop = true;
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const next = at(x + dx, y + dy);
        if (next >= 0 && zoneOf[next] === -1 && (junction[next] || zebra[next])) {
          zoneOf[next] = zone.id;
          queue.push(next);
        }
      }
    }
    zone.cells.sort((a, b) => a - b);
    zones.push(zone);
  }

  // A sign on every way into a zone, at the line, on the kerb of the lane that comes in.
  const signs: TrafficSign[] = [];
  for (const zone of zones) {
    for (const cell of zone.cells) {
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const from = at(x + dx, y + dy);
        if (from < 0 || !drivable[from] || zoneOf[from] === zone.id) continue;
        // A car comes in from that cell, heading the other way.
        const heading: Heading = dx === 1 ? 'nx' : dx === -1 ? 'px' : dy === 1 ? 'ny' : 'py';
        const way = AHEAD[heading];
        const lane = LANE[heading];
        const side = { x: Math.sign(lane.x), y: Math.sign(lane.y) };
        // The line is a little before the edge of the zone. The sign stands beside it, off the road.
        signs.push({ kind: zone.stop ? 'stop' : 'crossing', x: x + dx + way.x * LINE + side.x * 0.47, y: y + dy + way.y * LINE + side.y * 0.47 });
      }
    }
  }

  return { width, height, avenue, drivable, junction, zebra, zoneOf, zones, signs, kerbed };
}

/**
 * The crossing somebody uses to get over the avenue at a side street: the
 * crossing on their own side of the street if there is one, the one on the
 * other side if not, and -1 where neither is marked.
 */
export function crossingFor(plan: TrafficPlan, row: number, side: number): number {
  for (const dy of [side, -side]) {
    const y = row + dy;
    if (y < 0 || y >= plan.height) continue;
    const cell = y * plan.width + plan.avenue;
    if (plan.zebra[cell]) return cell;
  }
  return -1;
}

/**
 * Is somebody standing at this spot on the road itself, in a zone? `x` and
 * `y` are in cells with a cell's corner at a whole number, as people are
 * placed. On the avenue the near walk and the far kerb are off the road.
 */
export function onRoadway(plan: TrafficPlan, x: number, y: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= plan.width || cy >= plan.height) return -1;
  const cell = cy * plan.width + cx;
  if ((plan.zoneOf[cell] ?? -1) < 0) return -1;
  if (plan.kerbed[cell]) {
    const across = x - cx;
    if (across <= KERB_NEAR + 0.06 || across >= KERB_FAR - 0.05) return -1;
  }
  return cell;
}

// ------------------------------------------------------------------ cars --

export interface RouteNode {
  x: number;
  y: number;
  /** False for a driveway or a car park at the end of a route. */
  road: boolean;
}

export interface TrafficCar {
  route: RouteNode[];
  /** The leg being driven: from route[leg] to route[leg + 1]. */
  leg: number;
  /** How far along that leg, from 0 to 1. */
  along: number;
  /** A bus or a truck. */
  long: boolean;
  /** Standing still for this long yet: at a stop, or making a delivery. */
  pauseMs: number;
  /** Legs at whose end it pauses, and for how long. */
  pauseAt: Map<number, number>;
  /** Above 0 for the shuttle, which starts its round again at the end. */
  loop: number;
  heading: Heading;
  /** Where it is, in cells, with the middle of a cell at a whole number. */
  x: number;
  y: number;
  onRoad: boolean;
  /** The zone it holds, or -1. */
  zone: number;
  /** How it goes through that zone: 1 or -1 straight along a row, 2 or -2 straight along a column, 0 when it turns. */
  pass: number;
  /** The zone whose line it stands at, when it got there, and how long it must still stand. */
  waitingAt: number;
  arrived: number;
  stopMs: number;
  /** How long it has waited at a line for people, and how long since it last moved at all. */
  waitedMs: number;
  stillMs: number;
  /** At the end of its route. */
  done: boolean;
  /** Fading out, or given up: it no longer holds anything or blocks anybody. */
  leaving: boolean;
}

/** A car at the start of a route, with everything the rules keep about it. */
export function newCar(route: RouteNode[], long: boolean, pauseAt = new Map<number, number>()): TrafficCar {
  return { route, leg: 0, along: 0, long, pauseMs: 0, pauseAt, loop: 0, heading: 'px', x: 0, y: 0, onRoad: false, zone: -1, pass: 0, waitingAt: -1, arrived: 0, stopMs: 0, waitedMs: 0, stillMs: 0, done: false, leaving: false };
}

const way = (p: RouteNode, q: RouteNode): Heading | null => (q.x > p.x ? 'px' : q.x < p.x ? 'nx' : q.y > p.y ? 'py' : q.y < p.y ? 'ny' : null);

/**
 * Where in the road a car is as it passes one step of its route: in the lane
 * of the way it came, the lane of the way it leaves, or, at a corner, half
 * way between the two. Off the road there is no lane.
 */
function laneAt(car: TrafficCar, index: number): { x: number; y: number } {
  const route = car.route;
  const here = route[index]!;
  if (!here.road) return NO_LANE;
  const before = index > 0 ? way(route[index - 1]!, here) : null;
  const after = index < route.length - 1 ? way(here, route[index + 1]!) : null;
  const first = LANE[before ?? after ?? car.heading];
  const second = LANE[after ?? before ?? car.heading];
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

/** Work out where a car is and which way it faces from how far along its route it has come. */
export function placeCar(car: TrafficCar): void {
  const from = car.route[car.leg]!;
  const to = car.route[Math.min(car.leg + 1, car.route.length - 1)]!;
  car.heading = way(from, to) ?? car.heading;
  // On the road it keeps to its lane. At a corner it cuts across from the lane it was in to the lane it is turning into.
  const a = laneAt(car, car.leg);
  const b = laneAt(car, Math.min(car.leg + 1, car.route.length - 1));
  car.x = from.x + a.x + (to.x + b.x - from.x - a.x) * car.along;
  car.y = from.y + a.y + (to.y + b.y - from.y - a.y) * car.along;
  car.onRoad = from.road && to.road;
}

export class Traffic {
  /** Which cars hold each zone: one, or two going straight through in opposite directions. */
  private holder = new Map<number, TrafficCar[]>();
  /** Zones a car has waited at long enough for people: the next people wait at the kerb. */
  private asking = new Set<number>();
  private order = 0;
  /** Cars that gave up because they could not move. The tests expect none. */
  gaveUp = 0;

  constructor(public plan: TrafficPlan) {}

  /** The roads changed. Nothing is held on the new ones yet. */
  setPlan(plan: TrafficPlan): void {
    this.plan = plan;
    this.holder.clear();
    this.asking.clear();
  }

  private zoneAt(node: RouteNode | undefined): number {
    if (!node || !node.road) return -1;
    return this.plan.zoneOf[node.y * this.plan.width + node.x] ?? -1;
  }

  /** Asked by people at a kerb: does a car have this crossing, or is one due it? */
  claims(cell: number): boolean {
    const zone = this.plan.zoneOf[cell] ?? -1;
    return zone >= 0 && ((this.holder.get(zone)?.length ?? 0) > 0 || this.asking.has(zone));
  }

  /** The zone a cell is in, or -1. */
  zoneOfCell(cell: number): number {
    return this.plan.zoneOf[cell] ?? -1;
  }

  /**
   * How far ahead of a point on this car's own route another car is, in
   * cells along the road. The point is `along` of the way down leg `index`.
   * A car counts only while it is on a stretch this car is about to drive,
   * going the same way: one passing in the other lane, or turning off, is
   * not in its way. Infinity when it is on none of the next `span` legs.
   */
  private ahead(car: TrafficCar, other: TrafficCar, index: number, along: number, first: number, span: number): number {
    const from = other.route[other.leg];
    const to = other.route[other.leg + 1];
    if (!from || !to) return Infinity;
    for (let j = Math.max(0, first); j <= index + span; j++) {
      const a = car.route[j];
      const b = car.route[j + 1];
      if (!a || !b) break;
      if (a.x === from.x && a.y === from.y && b.x === to.x && b.y === to.y) return j + other.along - (index + along);
    }
    return Infinity;
  }

  /**
   * Is another car close ahead on the road this car is driving? It looks
   * along its own route, round bends too, so cars queue behind one that has
   * stopped past a corner. Only the one behind ever waits, so nobody locks.
   */
  private blocked(cars: readonly TrafficCar[], car: TrafficCar, index: number): boolean {
    if (!car.onRoad) return false;
    for (let j = 0; j < cars.length; j++) {
      if (j === index) continue;
      const other = cars[j]!;
      if (!other.onRoad || other.leaving || other.done) continue;
      const front = this.ahead(car, other, car.leg, car.along, car.leg, 2);
      if (front === Infinity) continue;
      const gap = GAP + (car.long ? LONG_GAP : 0) + (other.long ? LONG_GAP : 0);
      // Two on the same spot: the later one lets the earlier one go.
      if (front > 1e-6 ? front < gap : front > -1e-6 && j < index) return true;
    }
    return false;
  }

  /** Pulling out of a driveway or a car park: it waits while a car is on the road right where it would join. */
  private noRoomToPullOut(cars: readonly TrafficCar[], car: TrafficCar): boolean {
    const from = car.route[car.leg];
    const to = car.route[car.leg + 1];
    if (!from || !to || from.road || !to.road || car.along >= 0.5) return false;
    for (const other of cars) {
      if (other === car || !other.onRoad || other.leaving || other.done) continue;
      if (Math.abs(other.x - to.x) < MERGE_ROOM && Math.abs(other.y - to.y) < MERGE_ROOM) return true;
    }
    return false;
  }

  /** Is there room beyond the zone for this car to get right out of it? */
  private exitClear(cars: readonly TrafficCar[], car: TrafficCar, zone: number): boolean {
    let k = car.leg + 1;
    while (k < car.route.length && this.zoneAt(car.route[k]) === zone) k += 1;
    const exit = car.route[k];
    if (!exit || !exit.road) return true;
    // It is right out a little before the middle of the first cell beyond. It must be able to get that far and
    // still keep its gap, or it would stand in the zone: a car within a gap of there is in its way.
    for (const other of cars) {
      if (other === car || !other.onRoad || other.leaving || other.done) continue;
      const front = this.ahead(car, other, k, 0, k - 1, 1);
      if (front === Infinity) continue;
      if (front < GAP - (1 - OUT) + (car.long ? LONG_GAP : 0) + (other.long ? LONG_GAP : 0)) return false;
    }
    return true;
  }

  /** How this car goes through the zone ahead: straight along a row or a column, and which way, or 0 for a turn. */
  private passThrough(car: TrafficCar, zone: number): number {
    let k = car.leg + 1;
    while (k < car.route.length && this.zoneAt(car.route[k]) === zone) k += 1;
    const from = car.route[car.leg]!;
    const to = car.route[Math.min(k, car.route.length - 1)]!;
    let alongRow = true;
    let alongColumn = true;
    for (let j = car.leg; j <= Math.min(k, car.route.length - 1); j++) {
      if (car.route[j]!.y !== from.y) alongRow = false;
      if (car.route[j]!.x !== from.x) alongColumn = false;
    }
    if (alongRow && to.x !== from.x) return Math.sign(to.x - from.x);
    if (alongColumn && to.y !== from.y) return 2 * Math.sign(to.y - from.y);
    return 0;
  }

  private mayEnter(cars: readonly TrafficCar[], car: TrafficCar, zone: number, walkerOn: (cell: number) => boolean): boolean {
    // Whoever is in it must be going straight through the other way: any other two would cross.
    const pass = this.passThrough(car, zone);
    const held = this.holder.get(zone) ?? [];
    if (held.length >= 2) return false;
    for (const other of held) if (other !== car && (pass === 0 || other.pass !== -pass)) return false;
    for (const cell of this.plan.zones[zone]!.cells) if (walkerOn(cell)) return false;
    if (!this.exitClear(cars, car, zone)) return false;
    if (this.plan.zones[zone]!.stop) {
      // First come, first served, among those who have stood their stop and have room to leave by.
      for (const other of cars) {
        if (other === car || other.leaving || other.done || other.waitingAt !== zone || other.stopMs > 0) continue;
        if (other.arrived < car.arrived && this.exitClear(cars, other, zone)) return false;
      }
    }
    return true;
  }

  private take(car: TrafficCar, zone: number, pass: number): void {
    const held = this.holder.get(zone) ?? [];
    if (!held.includes(car)) held.push(car);
    this.holder.set(zone, held);
    car.zone = zone;
    car.pass = pass;
  }

  private release(car: TrafficCar): void {
    const held = car.zone >= 0 ? this.holder.get(car.zone) : undefined;
    if (held) {
      const at = held.indexOf(car);
      if (at >= 0) held.splice(at, 1);
      if (held.length === 0) this.holder.delete(car.zone);
    }
    car.zone = -1;
    car.pass = 0;
  }

  /** A car is taken off the road. Whatever it held is free. */
  forget(car: TrafficCar): void {
    this.release(car);
    car.waitingAt = -1;
  }

  /**
   * Move every car on by `dtMs`. `walkerOn` says whether somebody is on a
   * crossing, or stepping onto it, this frame.
   */
  step(cars: readonly TrafficCar[], dtMs: number, walkerOn: (cell: number) => boolean): void {
    for (const [zone, held] of this.holder) {
      const still = held.filter((car) => !car.leaving && !car.done && cars.includes(car));
      if (still.length === 0) this.holder.delete(zone);
      else if (still.length !== held.length) this.holder.set(zone, still);
    }
    this.asking.clear();
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]!;
      if (car.leaving || car.done) {
        if (car.zone >= 0) this.release(car);
        continue;
      }
      if (car.pauseMs > 0) {
        car.pauseMs -= dtMs;
        placeCar(car);
        continue;
      }
      let move = ((car.long ? LONG_SPEED : CAR_SPEED) * dtMs) / 1000;
      if (this.blocked(cars, car, i) || this.noRoomToPullOut(cars, car)) move = 0;

      // A zone ahead that it does not hold: up to the line, and no further until it may go.
      const from = car.route[car.leg];
      const next = car.route[Math.min(car.leg + 1, car.route.length - 1)];
      const ahead = this.zoneAt(next);
      let waitsForPeople = false;
      if (ahead >= 0 && ahead !== car.zone && ahead !== this.zoneAt(from)) {
        if (car.along + move >= LINE) {
          if (car.waitingAt !== ahead) {
            car.waitingAt = ahead;
            car.arrived = this.order++;
            car.stopMs = this.plan.zones[ahead]!.stop && car.along <= LINE + 0.05 ? STOP_MS : 0;
            car.waitedMs = 0;
          }
          if (car.along < LINE) {
            // Roll up to the line.
            car.along = LINE;
            car.stillMs = 0;
          }
          if (car.stopMs > 0) {
            car.stopMs -= dtMs;
            move = 0;
          } else if (move > 0 && this.mayEnter(cars, car, ahead, walkerOn)) {
            this.take(car, ahead, this.passThrough(car, ahead));
            car.waitingAt = -1;
          } else {
            move = 0;
            waitsForPeople = this.plan.zones[ahead]!.cells.some((cell) => walkerOn(cell));
          }
        }
      } else if (ahead >= 0 && car.zone !== ahead && !this.holder.has(ahead)) {
        // Found inside a zone it does not hold: it was set down there as the map opened. It holds it now.
        this.take(car, ahead, 0);
      }

      if (waitsForPeople) {
        car.waitedMs += dtMs;
        if (car.waitedMs >= WALKERS_FIRST_MS) this.asking.add(car.waitingAt);
      } else car.waitedMs = 0;

      if (move > 0) {
        car.stillMs = 0;
        car.along += move;
        while (car.along >= 1 && car.leg < car.route.length - 2) {
          const pause = car.pauseAt.get(car.leg);
          car.along -= 1;
          car.leg += 1;
          if (pause) {
            // Pulled up at a stop: stand at the start of the next leg until the pause is over.
            car.along = 0;
            car.pauseMs = pause;
            break;
          }
        }
        if (car.along >= 1) {
          if (car.loop > 0) {
            // The shuttle's round ends where it began.
            const pause = car.pauseAt.get(car.leg) ?? 0;
            car.leg = 0;
            car.along = 0;
            car.pauseMs = pause;
          } else {
            // The end of the road: into the car park, onto a driveway, or off the edge of the map.
            car.along = 1;
            car.done = true;
          }
        }
        // Right out of the zone it held: the next one may go.
        if (car.zone >= 0 && this.zoneAt(car.route[Math.min(car.leg + 1, car.route.length - 1)]) !== car.zone && (this.zoneAt(car.route[car.leg]) !== car.zone || car.along >= OUT)) this.release(car);
        if (car.done) this.release(car);
      } else {
        car.stillMs += dtMs;
        if (car.stillMs >= GIVE_UP_MS) {
          car.leaving = true;
          this.gaveUp += 1;
          this.release(car);
          car.waitingAt = -1;
        }
      }
      placeCar(car);
    }
  }
}

// ---------------------------------------------------------------- people --

/** A point somebody walks through, in cells with a cell's corner at a whole number. */
export interface WalkPoint {
  x: number;
  y: number;
  /** The crossing the walk up to this point goes over. They wait at the point before it while a car has that crossing. */
  cross?: number;
}

/**
 * The points somebody walks through to get over the avenue at a side street,
 * in the order walked when coming out of the street. From the street's own
 * sidewalk they turn the corner along the avenue's far kerb, reach the marked
 * crossing, and go straight over to the near walk. Nobody cuts across the
 * junction itself.
 *
 * `row` is the side street's row and `side` is which of its sidewalks they
 * are on: -1 for the one above the street on the map, 1 for the one below.
 * `sidewalk` is how far a sidewalk is from the middle of a street.
 */
export function avenueCrossing(plan: TrafficPlan, row: number, side: number, sidewalk: number): WalkPoint[] {
  const zebra = crossingFor(plan, row, side);
  const junction = row * plan.width + plan.avenue;
  const corner = { x: plan.avenue + KERB_FAR, y: row + 0.5 + side * sidewalk };
  if (zebra < 0) {
    // No marked crossing beside this junction: straight over at the corner, and the junction itself is what they wait for.
    return [corner, { x: plan.avenue + KERB_NEAR, y: corner.y, cross: junction }];
  }
  const y = Math.floor(zebra / plan.width) + 0.5;
  return [corner, { x: plan.avenue + KERB_FAR, y }, { x: plan.avenue + KERB_NEAR, y, cross: zebra }];
}

/** The same walk the other way: from the avenue's near walk, over the crossing, round the corner into the street. */
export function avenueCrossingBack(plan: TrafficPlan, row: number, side: number, sidewalk: number): WalkPoint[] {
  const out = avenueCrossing(plan, row, side, sidewalk);
  const cross = out[out.length - 1]!.cross;
  const back: WalkPoint[] = out.map((point) => ({ x: point.x, y: point.y })).reverse();
  // Going back, it is the step off the near walk that goes over the crossing.
  if (cross !== undefined && back[1]) back[1] = { ...back[1], cross };
  return back;
}
