import { ASKS_KEPT_WEEKS, CALM_MOST, MEDDLE, MEDDLE_BY_ID, MEDDLE_EFFECT, MEDDLE_STRESS_MOST, type MeddleId, type MeddleSpec } from '../config/meddle';
import { LITTER_CEILING } from '../config/grounds';
import { TICKS_PER_HOUR } from '../config/time';
import { WEB_WEEK_TICKS } from '../config/web';
import { dollarsShort, duration } from '../format';
import { hashInts } from '../rng';
import { scaleOf } from '../scale';
import type { Boost, Building, GameState, LogEntry, MeddleRun, MeddleState, Placed, WebAsk } from '../types';
import { beginChaos, chaosOn } from './chaos';
import { liftSpirit } from './footballChaos';
import { isMessSpot } from './grounds';
import { beginBruise } from './incidents';
import { weatherAt } from './season';
import { classPlaces, studentName, type StudentRef } from './students';
import { teamName } from './football';
import { CLASS_YEARS } from '../config/population';

/**
 * The Meddle menu and the calm tools (chaos C4, DESIGN.md 78). The player sets something going; it is paid for now,
 * its cooldown starts, and what it does reaches the numbers through what the game already has: the desk's dated boosts
 * for Happiness and Stress (36, sharing their caps), chaos's rates (calm, extra security, a prank war, tempers with
 * the rival), spirit (68.3), litter at the mess spots (29), a bruise for Medical, the rival's mascot's visit (77.4),
 * and asks the social web carries out at its next week (rumours, dates, roommates, a prank war's feud). Every outcome
 * is drawn from the seed, the tick and the tool, never from a random stream, so nothing else turns out differently.
 */

const HOUR = TICKS_PER_HOUR;
const share = (h: number): number => (h >>> 0) / 4294967296;
const INDEX: Readonly<Record<MeddleId, number>> = Object.fromEntries(MEDDLE.map((spec, n) => [spec.id, n])) as Record<MeddleId, number>;

export function newMeddle(): MeddleState {
  return { last: {}, used: {}, running: [], asks: [], news: [] };
}

/** The tools are on a game with chaos (a game with goals), as chaos is. */
export function meddleOn(state: GameState): boolean {
  return chaosOn(state) && !!state.chaos.meddle;
}

/** What the tool costs here: dollars at the campus's scale, or Gold Seals. */
export function meddleCost(state: GameState, spec: MeddleSpec): { cash: number; seals: number } {
  return { cash: spec.cash ? Math.round(spec.cash * scaleOf(state)) : 0, seals: spec.seals ?? 0 };
}

/** Ticks until the tool can be used again; 0 when it is ready. */
export function cooldownLeft(state: GameState, id: MeddleId): number {
  const last = state.chaos.meddle?.last[id];
  if (last === undefined) return 0;
  return Math.max(0, last + MEDDLE_BY_ID[id].cooldown - state.clock.tick);
}

const dorms = (state: GameState): Building[] => state.map.buildings.filter((b): b is Building => !!b && b.zone === 'housing' && b.stage > 0);

/** Why the tool cannot be used now, in a line, or null when it can. */
export function meddleProblem(state: GameState, id: MeddleId): string | null {
  if (!meddleOn(state)) return 'Meddling is for a campus with goals.';
  const spec = MEDDLE_BY_ID[id];
  const left = cooldownLeft(state, id);
  if (left > 0) return `Ready again in ${duration(left)}.`;
  if (spec.snowOnly && weatherAt(state.seed, state.clock) !== 'snow') return 'Only while it is snowing.';
  const cost = meddleCost(state, spec);
  if (cost.seals > 0 && state.daily.seals < cost.seals) return `That takes ${cost.seals} Gold Seals. You have ${state.daily.seals}.`;
  if (cost.cash > 0 && state.money.cash < cost.cash) return `That takes ${dollarsShort(cost.cash)}.`;
  const halls = dorms(state).length;
  if ((id === 'prankWar' && halls < 2) || ((id === 'powerCut' || id === 'roommates' || id === 'party') && halls < 1)) return id === 'prankWar' ? 'A prank war needs two dorms.' : 'That needs a dorm.';
  if (id === 'mascot' && state.chaos.mascot) return "The rival's mascot is on campus already.";
  if ((id === 'rumour' || id === 'date' || id === 'roommates') && students(state).length < 2) return 'That needs students.';
  return null;
}

/** The class years with students in them, as places to draw from. */
function students(state: GameState): Array<{ entryYear: number; from: number; size: number }> {
  const out: Array<{ entryYear: number; from: number; size: number }> = [];
  for (let year = 0; year < CLASS_YEARS; year++) {
    const place = classPlaces(state, year);
    if (place.size > 0) out.push(place);
  }
  return out;
}

/** Two different students, drawn from the hash: from the same class when `same`, as a date or roommates are. */
function pair(state: GameState, h: number, same: boolean): [StudentRef, StudentRef] {
  const classes = students(state);
  const first = classes[Math.floor(share(hashInts(h, 1)) * classes.length)]!;
  const second = same && first.size >= 2 ? first : classes[Math.floor(share(hashInts(h, 2)) * classes.length)]!;
  const a = { entryYear: first.entryYear, index: first.from + Math.floor(share(hashInts(h, 3)) * first.size) };
  let index = second.from + Math.floor(share(hashInts(h, 4)) * second.size);
  if (second.entryYear === a.entryYear && index === a.index) index = second.from + ((index - second.from + 1) % second.size);
  return [a, { entryYear: second.entryYear, index }];
}

function boost(state: GameState, kind: Boost['kind'], amount: number, hours: number, label: string): void {
  state.inbox.boosts.push({ kind, amount, until: state.clock.tick + Math.round(hours * HOUR), label });
}

function run(state: GameState, kind: MeddleRun['kind'], hours: number, amount: number, more: Partial<MeddleRun> = {}): void {
  const tick = state.clock.tick;
  state.chaos.meddle.running.push({ kind, from: tick, until: tick + Math.round(hours * HOUR), amount, ...more });
}

function tell(state: GameState, at: number, text: string, tool: MeddleId, outcome = 0): void {
  state.chaos.meddle.news.push({ at, text, data: { meddle: INDEX[tool] + 1, outcome } });
}

function ask(state: GameState, kind: WebAsk['kind'], a: StudentRef, b: StudentRef): void {
  state.chaos.meddle.asks.push({ kind, a, b, week: Math.floor(state.clock.tick / WEB_WEEK_TICKS) + 1 });
}

/** Litter at the mess spots nearest the middle of the campus: the `spots` nearest, `amount` each, to their ceiling. */
function strew(state: GameState, amount: number, spots: number): void {
  const buildings = state.map.buildings.filter((b): b is Building => !!b);
  if (buildings.length === 0) return;
  const mx = buildings.reduce((sum, b) => sum + b.x, 0) / buildings.length;
  const my = buildings.reduce((sum, b) => sum + b.y, 0) / buildings.length;
  const near = state.map.placed
    .filter((p): p is Placed => !!p && isMessSpot(p))
    .sort((a, b) => Math.abs(a.x - mx) + Math.abs(a.y - my) - (Math.abs(b.x - mx) + Math.abs(b.y - my)) || a.id - b.id)
    .slice(0, spots);
  for (const spot of near) state.grounds.litter[spot.id] = Math.min(LITTER_CEILING, (state.grounds.litter[spot.id] ?? 0) + amount);
}

/** The words the player reads when it is done, with names; the paper's own line never names a student. */
export interface Meddled {
  told: string;
}

/**
 * Use a tool: pay, start its cooldown, and set it going. Returns why not, or what happened in a line for the player.
 * Its paper line is told on the next tick, and an outcome that takes a night is told when the night is over.
 */
export function meddle(state: GameState, id: MeddleId): string | Meddled {
  const problem = meddleProblem(state, id);
  if (problem) return problem;
  const spec = MEDDLE_BY_ID[id];
  const m = state.chaos.meddle;
  const tick = state.clock.tick;
  const cost = meddleCost(state, spec);
  state.money.cash -= cost.cash;
  state.daily.seals -= cost.seals;
  m.last[id] = tick;
  m.used[id] = (m.used[id] ?? 0) + 1;
  const h = hashInts(state.seed, tick, INDEX[id], 7801);
  const roll = share(hashInts(h, 9));
  const name = (ref: StudentRef): string => studentName(state, ref);
  const next = tick + 1;
  switch (id) {
    case 'party': {
      const e = MEDDLE_EFFECT.party;
      boost(state, 'happy', e.happy, e.hours, spec.name);
      boost(state, 'calls', e.calls, e.callHours, spec.name);
      strew(state, e.litter, e.spots);
      const spirit = liftSpirit(state);
      tell(state, next, `The campus threw a party in every hall and on every quad: music until the small hours, new friends by midnight, and a quieter morning after.${spirit ? ' Spirit is up.' : ''}`, id);
      return { told: `The party is on: every hall and every quad, all night. Expect noise, mess and a call or two for Campus Safety.` };
    }
    case 'rumour': {
      const e = MEDDLE_EFFECT.rumour;
      const [a, b] = pair(state, h, false);
      const who = `${name(a)} and ${name(b)}`;
      if (roll < e.couple) {
        ask(state, 'couple', a, b);
        tell(state, tick + 12 * HOUR, 'A rumour about two students went round the dining halls, and it turned out to be true: they are a couple now.', id, 1);
        return { told: `The rumour about ${who} went round, and it turned out to be true: they are a couple now.` };
      }
      if (roll < e.couple + e.tense) {
        ask(state, 'tense', a, b);
        tell(state, tick + 12 * HOUR, 'A rumour about two students went round the dining halls; they are not speaking for now.', id, 2);
        return { told: `The rumour about ${who} went round. They are not speaking for now.` };
      }
      if (roll < e.couple + e.tense + e.split) {
        ask(state, 'split', a, b);
        tell(state, tick + 12 * HOUR, "A rumour about a student reached their partner, and the couple split up; friends are picking sides.", id, 3);
        return { told: `The rumour about ${who} reached ${name(a)}'s partner. If they had one, they don't now.` };
      }
      ask(state, 'feud', a, b);
      tell(state, tick + 12 * HOUR, 'A rumour about two students started a feud between them, and their friends are taking sides.', id, 4);
      return { told: `The rumour about ${who} started a feud between them.` };
    }
    case 'date': {
      const [a, b] = pair(state, h, true);
      const who = `${name(a)} and ${name(b)}`;
      if (roll < MEDDLE_EFFECT.date.click) {
        ask(state, 'couple', a, b);
        tell(state, tick + 8 * HOUR, 'Two students set up on a date clicked, and a second one is already planned.', id, 1);
        return { told: `${who} are on a date tonight. They clicked: a second date is already planned.` };
      }
      ask(state, 'awkward', a, b);
      tell(state, tick + 8 * HOUR, 'Two students set up on a date had an awkward night: polite talk, long pauses and an early goodnight.', id, 2);
      return { told: `${who} are on a date tonight. It was awkward: polite talk, long pauses, an early goodnight.` };
    }
    case 'roommates': {
      const e = MEDDLE_EFFECT.roommates;
      const [a, b] = pair(state, h, true);
      const who = `${name(a)} and ${name(b)}`;
      if (roll < e.friends) {
        ask(state, 'friends', a, b);
        tell(state, tick + 24 * HOUR, 'A night owl and an early riser were put in one room. Against every prediction, they are friends for life.', id, 1);
        return { told: `${who} share a room now. Against every prediction, they are friends for life.` };
      }
      if (roll < e.friends + e.tense) {
        ask(state, 'tense', a, b);
        tell(state, tick + 24 * HOUR, 'A night owl and an early riser were put in one room: the alarm goes at six, the music at two.', id, 2);
        return { told: `${who} share a room now. It is tense: the alarm goes at six, the music at two.` };
      }
      ask(state, 'feud', a, b);
      const halls = dorms(state);
      const hall = halls[Math.floor(share(hashInts(h, 11)) * halls.length)]!;
      beginChaos(state, 'shouting', 0, share(hashInts(h, 12)), [hall.id]);
      tell(state, tick + 24 * HOUR, 'A night owl and an early riser were put in one room, and now their whole floor has chosen a side.', id, 3);
      return { told: `${who} share a room now, and their whole floor has chosen a side.` };
    }
    case 'cancel': {
      const e = MEDDLE_EFFECT.cancel;
      boost(state, 'happy', e.happy, e.hours, 'Classes cancelled');
      boost(state, 'stress', e.stressOff, e.hours, 'Classes cancelled');
      tell(state, next, 'Classes were cancelled for the day. The quads filled by ten; the professors are grumbling about the syllabus.', id);
      return { told: 'Classes are cancelled for the day. The quads will be full, and the professors are grumbling.' };
    }
    case 'mascot': {
      const e = MEDDLE_EFFECT.mascot;
      const rival = teamName(state, state.football.rival);
      state.chaos.mascot = { at: tick, until: tick + e.hours * HOUR };
      state.chaos.tally.mascot += 1;
      const spirit = liftSpirit(state);
      run(state, 'temper', e.temperHours, e.temper);
      run(state, 'prankBack', 0, 1, { from: tick + e.prankBackHours * HOUR, until: tick + e.prankBackHours * HOUR + 1 });
      tell(state, next, `The ${rival} mascot is loose on campus for the afternoon, with half the students in a comic chase behind it.${spirit ? ' Spirit is up.' : ''}`, id);
      return { told: `The ${rival} mascot is loose on campus. Spirit is up, and the ${rival} students will want to pay a visit back.` };
    }
    case 'prankWar': {
      const e = MEDDLE_EFFECT.prankWar;
      const halls = dorms(state);
      const one = Math.floor(share(hashInts(h, 21)) * halls.length);
      let two = Math.floor(share(hashInts(h, 22)) * (halls.length - 1));
      if (two >= one) two += 1;
      run(state, 'war', e.hours, 1, { dorms: [halls[one]!.id, halls[two]!.id] });
      const [a, b] = pair(state, h, false);
      ask(state, 'feud', a, b);
      const spirit = liftSpirit(state);
      tell(state, next, `Two dorms have declared a prank war for the week: sticky notes, beach balls and rubber ducks expected.${spirit ? ' Spirit is up.' : ''}`, id, 1);
      tell(state, tick + e.hours * HOUR, 'The prank war is over: both dorms claim the win, the rubber ducks are out of the fountain and the repaints are done.', id, 2);
      return { told: 'The prank war is on: two dorms, one week. Expect pranks, graffiti, repaints and a feud.' };
    }
    case 'powerCut': {
      const e = MEDDLE_EFFECT.powerCut;
      run(state, 'stress', e.hours, e.stress);
      boost(state, 'happy', e.happy, e.hours, 'Lounge by lantern light');
      tell(state, next, 'The power went out in one dorm for the night. Residents gathered in the lounge by lantern light; the essays will have to wait.', id);
      return { told: 'The lights are out in one dorm until morning: a gathering by lantern light, and a lot of study lost.' };
    }
    case 'surpriseExam': {
      const e = MEDDLE_EFFECT.surpriseExam;
      run(state, 'stress', e.hours, e.stress);
      tell(state, next, 'Surprise exams in every class tomorrow morning: groans at dinner, and a few quiet smiles from the prepared.', id);
      return { told: 'Surprise exams in every class, first thing tomorrow. Stress is up; the prepared are quietly pleased.' };
    }
    case 'freeFood': {
      const e = MEDDLE_EFFECT.freeFood;
      boost(state, 'happy', e.happy, e.hours, spec.name);
      strew(state, e.litter, e.spots);
      tell(state, next, 'Free food on the main quad at lunch: long lines, new acquaintances, and plenty for the grounds crew to pick up after.', id);
      return { told: 'Free food on the quad at lunch. Crowds, new acquaintances, and litter for the grounds crew.' };
    }
    case 'flashMob': {
      const e = MEDDLE_EFFECT.flashMob;
      boost(state, 'happy', e.happy, e.hours, spec.name);
      if (!liftSpirit(state)) state.chaos.reach.push({ at: tick, size: e.reach });
      tell(state, next, 'A flash mob of a hundred students took over the main path at noon. The video is being shared well beyond campus.', id);
      return { told: 'A flash mob on the main path at noon. The video is going round beyond campus; the path is blocked for an hour.' };
    }
    case 'snowball': {
      const e = MEDDLE_EFFECT.snowball;
      boost(state, 'happy', e.happy, e.hours, spec.name);
      const halls = dorms(state);
      for (let n = 0; n < e.bruises && halls.length > 0; n++) {
        const hall = halls[Math.floor(share(hashInts(h, 30 + n)) * halls.length)]!;
        beginBruise(state, hall.x, hall.y, 'a snowball battle', hashInts(h, 40 + n));
      }
      tell(state, next, 'A snowball battle took over every quad. New friends were made on both sides; Medical handed out a few ice packs.', id);
      return { told: 'A snowball battle on every quad. New friends on both sides, and a bruise or two for Medical.' };
    }
    case 'counselling': {
      const e = MEDDLE_EFFECT.counselling;
      boost(state, 'stress', e.stressOff, e.hours, spec.name);
      run(state, 'calm', e.calmHours, e.calm);
      tell(state, next, 'Counsellors set up in every hall for a day, doors open. The queues were long, and the evening was quieter for it.', id);
      return { told: 'Counsellors are in every hall today. Stress is down, and tempers will be calmer for two days.' };
    }
    case 'festival': {
      const e = MEDDLE_EFFECT.festival;
      boost(state, 'happy', e.happy, e.hours, spec.name);
      run(state, 'calm', e.calmHours, e.calm);
      strew(state, e.litter, e.spots);
      const spirit = liftSpirit(state);
      tell(state, next, `Two days of music, food and games on the quads: the campus festival has begun.${spirit ? ' Spirit is up.' : ''}`, id);
      return { told: 'The campus festival is on for two days: Happiness up, tempers calm, and litter for the grounds crew.' };
    }
    case 'security': {
      const e = MEDDLE_EFFECT.security;
      run(state, 'security', e.hours, e.rein);
      boost(state, 'happy', e.happy, e.hours, 'Extra security');
      tell(state, next, 'Campus Safety is on every path today. Dust-ups and pranks are few; some students say it feels heavy-handed.', id);
      return { told: 'Campus Safety is on every path for a day. Far fewer dust-ups and pranks; a few students grumble.' };
    }
    case 'dogs': {
      const e = MEDDLE_EFFECT.dogs;
      boost(state, 'stress', e.stressOff, e.hours, spec.name);
      boost(state, 'happy', e.happy, e.hours, spec.name);
      tell(state, next, 'Therapy dogs on the quad all afternoon. The longest line on campus, and the calmest.', id);
      return { told: 'Therapy dogs on the quad all afternoon. Stress is down, and the line is the happiest on campus.' };
    }
  }
}

// ---------------------------------------------------------------- what chaos reads --

function active(state: GameState, kind: MeddleRun['kind']): MeddleRun[] {
  const m = state.chaos.meddle;
  if (!m || m.running.length === 0) return NONE;
  const tick = state.clock.tick;
  return m.running.filter((one) => one.kind === kind && one.from <= tick && tick < one.until);
}
const NONE: MeddleRun[] = [];

/** What calm tools leave of dust-ups' and shouting matches' rates: 1 with none, never below CALM_MOST. */
export function meddleCalm(state: GameState): number {
  const product = active(state, 'calm').reduce((times, one) => times * one.amount, 1);
  return Math.max(CALM_MOST, product);
}

/** What extra security leaves of dust-ups', pranks' and graffiti's rates: 1 with none. */
export function meddleRein(state: GameState): number {
  return active(state, 'security').reduce((least, one) => Math.min(least, one.amount), 1);
}

/** Tempers with the rival after its mascot was let loose: 1 with none. */
export function meddleTemper(state: GameState): number {
  return active(state, 'temper').reduce((most, one) => Math.max(most, one.amount), 1);
}

/** A prank war's two dorms, while it runs, or null. */
export function prankWarDorms(state: GameState): readonly number[] | null {
  const war = active(state, 'war')[0];
  return war?.dorms ?? null;
}

/** Stress a power cut or a surprise exam adds now, together within the cap. */
export function meddleStress(state: GameState): number {
  const sum = active(state, 'stress').reduce((total, one) => total + one.amount, 0);
  return Math.min(MEDDLE_STRESS_MOST, sum);
}

/** The asks the social web has yet to carry out. */
export function webAsks(state: GameState): readonly WebAsk[] {
  return state.chaos?.meddle?.asks ?? [];
}

// ---------------------------------------------------------------- each tick --

/** Tell what is due, send the prank back, and drop what has ended. */
export function stepMeddle(state: GameState, log: LogEntry[]): void {
  const m = state.chaos?.meddle;
  if (!m || (m.news.length === 0 && m.running.length === 0 && m.asks.length === 0)) return;
  const tick = state.clock.tick;
  if (m.news.some((one) => one.at <= tick)) {
    for (const one of m.news) if (one.at <= tick) log.push({ tick, kind: 'chaos', text: one.text, data: one.data });
    m.news = m.news.filter((one) => one.at > tick);
  }
  for (const one of m.running) {
    if (one.kind !== 'prankBack' || one.from > tick) continue;
    // The rival's students pay a visit back: the statue in their colours, a repaint for Campus Safety's crew.
    if (chaosOn(state)) {
      beginChaos(state, 'graffiti', share(hashInts(state.seed, tick, 7811)), share(hashInts(state.seed, tick, 7812)));
      log.push({ tick, kind: 'chaos', text: `The ${teamName(state, state.football.rival)} students paid a visit back in the night: the statue by one of the dorms wears their colours this morning. A repaint is on the way.`, data: { meddle: INDEX.mascot + 1, outcome: 2 } });
    }
    one.until = tick;
  }
  if (m.running.some((one) => one.until <= tick)) m.running = m.running.filter((one) => one.until > tick);
  const week = Math.floor(tick / WEB_WEEK_TICKS);
  if (m.asks.some((one) => one.week < week - ASKS_KEPT_WEEKS)) m.asks = m.asks.filter((one) => one.week >= week - ASKS_KEPT_WEEKS);
}

// ---------------------------------------------------------------- the page --

export interface MeddleRow {
  id: MeddleId;
  side: 'stir' | 'calm';
  name: string;
  line: string;
  good: string;
  bad: string;
  /** "$340K", "5 Gold Seals" or "Free", and how long it rests after: "a day", "a week". */
  cost: string;
  rests: string;
  /** null when it can be used now; else why not ("Ready again in 14 h"). */
  problem: string | null;
  used: number;
}

export function meddleView(state: GameState): { rows: MeddleRow[]; seals: number } | null {
  if (!meddleOn(state)) return null;
  const rows = MEDDLE.map((spec): MeddleRow => {
    const cost = meddleCost(state, spec);
    return {
      id: spec.id,
      side: spec.side,
      name: spec.name,
      line: spec.line,
      good: spec.good,
      bad: spec.bad,
      cost: cost.cash > 0 ? dollarsShort(cost.cash) : cost.seals > 0 ? `${cost.seals} Gold Seals` : 'Free',
      rests: spec.cooldown >= 7 * 24 * HOUR ? 'a week' : 'a day',
      problem: meddleProblem(state, spec.id),
      used: state.chaos.meddle.used[spec.id] ?? 0,
    };
  });
  return { rows, seals: state.daily.seals };
}
