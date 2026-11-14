import { CALLS_MOST, CHAPTER_PARTY_WEIGHT, LATE_NIGHT_RATING, LATE_NIGHT_STRESS, PARTY_CALL_RATE, PARTY_LIFT, PARTY_MEDICAL_SHARE, SCENE_PER_GREEK } from '../config/parties';
import { POLICIES, type PolicyEffect, type PolicySpec } from '../config/policies';
import { SEASON_CURVE } from '../config/season';
import type { GameState } from '../types';
import { hasDaily } from './daily';
import { greekShare } from './greek';

/**
 * Parties and drinking (DESIGN.md 52.3, as built in section 55). A campus
 * with goals has a party scene: parties lift Food & fun a little, and late
 * nights cost Stress and the graduation rate, more with more students in
 * chapters. Now and then a party ends in a call: Campus Safety breaks one up,
 * catches someone under 21 drinking, or the Medical Center looks after
 * someone who drank too much (the calls are incidents, in incidents.ts).
 *
 * The three policies move these numbers through their own effect kinds, read
 * here from the list itself as Greek Row reads its own. Nothing at all on a
 * game with no goals.
 */

/** True on a campus with parties: a game with goals. */
export function partiesOn(state: GameState): boolean {
  return hasDaily(state);
}

/** How big the party scene is: 1, and more with more students in chapters. */
export function partyScene(state: GameState): number {
  return 1 + SCENE_PER_GREEK * greekShare(state);
}

type Kind = 'partyCalls' | 'lateNights';

/** The policies that are on and touch a kind, with their product. For calls, `calls` picks Campus Safety's or the Medical Center's. */
function policyTimes(state: GameState, kind: Kind, calls?: 'safety' | 'medical'): { times: number; by: string[] } {
  const on = state.policies?.on;
  if (!on || on.length === 0) return { times: 1, by: [] };
  let times = 1;
  const by: string[] = [];
  for (const spec of POLICIES) {
    if (!on.includes(spec.id)) continue;
    for (const effect of [...spec.gains, ...spec.costs]) {
      if (effect.kind !== kind) continue;
      if (effect.kind === 'partyCalls' && calls && effect.calls !== 'both' && effect.calls !== calls) continue;
      times *= effect.times;
      by.push(spec.name);
    }
  }
  return { times, by };
}

/** What late nights cost now: points of Stress in a week of term, and points off the graduation rate, with the policies that ease them. */
export function lateNights(state: GameState): { stress: number; rating: number; by: string[] } {
  if (!partiesOn(state)) return { stress: 0, rating: 0, by: [] };
  const scene = partyScene(state);
  const policy = policyTimes(state, 'lateNights');
  return {
    stress: Math.round(LATE_NIGHT_STRESS * scene * policy.times * 10) / 10,
    rating: Math.round(LATE_NIGHT_RATING * scene * policy.times * 10) / 10,
    by: policy.by,
  };
}

/** Points late nights add to Stress at a point on the calendar's curve: in term only, never on a break or in the summer. */
export function lateNightStress(state: GameState, curve: number): number {
  if (curve < SEASON_CURVE.term) return 0;
  return lateNights(state).stress;
}

const PARTIES: Pick<PolicySpec, 'id' | 'name'> = { id: 'parties', name: 'Parties' };
const LATE: Pick<PolicySpec, 'id' | 'name'> = { id: 'lateNights', name: 'Late nights' };

/**
 * The party scene's effects, in the shape the policies' are, so the causes and the rating read them through the same
 * hooks and name them on the same lines: "Parties" inside Food & fun, "Late nights" on the graduation rate.
 */
export function partyEffects(state: GameState): Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: PolicyEffect }> {
  if (!partiesOn(state)) return [];
  const late = lateNights(state);
  const out: Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: PolicyEffect }> = [{ spec: PARTIES, effect: { kind: 'cause', cause: 'life', points: PARTY_LIFT, among: 'everyone' } }];
  if (late.rating > 0) out.push({ spec: LATE, effect: { kind: 'rating', input: 'graduation', points: -late.rating, why: `skipped classes after parties${late.by.length > 0 ? `, eased by ${late.by.join(' and ')}` : ''}` } });
  return out;
}

/** How many times as often the calls come now: each kind's policies, and anything the desk set going (a tailgate's drinks). */
export function callTimes(state: GameState, extra: number): { safety: number; medical: number } {
  const lift = 1 + Math.max(0, Math.min(CALLS_MOST, extra));
  return { safety: policyTimes(state, 'partyCalls', 'safety').times * lift, medical: policyTimes(state, 'partyCalls', 'medical').times * lift };
}

/**
 * The chance of a call at one incident check, and the share of it that is the Medical Center's. `perThousand` is the
 * campus's size on the small game's count, in thousands. Nothing outside term.
 */
export function partyCallChance(state: GameState, perThousand: number, curve: number, extra: number): { chance: number; medical: number } {
  if (!partiesOn(state) || curve < SEASON_CURVE.term) return { chance: 0, medical: 0 };
  const times = callTimes(state, extra);
  const medical = PARTY_MEDICAL_SHARE * times.medical;
  const safety = (1 - PARTY_MEDICAL_SHARE) * times.safety;
  const chance = Math.min(0.9, perThousand * PARTY_CALL_RATE * partyScene(state) * (medical + safety));
  return { chance, medical: medical + safety > 0 ? medical / (medical + safety) : 0 };
}

/** The share of calls that come from a chapter house: its members' share of those living on campus, weighted. */
export function chapterCallShare(state: GameState, residents: number, members: number): number {
  if (residents <= 0 || members <= 0) return 0;
  return Math.min(0.8, (CHAPTER_PARTY_WEIGHT * members) / residents);
}
