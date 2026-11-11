import {
  applyAction,
  approvalAt,
  campusHappiness,
  COST,
  coverFor,
  fedAt,
  PLACED,
  previewPlace,
  shortage,
  type DriverId,
  partLevel,
  type PlacedType,
  ZONES,
  type GameState,
  type Point,
  type Tool,
  type Zone,
} from '../src/sim';

/**
 * Scripted players for the headless simulation. They only use the same
 * actions a person can, so what they manage is what a person could manage.
 */

/** Daily is the casual player looking in half as often: once a day, the slowest rhythm the game supports. */
export type Style = 'absent' | 'daily' | 'casual' | 'optimizer';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function kindAt(state: GameState, x: number, y: number): string | null {
  const { width, height, cells } = state.map;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return cells[y * width + x]!.kind;
}

function besidePath(state: GameState, x: number, y: number): boolean {
  return DIRS.some(([dx, dy]) => kindAt(state, x + dx, y + dy) === 'path');
}

/**
 * The street plan the bots follow: the two spines, two cross streets through
 * the ring, then more streets every third row and a few more cross streets.
 * Cells on the plan are kept clear for paths and never zoned.
 */
const STREET_ROWS = [14, 17, 11, 20, 8, 23, 5, 26, 2, 29];
const STREET_COLS = [14, 17, 8, 23, 2, 29];
const onStreetPlan = (x: number, y: number): boolean => STREET_ROWS.includes(y) || STREET_COLS.includes(x);

/** Empty cells that touch a path and are not reserved for a street, nearest the middle first. */
function lotSpots(state: GameState): Point[] {
  const { width, height } = state.map;
  const cx = width / 2;
  const cy = height / 2;
  const spots: Array<{ p: Point; d: number }> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (kindAt(state, x, y) === 'empty' && !onStreetPlan(x, y) && besidePath(state, x, y)) {
        spots.push({ p: [x, y], d: Math.max(Math.abs(x - cx), Math.abs(y - cy)) });
      }
    }
  }
  spots.sort((a, b) => a.d - b.d || a.p[1] - b.p[1] || a.p[0] - b.p[0]);
  return spots.map((s) => s.p);
}

/** One spot in five becomes a quad, so every lot in a row sits within two cells of green space. */
function isQuadSpot([x, y]: Point): boolean {
  return (x + y) % 5 === 2;
}

/**
 * The next stretch of path on the street plan: up to eight empty cells in a
 * line that connect to a path already laid. Null when the plan is complete.
 */
function nextPathStretch(state: GameState): Point[] | null {
  const { width, height } = state.map;
  const lines: Array<{ fixed: number; horizontal: boolean }> = [];
  // Interleave rows and columns so new streets always have a cross street to join.
  for (let i = 0; i < STREET_ROWS.length; i++) {
    lines.push({ fixed: STREET_ROWS[i]!, horizontal: true });
    if (i < STREET_COLS.length) lines.push({ fixed: STREET_COLS[i]!, horizontal: false });
  }

  for (const line of lines) {
    const length = line.horizontal ? width : height;
    const at = (i: number): Point => (line.horizontal ? [i, line.fixed] : [line.fixed, i]);
    for (let i = 0; i < length; i++) {
      const [x, y] = at(i);
      if (kindAt(state, x, y) !== 'empty' || !besidePath(state, x, y)) continue;
      // Grow away from the path we touched, in whichever direction has more empty cells.
      let best: Point[] = [[x, y]];
      for (const step of [1, -1]) {
        const stretch: Point[] = [];
        for (let j = i; j >= 0 && j < length && stretch.length < 8; j += step) {
          const [sx, sy] = at(j);
          if (kindAt(state, sx, sy) !== 'empty') break;
          stretch.push([sx, sy]);
        }
        if (stretch.length > best.length) best = stretch;
      }
      return best;
    }
  }
  return null;
}

function tryPaint(state: GameState, tool: Tool, cells: Point[], reserve: number): GameState | null {
  const cost = cells.length * (tool === 'path' ? COST.path : tool === 'quad' ? COST.quad : tool === 'tree' ? COST.tree : tool === 'clear' ? COST.clear : COST.zoneLot);
  if (state.money.cash - cost < reserve) return null;
  const result = applyAction(state, { type: 'paint', tool, cells });
  return result.ok ? result.state : null;
}

function neediestZone(state: GameState): Zone | null {
  let best: Zone | null = null;
  let most = 0;
  for (const zone of ZONES) {
    const short = shortage(state, zone);
    if (short > most) {
      most = short;
      best = zone;
    }
  }
  return best;
}

// ---------------------------------------------------------- the Build menu --

/** The nearest free ground from which a building would reach a lot, keeping off the street plan. */
function menuSpot(state: GameState, type: PlacedType, x: number, y: number): Point | null {
  const spec = PLACED[type];
  let best: Point | null = null;
  let bestFar = Infinity;
  for (let py = y - spec.radius - spec.h + 1; py <= y + spec.radius; py++) {
    for (let px = x - spec.radius - spec.w + 1; px <= x + spec.radius; px++) {
      const far = Math.max(Math.max(px - x, 0, x - (px + spec.w - 1)), Math.max(py - y, 0, y - (py + spec.h - 1)));
      if (far < 1 || far > spec.radius || far >= bestFar) continue;
      let clear = previewPlace(state, type, px, py).problem === null;
      for (let cy = py; cy < py + spec.h && clear; cy++) for (let cx = px; cx < px + spec.w && clear; cx++) if (onStreetPlan(cx, cy)) clear = false;
      if (!clear) continue;
      best = [px, py];
      bestFar = far;
    }
  }
  return best;
}

/** The open building where one part of happiness is lowest: where a new building would help most. */
function neediestLot(state: GameState, part: DriverId): { x: number; y: number; level: number } | null {
  let worst: { x: number; y: number; level: number } | null = null;
  for (const b of state.map.buildings) {
    if (!b || b.stage < 1) continue;
    const level = partLevel(approvalAt(state, b.y * state.map.width + b.x).causes, part);
    if (level !== undefined && (!worst || level < worst.level)) worst = { x: b.x, y: b.y, level };
  }
  return worst;
}

const PLAY: readonly PlacedType[] = ['courts', 'gym', 'field', 'pool', 'track'];

/**
 * What a player who reads the Happiness panel would build next: dining for a
 * dorm that cannot grow without it, then whatever the panel names as the
 * biggest gap, put in reach of the lot that lacks it most.
 */
function nextFromMenu(state: GameState): { type: PlacedType; x: number; y: number } | null {
  for (const b of state.map.buildings) {
    if (b && b.zone === 'housing' && b.stage === 1 && !fedAt(state.map, b.x, b.y)) {
      return { type: state.money.cash > 150_000 ? 'dining' : 'coffee', x: b.x, y: b.y };
    }
  }
  // The panel names a cause and its weakest part. The part is what gets built.
  const worst = campusHappiness(state).worstPart;
  if (worst === 'dining' || worst === 'recreation' || worst === 'safety') {
    const lot = neediestLot(state, worst);
    if (lot && lot.level < 0.85) {
      if (worst === 'dining') return { type: 'dining', x: lot.x, y: lot.y };
      if (worst === 'recreation') {
        const built = state.map.placed.filter((p) => p && PLACED[p.type].family === 'recreation').length;
        return { type: PLAY[built % PLAY.length]!, x: lot.x, y: lot.y };
      }
      return { type: coverFor(state.map, 'medical', lot.x, lot.y) ? 'safety' : 'medical', x: lot.x, y: lot.y };
    }
  }
  // Then close the gaps in coverage: a place to play with no Medical Center over it, a dorm with no Campus Safety.
  for (const p of state.map.placed) {
    if (p && PLACED[p.type].family === 'recreation' && !coverFor(state.map, 'medical', p.x, p.y)) return { type: 'medical', x: p.x, y: p.y };
  }
  for (const b of state.map.buildings) {
    if (b && b.zone === 'housing' && b.stage > 0 && !coverFor(state.map, 'safety', b.x, b.y)) return { type: 'safety', x: b.x, y: b.y };
  }
  return null;
}

function buildFromMenu(state: GameState, reserve: number, most: number): { state: GameState; built: number; blocked: boolean } {
  let current = state;
  let built = 0;
  for (; built < most; built++) {
    const want = nextFromMenu(current);
    if (!want) break;
    if (current.money.cash - PLACED[want.type].cost < reserve) return { state: current, built, blocked: true };
    const spot = menuSpot(current, want.type, want.x, want.y);
    if (!spot) break;
    const result = applyAction(current, { type: 'place', building: want.type, x: spot[0], y: spot[1] });
    if (!result.ok) break;
    current = result.state;
  }
  return { state: current, built, blocked: false };
}

export interface TurnResult {
  state: GameState;
  /** Purchases made this check-in. */
  purchases: number;
  /** True when the bot wanted to buy something and could not afford it. */
  blockedByCash: boolean;
}

/** One check-in. The absent player does nothing. */
export function takeTurn(state: GameState, style: Style): TurnResult {
  if (style === 'absent') return { state, purchases: 0, blockedByCash: false };
  // The once-a-day player has a day's income to spend, so buys twice as much in a visit as the twice-a-day one.
  const maxPurchases = style === 'casual' ? 5 : style === 'daily' ? 10 : 60;
  const reserve = style === 'optimizer' ? 0 : 20_000;

  let current = state;
  let purchases = 0;
  let blockedByCash = false;

  while (purchases < maxPurchases) {
    const zone = neediestZone(current);
    if (!zone) break;

    const spots = lotSpots(current);
    let next: GameState | null;
    if (spots.length === 0) {
      const stretch = nextPathStretch(current);
      if (!stretch) break;
      next = tryPaint(current, 'path', stretch, reserve);
    } else {
      const spot = spots[0]!;
      next = tryPaint(current, isQuadSpot(spot) ? 'quad' : zone, [spot], reserve);
    }
    if (!next) {
      blockedByCash = true;
      break;
    }
    current = next;
    purchases += 1;
  }

  // Then the Build menu, as a player who has read the Happiness panel would use it.
  const menu = buildFromMenu(current, reserve, style === 'casual' ? 1 : style === 'daily' ? 2 : 3);
  current = menu.state;
  purchases += menu.built;
  if (menu.blocked) blockedByCash = true;
  return { state: current, purchases, blockedByCash };
}
