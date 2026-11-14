import { describe, expect, it } from 'vitest';
import { KERB_FAR, KERB_MIDDLE, KERB_NEAR, KERB_WIDTH, kerbAt, newCar, placeCar, planTraffic, roadRoute, type RouteNode, type TrafficPlan } from '../src/app/traffic';
import { carParks, carSum, carTop, holdsCars, studentRoute, townRoute } from '../src/game/carPlaces';
import { Iso, type Turn } from '../src/game/iso';
import { driveways } from '../src/game/townLook';
import { newGame, TOWN_X, type GameState } from '../src/sim';
import { T0 } from './helpers';

/**
 * The streets (DESIGN.md section 59): a sidewalk along every side of a road
 * that meets no more road, and every car drawn on a road, in a driveway or in
 * a car park, at every turn of the view.
 */

/** The penzilla pack's ground grid, as the art manifest gives it. */
const GRID = { halfWidth: 66, halfHeight: 37.640625 };
/** The spot of its cell a car's drawing stands on (tools/make_penzilla_recipe.py: standing(..., 0.5, 0.64)). */
const CAR_STANDS = { x: 0.5, y: 0.64 };

function mapOf(rows: string[]): TrafficPlan {
  const kinds = rows.join('').split('').map((ch) => (ch === '#' ? 'road' : ch === 's' ? 'street' : 'empty'));
  return planTraffic(rows[0]!.length, rows.length, kinds, 0);
}

describe('the sidewalk', () => {
  it('runs along both sides of a straight road, and not across the ends at the edge of the map', () => {
    const plan = mapOf(['.....', '#####', '.....']);
    // A side toward y - 1 is 1 and toward y + 1 is 4. The road's ends run off the map.
    expect(kerbAt(plan, 2, 1)).toEqual({ sides: 1 | 4, corners: 0 });
    expect(kerbAt(plan, 0, 1)).toEqual({ sides: 1 | 4, corners: 0 });
    expect(kerbAt(plan, 4, 1)).toEqual({ sides: 1 | 4, corners: 0 });
    // Nothing off the road.
    expect(kerbAt(plan, 2, 0)).toEqual({ sides: 0, corners: 0 });
  });

  it('turns the corner where a side street opens off, and closes a dead end', () => {
    const plan = mapOf(['.....', '#####', '..#..', '..#..', '.....']);
    // The junction: road on three sides, the sidewalk along the fourth, and a small slab in each inside corner.
    expect(kerbAt(plan, 2, 1)).toEqual({ sides: 1, corners: 2 | 4 });
    // The side street: both its sides, and across its dead end.
    expect(kerbAt(plan, 2, 3)).toEqual({ sides: 2 | 4 | 8, corners: 0 });
  });

  it('is where people walk: they keep to its middle on the avenue and on a side street', () => {
    expect(KERB_NEAR).toBeCloseTo(KERB_WIDTH / 2, 9);
    expect(KERB_FAR).toBeCloseTo(1 - KERB_WIDTH / 2, 9);
    expect(KERB_MIDDLE).toBeLessThan(KERB_WIDTH);
  });

  it('lines the town on the model campus: every street cell beside a house or a lot has it', () => {
    const state = model();
    const { width, height, cells } = state.map;
    const plan = planOf(state);
    let lined = 0;
    for (let y = 0; y < height; y++) {
      for (let x = TOWN_X; x < width; x++) {
        if (cells[y * width + x]!.kind !== 'street') continue;
        const { sides } = kerbAt(plan, x, y);
        const ways: Array<[number, number, number]> = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
        for (const [bit, dx, dy] of ways) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const road = plan.drivable[ny * width + nx];
          expect(!!(sides & bit)).toBe(!road);
          if (!road) lined += 1;
        }
      }
    }
    expect(lined).toBeGreaterThan(200);
  });
});

function model(): GameState {
  return newGame({ seed: 20261112, name: 'Larkspur University', now: T0, campus: 'model' });
}

function planOf(state: GameState): TrafficPlan {
  const { width, height, cells } = state.map;
  return planTraffic(width, height, cells.map((cell) => cell.kind), TOWN_X);
}

describe('every car is drawn where a car can be', () => {
  it('on a road, in a driveway or in a car park, at every turn of the view, along every route the map offers', () => {
    const state = model();
    const { map } = state;
    const { width, height } = map;
    const plan = planOf(state);
    const parks = carParks(map, plan.drivable);
    const drives = driveways(map);
    expect(parks.length).toBeGreaterThan(0);
    expect(drives.length).toBeGreaterThan(10);
    const driveCells = new Set(drives.map((drive) => drive.y * width + drive.x));
    const allowed = (cell: number): boolean => !!plan.drivable[cell] || driveCells.has(cell) || holdsCars(map, cell);

    // The routes Cars.ts drives: students from each driveway (or the kerb of a street with none) to each car
    // park, and neighbours between driveways and the edges of the map.
    const kerb = (drive: { x: number; row: number }): number => drive.row * width + drive.x;
    const routes: RouteNode[][] = [];
    const homes = [...drives, ...map.town.neighbourhoods.map((hood) => ({ x: hood.plots[0]!.x, y: hood.row, row: hood.row }))];
    for (const home of homes) {
      for (const park of parks) {
        const cells = roadRoute(plan, kerb(home), park.door);
        if (!cells) continue;
        const route = studentRoute(width, home, cells, park);
        routes.push(route, [...route].reverse());
      }
    }
    const ends = [0, height - 1].map((y) => y * width + TOWN_X).filter((cell) => plan.drivable[cell]);
    for (const hood of map.town.neighbourhoods) if (plan.drivable[hood.row * width + width - 1]) ends.push(hood.row * width + width - 1);
    for (const [n, from] of drives.entries()) {
      const to = drives[(n * 7 + 3) % drives.length]!;
      const between = roadRoute(plan, kerb(from), kerb(to));
      if (between && to !== from) routes.push(townRoute(width, between, from, to));
      for (const end of ends) {
        const out = roadRoute(plan, kerb(from), end);
        if (out) routes.push(townRoute(width, out, from), townRoute(width, [...out].reverse(), undefined, from));
      }
    }
    expect(routes.length).toBeGreaterThan(100);

    const iso = new Iso(GRID.halfWidth, GRID.halfHeight);
    iso.setMap(width, height);
    const wrong: string[] = [];
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      iso.setTurn(turn);
      for (const route of routes) {
        const car = newCar(route, false);
        for (let leg = 0; leg < route.length - 1; leg++) {
          for (const along of [0, 0.25, 0.5, 0.75, 1]) {
            car.leg = leg;
            car.along = along;
            placeCar(car);
            // The middle of the drawing's cell, and the spot its wheels stand on.
            const top = carTop(iso, car.x, car.y);
            const middle = iso.toMap(top.x, top.y + GRID.halfHeight);
            const standing = iso.offset(CAR_STANDS.x, CAR_STANDS.y);
            const wheels = iso.toMap(top.x + standing.x, top.y + standing.y);
            for (const spot of [middle, wheels]) {
              const cell = Math.floor(spot.y) * width + Math.floor(spot.x);
              if (!allowed(cell)) wrong.push(`turn ${turn}: a car at (${car.x.toFixed(2)}, ${car.y.toFixed(2)}) is drawn on cell ${cell % width},${Math.floor(cell / width)} (${map.cells[cell]?.kind})`);
            }
          }
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('parks in a driveway on its paved pad, at every turn', () => {
    const state = model();
    const { width } = state.map;
    const iso = new Iso(GRID.halfWidth, GRID.halfHeight);
    iso.setMap(state.map.width, state.map.height);
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      iso.setTurn(turn);
      for (const drive of driveways(state.map)) {
        const top = carTop(iso, drive.x, drive.y);
        const middle = iso.toMap(top.x, top.y + GRID.halfHeight);
        expect(Math.floor(middle.y) * width + Math.floor(middle.x)).toBe(drive.y * width + drive.x);
        // Drawn in the order of its own cell, as the pad under it is.
        const cell = iso.viewCell(drive.x, drive.y);
        expect(carSum(iso, drive.x, drive.y)).toBeCloseTo(cell.x + cell.y, 9);
      }
    }
  });
});
