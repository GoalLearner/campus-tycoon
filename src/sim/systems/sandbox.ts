import type { GameState } from '../types';

/**
 * The sandbox (chaos C5, DESIGN.md 79): a campus to try things on. A copy of the player's campus, or one founded as a
 * sandbox, kept in a save of its own beside the real one (src/app/persistence.ts), which nothing done in the sandbox
 * ever touches. Here only what the flag changes in the game itself: the money never runs out, the trustees never
 * write, and the Meddle menu is free and never rests. Levels, goals and Gold Seals are the sandbox campus's own: it is
 * another state, so nothing it earns or spends reaches the real campus.
 */

/** What a sandbox's purse is kept at: more than anything on the map could cost in one go. */
export const SANDBOX_CASH = 1e12;

export function isSandbox(state: GameState): boolean {
  return state.sandbox === true;
}

/** Turn a campus into a sandbox: the money unlimited, any letter from the trustees withdrawn and its dip forgiven. */
export function makeSandbox(state: GameState): void {
  state.sandbox = true;
  topUp(state);
  if (state.chaos) {
    state.chaos.letter = null;
    state.chaos.dipUntil = -1;
  }
}

/** Keep a sandbox's money unlimited: every tick, and when it is made. */
export function topUp(state: GameState): void {
  if (state.sandbox === true && state.money.cash < SANDBOX_CASH) state.money.cash = SANDBOX_CASH;
}
