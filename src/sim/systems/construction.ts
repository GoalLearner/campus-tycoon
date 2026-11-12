import { stageSpec, VARIANTS_PER_STAGE } from '../config/buildings';
import { hashInts } from '../rng';
import { addTimer } from '../timers';
import type { Building, GameState, LogEntry } from '../types';
import { markRatesDirty } from './money';

/**
 * Timed builds. The old building keeps serving at its old stage until the new
 * one opens, so growing never tightens a bottleneck. See DESIGN.md section 6.
 */

const ZONE_NOUN = { housing: 'Housing', academic: 'Academic' } as const;

/** Start building a lot up to a stage. The look is fixed now so it never flickers. */
export function startBuild(state: GameState, building: Building, toStage: number): void {
  const spec = stageSpec(building.zone, toStage);
  const doneTick = state.clock.tick + spec.buildTicks;
  const variant = hashInts(state.seed, building.id, toStage) % VARIANTS_PER_STAGE;
  building.rebuild = { toStage, variant, doneTick };
  addTimer(state, doneTick, 'buildDone', building.id);
}

/** A build timer fired: open the new stage. */
export function finishBuild(state: GameState, buildingId: number, log: LogEntry[]): void {
  const b = state.map.buildings[buildingId];
  if (!b || !b.rebuild) return;
  const wasStage = b.stage;
  b.stage = b.rebuild.toStage;
  b.variant = b.rebuild.variant;
  b.rebuild = null;
  // A lot that has just opened a stage may be ready for the next, so growth looks again.
  if (state.map.care?.idle) state.map.care.idle[b.zone] = false;
  markRatesDirty(state);
  const spec = stageSpec(b.zone, b.stage);
  const unit = b.zone === 'housing' ? 'beds' : 'seats';
  log.push({
    tick: state.clock.tick,
    kind: 'built',
    text:
      wasStage === 0
        ? `A new ${ZONE_NOUN[b.zone]} building opened with ${spec.capacity} ${unit}.`
        : `A ${ZONE_NOUN[b.zone]} building grew to stage ${b.stage}: ${spec.capacity} ${unit}.`,
    data: { zone: b.zone, stage: b.stage, x: b.x, y: b.y, capacity: spec.capacity },
  });
}
