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
  bedsWanted,
  dormStudents,
  localsAmong,
  localsNeedingBeds,
  shortage,
  studentsWanted,
} from './systems/demand';
export { desirabilityHint, lotStatus, touchesPath, type LotStatus, type StallCause } from './systems/growth';
export { scoreParts, walkPenalty, type ScoreParts } from './systems/desirability';
export { admitPlan, roomForNewStudents, zoneName, type Admit } from './systems/admissions';
export { occupiedBeds } from './systems/money';
export {
  budget,
  careStaffAt,
  careStaffCount,
  facultyCount,
  firstClassArrived,
  hasCareStaff,
  marketingLift,
  staffCount,
  studentsInCircle,
  workerCount,
  type Budget,
  type BudgetGroup,
  type BudgetGroupId,
  type BudgetLine,
} from './systems/budget';
export { housingFixes, roomPlan, waitlistOpen, type HousingFixes, type RoomPlan, type ZonePlan } from './systems/plan';
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
export * from './config/town';
export * from './config/grounds';
export {
  binState,
  breakChance,
  campusClean,
  cleanAt,
  fixText,
  groundsLine,
  isBrokenThing,
  isMessSpot,
  isBrokenLamp,
  lampAt,
  lampReport,
  thingReport,
  moodNear,
  messiestSpot,
  seatingAt,
  spotClean,
  spotFix,
  thingFix,
  wagesPerYear,
  workersAt,
  yardLine,
  yardOver,
  yardStatus,
  type GroundsFix,
  type BreakReport,
  type LampReport,
  type YardStatus,
} from './systems/grounds';
export {
  buildTown,
  driversNow,
  freeTownPlaces,
  hasRoadAccess,
  hoodAdvice,
  hoodAt,
  hoodCapacity,
  hoodWalks,
  offCampusNow,
  ownedAt,
  parcelAt,
  roadReach,
  roadsByAccess,
  startingParcels,
  townLiving,
  townPlaces,
  type HoodLiving,
  type TownPlaces,
} from './systems/town';
export { acceptanceRate, classRecord, spreadClassYears, startedHere } from './systems/admissions';
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
export { PART_WEIGHTS } from './config/students';
export { newGame, type NewGameOptions } from './newGame';
export { calendarAt, dateAt, eventsAt, formatDate, nextMilestone, type CalendarEvent, type CalendarPos, type GameDate, type Phase } from './calendar';
export * from './config/academicCalendar';
export { parseSave, serialize, validate, migrate, SAVE_VERSION, type LoadResult, type SaveFile } from './save';
export * from './selectors';
export * from './format';
export { summarizeAway, type AwayFacts, type AwaySummary } from './digest';
