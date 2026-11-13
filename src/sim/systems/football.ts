import { fansLift } from './boosts';
import { fansMore, freeSeats } from './policies';
import { dailyOnHomeGame } from './daily';
import { ordersOnHomeGame } from './orders';
import { rhythmOnGame } from './rhythm';
import { calendarAt, dateAt, tickOfDate } from '../calendar';
import {
  ATHLETICS_OPERATIONS,
  ATHLETICS_STAFF,
  ATHLETICS_STAFF_PAY,
  COACH_FULL_PAY_STUDENTS,
  FIELD_RENT_PER_STUDENT,
  OPERATIONS_PER_STUDENT,
  STUDENTS_PER_ATHLETICS_STAFF,
  BOWL_DATE,
  BOWLS,
  CANDIDATE_SPREAD,
  CLASS_BASE,
  CLASS_FROM,
  CLASS_NOISE,
  COACH_CANDIDATES,
  COACH_ENDS,
  COACH_FIRST,
  COACH_GROWTH,
  COACH_PAY_FLOOR,
  COACH_PAY_PER_POINT,
  COACH_STARTS,
  CONCESSIONS_PER_FAN,
  CONFERENCE_BAND,
  CONFERENCE_NAMES,
  CONTRACT_YEARS,
  DEFAULT_COLOUR,
  DEFAULT_PRICE_STEP,
  DIVISION_ROUNDS,
  DIVISION_SIZE,
  FANS,
  FIELD_RENT,
  FOUNDING_CLASSES,
  FOUNDING_COACH_RATING,
  FUNDING_FULL,
  GAME_DAY_BEFORE_TICKS,
  GAME_TICKS,
  HOME_EDGE,
  HOME_GAMES_PER_YEAR,
  HOMECOMING_SLOT,
  MAX_TIER,
  NICKNAMES,
  NOISE_RADIUS,
  PRICE_DEMAND,
  QUARTER_TICKS,
  RATING_WEIGHTS,
  RIVALRY_SLOT,
  ROSTER_SIZE,
  SCRIMMAGE_AFTER_TICKS,
  SCRIMMAGE_MIN_FOUNDING_TICKS,
  SEASON_STANDING,
  SEATS,
  SELL_OUT,
  SLOT_KINDS,
  SLOTS,
  STADIUM_UPKEEP,
  STADIUM_UTILITIES,
  STANDING_LIFT,
  STANDING_PULL,
  STAR_CHANCE,
  STAR_GAIN,
  STAR_MISS,
  SUPERFAN_ATTENDANCE,
  SUPERFAN_SHARE,
  TICKET_PRICE,
  TIER_COST,
  TIER_SCORE,
  TITLE_DATE,
  TOP_BOWL_DATE,
  TRAIT_BONUS,
  TV_LIFT,
  WIN_K,
  type CoachTrait,
} from '../config/football';
import { FIRST_INTAKE_TICK, TICKS_PER_HOUR } from '../config/time';
import { hashInts, nextFloat, nextInt } from '../rng';
import { smallCount } from '../scale';
import { enrollment } from '../selectors';
import { addTimer } from '../timers';
import type { Coach, Field, Football, Game, GameState, LogEntry, Poll, RngState, SeasonState, Standing } from '../types';
import { markRatesDirty } from './money';

/**
 * Football (DESIGN.md section 10). A twelve-team conference drawn from the
 * national field, ten games on the Saturdays of the calendar, a title game,
 * bowls and a poll. Every game is rolled whole at its kickoff from the
 * football random stream, so the season is the same however the time was
 * reached, and the result waits in the away list for a player who was not
 * watching.
 *
 * In the lists here the player's team is -1 and every other team is its index
 * in the field's schools.
 */

export const ME = -1;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const round1 = (value: number): number => Math.round(value * 10) / 10 + 0;

// ---------------------------------------------------------------- set-up --

/**
 * What a coach of a given rating is paid a year. Football is one programme of
 * real size on any campus (DESIGN.md 35.9): its coach, its stadium and its TV
 * deal do not follow the campus scale. Only the crowd that wants a ticket
 * does, because it follows enrollment.
 */
export function coachPay(rating: number): number {
  return Math.max(COACH_PAY_FLOOR, Math.round(((rating - 20) * COACH_PAY_PER_POINT) / 1000) * 1000);
}

const TRAIT_IDS: readonly CoachTrait[] = ['recruiter', 'tactician', 'developer', 'showman'];

function makeCoach(rng: RngState, rating: number, until: number): Coach {
  const name = `${COACH_FIRST[nextInt(rng, 'football', COACH_FIRST.length)]} ${COACH_STARTS[nextInt(rng, 'football', COACH_STARTS.length)]}${COACH_ENDS[nextInt(rng, 'football', COACH_ENDS.length)]}`;
  const rated = Math.round(clamp(rating, 20, 95));
  return { name, rating: rated, trait: TRAIT_IDS[nextInt(rng, 'football', TRAIT_IDS.length)]!, pay: coachPay(rated), until };
}

/**
 * A new programme: a nickname, a conference of eleven rivals from the middle
 * of the field, a founding coach on a three-year contract, and a roster of
 * four modest classes. `firstYear` is the first game year it plays a season.
 */
export function newFootball(rng: RngState, field: Field, firstYear: number): Football {
  const byPedigree = field.schools.map((school, id) => ({ id, fp: school.fp })).sort((a, b) => b.fp - a.fp || a.id - b.id);
  const from = Math.floor(byPedigree.length * CONFERENCE_BAND[0]);
  const to = Math.floor(byPedigree.length * CONFERENCE_BAND[1]);
  const band = byPedigree.slice(from, to).map((entry) => entry.id);
  const rivals: number[] = [];
  while (rivals.length < DIVISION_SIZE * 2 - 1) {
    const pick = band.splice(nextInt(rng, 'football', band.length), 1)[0]!;
    rivals.push(pick);
  }
  return {
    firstYear,
    nick: NICKNAMES[nextInt(rng, 'football', NICKNAMES.length)]!,
    colour: DEFAULT_COLOUR,
    conference: `${CONFERENCE_NAMES[nextInt(rng, 'football', CONFERENCE_NAMES.length)]} Conference`,
    divisions: [[ME, ...rivals.slice(0, DIVISION_SIZE - 1)], rivals.slice(DIVISION_SIZE - 1)],
    rival: rivals[0]!,
    coach: makeCoach(rng, FOUNDING_COACH_RATING, firstYear + CONTRACT_YEARS - 1),
    candidates: [],
    classes: [...FOUNDING_CLASSES],
    pitch: 'safe',
    season: null,
    stadium: { plot: null, tier: 0, price: DEFAULT_PRICE_STEP, earned: 0, work: null, gate: [], average: 0 },
    tv: { perYear: 0, until: 0 },
    standing: 20,
    record: { w: 0, l: 0, seasons: 0, titles: 0, bowls: 0, best: 0 },
    poll: null,
    last: null,
    bigWin: 0,
  };
}

/** Three coaches to choose from when the job is open, around the level the programme has reached. */
export function makeCandidates(state: GameState): Coach[] {
  const level = (state.football.coach.rating + teamRating(state).total) / 2;
  const until = state.clock.week.year + CONTRACT_YEARS;
  const found: Coach[] = [];
  for (let n = 0; n < COACH_CANDIDATES; n++) {
    const rating = level + (n - 1) * (CANDIDATE_SPREAD / 2) + (nextFloat(state.rng, 'football') * 2 - 1) * (CANDIDATE_SPREAD / 2);
    let coach = makeCoach(state.rng, rating, until);
    // No two on the list share a first name, with each other or with the coach they would replace.
    const first = (name: string): string => name.split(' ')[0]!;
    for (let tries = 0; tries < 6 && [state.football.coach, ...found].some((other) => first(other.name) === first(coach.name)); tries++) coach = makeCoach(state.rng, rating, until);
    found.push(coach);
  }
  return found;
}

// --------------------------------------------------------------- ratings --

export interface TeamRating {
  coach: number;
  roster: number;
  stadium: number;
  funding: number;
  total: number;
}

/** The team's rating and the four things it is made of, each on the field's 0 to 100. */
export function teamRating(state: GameState): TeamRating {
  const f = state.football;
  const coach = f.coach.rating + (f.coach.trait === 'tactician' ? TRAIT_BONUS.tactician : 0);
  const talent = f.classes.reduce((sum, value) => sum + value, 0) / Math.max(1, f.classes.length);
  const roster = talent + (f.coach.trait === 'developer' ? TRAIT_BONUS.developer : 0);
  const stadium = TIER_SCORE[f.stadium.tier] ?? 0;
  const funding = FUNDING_FULL;
  const total = RATING_WEIGHTS.coach * coach + RATING_WEIGHTS.roster * roster + RATING_WEIGHTS.stadium * stadium + RATING_WEIGHTS.funding * funding;
  return { coach, roster, stadium, funding, total: round1(total) };
}

/** A team's rating: the player's from its four inputs, any other school's from the field. */
export function ratingOf(state: GameState, team: number): number {
  return team === ME ? teamRating(state).total : (state.field.schools[team]?.fr ?? 0);
}

export function teamName(state: GameState, team: number): string {
  return team === ME ? state.school.name : (state.field.schools[team]?.name ?? 'a visiting school');
}

/** The chance the first of two ratings wins. `edge` is what the home field is worth to it. */
export function winChance(rating: number, against: number, edge = 0): number {
  return 1 / (1 + Math.exp(-(rating + edge - against) / WIN_K));
}

/** The input of the player's team that is furthest behind an opponent: the gap a loss recap names. */
function biggestGap(rating: TeamRating, against: number): string {
  const parts: Array<[string, number]> = [
    ['the coach', rating.coach],
    ['the roster', rating.roster],
    ['the stadium', rating.stadium],
  ];
  let name = 'the roster';
  let lowest = Infinity;
  for (const [part, value] of parts) {
    if (value < lowest) {
      lowest = value;
      name = part;
    }
  }
  if (lowest >= against) return '';
  // A team at a rented field has no stadium to rate.
  if (name === 'the stadium' && lowest === 0) return 'the stadium: the team has none of its own yet';
  return `${name}, which rates ${Math.round(lowest)} against their ${Math.round(against)}`;
}

// -------------------------------------------------------------- schedule --

/** True when football is being played in this game year. */
export function hasSeason(state: GameState): boolean {
  return state.clock.week.year >= state.football.firstYear;
}

/** The tick a slot's game kicks off this year: the first tick of its Saturday. */
export function slotKick(state: GameState, slot: number): number {
  const week = state.clock.week;
  if (slot === 10) return tickOfDate(week, TITLE_DATE);
  if (slot === 11) return tickOfDate(week, BOWL_DATE);
  if (slot === 12) return tickOfDate(week, TOP_BOWL_DATE);
  return tickOfDate(week, SLOTS[slot]!.date);
}

/** True when the player's team is at home for a slot in a year. The rivalry is at home in odd years. */
export function atHome(slot: number, year: number): boolean {
  const home = SLOTS[slot]!.home;
  return home === 'rivalry' ? year % 2 === 1 : home;
}

export interface Pairing {
  home: number;
  away: number;
  /** A conference game, and one inside a division. */
  conf: boolean;
  div: boolean;
}

/**
 * The games of one Saturday for all twelve teams. Every team plays ten: an
 * opener against a school from outside, its five division mates once, and
 * four of the six teams of the other division, which turn with the years.
 */
export function pairings(state: GameState, slot: number): Pairing[] {
  const f = state.football;
  const year = state.clock.week.year;
  const [north, south] = f.divisions;
  const kind = SLOT_KINDS[slot]!;
  const games: Pairing[] = [];
  const host = (a: number, b: number): [number, number] => {
    // The player's own games follow the calendar. Any other game is hosted by a toss of the year and the slot.
    if (a === ME) return atHome(slot, year) ? [a, b] : [b, a];
    if (b === ME) return atHome(slot, year) ? [b, a] : [a, b];
    return hashInts(state.seed, year, slot, a, b) % 2 === 0 ? [a, b] : [b, a];
  };
  if (kind === 'opener') {
    // Twelve schools from outside the conference, the same twelve for a team every year it comes round.
    const inside = new Set([...north, ...south]);
    const outside: number[] = [];
    for (let id = 0; id < state.field.schools.length; id++) if (!inside.has(id)) outside.push(id);
    [...north, ...south].forEach((team, n) => {
      const guest = outside[hashInts(state.seed, year, 4111, n) % outside.length]!;
      const [home, away] = host(team, guest);
      games.push({ home, away, conf: false, div: false });
    });
    return games;
  }
  if (kind === 'division') {
    // The rivalry round is played last. The other four fill the division slots in order.
    const divisionSlots = SLOT_KINDS.map((k, n) => (k === 'division' ? n : -1)).filter((n) => n >= 0);
    const round = slot === RIVALRY_SLOT ? 0 : divisionSlots.indexOf(slot) + 1;
    for (const division of [north, south]) {
      for (const [a, b] of DIVISION_ROUNDS[round]!) {
        const [home, away] = host(division[a]!, division[b]!);
        games.push({ home, away, conf: true, div: true });
      }
    }
    return games;
  }
  const crossSlots = SLOT_KINDS.map((k, n) => (k === 'cross' ? n : -1)).filter((n) => n >= 0);
  const turn = crossSlots.indexOf(slot) + year;
  for (let i = 0; i < DIVISION_SIZE; i++) {
    const [home, away] = host(north[i]!, south[(i + turn) % DIVISION_SIZE]!);
    games.push({ home, away, conf: true, div: false });
  }
  return games;
}

const emptyStanding = (): Standing => ({ w: 0, l: 0, cw: 0, cl: 0, dw: 0, dl: 0 });

/** The fall anchor: a new season is laid out, and every school outside the conference gets its year's record. */
export function startSeason(state: GameState, log: LogEntry[]): void {
  if (!hasSeason(state)) return;
  const f = state.football;
  const year = state.clock.week.year;
  const table: Record<string, Standing> = {};
  const inside = [...f.divisions[0], ...f.divisions[1]];
  for (const team of inside) table[String(team)] = emptyStanding();
  const conference = new Set(inside);
  state.field.schools.forEach((school, id) => {
    if (conference.has(id)) {
      school.w = 0;
      school.l = 0;
      return;
    }
    // One sampled record for the year: a better school wins more of its ten.
    const wins = clamp(Math.round(10 * winChance(school.fr, 50) + (nextFloat(state.rng, 'football') * 2 - 1) * 2), 0, 10);
    school.w = wins;
    school.l = 10 - wins;
  });

  const games: Game[] = [];
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const mine = pairings(state, slot).find((game) => game.home === ME || game.away === ME)!;
    const home = mine.home === ME;
    const kick = slotKick(state, slot);
    games.push({ slot, label: SLOTS[slot]!.label ?? '', opp: home ? mine.away : mine.home, home, kick, us: [], them: [], crowd: 0, seats: 0, rating: 0, oppRating: 0, gap: '', done: false });
    // An hour before a home game the campus turns out, and what food earns rises with it.
    if (home) addTimer(state, kick - GAME_DAY_BEFORE_TICKS, 'kickoff', 100 + slot);
    addTimer(state, kick, 'kickoff', slot);
  }
  f.season = { year, games, table, pending: [], played: 0, champion: null, bowl: '', closed: false, streak: 0 };
  f.stadium.gate = [];
  f.poll = makePoll(state, 'Preseason');
  const first = games[0]!;
  log.push({
    tick: state.clock.tick,
    kind: 'football',
    text: `The football season opens on Saturday, September 5, ${first.home ? 'at home to' : 'away at'} ${teamName(state, first.opp)}. The preseason poll has ${state.school.name} at No. ${f.poll.mine} of 200.`,
    data: { year },
  });
}

// ------------------------------------------------------------- the crowd --

/** Alumni: everyone who has graduated. */
function alumni(state: GameState): number {
  return state.stats.graduates;
}

/** The share of students who are Superfans today. More with standing, doubled on a home game day and after a big win. */
export function superfanShare(state: GameState): number {
  if (!hasSeason(state)) return 0;
  const f = state.football;
  const base = SUPERFAN_SHARE.floor + (SUPERFAN_SHARE.top - SUPERFAN_SHARE.floor) * (f.standing / 100);
  const lit = homeGameNow(state) !== null || (f.bigWin > 0 && state.clock.tick - f.bigWin < 6 * TICKS_PER_HOUR);
  return lit ? base * 2 : base;
}

/** The share of students who are Varsity Athletes: the roster. */
export function athleteShare(state: GameState): number {
  const students = enrollment(state);
  if (!hasSeason(state) || students <= 0) return 0;
  return Math.min(0.15, ROSTER_SIZE / students);
}

/** How many people want a ticket to a home game at today's price. `big` is Homecoming or the rivalry. */
export function fanDemand(state: GameState, big = false): number {
  const f = state.football;
  const students = enrollment(state);
  const region = f.standing * FANS.perStandingPerStudent * students;
  let fans = students * FANS.students + alumni(state) * FANS.alumni + region;
  fans *= PRICE_DEMAND[f.stadium.price] ?? 1;
  fans *= 1 + FANS.streak * Math.min(5, f.season?.streak ?? 0);
  // Superfans come to everything and bring friends: a little more with each one in a hundred students.
  fans *= 1 + SUPERFAN_ATTENDANCE * (SUPERFAN_SHARE.floor + (SUPERFAN_SHARE.top - SUPERFAN_SHARE.floor) * (f.standing / 100));
  if (f.coach.trait === 'showman') fans *= 1 + TRAIT_BONUS.showman;
  if (big) fans *= FANS.bigGame;
  // A pep rally, a parade, adverts on the scoreboard: what the desk has set going, for a few days.
  fans *= 1 + fansLift(state);
  // A policy that fills the stands: a free student section does (DESIGN.md 41.7).
  fans *= 1 + fansMore(state);
  return Math.round(fans);
}

/** The seats the team plays in front of today. */
export function seatsNow(state: GameState): number {
  return seatsAt(state, state.football.stadium.tier);
}

/**
 * The seats of a stadium tier. The stadium is one stadium of real size at any
 * campus scale (DESIGN.md 35.9): a campus that stands for 46,000 students
 * rents a field of 3,000 seats and fills it.
 */
export function seatsAt(_state: GameState, tier: number): number {
  return SEATS[tier] ?? SEATS[0]!;
}

/** What a stadium tier costs to build. The same on any campus. */
export function tierCost(_state: GameState, tier: number): number {
  return TIER_COST[tier] ?? 0;
}

/** The crowd an ordinary home game would draw today: the fans who want to come, as far as there are seats. */
export function expectedCrowd(state: GameState): number {
  return Math.min(seatsNow(state), fanDemand(state));
}

/** A home game that is on or about to be: from an hour before kickoff to the final whistle. null otherwise. */
export function homeGameNow(state: GameState): Game | null {
  const season = state.football.season;
  if (!season) return null;
  const tick = state.clock.tick;
  for (const game of season.games) {
    if (game.home && !game.done && tick >= game.kick - GAME_DAY_BEFORE_TICKS && tick < game.kick + GAME_TICKS) return game;
  }
  return null;
}

/** The game being played right now, home or away, with the score as far as the clock has shown it. */
export function liveGame(state: GameState): { game: Game; quarter: number; us: number; them: number } | null {
  const season = state.football.season;
  if (!season) return null;
  const tick = state.clock.tick;
  for (const game of season.games) {
    if (game.us.length === 0 || game.done || tick < game.kick) continue;
    const quarter = Math.min(4, Math.floor((tick - game.kick) / QUARTER_TICKS) + 1);
    // A quarter's points show once it has been played.
    const shown = Math.min(4, Math.floor((tick - game.kick) / QUARTER_TICKS));
    return { game, quarter, us: sum(game.us.slice(0, shown)), them: sum(game.them.slice(0, shown)) };
  }
  return null;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// --------------------------------------------------------------- a game --

const WINNING_SCORES = [17, 20, 21, 24, 27, 28, 31, 34, 35, 38, 41, 42, 45];
const LOSING_SCORES = [0, 3, 6, 7, 10, 13, 14, 17, 20, 21, 24, 27, 28, 31, 34];

/** Break a score into touchdowns and field goals and scatter them over four quarters. */
function byQuarter(rng: RngState, points: number): number[] {
  const quarters = [0, 0, 0, 0];
  let sevens = Math.floor(points / 7);
  while (sevens > 0 && (points - sevens * 7) % 3 !== 0) sevens -= 1;
  const threes = (points - sevens * 7) / 3;
  for (let n = 0; n < sevens; n++) quarters[nextInt(rng, 'football', 4)]! += 7;
  for (let n = 0; n < threes; n++) quarters[nextInt(rng, 'football', 4)]! += 3;
  return quarters;
}

/** Roll one of the player's games whole: who wins, then the score by quarter. */
function rollMine(state: GameState, game: Game, neutral: boolean): void {
  const rng = state.rng;
  const mine = teamRating(state);
  const theirs = ratingOf(state, game.opp);
  const edge = neutral ? 0 : game.home ? HOME_EDGE : -HOME_EDGE;
  const chance = winChance(mine.total, theirs, edge);
  const won = nextFloat(rng, 'football') < chance;
  // Evenly matched teams play close games. A lopsided match-up, won by the better side, tends to a bigger margin.
  const edgeToWinner = (mine.total + edge - theirs) * (won ? 1 : -1);
  const lean = Math.max(0, edgeToWinner) / 40;
  const winner = WINNING_SCORES[Math.min(WINNING_SCORES.length - 1, Math.floor(Math.pow(nextFloat(rng, 'football'), 1 / (1 + lean)) * WINNING_SCORES.length))]!;
  const below = LOSING_SCORES.filter((score) => score < winner);
  const loser = below[Math.min(below.length - 1, Math.floor(Math.pow(nextFloat(rng, 'football'), 0.55 + 1.6 * lean) * below.length))]!;
  game.us = byQuarter(rng, won ? winner : loser);
  game.them = byQuarter(rng, won ? loser : winner);
  game.rating = mine.total;
  game.oppRating = round1(theirs);
  game.gap = biggestGap(mine, theirs);
}

/** Kickoff: every game of the Saturday is rolled. The other games' results wait for the final whistle. */
export function kickoff(state: GameState, slot: number): void {
  const f = state.football;
  const season = f.season;
  if (!season) return;
  const game = season.games.find((g) => g.slot === slot);
  if (slot >= 10) {
    // The title game or a bowl, on a neutral field.
    if (game && game.us.length === 0) rollMine(state, game, true);
    addTimer(state, state.clock.tick + GAME_TICKS, 'final', slot);
    return;
  }
  season.pending = [];
  for (const pairing of pairings(state, slot)) {
    if (pairing.home === ME || pairing.away === ME) continue;
    const homeWins = nextFloat(state.rng, 'football') < winChance(ratingOf(state, pairing.home), ratingOf(state, pairing.away), HOME_EDGE);
    season.pending.push([homeWins ? pairing.home : pairing.away, homeWins ? pairing.away : pairing.home, pairing.conf ? 1 : 0, pairing.div ? 1 : 0]);
  }
  if (game) {
    rollMine(state, game, false);
    if (game.home) {
      game.seats = seatsNow(state);
      game.crowd = Math.min(game.seats, fanDemand(state, slot === HOMECOMING_SLOT || slot === RIVALRY_SLOT));
    }
  }
  addTimer(state, state.clock.tick + GAME_TICKS, 'final', slot);
}

function credit(table: Record<string, Standing>, winner: number, loser: number, conf: boolean, div: boolean): void {
  const won = table[String(winner)];
  const lost = table[String(loser)];
  if (won) {
    won.w += 1;
    if (conf) won.cw += 1;
    if (div) won.dw += 1;
  }
  if (lost) {
    lost.l += 1;
    if (conf) lost.cl += 1;
    if (div) lost.dl += 1;
  }
}

const people = (n: number): string => n.toLocaleString('en-US');

/** The line for a finished game of the player's team. */
function recap(state: GameState, game: Game): string {
  const us = sum(game.us);
  const them = sum(game.them);
  const won = us > them;
  const opp = teamName(state, game.opp);
  const where = game.slot >= 10 ? '' : game.home ? ' at home' : ` away at ${opp}`;
  const lead = game.label ? `${game.label}: ` : '';
  const score = won ? `${state.school.name} ${us}, ${opp} ${them}` : `${opp} ${them}, ${state.school.name} ${us}`;
  const margin = Math.abs(us - them);
  const upset = won ? game.oppRating - game.rating >= 6 : game.rating - game.oppRating >= 6;
  let tale: string;
  if (won) tale = upset ? 'An upset: they were the favourites.' : margin >= 17 ? 'It was never close.' : margin <= 8 ? 'It went to the last drive.' : 'A solid win.';
  else tale = upset ? 'A game the team should have won.' : margin >= 17 ? 'They were the better side all afternoon.' : margin <= 8 ? 'Close, and not enough.' : 'In it until the fourth quarter.';
  const crowd = game.home && game.seats > 0 ? ` ${people(game.crowd)} came, ${Math.round((100 * game.crowd) / game.seats)}% of the seats.` : '';
  const gap = !won && game.gap ? ` The biggest gap was ${game.gap}.` : '';
  return `${lead}${score}${game.slot < 10 ? `,${where}` : ''}. ${tale}${crowd}${gap}`.replace(',.', '.');
}

/** The final whistle: the Saturday's results go into the table, and the player's game is told. */
export function finalWhistle(state: GameState, slot: number, log: LogEntry[]): void {
  const f = state.football;
  const season = f.season;
  if (!season) return;
  const game = season.games.find((g) => g.slot === slot && !g.done);
  if (game) {
    const won = sum(game.us) > sum(game.them);
    game.done = true;
    season.streak = won ? season.streak + 1 : 0;
    if (slot < 10) {
      const conf = SLOT_KINDS[slot] !== 'opener';
      credit(season.table, won ? ME : game.opp, won ? game.opp : ME, conf, SLOT_KINDS[slot] === 'division');
    } else {
      const mine = season.table[String(ME)]!;
      if (won) mine.w += 1;
      else mine.l += 1;
    }
    if (game.home) {
      f.stadium.gate.push(game.seats > 0 ? game.crowd / game.seats : 0);
      const big = won && (slot === RIVALRY_SLOT || game.oppRating - game.rating >= 6 || sum(game.us) - sum(game.them) >= 17);
      if (big) f.bigWin = state.clock.tick;
    }
    // A game is forty minutes and a date in the game is shorter, so the whistle blows a date or two after kickoff.
    // The result is told under the game's own date, the Saturday on the schedule.
    const played = dateAt({ tick: game.kick, week: state.clock.week });
    log.push({
      tick: state.clock.tick,
      kind: 'game',
      date: played.month * 100 + played.day,
      text: recap(state, game),
      data: { slot, at: game.kick, won: won ? 1 : 0, us: sum(game.us), them: sum(game.them), home: game.home ? 1 : 0, crowd: game.crowd, storm: slot === RIVALRY_SLOT && won && game.home ? 1 : 0 },
    });
    // A home game ending changes what food earns again.
    markRatesDirty(state);
    // The daily layer: a win pays experience, and the game leaves a bonus at the stadium.
    if (game.home) dailyOnHomeGame(state, won, log);
    // And the orders board counts a home win and a full house.
    if (game.home) ordersOnHomeGame(state, won, game.crowd, game.seats);
    // Homecoming and the rivalry are moments of the calendar (DESIGN.md 44).
    rhythmOnGame(state, slot, won, game.home, game.crowd, game.seats, log);
  }
  if (slot < 10) {
    for (const [winner, loser, conf, div] of season.pending) {
      credit(season.table, winner, loser, conf === 1, div === 1);
      // A conference rival's record is kept on the school too, for the poll.
      for (const [team, key] of [[winner, 'w'], [loser, 'l']] as const) {
        const school = state.field.schools[team];
        if (school && season.table[String(team)]) school[key] += 1;
      }
    }
    // The player's opponent of the day is credited above through the table: mirror it onto the school.
    if (game) {
      const school = state.field.schools[game.opp];
      if (school && season.table[String(game.opp)]) school[sum(game.us) > sum(game.them) ? 'l' : 'w'] += 1;
    }
    season.pending = [];
    season.played = slot + 1;
    if (slot === SLOTS.length - 1) endRegularSeason(state, log);
    return;
  }
  if (slot === 10) afterTitle(state, log, game ? (sum(game.us) > sum(game.them) ? ME : game.opp) : null);
  else closeSeason(state, log);
}

// ---------------------------------------------------------- postseason --

/** The best record in a division: conference games first, then division games, then all games, then the rating. */
export function divisionWinner(state: GameState, division: number): number {
  const season = state.football.season!;
  const teams = [...state.football.divisions[division]!];
  teams.sort((a, b) => {
    const x = season.table[String(a)]!;
    const y = season.table[String(b)]!;
    return y.cw - x.cw || y.dw - x.dw || y.w - x.w || ratingOf(state, b) - ratingOf(state, a) || a - b;
  });
  return teams[0]!;
}

/** The standings of one division, best first. */
export function standings(state: GameState, division: number): Array<{ team: number; record: Standing }> {
  const season = state.football.season;
  if (!season) return [];
  const teams = [...state.football.divisions[division]!];
  teams.sort((a, b) => {
    const x = season.table[String(a)]!;
    const y = season.table[String(b)]!;
    return y.cw - x.cw || y.dw - x.dw || y.w - x.w || ratingOf(state, b) - ratingOf(state, a) || a - b;
  });
  return teams.map((team) => ({ team, record: season.table[String(team)]! }));
}

function endRegularSeason(state: GameState, log: LogEntry[]): void {
  const f = state.football;
  const season = f.season!;
  const north = divisionWinner(state, 0);
  const south = divisionWinner(state, 1);
  const kick = slotKick(state, 10);
  if (north === ME || south === ME) {
    const opp = north === ME ? south : north;
    season.games.push({ slot: 10, label: `${f.conference} title game`, opp, home: false, kick, us: [], them: [], crowd: 0, seats: 0, rating: 0, oppRating: 0, gap: '', done: false });
    log.push({ tick: state.clock.tick, kind: 'football', text: `${state.school.name} won its division and plays ${teamName(state, opp)} for the ${f.conference} title on Saturday, December 5.`, data: { title: 1 } });
  }
  addTimer(state, kick, 'kickoff', 10);
}

/** After the title game: the conference has a champion, the poll is taken, and the bowls are filled. */
function afterTitle(state: GameState, log: LogEntry[], winner: number | null): void {
  const f = state.football;
  const season = f.season!;
  if (winner === null) {
    // The player was not in it: the two division winners play it out unseen.
    const north = divisionWinner(state, 0);
    const south = divisionWinner(state, 1);
    winner = nextFloat(state.rng, 'football') < winChance(ratingOf(state, north), ratingOf(state, south)) ? north : south;
    const loser = winner === north ? south : north;
    log.push({ tick: state.clock.tick, kind: 'football', text: `${teamName(state, winner)} won the ${f.conference} title, beating ${teamName(state, loser)}.`, data: { title: 0 } });
  }
  season.champion = winner;
  if (winner === ME) f.record.titles += 1;
  f.poll = makePoll(state, 'End of the regular season');
  const rank = f.poll.mine;
  const mine = season.table[String(ME)]!;
  const bowl = rank <= 2 ? BOWLS[0] : rank <= 12 ? BOWLS[1] : rank <= 30 ? BOWLS[2] : mine.w >= 6 ? BOWLS[3] : '';
  if (bowl === '') {
    closeSeason(state, log);
    return;
  }
  season.bowl = bowl;
  const top = bowl === BOWLS[0];
  const slot = top ? 12 : 11;
  const kick = slotKick(state, slot);
  const opp = bowlOpponent(state, rank);
  season.games.push({ slot: 11, label: bowl, opp, home: false, kick, us: [], them: [], crowd: 0, seats: 0, rating: 0, oppRating: 0, gap: '', done: false });
  addTimer(state, kick, 'kickoff', 11);
  log.push({
    tick: state.clock.tick,
    kind: 'football',
    text: `${state.school.name} is No. ${rank} in the poll and plays ${teamName(state, opp)} in the ${bowl}${top ? ', for the national title' : ''}, on ${top ? 'Monday, January 18' : 'Saturday, December 26'}.`,
    data: { bowl: 1 },
  });
}

/** A bowl opponent from a similar place in the poll, and from outside the conference. */
function bowlOpponent(state: GameState, rank: number): number {
  const f = state.football;
  const inside = new Set([...f.divisions[0], ...f.divisions[1]]);
  const order = pollOrder(state).filter((row) => row.team !== ME && !inside.has(row.team));
  // The top bowl is first against second. Any other is the nearest school in the poll.
  const index = clamp(rank <= 2 ? 0 : rank - 2, 0, order.length - 1);
  return order[index]!.team;
}

/** Every school in the order of the poll: a season's results first, and the strength of the school behind them. */
export function pollOrder(state: GameState): Array<{ team: number; w: number; l: number; score: number }> {
  const f = state.football;
  const season = f.season;
  const rows: Array<{ team: number; w: number; l: number; score: number }> = [];
  const played = season ? season.played : 0;
  const scored = (w: number, l: number, rating: number): number => (w + l > 0 ? (w / (w + l)) * 55 : 27.5) + rating * 0.45;
  state.field.schools.forEach((school, team) => {
    const mine = season?.table[String(team)];
    // A school outside the conference has its whole year's record already. It shows as much of it as has been played.
    const w = mine ? mine.w : Math.round((school.w * played) / 10);
    const l = mine ? mine.l : Math.round((school.l * played) / 10);
    rows.push({ team, w, l, score: scored(w, l, school.fr) + (season?.champion === team ? 3 : 0) });
  });
  const mine = season?.table[String(ME)] ?? emptyStanding();
  rows.push({ team: ME, w: mine.w, l: mine.l, score: scored(mine.w, mine.l, teamRating(state).total) + (season?.champion === ME ? 3 : 0) });
  rows.sort((a, b) => b.score - a.score || a.team - b.team);
  return rows;
}

function makePoll(state: GameState, label: string): Poll {
  const order = pollOrder(state);
  return { year: state.clock.week.year, label, rows: order.slice(0, 25).map((row) => [row.team, row.w, row.l]), mine: order.findIndex((row) => row.team === ME) + 1 };
}

/** The season is over: its record is kept, standing follows it, and a full house all season earns a bigger stadium. */
function closeSeason(state: GameState, log: LogEntry[]): void {
  const f = state.football;
  const season = f.season;
  if (!season || season.closed) return;
  season.closed = true;
  const mine = season.table[String(ME)]!;
  f.poll = makePoll(state, 'Final');
  const rank = f.poll.mine;
  const bowlGame = season.games.find((game) => game.slot === 11);
  const bowlWon = bowlGame ? sum(bowlGame.us) > sum(bowlGame.them) : false;
  if (bowlGame) f.record.bowls += 1;
  f.record.w += mine.w;
  f.record.l += mine.l;
  f.record.seasons += 1;
  if (f.record.best === 0 || rank < f.record.best) f.record.best = rank;

  // Athletic standing moves part of the way toward what this season was worth.
  const worth =
    SEASON_STANDING.base +
    SEASON_STANDING.perWin * mine.w +
    (season.champion === ME ? SEASON_STANDING.title : 0) +
    (bowlGame ? SEASON_STANDING.bowl : 0) +
    (bowlWon ? SEASON_STANDING.bowlWin : 0) +
    (rank <= 25 ? SEASON_STANDING.top25 : 0);
  f.standing = round1(clamp(f.standing + STANDING_PULL * (clamp(worth, 0, 100) - f.standing), 0, 100));

  // The stadium: a season of near sell-outs earns the next tier, which stays earned until it is built.
  const gate = f.stadium.gate;
  let earned = false;
  if (gate.length > 0) {
    const share = sum(gate) / gate.length;
    f.stadium.average = Math.round(share * seatsNow(state));
    if (share >= SELL_OUT && f.stadium.earned <= f.stadium.tier && f.stadium.tier < MAX_TIER) {
      f.stadium.earned = f.stadium.tier + 1;
      earned = true;
    }
  }

  const notes: string[] = [];
  if (season.champion === ME) notes.push(`${f.conference} champions`);
  if (bowlGame) notes.push(`${bowlWon ? 'won' : 'lost'} the ${season.bowl}`);
  const note = notes.length > 0 ? ` ${notes.join(' and ')}.`.replace(/^ (.)/, (_, c: string) => ` ${c.toUpperCase()}`) : '';
  f.last = { year: season.year, w: mine.w, l: mine.l, note: notes.join(', ') };
  log.push({
    tick: state.clock.tick,
    kind: 'football',
    text: `The football season is over: ${mine.w} ${mine.w === 1 ? 'win' : 'wins'} and ${mine.l} ${mine.l === 1 ? 'loss' : 'losses'}.${note} The final poll has ${state.school.name} at No. ${rank} of 200.`,
    data: { keep: 1, wins: mine.w, losses: mine.l, rank },
  });
  if (earned) {
    log.push({
      tick: state.clock.tick,
      kind: 'football',
      text: `Home games were ${Math.round((100 * sum(gate)) / gate.length)}% full all season. That earns a bigger stadium: the choice to build it comes in the spring.`,
      data: { keep: 1, earned: f.stadium.earned },
    });
  }
  markRatesDirty(state);
}

// ------------------------------------------------------------ the year --

/** Signing day: the class the pitch brought in joins the roster, and the oldest class leaves it. */
export function signingDay(state: GameState, log: LogEntry[]): void {
  if (!hasSeason(state)) return;
  const f = state.football;
  const rng = state.rng;
  const record = f.last && f.last.year === state.clock.week.year ? f.last.w / Math.max(1, f.last.w + f.last.l) : 0.5;
  let rating =
    CLASS_BASE +
    CLASS_FROM.standing * f.standing +
    CLASS_FROM.coach * f.coach.rating +
    CLASS_FROM.stadium * (TIER_SCORE[f.stadium.tier] ?? 0) +
    CLASS_FROM.wins * record +
    CLASS_FROM.funding +
    (nextFloat(rng, 'football') * 2 - 1) * CLASS_NOISE +
    (f.coach.trait === 'recruiter' ? TRAIT_BONUS.recruiter : 0);
  let tale = 'A safe class signed.';
  if (f.pitch === 'star') {
    const landed = nextFloat(rng, 'football') < starChance(state);
    rating += landed ? STAR_GAIN : STAR_MISS;
    tale = landed ? 'The star signed, and others followed.' : 'The star signed elsewhere, and the class is thinner for the chase.';
  }
  rating = Math.round(clamp(rating, 10, 98));
  f.classes = [...f.classes.slice(-3), rating];
  f.pitch = 'safe';
  log.push({ tick: state.clock.tick, kind: 'football', text: `Signing day. ${tale} The new class rates ${rating}, and the roster now rates ${Math.round(teamRating(state).roster)}.`, data: { rating } });
}

/** The chance that chasing a star comes off. */
export function starChance(state: GameState): number {
  return Math.min(STAR_CHANCE.most, STAR_CHANCE.base + STAR_CHANCE.perStanding * state.football.standing);
}

/** The year ends for the team: a coach who stays on grows a little, or slips. */
export function footballYearEnd(state: GameState): void {
  if (!hasSeason(state)) return;
  const coach = state.football.coach;
  const roll = nextFloat(state.rng, 'football');
  coach.rating = Math.round(clamp(coach.rating + (roll < 0.25 ? -1 : roll < 0.6 ? 0 : Math.ceil((roll - 0.6) / 0.4 * COACH_GROWTH)), 20, 95));
}

/** The founding scrimmage: a first game two hours after the first class moves in, when the founding day is long enough. */
export function scheduleScrimmage(state: GameState): void {
  const founding = state.clock.week.start - FIRST_INTAKE_TICK;
  if (state.football.firstYear === 1 && founding >= SCRIMMAGE_MIN_FOUNDING_TICKS) addTimer(state, FIRST_INTAKE_TICK + SCRIMMAGE_AFTER_TICKS, 'scrimmage', 0);
}

/** A scrimmage: the team against itself. It counts for nothing and shows there is a team. `kind` 0 is the founding one, 1 the spring game. */
export function scrimmage(state: GameState, kind: number, log: LogEntry[]): void {
  if (!hasSeason(state) && kind === 1) return;
  const rng = state.rng;
  const a = WINNING_SCORES[nextInt(rng, 'football', 6)]!;
  const below = LOSING_SCORES.filter((score) => score < a);
  const b = below[nextInt(rng, 'football', below.length)]!;
  const roster = Math.round(teamRating(state).roster);
  log.push({
    tick: state.clock.tick,
    kind: 'football',
    text:
      kind === 0
        ? `The founding scrimmage: ${state.football.nick} Blue ${a}, ${state.football.nick} White ${b}. ${state.school.name} has a football team.`
        : `The spring game: Blue ${a}, White ${b}. The roster rates ${roster} going into the fall.`,
    data: { scrimmage: kind },
  });
}

// --------------------------------------------------------------- stadium --

/** The tier under construction opens. */
export function stadiumDone(state: GameState, log: LogEntry[]): void {
  const stadium = state.football.stadium;
  if (!stadium.work) return;
  stadium.tier = stadium.work.tier;
  stadium.work = null;
  markRatesDirty(state);
  log.push({ tick: state.clock.tick, kind: 'football', text: `The new stadium is open: ${people(seatsAt(state, stadium.tier))} seats.`, data: { keep: 1, tier: stadium.tier } });
}

/** How loud the stadium is at a cell on a home crowd's scale: 1 at its wall, fading to 0 at the edge of its reach. */
export function noiseAt(state: GameState, x: number, y: number): number {
  const stadium = state.football.stadium;
  const reach = NOISE_RADIUS[stadium.tier] ?? 0;
  if (reach <= 0 || stadium.plot === null) return 0;
  const plot = state.map.placed[stadium.plot];
  if (!plot) return 0;
  const dx = Math.max(plot.x - x, 0, x - (plot.x + plot.w - 1));
  const dy = Math.max(plot.y - y, 0, y - (plot.y + plot.h - 1));
  const distance = Math.max(dx, dy);
  return distance > reach ? 0 : 1 - (distance - 1) / reach;
}

// ----------------------------------------------------------------- money --

/** How much athletic standing and a TV deal lift applications: up to an eighth, and a little more on television. */
export function athleticLift(state: GameState): number {
  if (!hasSeason(state)) return 0;
  const f = state.football;
  return STANDING_LIFT * (f.standing / 100) + (f.tv.perYear > 0 && f.tv.until >= state.clock.week.year ? TV_LIFT : 0);
}

export interface FootballBooks {
  tickets: number;
  tv: number;
  /** The head coach and the athletics staff, before benefits. */
  pay: number;
  /** What the head coach is paid this year: the contract, or a share of it at a small school. */
  coach: number;
  staff: number;
  operations: number;
  /** Upkeep and utilities for the stadium. */
  upkeep: number;
  utilities: number;
  /** The crowd a home game is taken to draw, for the ticket line. */
  crowd: number;
}

/** Football's own lines for a game year, at today's stadium, price and deal. Nothing until the first season. */
export function footballBooks(state: GameState): FootballBooks {
  const none: FootballBooks = { tickets: 0, tv: 0, pay: 0, coach: 0, staff: 0, operations: 0, upkeep: 0, utilities: 0, crowd: 0 };
  // No students, no team: before the first class arrives, and on a campus that has emptied, football costs and earns nothing.
  if (!hasSeason(state) || state.admissions.lastIntake === null || enrollment(state) <= 0) return none;
  const f = state.football;
  const tier = f.stadium.tier;
  // The crowd of the last season with home games, or today's forecast before there has been one.
  const crowd = f.stadium.average > 0 ? Math.min(f.stadium.average, seatsNow(state)) : expectedCrowd(state);
  const students = enrollment(state);
  // Every cost follows the size of the school, and a stadium sets a floor under each.
  // One programme of real size at any campus scale (DESIGN.md 35.9): its floors, its coach and its rent are not
  // multiplied, and its staff, its travel and its game days are sized for the school as the small game counts it.
  // So football costs what it would on a small campus at the same tier, and a full house can pay for it.
  const sized = smallCount(state, students);
  const staff = Math.max(ATHLETICS_STAFF[tier] ?? 0, Math.round(sized / STUDENTS_PER_ATHLETICS_STAFF));
  const coach = Math.round(f.coach.pay * Math.min(1, students / COACH_FULL_PAY_STUDENTS));
  const rent = tier === 0 ? Math.min(FIELD_RENT, students * FIELD_RENT_PER_STUDENT) : 0;
  return {
    // Seats a policy gives away earn no ticket. What the crowd spends inside is earned all the same.
    tickets: HOME_GAMES_PER_YEAR * crowd * ((TICKET_PRICE[f.stadium.price] ?? 0) * (1 - freeSeats(state).share) + CONCESSIONS_PER_FAN),
    tv: f.tv.until >= state.clock.week.year ? f.tv.perYear : 0,
    pay: coach + staff * ATHLETICS_STAFF_PAY,
    coach,
    staff,
    operations: Math.max(ATHLETICS_OPERATIONS[tier] ?? 0, sized * OPERATIONS_PER_STUDENT) + rent,
    upkeep: STADIUM_UPKEEP[tier] ?? 0,
    utilities: STADIUM_UTILITIES[tier] ?? 0,
    crowd,
  };
}

/** Which calendar day of the week a year's football beats fall on, for the tests and the list of what is next. */
export const FOOTBALL_DAYS = { pitch: 3, signing: 5, tv: 6 } as const;
/** Kept for the calendar's use: the day of the week the game year is on. */
export function weekDay(state: GameState): number {
  return calendarAt(state.clock).day;
}
