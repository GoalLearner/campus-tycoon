import type { Zone } from '../types';

/** One row per stage a zoned lot can reach. Index 0 is stage 1. */
export interface StageSpec {
  /** Beds for Housing, seats for Academic. */
  capacity: number;
  upkeepPerYear: number;
  /** Light, heat and water. A bigger building uses more, and less for each bed or seat. */
  utilitiesPerYear: number;
  /** Real minutes the build or rebuild takes. */
  buildTicks: number;
  /** Desirability a lot needs before it can grow to this stage. */
  desirabilityNeeded: number;
}

/**
 * [T] First playable: two stages, the low density tier.
 * Upkeep per building rises with stage while upkeep per bed or seat falls.
 */
export const STAGES: Record<Zone, readonly StageSpec[]> = {
  housing: [
    { capacity: 12, upkeepPerYear: 10_000, utilitiesPerYear: 5_500, buildTicks: 2, desirabilityNeeded: 20 },
    { capacity: 30, upkeepPerYear: 21_000, utilitiesPerYear: 13_000, buildTicks: 10, desirabilityNeeded: 35 },
  ],
  academic: [
    { capacity: 20, upkeepPerYear: 14_000, utilitiesPerYear: 7_500, buildTicks: 2, desirabilityNeeded: 20 },
    { capacity: 50, upkeepPerYear: 29_000, utilitiesPerYear: 17_000, buildTicks: 10, desirabilityNeeded: 35 },
  ],
};

export const MAX_STAGE = 2;

/** How many looks each zone has per stage. The art manifest must supply this many. */
export const VARIANTS_PER_STAGE = 3;

export function stageSpec(zone: Zone, stage: number): StageSpec {
  const spec = STAGES[zone][stage - 1];
  if (!spec) throw new Error(`No stage ${stage} for zone ${zone}`);
  return spec;
}
