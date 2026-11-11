import type { Zone } from '../types';

/** [T] The first playable uses the starting land only: two parcels by two. */
export const MAP_SIZE = 32;

/**
 * The starter campus, always at the centre of the starting land.
 * A quad, a ring of path around it, a path spine running east to west on both
 * sides, and a few small buildings so the founding class has somewhere to begin.
 */
export const STARTER = {
  quad: { x: 15, y: 15, w: 2, h: 2 },
  ring: { x: 14, y: 14, w: 4, h: 4 },
  spines: [
    { y: 14, x0: 8, x1: 23 },
    { y: 17, x0: 8, x1: 23 },
  ],
  buildings: [
    { zone: 'housing', x: 10, y: 13 },
    { zone: 'housing', x: 11, y: 13 },
    { zone: 'housing', x: 12, y: 13 },
    { zone: 'academic', x: 19, y: 18 },
    { zone: 'academic', x: 20, y: 18 },
    { zone: 'academic', x: 21, y: 18 },
  ] as ReadonlyArray<{ zone: Zone; x: number; y: number }>,
} as const;
