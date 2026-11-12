import { TOWN_X, type MapState } from '../sim';

/**
 * What stands on a cell of the town that is not a street or a house. For show
 * only: it is read from the cell's own number, which the save already holds,
 * so a town always looks the same and nothing new is stored.
 *
 * The town is always fully built (the owner, 2026-11-11). Every plot has its
 * house. The few spots along a street that have none are a driveway with a
 * car, a garden, a pool or trees, and the ground behind the houses is lawn
 * with trees: a neighbourhood, whoever is enrolled from it.
 */
export type TownLook = 'tree' | 'garden' | 'driveway' | 'pool' | 'lawn';

export function townLook(map: MapState, x: number, y: number): TownLook {
  const cell = map.cells[y * map.width + x];
  if (!cell || cell.kind !== 'town') return 'lawn';
  const v = cell.variant;
  // A spot facing a side street, where a house could have stood.
  const facing = x >= TOWN_X + 2 && map.town.neighbourhoods.some((hood) => Math.abs(y - hood.row) === 1);
  if (facing) return v <= 3 ? 'driveway' : v <= 6 ? 'tree' : v === 7 ? 'pool' : 'garden';
  return v <= 2 ? 'tree' : v === 3 ? 'garden' : 'lawn';
}

/** The driveways of a map: the cell, and the row of the street each opens onto. */
export function driveways(map: MapState): Array<{ x: number; y: number; row: number }> {
  const out: Array<{ x: number; y: number; row: number }> = [];
  for (const hood of map.town.neighbourhoods) {
    for (const y of [hood.row - 1, hood.row + 1]) {
      if (y < 0 || y >= map.height) continue;
      for (let x = TOWN_X + 2; x < map.width; x++) if (townLook(map, x, y) === 'driveway') out.push({ x, y, row: hood.row });
    }
  }
  return out;
}
