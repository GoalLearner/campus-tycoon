import {
  DISCOVERY_CASH,
  DISCOVERY_HOURS,
  DISCOVERY_QUIPS,
  DISCOVERY_XP,
  FINDING_CASH,
  FINDING_XP,
  FINDINGS_PER_HOUR,
  LAB_CASH_SHARE,
  LAB_FUNDING_STEP,
  LAB_HOURS,
  LAB_READY,
  LAB_REPUTATION,
  LAB_SEAT_REACH,
  LAB_SEATS_FLOOR,
  LAB_SEATS_FULL,
  LABS,
  type LabSpec,
} from '../config/labs';
import { stageSpec } from '../config/buildings';
import { ORDER_CASH_YEAR } from '../config/orders';
import { PLACED } from '../config/placed';
import { INSTRUCTION_FULL } from '../config/staffing';
import { TICKS_PER_HOUR } from '../config/time';
import { dollars, shortName } from '../format';
import { hashInts } from '../rng';
import { scaleOf } from '../scale';
import { addTimer, cancelTimers } from '../timers';
import type { Discovery, GameState, Labs, LogEntry, Placed, PlacedType } from '../types';
import { gainXp, hasDaily } from './daily';
import { ordersCount } from './orders';
import { instructionStep } from './staffing';

/**
 * The research labs (DESIGN.md 42.6, as built in section 49). A lab is a
 * placed building of the family 'lab', one for each field, on a game with
 * goals. Findings bank up from the time since it was last collected, at a
 * rate set by the faculty funding and the lecture-hall seats in its reach,
 * up to 36 hours' worth: worked out when asked, as collecting is (42.4). A
 * discovery is made by the lab itself on a timer, reported in the paper, and
 * kept for good. Everything here is a bonus.
 */

export function newLabs(): Labs {
  return { since: {}, found: [], findings: 0, paid: 0, paidYear: 0 };
}

export function labSpec(type: PlacedType): LabSpec | undefined {
  return LABS.find((spec) => spec.type === type);
}

export function isLab(type: PlacedType): boolean {
  return PLACED[type].family === 'lab';
}

/** The labs on the map, in the order of their fields. */
export function labsOnMap(state: GameState): Placed[] {
  const out: Placed[] = [];
  for (const placed of state.map.placed) if (placed && PLACED[placed.type].family === 'lab') out.push(placed);
  return out.sort((a, b) => LABS.findIndex((spec) => spec.type === a.type) - LABS.findIndex((spec) => spec.type === b.type));
}

/** True when a lab of this field stands. */
export function labOf(state: GameState, type: PlacedType): Placed | null {
  return labsOnMap(state).find((placed) => placed.type === type) ?? null;
}

/** Why a lab cannot be built here now, or null when it can. */
export function cannotBuildLab(state: GameState, type: PlacedType): string | null {
  const name = PLACED[type].name;
  if (!hasDaily(state)) return `The ${name} comes with a campus that has goals.`;
  if (labOf(state, type)) return `The campus has its ${name} already. One lab for each field.`;
  return null;
}

// ------------------------------------------------------------- the rate --

export interface LabRate {
  /** Findings an hour now. */
  perHour: number;
  /** The share faculty funding gives: one at the Instruction slider's middle. */
  funding: number;
  /** The share the seats in reach give: from a half with none to the whole. */
  seats: number;
  /** Lecture-hall seats within its reach, on the campus's own count. */
  seatsNear: number;
  /** The seats in reach that make it whole, on the campus's own count. */
  seatsWanted: number;
}

/** Cells between a spot and the nearest edge of a building, counting diagonals as one. */
function gap(placed: Placed, x: number, y: number): number {
  return Math.max(Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1)), Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1)));
}

/** How fast a lab works now, and why. */
export function labRate(state: GameState, lab: Placed): LabRate {
  const funding = 1 + LAB_FUNDING_STEP * (instructionStep(state) - INSTRUCTION_FULL);
  let seats = 0;
  for (const building of state.map.buildings) {
    if (!building || building.zone !== 'academic' || building.stage <= 0) continue;
    if (gap(lab, building.x, building.y) <= LAB_SEAT_REACH) seats += stageSpec('academic', building.stage, 1).capacity;
  }
  const share = LAB_SEATS_FLOOR + (1 - LAB_SEATS_FLOOR) * Math.min(1, seats / LAB_SEATS_FULL);
  const scale = scaleOf(state);
  return { perHour: FINDINGS_PER_HOUR * funding * share, funding, seats: share, seatsNear: seats * scale, seatsWanted: LAB_SEATS_FULL * scale };
}

/** Hours a lab has filled, with no limit. */
function hoursSince(state: GameState, lab: Placed): number {
  const from = state.labs.since[lab.id] ?? lab.builtTick;
  return Math.max(0, state.clock.tick - from) / TICKS_PER_HOUR;
}

/** Findings a lab holds now: its rate for the hours it has filled, up to 36 hours' worth. Not rounded. */
export function findingsHeld(state: GameState, lab: Placed): number {
  return Math.min(LAB_HOURS, hoursSince(state, lab)) * labRate(state, lab).perHour;
}

// ------------------------------------------------------------- the money --

/** What the labs may still take from this year's allowance: what the year has left, and no more than their share. */
export function labCashLeft(state: GameState): number {
  const year = Math.max(1, state.clock.week.year);
  const orders = state.orders;
  const all = ORDER_CASH_YEAR * scaleOf(state);
  const left = all - (orders.paidYear === year ? orders.paid : 0);
  const mine = LAB_CASH_SHARE * all - (state.labs.paidYear === year ? state.labs.paid : 0);
  return Math.max(0, Math.floor(Math.min(left, mine)));
}

/** A grant to a lab, out of the shared allowance. Pays what is left, up to `amount`. */
function labGrant(state: GameState, amount: number): number {
  const year = Math.max(1, state.clock.week.year);
  const paid = Math.max(0, Math.min(Math.round(amount), labCashLeft(state)));
  if (state.orders.paidYear !== year) {
    state.orders.paidYear = year;
    state.orders.paid = 0;
  }
  if (state.labs.paidYear !== year) {
    state.labs.paidYear = year;
    state.labs.paid = 0;
  }
  state.money.cash += paid;
  state.orders.paid += paid;
  state.labs.paid += paid;
  return paid;
}

// ---------------------------------------------------------- collecting --

export interface LabHolds {
  findings: number;
  xp: number;
  cash: number;
  ready: boolean;
  full: number;
}

/** What tapping a lab would pay now. */
export function labHolds(state: GameState, lab: Placed): LabHolds {
  const findings = Math.floor(findingsHeld(state, lab));
  return {
    findings,
    xp: findings * FINDING_XP,
    cash: Math.min(findings * FINDING_CASH * scaleOf(state), labCashLeft(state)),
    ready: findings >= LAB_READY,
    full: Math.min(1, hoursSince(state, lab) / LAB_HOURS),
  };
}

/**
 * Collect a lab's findings. Changes the state it is given. The part of a finding not yet whole is carried, so no time
 * is lost. Returns what it paid; the experience is the caller's to add, as collecting's is.
 */
export function collectLab(state: GameState, lab: Placed): { xp: number; cash: number; findings: number } | null {
  const held = findingsHeld(state, lab);
  const findings = Math.floor(held);
  if (findings <= 0) return null;
  const rate = labRate(state, lab).perHour;
  const full = hoursSince(state, lab) >= LAB_HOURS;
  // The fraction of a finding is carried as time, unless it was full: then it starts again from now.
  const carried = full || rate <= 0 ? 0 : (held - findings) / rate;
  state.labs.since[lab.id] = state.clock.tick - Math.round(carried * TICKS_PER_HOUR);
  state.labs.findings += findings;
  ordersCount(state, 'findings', findings);
  const cash = labGrant(state, findings * FINDING_CASH * scaleOf(state));
  return { xp: findings * FINDING_XP, cash, findings };
}

// ---------------------------------------------------------- discoveries --

/** Ticks to a lab's next discovery at its rate now. */
function discoveryTicks(state: GameState, lab: Placed): number {
  const rate = labRate(state, lab).perHour / FINDINGS_PER_HOUR;
  return Math.max(TICKS_PER_HOUR, Math.round((DISCOVERY_HOURS / Math.max(0.1, rate)) * TICKS_PER_HOUR));
}

/** A lab was placed: it fills from now, and its first discovery is on its way. */
export function labPlaced(state: GameState, lab: Placed): void {
  state.labs.since[lab.id] = state.clock.tick;
  addTimer(state, state.clock.tick + discoveryTicks(state, lab), 'discovery', lab.id);
}

/** A lab was cleared: what it held goes with it. Its discoveries are kept. */
export function labCleared(state: GameState, id: number): void {
  delete state.labs.since[id];
  cancelTimers(state, 'discovery', id);
}

/** Which of a field's discoveries comes next: each in turn, from a start the seed picks, before any comes again. */
function nextLine(state: GameState, spec: LabSpec): number {
  const made = state.labs.found.filter((one) => one.lab === spec.type).length;
  const count = spec.discoveries.length;
  // A step that shares no factor with the count reaches every one before it repeats.
  let step = 5;
  while (count % step === 0 || step % count === 0) step += 1;
  return (hashInts(state.seed, LABS.indexOf(spec)) + made * step) % count;
}

/** A discovery in a sentence: "Larp chemists find a greener glue." */
export function discoveryText(state: GameState, discovery: Discovery): string {
  const line = labSpec(discovery.lab)?.discoveries[discovery.line];
  if (!line) return '';
  return `${shortName(state.school.name)} ${line[0]} ${line[1]} ${line[2]}.`;
}

const SMALL = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'up', 'with', 'that', 'into', 'out']);

/** A headline's capitals: every word but the small ones, and the first. */
function titled(text: string): string {
  return text
    .split(' ')
    .map((word, n) => (n > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** A discovery as the paper's headline: "Larp Chemists Find a Greener Glue; Committee Requests a Sample". */
export function discoveryHeadline(state: GameState, discovery: Discovery): string {
  const sentence = discoveryText(state, discovery).replace(/\.$/, '');
  return `${titled(sentence)}; ${DISCOVERY_QUIPS[hashInts(state.seed, discovery.tick) % DISCOVERY_QUIPS.length]}`;
}

/** The timer of a lab's discovery fired: it makes one, the paper says so, and the next is on its way. */
export function discoveryDue(state: GameState, id: number, log: LogEntry[]): void {
  const lab = state.map.placed[id];
  const spec = lab ? labSpec(lab.type) : undefined;
  if (!lab || !spec || !hasDaily(state)) return;
  const discovery: Discovery = { lab: lab.type, line: nextLine(state, spec), tick: state.clock.tick, year: state.clock.week.year };
  state.labs.found.push(discovery);
  const count = state.labs.found.filter((one) => one.lab === lab.type).length;
  ordersCount(state, 'discoveries');
  const cash = labGrant(state, DISCOVERY_CASH * scaleOf(state));
  const text = `${discoveryText(state, discovery)} It is the ${spec.name}'s ${ordinal(count)} discovery${cash > 0 ? `, with a grant of ${dollars(cash)}` : ''}.`;
  log.push({ tick: state.clock.tick, kind: 'lab', text, data: { discovery: 1, keep: 1, id, headline: discoveryHeadline(state, discovery), cash } });
  gainXp(state, DISCOVERY_XP, log);
  addTimer(state, state.clock.tick + discoveryTicks(state, lab), 'discovery', lab.id);
}

function ordinal(n: number): string {
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
  if (n >= 1 && n <= words.length) return words[n - 1]!;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Hours to a lab's next discovery, from its timer. null when none is on its way. */
export function nextDiscoveryIn(state: GameState, id: number): number | null {
  const timer = state.timers.find((one) => one.kind === 'discovery' && one.ref === id);
  return timer ? Math.max(0, timer.due - state.clock.tick) / TICKS_PER_HOUR : null;
}

// ------------------------------------------------------------ its effect --

/** Points the Reputation input reads higher: one for each lab that stands. */
export function labReputation(state: GameState): number {
  return hasDaily(state) ? LAB_REPUTATION * labsOnMap(state).length : 0;
}
