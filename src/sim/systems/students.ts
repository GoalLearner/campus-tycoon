import { calendarAt, SPRING_INTAKE_TICK_IN_YEAR } from '../calendar';
import { stageSpec } from '../config/buildings';
import { BED_NEED } from '../config/demand';
import { BASE_SCORE, GREEN_CAP } from '../config/desirability';
import { PLACED, SOCIAL_SPOTS_PER_RECREATION } from '../config/placed';
import { crowdedNear, waitMinutes } from './play';
import {
  ARCHETYPE_NAMES,
  CLASS_YEAR_NAMES,
  CLUB_MATCH,
  CLUBS,
  COMMUTER_WEIGHT,
  CONTENT_MOOD,
  FIRST_NAMES,
  GPA_BY_CLASS_YEAR,
  GPA_FLOOR,
  GPA_MAX,
  GPA_MIN,
  GPA_SPAN,
  GPA_SPREAD,
  GPA_TILT,
  HOMESICK_SHARE,
  KIND_AT_ENTRY,
  KIND_LEAN,
  KIND_MOVES,
  KIND_STAYS,
  LOST_SHARE,
  MAJORS,
  MOOD_STEPS,
  NATURE_WEIGHTS,
  NO_CLUB_SHARE,
  QUIRKS,
  RELATIONSHIP_NAMES,
  RELATIONSHIP_NOTES,
  RELATIONSHIP_POINTS,
  RELATIONSHIP_SIDES,
  SEATS_COMFORTABLE,
  SOCIAL_SWING,
  SOCIAL_THIN,
  STUDENTS_PER_SOCIAL_SPOT,
  SUPER_SENIOR_SHARE,
  SURNAME_ENDS,
  SURNAME_STARTS,
  TEACHING_WEIGHTS,
  TEMPERAMENT_SPREAD,
  THOUGHTS,
  type ArchetypeId,
  type CauseId,
  type DriverId,
  type RelationshipId,
  type RelationshipKind,
} from '../config/students';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, Zone } from '../types';
import { approvalAt, partLevel, type Approval, type Cause } from './happiness';
import { townLiving } from './town';
import { socialTables } from './grounds';
import { SOCIAL_SPOTS_PER_TABLE } from '../config/grounds';

/**
 * The student card. Students are cohorts in the simulation and nothing is
 * stored per student. A card is worked out when it is opened, from two things:
 *
 * - who the student is: a seeded identity, fixed by the game's seed, the year
 *   they entered and their place in that class. Name, major, nature, quirk and
 *   club come from it, so the same student always reads the same.
 * - how the campus is doing right now: class year from the cohorts, grades
 *   from the teaching side of campus, happiness from the causes of approval at
 *   the spot where that student lives.
 *
 * Nothing here runs during a tick, draws from a random stream or changes the
 * state. See DESIGN.md section 13.8.
 */

/** Who a student is: the year their class entered, and their place in it. */
export interface StudentRef {
  entryYear: number;
  index: number;
}

export function studentKey(ref: StudentRef): string {
  return `${ref.entryYear}:${ref.index}`;
}

// One salt per trait, so traits do not move together.
const SALT = { first: 1, start: 2, end: 3, major: 4, nature: 5, phase: 6, quirk: 7, club: 8, noClub: 9, bed: 10, lives: 11, room: 12, grade: 13, mood: 14, look: 15, line: 16, room2: 17, tie: 18, kind: 19, stays: 20, moves: 21, side: 22, wait: 23 } as const;

/** A number in [0, 1) that is always the same for this student and this trait. */
function roll(seed: number, ref: StudentRef, salt: number, semester?: number): number {
  const hash = semester === undefined ? hashInts(seed, ref.entryYear, ref.index, salt) : hashInts(seed, ref.entryYear, ref.index, salt, semester);
  return hash / 4294967296;
}

function pickFrom<T>(items: readonly T[], at: number): T {
  return items[Math.min(items.length - 1, Math.floor(at * items.length))]!;
}

function pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>, at: number): T {
  let total = 0;
  for (const [, weight] of items) total += weight;
  let left = at * total;
  for (const [item, weight] of items) {
    left -= weight;
    if (left < 0) return item;
  }
  return items[items.length - 1]![0];
}

/** 0 for a freshman to 3 for a senior, or null when no such student is enrolled now. */
export function classYearOf(state: GameState, ref: StudentRef): number | null {
  const classYear = calendarAt(state.clock.tick).year - ref.entryYear;
  if (!Number.isInteger(ref.index) || ref.index < 0 || classYear < 0 || classYear > 3) return null;
  return ref.index < state.cohorts[classYear]! ? classYear : null;
}

/** Students to draw walkers from: up to `perClass` from each class year. */
export function sampleStudents(state: GameState, perClass = 400): StudentRef[] {
  const year = calendarAt(state.clock.tick).year;
  const out: StudentRef[] = [];
  for (let classYear = 0; classYear < 4; classYear++) {
    const size = Math.min(perClass, state.cohorts[classYear]!);
    for (let index = 0; index < size; index++) out.push({ entryYear: year - classYear, index });
  }
  return out;
}

/** Open buildings of one zone, with a running total of their beds or seats, so a number picks a building. */
export interface PlaceIndex {
  /** Cell index of each building. */
  cells: number[];
  /** Capacity up to and including each building. */
  upTo: number[];
  total: number;
}

export function placeIndex(state: GameState, zone: Zone): PlaceIndex {
  const cells: number[] = [];
  const upTo: number[] = [];
  let total = 0;
  for (const b of state.map.buildings) {
    if (!b || b.zone !== zone || b.stage < 1) continue;
    total += stageSpec(zone, b.stage).capacity;
    cells.push(b.y * state.map.width + b.x);
    upTo.push(total);
  }
  return { cells, upTo, total };
}

function placeAt(index: PlaceIndex, at: number): number | null {
  if (index.total <= 0) return null;
  const target = at * index.total;
  let low = 0;
  let high = index.upTo.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (index.upTo[mid]! > target) high = mid;
    else low = mid + 1;
  }
  return index.cells[low] ?? null;
}

/** True for a student who needs a bed on campus. The rest commute. */
function livesOnCampus(seed: number, ref: StudentRef): boolean {
  return roll(seed, ref, SALT.lives) < BED_NEED;
}

/**
 * The cell of the dorm a student lives in, or null for a commuter. Pass the
 * housing index when asking for many students at once.
 */
export function studentHome(state: GameState, ref: StudentRef, housing = placeIndex(state, 'housing')): number | null {
  if (!livesOnCampus(state.seed, ref)) return null;
  return placeAt(housing, roll(state.seed, ref, SALT.bed));
}

/** A number that picks the student's look, for the walker's sprite and the card's portrait. */
export function studentLook(state: GameState, ref: StudentRef): number {
  return hashInts(state.seed, ref.entryYear, ref.index, SALT.look);
}

// ------------------------------------------------------------ happiness --

/** 4 is delighted, 0 is miserable. */
function moodOf(score: number): number {
  for (let i = 0; i < MOOD_STEPS.length; i++) if (score >= MOOD_STEPS[i]!) return MOOD_STEPS.length - i;
  return 0;
}

function minutes(walk: number): string {
  const whole = Math.max(1, Math.round(walk));
  return whole === 1 ? '1 minute' : `${whole} minutes`;
}

// --------------------------------------------------------------- grades --

/** How good the teaching side of campus is right now, 0 to 1: how pleasant the Academic lots are, and how much room classes have. */
export function teachingQuality(state: GameState): number {
  const { cells, score, buildings } = state.map;
  let sum = 0;
  let count = 0;
  for (const b of buildings) {
    if (!b || b.zone !== 'academic' || b.stage < 1) continue;
    sum += score[b.y * state.map.width + b.x] ?? 0;
    count += 1;
  }
  if (count === 0 || cells.length === 0) return 0;
  const lots = Math.max(0, Math.min(1, (sum / count - BASE_SCORE) / GREEN_CAP.academic));
  const seats = openCapacity(state, 'academic');
  const taken = seats > 0 ? enrollment(state) / seats : 1;
  const room = 1 - Math.max(0, Math.min(1, (taken - SEATS_COMFORTABLE) / (1 - SEATS_COMFORTABLE)));
  return TEACHING_WEIGHTS.lots * lots + TEACHING_WEIGHTS.room * room;
}

// --------------------------------------------------------- relationship --

/**
 * How much there is to do with other people, 0 to 1, with 0.5 as middling.
 * It counts quad cells and recreation buildings against enrollment. Student
 * Life spots and events join the count when they are built.
 */
export function socialLife(state: GameState): number {
  const students = enrollment(state);
  if (students === 0) return 0.5;
  let spots = 0;
  for (const cell of state.map.cells) if (cell.kind === 'quad') spots += 1;
  for (const placed of state.map.placed) {
    if (placed && PLACED[placed.type].family === 'recreation') spots += SOCIAL_SPOTS_PER_RECREATION;
  }
  // A picnic table near dining or a lecture hall is somewhere to meet.
  spots += socialTables(state) * SOCIAL_SPOTS_PER_TABLE;
  const level = Math.max(0, Math.min(1, (0.5 * spots * STUDENTS_PER_SOCIAL_SPOT) / students));
  // In steps, so a handful of students arriving or leaving does not reshuffle anyone's status.
  return Math.round(level * 20) / 20;
}

/** Semesters since the game began: it steps at every fall and spring intake. */
export function semesterOf(state: GameState): number {
  const { year, tickInYear } = calendarAt(state.clock.tick);
  return Math.max(0, (year - 1) * 2 + (tickInYear >= SPRING_INTAKE_TICK_IN_YEAR ? 1 : 0));
}

export interface Relationship {
  id: RelationshipId;
  name: string;
  /** A short note for the card: its small effect on this student, or a hint when social life is thin. */
  note: string;
  /** Points of happiness it adds or takes for this one student. */
  points: number;
}

function leaning(odds: ReadonlyArray<readonly [RelationshipKind, number]>, nature: ArchetypeId): Array<readonly [RelationshipKind, number]> {
  const lean = KIND_LEAN[nature];
  return odds.map(([kind, weight]) => [kind, weight * (lean?.[kind] ?? 1)] as const);
}

/**
 * A student's status in one semester. The kind (single, together, far apart)
 * follows the student's own seeded story, one step per intake. The side
 * (happy or not) is rolled each semester against the campus's social life.
 * Nothing is stored: the story is replayed from the semester they arrived.
 */
export function relationshipOf(seed: number, ref: StudentRef, semester: number, nature: ArchetypeId, social: number): Relationship {
  const arrived = Math.max(0, (ref.entryYear - 1) * 2);
  let kind = pickWeighted(leaning(KIND_AT_ENTRY, nature), roll(seed, ref, SALT.kind, arrived));
  for (let s = arrived + 1; s <= semester; s++) {
    if (roll(seed, ref, SALT.stays, s) < KIND_STAYS) continue;
    kind = pickWeighted(leaning(KIND_MOVES[kind], nature), roll(seed, ref, SALT.moves, s));
  }
  const happy = roll(seed, ref, SALT.side, semester) < 0.5 + SOCIAL_SWING * (social - 0.5);
  const id = RELATIONSHIP_SIDES[kind][happy ? 0 : 1];
  let note: string = happy ? RELATIONSHIP_NOTES.happier : RELATIONSHIP_NOTES.lessHappy;
  if (id === 'singleLooking' && social < SOCIAL_THIN) note = RELATIONSHIP_NOTES.thin;
  return { id, name: RELATIONSHIP_NAMES[id], note, points: happy ? RELATIONSHIP_POINTS : -RELATIONSHIP_POINTS };
}


// ----------------------------------------------------------------- card --

export interface StudentReason {
  cause: CauseId;
  /** The part of that cause the thought is about, such as dining inside "Food & fun". */
  part: DriverId;
  /** True when the student is naming something they like. */
  positive: boolean;
  thought: string;
  /** The cell of the building the thought is about. */
  cell: number;
}

export interface StudentCard {
  ref: StudentRef;
  name: string;
  /** 0 for a freshman to 3 for a senior. */
  classYear: number;
  classYearName: string;
  major: string;
  archetype: ArchetypeId;
  archetypeName: string;
  quirk: string;
  /** The dorm's cell, or null for a commuter. */
  home: number | null;
  /** Where they live, for the card's first line. */
  residence: 'dorm' | 'offCampus';
  /** The street a student living off campus lives on. null in a dorm, or when nobody lives in town yet. */
  street: string | null;
  /** On a 4.0 scale, to one decimal. */
  gpa: number;
  /** null for a student in no club. */
  club: string | null;
  /** The sixth line. Shown on the card only. */
  relationship: Relationship;
  /** 0 to 100, the same scale as approval. It includes the small personal push of the relationship status. */
  happiness: number;
  /** 4 is delighted, 0 is miserable. */
  mood: number;
  /** null only on a campus with no building for the student to be unhappy about. */
  reason: StudentReason | null;
}

function natureOf(seed: number, ref: StudentRef, resident: boolean): ArchetypeId {
  const at = roll(seed, ref, SALT.nature);
  if (resident) return pickWeighted(NATURE_WEIGHTS, at);
  // Commuters are mostly Commuters, and never Resident Advisors.
  const others = NATURE_WEIGHTS.filter(([id]) => id !== 'ra');
  return pickWeighted([['commuter', COMMUTER_WEIGHT] as const, ...others], at);
}

function clubOf(seed: number, ref: StudentRef, nature: ArchetypeId, group: string, quirk: string): string | null {
  if (roll(seed, ref, SALT.noClub) < (NO_CLUB_SHARE[nature] ?? NO_CLUB_SHARE.default)) return null;
  const weighted = CLUBS.map((club) => {
    let weight = 1;
    if (club.groups?.some((g) => g === group)) weight *= CLUB_MATCH.group;
    if (club.natures?.includes(nature)) weight *= CLUB_MATCH.nature;
    if (club.quirk === quirk) weight *= CLUB_MATCH.quirk;
    return [club.name, weight] as const;
  });
  return pickWeighted(weighted, roll(seed, ref, SALT.club));
}

/** The phase a student is in this year, laid over their lasting nature. */
function archetypeNow(state: GameState, ref: StudentRef, classYear: number, nature: ArchetypeId, resident: boolean): ArchetypeId {
  const at = roll(state.seed, ref, SALT.phase);
  if (classYear === 0) {
    const fall = calendarAt(state.clock.tick).phase === 'fall';
    const lost = fall ? LOST_SHARE.fall : LOST_SHARE.later;
    const homesick = resident ? (fall ? HOMESICK_SHARE.fall : HOMESICK_SHARE.later) : 0;
    if (at < lost) return 'lost';
    if (at < lost + homesick) return 'homesick';
    // Nobody runs a dorm floor in their first year.
    if (nature === 'ra') return 'butterfly';
  }
  if (classYear === 3) {
    const seatsShort = state.admissions.lastIntake?.bottleneck === 'academic';
    if (at < (seatsShort ? SUPER_SENIOR_SHARE.seatsShort : SUPER_SENIOR_SHARE.normal)) return 'superSenior';
  }
  return nature;
}

/**
 * Approval over the places a student spends their days: each cause is the
 * average of its level at those places.
 */
function approvalOver(state: GameState, spots: readonly number[]): Approval {
  const each = spots.map((spot) => approvalAt(state, spot));
  const first = each[0];
  if (!first) return { score: 0, causes: [], walkMinutes: -1 };
  const causes = first.causes.map((cause, i) => ({
    ...cause,
    level: each.reduce((sum, one) => sum + (one.causes[i]?.level ?? 0), 0) / each.length,
    parts: cause.parts.map((part, j) => ({
      ...part,
      level: each.reduce((sum, one) => sum + (one.causes[i]?.parts[j]?.level ?? 0), 0) / each.length,
    })),
  }));
  return { score: each.reduce((sum, one) => sum + one.score, 0) / each.length, causes, walkMinutes: first.walkMinutes };
}

/** The share of students in a crowded building's reach who have the wait on their mind. */
const WAIT_TALK_SHARE = 0.34;

/** How a student names the recreation building they waited at. */
const PLAY_NAMES: Partial<Record<string, string>> = { courts: 'a court', field: 'the field', pool: 'the pool', track: 'the track', gym: 'the gym' };

function reasonFor(state: GameState, ref: StudentRef, spots: readonly number[], resident: boolean, approval: Approval, content: boolean): StudentReason | null {
  // A line at a court is something people talk about, pleased with the place or not: about one in three
  // of the students a crowded building reaches has the wait on their mind.
  if (roll(state.seed, ref, SALT.wait) < WAIT_TALK_SHARE) {
    const width = state.map.width;
    for (const candidate of spots) {
      const crowded = crowdedNear(state, candidate % width, Math.floor(candidate / width));
      if (!crowded) continue;
      const pool = resident ? THOUGHTS.recreationCrowded : THOUGHTS.commuterRecreationCrowded;
      const place = PLAY_NAMES[crowded.placed.type] ?? PLACED[crowded.placed.type].name.toLowerCase();
      const line = pickFrom(pool, roll(state.seed, ref, SALT.line));
      const at = crowded.placed.y * width + crowded.placed.x;
      return { cause: 'life', part: 'recreation', positive: false, thought: line.replace('{w}', `${waitMinutes(crowded.use)} minutes`).replace('{place}', place), cell: at };
    }
  }
  // A content student names the biggest plus. Anyone else names what would help most.
  const size = (cause: Cause): number => cause.weight * (content ? cause.level : 1 - cause.level);
  let best = -1;
  for (const cause of approval.causes) best = Math.max(best, size(cause));
  // Causes that are as good as tied take turns, by student, so a dorm does not speak with one voice.
  const tied = approval.causes.filter((cause) => size(cause) >= best - 0.05);
  if (tied.length === 0) return null;
  const chosen = pickFrom(tied, roll(state.seed, ref, SALT.tie));
  // Inside the cause, the thought is about one part: the best when they are pleased, the weakest when
  // not, so it always names something to build. Parts that are as good as tied take turns too.
  const edgeOfParts = chosen.parts.reduce((found, part) => (content ? Math.max(found, part.level) : Math.min(found, part.level)), content ? -1 : 2);
  const part = pickFrom(chosen.parts.filter((one) => Math.abs(one.level - edgeOfParts) <= 0.05), roll(state.seed, ref, SALT.tie)).id;
  // The thought is about one building: the best of their places when they are pleased, the worst when not.
  let spot = spots[0]!;
  let edge = content ? -1 : 2;
  for (const candidate of spots) {
    const level = partLevel(approvalAt(state, candidate).causes, part) ?? 0;
    if (content ? level > edge : level < edge) {
      edge = level;
      spot = candidate;
    }
  }
  let pool: readonly string[];
  if (part === 'walk') pool = content ? THOUGHTS.walkGood : approval.walkMinutes < 0 ? THOUGHTS.walkNone : THOUGHTS.walkLong;
  else if (part === 'green') pool = resident ? (content ? THOUGHTS.greenGood : THOUGHTS.greenLow) : content ? THOUGHTS.commuterGreenGood : THOUGHTS.commuterGreenLow;
  else if (part === 'dining') pool = resident ? (content ? THOUGHTS.diningGood : THOUGHTS.diningLow) : content ? THOUGHTS.commuterDiningGood : THOUGHTS.commuterDiningLow;
  else if (part === 'recreation') pool = resident ? (content ? THOUGHTS.recreationGood : THOUGHTS.recreationLow) : content ? THOUGHTS.commuterRecreationGood : THOUGHTS.commuterRecreationLow;
  else if (part === 'clean') pool = resident ? (content ? THOUGHTS.cleanGood : THOUGHTS.cleanLow) : content ? THOUGHTS.commuterCleanGood : THOUGHTS.commuterCleanLow;
  else if (part === 'seating') pool = resident ? (content ? THOUGHTS.seatingGood : THOUGHTS.seatingLow) : content ? THOUGHTS.commuterSeatingGood : THOUGHTS.commuterSeatingLow;
  else pool = resident ? (content ? THOUGHTS.safetyGood : THOUGHTS.safetyLow) : content ? THOUGHTS.commuterSafetyGood : THOUGHTS.commuterSafetyLow;
  // Something to do is in reach, and there is a line for it: the thought is the wait, not the lack.
  let wait = '';
  let place = '';
  if (part === 'recreation' && !content) {
    const width = state.map.width;
    const crowded = crowdedNear(state, spot % width, Math.floor(spot / width));
    if (crowded) {
      pool = resident ? THOUGHTS.recreationCrowded : THOUGHTS.commuterRecreationCrowded;
      wait = `${waitMinutes(crowded.use)} minutes`;
      place = PLAY_NAMES[crowded.placed.type] ?? PLACED[crowded.placed.type].name.toLowerCase();
    }
  }
  const line = pickFrom(pool, roll(state.seed, ref, SALT.line));
  return { cause: chosen.id, part, positive: content, thought: line.replace('{m}', minutes(approval.walkMinutes)).replace('{w}', wait).replace('{place}', place), cell: spot };
}

/** The street a student living off campus lives on: one of the neighbourhoods with students in it, more often a fuller one. */
function streetOf(state: GameState, ref: StudentRef): string | null {
  const hoods = townLiving(state).filter((hood) => hood.living > 0);
  const total = hoods.reduce((sum, hood) => sum + hood.living, 0);
  if (total === 0) return null;
  let at = roll(state.seed, ref, SALT.bed) * total;
  for (const hood of hoods) {
    at -= hood.living;
    if (at < 0) return hood.name;
  }
  return hoods[hoods.length - 1]!.name;
}

/** Everything the card shows, or null when no such student is enrolled now. */
export function studentCard(state: GameState, ref: StudentRef): StudentCard | null {
  const classYear = classYearOf(state, ref);
  if (classYear === null) return null;
  const seed = state.seed;

  const first = pickFrom(FIRST_NAMES, roll(seed, ref, SALT.first));
  const last = pickFrom(SURNAME_STARTS, roll(seed, ref, SALT.start)) + pickFrom(SURNAME_ENDS, roll(seed, ref, SALT.end));
  const major = pickFrom(MAJORS, roll(seed, ref, SALT.major));
  const quirk = pickFrom(QUIRKS, roll(seed, ref, SALT.quirk));

  const home = studentHome(state, ref);
  const resident = home !== null;
  // Who lives on campus is part of who the student is. Someone whose dorm is not built yet still counts.
  const nature = natureOf(seed, ref, livesOnCampus(seed, ref));
  const archetype = archetypeNow(state, ref, classYear, nature, resident);

  const relationship = relationshipOf(seed, ref, semesterOf(state), nature, socialLife(state));

  // Happiness is read where the student spends their days: the dorm, or for a commuter two lecture halls.
  let spots: number[] = [];
  if (home !== null) {
    spots = [home];
  } else {
    const halls = placeIndex(state, 'academic');
    for (const salt of [SALT.room, SALT.room2]) {
      const hall = placeAt(halls, roll(seed, ref, salt));
      if (hall !== null && !spots.includes(hall)) spots.push(hall);
    }
  }
  let happiness = 50;
  let reason: StudentReason | null = null;
  if (spots.length > 0) {
    const approval = approvalOver(state, spots);
    const temperament = (roll(seed, ref, SALT.mood) * 2 - 1) * TEMPERAMENT_SPREAD;
    // The status nudges this one student. It is never offered as the reason: that stays something the player can change.
    happiness = Math.max(0, Math.min(100, Math.round(approval.score + temperament + relationship.points)));
    reason = reasonFor(state, ref, spots, resident, approval, moodOf(happiness) >= CONTENT_MOOD);
  }

  const raw =
    GPA_FLOOR +
    GPA_SPAN * teachingQuality(state) +
    (roll(seed, ref, SALT.grade) * 2 - 1) * GPA_SPREAD +
    (GPA_TILT[archetype] ?? 0) +
    (GPA_BY_CLASS_YEAR[classYear] ?? 0);
  const gpa = Math.round(Math.max(GPA_MIN, Math.min(GPA_MAX, raw)) * 10) / 10;

  return {
    ref,
    name: `${first} ${last}`,
    classYear,
    classYearName: CLASS_YEAR_NAMES[classYear]!,
    major: major.name,
    archetype,
    archetypeName: ARCHETYPE_NAMES[archetype],
    quirk,
    home,
    residence: resident ? 'dorm' : 'offCampus',
    street: resident ? null : streetOf(state, ref),
    gpa,
    club: clubOf(seed, ref, nature, major.group, quirk),
    relationship,
    happiness,
    mood: moodOf(happiness),
    reason,
  };
}
