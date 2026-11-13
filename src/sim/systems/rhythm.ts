import { calendarAt, dateAt, eventsAt, formatDate, GRADUATION_TICK_IN_YEAR, spanOf, tickOfDate, yearLength } from '../calendar';
import { HOMECOMING_SLOT, RIVALRY_SLOT, SLOTS } from '../config/football';
import { SELL_OUT_SHARE } from '../config/orders';
import {
  COMMENCEMENT_SHARE,
  FINALS_MEASURE_BEFORE,
  FINALS_ROOM,
  GIFT_CARD,
  GIFT_DAY_EARLY,
  MOMENT_LEAST_HOURS,
  MOMENT_MISSED_HOURS,
  MOMENT_OPEN_HOURS,
  MOMENTS,
  YEAR_KINDS,
  YEAR_LEAST_HOURS,
  YEAR_PAY,
  type GiftBox,
  type MomentKind,
  type MomentReward,
  type YearKind,
  type YearLevel,
} from '../config/rhythm';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/time';
import { dollars } from '../format';
import { hashInts } from '../rng';
import { scaleOf } from '../scale';
import { addTimer } from '../timers';
import type { GameState, LogEntry, Moment, Rhythm, Week, YearGoal } from '../types';
import { budget } from './budget';
import { collectables, gainXp, hasDaily } from './daily';
import { decorOffers, decorOwned, giveDecor, workshopOpen } from './decor';
import { atHome, teamName } from './football';
import { campusHappiness, campusLevels } from './happiness';
import { orderCashLeft } from './orders';
import { seasonCurve, stressRead } from './season';

/**
 * The daily and seasonal rhythm (DESIGN.md 42.8, as built in section 44).
 *
 * - The daily gift: the first look each of the player's days fills one box
 *   of a seven-box card. The seventh is the better gift. A missed day does
 *   nothing: the card waits.
 * - Goals for the year: three, set at move-in from the campus's own numbers,
 *   one easy, one medium and one a stretch, paid at commencement.
 * - Moments of the calendar: Homecoming, the rivalry, finals week and
 *   commencement are special orders of their own. Each opens a day and a half
 *   or more before it comes, and is measured when it does.
 *
 * Bonus only: nothing here takes anything away, and none of it pays rank.
 */

export function newRhythm(): Rhythm {
  return { giftDay: -1, box: 0, year: null, lastYear: null, moments: [], nextId: 1, opened: [], tally: {}, news: [] };
}

function bump(rhythm: Rhythm, what: string, by = 1): void {
  rhythm.tally[what] = (rhythm.tally[what] ?? 0) + by;
}

/** A grant, out of the same yearly allowance as the orders' grants. Pays what the year has left, up to `amount`. */
function grant(state: GameState, amount: number): number {
  const orders = state.orders;
  const year = Math.max(1, state.clock.week.year);
  if (orders.paidYear !== year) {
    orders.paidYear = year;
    orders.paid = 0;
  }
  const paid = Math.max(0, Math.min(Math.round(amount), orderCashLeft(state)));
  state.money.cash += paid;
  orders.paid += paid;
  return paid;
}

// --------------------------------------------------------------- the gift --

/** Which of the player's own days it is: a day begins two hours before the anchor, as the player's morning does. */
export function giftDayNow(state: GameState): number {
  const anchor = state.clock.anchor ?? GIFT_DAY_EARLY;
  const minutes = Math.floor(state.clock.nextTickAt / 60_000) - (anchor - GIFT_DAY_EARLY);
  return Math.floor(minutes / TICKS_PER_DAY);
}

/** True while today's gift is waiting. */
export function giftReady(state: GameState): boolean {
  return hasDaily(state) && giftDayNow(state) > state.rhythm.giftDay;
}

/** The decoration a box gives: of those the Decor shelf has opened, the one the campus has fewest of. null with none open. */
export function giftDecor(state: GameState): string | null {
  let pick: { id: string; owned: number } | null = null;
  for (const offer of decorOffers(state)) {
    // Opened on the Decor shelf by the level, whether or not one is already in storage.
    const home = offer.spec.home;
    if (home.kind !== 'shelf' || state.daily.level < home.level) continue;
    const owned = decorOwned(state, offer.spec.id);
    if (!pick || owned < pick.owned) pick = { id: offer.spec.id, owned };
  }
  return pick?.id ?? null;
}

export interface GiftPaid {
  xp: number;
  cash: number;
  seals: number;
  /** The decoration given, an id from `DECOR`, or null. */
  decor: string | null;
  /** Which box it was, 1 to 7. */
  box: number;
}

/** What a box would give on this campus now. */
export function giftOf(state: GameState, box: GiftBox): GiftPaid & { cashWanted: number } {
  const cashWanted = (box.cash ?? 0) * scaleOf(state);
  return { xp: box.xp, cash: Math.min(cashWanted, orderCashLeft(state)), cashWanted, seals: box.seals ?? 0, decor: box.decor ? giftDecor(state) : null, box: 0 };
}

/** Take today's gift: the next box of the card. Changes the state it is given. Returns what it gave, or why not. */
export function takeGift(state: GameState): GiftPaid | string {
  if (!hasDaily(state)) return 'There is no gift on this campus.';
  if (!giftReady(state)) return "Today's gift is taken. The next comes tomorrow.";
  const rhythm = state.rhythm;
  const index = rhythm.box;
  const box = GIFT_CARD[index]!;
  const would = giftOf(state, box);
  const cash = would.cashWanted > 0 ? grant(state, would.cashWanted) : 0;
  if (would.seals > 0) state.daily.seals += would.seals;
  if (would.decor) giveDecor(state, would.decor);
  gainXp(state, would.xp);
  rhythm.giftDay = giftDayNow(state);
  rhythm.box = (index + 1) % GIFT_CARD.length;
  bump(rhythm, 'gifts');
  bump(rhythm, 'giftXp', would.xp);
  bump(rhythm, 'giftCash', cash);
  bump(rhythm, 'giftSeals', would.seals);
  if (would.decor) bump(rhythm, 'giftDecor');
  if (index === GIFT_CARD.length - 1) bump(rhythm, 'cards');
  return { xp: would.xp, cash, seals: would.seals, decor: would.decor, box: index + 1 };
}

// ----------------------------------------------------- goals for the year --

const level = (state: GameState): number => state.daily.level;

/** Where a goal's number stands now. */
function measureNow(state: GameState, kind: YearKind): number {
  const m = kind.measure;
  switch (m.kind) {
    case 'counted':
      return state.orders.tally[m.what] ?? 0;
    case 'level':
      return level(state);
    case 'happiness':
      return Math.round(campusHappiness(state).score);
    case 'kept':
      return budget(state).kept;
  }
}

function canAsk(state: GameState, kind: YearKind): boolean {
  switch (kind.when) {
    case 'always':
      return true;
    case 'decorShelf':
      return decorOffers(state).some((offer) => offer.spec.home.kind === 'shelf' && offer.way === 'cash');
    case 'workshop':
      return workshopOpen(state);
    case 'collects':
      return collectables(state).length > 0;
  }
}

const kindOf = (id: string): YearKind | undefined => YEAR_KINDS.find((kind) => kind.id === id);

/** The tick of this year's commencement. */
function commencementTick(week: Week): number {
  return week.start + GRADUATION_TICK_IN_YEAR;
}

/**
 * Set the goals for the year: three kinds the campus can be asked, chosen by
 * the game's seed and the year, one easy, one medium and one a stretch, from
 * where each number stands now. Nothing is set when commencement is too near
 * for a fair go at them.
 */
export function setYearGoals(state: GameState, log?: LogEntry[]): void {
  if (!hasDaily(state)) return;
  const week = state.clock.week;
  const until = commencementTick(week);
  if (until - state.clock.tick < YEAR_LEAST_HOURS * TICKS_PER_HOUR) return;
  const open = YEAR_KINDS.filter((kind) => canAsk(state, kind));
  const order = open.map((kind, n) => ({ kind, roll: hashInts(state.seed, week.year, n, 4401) })).sort((a, b) => a.roll - b.roll);
  const levels: YearLevel[] = ['easy', 'medium', 'stretch'];
  const goals: YearGoal[] = order.slice(0, 3).map(({ kind }, n) => {
    const step = kind.steps[n]!;
    const from = measureNow(state, kind);
    let target = kind.more ? from + step : step;
    if (kind.measure.kind === 'happiness') target = Math.min(98, Math.max(1, Math.round(from + step)));
    return { kind: kind.id, level: levels[n]!, from, target };
  });
  state.rhythm.year = { year: week.year, set: state.clock.tick, until, goals };
  bump(state.rhythm, 'yearsSet');
  bump(state.rhythm, 'goalsSet', goals.length);
  log?.push({ tick: state.clock.tick, kind: 'rhythm', text: `The goals for the year are set: ${goals.map((goal) => yearWords(goal)).join('; ')}. They pay at commencement.`, data: { year: 1 } });
}

/** A goal in words: "Finish 7 orders on the board". */
export function yearWords(goal: YearGoal): string {
  const kind = kindOf(goal.kind);
  if (!kind) return '';
  // A count is how many to do this year. Money is in dollars and cents. Anything else is the number to reach.
  const n = kind.measure.kind === 'counted' ? String(goal.target - goal.from) : kind.measure.kind === 'kept' ? goal.target.toFixed(2).replace(/\.00$/, '') : String(goal.target);
  return (n === '1' && kind.one ? kind.one : kind.words).replace('{n}', n);
}

/** How far a goal has come: the number to show against its target, and whether it is met already. */
export function yearProgress(state: GameState, goal: YearGoal): { value: number; done: boolean; atCommencement: boolean } {
  const kind = kindOf(goal.kind);
  if (!kind) return { value: 0, done: false, atCommencement: false };
  const now = measureNow(state, kind);
  if (kind.measure.kind === 'counted') {
    const value = now - goal.from;
    return { value, done: goal.from + value >= goal.target, atCommencement: false };
  }
  if (kind.measure.kind === 'level') return { value: now, done: now >= goal.target, atCommencement: false };
  return { value: now, done: now >= goal.target, atCommencement: true };
}

/** What a goal pays at commencement. */
export function yearPay(goal: YearGoal): { xp: number; seals: number } {
  return YEAR_PAY[goal.level];
}

/** Commencement: every goal met is paid, and the paper says how the year went. */
function payYear(state: GameState, log: LogEntry[]): void {
  const year = state.rhythm.year;
  if (!year) return;
  let met = 0;
  let xp = 0;
  let seals = 0;
  for (const goal of year.goals) {
    const done = yearProgress(state, goal).done;
    goal.met = done;
    if (!done) continue;
    met += 1;
    const pay = yearPay(goal);
    xp += pay.xp;
    seals += pay.seals;
  }
  if (seals > 0) state.daily.seals += seals;
  if (xp > 0) gainXp(state, xp, log);
  state.rhythm.lastYear = { year: year.year, met, of: year.goals.length, xp, seals };
  state.rhythm.year = null;
  bump(state.rhythm, 'goalsMet', met);
  bump(state.rhythm, 'yearXp', xp);
  bump(state.rhythm, 'yearSeals', seals);
  const paid = [xp > 0 ? `${xp.toLocaleString('en-US')} experience` : '', seals > 0 ? `${seals} Gold ${seals === 1 ? 'Seal' : 'Seals'}` : ''].filter(Boolean).join(' and ');
  log.push({
    tick: state.clock.tick,
    kind: 'rhythm',
    text: met === 0 ? `Goals for the year: none met this time. Three new ones come with the fall class.` : `Goals for the year: ${met} of ${year.goals.length} met. They paid ${paid}.`,
    data: { yearDone: 1, met },
  });
}

// ------------------------------------------------- moments of the calendar --

interface MomentTime {
  kind: MomentKind;
  key: string;
  at: number;
  week: Week;
  /** Which finals: the fall's or the spring's. */
  which: string;
}

/** The moments of this year and the next, with the tick each comes. */
function momentTimes(state: GameState): MomentTime[] {
  const week = state.clock.week;
  const next: Week = { year: week.year + 1, start: week.start + yearLength(week), extra: 0 };
  const out: MomentTime[] = [];
  for (const w of [week, next]) {
    out.push({ kind: 'homecoming', key: `homecoming:${w.year}`, at: tickOfDate(w, SLOTS[HOMECOMING_SLOT]!.date), week: w, which: '' });
    out.push({ kind: 'rivalry', key: `rivalry:${w.year}`, at: tickOfDate(w, SLOTS[RIVALRY_SLOT]!.date), week: w, which: '' });
    for (const id of ['fallFinals', 'springFinals']) {
      const span = spanOf(w, id);
      if (span) out.push({ kind: 'finals', key: `finals:${w.year}:${id}`, at: span.to - FINALS_MEASURE_BEFORE, week: w, which: id });
    }
    out.push({ kind: 'commencement', key: `commencement:${w.year}`, at: commencementTick(w), week: w, which: '' });
  }
  return out;
}

const dateWords = (tick: number, week: Week): string => formatDate(dateAt({ tick, week }));

/** Open a moment: what it asks, fixed now, and its themed line in the paper. false when this campus cannot be asked it. */
function openMoment(state: GameState, time: MomentTime, log: LogEntry[]): boolean {
  const rhythm = state.rhythm;
  const moment: Moment = { id: rhythm.nextId, kind: time.kind, key: time.key, at: time.at, opened: state.clock.tick, target: 1, param: '', result: null, met: null, measured: null };
  const when = dateWords(time.at, time.week);
  let line = '';
  if (time.kind === 'homecoming') {
    const stadium = state.football.stadium.tier >= 1;
    moment.param = stadium ? 'fill' : 'win';
    line = stadium ? `Homecoming is ${when}. The alumni are coming back, and a full stadium would make their day.` : `Homecoming is ${when}. A win at the rented field would make the alumni's day.`;
  } else if (time.kind === 'rivalry') {
    const home = atHome(RIVALRY_SLOT, time.week.year);
    moment.param = home ? 'home' : 'away';
    const rival = teamName(state, state.football.rival);
    line = home ? `${rival} come to campus on ${when}. The whole school wants them beaten at home.` : `The team plays ${rival} away on ${when}. The whole school wants them beaten.`;
  } else if (time.kind === 'finals') {
    const forecast = stressRead(state, campusLevels(state), seasonCurve({ tick: time.at, week: time.week })).score;
    moment.target = Math.min(100, Math.round(forecast) + FINALS_ROOM);
    moment.param = time.which;
    line = `Finals week ends ${when}. The state asks for Stress of ${moment.target} or lower as the last exams are sat.`;
  } else {
    const seniors = state.cohorts[3] ?? 0;
    if (seniors <= 0) return false;
    moment.target = Math.max(1, Math.floor(seniors * COMMENCEMENT_SHARE));
    line = `Commencement is ${when}. ${moment.target.toLocaleString('en-US')} seniors graduating would fill the lawn.`;
  }
  rhythm.nextId += 1;
  rhythm.moments.push(moment);
  bump(rhythm, `opened:${time.kind}`);
  // The shortest notice any moment has had, in ticks: the long run checks it is never under a day and a half.
  rhythm.tally.leastLead = Math.min(rhythm.tally.leastLead ?? Infinity, time.at - state.clock.tick);
  if (time.kind === 'finals') addTimer(state, time.at, 'moment', moment.id);
  log.push({ tick: state.clock.tick, kind: 'rhythm', text: line, data: { moment: moment.id } });
  return true;
}

/** Record how a moment went, with its line in the paper. */
function measure(state: GameState, moment: Moment, result: number, met: boolean, line: string, log: LogEntry[]): void {
  moment.result = result;
  moment.met = met;
  moment.measured = state.clock.tick;
  bump(state.rhythm, `${met ? 'met' : 'missed'}:${moment.kind}`);
  log.push({ tick: state.clock.tick, kind: 'rhythm', text: met ? `${line} The order is done: claim it on the board.` : line, data: { moment: moment.id, met: met ? 1 : 0 } });
}

const waiting = (state: GameState, kind: MomentKind): Moment | undefined => state.rhythm.moments.find((one) => one.kind === kind && one.met === null);

// ------------------------------------------------------- what the sim tells --

/** The start of each of the campus's days: moments that are near open, goals are set if none are, and the gone are cleared. */
function openMoments(state: GameState, log: LogEntry[]): void {
  const rhythm = state.rhythm;
  const tick = state.clock.tick;
  for (const time of momentTimes(state)) {
    if (rhythm.opened.includes(time.key)) continue;
    const ahead = time.at - tick;
    if (ahead > MOMENT_OPEN_HOURS * TICKS_PER_HOUR || ahead < MOMENT_LEAST_HOURS * TICKS_PER_HOUR) continue;
    rhythm.opened.push(time.key);
    openMoment(state, time, log);
  }
  // Only the last few keys are needed to keep a moment from opening twice.
  if (rhythm.opened.length > 24) rhythm.opened = rhythm.opened.slice(-24);
}

/** True on the tick a fall class moves in: what is asked waits until the class is here. */
const fallIntakeNow = (state: GameState): boolean => eventsAt(state.clock).includes('fallIntake');

export function rhythmOnDayStart(state: GameState, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  const rhythm = state.rhythm;
  const tick = state.clock.tick;
  // On the day a fall class moves in, the moments and the goals wait for it: they are read from the campus it fills.
  if (fallIntakeNow(state)) return;
  openMoments(state, log);
  // One that went by unmet leaves after a while. One whose moment never came (a game not played) goes the same way.
  rhythm.moments = rhythm.moments.filter((one) => {
    if (one.met === false) return tick - (one.measured ?? tick) < MOMENT_MISSED_HOURS * TICKS_PER_HOUR;
    if (one.met === null && tick > one.at + TICKS_PER_DAY) return false;
    return true;
  });
  // A campus that met the layer mid-year, or a year whose move-in came before the goals could be set: set them now.
  const phase = calendarAt(state.clock).phase;
  if (rhythm.year === null && phase !== 'founding' && phase !== 'summer' && phase !== 'moveIn' && (rhythm.lastYear?.year ?? 0) < state.clock.week.year) setYearGoals(state, log);
}

/** The fall class has moved in: the year's goals are set. */
export function rhythmOnFallIntake(state: GameState, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  if (state.rhythm.year?.year !== state.clock.week.year) setYearGoals(state, log);
  openMoments(state, log);
}

/** A football game is over: Homecoming and the rivalry are measured. */
export function rhythmOnGame(state: GameState, slot: number, won: boolean, home: boolean, crowd: number, seats: number, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  if (slot === HOMECOMING_SLOT && home) {
    const moment = waiting(state, 'homecoming');
    if (!moment) return;
    if (moment.param === 'fill') {
      const full = seats > 0 && crowd >= seats * SELL_OUT_SHARE;
      measure(state, moment, crowd, full, full ? `Homecoming: a full house of ${crowd.toLocaleString('en-US')}.` : `Homecoming: ${crowd.toLocaleString('en-US')} of ${seats.toLocaleString('en-US')} seats filled. There is always next year.`, log);
    } else measure(state, moment, won ? 1 : 0, won, won ? 'Homecoming: a win for the alumni.' : 'Homecoming: a loss, but the alumni had a good day. There is always next year.', log);
  } else if (slot === RIVALRY_SLOT) {
    const moment = waiting(state, 'rivalry');
    if (!moment) return;
    const rival = teamName(state, state.football.rival);
    measure(state, moment, won ? 1 : 0, won, won ? `The rivalry: ${rival} beaten.` : `The rivalry: ${rival} won this one. There is always next year.`, log);
  }
}

/** Commencement: the seniors who graduated are counted, and the year's goals are paid. */
export function rhythmOnGraduation(state: GameState, seniors: number, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  const moment = waiting(state, 'commencement');
  if (moment) {
    const met = seniors >= moment.target;
    measure(state, moment, seniors, met, met ? `Commencement: ${seniors.toLocaleString('en-US')} seniors graduated.` : `Commencement: ${seniors.toLocaleString('en-US')} of the ${moment.target.toLocaleString('en-US')} hoped for graduated. There is always next year.`, log);
  }
  payYear(state, log);
}

/** A moment measured on the clock: finals week, as the last exams are sat. */
export function rhythmOnTimer(state: GameState, id: number, log: LogEntry[]): void {
  const moment = state.rhythm?.moments.find((one) => one.id === id && one.met === null);
  if (!moment || moment.kind !== 'finals') return;
  const stress = Math.round(state.term.lastStress);
  const met = stress <= moment.target;
  measure(state, moment, stress, met, met ? `Finals week: Stress held at ${stress}.` : `Finals week: Stress reached ${stress}, over the ${moment.target} asked. There is always next term.`, log);
}

/** A line waiting from an action is told on the next tick. */
export function tellRhythm(state: GameState, log: LogEntry[]): void {
  const news = state.rhythm?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'rhythm', text, data: { claimed: 1 } });
  state.rhythm.news = [];
}

/** What a moment pays on this campus now: cash on the campus's count, out of the year's allowance. */
export function momentPays(state: GameState, kind: MomentKind): MomentReward[] {
  return MOMENTS[kind].pays
    .map((pay): MomentReward => (pay.kind === 'cash' ? { kind: 'cash', amount: Math.min(pay.amount * scaleOf(state), orderCashLeft(state)) } : pay))
    .filter((pay) => pay.amount > 0);
}

/**
 * What a moment pays, in words. `upTo` for one still to come: its grant comes out of the year's allowance, which may
 * be smaller by then (DESIGN.md 47).
 */
export function momentPayWords(pays: readonly MomentReward[], upTo = false): string {
  const parts = pays.map((pay) => (pay.kind === 'xp' ? `${pay.amount.toLocaleString('en-US')} experience` : pay.kind === 'seals' ? `${pay.amount} Gold ${pay.amount === 1 ? 'Seal' : 'Seals'}` : `a grant of ${upTo ? 'up to ' : ''}${dollars(pay.amount)}`));
  return parts.length <= 1 ? (parts[0] ?? 'nothing') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Claim a moment that went well. Pays and leaves the board. */
export function claimMoment(state: GameState, id: number): { pays: MomentReward[] } | string {
  const rhythm = state.rhythm;
  const moment = rhythm.moments.find((one) => one.id === id);
  if (!moment) return 'That is not on the board.';
  if (moment.met !== true) return moment.met === false ? 'That one went by. There is always next year.' : 'That has not come yet.';
  const pays = momentPays(state, moment.kind);
  const paid: MomentReward[] = [];
  for (const pay of pays) {
    if (pay.kind === 'xp') {
      gainXp(state, pay.amount);
      paid.push(pay);
    } else if (pay.kind === 'seals') {
      state.daily.seals += pay.amount;
      paid.push(pay);
    } else {
      const got = grant(state, pay.amount);
      if (got > 0) paid.push({ kind: 'cash', amount: got });
    }
  }
  rhythm.moments = rhythm.moments.filter((one) => one.id !== id);
  bump(rhythm, `claimed:${moment.kind}`);
  for (const pay of paid) bump(rhythm, `momentPaid:${pay.kind}`, pay.amount);
  rhythm.news.push(`${MOMENTS[moment.kind].name}: claimed. It paid ${momentPayWords(paid)}.`);
  return { pays: paid };
}

// -------------------------------------------------------------- the views --

export interface GiftView {
  ready: boolean;
  /** Which box is next, 1 to 7. */
  next: number;
  boxes: Array<{ n: number; words: string; seals: number; decor: string | null; cash: number; xp: number; filled: boolean; next: boolean; best: boolean }>;
}

/** The card. null on a campus without the layer. */
export function giftView(state: GameState): GiftView | null {
  if (!hasDaily(state)) return null;
  const rhythm = state.rhythm;
  const ready = giftReady(state);
  return {
    ready,
    next: rhythm.box + 1,
    boxes: GIFT_CARD.map((box, n) => {
      const would = giftOf(state, box);
      const parts = [`${would.xp} experience`];
      if (would.cash > 0) parts.push(dollars(would.cash));
      if (would.seals > 0) parts.push(would.seals === 1 ? 'a Gold Seal' : `${would.seals} Gold Seals`);
      if (would.decor) parts.push('a decoration');
      return { n: n + 1, words: parts.join(' · '), seals: would.seals, decor: would.decor, cash: would.cash, xp: would.xp, filled: n < rhythm.box, next: n === rhythm.box, best: n === GIFT_CARD.length - 1 };
    }),
  };
}

export interface YearRow {
  words: string;
  level: YearLevel;
  /** "4 of 7", "Happiness now 74", "Level 31 of 34". */
  progress: string;
  share: number;
  done: boolean;
  pays: string;
}

export interface YearView {
  /** The goals of this year, or null between commencement and move-in. */
  rows: YearRow[] | null;
  /** "Paid at commencement, in 3 d 4 h" or how last year went. */
  note: string;
}

const LEVEL_WORD: Record<YearLevel, string> = { easy: 'Easy', medium: 'Medium', stretch: 'Stretch' };

/** The Year row of the board. null on a campus without the layer. */
export function yearView(state: GameState, left: (ticks: number) => string): YearView | null {
  if (!hasDaily(state)) return null;
  const rhythm = state.rhythm;
  const year = rhythm.year;
  if (!year) {
    const last = rhythm.lastYear;
    return { rows: null, note: last ? `Last year: ${last.met} of ${last.of} goals met. Three new ones come with the fall class.` : 'Three goals for the year come with the fall class.' };
  }
  const rows = year.goals.map((goal) => {
    const kind = kindOf(goal.kind)!;
    const at = yearProgress(state, goal);
    const pay = yearPay(goal);
    let progress: string;
    let share: number;
    if (kind.measure.kind === 'counted') {
      progress = `${Math.min(at.value, goal.target - goal.from)} of ${goal.target - goal.from}`;
      share = Math.min(1, at.value / Math.max(1, goal.target - goal.from));
    } else if (kind.measure.kind === 'level') {
      progress = `Level ${at.value} of ${goal.target}`;
      share = Math.min(1, (at.value - goal.from) / Math.max(1, goal.target - goal.from));
    } else if (kind.measure.kind === 'happiness') {
      progress = `Happiness now ${at.value}`;
      share = Math.min(1, at.value / Math.max(1, goal.target));
    } else {
      progress = `$${at.value.toFixed(2)} kept now`;
      share = Math.min(1, at.value / Math.max(1, goal.target));
    }
    const paysWords = [`${pay.xp} experience`, pay.seals > 0 ? `${pay.seals} Gold ${pay.seals === 1 ? 'Seal' : 'Seals'}` : ''].filter(Boolean).join(' and ');
    return { words: yearWords(goal), level: goal.level, progress: `${LEVEL_WORD[goal.level]} · ${progress}`, share, done: at.done, pays: paysWords };
  });
  return { rows, note: `Paid at commencement, in ${left(Math.max(0, year.until - state.clock.tick))}.` };
}

export interface MomentRow {
  id: number;
  name: string;
  ask: string;
  /** When it comes, or how it went. */
  when: string;
  done: boolean;
  missed: boolean;
  pays: string;
}

/** The calendar's special orders on the board, soonest first. */
export function momentViews(state: GameState, left: (ticks: number) => string): MomentRow[] {
  if (!hasDaily(state)) return [];
  return [...state.rhythm.moments]
    .sort((a, b) => a.at - b.at)
    .map((moment) => {
      const spec = MOMENTS[moment.kind];
      let ask = '';
      if (moment.kind === 'homecoming') ask = moment.param === 'fill' ? 'Fill the stadium for Homecoming' : 'Win the Homecoming game';
      else if (moment.kind === 'rivalry') ask = `Beat ${teamName(state, state.football.rival)}${moment.param === 'home' ? ' at home' : ' away'}`;
      else if (moment.kind === 'finals') ask = `Keep Stress at ${moment.target} or lower through finals`;
      else ask = `Graduate ${moment.target.toLocaleString('en-US')} seniors`;
      const when =
        moment.met === true ? 'Done' : moment.met === false ? 'It went by. There is always next year' : moment.at > state.clock.tick ? `In ${left(moment.at - state.clock.tick)}` : 'Today';
      return { id: moment.id, name: spec.name, ask, when, done: moment.met === true, missed: moment.met === false, pays: momentPayWords(momentPays(state, moment.kind), moment.met !== true) };
    });
}

/** How many moments wait to be claimed. For the board's button. */
export function momentsDone(state: GameState): number {
  return hasDaily(state) ? state.rhythm.moments.filter((one) => one.met === true).length : 0;
}
