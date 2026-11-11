/** The simulation's public surface. Everything outside src/sim imports from here. */

export * from './types';
export * from './config/time';
export * from './config/buildings';
export * from './config/money';
export * from './config/map';
export * from './config/demand';
export * from './config/desirability';
export { advance } from './advance';
export { applyAction, previewPaint, rowBetween, type Action, type ActionResult, type PaintPreview, type Point, type Tool } from './actions';
export {
  averageDesirability,
  bottleneck,
  capacityWanted,
  continuingStudents,
  demandBar,
  expectedClass,
  fallClassDraw,
  nextIntakeSeason,
  shortage,
  studentsThatFit,
  studentsWanted,
} from './systems/demand';
export { desirabilityHint, lotStatus, touchesPath, type LotStatus, type StallCause } from './systems/growth';
export { scoreParts, walkPenalty, type ScoreParts } from './systems/desirability';
export { roomForNewStudents, zoneName } from './systems/admissions';
export { roomPlan, waitlistOpen, type RoomPlan, type ZonePlan } from './systems/plan';
export {
  approvalAt,
  classYearOf,
  placeIndex,
  sampleStudents,
  studentCard,
  studentHome,
  studentKey,
  studentLook,
  teachingQuality,
  type Approval,
  type Cause,
  type StudentCard,
  type StudentReason,
  type StudentRef,
} from './systems/students';
export type { ArchetypeId, CauseId } from './config/students';
export { newGame, type NewGameOptions } from './newGame';
export { calendarAt, eventsAt, nextMilestone, type CalendarEvent, type CalendarPos, type Phase } from './calendar';
export { parseSave, serialize, validate, migrate, SAVE_VERSION, type LoadResult, type SaveFile } from './save';
export * from './selectors';
export * from './format';
export { summarizeAway, type AwayFacts, type AwaySummary } from './digest';
