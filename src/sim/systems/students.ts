import { calendarAt } from '../calendar';
import { stageSpec } from '../config/buildings';
import { BED_NEED } from '../config/demand';
import { BASE_SCORE, GREEN_CAP, WALK_MAX_PENALTY } from '../config/desirability';
import {
  ARCHETYPE_NAMES,
  CAUSE_WEIGHTS,
  CLASS_YEAR_NAMES,
  CLUB_MATCH,
  CLUBS,
  COMMUTER_WEIGHT,
  CONTENT_MOOD,
  FIRST_NAMES,
  GPA_FLOOR,
  GPA_SPAN,
  GPA_SPREAD,
  GPA_TILT,
  GRADE_STEPS,
  HOMESICK_SHARE,
  LOST_SHARE,
  MAJORS,
  MOOD_STEPS,
  NATURE_WEIGHTS,
  NO_CLUB_SHARE,
  QUIRKS,
  SEATS_COMFORTABLE,
  SUPER_SENIOR_SHARE,
  SURNAME_ENDS,
  SURNAME_STARTS,
  TEACHING_WEIGHTS,
  TEMPERAMENT_SPREAD,
  THOUGHTS,
  type ArchetypeId,
  type CauseId,
} from '../config/students';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, Zone } from '../types';
import { scoreParts } from './desirability';

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
const SALT = { first: 1, start: 2, end: 3, major: 4, nature: 5, phase: 6, quirk: 7, club: 8, noClub: 9, bed: 10, lives: 11, room: 12, grade: 13, mood: 14, look: 15, line: 16, room2: 17, tie: 18 } as const;

/** A number in [0, 1) that is always the same for this student and this trait. */
function roll(seed: number, ref: StudentRef, salt: number): number {
  return hashInts(seed, ref.entryYear, ref.index, salt) / 4294967296;
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

export interface Cause {
  id: CauseId;
  /** 0 is as bad as it gets, 1 is as good. */
  level: number;
  weight: number;
}

export interface Approval {
  /** 0 to 100. */
  score: number;
  causes: Cause[];
  /** Minutes to class from here. -1 when there is no route or this is not Housing. */
  walkMinutes: number;
}

/**
 * Approval at one lot, with its causes. Campus approval, when it is built, is
 * the average of this over where students live, so a card and the campus
 * number can never disagree.
 */
export function approvalAt(state: GameState, cell: number): Approval {
  const map = state.map;
  const zone = map.cells[cell]?.zone ?? null;
  if (zone === null) return { score: 0, causes: [], walkMinutes: -1 };
  const x = cell % map.width;
  const y = (cell - x) / map.width;
  const walkMinutes = zone === 'housing' ? (map.walkMinutes[cell] ?? -1) : -1;
  const parts = scoreParts(map, x, y, zone, walkMinutes);

  const causes: Cause[] = [];
  // The walk is from a dorm to class, so only a dorm has it.
  if (zone === 'housing') causes.push({ id: 'walk', level: 1 - parts.walkPenalty / WALK_MAX_PENALTY, weight: CAUSE_WEIGHTS.walk });
  causes.push({ id: 'green', level: parts.green / GREEN_CAP[zone], weight: CAUSE_WEIGHTS.green });

  let sum = 0;
  let weights = 0;
  for (const cause of causes) {
    sum += cause.level * cause.weight;
    weights += cause.weight;
  }
  return { score: weights === 0 ? 0 : (100 * sum) / weights, causes, walkMinutes };
}

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

function letter(gpa: number): string {
  for (const [least, grade] of GRADE_STEPS) if (gpa >= least) return grade;
  return 'D';
}

// ----------------------------------------------------------------- card --

export interface StudentReason {
  cause: CauseId;
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
  grade: string;
  /** null for a student in no club. */
  club: string | null;
  /** 0 to 100, the same scale as approval. */
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
  }));
  return { score: each.reduce((sum, one) => sum + one.score, 0) / each.length, causes, walkMinutes: first.walkMinutes };
}

function reasonFor(state: GameState, ref: StudentRef, spots: readonly number[], resident: boolean, approval: Approval, content: boolean): StudentReason | null {
  // A content student names the biggest plus. Anyone else names what would help most.
  const size = (cause: Cause): number => cause.weight * (content ? cause.level : 1 - cause.level);
  let best = -1;
  for (const cause of approval.causes) best = Math.max(best, size(cause));
  // Causes that are as good as tied take turns, by student, so a dorm does not speak with one voice.
  const tied = approval.causes.filter((cause) => size(cause) >= best - 0.05);
  if (tied.length === 0) return null;
  const chosen = pickFrom(tied, roll(state.seed, ref, SALT.tie));
  // The thought is about one building: the best of their places when they are pleased, the worst when not.
  let spot = spots[0]!;
  let edge = content ? -1 : 2;
  for (const candidate of spots) {
    const level = approvalAt(state, candidate).causes.find((cause) => cause.id === chosen.id)?.level ?? 0;
    if (content ? level > edge : level < edge) {
      edge = level;
      spot = candidate;
    }
  }
  let pool: readonly string[];
  if (chosen.id === 'walk') pool = content ? THOUGHTS.walkGood : approval.walkMinutes < 0 ? THOUGHTS.walkNone : THOUGHTS.walkLong;
  else if (resident) pool = content ? THOUGHTS.greenGood : THOUGHTS.greenLow;
  else pool = content ? THOUGHTS.commuterGreenGood : THOUGHTS.commuterGreenLow;
  const line = pickFrom(pool, roll(state.seed, ref, SALT.line));
  return { cause: chosen.id, positive: content, thought: line.replace('{m}', minutes(approval.walkMinutes)), cell: spot };
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
    happiness = Math.max(0, Math.min(100, Math.round(approval.score + temperament)));
    reason = reasonFor(state, ref, spots, resident, approval, moodOf(happiness) >= CONTENT_MOOD);
  }

  const gpa = GPA_FLOOR + GPA_SPAN * teachingQuality(state) + (roll(seed, ref, SALT.grade) * 2 - 1) * GPA_SPREAD + (GPA_TILT[archetype] ?? 0);

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
    grade: letter(gpa),
    club: clubOf(seed, ref, nature, major.group, quirk),
    happiness,
    mood: moodOf(happiness),
    reason,
  };
}
