import { PLACED } from './config/placed';
import { REFUND_SHARE, UNDO_TICKS, MARKETING_LIFT } from './config/money';
import { addPlaced, previewPlace, removePlaced } from './systems/placed';
import type { PlacedType } from './types';
import { TREE_KINDS } from './config/desirability';
import { COST } from './config/money';
import { YARD_MAX_WORKERS, YARD_START_WORKERS } from './config/grounds';
import { dollars } from './format';
import { inBounds } from './selectors';
import { ownedAt } from './systems/town';
import { recomputeDesirability } from './systems/desirability';
import { evaluateGrowth, cancelStrandedBuilds } from './systems/growth';
import { markRatesDirty } from './systems/money';
import { cancelTimers } from './timers';
import type { CellKind, GameState, MapState, Zone } from './types';

/**
 * Everything the player can do. Each action is a pure function from one state
 * to the next: it never reads the clock and never draws randomness. The app
 * advances the sim to now before applying one. See DESIGN.md section 17.
 */

/** What a drag paints onto the map. */
/** 'bin', 'bench' and 'table' lay small things one cell each, a row at a drag, as trees are planted. */
export type Tool = Zone | 'path' | 'road' | 'quad' | 'tree' | 'clear' | 'bin' | 'bench' | 'table';

export type Point = readonly [number, number];

/** `variant` picks the kind of tree. Other tools ignore it. */
export type Action =
  | { type: 'paint'; tool: Tool; cells: readonly Point[]; variant?: number }
  | { type: 'place'; building: PlacedType; x: number; y: number }
  | { type: 'buyLand'; parcel: number }
  | { type: 'staff'; yard: number; workers: number }
  /** Set the recruiting and marketing step: 0 is off, 4 the most. */
  | { type: 'marketing'; step: number }
  /** Pay cash into the endowment. It never comes back out. */
  | { type: 'endow'; amount: number };

export interface PaintPreview {
  tool: Tool;
  /** Cells the paint would change. */
  cells: Point[];
  /** Cells in the drag that cannot take this tool. */
  skipped: number;
  cost: number;
  affordable: boolean;
  /** Clear only: the money that comes back. */
  refund: number;
  /** Clear only: true when everything is still inside its undo minute, so the whole price comes back. */
  undo: boolean;
  /** Clear only: the hand-placed buildings it would remove. */
  buildings: PlacedType[];
}

export type ActionResult =
  | { ok: true; state: GameState; cost: number; changed: number }
  | { ok: false; state: GameState; error: string };

const UNIT_COST: Record<Tool, number> = {
  housing: COST.zoneLot,
  academic: COST.zoneLot,
  path: COST.path,
  road: COST.road,
  quad: COST.quad,
  tree: COST.tree,
  clear: COST.clear,
  bin: PLACED.bin.cost,
  bench: PLACED.bench.cost,
  table: PLACED.table.cost,
};

function canPaint(kind: CellKind, tool: Tool): boolean {
  if (tool === 'clear') return kind !== 'empty';
  // A road laid over a path, or a path over a road, makes a crossing: both pass through the cell.
  if (tool === 'road') return kind === 'empty' || kind === 'path';
  if (tool === 'path') return kind === 'empty' || kind === 'road';
  return kind === 'empty';
}

/** Buildings that came with the campus stay where they are. */
function fixedInPlace(map: MapState, index: number): boolean {
  const id = map.cells[index]!.placedId;
  const placed = id === null ? null : map.placed[id];
  return placed ? !PLACED[placed.type].buildable : false;
}

/**
 * What comes back for clearing something that cost `cost` and was paid for at
 * `builtTick`. All of it inside the undo minute, a share after, and nothing
 * for what the campus began with. The undo ends early if a class arrived or a
 * semester ended while the thing stood, so it cannot be put up for that moment
 * and taken back for free.
 */
export function refundFor(state: GameState, cost: number, builtTick: number): { amount: number; undo: boolean } {
  if (builtTick < 0) return { amount: 0, undo: false };
  const a = state.admissions;
  const counted = (a.lastIntake !== null && a.lastIntake.tick > builtTick) || (a.lastSemester !== null && a.lastSemester.tick > builtTick);
  const undo = state.clock.tick - builtTick <= UNDO_TICKS && !counted;
  return { amount: undo ? cost : Math.floor(cost * REFUND_SHARE), undo };
}

const PAINT_COST: Partial<Record<CellKind, number>> = { path: COST.path, quad: COST.quad, tree: COST.tree, lot: COST.zoneLot, road: COST.road, crossing: COST.road + COST.path };

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
    // Only the campus's own land can be changed. The town and the fields for sale are not the player's.
    if (ownedAt(map, x, y) && canPaint(map.cells[i]!.kind, tool) && !(tool === 'clear' && fixedInPlace(map, i))) valid.push([x, y]);
    else skipped += 1;
  }
  let refund = 0;
  let undo = tool === 'clear' && valid.length > 0;
  const buildings: PlacedType[] = [];
  if (tool === 'clear') {
    const counted = new Set<number>();
    for (const [x, y] of valid) {
      const cell = map.cells[y * map.width + x]!;
      let back = { amount: 0, undo: false };
      if (cell.placedId !== null) {
        // A building is one thing, however many of its cells the drag touched.
        if (counted.has(cell.placedId)) continue;
        counted.add(cell.placedId);
        const placed = map.placed[cell.placedId];
        if (placed) {
          buildings.push(placed.type);
          back = refundFor(state, PLACED[placed.type].cost, placed.builtTick);
          // The food truck drives off: its whole price comes back whenever it is cleared, so moving it is free.
          if (PLACED[placed.type].fullRefund && placed.builtTick >= 0) back = { amount: PLACED[placed.type].cost, undo: back.undo };
        }
      } else {
        back = refundFor(state, PAINT_COST[cell.kind] ?? 0, cell.builtTick);
      }
      refund += back.amount;
      if (!back.undo) undo = false;
    }
  }
  const cost = valid.length * UNIT_COST[tool];
  return { tool, cells: valid, skipped, cost, affordable: cost <= state.money.cash, refund, undo, buildings };
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
  cell.builtTick = -1;
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
    if (tool !== 'clear') cell.builtTick = next.clock.tick;
    switch (tool) {
      case 'clear':
        clearCell(next, map, x, y);
        break;
      case 'path':
        cell.kind = cell.kind === 'road' ? 'crossing' : 'path';
        break;
      case 'road':
        cell.kind = cell.kind === 'path' ? 'crossing' : 'road';
        break;
      case 'quad':
        cell.kind = 'quad';
        break;
      case 'bin':
      case 'bench':
      case 'table':
        addPlaced(map, tool, x, y, next.clock.tick);
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

  next.money.cash += preview.refund - preview.cost;
  next.money.yearSpent += preview.cost - preview.refund;
  recomputeDesirability(map);
  // Builds that leaned on what was just cleared stop, so nothing can be placed for a moment and taken back.
  if (tool === 'clear') cancelStrandedBuilds(next);
  markRatesDirty(next);
  evaluateGrowth(next);
  return { ok: true, state: next, cost: preview.cost - preview.refund, changed: preview.cells.length };
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
  const built = addPlaced(next.map, type, x, y, next.clock.tick);
  // A yard opens with a worker on its books.
  if (type === 'yard') next.grounds.workers[built.id] = YARD_START_WORKERS;
  next.money.cash -= spec.cost;
  next.money.yearSpent += spec.cost;
  recomputeDesirability(next.map);
  markRatesDirty(next);
  evaluateGrowth(next);
  return { ok: true, state: next, cost: spec.cost, changed: 1 };
}

/** Buy a field. It becomes land the campus can build on. */
function buyLand(state: GameState, id: number): ActionResult {
  const parcel = state.map.parcels[id];
  if (!parcel || parcel.owned) return { ok: false, state, error: 'That land is not for sale.' };
  if (parcel.price > state.money.cash) {
    return { ok: false, state, error: `The ${parcel.name} costs ${dollars(parcel.price)}. You have ${dollars(state.money.cash)}.` };
  }
  const next = structuredClone(state);
  next.map.parcels[id]!.owned = true;
  next.money.cash -= parcel.price;
  next.money.yearSpent += parcel.price;
  return { ok: true, state: next, cost: parcel.price, changed: 1 };
}

/** Set how many workers a Facilities Yard has. Hiring and letting go are instant and free; the wage is the cost. */
function staff(state: GameState, yardId: number, workers: number): ActionResult {
  const yard = state.map.placed[yardId];
  if (!yard || yard.type !== 'yard') return { ok: false, state, error: 'That is not a Facilities Yard.' };
  if (!Number.isInteger(workers) || workers < 0 || workers > YARD_MAX_WORKERS) {
    return { ok: false, state, error: `A yard holds up to ${YARD_MAX_WORKERS} workers.` };
  }
  const next = structuredClone(state);
  next.grounds.workers[yardId] = workers;
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1 };
}

/** Turn recruiting and marketing up or down. It is paid by the student from then on, and lifts the next class. */
function setMarketing(state: GameState, step: number): ActionResult {
  if (!Number.isInteger(step) || step < 0 || step >= MARKETING_LIFT.length) {
    return { ok: false, state, error: `Marketing has steps 0 to ${MARKETING_LIFT.length - 1}.` };
  }
  if (step === state.money.marketing) return { ok: true, state, cost: 0, changed: 0 };
  const next = structuredClone(state);
  next.money.marketing = step;
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1 };
}

/** Pay cash into the endowment. It cannot be taken out again, and earns a small income for good. */
function endow(state: GameState, amount: number): ActionResult {
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, state, error: 'Choose an amount to pay in.' };
  if (amount > state.money.cash) return { ok: false, state, error: `You have ${dollars(state.money.cash)}.` };
  const next = structuredClone(state);
  next.money.cash -= amount;
  next.money.endowment += amount;
  markRatesDirty(next);
  return { ok: true, state: next, cost: amount, changed: 1 };
}

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'paint':
      return paint(state, action.tool, action.cells, action.variant);
    case 'place':
      return place(state, action.building, action.x, action.y);
    case 'buyLand':
      return buyLand(state, action.parcel);
    case 'staff':
      return staff(state, action.yard, action.workers);
    case 'marketing':
      return setMarketing(state, action.step);
    case 'endow':
      return endow(state, action.amount);
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
