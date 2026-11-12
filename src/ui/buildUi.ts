import {
  BUILD_ORDER,
  campusHappiness,
  binState,
  fixText,
  isBrokenThing,
  isMessSpot,
  BENEFITS_SHARE,
  BROKE_BY,
  budget,
  utilitiesOf,
  WAGE_PER_YEAR,
  careStaffAt,
  CARE_STAFF_PAY,
  ENDOWMENT_YIELD,
  enrollment,
  hasCareStaff,
  MARKETING_COST_PER_STUDENT,
  MARKETING_LIFT,
  lampReport,
  thingReport,
  type BreakReport,
  type BudgetGroupId,
  type BudgetLine,
  spotClean,
  spotFix,
  thingFix,
  yardLine,
  yardStatus,
  COST,
  ROAD_UPKEEP_PER_YEAR,
  hoodAdvice,
  type HousingFixes,
  type HoodLiving,
  type Parcel,
  dollars,
  driversNow,
  hasRoadAccess,
  townPlaces,
  dollarsShort,
  fedAt,
  inReach,
  PLACED,
  recreationAt,
  storeIncomePerYear,
  storePassers,
  type CauseId,
  type DriverId,
  type GameState,
  type Placed,
  type PlacedType,
} from '../sim';
import type { BuildEntry } from './buildMenu';

/**
 * Words and numbers for the Build menu, the panel of a placed building and the
 * Happiness panel. Everything is read from the simulation when it is shown.
 */

const footprint = (w: number, h: number): string => `${w} x ${h}`;

/** A Build menu card whose id begins with this hands over to a drag tool: the road, a bin, a bench or a table. */
export const TOOL_ENTRY = 'tool:';
export const ROAD_ENTRY = `${TOOL_ENTRY}road`;

/** The Build menu: what can be built now, then what is on the way. */
export function buildEntries(): BuildEntry[] {
  const entries: BuildEntry[] = BUILD_ORDER.map((type) => {
    const spec = PLACED[type];
    return {
      id: type,
      key: spec.sprite,
      name: spec.name,
      category: spec.category,
      cost: dollarsShort(spec.cost),
      footprint: footprint(spec.w, spec.h),
      upkeep: runningLine(type),
      effect: spec.effect,
    };
  });
  const soon = (key: string, name: string, effect: string, locked: string): BuildEntry => ({
    key,
    name,
    category: 'On the way',
    cost: '',
    footprint: '',
    upkeep: '',
    effect,
    locked,
  });
  // Roads are laid by dragging, like paths. The card hands over to that tool. It sits with the car parks it serves.
  const road: BuildEntry = {
    id: ROAD_ENTRY,
    key: 'road.5',
    name: 'Road',
    category: 'Roads and parking',
    cost: `${dollarsShort(COST.road)} a cell`,
    footprint: 'drag to lay',
    upkeep: `Upkeep ${dollars(ROAD_UPKEEP_PER_YEAR)} a cell a year`,
    effect: 'Links a car park to a town street. Lots like it less beside them',
  };
  // Bins, benches and tables are one cell each and laid in rows, so their cards hand over to a drag tool too.
  const small = (['bin', 'bench', 'table'] as const).map((type): BuildEntry => ({
    id: `${TOOL_ENTRY}${type}`,
    key: PLACED[type].sprite,
    name: PLACED[type].name,
    category: 'Grounds',
    cost: `${dollarsShort(PLACED[type].cost)} each`,
    footprint: 'tap or drag a row',
    upkeep: 'Costs nothing to run',
    effect: PLACED[type].effect,
  }));
  const firstGrounds = entries.findIndex((entry) => entry.category === 'Grounds');
  entries.splice(firstGrounds < 0 ? entries.length : firstGrounds, 0, ...small);
  const firstCarPark = entries.findIndex((entry) => entry.category === 'Roads and parking');
  entries.splice(firstCarPark < 0 ? entries.length : firstCarPark, 0, road);
  entries.push(
    soon('build.stadium', 'Stadium', 'Home games and a football team', 'Coming with football'),
    soon('build.studentlife', 'Student Life', 'A zone for clubs and events', 'Coming later'),
  );
  return entries;
}

function lotsInReach(state: GameState, placed: Placed, zone: 'housing' | 'academic'): number {
  let count = 0;
  const family = PLACED[placed.type].family;
  for (const building of state.map.buildings) {
    if (!building || building.zone !== zone) continue;
    if (inReach(state.map, family, building.x, building.y).includes(placed)) count += 1;
  }
  return count;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What a placed building is doing right now, in one line. */
export function placedSummary(state: GameState, placed: Placed): string {
  const base = baseSummary(state, placed);
  // A place to eat, shop or play also says how clean it is, and the one thing that would fix it.
  if (!isMessSpot(placed)) return base;
  const fix = fixText(state, placed, spotFix(state, placed));
  return `${base} ${Math.round(spotClean(state, placed) * 100)}% clean.${fix ? ` ${fix}` : ''}`;
}

function baseSummary(state: GameState, placed: Placed): string {
  const spec = PLACED[placed.type];
  switch (spec.family) {
    case 'library':
      return `Lifting ${plural(lotsInReach(state, placed, 'academic'), 'Academic lot', 'Academic lots')} within ${spec.radius} cells.`;
    case 'dining':
      return `Feeding ${plural(lotsInReach(state, placed, 'housing'), 'Housing lot', 'Housing lots')} within ${spec.radius} cells. Housing needs dining in reach to grow past its first stage.`;
    case 'store': {
      const passers = storePassers(state, placed);
      return passers === 0
        ? 'Nobody passes its door. It earns nothing until it stands beside a path that students use.'
        : `${plural(passers, 'student passes', 'students pass')} its door. It earns ${dollars(storeIncomePerYear(state, placed))} a year.`;
    }
    case 'recreation': {
      const lots = lotsInReach(state, placed, 'housing') + lotsInReach(state, placed, 'academic');
      return `Raising happiness at ${plural(lots, 'dorm or lecture hall', 'dorms and lecture halls')} within ${spec.radius} cells.`;
    }
    case 'water':
      return 'Counts as green space for the lots around it, like a quad.';
    case 'medical':
    case 'safety': {
      const lots = lotsInReach(state, placed, 'housing') + lotsInReach(state, placed, 'academic');
      const job = spec.family === 'medical' ? 'Treats injuries' : 'Handles mischief';
      return `${job} within ${spec.radius} cells, and ${plural(lots, 'dorm or lecture hall feels', 'dorms and lecture halls feel')} safer for it. So far the campus has handled ${state.incidents.handled} and missed ${state.incidents.missed}.`;
    }
    case 'parking': {
      const cars = spec.cars ?? 0;
      if (!hasRoadAccess(state.map, placed)) return 'No road access. It holds no cars until a road links it to a town street.';
      const places = townPlaces(state.map);
      const used = places.spaces > 0 ? Math.round((cars * Math.min(places.drive, driversNow(state))) / places.spaces) : 0;
      return `Holds ${cars} cars, and ${used} are parked here now. Each space lets one local drive in from a street too far to walk.`;
    }
    case 'bin': {
      const broke = thingReport(state, placed);
      if (broke) return `Broken, so it catches nothing. ${breakWords(state, broke)}`;
      const fix = fixText(state, placed, thingFix(state, placed));
      const how = { empty: 'Catching litter.', filling: 'Filling up.', full: 'Full. It catches nothing until it is emptied.', broken: 'Broken. It catches nothing until it is fixed.' }[binState(state, placed.id)];
      return fix ? `${how} ${fix}` : how;
    }
    case 'seat': {
      const broke = thingReport(state, placed);
      if (broke) return `Broken, so nobody can sit here. ${breakWords(state, broke)}`;
      const lots = lotsInReach(state, placed, 'housing') + lotsInReach(state, placed, 'academic');
      return `Somewhere to sit for ${plural(lots, 'dorm or lecture hall', 'dorms and lecture halls')} within ${spec.radius} cells.`;
    }
    case 'yard': {
      const status = yardStatus(state, placed);
      return `${status.workers} of ${status.max} workers. ${yardLine(status)} Wages and benefits ${dollars(withBenefits(status.wagesPerYear))} a year.`;
    }
    case 'landmark':
      return `${spec.effect}.`;
  }
}

/** About how long, in words. The grounds are looked at every twenty minutes, so nothing is finer than that. */
function about(minutes: number): string {
  if (minutes < 50) return `${Math.max(20, Math.round(minutes / 20) * 20)} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return 'an hour';
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return days <= 1 ? 'a day' : `${days} days`;
}

/**
 * A broken street lamp's panel: what broke it, whether a yard covers it, and
 * when it will be fixed. null where no lamp is broken.
 */
export function lampSummary(state: GameState, x: number, y: number): string | null {
  const report = lampReport(state, x, y);
  return report ? `Broken. ${breakWords(state, report)}` : null;
}

/**
 * The rest of a broken thing's panel, the same for a lamp, a bin, a bench and
 * a table: what broke it, whether a yard covers it, and when it will be fixed.
 */
function breakWords(state: GameState, report: BreakReport): string {
  const story = report.line === null ? undefined : BROKE_BY[report.kind][report.line];
  const where = report.spot ? `after litter piled up around the ${PLACED[report.spot.type].name}` : 'where litter had piled up';
  const cause = story ? `${story}, ${where}.` : `It happened ${where}.`;
  const stays = report.kind === 'lamp' ? 'dark' : 'broken';
  let fix: string;
  if (!report.yard) fix = `No Facilities Yard reaches it, so it stays ${stays}. Build one within ${PLACED.yard.radius} cells.`;
  else if (report.workers === 0) fix = `The Facilities Yard over it has no workers, so it stays ${stays}. Hire one.`;
  else if (report.minutes !== null) fix = `A Facilities Yard covers it, and a worker should have it fixed in about ${about(report.minutes)}.`;
  else {
    // Covered, but the crew has too much else to do. The yard's own line says what would help.
    const line = yardLine(yardStatus(state, report.yard));
    const help = line.startsWith('Understaffed') ? ` Its yard is ${line.replace(/^U/, 'u')}` : '';
    fix = `A Facilities Yard covers it, but its workers will not get to it for days.${help}`;
  }
  return `${cause} ${fix}`;
}

/** What one member of staff or one worker costs for a year, with benefits on top. */
const withBenefits = (pay: number): number => pay * (1 + BENEFITS_SHARE);

/** Upkeep and utilities of a hand-placed building for a year. */
function buildingCost(type: PlacedType): number {
  return PLACED[type].upkeepPerYear + utilitiesOf(type);
}

/** A Build menu card's line on what a building costs to run, before it is built. */
function runningLine(type: PlacedType): string {
  const spec = PLACED[type];
  const cost = buildingCost(type);
  const base = cost > 0 ? `Runs at ${dollarsShort(cost)} a year` : 'Costs nothing to run';
  if (spec.family === 'medical' || spec.family === 'safety') return `${base}, plus staff from ${dollarsShort(withBenefits(CARE_STAFF_PAY))}`;
  if (spec.family === 'yard') return `${base}, plus ${dollarsShort(withBenefits(WAGE_PER_YEAR))} a worker`;
  return base;
}

/** The small print on a building's card: what it costs to run, and its staff where it has any. */
export function placedFacts(state: GameState, placed: Placed): string {
  const spec = PLACED[placed.type];
  const cost = buildingCost(placed.type);
  const parts: string[] = [];
  if (hasCareStaff(placed)) {
    const staff = careStaffAt(state, placed);
    parts.push(`Staff of ${staff}: ${dollars(staff * withBenefits(CARE_STAFF_PAY))} a year with benefits`);
  }
  parts.push(cost > 0 ? `Upkeep and utilities ${dollars(cost)} a year` : 'Costs nothing to run');
  if (spec.buildable) parts.push('The Clear tool removes it');
  return parts.join(' · ');
}

/** The line shown while a building is being placed. */
export function placingLine(type: PlacedType): string {
  const spec = PLACED[type];
  return `${spec.name} · ${dollarsShort(spec.cost)} · ${footprint(spec.w, spec.h)}`;
}

/** The four causes of Happiness, as the player reads them. */
export const CAUSE_NAME: Record<CauseId, string> = {
  walk: 'Walk to class',
  grounds: 'Grounds',
  life: 'Food & fun',
  safety: 'Safety & health',
};

/** What to do about the weakest part of a cause. */
const PART_FIX: Record<DriverId, string> = {
  walk: 'Zone Academic lots nearer the dorms, or lay a shorter path.',
  green: 'Add quads, trees or a pond near dorms and lecture halls.',
  clean: 'Litter is building up. Put a Trash bin beside each place to eat or play, and a Facilities Yard with workers in reach.',
  seating: 'Students have nowhere to sit outside. Add benches or picnic tables near dorms and lecture halls.',
  dining: 'Students have nowhere to eat nearby. Build a Dining hall or a Coffee stand near dorms and lecture halls.',
  recreation: 'Students have nothing to do nearby. Build a gym, courts, a field, a pool or a track near dorms and lecture halls.',
  safety: 'Build a Medical Center and Campus Safety so their circles cover dorms and lecture halls.',
};

export interface HappinessView {
  score: number;
  /** 4 is delighted, 0 is miserable. The same steps as a student card. */
  mood: number;
  rows: Array<{ id: CauseId; name: string; percent: number; worst: boolean }>;
  /** What would help most, or '' when nothing is holding happiness back. */
  advice: string;
  /** True when the advice is something the Build menu sells. */
  build: boolean;
  staying: string;
  lastSemester: string;
}

export function happinessView(state: GameState): HappinessView {
  const mood = campusHappiness(state);
  const score = Math.round(mood.score);
  const rows = mood.causes.map((cause) => ({
    id: cause.id,
    name: CAUSE_NAME[cause.id],
    percent: Math.round(cause.level * 100),
    worst: cause.id === mood.worst,
  }));
  const last = state.admissions.lastSemester;
  return {
    score,
    mood: score >= 80 ? 4 : score >= 62 ? 3 : score >= 45 ? 2 : score >= 28 ? 1 : 0,
    rows,
    advice: mood.worst && mood.worstPart ? `Biggest gap: ${CAUSE_NAME[mood.worst].toLowerCase()}. ${PART_FIX[mood.worstPart]}` : '',
    build: mood.worst === 'life' || mood.worst === 'safety' || mood.worstPart === 'clean' || mood.worstPart === 'seating',
    staying: `At this happiness ${(mood.retention * 100).toFixed(1)}% of students stay on each semester.`,
    lastSemester: last ? `Last semester ${plural(last.left, 'student', 'students')} left and ${last.stayed} stayed. Happiness was ${last.happiness}.` : '',
  };
}

/** Used by tests of wording: every cause has a fix that names something to build or change. */
export const CAUSE_FIXES = PART_FIX;

/** True when dining reaches a lot. For the inspector's facts line. */
export function lotFacts(state: GameState, x: number, y: number): string[] {
  const facts: string[] = [];
  facts.push(fedAt(state.map, x, y) ? 'Dining in reach' : 'No dining in reach');
  const fun = recreationAt(state.map, x, y);
  facts.push(fun > 0 ? `Things to do ${Math.round(fun * 100)}%` : 'Nothing to do nearby');
  return facts;
}

/** What the panel of a neighbourhood says: who lives there and how they get to class. */
export function hoodSummary(state: GameState, hood: HoodLiving): { state: string; facts: string } {
  const lives = `${hood.living} of ${hood.capacity} local students live here.`;
  const how =
    hood.mode === 'walk'
      ? `They walk to class, ${Math.round(hood.walkMinutes)} minutes.`
      : hood.mode === 'drive'
        ? 'They drive, and each needs a parking space on campus.'
        : 'Nobody can get to class from here yet.';
  return { state: `${lives} ${how}`, facts: hoodAdvice(state, hood) || 'Locals who live here need no bed on campus.' };
}

/** What the panel of a field for sale says. */
export function parcelSummary(state: GameState, parcel: Parcel): { state: string; facts: string; affordable: boolean } {
  const affordable = state.money.cash >= parcel.price;
  return {
    state: `For sale: ${dollars(parcel.price)} for ${parcel.w} by ${parcel.h} cells of land to build on.`,
    facts: affordable ? 'It borders the town, so paths and roads from here reach more streets.' : `You have ${dollars(state.money.cash)}.`,
    affordable,
  };
}

/**
 * For the room plan when beds are short: the three fixes, each with its
 * numbers (DESIGN.md 25.2). Every number comes from housingFixes() in the
 * simulation. An entry is left out when it would bring nobody in.
 */
export function housingFixLines(fixes: HousingFixes): { lots: string; path: string; parking: string } {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const beds = (n: number): string => `${plural(n, 'fewer bed is', 'fewer beds are')} needed`;
  const lots = fixes.lots
    ? `Zone ${plural(fixes.lots.count, 'more Housing lot', 'more Housing lots')}: ${fixes.lots.perLot} beds each, ${dollarsShort(fixes.lots.cost)} in all. That covers all ${fixes.bedsShort}.`
    : '';
  const path = fixes.path
    ? `Lay a path to ${fixes.path.street}: about ${plural(fixes.path.cells, 'path cell', 'path cells')}, ${dollars(fixes.path.cost)}. ${plural(fixes.path.brings, 'local could', 'locals could')} walk in, a ${Math.round(fixes.path.minutes)} minute walk, so ${beds(fixes.path.brings)}.`
    : '';
  const parking = fixes.parking
    ? `Build ${plural(fixes.parking.spaces, 'parking space', 'parking spaces')} with a road to a street: ${plural(fixes.parking.lots, 'Parking lot', 'Parking lots')}, ${dollarsShort(fixes.parking.cost)}. ${plural(fixes.parking.brings, 'local could', 'locals could')} drive in, so ${beds(fixes.parking.brings)}.`
    : '';
  return { lots, path, parking };
}

// ------------------------------------------------------------- the Money panel --

export interface MoneyRow {
  name: string;
  /** The count behind it: "42 members at $58,000". */
  detail: string;
  amount: string;
}

export interface MoneyView {
  /** How much of every $100 is kept: the one number that says whether the campus is healthy. */
  lead: string;
  /** Set while a save from before these costs is climbing to them. */
  phase: string | null;
  incomeTotal: string;
  income: MoneyRow[];
  spendingTotal: string;
  /** Largest first. Each opens to its lines. */
  groups: Array<{ id: BudgetGroupId; name: string; amount: string; share: string; lines: MoneyRow[] }>;
  marketing: { step: number; max: number; line: string };
  endowment: { line: string; payIn: number[] };
}

/** A round sum to offer: two figures, rounded down. */
function roundSum(amount: number): number {
  if (amount < 10_000) return 0;
  const unit = 10 ** (Math.floor(Math.log10(amount)) - 1);
  return Math.floor(amount / unit) * unit;
}

/** Everything the Money panel shows, in words. The panel only lays it out. */
export function moneyView(state: GameState): MoneyView {
  const b = budget(state);
  const m = state.money;
  const kept = Math.round(b.kept);
  let lead: string;
  if (b.incomeTotal <= 0) lead = 'No money comes in until the first class arrives.';
  else if (b.kept >= 1) lead = `You keep $${kept} of every $100 that comes in.`;
  else if (b.kept >= 0) lead = 'You keep less than $1 of every $100 that comes in.';
  else lead = `You spend $${Math.max(1, Math.round(-b.kept))} more than every $100 that comes in.`;

  const phase = b.phase
    ? `New running costs are coming in over ${b.phase.of} days. This is step ${b.phase.step} of ${b.phase.of}: you pay ${dollarsShort(b.spending)} this year, and about ${dollarsShort(b.fullSpending)} once they are all in.`
    : null;

  const row = (line: BudgetLine): MoneyRow => ({ name: line.name, detail: line.detail, amount: dollarsShort(line.amount) });
  const step = m.marketing;
  const max = MARKETING_LIFT.length - 1;
  const lifts = MARKETING_LIFT.slice(1).map((lift) => Math.round(lift * 100));
  const marketingLine =
    step === 0
      ? `Off. Each step brings more applications: ${lifts.slice(0, -1).join(', ')}, then ${lifts[lifts.length - 1]}%.`
      : `Step ${step} of ${max} · ${Math.round(MARKETING_LIFT[step]! * 100)}% more applications · ${dollarsShort(enrollment(state) * MARKETING_COST_PER_STUDENT[step]!)} a year`;

  const pays = Math.round(ENDOWMENT_YIELD * 100);
  const endowmentLine =
    m.endowment > 0
      ? `${dollarsShort(m.endowment)} · earns ${dollarsShort(m.endowment * ENDOWMENT_YIELD)} a year`
      : `Nothing yet. Cash paid in earns ${pays}% a year for good.`;
  // A tenth or a quarter of the cash in hand: enough to matter, never so much that one tap empties the campus.
  const payIn = [...new Set([roundSum(m.cash * 0.1), roundSum(m.cash * 0.25)])].filter((amount) => amount >= 10_000);

  return {
    lead,
    phase,
    incomeTotal: dollarsShort(b.incomeTotal),
    income: b.income.map(row),
    spendingTotal: dollarsShort(b.spending),
    groups: b.groups.map((group) => ({
      id: group.id,
      name: group.name,
      amount: dollarsShort(group.amount),
      share: `${Math.round((100 * group.amount) / Math.max(1, b.fullSpending))}%`,
      lines: group.lines.map(row),
    })),
    marketing: { step, max, line: marketingLine },
    endowment: { line: endowmentLine, payIn },
  };
}
