import { scaleOf } from '../scale';
import { calendarAt, yearLength } from '../calendar';
import { CONTRACT_YEARS, MAX_TIER, SEATS, TIER_BUILD_TICKS, TIER_COST, TRAITS, TV_BASE, TV_BET, TV_BET_YEARS, TV_ROLL, TV_SAFE_YEARS } from '../config/football';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/time';
import { dollars, duration } from '../format';
import { addTimer } from '../timers';
import type { Decision, GameState, LogEntry } from '../types';
import { coachPay, hasSeason, makeCandidates, seatsAt, signingDay, starChance, teamRating, tierCost } from './football';
import { markRatesDirty } from './money';

/**
 * The annual decisions (DESIGN.md 4.4). Each opens as soon as its facts are
 * known, stays open for 48 to 72 hours, and has a default that applies by
 * itself when the window closes, so a player who looks in once a day never
 * misses one and a player who misses a weekend loses nothing but the choice.
 *
 * They are kept as plain items: what is asked, when it opens and closes, the
 * choices, the advisor's pick and the default. The inbox of the next layer
 * shows the same items.
 */

const ADVISOR = 'The Athletic Director';
const PAST_KEPT = 12;

/** The tick the next fall begins: when every decision of the spring and summer closes. */
function fallAnchor(state: GameState): number {
  return state.clock.week.start + yearLength(state.clock.week);
}

function open(state: GameState, log: LogEntry[], decision: Omit<Decision, 'id' | 'opens' | 'chosen' | 'year'>): void {
  const item: Decision = { ...decision, id: state.decisions.nextId, opens: state.clock.tick, chosen: null, year: state.clock.week.year };
  state.decisions.nextId += 1;
  state.decisions.open.push(item);
  const fallback = item.options.find((option) => option.id === item.fallback);
  log.push({
    tick: state.clock.tick,
    kind: 'decision',
    text: `A decision is yours: ${item.title}. It is open for ${duration(item.closes - item.opens)}. Left alone: ${fallback ? fallback.label.toLowerCase() : 'nothing changes'}.`,
    data: { id: item.id, kind: item.kind, closes: item.closes },
  });
}

/** The pitch for next year's signing class. Opens as the regular season ends and closes on signing day. */
function openPitch(state: GameState, log: LogEntry[]): void {
  const chance = Math.round(starChance(state) * 100);
  open(state, log, {
    kind: 'pitch',
    title: 'The recruiting pitch',
    body: 'One choice shapes the class that signs in two days. A class matters for four years: the roster is the last four classes.',
    closes: state.clock.week.start + 4 * TICKS_PER_DAY,
    options: [
      { id: 'safe', label: 'Sign a safe class', detail: 'The class the programme has earned, no better and no worse.', cost: 0 },
      { id: 'star', label: 'Chase a star', detail: `${chance} in 100 that the star signs and the class is 10 points better. Otherwise the class is 5 points worse.`, cost: 0 },
    ],
    fallback: 'safe',
    advised: chance >= 45 ? 'star' : 'safe',
    advisor: ADVISOR,
  });
}

/** The head coach, in the last year of a contract. */
function openCoach(state: GameState, log: LogEntry[]): void {
  const f = state.football;
  const coach = f.coach;
  f.candidates = makeCandidates(state);
  const market = coachPay(coach.rating, scaleOf(state));
  const long = Math.round((market * 1.1) / 1000) * 1000;
  const options: Decision['options'] = [
    { id: 'extend3', label: `Keep ${coach.name} for three more years`, detail: `Rated ${coach.rating}, a ${TRAITS[coach.trait].name}. ${dollars(long)} a year.`, cost: 0 },
    { id: 'extend1', label: `Keep ${coach.name} for one more year`, detail: `Rated ${coach.rating}. ${dollars(market)} a year, the going rate.`, cost: 0 },
  ];
  f.candidates.forEach((candidate, n) => {
    options.push({ id: `hire${n}`, label: `Hire ${candidate.name}`, detail: `Rated ${candidate.rating}, a ${TRAITS[candidate.trait].name}: ${TRAITS[candidate.trait].effect.toLowerCase()}. ${dollars(candidate.pay)} a year for ${CONTRACT_YEARS} years.`, cost: 0 });
  });
  const best = f.candidates.reduce((top, candidate, n) => (candidate.rating > f.candidates[top]!.rating ? n : top), 0);
  const winning = !!f.last && f.last.w >= f.last.l;
  open(state, log, {
    kind: 'coach',
    title: "The head coach's contract",
    body: `${coach.name}'s contract ends this year. The coach is a third of the team's rating, and is paid from Athletics.`,
    closes: fallAnchor(state),
    options,
    fallback: 'extend1',
    advised: f.candidates[best]!.rating >= coach.rating + 6 ? `hire${best}` : winning ? 'extend3' : 'extend1',
    advisor: ADVISOR,
  });
}

/** A bigger stadium, when a season of near sell-outs has earned one. */
function openStadium(state: GameState, log: LogEntry[]): void {
  const stadium = state.football.stadium;
  const tier = stadium.tier + 1;
  const cost = tierCost(state, tier);
  const hours = Math.round((TIER_BUILD_TICKS[tier] ?? 0) / TICKS_PER_HOUR);
  const noPlot = stadium.plot === null;
  open(state, log, {
    kind: 'stadium',
    title: tier === 1 ? 'Build the first stadium' : 'Build a bigger stadium',
    body:
      `Home games sold out all season, which earned ${tier === 1 ? 'a stadium of your own' : `tier ${tier}`}: ${seatsAt(state, tier).toLocaleString('en-US')} seats against ${seatsAt(state, stadium.tier).toLocaleString('en-US')} today. ` +
      `Work takes ${hours} hours and only starts out of season. A bigger stadium is louder for the dorms around it.` +
      (noPlot ? ' First place the stadium plot from the Build menu: two cells by three.' : ''),
    closes: fallAnchor(state),
    options: [
      { id: 'build', label: `Build it for ${dollars(cost)}`, detail: `Opens ${hours} hours after you say yes. The team plays where it does now until then.`, cost },
      { id: 'wait', label: 'Not this year', detail: 'It stays earned. You are asked again next spring.', cost: 0 },
    ],
    fallback: 'wait',
    advised: !noPlot && state.money.cash >= cost * 1.3 ? 'build' : 'wait',
    advisor: ADVISOR,
  });
}

/** What each TV offer would pay a year, at today's stadium and last season's wins. */
export function tvOffers(state: GameState): { safe: number; bet: number; roll: number } {
  const f = state.football;
  // A stadium going up counts as built: it opens before the season the deal is for.
  // A deal is for a programme of this campus's size.
  const base = (TV_BASE[f.stadium.work?.tier ?? f.stadium.tier] ?? 0) * scaleOf(state);
  const wins = f.last?.w ?? 5;
  const round = (value: number): number => Math.round(value / 1000) * 1000;
  return { safe: round(base), bet: round(base * (TV_BET.floor + TV_BET.perWin * wins)), roll: round(f.tv.perYear > 0 ? f.tv.perYear * TV_ROLL : base * TV_ROLL * 0.9) };
}

/** The TV and conference deal, in a year it runs out. */
function openTv(state: GameState, log: LogEntry[]): void {
  const offers = tvOffers(state);
  const wins = state.football.last?.w ?? 5;
  open(state, log, {
    kind: 'tv',
    title: 'The TV and conference deal',
    body: 'The deal is up. A bigger stadium brings better offers, and being on television brings a few more applicants.',
    closes: fallAnchor(state),
    options: [
      { id: 'safe', label: `A safe deal: ${dollars(offers.safe)} a year for ${TV_SAFE_YEARS} years`, detail: 'The same every year, whatever the team does.', cost: 0 },
      { id: 'bet', label: `Bet on the team: ${dollars(offers.bet)} a year for ${TV_BET_YEARS} years`, detail: `Set by last season's ${wins} wins. A good team is back at the table sooner, with more to ask for.`, cost: 0 },
      { id: 'roll', label: `Roll it over: ${dollars(offers.roll)} for one year`, detail: 'A little less than a new deal, and the same question next year.', cost: 0 },
    ],
    fallback: 'roll',
    advised: wins >= 7 ? 'bet' : 'safe',
    advisor: ADVISOR,
  });
}

/** What opens at the anchor of each day of the week. Called as each day begins. */
export function openAnnualDecisions(state: GameState, day: number, log: LogEntry[]): void {
  if (!hasSeason(state)) return;
  const f = state.football;
  const year = state.clock.week.year;
  if (day === 3) openPitch(state, log);
  if (day === 5) {
    if (f.coach.until <= year) openCoach(state, log);
    if (f.stadium.earned > f.stadium.tier && !f.stadium.work && f.stadium.tier < MAX_TIER) openStadium(state, log);
  }
  if (day === 6 && (f.stadium.work?.tier ?? f.stadium.tier) >= 1 && f.tv.until <= year) openTv(state, log);
}

/** Why a choice cannot be made right now, or null when it can. */
export function blocked(state: GameState, decision: Decision, option: string): string | null {
  const picked = decision.options.find((o) => o.id === option);
  if (!picked) return 'That is not one of the choices.';
  if (decision.kind === 'stadium' && option === 'build') {
    if (state.football.stadium.plot === null) return 'Place the stadium plot from the Build menu first.';
    if (state.money.cash < picked.cost) return `It costs ${dollars(picked.cost)} and you have ${dollars(state.money.cash)}.`;
  }
  return null;
}

/** Carry out a choice. Returns what happened, in a few words, for the list of past decisions. */
function carryOut(state: GameState, decision: Decision, option: string, log: LogEntry[] | null): string {
  const f = state.football;
  const year = state.clock.week.year;
  const picked = decision.options.find((o) => o.id === option);
  switch (decision.kind) {
    case 'pitch':
      f.pitch = option === 'star' ? 'star' : 'safe';
      if (log) signingDay(state, log);
      return option === 'star' ? 'Chased a star' : 'Signed a safe class';
    case 'coach': {
      if (option === 'extend3') {
        f.coach.until = year + 3;
        f.coach.pay = Math.round((coachPay(f.coach.rating, scaleOf(state)) * 1.1) / 1000) * 1000;
      } else if (option === 'extend1') {
        f.coach.until = year + 1;
        f.coach.pay = coachPay(f.coach.rating, scaleOf(state));
      } else {
        const hired = f.candidates[Number(option.replace('hire', ''))];
        if (hired) f.coach = { ...hired, until: year + CONTRACT_YEARS };
      }
      f.candidates = [];
      markRatesDirty(state);
      return option.startsWith('hire') ? `Hired ${f.coach.name}` : `Kept ${f.coach.name} to year ${f.coach.until}`;
    }
    case 'stadium': {
      if (option !== 'build' || blocked(state, decision, option)) return 'Not built this year';
      const tier = f.stadium.tier + 1;
      state.money.cash -= picked?.cost ?? 0;
      state.money.yearSpent += picked?.cost ?? 0;
      const done = state.clock.tick + (TIER_BUILD_TICKS[tier] ?? 0);
      f.stadium.work = { tier, done };
      addTimer(state, done, 'stadiumDone', tier);
      return `Building tier ${tier}`;
    }
    case 'tv': {
      const offers = tvOffers(state);
      if (option === 'safe') f.tv = { perYear: offers.safe, until: year + TV_SAFE_YEARS };
      else if (option === 'bet') f.tv = { perYear: offers.bet, until: year + TV_BET_YEARS };
      else f.tv = { perYear: offers.roll, until: year + 1 };
      markRatesDirty(state);
      return `${dollars(f.tv.perYear)} a year to year ${f.tv.until}`;
    }
  }
}

function settle(state: GameState, decision: Decision, option: string, byDefault: boolean, log: LogEntry[] | null): void {
  const outcome = carryOut(state, decision, option, log);
  const list = state.decisions;
  list.open = list.open.filter((item) => item.id !== decision.id);
  list.past.push({ kind: decision.kind, year: decision.year, title: decision.title, outcome, byDefault, tick: state.clock.tick });
  if (list.past.length > PAST_KEPT) list.past.splice(0, list.past.length - PAST_KEPT);
  if (log && byDefault) {
    log.push({ tick: state.clock.tick, kind: 'decision', text: `${decision.title}: nobody chose, so the default applied. ${outcome}.`, data: { keep: 1, kind: decision.kind, byDefault: 1 } });
  }
}

/** Each tick: a decision whose window has closed is settled, by the player's pick or by its default. */
export function stepDecisions(state: GameState, log: LogEntry[]): void {
  const open = state.decisions.open;
  if (open.length === 0) return;
  const tick = state.clock.tick;
  for (const decision of [...open]) {
    if (tick < decision.closes) continue;
    const pick = decision.chosen !== null && !blocked(state, decision, decision.chosen) ? decision.chosen : decision.fallback;
    settle(state, decision, pick, decision.chosen === null, log);
  }
}

/**
 * The player picks. The recruiting pitch can be changed until signing day,
 * when it takes effect. Every other choice takes effect at once and is done.
 * Returns an error in words, or null.
 */
export function choose(state: GameState, id: number, option: string): string | null {
  const decision = state.decisions.open.find((item) => item.id === id);
  if (!decision) return 'That decision has closed.';
  const why = blocked(state, decision, option);
  if (why) return why;
  if (decision.kind === 'pitch') {
    decision.chosen = option;
    state.football.pitch = option === 'star' ? 'star' : 'safe';
    return null;
  }
  decision.chosen = option;
  settle(state, decision, option, false, null);
  return null;
}

/** The anchor moved and the summer is longer: every decision that closed at the old fall anchor closes at the new one. */
export function stretchDecisions(state: GameState, oldClose: number): void {
  const now = fallAnchor(state);
  for (const decision of state.decisions.open) if (decision.closes === oldClose) decision.closes = now;
}

/** The team's rating in a line, for a decision's page. */
export function ratingLine(state: GameState): string {
  const rating = teamRating(state);
  return `Team rating ${Math.round(rating.total)}: coach ${Math.round(rating.coach)}, roster ${Math.round(rating.roster)}, stadium ${Math.round(rating.stadium)}, funding ${Math.round(rating.funding)}.`;
}

/** Kept for the tests: the day of the week it is. */
export function dayOfWeek(state: GameState): number {
  return calendarAt(state.clock).day;
}
