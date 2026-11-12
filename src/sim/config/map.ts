import type { PlacedType, Zone } from '../types';

/** The side of the starting land, in cells: two parcels by two. The whole map is WORLD in config/town.ts. */
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
  /**
   * A walk from the south spine east to the campus edge, where the town's main
   * street runs. It joins the campus to the first neighbourhood, so the
   * founding class's locals can walk in. New campuses only.
   */
  townLink: { y: 17, x0: 24, x1: 31 },
  buildings: [
    { zone: 'housing', x: 10, y: 13 },
    { zone: 'housing', x: 11, y: 13 },
    { zone: 'housing', x: 12, y: 13 },
    { zone: 'academic', x: 19, y: 18 },
    { zone: 'academic', x: 20, y: 18 },
    { zone: 'academic', x: 21, y: 18 },
  ] as ReadonlyArray<{ zone: Zone; x: number; y: number }>,
  /**
   * Hand-placed buildings the campus begins with: a dining hall behind the
   * first dorms, so they can grow, and the Administration building between
   * the two walks east of the quad. Both leave the walks free to extend.
   */
  placed: [
    { type: 'dining', x: 10, y: 12 },
    { type: 'admin', x: 20, y: 15 },
    // Two bins beside the dining hall, and no yard: the first full bin is the lesson.
    { type: 'bin', x: 9, y: 12 },
    { type: 'bin', x: 12, y: 12 },
    // The stadium's plot, two cells by three, reserved from the start (DESIGN.md 10.2). It stands apart, north-east
    // of the first buildings, where a home crowd's noise reaches no dorm, and can be moved while it is bare.
    { type: 'stadium', x: 27, y: 9 },
  ] as ReadonlyArray<{ type: PlacedType; x: number; y: number }>,
} as const;
