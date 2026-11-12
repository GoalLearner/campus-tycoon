import { BED_NEED, RETENTION_FLOOR, RETENTION_SPAN } from '../config/demand';
import { GREEN_CAP, WALK_MAX_PENALTY } from '../config/desirability';
import { VARIETY_BONUS, VARIETY_KINDS } from '../config/placed';
import { CAUSE_OF, CAUSE_WEIGHTS, PART_WEIGHTS, type CauseId, type DriverId } from '../config/students';
import { stageSpec } from '../config/buildings';
import type { GameState, Zone } from '../types';
import { scoreParts } from './desirability';
import { foodKindsAt } from './food';
import { noiseAt } from './football';
import { cleanAt, seatingAt } from './grounds';
import { safetyAt } from './incidents';
import { recreationAt } from './play';
import { seasonLine, type CampusLevels, type SeasonLine } from './season';

/**
 * Happiness: how students feel about the school. In the code the number is
 * called approval; on screen it is always Happiness (DESIGN.md section 16.2).
 *
 * It is read at a spot. Each thing a student feels there scores 0 to 1, and
 * those are gathered into at most four named causes, all of equal weight. A
 * cause is the average of what is gathered into it. The campus number is the
 * average over where students spend their days: dorms for those who live on
 * campus, lecture halls for those who do not. A student card reads the same
 * function at one student's spot, so the two can never disagree.
 *
 * Nothing here is stored. It is worked out when asked, and at the end of each
 * semester to decide how many students stay.
 */

/** One thing a cause is made of, such as dining inside "Food & fun". */
export interface CausePart {
  id: DriverId;
  /** 0 is as bad as it gets, 1 is as good. */
  level: number;
}

export interface Cause {
  id: CauseId;
  /** 0 is as bad as it gets, 1 is as good. The average of its parts. */
  level: number;
  weight: number;
  /** What it is made of. Advice and student thoughts name the weakest part, so they stay something to act on. */
  parts: CausePart[];
  /**
   * What was added on top of the average of its parts, already inside `level`.
   * Only Food & fun has one: a tenth where three kinds of food are in reach,
   * and never past full (DESIGN.md 30.2). Left out when nothing was added.
   */
  bonus?: number;
}

export interface Approval {
  /** 0 to 100. */
  score: number;
  causes: Cause[];
  /** Minutes to class from here. -1 when there is no route or this is not Housing. */
  walkMinutes: number;
}

function scoreOf(causes: readonly Cause[]): number {
  let sum = 0;
  let weights = 0;
  for (const cause of causes) {
    sum += cause.level * cause.weight;
    weights += cause.weight;
  }
  return weights === 0 ? 0 : (100 * sum) / weights;
}

/** A cause's level: the average of its parts, each counted by its weight. */
function weighed(parts: readonly CausePart[]): number {
  let sum = 0;
  let weights = 0;
  for (const part of parts) {
    sum += part.level * PART_WEIGHTS[part.id];
    weights += PART_WEIGHTS[part.id];
  }
  return weights === 0 ? 0 : sum / weights;
}

/** Gather what is felt at a spot into its named causes, in the order the causes are listed. */
function gathered(parts: readonly CausePart[]): Cause[] {
  const causes: Cause[] = [];
  for (const id of Object.keys(CAUSE_WEIGHTS) as CauseId[]) {
    const mine = parts.filter((part) => CAUSE_OF[part.id] === id);
    if (mine.length === 0) continue;
    causes.push({ id, level: weighed(mine), weight: CAUSE_WEIGHTS[id], parts: mine });
  }
  return causes;
}

/** One part of a cause, wherever it sits. undefined when this spot does not have it. */
export function partLevel(causes: readonly Cause[], id: DriverId): number | undefined {
  for (const cause of causes) {
    for (const part of cause.parts) if (part.id === id) return part.level;
  }
  return undefined;
}

/** Happiness at one lot, with its causes. */
export function approvalAt(state: GameState, cell: number): Approval {
  const map = state.map;
  const zone = map.cells[cell]?.zone ?? null;
  if (zone === null) return { score: 0, causes: [], walkMinutes: -1 };
  const x = cell % map.width;
  const y = (cell - x) / map.width;
  const walkMinutes = zone === 'housing' ? (map.walkMinutes[cell] ?? -1) : -1;
  const parts = scoreParts(map, x, y, zone, walkMinutes);

  const felt: CausePart[] = [];
  // The walk is from a dorm to class, so only a dorm has it.
  if (zone === 'housing') felt.push({ id: 'walk', level: 1 - parts.walkPenalty / WALK_MAX_PENALTY });
  // Grounds: green space, how clean it is, and somewhere to sit.
  felt.push({ id: 'green', level: Math.min(1, parts.green / GREEN_CAP[zone]) });
  felt.push({ id: 'clean', level: cleanAt(state, x, y) });
  felt.push({ id: 'seating', level: seatingAt(state, x, y) });
  // A dorm inside a stadium's reach hears every home game. Noise is part of Grounds, and only there.
  if (zone === 'housing') {
    const noise = noiseAt(state, x, y);
    if (noise > 0) felt.push({ id: 'noise', level: 1 - noise });
  }
  // Food in reach, and how many kinds of it: read once, for the dining part and for variety below.
  const kinds = foodKindsAt(map, x, y);
  felt.push({ id: 'dining', level: kinds > 0 ? 1 : 0 });
  felt.push({ id: 'recreation', level: recreationAt(state, x, y) });
  // Medical Center and Campus Safety coverage are read together, as one level.
  felt.push({ id: 'safety', level: safetyAt(state, x, y) });
  const causes = gathered(felt);
  // Variety: three kinds of food in reach add a tenth to Food & fun, never past full.
  const variety = kinds >= VARIETY_KINDS ? VARIETY_BONUS : 0;
  if (variety > 0) {
    for (const cause of causes) {
      if (cause.id !== 'life') continue;
      const lifted = Math.min(1, cause.level + variety);
      cause.bonus = lifted - cause.level;
      cause.level = lifted;
    }
  }
  return { score: scoreOf(causes), causes, walkMinutes };
}

export interface CampusHappiness {
  /** 0 to 100: the four causes, and what the calendar and the sky add or take this week. */
  score: number;
  /** 0 to 100: the four causes alone. Retention follows this, so no spell of weather decides who stays. */
  base: number;
  /** The one signed line beside the causes: exams, a break, the weather. */
  season: SeasonLine;
  /** Each cause across the campus, with the share of students it touches as its weight. */
  causes: Cause[];
  /** The cause whose fix would lift happiness most. null on an empty campus. */
  worst: CauseId | null;
  /** The weakest part of that cause: the thing to build or change. */
  worstPart: DriverId | null;
  /** The share of students who will stay at the end of this semester, on today's happiness. */
  retention: number;
}

/** The average of a zone's lots, each counted by how many students it holds. */
function zoneAverage(state: GameState, zone: Zone): { people: number; score: number; levels: Map<DriverId, number>; bonus: Map<CauseId, number> } {
  const levels = new Map<DriverId, number>();
  const bonus = new Map<CauseId, number>();
  let people = 0;
  let score = 0;
  for (const building of state.map.buildings) {
    if (!building || building.zone !== zone || building.stage < 1) continue;
    // Used as a weight, so the campus scale cancels.
    const size = stageSpec(zone, building.stage, 1).capacity;
    const here = approvalAt(state, building.y * state.map.width + building.x);
    for (const cause of here.causes) {
      for (const part of cause.parts) levels.set(part.id, (levels.get(part.id) ?? 0) + part.level * size);
      if (cause.bonus) bonus.set(cause.id, (bonus.get(cause.id) ?? 0) + cause.bonus * size);
    }
    score += here.score * size;
    people += size;
  }
  if (people > 0) {
    for (const [id, sum] of levels) levels.set(id, sum / people);
    for (const [id, sum] of bonus) bonus.set(id, sum / people);
  }
  return { people, score: people > 0 ? score / people : 0, levels, bonus };
}

export function campusHappiness(state: GameState): CampusHappiness {
  const dorms = zoneAverage(state, 'housing');
  const halls = zoneAverage(state, 'academic');
  // Those who live on campus are read at their dorms, the rest at the lecture halls.
  let residents = dorms.people > 0 ? BED_NEED : 0;
  let others = halls.people > 0 ? 1 - BED_NEED : 0;
  const total = residents + others;
  if (total === 0) {
    const season = seasonLine(state, { recreation: 0, green: 0, safety: 0, dining: 0 });
    return { score: 50, base: 50, season, causes: [], worst: null, worstPart: null, retention: RETENTION_FLOOR + RETENTION_SPAN * 0.5 };
  }
  residents /= total;
  others /= total;

  const causes: Cause[] = [];
  for (const id of Object.keys(CAUSE_WEIGHTS) as CauseId[]) {
    // Each part across the campus, and the share of students who have this cause at all.
    const parts: CausePart[] = [];
    let share = 0;
    for (const part of Object.keys(CAUSE_OF) as DriverId[]) {
      if (CAUSE_OF[part] !== id) continue;
      const inDorms = dorms.levels.get(part);
      const inHalls = halls.levels.get(part);
      const touched = (inDorms === undefined ? 0 : residents) + (inHalls === undefined ? 0 : others);
      if (touched === 0) continue;
      parts.push({ id: part, level: ((inDorms ?? 0) * (inDorms === undefined ? 0 : residents) + (inHalls ?? 0) * (inHalls === undefined ? 0 : others)) / touched });
      share = Math.max(share, touched);
    }
    if (parts.length === 0) continue;
    // What variety added at each lot, averaged the same way, so the panel and the cards agree.
    const added = share > 0 ? ((dorms.bonus.get(id) ?? 0) * residents + (halls.bonus.get(id) ?? 0) * others) / share : 0;
    const cause: Cause = { id, level: Math.min(1, weighed(parts) + added), weight: CAUSE_WEIGHTS[id] * share, parts };
    if (added > 0) cause.bonus = added;
    causes.push(cause);
  }
  // The same as averaging every student's card.
  const score = residents * dorms.score + others * halls.score;
  let worst: Cause | null = null;
  let gap = 0;
  for (const cause of causes) {
    const lost = cause.weight * (1 - cause.level);
    if (lost > gap + 1e-9) {
      gap = lost;
      worst = cause;
    }
  }
  let worstPart: DriverId | null = null;
  if (worst) {
    // The part with the most to gain, counting how much it weighs inside the cause.
    let most = -1;
    for (const part of worst.parts) {
      const toGain = PART_WEIGHTS[part.id] * (1 - part.level);
      if (toGain > most + 1e-9) {
        most = toGain;
        worstPart = part.id;
      }
    }
  }
  const season = seasonLine(state, campusLevels(state));
  return {
    score: Math.max(0, Math.min(100, score + season.delta)),
    base: score,
    season,
    causes,
    worst: worst?.id ?? null,
    worstPart,
    retention: RETENTION_FLOOR + RETENTION_SPAN * (score / 100),
  };
}

/** The most buildings of each zone that are read for the levels below. */
const LEVEL_SAMPLE = 40;

/**
 * What the campus offers against Stress and bad weather: recreation, green
 * space, safety and food in reach, each from 0 to 1.
 *
 * The academic year asks for this a few times every game year, catch-up
 * included, so it is kept light: only these four things are read, and on a
 * large campus at an even sample of its buildings, always the same ones.
 * Stress on the panel, in the exam report and at the end of a semester all
 * read it here, so they agree.
 */
export function campusLevels(state: GameState): CampusLevels {
  const map = state.map;
  const sums: Record<Zone, { people: number; recreation: number; green: number; safety: number; dining: number }> = {
    housing: { people: 0, recreation: 0, green: 0, safety: 0, dining: 0 },
    academic: { people: 0, recreation: 0, green: 0, safety: 0, dining: 0 },
  };
  for (const zone of ['housing', 'academic'] as const) {
    const built = map.buildings.filter((building): building is NonNullable<typeof building> => !!building && building.zone === zone && building.stage >= 1);
    const stride = Math.max(1, Math.ceil(built.length / LEVEL_SAMPLE));
    const sum = sums[zone];
    for (let i = 0; i < built.length; i += stride) {
      const building = built[i]!;
      const { x, y } = building;
      // Used as a weight, so the campus scale cancels.
    const size = stageSpec(zone, building.stage, 1).capacity;
      const walk = zone === 'housing' ? (map.walkMinutes[y * map.width + x] ?? -1) : -1;
      sum.people += size;
      sum.green += size * Math.min(1, scoreParts(map, x, y, zone, walk).green / GREEN_CAP[zone]);
      sum.recreation += size * recreationAt(state, x, y);
      sum.safety += size * safetyAt(state, x, y);
      sum.dining += size * (foodKindsAt(map, x, y) > 0 ? 1 : 0);
    }
  }
  const dorms = sums.housing;
  const halls = sums.academic;
  let residents = dorms.people > 0 ? BED_NEED : 0;
  let others = halls.people > 0 ? 1 - BED_NEED : 0;
  const total = residents + others;
  if (total === 0) return { recreation: 0, green: 0, safety: 0, dining: 0 };
  residents /= total;
  others /= total;
  const level = (key: 'recreation' | 'green' | 'safety' | 'dining'): number =>
    (dorms.people > 0 ? (dorms[key] / dorms.people) * residents : 0) + (halls.people > 0 ? (halls[key] / halls.people) * others : 0);
  return { recreation: level('recreation'), green: level('green'), safety: level('safety'), dining: level('dining') };
}

/** The share of every class that returns after a semester. It follows happiness. */
export function retentionRate(state: GameState): number {
  return campusHappiness(state).retention;
}
