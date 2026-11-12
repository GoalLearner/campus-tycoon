import {
  BUILD_ORDER,
  campusHappiness,
  binState,
  fixText,
  isBrokenThing,
  isMessSpot,
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

/** The id of the Build menu card that hands over to the road tool. */
export const ROAD_ENTRY = 'tool:road';

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
      upkeep: spec.upkeepPerYear > 0 ? `Upkeep ${dollarsShort(spec.upkeepPerYear)} a year` : 'No upkeep',
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
      const fix = fixText(state, placed, thingFix(state, placed));
      const how = { empty: 'Catching litter.', filling: 'Filling up.', full: 'Full. It catches nothing until it is emptied.', broken: 'Broken. It catches nothing until it is fixed.' }[binState(state, placed.id)];
      return fix ? `${how} ${fix}` : how;
    }
    case 'seat': {
      if (isBrokenThing(state, placed.id)) {
        const fix = fixText(state, placed, thingFix(state, placed));
        return `Broken. Nobody can sit here until it is fixed.${fix ? ` ${fix}` : ' A worker is on the way.'}`;
      }
      const lots = lotsInReach(state, placed, 'housing') + lotsInReach(state, placed, 'academic');
      return `Somewhere to sit for ${plural(lots, 'dorm or lecture hall', 'dorms and lecture halls')} within ${spec.radius} cells.`;
    }
    case 'yard': {
      const status = yardStatus(state, placed);
      return `${status.workers} of ${status.max} workers. ${yardLine(status)} Wages ${dollars(status.wagesPerYear)} a year.`;
    }
    case 'landmark':
      return `${spec.effect}.`;
  }
}

export function placedFacts(placed: Placed): string {
  const spec = PLACED[placed.type];
  const upkeep = spec.upkeepPerYear > 0 ? `Upkeep ${dollars(spec.upkeepPerYear)} a year` : 'No upkeep';
  return spec.buildable ? `${upkeep} · The Clear tool removes it` : upkeep;
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
