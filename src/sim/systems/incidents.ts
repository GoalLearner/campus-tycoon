import { smallCount } from '../scale';
import { offCampusNow } from './town';
import { mischiefTimes } from './policies';
import {
  INCIDENT_EVAL_TICKS,
  INCIDENT_LINES,
  INCIDENT_NEAR_CELLS,
  INJURY_RATE,
  LINGER_TICKS,
  MAX_ACTIVE_INCIDENTS,
  MISCHIEF_RATE,
  RESPONSE_BASE_TICKS,
  RESPONSE_TICKS_PER_CELL,
  SAFETY_LEVELS,
} from '../config/incidents';
import { PLACED } from '../config/placed';
import { nextFloat, nextInt } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, Incident, IncidentKind, LogEntry, MapState, Placed } from '../types';

/**
 * Incidents: small comic injuries where students play, and mischief where
 * dorms are crowded. A Medical Center answers injuries and Campus Safety
 * answers mischief, each inside its circle. A responder sets out from the
 * nearest one that covers the spot and arrives sooner the closer it is. An
 * incident no circle covers lingers, costs a little happiness nearby, and
 * times out.
 *
 * Everything is decided when the incident begins, from coverage alone and from
 * the game's own random stream, so the outcome is the same whether the player
 * is watching or away. Nobody is harmed and every incident ends.
 */

const NEEDS: Record<IncidentKind, 'medical' | 'safety'> = { injury: 'medical', mischief: 'safety' };

function cellsFrom(placed: Placed, x: number, y: number): number {
  const dx = Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1));
  const dy = Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1));
  return Math.max(dx, dy);
}

/** The nearest building of a family whose circle covers a spot, with its distance in cells. */
export function coverFor(map: MapState, family: 'medical' | 'safety', x: number, y: number): { placed: Placed; cells: number } | null {
  let best: { placed: Placed; cells: number } | null = null;
  // Only the buildings of that family are looked at. An old save being upgraded has no such list yet.
  const ids = map.care?.byFamily?.[family];
  if (ids) {
    for (const id of ids) {
      const placed = map.placed[id];
      if (!placed) continue;
      const cells = cellsFrom(placed, x, y);
      if (cells <= PLACED[placed.type].radius && (!best || cells < best.cells)) best = { placed, cells };
    }
    return best;
  }
  for (const placed of map.placed) {
    if (!placed) continue;
    const spec = PLACED[placed.type];
    if (spec.family !== family) continue;
    const cells = cellsFrom(placed, x, y);
    if (cells <= spec.radius && (!best || cells < best.cells)) best = { placed, cells };
  }
  return best;
}

/** One line for the icon on the map. */
export function incidentText(incident: Incident): string {
  const pool = INCIDENT_LINES[incident.kind];
  return pool[incident.line % pool.length]!.replace('{place}', incident.place);
}

/**
 * How safe and looked-after a spot feels, 0 to 1: a base, more inside each
 * kind of circle, and a little less while an incident nearby has nobody coming.
 */
export function safetyAt(state: GameState, x: number, y: number): number {
  let level = SAFETY_LEVELS.base;
  if (coverFor(state.map, 'medical', x, y)) level += SAFETY_LEVELS.medical;
  if (coverFor(state.map, 'safety', x, y)) level += SAFETY_LEVELS.safety;
  for (const incident of state.incidents.active) {
    if (incident.responder !== null) continue;
    if (Math.max(Math.abs(incident.x - x), Math.abs(incident.y - y)) <= INCIDENT_NEAR_CELLS) level -= SAFETY_LEVELS.unanswered;
  }
  return Math.max(0, Math.min(1, level));
}

function begin(state: GameState, kind: IncidentKind, x: number, y: number, place: string): void {
  const book = state.incidents;
  const cover = coverFor(state.map, NEEDS[kind], x, y);
  const tick = state.clock.tick;
  book.active.push({
    id: book.nextId,
    kind,
    x,
    y,
    place,
    line: nextInt(state.rng, 'events', INCIDENT_LINES[kind].length),
    startTick: tick,
    responder: cover ? cover.placed.id : null,
    // A responder is quicker the closer the building. Nobody coming means it lingers.
    endTick: tick + (cover ? RESPONSE_BASE_TICKS + Math.ceil(cover.cells * RESPONSE_TICKS_PER_CELL) : LINGER_TICKS),
  });
  book.nextId += 1;
}

/** Every so often, see whether something has happened. More students, more incidents. */
export function spawnIncidents(state: GameState): void {
  if (state.clock.tick % INCIDENT_EVAL_TICKS !== 0) return;
  const students = enrollment(state);
  if (students === 0) return;
  // The same draws are made whatever the outcome, so the stream never depends on what is on the map.
  const injuryRoll = nextFloat(state.rng, 'events');
  const injuryPick = nextFloat(state.rng, 'events');
  const mischiefRoll = nextFloat(state.rng, 'events');
  const mischiefPick = nextFloat(state.rng, 'events');
  // How often something happens follows how busy the campus is, as the small game counts it (DESIGN.md 35.7).
  const scale = smallCount(state, students) / 1000;

  const play = state.map.placed.filter((p): p is Placed => !!p && PLACED[p.type].family === 'recreation');
  if (play.length > 0 && state.incidents.active.length < MAX_ACTIVE_INCIDENTS && injuryRoll < Math.min(0.9, scale * INJURY_RATE)) {
    const where = play[Math.min(play.length - 1, Math.floor(injuryPick * play.length))]!;
    begin(state, 'injury', where.x, where.y, PLACED[where.type].name);
  }

  const dorms = state.map.buildings.filter((b) => b && b.zone === 'housing' && b.stage > 0);
  const beds = openCapacity(state, 'housing');
  const crowding = beds > 0 ? Math.min(1, Math.max(0, students - offCampusNow(state)) / beds) : 0;
  if (dorms.length > 0 && state.incidents.active.length < MAX_ACTIVE_INCIDENTS && mischiefRoll < Math.min(0.9, scale * MISCHIEF_RATE * crowding * crowding) * mischiefTimes(state)) {
    const where = dorms[Math.min(dorms.length - 1, Math.floor(mischiefPick * dorms.length))]!;
    begin(state, 'mischief', where.x, where.y, 'a dorm');
  }
}

/** End the incidents whose time has come: a responder arrived, or nobody did. */
export function stepIncidents(state: GameState, log: LogEntry[]): void {
  const book = state.incidents;
  if (book.active.length === 0) return;
  const tick = state.clock.tick;
  const still: Incident[] = [];
  for (const incident of book.active) {
    if (incident.endTick > tick) {
      still.push(incident);
      continue;
    }
    const need = NEEDS[incident.kind];
    // The building may have been cleared while its responder was on the way.
    const responder = incident.responder === null ? null : (state.map.placed[incident.responder] ?? null);
    const what = incidentText(incident);
    if (responder) {
      book.handled += 1;
      log.push({
        tick,
        kind: 'incident',
        text: `${PLACED[responder.type].name} handled it: ${what}`,
        data: { handled: 1, need, place: incident.place },
      });
    } else {
      book.missed += 1;
      log.push({
        tick,
        kind: 'incident',
        text: `Nobody came: ${what} ${need === 'medical' ? 'A Medical Center' : 'Campus Safety'} in reach of ${incident.place === 'a dorm' ? 'that dorm' : `the ${incident.place}`} would have handled it.`,
        data: { handled: 0, need, place: incident.place },
      });
    }
  }
  book.active = still;
}
