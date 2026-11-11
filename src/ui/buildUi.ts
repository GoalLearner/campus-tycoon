import {
  BUILD_ORDER,
  campusHappiness,
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
  entries.push(
    soon('build.parking', 'Parking lot', 'Spaces for locals who drive in', 'Coming with the town'),
    soon('build.garage', 'Parking structure', 'Several times the cars of a parking lot', 'Coming with the town'),
    soon('road.15', 'Roads', 'Link parking to the town streets', 'Coming with the town'),
    soon('ground.grass', 'Land purchase', 'More ground to build on', 'Coming with the town'),
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
  green: 'Green space',
  life: 'Food & fun',
  safety: 'Safety & health',
};

/** What to do about the weakest part of a cause. */
const PART_FIX: Record<DriverId, string> = {
  walk: 'Zone Academic lots nearer the dorms, or lay a shorter path.',
  green: 'Add quads, trees or a pond near dorms and lecture halls.',
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
    build: mood.worst === 'life' || mood.worst === 'safety',
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
