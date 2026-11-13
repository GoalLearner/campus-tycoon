import {
  discoveryText,
  dollarsShort,
  duration,
  findingsHeld,
  headCount,
  labOf,
  labRate,
  labReputation,
  LABS,
  LAB_SEAT_REACH,
  nextDiscoveryIn,
  PLACED,
  placedCost,
  hasDaily,
  type GameState,
  type Placed,
} from '../sim';
import type { BuildEntry } from './buildMenu';

/**
 * The research labs on screen (DESIGN.md 49): their cards in the Build menu,
 * what a lab is doing in one line, and its list of discoveries.
 */

/** The labs' cards, under Academics: one for each field. A field whose lab stands says so and cannot be bought again. */
export function labEntries(state: GameState, scale: number, card: (type: Placed['type']) => BuildEntry): BuildEntry[] {
  if (!hasDaily(state)) return [];
  return LABS.map((spec) => {
    const entry = card(spec.type);
    if (labOf(state, spec.type)) entry.locked = 'On the campus. One lab for each field';
    else entry.cost = dollarsShort(placedCost(spec.type, scale));
    return entry;
  });
}

/** What a lab is doing now, in its own numbers. */
export function labSummary(state: GameState, lab: Placed): string {
  const rate = labRate(state, lab);
  const held = Math.floor(findingsHeld(state, lab));
  const perDay = Math.round(rate.perHour * 24 * 10) / 10;
  const found = state.labs.found.filter((one) => one.lab === lab.type).length;
  const next = nextDiscoveryIn(state, lab.id);
  const seats = rate.seatsNear >= rate.seatsWanted ? `all the lecture-hall seats it can use are within ${LAB_SEAT_REACH} cells` : `${headCount(rate.seatsNear)} of the ${headCount(rate.seatsWanted)} lecture-hall seats it can use are within ${LAB_SEAT_REACH} cells`;
  const funding = rate.funding > 1.001 ? 'above' : rate.funding < 0.999 ? 'below' : 'at';
  const lift = labReputation(state);
  const parts = [
    `${held === 1 ? '1 finding' : `${held} findings`} waiting, about ${perDay} a day: ${seats}, and faculty funding is ${funding} its middle.`,
    `${found === 0 ? 'No discoveries yet' : found === 1 ? '1 discovery' : `${found} discoveries`}${next === null ? '' : `; the next in about ${duration(Math.max(1, Math.round(next * 60)))}`}.`,
    `The labs lift Reputation ${lift} ${lift === 1 ? 'point' : 'points'}.`,
  ];
  return parts.join(' ');
}

export interface LabPage {
  title: string;
  lead: string;
  /** Newest first. */
  discoveries: Array<{ text: string; when: string }>;
}

/** A lab's discoveries, for its page. */
export function labPage(state: GameState, lab: Placed): LabPage {
  const mine = state.labs.found.filter((one) => one.lab === lab.type);
  return {
    title: `${PLACED[lab.type].name}: discoveries`,
    lead: mine.length === 0 ? 'Its first is on its way.' : `${mine.length === 1 ? 'One discovery' : `${mine.length} discoveries`} so far.`,
    discoveries: [...mine].reverse().map((one) => ({ text: discoveryText(state, one), when: `Year ${one.year}` })),
  };
}
