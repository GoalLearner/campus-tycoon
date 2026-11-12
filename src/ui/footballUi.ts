import {
  academicInputs,
  athleticLift,
  budget,
  dateAt,
  DIVISION_NAMES,
  dollars,
  dollarsShort,
  duration,
  expectedCrowd,
  fallClassDraw,
  footballBooks,
  formatDate,
  GAME_TICKS,
  gradeAgainstField,
  hasSeason,
  liveGame,
  ME,
  seatsAt,
  seatsNow,
  standings,
  teamName,
  teamRating,
  TICKET_PRICE,
  timeOfTick,
  TRAITS,
  type Decision,
  type Game,
  type GameState,
} from '../sim';

/**
 * Words and numbers for the Football page, the Decisions list and football's
 * part of the Money panel. Everything here is read from the game state when a
 * page is opened. Nothing is kept.
 */

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const people = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The time of day on the player's own clock at a tick of the game: "6:15 PM". */
export function clockTime(state: GameState, tick: number): string {
  return new Date(timeOfTick(state.clock, tick)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "W 27-7" for a finished game, from the player's side. */
function result(game: Game): string {
  const us = sum(game.us);
  const them = sum(game.them);
  return `${us > them ? 'W' : 'L'} ${us}-${them}`;
}

export interface GameRow {
  date: string;
  where: string;
  opponent: string;
  label: string;
  /** The score once played, "Live" while it is on, or when it kicks off. */
  outcome: string;
  state: 'won' | 'lost' | 'live' | 'ahead';
}

export interface FootballView {
  /** False on a save that has not reached its first season. */
  playing: boolean;
  /** One line for when there is no season yet. */
  waiting: string;
  title: string;
  record: string;
  /** The game being played now, with the score as far as the clock has shown it. */
  live: { quarter: string; score: string; where: string } | null;
  next: string;
  games: GameRow[];
  divisions: Array<{ name: string; rows: Array<{ name: string; conference: string; overall: string; mine: boolean }> }>;
  poll: { label: string; rows: Array<{ rank: number; name: string; record: string; mine: boolean }>; mine: string } | null;
  rating: { total: number; parts: Array<{ name: string; value: number; note: string }> };
  coach: string;
  stadium: { line: string; price: number; priceLine: string; crowd: string; earned: string };
  tv: string;
  standing: string;
  academic: { line: string; rows: Array<{ name: string; weight: string; level: string; detail: string }>; grades: string };
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

export function footballView(state: GameState): FootballView {
  const f = state.football;
  const season = f.season;
  const playing = hasSeason(state) && season !== null;
  const mine = season?.table[String(ME)];
  const live = liveGame(state);
  const games: GameRow[] = [];
  let next = '';
  for (const game of season?.games ?? []) {
    const date = formatDate(dateAt({ tick: game.kick, week: state.clock.week }));
    const on = live?.game === game;
    const row: GameRow = {
      date,
      where: game.slot >= 10 ? 'Neutral' : game.home ? 'Home' : 'Away',
      opponent: teamName(state, game.opp),
      label: game.label,
      outcome: game.done ? result(game) : on ? 'Live' : `${clockTime(state, game.kick)}, in ${duration(game.kick - state.clock.tick)}`,
      state: game.done ? (sum(game.us) > sum(game.them) ? 'won' : 'lost') : on ? 'live' : 'ahead',
    };
    games.push(row);
    if (!game.done && !on && next === '') next = `Next: ${game.home ? 'home to' : game.slot >= 10 ? 'against' : 'away at'} ${row.opponent}, ${date}, ${row.outcome}`;
  }
  if (playing && next === '' && !live) next = season!.closed ? 'The season is over. The next one opens with the fall.' : 'No game is scheduled yet.';

  const rating = teamRating(state);
  const books = footballBooks(state);
  const stadium = f.stadium;
  const seats = seatsNow(state);
  const crowd = expectedCrowd(state);
  const lift = athleticLift(state);
  const inputs = academicInputs(state);
  const field = state.field;
  const happy = state.admissions.lastSemester?.happiness;

  return {
    playing,
    waiting: `${state.school.name} plays its first season next fall. The ${f.nick} are in the ${f.conference}.`,
    title: `${state.school.name} ${f.nick}`,
    record: mine ? `${mine.w}-${mine.l} overall, ${mine.cw}-${mine.cl} in the ${f.conference}` : '',
    live: live ? { quarter: `${ORDINAL[live.quarter - 1]} quarter`, score: `${state.school.name} ${live.us}, ${teamName(state, live.game.opp)} ${live.them}`, where: live.game.slot >= 10 ? live.game.label : live.game.home ? 'At home' : 'Away' } : null,
    next,
    games,
    divisions: [0, 1].map((division) => ({
      name: DIVISION_NAMES[division]!,
      rows: standings(state, division).map((row) => ({ name: teamName(state, row.team), conference: `${row.record.cw}-${row.record.cl}`, overall: `${row.record.w}-${row.record.l}`, mine: row.team === ME })),
    })),
    poll: f.poll
      ? {
          label: `${f.poll.label}, year ${f.poll.year}`,
          rows: f.poll.rows.map(([team, w, l], n) => ({ rank: n + 1, name: teamName(state, team), record: `${w}-${l}`, mine: team === ME })),
          mine: `${state.school.name} is No. ${f.poll.mine} of 200.`,
        }
      : null,
    rating: {
      total: Math.round(rating.total),
      parts: [
        { name: 'Coach', value: Math.round(rating.coach), note: `${f.coach.name}, a ${TRAITS[f.coach.trait].name}` },
        { name: 'Roster', value: Math.round(rating.roster), note: `The last four classes: ${f.classes.join(', ')}` },
        { name: 'Stadium', value: Math.round(rating.stadium), note: stadium.tier === 0 ? 'A rented field in town' : `Tier ${stadium.tier} of 5` },
        { name: 'Funding', value: Math.round(rating.funding), note: 'Athletics is funded in full' },
      ],
    },
    coach: `${f.coach.name}. ${TRAITS[f.coach.trait].name}: ${TRAITS[f.coach.trait].effect.toLowerCase()}. ${dollars(books.coach > 0 ? books.coach : f.coach.pay)} a year, under contract to year ${f.coach.until}.`,
    stadium: {
      line:
        stadium.work !== null
          ? `Tier ${stadium.work.tier} is being built and opens in ${duration(stadium.work.done - state.clock.tick)}. Until then: ${people(seats)} seats.`
          : stadium.tier === 0
            ? `A rented field in town: ${people(seats)} seats.${stadium.plot === null ? ' Place the stadium plot from the Build menu, under Athletics, so there is somewhere to build.' : ''}`
            : `Tier ${stadium.tier} of 5: ${people(seats)} seats.`,
      price: stadium.price,
      priceLine: `Tickets ${dollars(TICKET_PRICE[stadium.price]!)}`,
      crowd: `About ${people(crowd)} would come to a home game: ${Math.round((100 * crowd) / seats)}% of the seats. A season at 95% earns ${stadium.tier === 0 ? 'a stadium of your own' : 'the next tier'}.`,
      earned: stadium.earned > stadium.tier ? `${stadium.tier === 0 ? 'A stadium' : `Tier ${stadium.earned}`} has been earned: ${people(seatsAt(state, stadium.earned) ?? 0)} seats. The choice to build it comes each spring, in Decisions.` : '',
    },
    tv: f.tv.perYear > 0 && f.tv.until >= state.clock.week.year ? `TV and conference deal: ${dollars(f.tv.perYear)} a year, to the end of year ${f.tv.until}.` : stadium.tier === 0 ? 'No TV deal. Offers come once there is a stadium.' : 'No TV deal. Offers come in the spring.',
    standing: `Athletic standing ${Math.round(f.standing)} of 100. It brings ${Math.round(lift * 100)}% more applicants: about ${people((fallClassDraw(state) * lift) / (1 + lift))} of the next fall class.`,
    academic: {
      line: field.rank > 0 ? `No. ${field.rank} of 200 for academics, published on rankings day of year ${field.rankYear}.` : 'The first academic ranking is published on rankings day, in the spring.',
      rows: inputs.map((input) => ({ name: input.name, weight: `${input.weight}%`, level: input.level === null ? 'Not yet' : `${Math.round(input.level)}`, detail: input.detail })),
      grades:
        field.rank > 0 && happy !== undefined
          ? `Against the 200: Happiness ${gradeAgainstField(field, happy, 3)}, class size ${gradeAgainstField(field, inputs.find((input) => input.id === 'classSize')?.level ?? 0, 1)}.`
          : '',
    },
  };
}

/** The chip on the HUD: the live score, the next kickoff, or the record. null before the first season. */
export function footballChip(state: GameState): string | null {
  if (!hasSeason(state) || !state.football.season) return null;
  const live = liveGame(state);
  if (live) return `Live: ${live.us}-${live.them}, ${ORDINAL[live.quarter - 1]} quarter`;
  const season = state.football.season;
  const mine = season.table[String(ME)]!;
  const next = season.games.find((game) => !game.done);
  const record = `${mine.w}-${mine.l}`;
  return next ? `Football ${record} · next in ${duration(Math.max(1, next.kick - state.clock.tick))}` : `Football ${record}`;
}

export interface DecisionView {
  id: number;
  title: string;
  body: string;
  closes: string;
  options: Array<{ id: string; label: string; detail: string; tags: string[]; chosen: boolean }>;
  /** True when a pick can still be changed until the window closes. */
  changeable: boolean;
}

export function decisionView(state: GameState, decision: Decision): DecisionView {
  return {
    id: decision.id,
    title: decision.title,
    body: decision.body,
    closes: `Closes in ${duration(Math.max(1, decision.closes - state.clock.tick))}, at ${clockTime(state, decision.closes)}`,
    options: decision.options.map((option) => {
      const tags: string[] = [];
      if (option.id === decision.advised) tags.push(`${decision.advisor}'s pick`);
      if (option.id === decision.fallback) tags.push('Happens by itself if you leave it');
      return { id: option.id, label: option.label, detail: option.detail, tags, chosen: decision.chosen === option.id };
    }),
    changeable: decision.kind === 'pitch',
  };
}

/** The chip on the HUD while a decision is open: how many, and how long the soonest has left. */
export function decisionsChip(state: GameState): string | null {
  const open = state.decisions.open;
  if (open.length === 0) return null;
  const soonest = Math.min(...open.map((decision) => decision.closes));
  return `${open.length === 1 ? '1 decision' : `${open.length} decisions`} · ${duration(Math.max(1, soonest - state.clock.tick))} left`;
}

/** How the last few decisions were settled, newest first. */
export function pastDecisions(state: GameState): string[] {
  return [...state.decisions.past].reverse().slice(0, 6).map((past) => `Year ${past.year}. ${past.title}: ${past.outcome}${past.byDefault ? ', by default' : ''}.`);
}

export interface FootballMoney {
  rows: Array<{ name: string; amount: string }>;
  net: string;
  applicants: string;
}

/** Football's own profit and loss for a year, with the applicants it drew. null before the first season. */
export function footballMoney(state: GameState): FootballMoney | null {
  const books = footballBooks(state);
  if (books.pay <= 0 && books.tickets <= 0) return null;
  const b = budget(state);
  const benefits = books.pay * 0.3;
  const out = books.pay + benefits + books.operations + books.upkeep + books.utilities;
  const net = books.tickets + books.tv - out;
  const lift = athleticLift(state);
  const drew = Math.round((fallClassDraw(state) * lift) / (1 + lift));
  // What those students pay in a year: tuition, and a room for six in ten.
  const perStudent = b.incomeTotal > 0 && state.cohorts.reduce((total, n) => total + n, 0) > 0 ? ((b.income.find((line) => line.id === 'tuition')?.amount ?? 0) + (b.income.find((line) => line.id === 'rooms')?.amount ?? 0)) / state.cohorts.reduce((total, n) => total + n, 0) : 0;
  const rows = [
    { name: 'Tickets and stands', amount: dollarsShort(books.tickets) },
    { name: 'TV and conference deal', amount: dollarsShort(books.tv) },
    { name: 'Coaches and staff, with benefits', amount: `-${dollarsShort(books.pay + benefits)}` },
    { name: 'Operations', amount: `-${dollarsShort(books.operations)}` },
  ];
  if (books.upkeep + books.utilities > 0) rows.push({ name: 'Stadium upkeep and utilities', amount: `-${dollarsShort(books.upkeep + books.utilities)}` });
  return {
    rows,
    net: net >= 0 ? `Football earns ${dollarsShort(net)} a year on its own lines.` : `Football costs ${dollarsShort(-net)} a year on its own lines.`,
    applicants: drew > 0 ? `It also draws about ${people(drew)} applicants to each fall class, who pay about ${dollarsShort(drew * perStudent)} a year between them.` : 'It draws no extra applicants yet: athletic standing is too low.',
  };
}

/** How long a game takes, for the page's small print. */
export const GAME_MINUTES = GAME_TICKS;
