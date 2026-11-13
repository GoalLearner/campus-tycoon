import {
  averageDesirability,
  BENEFITS_SHARE,
  budget,
  calendarAt,
  crowding,
  FACULTY_PAY,
  facultyNeed,
  INSTRUCTION_FULL,
  INSTRUCTION_RATIOS,
  instructionStep,
  nextSemesterStaff,
  enrollment,
  rewardLift,
  rewardsWaiting,
  applyAction,
  approvalAt,
  campusHappiness,
  fallClassDraw,
  FIRST_INTAKE_TICK,
  POOL_CEILING,
  paintCost,
  placedCost,
  scaleOf,
  coverFor,
  fedAt,
  foodKindsAt,
  foodTypesAt,
  libraryLift,
  tutoredAt,
  VARIETY_KINDS,
  isMessSpot,
  isPathKind,
  previewPaint,
  spotFix,
  workersAt,
  WORK_PER_WORKER,
  yardStatus,
  YARD_MAX_WORKERS,
  localsNeedingBeds,
  ownedAt,
  PLACED,
  previewPlace,
  shortage,
  START_LAND,
  TOWN_X,
  townPlaces,
  type CellKind,
  type DriverId,
  partLevel,
  type Placed,
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
/**
 * 'striver' is a once-a-day player on a game with goals who works every cause of applicants: looks, marketing,
 * football and the academic rank (DESIGN.md 37.8). It shows what the best regular player can reach, and when.
 */
export type Style = 'absent' | 'daily' | 'casual' | 'optimizer' | 'striver';

/**
 * On a game with goals a campus is run well when it keeps $12 to $17 of every $100 (the owner's target, 37.10).
 * A test player there watches the Money panel: under the first of these it takes on no new yearly cost, and it
 * starts again once it keeps the second.
 */
const KEEPS_ENOUGH = 13.5;
const KEEPS_PLENTY = 15.2;
/**
 * The Instruction slider, as a player who reads the Money panel would use it once enrollment is capped and
 * income no longer grows (DESIGN.md 38.5): a step more faculty when the campus would still keep this much after
 * paying for them, and a step fewer when it keeps less than KEEPS_LEAST. The player who works every cause
 * funds teaching sooner than the others.
 */
const KEEPS_AFTER_FACULTY: Record<string, number> = { casual: 14.5, daily: 14.5, striver: 14 };
const KEEPS_LEAST = 13;

/** Whether the test players touch the Instruction slider. Turned off for one comparison run. */
export const botOptions = { slider: true };

/**
 * What the campus keeps of every $100 once the faculty it has already hired have arrived. The Money panel
 * shows today's margin, and a player who has just funded more faculty knows it is about to fall.
 */
function keeps(state: GameState): number {
  const books = budget(state);
  if (books.incomeTotal <= 0) return books.kept;
  const coming = Math.max(0, nextSemesterStaff(state).faculty - state.staffing.faculty);
  return books.kept - (100 * coming * FACULTY_PAY * (1 + BENEFITS_SHARE)) / books.incomeTotal;
}

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
  return DIRS.some(([dx, dy]) => isPathKind(kindAt(state, x + dx, y + dy) as CellKind | undefined));
}

/** Empty ground the campus owns: the only ground a player can build on. */
function freeAt(state: GameState, x: number, y: number): boolean {
  return kindAt(state, x, y) === 'empty' && ownedAt(state.map, x, y);
}

/**
 * The street plan the bots follow: the two spines, two cross streets through
 * the ring, then more streets every third row and a few more cross streets.
 * Cells on the plan are kept clear for paths and never zoned.
 */
// The last five rows are in the fields to the south, and only matter once a field is bought.
const STREET_ROWS = [14, 17, 11, 20, 8, 23, 5, 26, 2, 29, 33, 36, 39, 42, 45];
const STREET_COLS = [14, 17, 8, 23, 2, 29];
const onStreetPlan = (x: number, y: number): boolean => STREET_ROWS.includes(y) || STREET_COLS.includes(x);

/**
 * Blocks of two cells by two that the players never zone, so there is always
 * ground in reach of every lot for a Medical Center, Campus Safety or a gym.
 * A person learns to leave such gaps the first time a full campus has no room.
 */
const keptForServices = (x: number, y: number): boolean => (x % 16 === 5 || x % 16 === 6) && (y % 6 === 0 || y % 6 === 1);

/**
 * Free cells beside a path on a campus whose street plan is used up, one in four left open as a way through.
 * The street plan was drawn for the small campus. A model campus is laid out already, so its player builds
 * wherever there is open ground by a walk.
 */
function anyLotSpots(state: GameState): Point[] {
  const { width, height } = state.map;
  const spots: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (freeAt(state, x, y) && !keptForServices(x, y) && (x + 2 * y) % 4 !== 0 && besidePath(state, x, y)) spots.push([x, y]);
    }
  }
  return spots;
}

/** A walk into open ground: from a free cell beside a path, up to eight free cells in a line, the longest there is. */
function anyPathStretch(state: GameState): Point[] | null {
  const { width, height } = state.map;
  let best: Point[] | null = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!freeAt(state, x, y) || !besidePath(state, x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const stretch: Point[] = [];
        for (let n = 0; n < 8; n++) {
          const sx = x + dx * n;
          const sy = y + dy * n;
          if (!freeAt(state, sx, sy)) break;
          stretch.push([sx, sy]);
        }
        if (stretch.length >= 3 && (!best || stretch.length > best.length)) best = stretch;
      }
    }
  }
  return best;
}

/** Empty cells that touch a path and are not reserved for a street, nearest the middle first. */
function lotSpots(state: GameState): Point[] {
  const { width, height } = state.map;
  // The middle of the campus's first land, where the starter quad is.
  const cx = START_LAND.x + START_LAND.w / 2;
  const cy = START_LAND.y + START_LAND.h / 2;
  const spots: Array<{ p: Point; d: number }> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (freeAt(state, x, y) && !onStreetPlan(x, y) && !keptForServices(x, y) && besidePath(state, x, y)) {
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
      if (!freeAt(state, x, y) || !besidePath(state, x, y)) continue;
      // Grow away from the path we touched, in whichever direction has more empty cells.
      let best: Point[] = [[x, y]];
      for (const step of [1, -1]) {
        const stretch: Point[] = [];
        for (let j = i; j >= 0 && j < length && stretch.length < 8; j += step) {
          const [sx, sy] = at(j);
          if (!freeAt(state, sx, sy)) break;
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
  const scale = scaleOf(state);
  const cost = cells.length * (tool === 'path' || tool === 'quad' || tool === 'tree' || tool === 'clear' ? paintCost(tool, scale) : paintCost('zoneLot', scale));
  if (state.money.cash - cost < reserve) return null;
  const result = applyAction(state, { type: 'paint', tool, cells });
  return result.ok ? result.state : null;
}

// ------------------------------------------------------- town and land --

/**
 * Parking for locals who cannot walk in: a car park on the campus's east edge,
 * where it touches Lantern Avenue and needs no road of its own. A surface lot
 * while there is room for one, then a parking structure.
 */
function nextParking(state: GameState): { type: PlacedType; x: number; y: number } | null {
  const places = townPlaces(state.map);
  if (localsNeedingBeds(state) <= 0 || places.spaces >= places.driveWanted) return null;
  const rows: number[] = [];
  for (let y = 0; y < state.map.height; y++) if (!STREET_ROWS.includes(y)) rows.push(y);
  rows.sort((a, b) => Math.abs(a - 16) - Math.abs(b - 16) || a - b);
  for (const type of ['parking', 'garage'] as const) {
    for (const y of rows) {
      const x = TOWN_X - PLACED[type].w;
      if (previewPlace(state, type, x, y).problem === null) return { type, x, y };
    }
  }
  return null;
}

/** The cheapest field still for sale, or null when the campus owns them all. */
function nextLand(state: GameState): number | null {
  const forSale = state.map.parcels.filter((parcel) => !parcel.owned).sort((a, b) => a.price - b.price);
  return forSale[0]?.id ?? null;
}

// ------------------------------------------------------------------ money --

/**
 * Recruiting and marketing, as a player who has read the Money panel would
 * set it: on while a bigger class would have somewhere to go, and off when
 * students from the last class gave up waiting for room or the pool is at
 * its ceiling, because then it buys nothing.
 */
function setMarketing(state: GameState, style: Style): GameState {
  const a = state.admissions;
  // Wait until the last waitlist has closed: only then is it known whether anyone was turned away for good.
  if (!a.lastIntake || a.waitlistUntilTick !== 0) return state;
  const lost = a.lastIntake.turnedAway - a.waitlistAdmitted > 0;
  const atCeiling = !state.goals && fallClassDraw(state) >= POOL_CEILING * scaleOf(state);
  // A campus at its cap has nowhere to put a bigger class. More applicants then only make it more selective,
  // which is worth paying for to the player who is chasing the rank and to nobody else (DESIGN.md 38.4).
  const full = (a.lastIntake.capped ?? 0) > 0 && style !== 'striver';
  let step = lost || atCeiling || full ? 0 : style === 'optimizer' || style === 'striver' ? 4 : 2;
  // On a game with goals the player keeps an eye on the margin: marketing stops while the campus keeps too little.
  // The margin is read in term. Over the summer a quarter of the students are away and the buildings cost what
  // they cost, so every campus keeps less then, and a player who turned marketing off each summer would have
  // it off on the day the fall class applies.
  if (state.goals) {
    const phase = calendarAt(state.clock).phase;
    if (phase !== 'fall' && phase !== 'spring') return state;
  }
  if (state.goals && step > 0) {
    const kept = keeps(state);
    // The player who works every cause pays for marketing before it funds more faculty: it is the cheaper of the two.
    const enough = style === 'striver' ? KEEPS_ENOUGH - 1 : KEEPS_ENOUGH;
    const plenty = style === 'striver' ? KEEPS_ENOUGH : KEEPS_PLENTY;
    if (kept < enough) step = 0;
    else if (kept < plenty) step = Math.min(step, state.money.marketing);
  }
  if (step === state.money.marketing) return state;
  const result = applyAction(state, { type: 'marketing', step });
  return result.ok ? result.state : state;
}

/**
 * The Instruction slider on a game with goals. Faculty arrive and leave a semester after the slider moves, so it
 * is only touched in term, and only once the last move has taken effect.
 */
function setInstruction(state: GameState, style: Style): GameState {
  const after = KEEPS_AFTER_FACULTY[style];
  if (!state.goals || after === undefined || !botOptions.slider) return state;
  const phase = calendarAt(state.clock).phase;
  if (phase !== 'fall' && phase !== 'spring') return state;
  const books = budget(state);
  if (books.incomeTotal <= 0) return state;
  const kept = keeps(state);
  const step = instructionStep(state);
  const students = enrollment(state);
  /** What moving to another step would add to the payroll, as dollars of every $100 that comes in. */
  const costOf = (to: number): number => {
    const want = students > 0 ? Math.max(1, Math.round(students / INSTRUCTION_RATIOS[to]!)) : 0;
    return (100 * (want - facultyNeed(state)) * FACULTY_PAY * (1 + BENEFITS_SHARE)) / books.incomeTotal;
  };
  let next = step;
  if (kept < KEEPS_LEAST && step > INSTRUCTION_FULL) next = step - 1;
  else if (step < INSTRUCTION_RATIOS.length - 1 && kept - costOf(step + 1) >= after) next = step + 1;
  if (next === step) return state;
  const result = applyAction(state, { type: 'instruction', step: next });
  return result.ok ? result.state : state;
}

/**
 * Cash with nothing to buy goes into the endowment. Only on a visit when
 * nothing was bought and nothing was out of reach, and only what is left
 * above half a year of spending and a million dollars: a young campus needs
 * its cash for the next class.
 */
function payIntoEndowment(state: GameState, style: Style): GameState {
  const keep = Math.max(1_000_000 * scaleOf(state), state.money.spendingPerYear * (style === 'optimizer' ? 0.25 : 0.5));
  const spare = Math.floor(state.money.cash - keep);
  if (spare < 100_000 * scaleOf(state)) return state;
  const result = applyAction(state, { type: 'endow', amount: spare });
  return result.ok ? result.state : state;
}

// ---------------------------------------------------------------- grounds --

/**
 * Where to put a Facilities Yard for a place: on free ground within its reach,
 * where it covers the most places no yard covers yet. A second yard for a
 * place whose first is full goes as near to it as it can, so it takes over.
 */
function yardSpot(state: GameState, spot: Placed, nearest: boolean): Point | null {
  if (nearest) return menuSpot(state, 'yard', spot.x, spot.y);
  const spec = PLACED.yard;
  const uncovered = state.map.placed.filter((p): p is Placed => !!p && isMessSpot(p) && (state.map.care.yard[p.id] ?? -1) < 0);
  const gap = (px: number, py: number, p: Placed): number =>
    Math.max(Math.max(p.x - (px + spec.w - 1), px - (p.x + p.w - 1), 0), Math.max(p.y - (py + spec.h - 1), py - (p.y + p.h - 1), 0));
  const yards = state.map.placed.filter((p): p is Placed => !!p && p.type === 'yard');
  let best: Point | null = null;
  let bestCount = 0;
  let bestApart = -1;
  let bestFar = Infinity;
  for (let py = spot.y - spec.radius; py <= spot.y + spot.h - 1 + spec.radius; py++) {
    for (let px = spot.x - spec.radius - spec.w + 1; px <= spot.x + spot.w - 1 + spec.radius; px++) {
      const far = gap(px, py, spot);
      if (far < 1 || far > spec.radius) continue;
      if (onStreetPlan(px, py) || onStreetPlan(px + 1, py) || previewPlace(state, 'yard', px, py).problem !== null) continue;
      const count = uncovered.filter((p) => gap(px, py, p) <= spec.radius).length;
      // Among spots that cover as many, the one furthest from the yards already built: circles that overlap are wasted.
      const apart = Math.min(2 * spec.radius, ...yards.map((y) => gap(px, py, y)));
      if (count > bestCount || (count === bestCount && (apart > bestApart || (apart === bestApart && far < bestFar)))) {
        best = [px, py];
        bestCount = count;
        bestApart = apart;
        bestFar = far;
      }
    }
  }
  return best;
}

/**
 * Where a second yard goes when one has more places than a full crew can hold:
 * beside the place furthest from the first, so the far half of its circle
 * changes hands. The nearer yard always looks after a place.
 */
function splitSpot(state: GameState, yard: Placed): Point | null {
  let far: Placed | null = null;
  let most = -1;
  for (const p of state.map.placed) {
    if (!p || !isMessSpot(p) || state.map.care.yard[p.id] !== yard.id) continue;
    const gap = Math.max(Math.max(p.x - (yard.x + yard.w - 1), yard.x - (p.x + p.w - 1), 0), Math.max(p.y - (yard.y + yard.h - 1), yard.y - (p.y + p.h - 1), 0));
    if (gap > most) {
      most = gap;
      far = p;
    }
  }
  return far ? menuSpot(state, 'yard', far.x, far.y) : null;
}

/**
 * Keep the campus clean, as a player who taps a messy spot and reads its one
 * fix would: a bin beside each place that drops litter, a Facilities Yard in
 * reach of it, and as many workers as the yard says it needs. Hiring is free,
 * so it never counts as a purchase.
 */
function tendGrounds(state: GameState, reserve: number, most: number): { state: GameState; built: number } {
  let current = state;
  let built = 0;
  for (let guard = 0; guard < 40 && built < most; guard++) {
    let acted = false;
    for (const spot of current.map.placed) {
      if (!spot || !isMessSpot(spot)) continue;
      const fix = spotFix(current, spot);
      if (fix === 'noBin') {
        if (current.money.cash - placedCost('bin', scaleOf(current)) < reserve) continue;
        let cell: Point | null = null;
        for (let ring = 1; ring <= 3 && !cell; ring++) {
          for (let y = spot.y - ring; y <= spot.y + spot.h - 1 + ring && !cell; y++) {
            for (let x = spot.x - ring; x <= spot.x + spot.w - 1 + ring && !cell; x++) {
              if (!onStreetPlan(x, y) && previewPaint(current, 'bin', [[x, y]]).cells.length === 1) cell = [x, y];
            }
          }
        }
        const placed = cell ? applyAction(current, { type: 'paint', tool: 'bin', cells: [cell] }) : null;
        if (!placed?.ok) continue;
        current = placed.state;
        built += 1;
        acted = true;
        break;
      }
      // No yard in reach, or the one in reach is full and still short of hands: build one where it covers the most.
      const yardId = current.map.care.yard[spot.id] ?? -1;
      const over = yardId >= 0 ? current.map.placed[yardId] : null;
      const full = fix === 'understaffed' && !!over && workersAt(current, yardId) >= YARD_MAX_WORKERS && yardStatus(current, over).beyond;
      if (fix === 'noYard' || full) {
        if (current.money.cash - placedCost('yard', scaleOf(current)) < reserve) continue;
        const at = full ? splitSpot(current, over!) : yardSpot(current, spot, false);
        const placed = at ? applyAction(current, { type: 'place', building: 'yard', x: at[0], y: at[1] }) : null;
        if (!placed?.ok) continue;
        current = placed.state;
        built += 1;
        acted = true;
        break;
      }
    }
    if (!acted) break;
  }
  // Hire up to what each yard says it needs, and let go of those with nothing to do.
  for (const yard of current.map.placed) {
    if (!yard || yard.type !== 'yard') continue;
    const status = yardStatus(current, yard);
    const wanted = Math.max(1, Math.min(YARD_MAX_WORKERS, Math.ceil(status.need / WORK_PER_WORKER - 1e-9)));
    if (wanted === workersAt(current, yard.id)) continue;
    const staffed = applyAction(current, { type: 'staff', yard: yard.id, workers: wanted });
    if (staffed.ok) current = staffed.state;
  }
  return { state: current, built };
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

const PLAY: readonly PlacedType[] = ['courts', 'gym', 'field', 'pool', 'track', 'makerspace'];
/**
 * For variety: the kinds a dorm with food already in reach is offered, tried in turn until one is found
 * that it does not have. The two that feed a wide area come first, so one of them serves many dorms.
 */
const VARIETY: readonly PlacedType[] = ['burger', 'diner', 'taco', 'pizza', 'coffee', 'smoothie', 'convenience', 'truck'];
/** The Academics buildings are bought once there is this much cash to spare. */
const ACADEMICS_CASH = 400_000;

/**
 * What a player who reads the Happiness panel would build, most wanted first:
 * dining for dorms that cannot grow without it, then whatever the panel names
 * as the biggest gap, put in reach of the lot that lacks it most, then the
 * gaps in coverage. A list, because the first choice may have no free ground.
 */
function wantsFromMenu(state: GameState, extras = true): Array<{ type: PlacedType; x: number; y: number }> {
  const wants: Array<{ type: PlacedType; x: number; y: number }> = [];
  let hungry = 0;
  for (const b of state.map.buildings) {
    if (hungry >= 3) break;
    if (b && b.zone === 'housing' && b.stage === 1 && !fedAt(state.map, b.x, b.y)) {
      // A dining hall feeds four times the ground a coffee stand does and takes two cells. A campus that
      // only ever buys the stand ends up with dozens of them where its Medical Centers should have gone.
      wants.push({ type: state.money.cash >= placedCost('dining', scaleOf(state)) + 20_000 * scaleOf(state) ? 'dining' : 'coffee', x: b.x, y: b.y });
      hungry += 1;
    }
  }
  // Beds and seats come first while students are waiting for them, and before anyone has moved in. The top
  // bar says so in as many words, and a gym or a Campus Safety office has staff to pay from the day it opens.
  if (state.admissions.waitlist > 0 || state.clock.tick < FIRST_INTAKE_TICK) return wants;
  // The panel names a cause and its weakest part. The part is what gets built.
  const worst = campusHappiness(state).worstPart;
  if (worst === 'dining' || worst === 'recreation' || worst === 'safety') {
    const lot = neediestLot(state, worst);
    if (lot && lot.level < 0.85) {
      if (worst === 'dining') wants.push({ type: 'dining', x: lot.x, y: lot.y });
      else if (worst === 'recreation') {
        const built = state.map.placed.filter((p) => p && PLACED[p.type].family === 'recreation').length;
        wants.push({ type: PLAY[built % PLAY.length]!, x: lot.x, y: lot.y });
      } else wants.push({ type: coverFor(state.map, 'medical', lot.x, lot.y) ? 'safety' : 'medical', x: lot.x, y: lot.y });
    }
  }
  // Then close the gaps in coverage: a place to play with no Medical Center over it, a dorm with no Campus Safety.
  let gaps = 0;
  for (const p of state.map.placed) {
    if (gaps >= 3) break;
    if (p && PLACED[p.type].family === 'recreation' && !coverFor(state.map, 'medical', p.x, p.y)) {
      wants.push({ type: 'medical', x: p.x, y: p.y });
      gaps += 1;
    }
  }
  gaps = 0;
  for (const b of state.map.buildings) {
    if (gaps >= 6) break;
    if (b && b.zone === 'housing' && b.stage > 0 && !coverFor(state.map, 'safety', b.x, b.y)) {
      wants.push({ type: 'safety', x: b.x, y: b.y });
      gaps += 1;
    }
  }
  // Everything above is a need. What follows is a nicety, bought last and only on the visit's final pass.
  if (!extras) return wants;
  // Variety: three kinds of food in reach lift Food & fun a little. A dorm with food but fewer kinds than
  // that gets one it does not have yet.
  let varied = 0;
  for (const b of state.map.buildings) {
    if (varied >= 1) break;
    if (!b || b.zone !== 'housing' || b.stage < 1) continue;
    const kinds = foodKindsAt(state.map, b.x, b.y);
    if (kinds === 0 || kinds >= VARIETY_KINDS) continue;
    const have = foodTypesAt(state.map, b.x, b.y);
    const next = VARIETY.find((type) => !have.includes(type));
    if (!next) continue;
    wants.push({ type: next, x: b.x, y: b.y });
    varied += 1;
  }
  // The Academics buildings, once there is money to spare: a computer lab for lecture halls no library
  // reaches, and a study center by the dorms.
  if (state.money.cash > ACADEMICS_CASH * scaleOf(state)) {
    const hall = state.map.buildings.find((b) => b && b.zone === 'academic' && b.stage > 0 && libraryLift(state.map, b.x, b.y) === 0);
    if (hall) wants.push({ type: 'computerLab', x: hall.x, y: hall.y });
    const dorm = state.map.buildings.find((b) => b && b.zone === 'housing' && b.stage > 0 && !tutoredAt(state.map, b.x, b.y));
    if (dorm) wants.push({ type: 'studyCenter', x: dorm.x, y: dorm.y });
  }
  return wants;
}

function buildFromMenu(state: GameState, reserve: number, most: number, extras = true): { state: GameState; built: number; blocked: boolean } {
  let current = state;
  let built = 0;
  for (; built < most; built++) {
    let placed = false;
    let blocked = false;
    for (const want of wantsFromMenu(current, extras)) {
      if (current.money.cash - placedCost(want.type, scaleOf(current)) < reserve) {
        blocked = true;
        continue;
      }
      const spot = menuSpot(current, want.type, want.x, want.y);
      if (!spot) continue;
      const result = applyAction(current, { type: 'place', building: want.type, x: spot[0], y: spot[1] });
      if (!result.ok) continue;
      current = result.state;
      placed = true;
      break;
    }
    if (!placed) return { state: current, built, blocked };
  }
  return { state: current, built, blocked: false };
}

/**
 * A building a rank goal gave is placed on the visit it arrives, where it lifts the look of the most lots: on
 * free ground, counting only what it adds to a lot beyond any other such building already in reach, and nothing
 * past the top of the scale. It is free, and a player who has just read the headline would not leave it waiting.
 */
function placeRewards(state: GameState): { state: GameState; placed: number } {
  let current = state;
  let placed = 0;
  for (const type of rewardsWaiting(current)) {
    const spec = PLACED[type];
    const map = current.map;
    const lots = map.buildings.filter((lot): lot is NonNullable<typeof lot> => !!lot && lot.stage > 0);
    let best: Point | null = null;
    let most = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!freeAt(current, x, y) || previewPlace(current, type, x, y).problem !== null) continue;
        let gain = 0;
        for (const lot of lots) {
          const far = Math.max(Math.max(x - lot.x, 0, lot.x - (x + spec.w - 1)), Math.max(y - lot.y, 0, lot.y - (y + spec.h - 1)));
          if (far > spec.radius) continue;
          const lift = (spec.strength * (spec.radius + 1 - far)) / (spec.radius + 1);
          const room = 100 - map.score[lot.y * map.width + lot.x]!;
          gain += Math.min(room, Math.max(0, lift - rewardLift(map, lot.x, lot.y)));
        }
        if (gain > most + 1e-9) {
          most = gain;
          best = [x, y];
        }
      }
    }
    if (!best) continue;
    const result = applyAction(current, { type: 'place', building: type, x: best[0], y: best[1] });
    if (!result.ok) continue;
    current = result.state;
    placed += 1;
  }
  return { state: current, placed };
}

export interface TurnResult {
  state: GameState;
  /** Purchases made this check-in. */
  purchases: number;
  /** True when the bot wanted to buy something and could not afford it. */
  blockedByCash: boolean;
}

/** One check-in. The absent player does nothing. */
/** A quad beside the least pleasant lot, a few a visit: how the campus looks is one of the four causes of applicants. */
function plantGreen(state: GameState, reserve: number, most: number): { state: GameState; planted: number } {
  let current = state;
  let planted = 0;
  for (let n = 0; n < most; n++) {
    const map = current.map;
    const lots = map.buildings.filter((lot): lot is NonNullable<typeof lot> => !!lot).sort((a, b) => map.score[a.y * map.width + a.x]! - map.score[b.y * map.width + b.x]!);
    let done = false;
    for (const lot of lots.slice(0, 12)) {
      let spot: Point | null = null;
      for (let r = 1; r <= 3 && !spot; r++) {
        for (let dy = -r; dy <= r && !spot; dy++) {
          for (let dx = -r; dx <= r && !spot; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (freeAt(current, lot.x + dx, lot.y + dy) && !keptForServices(lot.x + dx, lot.y + dy)) spot = [lot.x + dx, lot.y + dy];
          }
        }
      }
      if (!spot) continue;
      const before = averageDesirability(current);
      const next = tryPaint(current, 'quad', [spot], reserve);
      if (!next) return { state: current, planted };
      // Green past a lot's cap does nothing: keep a quad only when it lifts the campus.
      if (averageDesirability(next) <= before + 0.001) continue;
      current = next;
      planted += 1;
      done = true;
      break;
    }
    if (!done) break;
  }
  return { state: current, planted };
}

export function takeTurn(state: GameState, as: Style): TurnResult {
  if (as === 'absent') return { state, purchases: 0, blockedByCash: false };
  // The striver looks in once a day and buys as the once-a-day player does. What it adds comes after.
  const striver = as === 'striver';
  const style: Style = striver ? 'daily' : as;
  // On a game with goals: no new yearly cost while the campus keeps too little (the owner's target, 37.10).
  const margin = state.goals ? keeps(state) : 100;
  const thrifty = margin < KEEPS_PLENTY;
  // The once-a-day player has a day's income to spend, so buys twice as much in a visit as the twice-a-day one.
  const maxPurchases = style === 'casual' ? 5 : style === 'daily' ? 10 : 60;
  // A little is kept back: $20,000, or enough for the quiet day between graduation and the fall class, when a
  // quarter of the students have left, the summer term earns little and the bills are what they were.
  const reserve = style === 'optimizer' ? 0 : Math.max(20_000 * scaleOf(state), Math.round(state.money.spendingPerYear * 0.006));

  let current = state;
  let purchases = 0;
  let blockedByCash = false;

  // What a rank goal gave goes on the map first: it is free, and it is why the paper led with it.
  if (current.goals) {
    const rewards = placeRewards(current);
    current = rewards.state;
    purchases += rewards.placed;
  }

  // The optimizer spends every dollar on lots the moment it has one, so it would never have the price of a
  // Medical Center, and by the time it stopped growing the ground for one would be gone. It buys what the
  // Happiness panel asks for first, and if it cannot afford the next of those it holds that price back from
  // this visit's zoning: saving up. The other players are held back by how much they do in a visit, not by
  // cash, so they shop for these after zoning, as before.
  let lotReserve = reserve;
  if (style === 'optimizer') {
    const first = buildFromMenu(current, reserve, 4, false);
    current = first.state;
    purchases += first.built;
    const waiting = wantsFromMenu(current, false).filter((want) => menuSpot(current, want.type, want.x, want.y) !== null);
    // Hold back the dearest of them, so a Campus Safety office is not for ever outbid by a coffee stand.
    if (waiting.length > 0) lotReserve += Math.max(...waiting.map((want) => placedCost(want.type === 'coffee' ? 'dining' : want.type, scaleOf(current))));
  }

  while (purchases < maxPurchases) {
    const zone = neediestZone(current);
    if (!zone) break;

    const spots = lotSpots(current);
    let next: GameState | null;
    if (spots.length === 0) {
      const stretch = nextPathStretch(current);
      const open = !stretch && current.goals ? anyLotSpots(current) : [];
      const walk = !stretch && current.goals && open.length === 0 ? anyPathStretch(current) : null;
      if (stretch) next = tryPaint(current, 'path', stretch, lotReserve);
      else if (open.length > 0) next = tryPaint(current, zone, [open[0]!], lotReserve);
      else if (walk) next = tryPaint(current, 'path', walk, lotReserve);
      else {
        // Out of room on the land the campus has: buy the next field.
        const land = nextLand(current);
        if (land === null) break;
        const bought = current.money.cash - current.map.parcels[land]!.price >= lotReserve ? applyAction(current, { type: 'buyLand', parcel: land }) : null;
        next = bought?.ok ? bought.state : null;
      }
    } else {
      const spot = spots[0]!;
      next = tryPaint(current, isQuadSpot(spot) ? 'quad' : zone, [spot], lotReserve);
    }
    if (!next) {
      blockedByCash = true;
      break;
    }
    current = next;
    purchases += 1;
  }

  // Locals who cannot walk in are turned into beds wanted. A car park by the avenue is the cheaper answer.
  for (let n = 0; n < 2; n++) {
    const park = nextParking(current);
    if (!park) break;
    if (current.money.cash - placedCost(park.type, scaleOf(current)) < reserve) {
      blockedByCash = true;
      break;
    }
    const placed = applyAction(current, { type: 'place', building: park.type, x: park.x, y: park.y });
    if (!placed.ok) break;
    current = placed.state;
    purchases += 1;
  }

  // Grounds: bins, a yard, and the workers the yard asks for.
  const grounds = tendGrounds(current, reserve, style === 'casual' ? 2 : style === 'daily' ? 4 : 8);
  current = grounds.state;
  purchases += grounds.built;

  // Then the Build menu, as a player who has read the Happiness panel would use it.
  // A bigger campus needs more of everything, so a visit covers more than it did before there was land to buy.
  const menu = thrifty ? { state: current, built: 0, blocked: false } : buildFromMenu(current, reserve, style === 'casual' ? 2 : style === 'daily' ? 4 : 8);
  current = menu.state;
  purchases += menu.built;
  if (menu.blocked) blockedByCash = true;
  if (striver && !thrifty) {
    // Looks: green where the campus is least pleasant. Rank: seats to spare, so classes are not crowded.
    // Open ground is what the next halls go on, so green is only planted while there is plenty of it left.
    const ground = lotSpots(current).length + anyLotSpots(current).length;
    const green = ground >= 40 ? plantGreen(current, reserve, 2) : { state: current, planted: 0 };
    current = green.state;
    purchases += green.planted;
    if (crowding(current) > 0.2) {
      const spots = lotSpots(current);
      const spot = spots[0] ?? anyLotSpots(current)[0];
      const roomy = spot ? tryPaint(current, 'academic', [spot], reserve) : null;
      if (roomy) {
        current = roomy;
        purchases += 1;
      }
    }
  }
  // A place built on this visit gets its bin, and its yard the hands for it, before the player leaves.
  if (menu.built > 0) {
    const after = tendGrounds(current, reserve, menu.built);
    current = after.state;
    purchases += after.built;
  }
  current = setMarketing(current, as);
  current = setInstruction(current, as);
  if (!blockedByCash) current = payIntoEndowment(current, style);
  return { state: current, purchases, blockedByCash };
}
