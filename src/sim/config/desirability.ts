import type { Zone } from '../types';

/**
 * [T] First-playable desirability: green space and walk time only.
 * The full five-input model arrives in layer 3. See DESIGN.md section 8.
 */

/** Every lot starts here before anything nearby is counted. */
export const BASE_SCORE = 30;

/** Quads lift nearby lots. The lift fades to nothing just past the radius. */
export const GREEN_RADIUS = 4;
/** Chosen so one quad cell within two cells is enough to lift either zone to stage 2. */
export const GREEN_PER_CELL: Record<Zone, number> = { housing: 10, academic: 9 };
export const GREEN_CAP: Record<Zone, number> = { housing: 40, academic: 25 };
/** A single tree counts as this share of a quad cell. */
export const TREE_GREEN_SHARE = 0.34;
/** How many kinds of tree the player can pick from. The art supplies one sprite per kind. */
export const TREE_KINDS = 6;

/** Housing reads the walk to the nearest Academic lot, counted along paths. */
export const WALK_MINUTES_PER_CELL = 0.5;
export const WALK_FREE_MINUTES = 8;
export const WALK_PENALTY_PER_MINUTE = 3;
export const WALK_MAX_PENALTY = 30;
