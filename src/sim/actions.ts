import { bigBuildCleared, buySecondBuilder, cannotStart, isBigBuild, startBigBuild } from './systems/bigBuilds';
import { cannotBuildLab, isLab, labCleared, labPlaced } from './systems/labs';
import { chooseTradition } from './systems/traditions';
import { scaleOf } from './scale';
import { placedCost } from './config/placed';
import { PLACED } from './config/placed';
import { REFUND_SHARE, UNDO_TICKS, MARKETING_LIFT } from './config/money';
import { addPlaced, previewPlace, removePlaced } from './systems/placed';
import type { PlacedType } from './types';
import { TREE_KINDS } from './config/desirability';
import { paintCost } from './config/money';
import { YARD_MAX_WORKERS, YARD_START_WORKERS } from './config/grounds';
import { minutesToAnchor, timeOfTick, yearLength } from './calendar';
import { SCHOOL_COLOURS, TICKET_PRICE } from './config/football';
import { choose, stretchDecisions } from './systems/decisions';
import { chooseInbox, stretchInbox } from './systems/inbox';
import { ANCHOR_RECHARGE_TICKS, TICKS_PER_DAY, TICKS_PER_YEAR } from './config/time';
import { dollars, duration } from './format';
import { inBounds } from './selectors';
import { ownedAt } from './systems/town';
import { recomputeDesirability } from './systems/desirability';
import { evaluateGrowth, cancelStrandedBuilds } from './systems/growth';
import { markRatesDirty } from './systems/money';
import { INSTRUCTION_RATIOS } from './config/staffing';
import { instructionStep, planStaff } from './systems/staffing';
import { RANK_GOALS } from './config/goals';
import { eraOf, rewardGoal, rewardsEarned, rewardsWaiting } from './systems/goals';
import { ERA_AT_RANK, ERAS } from './config/goals';
import { policyLocked, policyOn, policySpec } from './systems/policies';
import { collectOne, collectReady, dailyOnCleared, dailyOnPlaced, finishNow, hasDaily } from './systems/daily';
import { claimOrder, dismissOrder, ordersCount, seeOrders } from './systems/orders';
import { buyBench, collectCraft, moveDecor, placeDecor, setRecipe, storeDecor, turnDecor } from './systems/decor';
import { claimMoment, takeGift, type GiftPaid } from './systems/rhythm';
import type { OrderReward } from './config/orders';
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
  /** Set the Instruction slider: 0 to 4. It sets how many students one member of faculty is hired for. */
  | { type: 'instruction'; step: number }
  /** Pay cash into the endowment. It never comes back out. */
  | { type: 'endow'; amount: number }
  /** Choose or move the anchor: the minute of the UTC day at which each day of the campus week begins. */
  | { type: 'anchor'; minute: number }
  /** Answer one of the annual decisions. */
  | { type: 'decide'; id: number; option: string }
  | { type: 'inbox'; id: number; option: string }
  /** Set the ticket price step, 0 to 4. */
  | { type: 'ticketPrice'; step: number }
  /** Choose the school's colour. */
  | { type: 'colour'; colour: string }
  /** Turn a policy on or off. It then stays as it is until the next class moves in. */
  | { type: 'policy'; id: string; on: boolean }
  /** Collect what one building holds, by its key, or everything whose marker shows. */
  | { type: 'collect'; key: string }
  | { type: 'collectAll' }
  /** Choose a tradition for an open place (DESIGN.md 50). */
  | { type: 'chooseTradition'; id: string }
  /** Finish a wait now, for its price in Gold Seals: 'stadium', 'faculty', or 'policy:' and a policy's id. */
  | { type: 'finish'; wait: string }
  /** Look at the orders board: new orders are given what they ask and their clocks start. */
  | { type: 'seeOrders' }
  /** Claim a finished order, or dismiss one that is not wanted. */
  | { type: 'claimOrder'; id: number }
  | { type: 'dismissOrder'; id: number }
  /** Place a decoration: one from storage if there is one, or bought from its shelf. `flip` turns one that runs one way. */
  | { type: 'placeDecor'; id: string; x: number; y: number; flip?: boolean }
  /** Move a decoration on the map, put it away into storage, or turn it. All three are free. */
  | { type: 'moveDecor'; placed: number; x: number; y: number }
  | { type: 'storeDecor'; placed: number }
  | { type: 'turnDecor'; placed: number }
  /** The Workshop: choose what a bench makes (null stops it), collect what it finished, or buy the second bench. */
  | { type: 'setRecipe'; bench: number; recipe: string | null }
  | { type: 'collectCraft'; bench: number }
  | { type: 'buyBench' }
  // The daily rhythm (DESIGN.md 44): today's gift, and a moment of the calendar that went well.
  | { type: 'takeGift' }
  | { type: 'claimMoment'; id: number }
  | { type: 'buySecondBuilder' };

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
  | { ok: true; state: GameState; cost: number; changed: number; gained?: { xp: number; cash: number; count: number }; paid?: OrderReward[]; note?: string; gift?: GiftPaid }
  | { ok: false; state: GameState; error: string };

/** What one cell of a tool costs on a campus of a given scale (DESIGN.md 35.7). */
function unitCost(tool: Tool, scale: number): number {
  switch (tool) {
    case 'housing':
    case 'academic':
      return paintCost('zoneLot', scale);
    case 'bin':
    case 'bench':
    case 'table':
      return placedCost(tool, scale);
    default:
      return paintCost(tool, scale);
  }
}

function canPaint(kind: CellKind, tool: Tool): boolean {
  if (tool === 'clear') return kind !== 'empty';
  // A road laid over a path, or a path over a road, makes a crossing: both pass through the cell.
  if (tool === 'road') return kind === 'empty' || kind === 'path';
  if (tool === 'path') return kind === 'empty' || kind === 'road';
  return kind === 'empty';
}

/** Buildings that came with the campus stay where they are. */
function fixedInPlace(state: GameState, index: number): boolean {
  const map = state.map;
  const id = map.cells[index]!.placedId;
  const placed = id === null ? null : map.placed[id];
  if (!placed) return false;
  // A decoration is never fixed: clearing one puts it away.
  if (placed.type === 'decor') return false;
  // The stadium plot can be moved while it is bare. Once a stadium stands on it, or is being built, it stays.
  if (placed.type === 'stadium') return state.football.stadium.tier > 0 || state.football.stadium.work !== null;
  return !PLACED[placed.type].buildable;
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

/** What the ground on a cell cost to lay, for the refund when it is cleared. */
function laidCost(kind: CellKind, scale: number): number {
  switch (kind) {
    case 'path':
    case 'quad':
    case 'tree':
    case 'road':
      return paintCost(kind, scale);
    case 'lot':
      return paintCost('zoneLot', scale);
    case 'crossing':
      return paintCost('road', scale) + paintCost('path', scale);
    default:
      return 0;
  }
}

/** What a paint would do and cost, without doing it. Drives the live preview while dragging. */
export function previewPaint(state: GameState, tool: Tool, cells: readonly Point[]): PaintPreview {
  const map = state.map;
  const scale = scaleOf(map);
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
    if (ownedAt(map, x, y) && canPaint(map.cells[i]!.kind, tool) && !(tool === 'clear' && fixedInPlace(state, i))) valid.push([x, y]);
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
          back = refundFor(state, placedCost(placed.type, scale), placed.builtTick);
          // The food truck drives off: its whole price comes back whenever it is cleared, so moving it is free.
          if (PLACED[placed.type].fullRefund && placed.builtTick >= 0) back = { amount: placedCost(placed.type, scale), undo: back.undo };
        }
      } else {
        back = refundFor(state, laidCost(cell.kind, scale), cell.builtTick);
      }
      refund += back.amount;
      if (!back.undo) undo = false;
    }
  }
  const cost = valid.length * unitCost(tool, scale);
  return { tool, cells: valid, skipped, cost, affordable: cost <= state.money.cash, refund, undo, buildings };
}

function clearCell(state: GameState, map: MapState, x: number, y: number): void {
  const cell = map.cells[y * map.width + x]!;
  if (cell.placedId !== null) {
    // A decoration is never lost: clearing it puts it away, to be placed again for nothing.
    if (map.placed[cell.placedId]?.type === 'decor') {
      storeDecor(state, cell.placedId);
      return;
    }
    // Clearing any cell of a hand-placed building takes the whole building.
    if (state.football.stadium.plot === cell.placedId) state.football.stadium.plot = null;
    if (map.placed[cell.placedId]?.done !== undefined) bigBuildCleared(state, cell.placedId);
    if (state.labs?.since[cell.placedId] !== undefined) labCleared(state, cell.placedId);
    dailyOnCleared(state, 'placed', cell.placedId);
    removePlaced(map, cell.placedId);
    return;
  }
  if (cell.buildingId !== null) {
    cancelTimers(state, 'buildDone', cell.buildingId);
    dailyOnCleared(state, 'lot', cell.buildingId);
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
        ordersCount(next, 'quads');
        cell.kind = 'quad';
        break;
      case 'bin':
      case 'bench':
      case 'table':
        addPlaced(map, tool, x, y, next.clock.tick);
        ordersCount(next, 'furniture');
        break;
      case 'tree':
        ordersCount(next, 'trees');
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
  // A rank goal's building is earned, never bought, and there is one of each (DESIGN.md section 40).
  const goal = rewardGoal(type);
  if (goal >= 0) {
    if (!rewardsEarned(state).includes(type)) return { ok: false, state, error: `${spec.name} comes with the Top ${RANK_GOALS[goal]}.` };
    if (!rewardsWaiting(state).includes(type)) return { ok: false, state, error: `${spec.name} is already on the campus. Clear it first to move it.` };
  }
  // A big build of an era is one of a kind, opened by its era, and goes up while a builder is free (DESIGN.md 45).
  if (isBigBuild(type)) {
    const why = cannotStart(state, type);
    if (why) return { ok: false, state, error: why };
  }
  // A research lab: one for each field, on a game with goals (DESIGN.md 49).
  if (isLab(type)) {
    const why = cannotBuildLab(state, type);
    if (why) return { ok: false, state, error: why };
  }
  if (type === 'stadium' && state.football.stadium.plot !== null && state.map.placed[state.football.stadium.plot]) {
    return { ok: false, state, error: 'The campus already has a stadium plot. Clear it first to move it.' };
  }
  const preview = previewPlace(state, type, x, y);
  if (preview.problem === 'cash') {
    return { ok: false, state, error: `That costs ${dollars(preview.cost)}. You have ${dollars(state.money.cash)}.` };
  }
  if (preview.problem) return { ok: false, state, error: PLACE_ERROR[preview.problem] };

  const next = structuredClone(state);
  const built = addPlaced(next.map, type, x, y, next.clock.tick);
  // A yard opens with a worker on its books.
  if (type === 'yard') next.grounds.workers[built.id] = YARD_START_WORKERS;
  if (type === 'stadium') next.football.stadium.plot = built.id;
  if (isBigBuild(type)) startBigBuild(next, built);
  if (isLab(type)) labPlaced(next, built);
  // The daily layer: it begins to fill from now, and holds its opening bonus. A big build does so when it opens.
  if (!isBigBuild(type)) dailyOnPlaced(next, built.id);
  next.money.cash -= preview.cost;
  next.money.yearSpent += preview.cost;
  recomputeDesirability(next.map);
  markRatesDirty(next);
  evaluateGrowth(next);
  return { ok: true, state: next, cost: preview.cost, changed: 1 };
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

/**
 * Move the Instruction slider. It sets the ratio the campus hires faculty
 * for. Nobody is hired or let go on the spot: the faculty for the new ratio
 * arrive, or leave, when the next semester begins (DESIGN.md 38).
 */
function setInstruction(state: GameState, step: number): ActionResult {
  if (!Number.isInteger(step) || step < 0 || step >= INSTRUCTION_RATIOS.length) {
    return { ok: false, state, error: `Instruction has steps 0 to ${INSTRUCTION_RATIOS.length - 1}.` };
  }
  if (step === instructionStep(state)) return { ok: true, state, cost: 0, changed: 0 };
  const next = structuredClone(state);
  next.staffing.instruction = step;
  planStaff(next);
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

/** When the anchor can next be moved, as a tick. 0 when it can be moved now. */
export function anchorFreeAt(state: GameState): number {
  const clock = state.clock;
  if (clock.anchor === null || clock.anchorMovedTick < 0) return 0;
  const free = clock.anchorMovedTick + ANCHOR_RECHARGE_TICKS;
  return free > clock.tick ? free : 0;
}

/**
 * Choose or move the anchor. The year in progress keeps every hour it had:
 * its summer is stretched, by up to a day, so the next fall begins at the new
 * anchor. Nothing is ever shortened, so no window closes early.
 */
function setAnchor(state: GameState, minute: number): ActionResult {
  if (!Number.isInteger(minute) || minute < 0 || minute >= TICKS_PER_DAY) return { ok: false, state, error: 'Choose a time of day.' };
  const clock = state.clock;
  if (clock.anchor === minute) return { ok: true, state, cost: 0, changed: 0 };
  const free = anchorFreeAt(state);
  if (free > 0) return { ok: false, state, error: `You can change this again in ${duration(free - clock.tick)}.` };
  const next = structuredClone(state);
  const week = next.clock.week;
  // The earliest the next fall could begin: when this year's seven days are up, or now if they already are.
  const plain = week.start + TICKS_PER_YEAR;
  const base = Math.max(plain, next.clock.tick + 1);
  week.extra = base - plain + minutesToAnchor(timeOfTick(next.clock, base), minute);
  // The first choice on a game that had none is free. After that, moving it starts the four-week wait.
  if (next.clock.anchor !== null) next.clock.anchorMovedTick = next.clock.tick;
  next.clock.anchor = minute;
  // Decisions that close when the next fall begins stay open for the longer summer.
  stretchDecisions(next, clock.week.start + yearLength(clock.week));
  stretchInbox(next, clock.week.start + yearLength(clock.week));
  return { ok: true, state: next, cost: 0, changed: 1 };
}

/** Answer an annual decision. */
function decide(state: GameState, id: number, option: string): ActionResult {
  const next = structuredClone(state);
  const before = next.money.cash;
  const error = choose(next, id, option);
  if (error) return { ok: false, state, error };
  return { ok: true, state: next, cost: before - next.money.cash, changed: 1 };
}

/** Answer a petition, a deal or an event on the desk. */
function answer(state: GameState, id: number, option: string): ActionResult {
  const next = structuredClone(state);
  const before = next.money.cash;
  const error = chooseInbox(next, id, option);
  if (error) return { ok: false, state, error };
  return { ok: true, state: next, cost: before - next.money.cash, changed: 1 };
}

/** Set the price of a ticket. Cheaper fills the seats, which is what earns the next stadium. Dearer earns more now. */
function setTicketPrice(state: GameState, step: number): ActionResult {
  if (!Number.isInteger(step) || step < 0 || step >= TICKET_PRICE.length) return { ok: false, state, error: `Tickets have ${TICKET_PRICE.length} prices.` };
  if (step === state.football.stadium.price) return { ok: true, state, cost: 0, changed: 0 };
  const next = structuredClone(state);
  next.football.stadium.price = step;
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1 };
}

/**
 * Turn a policy on or off (DESIGN.md 41.7). Its era must have opened it, and
 * a switch changed since the last class moved in stays as it is until the
 * next one does. Nothing is paid to change one.
 */
function setPolicy(state: GameState, id: string, on: boolean): ActionResult {
  const spec = policySpec(id);
  if (!spec) return { ok: false, state, error: 'There is no such policy.' };
  if (!state.goals || eraOf(state.goals) < spec.era) {
    return { ok: false, state, error: `${spec.name} opens with the ${ERAS[spec.era]} era, at the Top ${RANK_GOALS[ERA_AT_RANK[spec.era - 1]! - 1]}.` };
  }
  if (policyOn(state, id) === on) return { ok: true, state, cost: 0, changed: 0 };
  if (policyLocked(state, id)) return { ok: false, state, error: `${spec.name} was just changed. It stays as it is until the next class moves in.` };
  const next = structuredClone(state);
  next.policies.on = on ? [...next.policies.on, id] : next.policies.on.filter((one) => one !== id);
  next.policies.locked.push(id);
  next.policies.news.push({ id, on });
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1 };
}

/**
 * Collect what a building holds (DESIGN.md 42.4): one by its key, or every
 * one whose marker shows. Mostly experience and a little cash. It is a
 * bonus: leaving it costs nothing for 36 hours, and normal income never
 * waits on it.
 */
function collect(state: GameState, key: string | null): ActionResult {
  if (!hasDaily(state)) return { ok: false, state, error: 'There is nothing to collect here.' };
  const next = structuredClone(state);
  if (key === null) {
    const all = collectReady(next);
    if (all.count === 0) return { ok: false, state, error: 'Nothing is ready to collect yet.' };
    ordersCount(next, 'collects', all.count);
    return { ok: true, state: next, cost: 0, changed: all.count, gained: all };
  }
  const paid = collectOne(next, key);
  if (!paid) return { ok: false, state, error: 'There is nothing to collect there yet.' };
  ordersCount(next, 'collects');
  return { ok: true, state: next, cost: 0, changed: 1, gained: { ...paid, count: 1 } };
}

/**
 * Decorations and the Workshop (DESIGN.md 42.5 and 42.6). Placing, moving,
 * turning and putting away change the map, so how each lot looks is worked
 * out again. Nothing here can be lost: what is cleared goes to storage.
 */
type DecorAction = Extract<Action, { type: 'placeDecor' | 'moveDecor' | 'storeDecor' | 'turnDecor' | 'setRecipe' | 'collectCraft' | 'buyBench' }>;

function decorate(state: GameState, action: DecorAction): ActionResult {
  if (!hasDaily(state)) return { ok: false, state, error: 'This campus has no decorations.' };
  const next = structuredClone(state);
  const mapChanged = (cost: number): ActionResult => {
    recomputeDesirability(next.map);
    markRatesDirty(next);
    evaluateGrowth(next);
    return { ok: true, state: next, cost, changed: 1 };
  };
  switch (action.type) {
    case 'placeDecor': {
      const done = placeDecor(next, action.id, action.x, action.y, action.flip === true);
      if (typeof done === 'string') return { ok: false, state, error: done };
      return mapChanged(done.cost);
    }
    case 'moveDecor': {
      const problem = moveDecor(next, action.placed, action.x, action.y);
      return problem ? { ok: false, state, error: problem } : mapChanged(0);
    }
    case 'storeDecor': {
      const problem = storeDecor(next, action.placed);
      return problem ? { ok: false, state, error: problem } : mapChanged(0);
    }
    case 'turnDecor': {
      const problem = turnDecor(next, action.placed);
      return problem ? { ok: false, state, error: problem } : { ok: true, state: next, cost: 0, changed: 1 };
    }
    case 'setRecipe': {
      const before = next.money.cash;
      const problem = setRecipe(next, action.bench, action.recipe);
      // A recipe the campus cannot pay for yet is still chosen: the bench waits, and the reason is passed on.
      if (problem && next.decor.benches[action.bench]?.recipe !== action.recipe) return { ok: false, state, error: problem };
      return { ok: true, state: next, cost: before - next.money.cash, changed: 1, ...(problem ? { note: problem } : {}) };
    }
    case 'collectCraft': {
      const before = next.money.cash;
      const made = collectCraft(next, action.bench);
      if (typeof made === 'string') return { ok: false, state, error: made };
      return { ok: true, state: next, cost: before - next.money.cash, changed: 1, gained: { xp: made.xp, cash: 0, count: 1 }, ...(made.next ? { note: made.next } : {}) };
    }
    case 'buyBench': {
      const problem = buyBench(next);
      return problem ? { ok: false, state, error: problem } : { ok: true, state: next, cost: 0, changed: 1 };
    }
  }
}

/**
 * The orders board (DESIGN.md 42.3). Looking at it is an action, because
 * that is when a new order is given what it asks and its clock starts.
 */
function orders(state: GameState, action: { type: 'seeOrders' } | { type: 'claimOrder'; id: number } | { type: 'dismissOrder'; id: number }): ActionResult {
  if (!hasDaily(state)) return { ok: false, state, error: 'This campus has no orders board.' };
  const next = structuredClone(state);
  if (action.type === 'seeOrders') {
    seeOrders(next);
    return { ok: true, state: next, cost: 0, changed: 0 };
  }
  if (action.type === 'dismissOrder') {
    const problem = dismissOrder(next, action.id);
    return problem ? { ok: false, state, error: problem } : { ok: true, state: next, cost: 0, changed: 1 };
  }
  const paid = claimOrder(next, action.id);
  if (typeof paid === 'string') return { ok: false, state, error: paid };
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1, paid: paid.rewards };
}

/** Finish a wait now, for Gold Seals (DESIGN.md 42.7). The price is the one `waits` quotes. */
function finish(state: GameState, wait: string): ActionResult {
  if (!hasDaily(state)) return { ok: false, state, error: 'There is nothing to finish here.' };
  const next = structuredClone(state);
  const problem = finishNow(next, wait);
  if (problem) return { ok: false, state, error: problem };
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1 };
}

function setColour(state: GameState, colour: string): ActionResult {
  if (!SCHOOL_COLOURS.some((one) => one.id === colour)) return { ok: false, state, error: 'That is not one of the colours.' };
  if (colour === state.football.colour) return { ok: true, state, cost: 0, changed: 0 };
  const next = structuredClone(state);
  next.football.colour = colour;
  return { ok: true, state: next, cost: 0, changed: 1 };
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
    case 'instruction':
      return setInstruction(state, action.step);
    case 'endow':
      return endow(state, action.amount);
    case 'anchor':
      return setAnchor(state, action.minute);
    case 'decide':
      return decide(state, action.id, action.option);
    case 'inbox':
      return answer(state, action.id, action.option);
    case 'ticketPrice':
      return setTicketPrice(state, action.step);
    case 'colour':
      return setColour(state, action.colour);
    case 'policy':
      return setPolicy(state, action.id, action.on);
    case 'collect':
      return collect(state, action.key);
    case 'collectAll':
      return collect(state, null);
    case 'finish':
      return finish(state, action.wait);
    case 'seeOrders':
    case 'claimOrder':
    case 'dismissOrder':
      return orders(state, action);
    case 'placeDecor':
    case 'moveDecor':
    case 'storeDecor':
    case 'turnDecor':
    case 'setRecipe':
    case 'collectCraft':
    case 'buyBench':
      return decorate(state, action);
    case 'takeGift':
    case 'claimMoment':
      return rhythmAction(state, action);
    case 'buySecondBuilder': {
      const next = structuredClone(state);
      const problem = buySecondBuilder(next);
      return problem ? { ok: false, state, error: problem } : { ok: true, state: next, cost: 0, changed: 1 };
    }
    case 'chooseTradition': {
      const next = structuredClone(state);
      const problem = chooseTradition(next, action.id);
      return problem ? { ok: false, state, error: problem } : { ok: true, state: next, cost: 0, changed: 1 };
    }
  }
}

/** Today's gift, and claiming a moment of the calendar (DESIGN.md 44). */
function rhythmAction(state: GameState, action: { type: 'takeGift' } | { type: 'claimMoment'; id: number }): ActionResult {
  if (!hasDaily(state)) return { ok: false, state, error: 'There is no gift or calendar here.' };
  const next = structuredClone(state);
  if (action.type === 'takeGift') {
    const gift = takeGift(next);
    if (typeof gift === 'string') return { ok: false, state, error: gift };
    markRatesDirty(next);
    return { ok: true, state: next, cost: 0, changed: 1, gift, gained: { xp: gift.xp, cash: gift.cash, count: 1 } };
  }
  const claimed = claimMoment(next, action.id);
  if (typeof claimed === 'string') return { ok: false, state, error: claimed };
  markRatesDirty(next);
  return { ok: true, state: next, cost: 0, changed: 1, paid: claimed.pays };
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
