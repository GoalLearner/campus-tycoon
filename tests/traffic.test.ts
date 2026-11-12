import { describe, expect, it } from 'vitest';
import {
  avenueCrossing,
  avenueCrossingBack,
  CAR_SPEED,
  crossingFor,
  GAP,
  KERB_FAR,
  KERB_NEAR,
  LINE,
  newCar,
  onRoadway,
  placeCar,
  planTraffic,
  STOP_MS,
  Traffic,
  type RouteNode,
  type TrafficCar,
  type TrafficPlan,
} from '../src/app/traffic';
import { newGame } from '../src/sim';
import { TOWN_X } from '../src/sim/config/town';
import { T0, testRandom } from './helpers';

/**
 * Order on the streets (DESIGN.md section 39). The rules are plain functions,
 * so they are tested here without the game engine: a little map, cars set on
 * routes, and time moved on a frame at a time.
 */

const FRAME = 16;

/** A map from rows of text: '.' ground, '#' road, 'x' a path over a road, 's' the town's street. */
function mapOf(rows: string[], avenue = 99): TrafficPlan {
  const kinds = rows.flatMap((row) => [...row].map((c) => (c === '#' ? 'road' : c === 'x' ? 'crossing' : c === 's' ? 'street' : 'empty')));
  return planTraffic(rows[0]!.length, rows.length, kinds, avenue);
}

const road = (cells: Array<[number, number]>): RouteNode[] => cells.map(([x, y]) => ({ x, y, road: true }));
const line = (from: [number, number], to: [number, number]): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  const dx = Math.sign(to[0] - from[0]);
  const dy = Math.sign(to[1] - from[1]);
  for (let x = from[0], y = from[1]; ; x += dx, y += dy) {
    out.push([x, y]);
    if (x === to[0] && y === to[1]) break;
  }
  return out;
};

function car(route: RouteNode[], long = false): TrafficCar {
  const one = newCar(route, long);
  placeCar(one);
  return one;
}

const cellOf = (plan: TrafficPlan, one: TrafficCar): number => Math.round(one.y) * plan.width + Math.round(one.x);
const same = (a: RouteNode | undefined, b: RouteNode | undefined): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
/**
 * True when two cars are on the same stretch of road going the same way, or one is on the stretch the other
 * drives next round a plain bend. A car standing at the line of a junction while another drives through it is
 * not behind that car: the junction keeps those two apart, and another check covers it.
 */
function sameStream(plan: TrafficPlan, a: TrafficCar, b: TrafficCar): boolean {
  const [af, at, bf, bt] = [a.route[a.leg], a.route[a.leg + 1], b.route[b.leg], b.route[b.leg + 1]];
  if (same(af, bf) && same(at, bt)) return true;
  const plain = (node: RouteNode | undefined): boolean => !!node && plan.zoneOf[node.y * plan.width + node.x] === -1;
  return (same(at, bf) && !same(af, bt) && plain(at)) || (same(bt, af) && !same(bf, at) && plain(bt));
}
const nobody = (): boolean => false;

describe('reading the roads', () => {
  const plan = mapOf(['....#....', '....#....', '#########', '....#....', '..x.#....']);

  it('finds a junction where three or four roads meet, and nowhere else', () => {
    const junctions = plan.junction.map((is, i) => (is ? i : -1)).filter((i) => i >= 0);
    expect(junctions).toEqual([2 * 9 + 4]);
  });

  it('makes a junction a zone where cars stop, with a sign on every way in', () => {
    const zone = plan.zones[plan.zoneOf[2 * 9 + 4]!]!;
    expect(zone.stop).toBe(true);
    expect(plan.signs.filter((sign) => sign.kind === 'stop').length).toBe(4);
    // Each sign stands off the road, beside the line.
    for (const sign of plan.signs.filter((one) => one.kind === 'stop')) {
      const off = Math.min(Math.abs(sign.x - Math.round(sign.x)), Math.abs(sign.y - Math.round(sign.y)));
      expect(Math.max(Math.abs(sign.x - 4), Math.abs(sign.y - 2))).toBeLessThan(1.5);
      expect(off).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a plain bend or a dead end alone', () => {
    const bend = mapOf(['###', '..#', '..#']);
    expect(bend.junction.some(Boolean)).toBe(false);
    expect(bend.zones).toEqual([]);
    expect(bend.signs).toEqual([]);
  });

  it('makes junctions that touch one zone, so one car is in the cluster at a time', () => {
    const block = mapOf(['.##.', '####', '####', '.##.']);
    const zones = new Set(block.zoneOf.filter((zone) => zone >= 0));
    expect(zones.size).toBe(1);
  });
});

describe('the town on the model campus', () => {
  const state = newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' });
  const map = state.map;
  const plan = planTraffic(map.width, map.height, map.cells.map((cell) => cell.kind), TOWN_X);
  const rows = map.town.neighbourhoods.map((hood) => hood.row);

  it('has a stop-sign junction where each side street meets the avenue, and a marked crossing beside it', () => {
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) {
      const junction = row * map.width + TOWN_X;
      expect(plan.junction[junction], `row ${row}`).toBe(true);
      expect(plan.zebra[junction]).toBe(false);
      // A crossing on one side of the junction at least, and it is a straight piece of the avenue.
      const beside = [-1, 1].map((dy) => (row + dy) * map.width + TOWN_X).filter((cell) => plan.zebra[cell]);
      expect(beside.length, `row ${row}`).toBeGreaterThanOrEqual(1);
      for (const cell of beside) {
        expect(plan.junction[cell]).toBe(false);
        expect(plan.zoneOf[cell]).toBe(plan.zoneOf[junction]);
      }
      expect(plan.zones[plan.zoneOf[junction]!]!.stop).toBe(true);
    }
    expect(plan.signs.filter((sign) => sign.kind === 'stop').length).toBeGreaterThanOrEqual(rows.length * 3);
  });

  it('takes people over the avenue at the marked crossing and nowhere else', () => {
    const sidewalk = 0.36;
    for (const row of rows) {
      for (const side of [-1, 1]) {
        const zebra = crossingFor(plan, row, side);
        expect(zebra).toBeGreaterThanOrEqual(0);
        for (const points of [avenueCrossing(plan, row, side, sidewalk), avenueCrossingBack(plan, row, side, sidewalk)]) {
          expect(points.filter((point) => point.cross !== undefined).length).toBe(1);
          for (let n = 1; n < points.length; n++) {
            const a = points[n - 1]!;
            const b = points[n]!;
            // Walk the leg in small steps: the only road stepped on is the crossing the leg is marked with.
            for (let t = 0; t <= 1; t += 0.05) {
              const on = onRoadway(plan, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
              if (on >= 0) {
                expect(b.cross, `row ${row} side ${side}`).toBe(zebra);
                expect(on).toBe(zebra);
              }
            }
          }
          // It starts or ends at the corner of the side street, on its own sidewalk, and the other end is the near walk.
          const ends = [points[0]!, points[points.length - 1]!];
          expect(ends.some((end) => Math.abs(end.x - (TOWN_X + KERB_FAR)) < 1e-9 && Math.abs(end.y - (row + 0.5 + side * sidewalk)) < 1e-9)).toBe(true);
          expect(ends.some((end) => Math.abs(end.x - (TOWN_X + KERB_NEAR)) < 1e-9)).toBe(true);
        }
      }
    }
  });

  it('counts someone on the near walk or the far kerb of the avenue as off the road', () => {
    const row = rows[0]!;
    const zebra = crossingFor(plan, row, -1);
    const y = Math.floor(zebra / map.width) + 0.5;
    expect(onRoadway(plan, TOWN_X + KERB_NEAR, y)).toBe(-1);
    expect(onRoadway(plan, TOWN_X + KERB_FAR, y)).toBe(-1);
    expect(onRoadway(plan, TOWN_X + 0.5, y)).toBe(zebra);
    // A stretch of the avenue with no crossing is nobody's to cross.
    const plain = map.cells.findIndex((cell, i) => cell.kind === 'street' && i % map.width === TOWN_X && plan.zoneOf[i] === -1);
    expect(onRoadway(plan, TOWN_X + 0.5, Math.floor(plain / map.width) + 0.5)).toBe(-1);
  });
});

describe('cars keep a gap', () => {
  it('never close on the car in front, and queue behind one that has stopped', () => {
    const plan = mapOf(['############']);
    const traffic = new Traffic(plan);
    const cars = [car(road(line([0, 0], [11, 0])))];
    // The one in front stands for a while, as a bus does at its stop.
    cars[0]!.leg = 6;
    cars[0]!.pauseMs = 4000;
    placeCar(cars[0]!);
    let least = Infinity;
    for (let t = 0; t < 24_000; t += FRAME) {
      if (t === 0 || t === 1280 || t === 2560) cars.push(car(road(line([0, 0], [11, 0]))));
      traffic.step(cars, FRAME, nobody);
      const on = cars.filter((one) => !one.done);
      for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) least = Math.min(least, Math.abs(on[a]!.x - on[b]!.x));
    }
    expect(least).toBeGreaterThanOrEqual(GAP - (CAR_SPEED * FRAME) / 1000 - 1e-6);
    expect(cars.every((one) => one.done)).toBe(true);
    expect(traffic.gaveUp).toBe(0);
  });

  it('drive at a town speed', () => {
    expect(CAR_SPEED).toBeLessThanOrEqual(1.8);
    expect(CAR_SPEED).toBeGreaterThanOrEqual(1.2);
  });
});

describe('a crossing belongs to whoever is on it', () => {
  const plan = mapOf(['######x######']);
  const crossing = 6;

  it('stops a car at the line while somebody is on it, and lets it go when they are over', () => {
    const traffic = new Traffic(plan);
    const one = car(road(line([0, 0], [12, 0])));
    let on = true;
    for (let t = 0; t < 8000; t += FRAME) {
      if (t >= 6000) on = false;
      traffic.step([one], FRAME, (cell) => on && cell === crossing);
      if (on) {
        // Never on the crossing, or past the line, while somebody is on it.
        expect(cellOf(plan, one)).not.toBe(crossing);
        expect(one.x).toBeLessThanOrEqual(5 + LINE + 1e-6);
      }
    }
    expect(one.x).toBeGreaterThan(6.4);
    expect(traffic.gaveUp).toBe(0);
  });

  it('is the car\'s when nobody is on it: it drives over without stopping, and people wait at the kerb', () => {
    const traffic = new Traffic(plan);
    const one = car(road(line([0, 0], [12, 0])));
    let held = 0;
    let slowest = Infinity;
    let last = one.x;
    for (let t = 0; t < 6000 && !one.done; t += FRAME) {
      traffic.step([one], FRAME, nobody);
      if (traffic.claims(crossing)) {
        held += 1;
        // While it has the crossing it is at the line or beyond: people who look see it coming.
        expect(one.x).toBeGreaterThanOrEqual(5 + LINE - 1e-6);
      }
      if (cellOf(plan, one) === crossing) expect(traffic.claims(crossing)).toBe(true);
      slowest = Math.min(slowest, one.x - last);
      last = one.x;
    }
    expect(held).toBeGreaterThan(10);
    expect(slowest).toBeGreaterThan(0);
    expect(traffic.claims(crossing)).toBe(false);
  });

  it('lets a waiting car through after a while when people keep coming: the next ones wait', () => {
    const traffic = new Traffic(plan);
    const one = car(road(line([0, 0], [12, 0])));
    let asked = -1;
    for (let t = 0; t < 12_000; t += FRAME) {
      // People cross in a stream, unless the crossing is claimed, as the walkers do.
      const stream = !traffic.claims(crossing);
      traffic.step([one], FRAME, (cell) => stream && cell === crossing);
      if (asked < 0 && traffic.claims(crossing)) asked = t;
    }
    expect(asked).toBeGreaterThan(2000);
    expect(one.x).toBeGreaterThan(6.4);
  });
});

describe('a junction lets one through at a time', () => {
  const plan = mapOf(['....#....', '....#....', '....#....', '#########', '....#....', '....#....', '....#....']);
  const junction = 3 * 9 + 4;
  const zone = plan.zoneOf[junction]!;

  it('stops every car at its sign, then first come, first served, and never two in it whose paths cross', () => {
    const traffic = new Traffic(plan);
    const west = car(road(line([0, 3], [8, 3])));
    const north = car(road(line([4, 0], [4, 6])));
    const south = car(road(line([4, 6], [4, 0])));
    // They set out a little apart, so they reach their lines in a known order: west, north, south.
    north.along = -1.3;
    south.along = -1.6;
    const cars = [west, north, south];
    const entered: TrafficCar[] = [];
    const stood = new Map<TrafficCar, number>();
    for (let t = 0; t < 20_000; t += FRAME) {
      const before = cars.map((one) => one.zone);
      const was = cars.map((one) => one.x + one.y);
      traffic.step(cars, FRAME, nobody);
      cars.forEach((one, n) => {
        if (before[n] !== zone && one.zone === zone) entered.push(one);
        if (one.waitingAt === zone && one.x + one.y === was[n]) stood.set(one, (stood.get(one) ?? 0) + FRAME);
      });
      const inside = cars.filter((one) => !one.done && plan.zoneOf[cellOf(plan, one)] === zone);
      // Whoever is inside holds it. Two may be inside only when they go straight through in opposite
      // directions, as the car from the north and the car from the south do: their paths never cross.
      for (const one of inside) expect(one.zone).toBe(zone);
      expect(inside.length).toBeLessThanOrEqual(2);
      if (inside.length === 2) {
        expect(inside).toContain(north);
        expect(inside).toContain(south);
      }
    }
    expect(entered).toEqual([west, north, south]);
    // Each stood at its sign for the stop, or longer when it had to wait its turn.
    for (const one of cars) expect(stood.get(one) ?? 0).toBeGreaterThanOrEqual(STOP_MS - FRAME);
    expect(cars.every((one) => one.done)).toBe(true);
    expect(traffic.gaveUp).toBe(0);
  });

  it('does not let a car in until there is room for it to get right out', () => {
    const traffic = new Traffic(plan);
    // A car stands just past the junction on the way east. The one behind waits at its sign, not in the junction.
    const front = car(road(line([5, 3], [8, 3])));
    front.pauseMs = 5000;
    const behind = car(road(line([0, 3], [8, 3])));
    for (let t = 0; t < 4500; t += FRAME) {
      traffic.step([front, behind], FRAME, nobody);
      expect(plan.zoneOf[cellOf(plan, behind)]).not.toBe(zone);
    }
    for (let t = 0; t < 12_000; t += FRAME) traffic.step([front, behind], FRAME, nobody);
    expect(behind.done).toBe(true);
  });

  it('waits for somebody crossing beside it', () => {
    const traffic = new Traffic(plan);
    const one = car(road(line([0, 3], [8, 3])));
    for (let t = 0; t < 5000; t += FRAME) {
      traffic.step([one], FRAME, (cell) => cell === junction);
      expect(plan.zoneOf[cellOf(plan, one)]).not.toBe(zone);
    }
  });
});

describe('a rush hour on the model campus', () => {
  const state = newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' });
  const map = state.map;
  const plan = planTraffic(map.width, map.height, map.cells.map((cell) => cell.kind), TOWN_X);
  const { width, height } = map;

  /** The shortest way from one road cell to another, as a car would drive it. */
  function routeBetween(from: number, to: number): RouteNode[] | null {
    const prev = new Map<number, number>([[from, -1]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]!;
      if (cell === to) break;
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (plan.drivable[next] && !prev.has(next)) {
          prev.set(next, cell);
          queue.push(next);
        }
      }
    }
    if (!prev.has(to)) return null;
    const cells: number[] = [];
    for (let cell = to; cell !== -1; cell = prev.get(cell)!) cells.push(cell);
    return cells.reverse().map((cell) => ({ x: cell % width, y: Math.floor(cell / width), road: true }));
  }

  // Where cars come from and go to: the ends of the streets and of the campus's own roads.
  const ends: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (!plan.drivable[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    let arms = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && plan.drivable[ny * width + nx]) arms += 1;
    }
    if (arms === 1) ends.push(i);
  }

  it('has roads to run it on', () => {
    expect(ends.length).toBeGreaterThan(8);
    expect(plan.zones.length).toBeGreaterThanOrEqual(8);
  });

  it('ends after twenty minutes with every car through, nobody given up, nobody hit and nobody stranded at a kerb', () => {
    const random = testRandom(2026);
    const traffic = new Traffic(plan);
    const cars: Array<TrafficCar & { born: number }> = [];
    const crossings = plan.zebra.map((is, i) => (is ? i : -1)).filter((i) => i >= 0);
    expect(crossings.length).toBeGreaterThan(10);
    // People at each crossing: someone arrives now and then, waits while a car has it, and takes two seconds to cross.
    const people = crossings.map(() => ({ waiting: -1, on: 0 }));
    const busy = new Set<number>();
    // A little more than the streets carry at the rush on the Normal crowd setting, and every one of them drives
    // the whole way from one end of the roads to another, which is further than a car in the game goes.
    const RUSH = 22;
    let finished = 0;
    let longest = 0;
    let longestWait = 0;
    let longestStill = 0;
    let hits = 0;
    let tooClose = 0;
    let started = 0;
    const MINUTES = 20;
    for (let t = 0; t < MINUTES * 60_000; t += FRAME) {
      // People.
      busy.clear();
      people.forEach((at, n) => {
        const cell = crossings[n]!;
        if (at.on > 0) at.on -= FRAME;
        else if (at.waiting < 0 && random() < 0.004) at.waiting = t;
        if (at.on <= 0 && at.waiting >= 0 && !traffic.claims(cell)) {
          longestWait = Math.max(longestWait, t - at.waiting);
          at.waiting = -1;
          at.on = 2000;
        }
        if (at.on > 0) busy.add(cell);
        if (at.waiting >= 0) longestWait = Math.max(longestWait, t - at.waiting);
      });
      // Cars: kept at the rush hour's number, each on its way between two ends of the roads.
      if (t % 640 === 0 && cars.length < RUSH) {
        const from = ends[Math.floor(random() * ends.length)]!;
        const to = ends[Math.floor(random() * ends.length)]!;
        const route = from !== to ? routeBetween(from, to) : null;
        const start = route?.[0];
        if (route && route.length > 3 && start && !cars.some((one) => Math.abs(one.x - start.x) < 1.3 && Math.abs(one.y - start.y) < 1.3)) {
          const one = Object.assign(newCar(route, random() < 0.1), { born: t });
          placeCar(one);
          cars.push(one);
          started += 1;
        }
      }
      traffic.step(cars, FRAME, (cell) => busy.has(cell));
      for (let n = cars.length - 1; n >= 0; n--) {
        const one = cars[n]!;
        // The longest any car stands still: at a sign, in a queue, or for somebody crossing.
        longestStill = Math.max(longestStill, one.stillMs);
        // Nobody is ever hit: no car is on a crossing while somebody is on it.
        if (busy.has(cellOf(plan, one))) hits += 1;
        for (let m = 0; m < n; m++) {
          const other = cars[m]!;
          const near = Math.hypot(one.x - other.x, one.y - other.y) < 0.5;
          // Two cars that pass in opposite lanes are close and are not in each other's way. Two on the same
          // stretch going the same way, or one right behind the other, must keep apart.
          if (near && sameStream(plan, one, other) && !one.done && !other.done && !one.leaving && !other.leaving) tooClose += 1;
        }
        if (one.done || one.leaving) {
          if (one.done) finished += 1;
          longest = Math.max(longest, t - one.born);
          traffic.forget(one);
          cars.splice(n, 1);
        }
      }
    }
    // The ones still on their way when the clock stops are young: nothing has stood for long.
    for (const one of cars) longest = Math.max(longest, MINUTES * 60_000 - one.born);
    expect(traffic.gaveUp).toBe(0);
    expect(hits).toBe(0);
    expect(tooClose).toBe(0);
    expect(started).toBeGreaterThan(300);
    expect(finished).toBeGreaterThanOrEqual(started - RUSH);
    // The longest any car took, and the longest anybody stood at a kerb: minutes would mean a jam.
    expect(longest).toBeLessThan(200_000);
    expect(longestWait).toBeLessThan(30_000);
    expect(longestStill).toBeLessThan(30_000);
  });
});
