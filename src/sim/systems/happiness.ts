import { BED_NEED, RETENTION_FLOOR, RETENTION_SPAN } from '../config/demand';
import { GREEN_CAP, WALK_MAX_PENALTY } from '../config/desirability';
import { CAUSE_OF, CAUSE_WEIGHTS, type CauseId, type DriverId } from '../config/students';
import { stageSpec } from '../config/buildings';
import type { GameState, Zone } from '../types';
import { scoreParts } from './desirability';
import { safetyAt } from './incidents';
import { fedAt, recreationAt } from './placed';

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

/** Gather what is felt at a spot into its named causes, in the order the causes are listed. */
function gathered(parts: readonly CausePart[]): Cause[] {
  const causes: Cause[] = [];
  for (const id of Object.keys(CAUSE_WEIGHTS) as CauseId[]) {
    const mine = parts.filter((part) => CAUSE_OF[part.id] === id);
    if (mine.length === 0) continue;
    const level = mine.reduce((sum, part) => sum + part.level, 0) / mine.length;
    causes.push({ id, level, weight: CAUSE_WEIGHTS[id], parts: mine });
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
  felt.push({ id: 'green', level: Math.min(1, parts.green / GREEN_CAP[zone]) });
  felt.push({ id: 'dining', level: fedAt(map, x, y) ? 1 : 0 });
  felt.push({ id: 'recreation', level: recreationAt(map, x, y) });
  // Medical Center and Campus Safety coverage are read together, as one level.
  felt.push({ id: 'safety', level: safetyAt(state, x, y) });
  const causes = gathered(felt);
  return { score: scoreOf(causes), causes, walkMinutes };
}

export interface CampusHappiness {
  /** 0 to 100. */
  score: number;
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
function zoneAverage(state: GameState, zone: Zone): { people: number; score: number; levels: Map<DriverId, number> } {
  const levels = new Map<DriverId, number>();
  let people = 0;
  let score = 0;
  for (const building of state.map.buildings) {
    if (!building || building.zone !== zone || building.stage < 1) continue;
    const size = stageSpec(zone, building.stage).capacity;
    const here = approvalAt(state, building.y * state.map.width + building.x);
    for (const cause of here.causes) {
      for (const part of cause.parts) levels.set(part.id, (levels.get(part.id) ?? 0) + part.level * size);
    }
    score += here.score * size;
    people += size;
  }
  if (people > 0) for (const [id, sum] of levels) levels.set(id, sum / people);
  return { people, score: people > 0 ? score / people : 0, levels };
}

export function campusHappiness(state: GameState): CampusHappiness {
  const dorms = zoneAverage(state, 'housing');
  const halls = zoneAverage(state, 'academic');
  // Those who live on campus are read at their dorms, the rest at the lecture halls.
  let residents = dorms.people > 0 ? BED_NEED : 0;
  let others = halls.people > 0 ? 1 - BED_NEED : 0;
  const total = residents + others;
  if (total === 0) return { score: 50, causes: [], worst: null, worstPart: null, retention: RETENTION_FLOOR + RETENTION_SPAN * 0.5 };
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
    const level = parts.reduce((sum, part) => sum + part.level, 0) / parts.length;
    causes.push({ id, level, weight: CAUSE_WEIGHTS[id] * share, parts });
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
    let lowest = Infinity;
    for (const part of worst.parts) {
      if (part.level < lowest - 1e-9) {
        lowest = part.level;
        worstPart = part.id;
      }
    }
  }
  return { score, causes, worst: worst?.id ?? null, worstPart, retention: RETENTION_FLOOR + RETENTION_SPAN * (score / 100) };
}

/** The share of every class that returns after a semester. It follows happiness. */
export function retentionRate(state: GameState): number {
  return campusHappiness(state).retention;
}
