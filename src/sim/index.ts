/** The simulation's public surface. Everything outside src/sim imports from here. */

export * from './types';
export * from './config/time';
export * from './config/buildings';
export * from './config/money';
export * from './config/map';
export * from './config/demand';
export * from './config/desirability';
export { advance } from './advance';
export { applyAction, previewPaint, refundFor, rowBetween, type Action, type ActionResult, type PaintPreview, type Point, type Tool } from './actions';
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
export { approvalAt, campusHappiness, partLevel, retentionRate, type Approval, type CampusHappiness, type Cause, type CausePart } from './systems/happiness';
export {
  fedAt,
  inReach,
  libraryLift,
  nearestSpot,
  placedAt,
  previewPlace,
  reachCells,
  recreationAt,
  storeIncomePerYear,
  storePassers,
  type PlacePreview,
  type PlaceProblem,
} from './systems/placed';
export * from './config/placed';
export { acceptanceRate, classRecord } from './systems/admissions';
export { coverFor, incidentText, safetyAt } from './systems/incidents';
export * from './config/incidents';
export {
  classYearOf,
  placeIndex,
  relationshipOf,
  sampleStudents,
  semesterOf,
  socialLife,
  studentCard,
  studentHome,
  studentKey,
  studentLook,
  teachingQuality,
  type Relationship,
  type StudentCard,
  type StudentReason,
  type StudentRef,
} from './systems/students';
export type { ArchetypeId, CauseId, DriverId, RelationshipId } from './config/students';
export { newGame, type NewGameOptions } from './newGame';
export { calendarAt, dateAt, eventsAt, formatDate, nextMilestone, type CalendarEvent, type CalendarPos, type GameDate, type Phase } from './calendar';
export * from './config/academicCalendar';
export { parseSave, serialize, validate, migrate, SAVE_VERSION, type LoadResult, type SaveFile } from './save';
export * from './selectors';
export * from './format';
export { summarizeAway, type AwayFacts, type AwaySummary } from './digest';
