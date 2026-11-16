import { APPLY, SPRING_FIRST_YEARS, TRANSFERS, YIELD } from '../config/admissions';
import type { GameState, Season } from '../types';

/**
 * Admissions at real figures (DESIGN.md 70): applications, admits, yield and the class who enrol, first-years and
 * transfers apart. Pure arithmetic on what the game already counts: how many would enrol if there were a place for all
 * of them, how many got one, and the rank. On a game with goals only; the small campus counts as it always did.
 */

/** The rank admissions read: a school not yet ranked counts as 200th. */
export function admissionsRank(state: GameState): number {
  return state.field.rank > 0 ? state.field.rank : 200;
}

const fade = (rank: number, curve: { floor: number; top: number; fade: number }): number => curve.floor + (curve.top - curve.floor) * Math.exp(-(Math.max(1, rank) - 1) / curve.fade);

/** The share of those admitted who enrol, at a rank. */
export function yieldAt(rank: number): number {
  return fade(rank, YIELD);
}

/** Applications for every first-year who would enrol, at a rank. */
export function applyPer(rank: number): number {
  return fade(rank, APPLY);
}

/** A fall intake for every first-year who would enrol: the first-years and the fall's transfers. */
export const FALL_SIZE = 1 + TRANSFERS.share * TRANSFERS.fall;
/** A spring intake for every first-year who would enrol in the fall: a few first-years and the rest of the transfers. */
export const SPRING_SIZE = SPRING_FIRST_YEARS + TRANSFERS.share * (1 - TRANSFERS.fall);

/** The share of an intake who are first-years: most of a fall's, a few of a spring's. */
export function firstYearShare(season: Season): number {
  return season === 'fall' ? 1 / FALL_SIZE : SPRING_FIRST_YEARS / SPRING_SIZE;
}

export interface Pipeline {
  /** First-years: applications, offers of a place, and those who take one. */
  applied: number;
  admitted: number;
  enrolling: number;
  /** The share of those admitted who enrol. */
  yield: number;
  /** Transfers, counted apart, as real admissions offices count them. */
  transfers: { applied: number; admitted: number; enrolling: number };
}

/**
 * An intake as an admissions office counts it (DESIGN.md 70.1). `wanted` would enrol if there were a place for all of
 * them; `placed` have one (now, or on the waitlist for a bed or a seat), at a `rank`, in a `season`. First-years apply
 * at `applyPer(rank)` for every one who would come, and enrol at `yieldAt(rank)` of those admitted, so the office
 * admits as many as fill the places it has: a full campus, or one at its cap, admits fewer and is the more selective.
 */
export function pipeline(wanted: number, placed: number, rank: number, season: Season): Pipeline {
  const share = firstYearShare(season);
  const wantedFirst = Math.round(wanted * share);
  const placedFirst = Math.min(wantedFirst, Math.round(placed * share));
  const y = yieldAt(rank);
  // Applications follow the class the campus takes, and half of the demand past it: a full campus draws more who apply,
  // but a real school holding its class at the top gets ten to fifteen for each place, not one for every would-be.
  const applied = Math.round((placedFirst + (wantedFirst - placedFirst) / 2) * applyPer(rank));
  const admitted = Math.min(applied, Math.round(placedFirst / y));
  const transfersIn = Math.max(0, placed - placedFirst);
  const transfersWanted = Math.max(transfersIn, wanted - wantedFirst);
  const transfersAdmitted = Math.round(transfersIn / TRANSFERS.yield);
  const transfersApplied = Math.max(transfersAdmitted, Math.round(transfersWanted / (TRANSFERS.yield * TRANSFERS.admitted)));
  return { applied, admitted, enrolling: placedFirst, yield: y, transfers: { applied: transfersApplied, admitted: transfersAdmitted, enrolling: transfersIn } };
}

/** "58,400 applied · 46,100 admitted (79%) · 9,500 enrolling (21% yield)": a pipeline in the panel's words. */
export function pipelineWords(p: Pipeline, headCount: (n: number) => string): string {
  const rate = p.applied > 0 ? Math.round((100 * p.admitted) / p.applied) : 0;
  return `${headCount(p.applied)} applied · ${headCount(p.admitted)} admitted (${rate}%) · ${headCount(p.enrolling)} enrolling (${Math.round(p.yield * 100)}% yield)`;
}

/** "and 1,400 transfers (37% of 6,300 admitted)": the transfers' part, or '' when there are none. */
export function transferWords(p: Pipeline, headCount: (n: number) => string): string {
  const t = p.transfers;
  if (t.enrolling <= 0) return '';
  return `${headCount(t.enrolling)} ${t.enrolling === 1 ? 'transfer' : 'transfers'} (${t.applied > 0 ? Math.round((100 * t.admitted) / t.applied) : 0}% of ${headCount(t.applied)} admitted)`;
}
