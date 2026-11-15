import { dateAt } from '../calendar';
import {
  CHAOS_FROM,
  CHAOS_KINDS,
  CHAOS_RATE,
  CHAOS_REACH_MOST,
  CHAOS_SMOOTH,
  CHAOS_STEPS,
  CHAOS_WEIGHT,
  DRAMA_WEIGHT,
  GAME_DAY_TEMPER,
  GRAFFITI_BILL,
  HEADLINE_REACH,
  LETTER,
  MAX_ACTIVE_CHAOS,
  MISSED_EXTRA,
  PROTEST_TICKS,
  REACH_FADE_WEEKS,
  RIVALRY_PRANKS,
  ROWDY,
  FREE_REIN,
  SPIRIT,
  SPIRIT_REACH,
  TENSION,
  type ChaosKind,
  type ChaosStep,
  type ProtestTopic,
} from '../config/chaos';
import { CHAOS_LINES, PROTEST_LINES } from '../config/chaosLines';
import { INCIDENT_EVAL_TICKS, RESPONSE_BASE_TICKS, RESPONSE_TICKS_PER_CELL } from '../config/incidents';
import { POLICIES } from '../config/policies';
import { WEB_WEEK_TICKS } from '../config/web';
import { dollars } from '../format';
import { nextFloat } from '../rng';
import { scaleOf, smallCount } from '../scale';
import { enrollment, openCapacity } from '../selectors';
import type { ChaosState, ChaosWeek, GameState, Incident, LogEntry } from '../types';
import { foodKindsAt } from './food';
import { homeGameNow } from './football';
import { coverFor } from './incidents';
import { mischiefTimes } from './policies';

/**
 * The chaos sandbox, stop C1 (DESIGN.md 68). Chaos comes from how the campus is run: short tempers where Stress is high,
 * Happiness low, the dorms crowded and the web full of drama; pranks and graffiti where Campus Safety does not reach;
 * protests about what is wrong. The Chaos meter reads them once a game week, for every thousand students, and moves a
 * share of the way to what it reads, so one wild night does not swing it. It costs a little (bad headlines, repairs, the
 * trustees' letters) and gives a little (a legendary night lifts spirit). Every effect is capped and fades.
 *
 * On a game with goals only, as parties are: the small campus of before is untouched. Chaos draws on a random stream
 * of its own and keeps its incidents apart from the incidents of before, so nothing else turns out differently.
 */

const ZERO = (): Record<ChaosKind, number> => ({ dustUp: 0, shouting: 0, prank: 0, graffiti: 0, protest: 0, party: 0 });

export function newChaos(): ChaosState {
  return {
    level: CHAOS_FROM[1]!,
    week: -1,
    tally: ZERO(),
    missed: ZERO(),
    last: null,
    tension: 1,
    covered: 1,
    grievance: null,
    reach: [],
    letter: null,
    letters: { sent: 0, met: 0, missed: 0, lastClosed: -1_000_000 },
    dipUntil: -1,
    spiritAt: -1_000_000,
  };
}

/** True on a campus with chaos: a game with goals. */
export function chaosOn(state: GameState): boolean {
  return !!state.goals && !!state.chaos;
}

/** The step a level reads: 0 for Serene to 5 for Pandemonium. */
export function chaosStepOf(level: number): number {
  let step = 0;
  for (let i = 0; i < CHAOS_FROM.length; i++) if (level >= CHAOS_FROM[i]!) step = i;
  return step;
}

export function chaosStepName(level: number): ChaosStep {
  return CHAOS_STEPS[chaosStepOf(level)]!;
}

/** True in the week before the rivalry game, when pranks run high. */
export function rivalryWeek(state: GameState): boolean {
  const date = dateAt(state.clock);
  return date.month === 11 && date.day >= 21 && date.day <= 28;
}

// ---------------------------------------------------------------- what sets it going --

/**
 * At each incident check (DESIGN.md 68.2): whether a dust-up, a shouting match, a prank, graffiti or a protest begins.
 * The same draws are made whatever happens, from chaos's own stream, so the outcome is the same watched or away.
 */
export function spawnChaos(state: GameState): void {
  if (!chaosOn(state) || state.clock.tick % INCIDENT_EVAL_TICKS !== 0) return;
  const rng = state.rng;
  const rolls = [nextFloat(rng, 'chaos'), nextFloat(rng, 'chaos'), nextFloat(rng, 'chaos'), nextFloat(rng, 'chaos'), nextFloat(rng, 'chaos')];
  const pick = nextFloat(rng, 'chaos');
  const line = nextFloat(rng, 'chaos');
  const students = enrollment(state);
  if (students === 0) return;
  const c = state.chaos;
  const book = state.incidents;
  let active = 0;
  let protesting = false;
  for (const one of book.active) {
    if (!one.chaos) continue;
    active += 1;
    if (one.chaos === 'protest') protesting = true;
  }
  if (active >= MAX_ACTIVE_CHAOS) return;
  const scale = smallCount(state, students) / 1000;
  // Free rein where Campus Safety does not reach the dorms.
  const rein = FREE_REIN.reached + (FREE_REIN.none - FREE_REIN.reached) * (1 - c.covered);
  const temper = homeGameNow(state) ? GAME_DAY_TEMPER : 1;
  const quiet = mischiefTimes(state);
  const half = 0.5 + 0.5 * c.tension;
  const chances: Array<[Exclude<ChaosKind, 'party'>, number]> = [
    ['dustUp', CHAOS_RATE.dustUp * scale * c.tension * rein * temper],
    ['shouting', CHAOS_RATE.shouting * scale * c.tension * temper * quiet],
    ['prank', CHAOS_RATE.prank * scale * half * rein * quiet * (rivalryWeek(state) ? RIVALRY_PRANKS : 1)],
    ['graffiti', CHAOS_RATE.graffiti * scale * half * rein],
    ['protest', protesting || !c.grievance ? 0 : CHAOS_RATE.protest * scale * c.grievance.strength],
  ];
  // One a check at most: the first that comes up.
  for (let k = 0; k < chances.length; k++) {
    const [kind, chance] = chances[k]!;
    if (rolls[k]! >= Math.min(0.9, chance)) continue;
    begin(state, kind, pick, line);
    return;
  }
}

/** Begin a chaos incident at a dorm, or for a protest on the quad by a lecture hall. */
function begin(state: GameState, kind: Exclude<ChaosKind, 'party'>, pick: number, line: number): void {
  const zone = kind === 'protest' ? 'academic' : 'housing';
  const places = state.map.buildings.filter((b) => b && b.zone === zone && b.stage > 0);
  if (places.length === 0) return;
  const where = places[Math.min(places.length - 1, Math.floor(pick * places.length))]!;
  const book = state.incidents;
  const tick = state.clock.tick;
  const topic = kind === 'protest' ? (state.chaos.grievance?.topic ?? 'beds') : undefined;
  const lines = kind === 'protest' ? PROTEST_LINES[topic!] : CHAOS_LINES[kind];
  // A protest has no responder: the students say their piece and go home. Campus Safety answers the rest.
  const cover = kind === 'protest' ? null : coverFor(state.map, 'safety', where.x, where.y);
  const incident: Incident = {
    id: book.nextId,
    kind: 'mischief',
    x: where.x,
    y: where.y,
    place: kind === 'protest' ? 'the quad' : 'a dorm',
    line: Math.floor(line * lines.length),
    startTick: tick,
    responder: cover ? cover.placed.id : null,
    endTick: kind === 'protest' ? tick + PROTEST_TICKS : tick + (cover ? RESPONSE_BASE_TICKS + Math.ceil(cover.cells * RESPONSE_TICKS_PER_CELL) : 45),
    chaos: kind,
    ...(topic ? { topic } : {}),
  };
  book.active.push(incident);
  book.nextId += 1;
}

/**
 * Before the incidents of a tick end: chaos counts what ends now, for the meter, and pays to paint over graffiti.
 * Calls from parties are counted too: they are the meter's party chaos.
 */
export function countEnding(state: GameState): void {
  if (!chaosOn(state)) return;
  const tick = state.clock.tick;
  const c = state.chaos;
  for (const incident of state.incidents.active) {
    if (incident.endTick > tick) continue;
    const kind: ChaosKind | null = incident.chaos ?? (incident.party ? 'party' : null);
    if (!kind) continue;
    c.tally[kind] += 1;
    if (incident.responder === null && kind !== 'protest') c.missed[kind] += 1;
    if (kind === 'graffiti') state.money.cash -= GRAFFITI_BILL * scaleOf(state);
  }
}

// ---------------------------------------------------------------- the meter --

/** The share of students in the web's drama, as the app last read it. */
function dramaShare(state: GameState): number {
  const effects = state.web?.effects;
  if (!effects) return 0;
  return Math.max(0, Math.min(1, (effects.split ?? 0) + (effects.rival ?? 0) + (effects.bullied ?? 0)));
}

/**
 * Read once a game week, for the rates: tension, how much of the dorms Campus Safety reaches, and what students would
 * protest about. Kept light: a pass over the dorms and the cached Stress and Happiness.
 */
function readInputs(state: GameState): void {
  const c = state.chaos;
  const dorms = state.map.buildings.filter((b): b is NonNullable<typeof b> => !!b && b.zone === 'housing' && b.stage > 0);
  let covered = 0;
  let fed = 0;
  for (const dorm of dorms) {
    if (coverFor(state.map, 'safety', dorm.x, dorm.y)) covered += 1;
    if (foodKindsAt(state.map, dorm.x, dorm.y) > 0) fed += 1;
  }
  c.covered = dorms.length > 0 ? covered / dorms.length : 1;
  // Students waiting for a bed: the halls are full and the next ones in are turned to a waitlist.
  const beds = openCapacity(state, 'housing');
  const waiting = beds > 0 ? Math.min(1, (state.admissions?.waitlist ?? 0) / beds) : 0;
  const stress = state.term?.lastStress ?? 0;
  const happiness = state.admissions?.lastSemester?.happiness ?? 70;
  const unhappy = Math.max(0, Math.min(1.5, (70 - happiness) / 30));
  c.tension = Math.max(TENSION.least, Math.min(TENSION.most, TENSION.base + TENSION.stress * (stress / 50) + TENSION.unhappy * unhappy + TENSION.uncovered * (1 - c.covered) + TENSION.waiting * waiting + TENSION.drama * dramaShare(state)));
  // What students would protest about: campus things only, the strongest.
  const topics: Array<{ topic: ProtestTopic; strength: number; words: string }> = [];
  if (waiting > 0) topics.push({ topic: 'beds', strength: Math.min(1, waiting * 5), words: 'more beds' });
  if (dorms.length > 0 && fed < dorms.length) topics.push({ topic: 'food', strength: Math.min(1, ((dorms.length - fed) / dorms.length) * 1.5), words: 'food in reach of every hall' });
  const hated = POLICIES.find((spec) => state.policies?.on.includes(spec.id) && spec.costs.some((cost) => cost.kind === 'cause' && cost.points < 0 && !cost.among));
  if (hated) topics.push({ topic: 'policy', strength: 0.35, words: `an end to ${hated.name.toLowerCase()}` });
  topics.sort((a, b) => b.strength - a.strength);
  c.grievance = topics[0] && topics[0].strength >= 0.15 ? topics[0] : null;
}

/** What a week read, before smoothing: each kind for every thousand students, and the web's drama. */
function weekReading(tally: Record<ChaosKind, number>, missed: Record<ChaosKind, number>, thousands: number, drama: number): number {
  let raw = DRAMA_WEIGHT * drama;
  for (const kind of CHAOS_KINDS) raw += (CHAOS_WEIGHT[kind] * (tally[kind] + MISSED_EXTRA * missed[kind])) / thousands;
  return Math.min(100, raw);
}

/** Once a game week: the meter is read, and what it sets going (DESIGN.md 68.3 to 68.5). */
export function stepChaos(state: GameState, log: LogEntry[]): void {
  if (!chaosOn(state)) return;
  const c = state.chaos;
  const week = Math.floor(state.clock.tick / WEB_WEEK_TICKS);
  if (week === c.week) return;
  if (c.week < 0) {
    c.week = week;
    readInputs(state);
    return;
  }
  const students = enrollment(state);
  const thousands = Math.max(0.05, smallCount(state, students) / 1000);
  const drama = dramaShare(state);
  const raw = weekReading(c.tally, c.missed, thousands, drama);
  const before = chaosStepOf(c.level);
  c.level = Math.max(0, Math.min(100, c.level + CHAOS_SMOOTH * (raw - c.level)));
  const after = chaosStepOf(c.level);
  const last: ChaosWeek = { tally: c.tally, missed: c.missed, drama, thousands, raw, topic: c.grievance?.topic ?? null };
  c.last = last;
  c.tally = ZERO();
  c.missed = ZERO();
  c.week = week;
  readInputs(state);
  consequences(state, log, before, after);
}

// ---------------------------------------------------------------- what it costs and gives --

/** Applicants' reach from chaos's headlines, bad and good, fading, never past the cap either way. */
export function chaosReach(state: GameState): number {
  if (!chaosOn(state)) return 0;
  const tick = state.clock.tick;
  let reach = 0;
  for (const one of state.chaos.reach) {
    const age = tick - one.at;
    const left = Math.max(0, 1 - age / (REACH_FADE_WEEKS * WEB_WEEK_TICKS));
    reach += one.size * left;
  }
  return Math.max(-CHAOS_REACH_MOST, Math.min(CHAOS_REACH_MOST, reach));
}

/** Happiness from a legendary night (DESIGN.md 68.5), for some real days after it: 0 when there was none lately. */
export function spiritPoints(state: GameState): number {
  return chaosOn(state) && state.clock.tick < state.chaos.spiritAt + SPIRIT.days * 24 * 60 ? SPIRIT.happiness : 0;
}

/** Points off Reputation while a trustees' letter ignored is remembered. */
export function trusteesDip(state: GameState): number {
  return chaosOn(state) && state.chaos.dipUntil > state.clock.tick ? LETTER.dip : 0;
}

function consequences(state: GameState, log: LogEntry[], before: number, after: number): void {
  const c = state.chaos;
  const tick = state.clock.tick;
  const day = 24 * 60;
  c.reach = c.reach.filter((one) => tick - one.at < REACH_FADE_WEEKS * WEB_WEEK_TICKS);
  const name = CHAOS_STEPS[after]!;
  // The meter changing step is news.
  if (after !== before) {
    const why = causes(state).slice(0, 2).map((cause) => cause.text.toLowerCase());
    log.push({ tick, kind: 'chaos', text: `The Chaos meter reads ${name}${why.length > 0 ? `: ${why.join('; ')}` : ''}.`, data: { step: after, was: before } });
  }
  // A Rowdy week or worse makes headlines, and applicants read them.
  if (after >= ROWDY) c.reach.push({ at: tick, size: -HEADLINE_REACH * (after - ROWDY + 1) });
  // The trustees' letter: one at a time, and a rest between.
  if (c.letter) {
    if (after < ROWDY) {
      c.letter = null;
      c.letters.met += 1;
      c.letters.lastClosed = tick;
      state.money.cash += LETTER.reward * scaleOf(state);
      log.push({ tick, kind: 'chaos', text: `The trustees write again: the campus has calmed down, below Rowdy in time. A gift of thanks, ${dollars(LETTER.reward * scaleOf(state))}, is in the bank.`, data: { letter: 2 } });
    } else if (tick >= c.letter.until) {
      c.letter = null;
      c.letters.missed += 1;
      c.letters.lastClosed = tick;
      c.dipUntil = tick + LETTER.dipWeeks * WEB_WEEK_TICKS;
      log.push({ tick, kind: 'chaos', text: `The trustees are unimpressed: the campus is still ${name}. Reputation is ${LETTER.dip} points lower in the academic rating for a while.`, data: { letter: 3 } });
    }
  } else if (after >= ROWDY && tick - c.letters.lastClosed >= LETTER.rest * day) {
    c.letter = { from: tick, until: tick + LETTER.days * day };
    c.letters.sent += 1;
    log.push({ tick, kind: 'chaos', text: `A letter from the trustees: the campus is ${name}. They ask that the Chaos meter be below Rowdy within ${LETTER.days} days.`, data: { letter: 1, until: c.letter.until } });
  }
  // Good chaos: a Lively campus, happy and looked after, now and then has a legendary night.
  const happiness = state.admissions?.lastSemester?.happiness ?? 0;
  // Drawn every week whatever happens, from chaos's own stream.
  const roll = nextFloat(state.rng, 'chaos');
  if (after === 2 && happiness >= SPIRIT.least && c.covered >= 0.6 && tick - c.spiritAt >= day && roll < SPIRIT.chance) {
    c.spiritAt = tick;
    c.reach.push({ at: tick, size: SPIRIT_REACH });
    log.push({ tick, kind: 'chaos', text: 'A legendary night: the whole campus out on the quad until late, and nobody worse for it. Spirit is up, and the word is out: Most Spirited Campus.', data: { spirit: 1 } });
  }
}

// ---------------------------------------------------------------- the causes --

export interface ChaosCause {
  kind: ChaosKind | 'drama';
  /** Its part of the week's reading, in points. */
  points: number;
  /** What it is and what would ease it: "Dust-ups where Campus Safety does not reach: build Campus Safety nearer the halls". */
  text: string;
}

/** The causes of last week's reading, biggest first, each in words that say what to do (DESIGN.md 68.3). */
export function causes(state: GameState): ChaosCause[] {
  const last = state.chaos?.last;
  if (!last) return [];
  const out: ChaosCause[] = [];
  const uncovered = (kind: ChaosKind): boolean => last.tally[kind] > 0 && last.missed[kind] / last.tally[kind] >= 0.3;
  for (const kind of CHAOS_KINDS) {
    const points = (CHAOS_WEIGHT[kind] * (last.tally[kind] + MISSED_EXTRA * last.missed[kind])) / last.thousands;
    if (points <= 0) continue;
    out.push({ kind, points, text: causeText(state, kind, uncovered(kind)) });
  }
  if (last.drama > 0) out.push({ kind: 'drama', points: DRAMA_WEIGHT * last.drama, text: 'Drama in the social web, breakups, rivals and students picked on: an anti-bullying policy and places to meet ease it' });
  return out.sort((a, b) => b.points - a.points);
}

function causeText(state: GameState, kind: ChaosKind, uncovered: boolean): string {
  switch (kind) {
    case 'dustUp':
      return uncovered ? 'Dust-ups where Campus Safety does not reach: build Campus Safety nearer the halls' : 'Dust-ups from short tempers: Stress, crowded halls and drama run them high';
    case 'shouting':
      return 'Shouting matches in the halls: quiet hours and less Stress calm them';
    case 'prank':
      return uncovered ? 'Pranks where Campus Safety does not reach: build Campus Safety nearer the halls' : rivalryWeek(state) ? 'Pranks in rivalry week: Campus Safety near the halls keeps them few' : 'Pranks in the halls: Campus Safety in reach and quiet hours keep them few';
    case 'graffiti':
      return 'Graffiti where Campus Safety does not reach: every one costs a repaint';
    case 'protest': {
      const g = state.chaos.grievance;
      return g ? `Protests for ${g.words}` : 'Protests about the campus: what students ask for is in the paper';
    }
    case 'party':
      return 'Calls from parties: party registration, alcohol education or a dry campus cut them';
  }
}

/** The Chaos meter as the Scorecard shows it (DESIGN.md 68.3). null on a campus without chaos. */
export function chaosView(state: GameState): { step: ChaosStep; level: number; causes: string[]; letter: string | null } | null {
  if (!chaosOn(state)) return null;
  const c = state.chaos;
  const list = causes(state).slice(0, 3).map((cause) => cause.text);
  const tick = state.clock.tick;
  const letter = c.letter ? `The trustees ask for it below Rowdy within ${Math.max(1, Math.ceil((c.letter.until - tick) / 60))} hours` : c.dipUntil > tick ? `Reputation is ${LETTER.dip} points lower for a letter from the trustees that went unanswered` : null;
  return { step: chaosStepName(c.level), level: Math.round(c.level), causes: list.length > 0 ? list : ['Nothing much: a quiet week'], letter };
}
