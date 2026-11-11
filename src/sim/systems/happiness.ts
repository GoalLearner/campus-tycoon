import { BED_NEED, RETENTION_FLOOR, RETENTION_SPAN } from '../config/demand';
import { GREEN_CAP, WALK_MAX_PENALTY } from '../config/desirability';
import { CAUSE_WEIGHTS, type CauseId } from '../config/students';
import { stageSpec } from '../config/buildings';
import type { GameState, Zone } from '../types';
import { scoreParts } from './desirability';
import { safetyAt } from './incidents';
import { fedAt, recreationAt } from './placed';

/**
 * Happiness: how students feel about the school. In the code the number is
 * called approval; on screen it is always Happiness (DESIGN.md section 16.2).
 *
 * It is read at a spot, from named causes that each score 0 to 1. The campus
 * number is the average over where students spend their days: dorms for those
 * who live on campus, lecture halls for those who do not. A student card reads
 * the same function at one student's spot, so the two can never disagree.
 *
 * Nothing here is stored. It is worked out when asked, and at the end of each
 * semester to decide how many students stay.
 */

export interface Cause {
  id: CauseId;
  /** 0 is as bad as it gets, 1 is as good. */
  level: number;
  weight: number;
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

/** Happiness at one lot, with its causes. */
export function approvalAt(state: GameState, cell: number): Approval {
  const map = state.map;
  const zone = map.cells[cell]?.zone ?? null;
  if (zone === null) return { score: 0, causes: [], walkMinutes: -1 };
  const x = cell % map.width;
  const y = (cell - x) / map.width;
  const walkMinutes = zone === 'housing' ? (map.walkMinutes[cell] ?? -1) : -1;
  const parts = scoreParts(map, x, y, zone, walkMinutes);

  const causes: Cause[] = [];
  // The walk is from a dorm to class, so only a dorm has it.
  if (zone === 'housing') causes.push({ id: 'walk', level: 1 - parts.walkPenalty / WALK_MAX_PENALTY, weight: CAUSE_WEIGHTS.walk });
  causes.push({ id: 'green', level: Math.min(1, parts.green / GREEN_CAP[zone]), weight: CAUSE_WEIGHTS.green });
  causes.push({ id: 'dining', level: fedAt(map, x, y) ? 1 : 0, weight: CAUSE_WEIGHTS.dining });
  causes.push({ id: 'recreation', level: recreationAt(map, x, y), weight: CAUSE_WEIGHTS.recreation });
  causes.push({ id: 'safety', level: safetyAt(state, x, y), weight: CAUSE_WEIGHTS.safety });
  return { score: scoreOf(causes), causes, walkMinutes };
}

export interface CampusHappiness {
  /** 0 to 100. */
  score: number;
  /** Each cause across the campus, with the share of students it touches as its weight. */
  causes: Cause[];
  /** The cause whose fix would lift happiness most. null on an empty campus. */
  worst: CauseId | null;
  /** The share of students who will stay at the end of this semester, on today's happiness. */
  retention: number;
}

/** The average of a zone's lots, each counted by how many students it holds. */
function zoneAverage(state: GameState, zone: Zone): { people: number; score: number; levels: Map<CauseId, number> } {
  const levels = new Map<CauseId, number>();
  let people = 0;
  let score = 0;
  for (const building of state.map.buildings) {
    if (!building || building.zone !== zone || building.stage < 1) continue;
    const size = stageSpec(zone, building.stage).capacity;
    const here = approvalAt(state, building.y * state.map.width + building.x);
    for (const cause of here.causes) levels.set(cause.id, (levels.get(cause.id) ?? 0) + cause.level * size);
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
  if (total === 0) return { score: 50, causes: [], worst: null, retention: RETENTION_FLOOR + RETENTION_SPAN * 0.5 };
  residents /= total;
  others /= total;

  const causes: Cause[] = [];
  for (const id of Object.keys(CAUSE_WEIGHTS) as CauseId[]) {
    const inDorms = dorms.levels.get(id);
    const inHalls = halls.levels.get(id);
    const share = (inDorms === undefined ? 0 : residents) + (inHalls === undefined ? 0 : others);
    if (share === 0) continue;
    const level = ((inDorms ?? 0) * (inDorms === undefined ? 0 : residents) + (inHalls ?? 0) * (inHalls === undefined ? 0 : others)) / share;
    causes.push({ id, level, weight: CAUSE_WEIGHTS[id] * share });
  }
  // The same as averaging every student's card.
  const score = residents * dorms.score + others * halls.score;
  let worst: CauseId | null = null;
  let gap = 0;
  for (const cause of causes) {
    const lost = cause.weight * (1 - cause.level);
    if (lost > gap + 1e-9) {
      gap = lost;
      worst = cause.id;
    }
  }
  return { score, causes, worst, retention: RETENTION_FLOOR + RETENTION_SPAN * (score / 100) };
}

/** The share of every class that returns after a semester. It follows happiness. */
export function retentionRate(state: GameState): number {
  return campusHappiness(state).retention;
}
