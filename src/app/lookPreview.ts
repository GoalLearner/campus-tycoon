import { advance, applyAction, newGame, rowBetween, type GameState, type Point, type Tool } from '../sim';
import type { PlacedItem } from '../game/Placed';
import type { BuildEntry } from '../ui/buildMenu';

/**
 * Dev builds only. A campus for approving the look of things that do not work
 * yet: every hand-placed building, water in three sizes, incident icons and
 * responders, and a building being placed. Open the page with `?demo=look`.
 *
 * Nothing here is wired to the simulation. The buildings are only pictures put
 * on the map, so the owner can judge the art before any rules are written.
 */

function paint(state: GameState, tool: Tool, cells: Point[], variant = 0): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells, variant });
  return result.ok ? result.state : state;
}

/** The living part: lots, paths, quads and trees, an hour or so old. */
export function lookCampus(now: number): GameState {
  const started = now - 75 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 2_000_000;

  // A phone is tall and narrow, so the campus runs down the screen: the ends of the
  // two long paths are trimmed, and a spur runs off each side.
  state = paint(state, 'clear', [[22, 14], [23, 14], [8, 17], [9, 17]]);
  state = paint(state, 'path', [...rowBetween([13, 9], [13, 13]), ...rowBetween([17, 18], [17, 23])]);
  state = paint(state, 'housing', rowBetween([11, 18], [14, 18]));
  state = paint(state, 'quad', [[13, 16]]);
  state = paint(state, 'tree', [[11, 11], [12, 12]], 0);
  state = paint(state, 'tree', [[12, 11], [11, 12]], 3);
  state = paint(state, 'tree', [[14, 12], [15, 13]], 1);
  state = paint(state, 'tree', [[15, 12], [14, 13]], 4);
  state = paint(state, 'tree', [[16, 11], [17, 11]], 5);
  state = paint(state, 'tree', [[13, 19], [14, 19]], 2);
  state = paint(state, 'tree', [[14, 20], [14, 21]], 0);
  state = paint(state, 'tree', [[20, 20], [20, 21]], 4);
  state = paint(state, 'tree', [[16, 22], [16, 23]], 3);
  state = paint(state, 'tree', [[15, 23]], 1);
  return advance(state, started, now).state;
}

/**
 * A bare corner of the map for judging stadium art: open the page with `?demo=stadium`.
 * It shows the rendered tier-four stadium between buildings the pack draws.
 */
export function stadiumCampus(now: number): GameState {
  const started = now - 75 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 2_000_000;
  state = paint(state, 'path', [...rowBetween([22, 1], [22, 10]), ...rowBetween([23, 6], [26, 6])]);
  state = paint(state, 'tree', [[19, 5], [18, 6], [26, 3]], 0);
  state = paint(state, 'tree', [[19, 8], [25, 9], [26, 8]], 4);
  state = paint(state, 'tree', [[25, 2], [20, 9]], 1);
  state = paint(state, 'tree', [[26, 4], [21, 10]], 3);
  return advance(state, started, now).state;
}

export function stadiumItems(): LookScene {
  const items: PlacedItem[] = [
    { key: 'build.university', x: 20, y: 3, w: 2, h: 2 },
    { key: 'stadium.4', x: 23, y: 3, w: 2, h: 3 },
    { key: 'stadium.3', x: 20, y: 6, w: 2, h: 2 },
    { key: 'build.library', x: 23, y: 7, w: 2, h: 2 },
    { key: 'person.0.sw.0', x: 22.1, y: 6.9, layer: 'person' },
    { key: 'person.3.sw.2', x: 22.3, y: 8.6, layer: 'person', flip: true },
    { key: 'person.5.nw.4', x: 22.2, y: 7.4, layer: 'person' },
    { key: 'person.7.sw.1', x: 24.3, y: 6.2, layer: 'person' },
    { key: 'person.9.sw.5', x: 25.2, y: 6.3, layer: 'person', flip: true },
  ];
  return { items, tints: [], labels: [] };
}

/** Cells within `reach` cells of a block, the block itself left out. */
function around(x: number, y: number, w: number, h: number, reach: number): Point[] {
  const cells: Point[] = [];
  for (let cy = y - reach; cy < y + h + reach; cy++) {
    for (let cx = x - reach; cx < x + w + reach; cx++) {
      if (cx >= x && cx < x + w && cy >= y && cy < y + h) continue;
      cells.push([cx, cy]);
    }
  }
  return cells;
}

function block(x: number, y: number, w: number, h: number): Point[] {
  const cells: Point[] = [];
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) cells.push([cx, cy]);
  return cells;
}

export interface LookLabel {
  n: number;
  x: number;
  y: number;
  /** Pixels above the ground at that spot. */
  lift: number;
}

export interface LookScene {
  items: PlacedItem[];
  tints: Array<{ cells: Point[]; colour: number; alpha: number }>;
  /** Numbered markers for the guide copy of the screenshot. Never shown in the game. */
  labels: LookLabel[];
}

/** Every new thing, placed around the starter campus. `roles` names the responder looks in the art pack. */
export function lookItems(roles: Record<string, number>): LookScene {
  const medic = roles.medic ?? 0;
  const officer = roles.officer ?? 0;
  const athlete = roles.athlete ?? 0;
  const two = { w: 2, h: 2 };
  const wide = { w: 2, h: 1 };

  const items: PlacedItem[] = [
    // North, either side of the spur.
    { key: 'build.library', x: 11, y: 9, ...two },
    { key: 'build.medical', x: 14, y: 10, ...two },
    { key: 'build.safety', x: 16, y: 12, ...two },
    { key: 'build.college', x: 18, y: 12, ...two },

    // Between the two long paths, west.
    { key: 'build.dining', x: 10, y: 15, ...wide },
    { key: 'build.store', x: 12, y: 15, ...wide },
    { key: 'build.parking', x: 10, y: 16, ...wide },
    { key: 'decor.car', x: 10.2, y: 15.75, layer: 'person' },
    { key: 'pond.small', x: 12, y: 16, layer: 'ground' },

    // Between the two long paths, east.
    { key: 'build.track', x: 18, y: 15, ...two },
    { key: 'build.courts', x: 20, y: 15, ...two },

    // South, either side of the spur.
    { key: 'build.gym', x: 15, y: 18, ...wide },
    { key: 'pond.medium', x: 15, y: 19, ...two },
    // A building being placed: faded, with its ground and reach tinted.
    { key: 'build.library', x: 18, y: 20, ...two, alpha: 0.6 },

    // A lake three cells by three.
    { key: 'water.top', x: 18, y: 22, layer: 'ground' },
    { key: 'water.ne', x: 19, y: 22, layer: 'ground' },
    { key: 'water.right', x: 20, y: 22, layer: 'ground' },
    { key: 'water.nw', x: 18, y: 23, layer: 'ground' },
    { key: 'water.full', x: 19, y: 23, layer: 'ground' },
    { key: 'water.se', x: 20, y: 23, layer: 'ground' },
    { key: 'water.left', x: 18, y: 24, layer: 'ground' },
    { key: 'water.sw', x: 19, y: 24, layer: 'ground' },
    { key: 'water.bottom', x: 20, y: 24, layer: 'ground' },

    // Players on the court, and an injury there with a medic on the way.
    { key: `person.${athlete}.sw.0`, x: 20.6, y: 15.1, layer: 'person' },
    { key: `person.${athlete + 1}.sw.2`, x: 20.95, y: 15.7, layer: 'person', flip: true },
    { key: `person.${athlete + 2}.nw.4`, x: 20.5, y: 15.95, layer: 'person' },
    { key: 'icon.injury', x: 20.9, y: 15.4, w: 1, h: 1, layer: 'float', lift: 70 },
    { key: `person.${medic}.sw.1`, x: 15.4, y: 13.55, layer: 'person', flip: true },

    // Mischief by the dorms, and an officer walking over.
    { key: 'icon.mischief', x: 10.6, y: 12.6, w: 1, h: 1, layer: 'float', lift: 112 },
    { key: `person.${officer}.sw.3`, x: 13.6, y: 13.5, layer: 'person' },
  ];

  const tints = [
    { cells: around(18, 20, 2, 2, 2), colour: 0x8fd3ff, alpha: 0.22 },
    { cells: block(18, 20, 2, 2), colour: 0x6fe38c, alpha: 0.5 },
  ];
  const labels: LookLabel[] = [
    { n: 1, x: 12, y: 10, lift: 120 },
    { n: 2, x: 15, y: 11, lift: 130 },
    { n: 3, x: 17, y: 13, lift: 150 },
    { n: 4, x: 19, y: 13, lift: 120 },
    { n: 5, x: 11, y: 15.5, lift: 105 },
    { n: 6, x: 13, y: 15.5, lift: 80 },
    { n: 7, x: 11, y: 16.5, lift: 50 },
    { n: 8, x: 12.5, y: 16.5, lift: 34 },
    { n: 9, x: 16, y: 18.5, lift: 78 },
    { n: 10, x: 16, y: 20, lift: 40 },
    { n: 11, x: 19, y: 16, lift: 96 },
    { n: 12, x: 21.6, y: 16.6, lift: 28 },
    { n: 13, x: 21.9, y: 15.7, lift: 96 },
    { n: 14, x: 11.1, y: 13.1, lift: 150 },
    { n: 15, x: 19, y: 21, lift: 104 },
    { n: 16, x: 19.5, y: 23.5, lift: 20 },
    { n: 17, x: 11.5, y: 11.5, lift: 70 },
    { n: 18, x: 13.5, y: 16.5, lift: 64 },
    { n: 19, x: 15.5, y: 14.4, lift: 44 },
  ];
  return { items, tints, labels };
}

/**
 * The Build menu as it would read. The prices, upkeep and reach are examples to
 * judge the layout by. The real numbers are tuning targets and come with the rules.
 */
export const LOOK_MENU: BuildEntry[] = [
  { key: 'build.library', name: 'Library', category: 'Academics', cost: '$60K', footprint: '2 x 2', upkeep: 'Upkeep $4K a year', effect: 'Lifts nearby Academic lots' },
  { key: 'build.dining', name: 'Dining hall', category: 'Campus life', cost: '$45K', footprint: '2 x 1', upkeep: 'Upkeep $6K a year', effect: 'Feeds Housing within 6 cells' },
  { key: 'build.store', name: 'Campus store', category: 'Campus life', cost: '$35K', footprint: '2 x 1', upkeep: 'Pays for itself', effect: 'Earns more on a busy path' },
  { key: 'build.parking', name: 'Parking lot', category: 'Campus life', cost: '$20K', footprint: '2 x 1', upkeep: 'Upkeep $1K a year', effect: 'Fewer beds needed. Neighbours like it less' },
  { key: 'build.gym', name: 'Gym', category: 'Recreation', cost: '$55K', footprint: '2 x 1', upkeep: 'Upkeep $5K a year', effect: 'Raises student approval' },
  { key: 'build.track', name: 'Track and field', category: 'Recreation', cost: '$120K', footprint: '2 x 2', upkeep: 'Upkeep $8K a year', effect: 'Raises approval for nearby Housing' },
  { key: 'build.courts', name: 'Outdoor courts', category: 'Recreation', cost: '$18K', footprint: '1 x 2', upkeep: 'Upkeep $1K a year', effect: 'Raises approval nearby. Students play here' },
  { key: 'pond.medium', name: 'Pond', category: 'Recreation', cost: 'From $8K', footprint: '3 sizes', upkeep: 'No upkeep', effect: 'Every zone likes being near water' },
  { key: 'build.medical', name: 'Medical Center', category: 'Health and safety', cost: '$90K', footprint: '2 x 2', upkeep: 'Upkeep $9K a year', effect: 'Treats injuries within 8 cells' },
  { key: 'build.safety', name: 'Campus Safety', category: 'Health and safety', cost: '$80K', footprint: '2 x 2', upkeep: 'Upkeep $8K a year', effect: 'Handles mischief within 8 cells' },
  { key: 'build.stadium', name: 'Stadium', category: 'On the way', cost: '', footprint: '', upkeep: '', effect: 'Home games and a football team', locked: 'Coming with football' },
  { key: 'build.studentlife', name: 'Student Life', category: 'On the way', cost: '', footprint: '', upkeep: '', effect: 'A zone for clubs and events', locked: 'Coming later' },
];
