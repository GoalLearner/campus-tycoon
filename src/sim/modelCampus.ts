import { VARIANTS_PER_STAGE } from './config/buildings';
import { TREE_KINDS } from './config/desirability';
import { PLACED } from './config/placed';
import { TOWN_X } from './config/town';
import { hashInts } from './rng';
import { addPlaced } from './systems/placed';
import type { Cell, MapState, PlacedType, Zone } from './types';

/**
 * The model campus (DESIGN.md section 35): a whole campus from the first
 * minute, laid out district by district like the reference campus of section
 * 23, turned a quarter turn so its main street meets College Avenue.
 *
 * Nothing of the reference is here but where things are. Every building is
 * one of the game's own, every name comes from the game's own generators, and
 * the plan below is written in the game's cells: x runs 0 to 31 from west to
 * east and y runs 0 to 47 from north to south, the starting land and both
 * fields. College Avenue is the column just east of x 31.
 *
 * It is laid by this script and never by hand, so the same seed always gives
 * the same campus. The script refuses to put anything on ground that is not
 * the campus's own, or on ground that is already taken.
 */

type Point = readonly [number, number];

export interface ModelDistrict {
  id: string;
  /** A plain name for it. None is a name from the reference. */
  name: string;
  /** Where DESIGN.md 35.3 puts its centre, in cells. */
  aim: { x: number; y: number };
  /** The middle of everything laid for it. */
  centre: { x: number; y: number };
  /** How many lots and buildings it has. */
  lots: number;
  buildings: number;
}

/** The stage every lot of the model campus stands at. */
export const MODEL_STAGE = 2;

const row = (y: number, x0: number, x1: number): Point[] => {
  const out: Point[] = [];
  for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
};
const col = (x: number, y0: number, y1: number): Point[] => {
  const out: Point[] = [];
  for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
};
const block = (x: number, y: number, w: number, h: number): Point[] => {
  const out: Point[] = [];
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) out.push([cx, cy]);
  return out;
};

/**
 * Lay the model campus on a bare map whose land is all the campus's own.
 * Returns its districts, each with where it was aimed and where it landed.
 */
export function layModelCampus(map: MapState, seed: number): ModelDistrict[] {
  const districts: ModelDistrict[] = [];
  let box = { x0: 99, y0: 99, x1: -1, y1: -1 };
  let lots = 0;
  let buildings = 0;

  const cellAt = (x: number, y: number): Cell => {
    if (x < 0 || y < 0 || x >= TOWN_X || y >= map.height) throw new Error(`The model campus reaches off its land at ${x}, ${y}.`);
    return map.cells[y * map.width + x]!;
  };
  const seen = (x: number, y: number, w = 1, h = 1): void => {
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + w - 1), y1: Math.max(box.y1, y + h - 1) };
  };
  const empty = (x: number, y: number): Cell => {
    const cell = cellAt(x, y);
    if (cell.kind !== 'empty') throw new Error(`The model campus puts two things at ${x}, ${y}: a ${cell.kind} is there.`);
    return cell;
  };

  /** Ground of one kind. `counted` is false for roads, walks and trees that tie districts together and belong to none. */
  const ground = (kind: 'path' | 'road' | 'quad' | 'tree', cells: readonly Point[], counted = true): void => {
    for (const [x, y] of cells) {
      const cell = cellAt(x, y);
      if (kind === 'path' && (cell.kind === 'road' || cell.kind === 'crossing')) cell.kind = 'crossing';
      else if (kind === 'road' && (cell.kind === 'path' || cell.kind === 'crossing')) cell.kind = 'crossing';
      else if (cell.kind === kind) continue;
      else {
        empty(x, y).kind = kind;
        if (kind === 'tree') cell.variant = hashInts(seed, x, y, 5) % TREE_KINDS;
      }
      if (counted) seen(x, y);
    }
  };
  const zone = (which: Zone, cells: readonly Point[]): void => {
    for (const [x, y] of cells) {
      const cell = empty(x, y);
      const id = map.buildings.length;
      map.buildings.push({ id, x, y, w: 1, h: 1, zone: which, stage: MODEL_STAGE, variant: hashInts(seed, id, 1) % VARIANTS_PER_STAGE, rebuild: null });
      cell.kind = 'lot';
      cell.zone = which;
      cell.buildingId = id;
      seen(x, y);
      lots += 1;
    }
  };
  const put = (type: PlacedType, x: number, y: number, counted = true): void => {
    const spec = PLACED[type];
    for (const [cx, cy] of block(x, y, spec.w, spec.h)) empty(cx, cy);
    addPlaced(map, type, x, y, -1);
    if (counted) {
      seen(x, y, spec.w, spec.h);
      if (spec.family !== 'bin' && spec.family !== 'seat') buildings += 1;
    }
  };
  const small = (type: 'bin' | 'bench' | 'table', cells: readonly Point[]): void => {
    for (const [x, y] of cells) put(type, x, y, false);
  };
  const district = (id: string, name: string, aim: { x: number; y: number }, lay: () => void): void => {
    box = { x0: 99, y0: 99, x1: -1, y1: -1 };
    lots = 0;
    buildings = 0;
    lay();
    districts.push({ id, name, aim, centre: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, lots, buildings });
  };

  // ------------------------------------------------------ roads and walks
  // The loop road: down the west edge and along the north edge to College Avenue.
  district('loop', 'The loop road', { x: 15.5, y: 22.5 }, () => {
    ground('road', row(0, 0, 31));
    ground('road', col(0, 1, 45));
  });

  // The long walk, east to west through the middle of the campus, and the walks that leave it.
  ground('path', row(19, 8, 23), false);
  // West: up to the far apartments and down to the hill.
  ground('path', col(8, 4, 36), false);
  // The cross walk: from the union south to the pool.
  ground('path', col(15, 10, 46), false);
  // East: from the north-east halls past the union and the transit path to the apartments and the stadium.
  ground('path', col(23, 5, 34), false);
  ground('path', row(14, 15, 23), false);
  ground('path', row(34, 15, 23), false);

  district('transit', 'The walk to College Avenue', { x: 26, y: 15 }, () => {
    ground('path', row(15, 23, 31));
    // A small plaza where it meets the avenue, wide enough to join the streets on both sides of it.
    ground('path', [[31, 14], [30, 14], [31, 16], [30, 16]], false);
    small('bench', [[29, 14], [29, 16]]);
    ground('tree', [[27, 14], [25, 14], [27, 16], [25, 16]], false);
  });

  // ---------------------------------------------------- the academic core
  district('core', 'The academic core', { x: 12.5, y: 16.5 }, () => {
    // North of the long walk.
    zone('academic', [[9, 18], [10, 18], [11, 18], [16, 18], [17, 18], [19, 18], [20, 18], [21, 18]]);
    // South of it.
    zone('academic', [[9, 20], [10, 20], [12, 20], [13, 20], [14, 20], [16, 20], [17, 20], [18, 20], [20, 20], [21, 20], [22, 20]]);
    // Up the cross walk toward the union, and down it.
    zone('academic', [[16, 10], [14, 11], [14, 12], [14, 13], [14, 14], [14, 15], [16, 16], [16, 17]]);
    zone('academic', [[14, 21], [14, 22], [14, 23], [16, 21], [16, 22]]);
    // The library on its forecourt, north of the walk.
    put('library', 13, 16);
    ground('path', [[13, 18], [14, 18]]);
    put('computerLab', 9, 16);
    put('studyCenter', 16, 23);
    put('makerspace', 16, 24);
    // Green between the halls, and the pond by the old garden.
    ground('quad', [[12, 18], [18, 18], [22, 18], [11, 20], [19, 20]]);
    put('pondMedium', 12, 22);
    ground('tree', [[10, 17], [11, 17], [12, 17], [17, 17], [19, 17], [21, 17], [11, 21], [12, 21], [13, 21], [18, 21], [19, 21], [20, 21], [21, 21], [12, 24], [13, 24]]);
    small('table', [[17, 22], [17, 21]]);
    small('bin', [[18, 23]]);
  });

  district('tower', 'The tower quad', { x: 6, y: 19 }, () => {
    put('admin', 5, 18);
    ground('quad', [...row(17, 4, 7), [4, 18], [7, 18], [4, 19], [7, 19], ...row(20, 4, 7)]);
    ground('tree', [[3, 17], [3, 20], [6, 21], [4, 21]]);
    small('bench', [[7, 21]]);
  });

  district('union', 'The union and its commons', { x: 18, y: 12 }, () => {
    put('foodcourt', 18, 12);
    put('store', 16, 13);
    put('coffee', 20, 13);
    put('dining', 16, 15);
    small('table', [[18, 15], [19, 15], [21, 13]]);
    small('bin', [[22, 13], [18, 16]]);
    ground('quad', [[16, 11], [17, 11], [16, 12], [17, 12]]);
    ground('tree', [[20, 12], [21, 12], [19, 16]]);
  });

  district('commons', 'The second commons', { x: 9, y: 19 }, () => {
    put('dining', 9, 21);
    put('burger', 9, 22);
    put('taco', 9, 23);
    small('table', [[11, 22], [11, 23]]);
    small('bin', [[9, 24], [11, 24]]);
  });

  // ------------------------------------------------------------- housing
  district('northEastHalls', 'The north-east residence halls', { x: 25, y: 6.5 }, () => {
    ground('path', row(6, 24, 29));
    ground('path', row(10, 24, 28));
    zone('housing', [[24, 5], [25, 5], [26, 5], [27, 5], [28, 5], [29, 5]]);
    zone('housing', [[24, 7], [25, 7], [28, 7], [29, 7]]);
    zone('housing', [[24, 9], [25, 9], [24, 11], [25, 11], [26, 11]]);
    put('dining', 26, 7);
    ground('quad', block(26, 8, 2, 2));
    small('bench', [[28, 9]]);
    small('bin', [[28, 8]]);
    ground('tree', [[29, 9], [24, 4], [26, 4], [28, 4], [30, 6], [30, 8]]);
  });

  district('hill', 'The hill residences', { x: 5.5, y: 36.5 }, () => {
    ground('path', row(36, 2, 7));
    zone('housing', [[2, 35], [3, 35], [4, 35], [5, 35]]);
    zone('housing', [[2, 37], [3, 37], [4, 37]]);
    put('dining', 6, 35);
    ground('quad', block(5, 37, 2, 2));
    small('bench', [[7, 37]]);
    small('bin', [[7, 38]]);
    ground('tree', [[2, 34], [4, 34], [6, 34], [2, 38], [3, 38], [4, 38], [9, 35], [9, 37]]);
  });

  district('avenueHouses', 'The houses and apartments by the avenue', { x: 25.5, y: 28.5 }, () => {
    ground('path', row(28, 24, 31));
    zone('housing', [[24, 27], [25, 27], [26, 27], [27, 27]]);
    zone('housing', [[24, 29], [25, 29]]);
    put('diner', 28, 29);
    ground('quad', [[28, 27], [29, 27], [26, 29], [27, 29]]);
    small('bench', [[30, 27]]);
    small('bin', [[30, 29]]);
    ground('tree', [[24, 26], [26, 26], [28, 26], [30, 26], [24, 30], [26, 30]]);
  });

  district('farApartments', 'The far apartments', { x: 4, y: 3 }, () => {
    ground('path', row(4, 2, 7));
    zone('housing', [[2, 3], [3, 3], [4, 3], [5, 3]]);
    put('coffee', 3, 5);
    ground('quad', [[6, 3], [7, 3], [4, 5], [5, 5]]);
    small('bench', [[2, 5]]);
    small('bin', [[6, 5]]);
    ground('tree', [[2, 2], [4, 2], [6, 2], [7, 5]]);
  });

  // ----------------------------------------------------------- athletics
  district('stadium', 'The stadium plot', { x: 22.5, y: 31.5 }, () => {
    put('stadium', 21, 31);
    put('garage', 24, 32);
    // The garage's own road in from College Avenue.
    ground('road', row(34, 24, 31), false);
    ground('tree', [[20, 30], [22, 30], [26, 31], [28, 31], [30, 31]], false);
  });

  district('recreation', 'The recreation centre', { x: 15, y: 31 }, () => {
    put('gym', 16, 31);
    small('bin', [[16, 32]]);
    small('bench', [[14, 31]]);
    ground('tree', [[17, 30], [18, 30], [14, 30]], false);
  });

  district('fields', 'The ball fields', { x: 16, y: 38 }, () => {
    put('field', 16, 37);
    put('field', 16, 40);
    small('bin', [[16, 39], [14, 40]]);
    small('bench', [[14, 38], [17, 39]]);
    ground('tree', [[18, 36], [19, 38], [19, 41], [13, 37], [13, 41]], false);
  });

  district('pool', 'The pool and the courts', { x: 18, y: 44.5 }, () => {
    put('pool', 16, 43);
    put('courts', 16, 44);
    put('courts', 18, 44);
    ground('path', row(46, 16, 20), false);
    small('bin', [[18, 43], [20, 45]]);
    small('bench', [[19, 43]]);
    ground('tree', [[21, 43], [21, 46], [13, 44]], false);
  });

  // ------------------------------------------------------------- parking
  district('structures', 'The parking structures', { x: 20, y: 1 }, () => {
    put('garage', 14, 1);
    put('garage', 19, 1);
    put('garage', 24, 1);
    ground('tree', [[17, 2], [22, 2], [27, 2], [12, 2]], false);
  });

  district('lots', 'The surface lots', { x: 1.5, y: 27.5 }, () => {
    // Two on the west edge, on the loop road, and one in each field.
    put('parking', 1, 13);
    put('parking', 1, 26);
    put('parking', 1, 42);
    put('parking', 30, 40, false);
  });

  // ------------------------------------------------------------ services
  district('facilities', 'Facilities', { x: 3, y: 8 }, () => {
    put('yard', 2, 8);
    ground('tree', [[4, 9], [5, 9], [2, 10]], false);
  });
  // Two more yards, so every place that drops litter has one in reach.
  put('yard', 24, 21, false);
  put('yard', 13, 45, false);

  district('care', 'The health centre and Campus Safety', { x: 20, y: 21 }, () => {
    put('medical', 20, 10);
    put('safety', 19, 32);
  });
  // A second of each, so the halls by the avenue and the north-east halls have both in reach.
  put('safety', 27, 11, false);
  put('medical', 17, 32, false);

  // ------------------------------------------------ lawn where nothing stands
  // What the game cannot draw yet (35.3) is left as lawn and trees.
  ground('tree', [[18, 25], [19, 26], [20, 25], [21, 27], [19, 28], [17, 27], [11, 27], [12, 29], [10, 30], [13, 32], [11, 33], [5, 28], [3, 30], [6, 31], [4, 24], [2, 22], [5, 14], [3, 12], [6, 12], [11, 9], [12, 6], [10, 4], [17, 6], [20, 5], [18, 8], [28, 20], [29, 22], [27, 24], [30, 18], [26, 18], [9, 41], [6, 43], [10, 45], [4, 45], [25, 38], [28, 37], [23, 41], [27, 43], [24, 45], [29, 45]], false);

  return districts;
}
