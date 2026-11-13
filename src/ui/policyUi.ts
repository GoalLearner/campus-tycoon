import { nextEra, policiesOpen, policyLocked, policyOn, policyWords, type GameState } from '../sim';

/**
 * Words for the Policies page (DESIGN.md section 41): the third page of the
 * screen that opens from the student count, there once the Growth era has
 * opened it. One row for each switch the game has. A row says the policy's
 * one gain and its one named cost in plain words, and under each what it
 * would be on this campus today, before the switch is touched.
 */

export interface PolicyRow {
  id: string;
  name: string;
  on: boolean;
  /** True while it was changed since the last class moved in: it cannot be changed again until the next one does. */
  locked: boolean;
  /** The gain in plain words, then in this campus's numbers. */
  gain: string;
  gainLines: string[];
  cost: string;
  costLines: string[];
}

export interface PoliciesView {
  rows: PolicyRow[];
  /** What the next era will add, or '' when there is none left. */
  next: string;
}

/** The page, or null on a game with no switch to show: before the Growth era, and on any game with no eras. */
export function policiesView(state: GameState): PoliciesView | null {
  const open = policiesOpen(state);
  if (open.length === 0) return null;
  const rows = open.map((spec) => {
    const words = policyWords(state, spec);
    return { id: spec.id, name: spec.name, on: policyOn(state, spec.id), locked: policyLocked(state, spec.id), gain: spec.gives, gainLines: words.gain, cost: spec.takes, costLines: words.cost };
  });
  return { rows, next: eraNextLine(state) };
}

/** "The Flagship era, at the Top 75, opens two more policies: ..." or '' when no era is left or the next opens nothing. */
export function eraNextLine(state: GameState): string {
  const next = nextEra(state);
  if (!next || next.opens === '') return '';
  return `The ${next.name} era, at the Top ${next.top}, opens ${next.opens}.`;
}

/** The chip under the top bar: nothing until the Growth era, then "Policies", with how many are on. */
export function policyChip(state: GameState): string | null {
  const open = policiesOpen(state);
  if (open.length === 0) return null;
  const on = open.filter((spec) => policyOn(state, spec.id)).length;
  return on === 0 ? 'Policies' : `Policies · ${on} on`;
}
