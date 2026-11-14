import { APPLICANTS_CAP, FANS_CAP, HAPPY_CAP, STRESS_OFF_CAP } from '../config/inbox';
import type { Boost, GameState } from '../types';

/**
 * What the desk has set going (DESIGN.md section 36): a few small, dated
 * pushes on numbers the game already has. Each is capped here, where it is
 * read, so no pile of choices can run away with a number.
 *
 * Kept apart from the inbox itself so the systems that read a boost do not
 * pull in everything the inbox reads.
 */

function active(state: GameState, kind: Boost['kind']): Boost[] {
  const boosts = state.inbox?.boosts;
  if (!boosts || boosts.length === 0) return NONE;
  const tick = state.clock.tick;
  return boosts.filter((boost) => boost.kind === kind && boost.until > tick && (boost.from === undefined || boost.from <= tick));
}
const NONE: Boost[] = [];

/** The desk's lines on the week's Happiness, each with its points. Together they never pass the cap, either way. */
export function happyParts(state: GameState): Array<{ label: string; points: number }> {
  const parts = active(state, 'happy').map((boost) => ({ label: boost.label, points: boost.amount }));
  if (parts.length === 0) return parts;
  const total = parts.reduce((sum, part) => sum + part.points, 0);
  const capped = Math.max(-HAPPY_CAP, Math.min(HAPPY_CAP, total));
  if (capped !== total && total !== 0) {
    const scale = capped / total;
    for (const part of parts) part.points *= scale;
  }
  return parts;
}

/** Points of Stress the desk's help takes off right now, and what it is called. Two kinds of help do not add up. */
export function stressOff(state: GameState): { points: number; label: string } {
  let best: Boost | null = null;
  for (const boost of active(state, 'stress')) if (!best || boost.amount > best.amount) best = boost;
  return best ? { points: Math.min(STRESS_OFF_CAP, best.amount), label: best.label } : NO_HELP;
}
const NO_HELP = { points: 0, label: '' };

/** The share the desk adds to, or takes from, the crowd that wants a ticket. */
export function fansLift(state: GameState): number {
  const sum = active(state, 'fans').reduce((total, boost) => total + boost.amount, 0);
  return Math.max(FANS_CAP.down, Math.min(FANS_CAP.up, sum));
}

/** The share the desk adds to a class's applicants. */
export function applicantsLift(state: GameState): number {
  const sum = active(state, 'applicants').reduce((total, boost) => total + boost.amount, 0);
  return Math.max(0, Math.min(APPLICANTS_CAP, sum));
}

/** How much the desk adds to how often calls come from parties (DESIGN.md 55): a tailgate with drinks. */
export function callsLift(state: GameState): number {
  return active(state, 'calls').reduce((total, boost) => total + boost.amount, 0);
}

/** Drop what has ended. Called once a day. */
export function pruneBoosts(state: GameState): void {
  const tick = state.clock.tick;
  if (state.inbox.boosts.some((boost) => boost.until <= tick)) state.inbox.boosts = state.inbox.boosts.filter((boost) => boost.until > tick);
}
