import type { IncidentKind } from '../types';

/**
 * Incidents: how often they happen, how long they take, and what the map says
 * about them. Every number is a tuning target [T].
 *
 * Tone (DESIGN.md section 16): minor and comic. Nobody is hurt badly, nothing
 * is graphic, and every one ends. Campus Safety handles mischief, not crime.
 */

/** Whether something has happened is checked this often, in ticks. */
export const INCIDENT_EVAL_TICKS = 20;
/** Chance of an injury at each check, for every thousand students, when there is somewhere to play. */
export const INJURY_RATE = 0.25;
/** Chance of mischief at each check, for every thousand students, when the dorms are full. Less when they are not. */
export const MISCHIEF_RATE = 0.2;
/** No more than this many at once, so the map never fills with icons. */
export const MAX_ACTIVE_INCIDENTS = 6;

/** A responder takes this long to set out, plus time for each cell to walk. */
export const RESPONSE_BASE_TICKS = 2;
export const RESPONSE_TICKS_PER_CELL = 0.5;
/** With nobody coming, an incident lingers this long and then passes. */
export const LINGER_TICKS = 45;

/**
 * How safe a spot feels, as the Safety cause of happiness: a base, more
 * inside each kind of circle, and a little less for each incident within
 * INCIDENT_NEAR_CELLS that nobody is coming to.
 */
export const SAFETY_LEVELS = { base: 0.4, medical: 0.3, safety: 0.3, unanswered: 0.2 };
export const INCIDENT_NEAR_CELLS = 6;

/** `{place}` is where it happened. */
export const INCIDENT_LINES: Record<IncidentKind, readonly string[]> = {
  injury: [
    'A stubbed toe at the {place}.',
    'A twisted ankle at the {place}.',
    'Two students bumped heads at the {place}. Both are fine and embarrassed.',
    'A pulled muscle at the {place}, after no warm-up at all.',
    'A jammed finger at the {place}.',
  ],
  mischief: [
    'A traffic cone has been crowned king of a dorm lounge.',
    'Someone has filled a dorm hallway with balloons.',
    'Every chair in a dorm lounge now faces the wall.',
    'A dorm door has been gift-wrapped. Nobody saw anything.',
    'A dorm noticeboard has been rearranged into a very large frog.',
  ],
};

/**
 * Calls from parties (DESIGN.md 52.3, as built in section 55), on a game with goals. Plain, never graphic: what
 * happened, and somebody comes. Campus Safety's (as mischief) break up a party or catch someone under 21 drinking; the
 * Medical Center's (as injuries) look after someone who drank too much. `{place}` is "a dorm" or "the Kappa Llama
 * house".
 */
export const PARTY_LINES: Record<IncidentKind, readonly string[]> = {
  mischief: [
    'A party at {place} got too loud after midnight.',
    'Two sophomores were caught drinking under 21 at a party at {place}.',
    'A party at {place} spilled out onto the lawn at two in the morning.',
    'A freshman was found with a beer at a party at {place}. Under 21, so it is a meeting with the Dean of Students.',
    'A party at {place} ran two hours past its end, music and all.',
  ],
  injury: [
    'A senior drank too much at a party at {place} and needed looking after.',
    'A junior had too many drinks at a party at {place} and could not get home alone.',
    'Two seniors drank too much at a party at {place} and needed looking after.',
  ],
};
