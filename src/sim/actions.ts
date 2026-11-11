import { PLACED } from './config/placed';
import { addPlaced, previewPlace, removePlaced } from './systems/placed';
import type { PlacedType } from './types';
import { TREE_KINDS } from './config/desirability';
import { COST } from './config/money';
import { dollars } from './format';
import { inBounds } from './selectors';
import { recomputeDesirability } from './systems/desirability';
import { evaluateGrowth } from './systems/growth';
import { markRatesDirty } from './systems/money';
import { cancelTimers } from './timers';
import type { CellKind, GameState, MapState, Zone } from './types';

/**
 * Everything the player can do. Each action is a pure function from one state
 * to the next: it never reads the clock and never draws randomness. The app
 * advances the sim to now before applying one. See DESIGN.md section 17.
 */

/** What a drag paints onto the map. */
export type Tool = Zone | 'path' | 'quad' | 'tree' | 'clear';

export type Point = readonly [number, number];

/** `variant` picks the kind of tree. Other tools ignore it. */
export type Action =
  | { type: 'paint'; tool: Tool; cells: readonly Point[]; variant?: number }
  | { type: 'place'; building: PlacedType; x: number; y: number };

export interface PaintPreview {
  tool: Tool;
  /** Cells the paint would change. */
  cells: Point[];
  /** Cells in the drag that cannot take this tool. */
  skipped: number;
  cost: number;
  affordable: boolean;
}

export type ActionResult =
  | { ok: true; state: GameState; cost: number; changed: number }
  | { ok: false; state: GameState; error: string };

const UNIT_COST: Record<Tool, number> = {
  housing: COST.zoneLot,
  academic: COST.zoneLot,
  path: COST.path,
  quad: COST.quad,
  tree: COST.tree,
  clear: COST.clear,
};

function canPaint(kind: CellKind, tool: Tool): boolean {
  return tool === 'clear' ? kind !== 'empty' : kind === 'empty';
}

/** Buildings that came with the campus stay where they are. */
function fixedInPlace(map: MapState, index: number): boolean {
  const id = map.cells[index]!.placedId;
  const placed = id === null ? null : map.placed[id];
  return placed ? !PLACED[placed.type].buildable : false;
}

/** What a paint would do and cost, without doing it. Drives the live preview while dragging. */
export function previewPaint(state: GameState, tool: Tool, cells: readonly Point[]): PaintPreview {
  const map = state.map;
  const seen = new Set<number>();
  const valid: Point[] = [];
  let skipped = 0;
  for (const [x, y] of cells) {
    if (!inBounds(map, x, y)) {
      skipped += 1;
      continue;
    }
    const i = y * map.width + x;
    if (seen.has(i)) continue;
    seen.add(i);
    if (canPaint(map.cells[i]!.kind, tool) && !(tool === 'clear' && fixedInPlace(map, i))) valid.push([x, y]);
    else skipped += 1;
  }
  const cost = valid.length * UNIT_COST[tool];
  return { tool, cells: valid, skipped, cost, affordable: cost <= state.money.cash };
}

function clearCell(state: GameState, map: MapState, x: number, y: number): void {
  const cell = map.cells[y * map.width + x]!;
  if (cell.placedId !== null) {
    // Clearing any cell of a hand-placed building takes the whole building.
    removePlaced(map, cell.placedId);
    return;
  }
  if (cell.buildingId !== null) {
    cancelTimers(state, 'buildDone', cell.buildingId);
    map.buildings[cell.buildingId] = null;
  }
  cell.kind = 'empty';
  cell.zone = null;
  cell.buildingId = null;
  cell.variant = 0;
}

function paint(state: GameState, tool: Tool, cells: readonly Point[], variant = 0): ActionResult {
  const preview = previewPaint(state, tool, cells);
  if (preview.cells.length === 0) {
    return { ok: false, state, error: tool === 'clear' ? 'Nothing here to clear.' : 'Nothing here can take that.' };
  }
  if (!preview.affordable) {
    return { ok: false, state, error: `That costs ${dollars(preview.cost)}. You have ${dollars(state.money.cash)}.` };
  }

  const next = structuredClone(state);
  const map = next.map;
  for (const [x, y] of preview.cells) {
    const cell = map.cells[y * map.width + x]!;
    switch (tool) {
      case 'clear':
        clearCell(next, map, x, y);
        break;
      case 'path':
      case 'quad':
        cell.kind = tool;
        break;
      case 'tree':
        cell.kind = 'tree';
        cell.variant = Number.isInteger(variant) && variant >= 0 && variant < TREE_KINDS ? variant : 0;
        break;
      case 'housing':
      case 'academic':
        cell.kind = 'lot';
        cell.zone = tool;
        break;
    }
  }

  next.money.cash -= preview.cost;
  next.money.yearSpent += preview.cost;
  recomputeDesirability(map);
  markRatesDirty(next);
  evaluateGrowth(next);
  return { ok: true, state: next, cost: preview.cost, changed: preview.cells.length };
}

const PLACE_ERROR = {
  offMap: 'That does not fit on your land.',
  blocked: 'Something is in the way. It needs empty ground.',
} as const;

function place(state: GameState, type: PlacedType, x: number, y: number): ActionResult {
  const spec = PLACED[type];
  if (!spec.buildable) return { ok: false, state, error: 'That cannot be built.' };
  const preview = previewPlace(state, type, x, y);
  if (preview.problem === 'cash') {
    return { ok: false, state, error: `That costs ${dollars(spec.cost)}. You have ${dollars(state.money.cash)}.` };
  }
  if (preview.problem) return { ok: false, state, error: PLACE_ERROR[preview.problem] };

  const next = structuredClone(state);
  addPlaced(next.map, type, x, y);
  next.money.cash -= spec.cost;
  next.money.yearSpent += spec.cost;
  recomputeDesirability(next.map);
  markRatesDirty(next);
  evaluateGrowth(next);
  return { ok: true, state: next, cost: spec.cost, changed: 1 };
}

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'paint':
      return paint(state, action.tool, action.cells, action.variant);
    case 'place':
      return place(state, action.building, action.x, action.y);
  }
}

/** The cells a drag covers: a straight row or column from one cell to another. */
export function rowBetween(a: Point, b: Point): Point[] {
  const [ax, ay] = a;
  const [bx, by] = b;
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
  const out: Point[] = [];
  if (horizontal) {
    const step = bx >= ax ? 1 : -1;
    for (let x = ax; x !== bx + step; x += step) out.push([x, ay]);
  } else {
    const step = by >= ay ? 1 : -1;
    for (let y = ay; y !== by + step; y += step) out.push([ax, y]);
  }
  return out;
}
