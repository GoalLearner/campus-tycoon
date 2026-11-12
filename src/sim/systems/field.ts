import {
  ARC_CHANCE,
  ARC_STEP,
  ARC_YEARS,
  DRIFT_PULL,
  DRIFT_SHOCK,
  FIELD_MEAN,
  FIELD_SIZE,
  FIELD_SPREAD,
  NAME_BLOCKLIST,
  NICKNAMES,
  PEDIGREE_DRIFT,
  PLACE_ENDS,
  PLACE_STARTS,
  RATING_MAX,
  RATING_MIN,
  SCHOOL_PATTERNS,
} from '../config/football';
import { RETENTION_FLOOR, RETENTION_SPAN } from '../config/demand';
import { nextFloat, nextInt } from '../rng';
import type { Field, GameState, LogEntry, RngState, School } from '../types';
import { acceptanceRate, startedHere } from './admissions';
import { crowding } from './season';

/**
 * The national field (DESIGN.md section 11): the 199 other schools the
 * player is ranked against. Made once from the game's own random stream and
 * stored. Each has a long-run pedigree and a current rating, for academics
 * and for football. Ratings drift every year, and the field as a whole never
 * rises, so standing is not a treadmill.
 */

// Adding 0 turns a negative zero into a plain one: a save cannot tell them apart, so the state must not either.
const round1 = (value: number): number => Math.round(value * 10) / 10 + 0;
const clampRating = (value: number): number => Math.max(RATING_MIN, Math.min(RATING_MAX, value));

/** Roughly bell-shaped, from -1 to 1. */
function bell(rng: RngState): number {
  return (nextFloat(rng, 'football') + nextFloat(rng, 'football') + nextFloat(rng, 'football')) / 1.5 - 1;
}

function pickWeighted(rng: RngState, items: ReadonlyArray<readonly [string, number]>): string {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = nextFloat(rng, 'football') * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return items[0]![0];
}

/** An invented place: "Larkmere". Never one on the blocklist. */
function place(rng: RngState): string {
  for (;;) {
    const name = PLACE_STARTS[nextInt(rng, 'football', PLACE_STARTS.length)]! + PLACE_ENDS[nextInt(rng, 'football', PLACE_ENDS.length)]!;
    if (!NAME_BLOCKLIST.includes(name.toLowerCase())) return name;
  }
}

/** Make the field. `mine` is the player's own school name, which no other school may share. */
export function makeField(rng: RngState, mine: string): Field {
  const schools: School[] = [];
  const taken = new Set<string>([mine.trim().toLowerCase()]);
  while (schools.length < FIELD_SIZE - 1) {
    const name = pickWeighted(rng, SCHOOL_PATTERNS).replace('{p}', place(rng));
    if (taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    const ap = clampRating(FIELD_MEAN + bell(rng) * FIELD_SPREAD * 2);
    const fp = clampRating(FIELD_MEAN + bell(rng) * FIELD_SPREAD * 2);
    schools.push({
      name,
      nick: NICKNAMES[nextInt(rng, 'football', NICKNAMES.length)]!,
      ap: round1(ap),
      ar: round1(clampRating(ap + (nextFloat(rng, 'football') * 2 - 1) * 5)),
      fp: round1(fp),
      fr: round1(clampRating(fp + (nextFloat(rng, 'football') * 2 - 1) * 5)),
      aa: 0,
      an: 0,
      fa: 0,
      fn: 0,
      w: 0,
      l: 0,
      off: Array.from({ length: 7 }, () => Math.round((nextFloat(rng, 'football') * 2 - 1) * 100) / 100 + 0),
    });
  }
  recentre(schools, 'ar');
  recentre(schools, 'fr');
  return { schools, reputation: 0, academic: 0, rank: 0, rankYear: 0, moved: null };
}

/** Slide every rating by the same amount so the field's average is where it began. The field never rises. */
function recentre(schools: School[], key: 'ar' | 'fr'): void {
  let sum = 0;
  for (const school of schools) sum += school[key];
  const shift = FIELD_MEAN - sum / schools.length;
  for (const school of schools) school[key] = round1(clampRating(school[key] + shift));
}

/** The average rating of the field. It should sit at FIELD_MEAN for good. */
export function fieldAverage(field: Field, key: 'ar' | 'fr'): number {
  let sum = 0;
  for (const school of field.schools) sum += school[key];
  return sum / field.schools.length;
}

/**
 * A year passes for every school: each rating is pulled back toward its
 * pedigree, knocked about a little, and carried by any rise or fall it is in
 * the middle of. Now and then a school begins one. About a thousand small
 * sums a game year.
 */
export function driftField(field: Field, rng: RngState): void {
  const before = academicOrder(field);
  for (const school of field.schools) {
    for (const [rate, ped, arc, left] of [
      ['ar', 'ap', 'aa', 'an'],
      ['fr', 'fp', 'fa', 'fn'],
    ] as const) {
      if (school[left] <= 0 && nextFloat(rng, 'football') < ARC_CHANCE) {
        school[left] = ARC_YEARS[0] + nextInt(rng, 'football', ARC_YEARS[1] - ARC_YEARS[0] + 1);
        school[arc] = nextFloat(rng, 'football') < 0.5 ? ARC_STEP : -ARC_STEP;
      }
      const step = school[left] > 0 ? school[arc] : 0;
      if (school[left] > 0) school[left] -= 1;
      const shock = (nextFloat(rng, 'football') * 2 - 1) * DRIFT_SHOCK;
      school[rate] = clampRating(school[rate] + DRIFT_PULL * (school[ped] - school[rate]) + shock + step);
      // A rise that lasts lifts the pedigree a little with it.
      school[ped] = round1(clampRating(school[ped] + (nextFloat(rng, 'football') * 2 - 1) * PEDIGREE_DRIFT + step * 0.15));
    }
  }
  recentre(field.schools, 'ar');
  recentre(field.schools, 'fr');
  // Who moved most in the academic order: rankings day tells it.
  const after = academicOrder(field);
  let up = 0;
  let upBy = 0;
  let down = 0;
  let downBy = 0;
  for (let id = 0; id < field.schools.length; id++) {
    const change = before[id]! - after[id]!;
    if (change > upBy) {
      up = id;
      upBy = change;
    }
    if (-change > downBy) {
      down = id;
      downBy = -change;
    }
  }
  field.moved = { up, upBy, down, downBy };
}

/** Each school's place among the field's own schools for academics: the list is by school, and 1 is the best. */
function academicOrder(field: Field): number[] {
  const order = field.schools.map((school, id) => ({ id, ar: school.ar })).sort((a, b) => b.ar - a.ar || a.id - b.id);
  const place = new Array<number>(field.schools.length).fill(0);
  order.forEach((entry, n) => {
    place[entry.id] = n + 1;
  });
  return place;
}

// ------------------------------------------------------------ academics --

export interface AcademicInput {
  id: 'graduation' | 'classSize' | 'retention' | 'selectivity' | 'reputation';
  name: string;
  /** Its share of the rating when every input exists, out of 100. */
  weight: number;
  /** 0 to 100. null when the campus has nothing to read it from yet. */
  level: number | null;
  /** The number behind it, in words. */
  detail: string;
}

/**
 * The player's academic rating, with its visible weights (DESIGN.md 24.4).
 * Alumni success and money per student do not exist yet, and an input with
 * nothing to read shares its weight among the ones that have.
 */
export function academicInputs(state: GameState): AcademicInput[] {
  // Graduation: of the classes that began here and have had four years, the share that finished.
  let entered = 0;
  let finished = 0;
  for (const record of state.classes) {
    if (!startedHere(record) || record.entryYear > state.clock.week.year - 4) continue;
    entered += record.entered;
    finished += record.finishedOnTime + record.finishedLate;
  }
  const graduation = entered > 0 ? finished / entered : null;
  const accept = acceptanceRate(state);
  const room = 1 - crowding(state);
  // Retention as the four causes of Happiness give it, between its floor and its ceiling.
  const last = state.admissions.lastSemester;
  const retention = last ? Math.max(0, Math.min(1, last.happiness / 100)) : null;
  return [
    { id: 'graduation', name: 'Graduation rate', weight: 25, level: graduation === null ? null : 100 * Math.max(0, Math.min(1, (graduation - 0.4) / 0.55)), detail: graduation === null ? 'No class has had four years yet' : `${Math.round(graduation * 100)}% of a class finishes` },
    { id: 'classSize', name: 'Class size', weight: 15, level: 100 * room, detail: room >= 1 ? 'Classes have room' : `Classes are ${Math.round((1 - room) * 100)}% of the way to full` },
    { id: 'reputation', name: 'Reputation', weight: 15, level: state.field.rankYear > 0 ? state.field.reputation : null, detail: state.field.rankYear > 0 ? 'A slow average of past ratings' : 'Builds from the first rankings day' },
    { id: 'retention', name: 'Retention', weight: 10, level: retention === null ? null : 100 * retention, detail: retention === null ? 'No semester has ended yet' : `${(100 * (RETENTION_FLOOR + RETENTION_SPAN * retention)).toFixed(1)}% return each semester` },
    { id: 'selectivity', name: 'Selectivity', weight: 10, level: accept === null ? null : 100 * Math.max(0, Math.min(1, (1 - accept) / 0.7)), detail: accept === null ? 'No class has been admitted yet' : `${Math.round(accept * 100)}% of applicants are admitted` },
  ];
}

/** The weighted sum of the inputs that exist, on the field's 0 to 100. */
export function academicRating(state: GameState): number {
  let sum = 0;
  let weights = 0;
  for (const input of academicInputs(state)) {
    if (input.level === null) continue;
    sum += input.level * input.weight;
    weights += input.weight;
  }
  // A campus is measured against schools from 8 to 96, so its 0 to 100 is squeezed into that range.
  const level = weights > 0 ? sum / weights : 30;
  return round1(RATING_MIN + (level / 100) * (RATING_MAX - RATING_MIN));
}

/** Where a rating would stand among the 200: 1 is the best. */
export function rankAmong(field: Field, key: 'ar' | 'fr', rating: number): number {
  let better = 0;
  for (const school of field.schools) if (school[key] > rating) better += 1;
  return better + 1;
}

/**
 * A letter grade for one of the player's numbers against the field: the
 * field's schools spread around the middle by their own fixed offsets.
 * `level` is 0 to 100 and `stage` picks which offset each school uses.
 */
export function gradeAgainstField(field: Field, level: number, stage: number): string {
  let below = 0;
  for (const school of field.schools) {
    const theirs = school.ar + (school.off[stage] ?? 0) * 12;
    if (theirs < RATING_MIN + (level / 100) * (RATING_MAX - RATING_MIN)) below += 1;
  }
  const share = below / field.schools.length;
  const grades: Array<[number, string]> = [[0.93, 'A'], [0.85, 'A-'], [0.75, 'B+'], [0.62, 'B'], [0.5, 'B-'], [0.38, 'C+'], [0.27, 'C'], [0.17, 'C-'], [0.08, 'D']];
  for (const [floor, grade] of grades) if (share >= floor) return grade;
  return 'F';
}

/** How fast reputation follows the school's own rating: three tenths of the way each year. It stops the rank from jumping. */
const REPUTATION_PULL = 0.3;

/**
 * Rankings day, at the anchor of day 5: the academic rating is worked out
 * from its inputs, placed among the 200, and told with who moved. When the
 * player falls while standing still, it says who passed them.
 */
export function rankingsDay(state: GameState, log: LogEntry[]): void {
  if (state.admissions.lastIntake === null) return;
  const field = state.field;
  const rating = academicRating(state);
  const rank = rankAmong(field, 'ar', rating);
  const first = field.rankYear === 0;
  const was = field.rank;
  const wasRating = field.academic;
  const inputs = academicInputs(state).filter((input) => input.level !== null);
  let weakest = inputs[0];
  for (const input of inputs) if (weakest && (input.level ?? 0) < (weakest.level ?? 0)) weakest = input;

  let text = first
    ? `Rankings day. ${state.school.name} enters the national rankings at No. ${rank} of 200 for academics.`
    : `Rankings day. ${state.school.name} is No. ${rank} of 200 for academics, ${rank < was ? `up ${was - rank}` : rank > was ? `down ${rank - was}` : 'where it was'}${rank !== was ? (Math.abs(rank - was) === 1 ? ' place' : ' places') : ''}.`;
  if (!first && rank > was && rating >= wasRating - 0.5) {
    // Standing still and falling: name one of the schools that went past.
    const passers = field.schools.filter((school) => school.ar > rating && school.ar - rating < 6).sort((a, b) => a.ar - b.ar);
    const rising = passers.find((school) => school.an > 0 && school.aa > 0) ?? passers[0];
    if (rising) text += ` The rating held at ${Math.round(rating)}, and ${rank - was === 1 ? 'one school' : `${rank - was} schools`} went past, ${rising.name} among them${rising.an > 0 && rising.aa > 0 ? ', on a climb of several years' : ''}.`;
  }
  if (field.moved && field.moved.upBy > 0) {
    const up = field.schools[field.moved.up];
    const down = field.schools[field.moved.down];
    if (up && down) text += ` Around the country, ${up.name} climbed ${field.moved.upBy} places and ${down.name} fell ${field.moved.downBy}.`;
  }
  if (weakest) text += ` The weakest part of the rating is ${weakest.name.toLowerCase()}: ${weakest.detail.charAt(0).toLowerCase()}${weakest.detail.slice(1)}.`;
  log.push({ tick: state.clock.tick, kind: 'rankings', text, data: { keep: 1, rank, rating } });

  // Reputation follows the rating slowly, from the level the rating itself had this year.
  const level = ((rating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;
  field.reputation = round1(first ? level : field.reputation + REPUTATION_PULL * (level - field.reputation));
  field.academic = rating;
  field.rank = rank;
  field.rankYear = state.clock.week.year;
}
