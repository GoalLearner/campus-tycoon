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
  nextApplicants,
  growthShortage,
  seatsForRoom,
  fallClassDraw,
  nextIntakeSeason,
  bedsWanted,
  dormStudents,
  localsAmong,
  localsNeedingBeds,
  shortage,
  studentsWanted,
  fallApplicants,
  rankLift,
  type ApplicantCause,
  type Applicants,
} from './systems/demand';
export { desirabilityHint, lotStatus, touchesPath, type LotStatus, type StallCause } from './systems/growth';
export { scoreParts, walkPenalty, type ScoreParts } from './systems/desirability';
export { admitPlan, roomForNewStudents, zoneName, type Admit } from './systems/admissions';
export { occupiedBeds } from './systems/money';
export { crowdedNear, crowdLift, playCapacity, playLine, playLoads, playUse, recreationAt, waitMinutes, type PlayUse } from './systems/play';
export { hallName, peopleCounts, personCard, personKey, personName, type PersonCard, type PersonRef } from './systems/people';
export * from './config/people';
export { besideRecreation, diningAt, foodIncomePerYear, foodKindsAt, foodLoads, foodPlaces, foodTrade, foodTypesAt, isFood, mealLoads, mealUse, tutoredAt, tutoringLift, varietyAt, type FoodTrade, type MealUse } from './systems/food';
export {
  budget,
  careStaffAt,
  careStaffCount,
  firstClassArrived,
  hasCareStaff,
  marketingLift,
  marketingCost,
  tuitionRate,
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
  rewardLift,
  decorLift,
  nearestSpot,
  placedAt,
  previewPlace,
  reachCells,
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
  townHints,
  townLiving,
  townPlaces,
  type HoodLiving,
  type TownHint,
  type TownHints,
  type TownPlaces,
} from './systems/town';
export { acceptanceRate, classRecord, spreadClassYears, startedHere, yearAcceptance } from './systems/admissions';
export * from './systems/staffing';
export * from './systems/capacity';
export * from './config/staffing';
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
  studentFigure,
  isVarsity,
  teachingQuality,
  type Relationship,
  type StudentCard,
  type StudentReason,
  type StudentRef,
} from './systems/students';
export type { ArchetypeId, CauseId, DriverId, RelationshipId } from './config/students';
export { CAUSE_NAMES, PART_WEIGHTS, SURNAME_ENDS, SURNAME_STARTS } from './config/students';
export { newGame, DEFAULT_SCHOOL_NAME, modelDistricts, MODEL_CASH_SHARE, MODEL_FULL, MODEL_STUDENTS, type NewGameOptions } from './newGame';
export { MODEL_STAGE, type ModelDistrict } from './modelCampus';
export { scaleOf, smallCount } from './scale';
export {
  activeEntries,
  calendarAt,
  dateAt,
  entrySpan,
  eventsAt,
  formatDate,
  marksAt,
  minuteOfDay,
  minutesToAnchor,
  nextMilestone,
  plainWeek,
  rollWeek,
  shortDate,
  spanOf,
  tickOfDate,
  timeOfTick,
  yearLength,
  type CalendarEvent,
  type CalendarMark,
  type CalendarPos,
  type GameDate,
  type Phase,
} from './calendar';
export * from './config/season';
export * from './config/football';
export * from './systems/field';
export * from './systems/football';
export * from './systems/decisions';
export * from './systems/inbox';
export * from './systems/boosts';
export * from './systems/advisors';
export * from './systems/goals';
export * from './systems/policies';
export * from './systems/policyWords';
export * from './config/policies';
export * from './systems/daily';
export * from './config/daily';
export * from './systems/orders';
export * from './config/orders';
export * from './systems/decor';
export * from './config/decor';
export * from './config/goals';
export * from './newspaper';
export * from './notify';
export * from './config/inbox';
export * from './config/tone';
export { startFootball, newTerm } from './newGame';
export * from './systems/season';
export { campusLevels } from './systems/happiness';
export { placedIncomePerYear } from './systems/placed';
export { anchorFreeAt } from './actions';
export * from './config/academicCalendar';
export { parseSave, serialize, validate, migrate, SAVE_VERSION, type LoadResult, type SaveFile } from './save';
export * from './selectors';
export * from './format';
export { awayLines, datedDays, summarizeAway, type AwayDay, type AwayFacts, type AwayLine, type AwaySummary } from './digest';
export { hashInts } from './rng';
export * from './config/rhythm';
export * from './systems/rhythm';
export * from './config/bigBuilds';
export * from './systems/bigBuilds';
