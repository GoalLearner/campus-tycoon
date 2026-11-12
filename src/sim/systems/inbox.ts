import { calendarAt, yearLength } from '../calendar';
import {
  ANNUAL_PAUSE,
  EVENT_WINDOW_TICKS,
  INBOX_MIN_STUDENTS,
  INBOX_PAST_KEPT,
  NEW_PER_DAY,
  ROUTINE_CAP,
  ROUTINE_WINDOW_TICKS,
  SPONSORS,
} from '../config/inbox';
import { PLACED } from '../config/placed';
import { FIRST_NAMES, SURNAME_ENDS, SURNAME_STARTS } from '../config/students';
import { FIRST_INTAKE_TICK, TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/time';
import { dollars, duration, headCount } from '../format';
import { hashInts } from '../rng';
import { enrollment, openCapacity } from '../selectors';
import type { AdvisorId, Boost, GameState, InboxEffect, InboxItem, InboxOption, LogEntry, Placed } from '../types';
import { scaleOf, smallCount } from '../scale';
import { pruneBoosts } from './boosts';
import { budget, occupiedBeds } from './budget';
import { hasSeason, noiseAt, teamName } from './football';
import { messiestSpot, spotClean } from './grounds';
import { campusHappiness, campusLevels, type CampusHappiness } from './happiness';
import { markRatesDirty } from './money';
import { hallName } from './people';
import { playUse, waitMinutes } from './play';
import { crowding, dayRead, type CampusDay } from './season';

/**
 * The routine side of the inbox (DESIGN.md sections 12 and 36): petitions,
 * deals with strings and events.
 *
 * Each is written from something that is true of the campus at the moment it
 * opens, never from a roll alone: a queue at the courts, a messy corner, a
 * losing streak. It names the player's own buildings where it can, shows one
 * advisor's pick, marks its default, stays open at least 36 hours, and its
 * default applies by itself when it closes. What a choice does is small,
 * capped and dated, and moves only numbers the game already has.
 *
 * An item is stored as it was written, effects and all, so a later change to
 * the wording or the numbers never alters one already on a desk.
 */

// ------------------------------------------------------------ the facts --

/** What the written items read. Each is worked out once for the day, and only when something asks. */
interface Facts {
  state: GameState;
  /** The campus scale (DESIGN.md 35.7). A sum that is not counted for each student follows it. */
  scale: number;
  /** Students as the small game would count them: for rules about how big a campus has to be. */
  small: number;
  students: number;
  cash: number;
  /** A year's spending, at today's rates. */
  spend: number;
  year: number;
  /** The day of the game week, 1 to 7. */
  day: number;
  kind: CampusDay;
  mood(): CampusHappiness;
  /** Of every $100 that comes in, how much is kept. */
  kept(): number;
  /** The recreation building with the longest wait. */
  queue(): { name: string; wait: number } | null;
  /** The messiest spot, when it is under half clean. */
  mess(): { name: string; clean: number } | null;
  /** Broken bins, benches, tables and lamps. */
  broken: number;
  crowd: number;
  has(type: Placed['type']): Placed | null;
  quad: boolean;
  /** The share of beds standing empty, and how many beds there are. */
  emptyBeds(): number;
  beds: number;
  safety(): number;
  /** Football: whether a season is on, losses in a row, a home game still to play, the rival's name, the stadium's tier. */
  season: boolean;
  losses: number;
  homeAhead: boolean;
  rival: string;
  tier: number;
  /** A lecture hall inside the stadium's noise, by name. */
  noisyHall(): string | null;
  /** Incidents nobody came to since the last item about them. */
  missedNew: number;
  /** A number that is the same all day and differs from day to day, for picking a name. */
  pick(salt: number): number;
}

function once<T>(make: () => T): () => T {
  let made = false;
  let value: T;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value!;
  };
}

function read(state: GameState, day: number): Facts {
  const students = enrollment(state);
  const f = state.football;
  const season = hasSeason(state) && !!f.season && !f.season.closed;
  let losses = 0;
  let homeAhead = false;
  if (f.season) {
    const games = [...f.season.games].sort((a, b) => a.slot - b.slot);
    for (const game of games) {
      if (!game.done) {
        if (game.home) homeAhead = true;
        continue;
      }
      const won = game.us.reduce((a, b) => a + b, 0) > game.them.reduce((a, b) => a + b, 0);
      losses = won ? 0 : losses + 1;
    }
  }
  const placed = state.map.placed.filter((item): item is Placed => !!item);
  const year = state.clock.week.year;
  const beds = openCapacity(state, 'housing');
  return {
    state,
    scale: scaleOf(state),
    small: smallCount(state, students),
    students,
    cash: state.money.cash,
    spend: state.money.spendingPerYear,
    year,
    day,
    kind: dayRead(state.clock).kind,
    mood: once(() => campusHappiness(state)),
    kept: once(() => budget(state).kept),
    queue: once(() => {
      let worst: { name: string; wait: number } | null = null;
      for (const item of placed) {
        const use = playUse(state, item);
        if (!use || use.waiting <= 0) continue;
        const wait = waitMinutes(use);
        if (!worst || wait > worst.wait) worst = { name: PLACED[item.type].name, wait };
      }
      return worst;
    }),
    mess: once(() => {
      const spot = messiestSpot(state);
      if (!spot) return null;
      const clean = spotClean(state, spot);
      return clean < 0.5 ? { name: PLACED[spot.type].name, clean } : null;
    }),
    broken: Object.keys(state.grounds.broken).length + Object.keys(state.grounds.lamps).length,
    crowd: crowding(state),
    has: (type) => placed.find((item) => item.type === type) ?? null,
    quad: state.map.cells.some((cell) => cell.kind === 'quad'),
    emptyBeds: once(() => (beds > 0 ? Math.max(0, 1 - occupiedBeds(state) / beds) : 0)),
    beds,
    safety: once(() => campusLevels(state).safety),
    season,
    losses,
    homeAhead,
    rival: teamName(state, f.rival),
    tier: f.stadium.tier,
    noisyHall: once(() => {
      if (f.stadium.tier < 1) return null;
      for (const building of state.map.buildings) {
        if (!building || building.zone !== 'academic' || building.stage < 1) continue;
        if (noiseAt(state, building.x, building.y) > 0) return hallName(state, building.y * state.map.width + building.x);
      }
      return null;
    }),
    missedNew: state.incidents.missed - state.inbox.marks.missed,
    pick: (salt) => hashInts(state.seed, year, day, salt),
  };
}

// ---------------------------------------------------------- small words --

const DAY = TICKS_PER_DAY;

/**
 * A sum that follows the size of the school: so much for each student, to the
 * nearest $500, and never under a floor. The floor is the small game's, so it
 * follows the campus scale (DESIGN.md 35.7).
 */
function amount(facts: Facts, perStudent: number, floor: number): number {
  return Math.max(floor * facts.scale, Math.round((facts.students * perStudent) / 500) * 500);
}

const days = (n: number): string => (n === 1 ? 'a day' : `${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][n] ?? n} days`);
const points = (n: number): string => (Math.abs(n) === 1 ? '1 point' : Math.abs(n) === 0.5 ? 'half a point' : `${Math.abs(n)} points`);

function happy(amount: number, forDays: number, label: string): InboxEffect {
  return { t: 'boost', kind: 'happy', amount, ticks: forDays * DAY, label };
}
function fans(amount: number, forDays: number, label: string): InboxEffect {
  return { t: 'boost', kind: 'fans', amount, ticks: forDays * DAY, label };
}
function calm(amount: number, forDays: number, label: string): InboxEffect {
  return { t: 'boost', kind: 'stress', amount, ticks: forDays * DAY, label };
}

function option(id: string, label: string, detail: string, cash = 0, effects: InboxEffect[] = []): InboxOption {
  return { id, label, detail, cash, effects };
}

/** True in the years the mascot goes missing instead of a prank: rivalry season with Campus Safety covering little. */
const mascotYear = (facts: Facts): boolean => facts.season && facts.safety() < 0.4 && facts.pick(21) % 2 === 1;

/** A cost the campus would hardly notice: twenty of them in the bank. */
const easily = (facts: Facts, cost: number): boolean => facts.cash >= 20 * cost;

// -------------------------------------------------------- written items --

interface Draft {
  title: string;
  body: string;
  options: InboxOption[];
  fallback: string;
  advised: string;
  /** When it closes, if not the usual window after it opens. */
  closes?: number;
}

interface Written {
  key: string;
  kind: InboxItem['kind'];
  advisor: AdvisorId;
  /** Game years between two of these. A game year is a real week. */
  rest: number;
  /** The days of the game week it may open on. Left out: any day. */
  days?: readonly number[];
  /** The item as it would read today, or null when what it is about is not true of the campus. */
  when(facts: Facts): Draft | null;
}

/** The tick the next fall begins. */
function nextFall(state: GameState): number {
  return state.clock.week.start + yearLength(state.clock.week);
}

const professorName = (facts: Facts): string => `Professor ${SURNAME_STARTS[facts.pick(31) % SURNAME_STARTS.length]}${SURNAME_ENDS[facts.pick(32) % SURNAME_ENDS.length]}`;

export const WRITTEN: readonly Written[] = [
  // ------------------------------------------------------------ petitions
  {
    key: 'lateHours',
    kind: 'petition',
    advisor: 'dean',
    rest: 2,
    when: (f) => {
      const queue = f.queue();
      if (!queue || f.small < 200) return null;
      const cost = amount(f, 4, 2000);
      return {
        title: `Late hours at the ${queue.name}`,
        body: `Students wait about ${queue.wait} minutes for a turn at the ${queue.name}. A petition with a great many signatures, some of them real, asks for late hours this week.`,
        options: [
          option('late', `Pay for late hours: ${dollars(cost)}`, `Happiness is ${points(1.5)} higher for ${days(4)}. Another place to play would end the queue for good.`, -cost, [happy(1.5, 4, 'Late hours')]),
          option('no', 'Keep the hours as they are', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'late' : 'no',
      };
    },
  },
  {
    key: 'cleanUp',
    kind: 'petition',
    advisor: 'dean',
    rest: 2,
    when: (f) => {
      const mess = f.mess();
      if (!mess) return null;
      const cost = amount(f, 3, 1500);
      return {
        title: `A clean-up day at the ${mess.name}`,
        body: `The ground around the ${mess.name} is ${Math.round(mess.clean * 100)}% clean. Students have asked, politely and in writing, whether anyone is in charge of that.`,
        options: [
          option('crew', `Hire a crew for the day: ${dollars(cost)}`, 'Every scrap of litter on campus is gone today. It comes back unless bins and workers keep up.', -cost, [{ t: 'tidy', share: 1 }]),
          option('volunteers', 'Ask for volunteers', `Half the litter goes. Happiness is ${points(0.5)} lower for ${days(2)}: nobody enrolled to sweep.`, 0, [{ t: 'tidy', share: 0.5 }, happy(-0.5, 2, 'Clean-up duty')]),
          option('no', 'Leave it to the grounds staff', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'crew' : 'volunteers',
      };
    },
  },
  {
    key: 'repairCrew',
    kind: 'petition',
    advisor: 'cfo',
    rest: 2,
    when: (f) => {
      if (f.broken < 3) return null;
      const cost = Math.max(1500, f.broken * 700) * f.scale;
      return {
        title: 'A repair crew for a day',
        body: `${headCount(f.broken)} things are broken: bins, benches, tables or lamps. The grounds staff will get to them. The question is which semester.`,
        options: [
          option('fix', `Call a crew: ${dollars(cost)}`, `All ${headCount(f.broken)} are mended today.`, -cost, [{ t: 'fix' }]),
          option('wait', 'Wait for the grounds staff', 'Nothing changes. Workers at a Facilities Yard mend things in their own time.'),
        ],
        fallback: 'wait',
        advised: easily(f, cost) ? 'fix' : 'wait',
      };
    },
  },
  {
    key: 'reviewSessions',
    kind: 'petition',
    advisor: 'provost',
    rest: 2,
    when: (f) => {
      if (f.kind !== 'term' || f.crowd < 0.4 || f.small < INBOX_MIN_STUDENTS) return null;
      const cost = amount(f, 5, 2500);
      return {
        title: 'Weekend review sessions',
        body: `Classes are crowded, and crowded classes are most of what makes exams hard here. The faculty will run review sessions at the weekend, if someone pays for the rooms and the biscuits.`,
        options: [
          option('yes', `Pay for the sessions: ${dollars(cost)}`, `Stress is 8 points lower for ${days(3)}. More Academic seats would do it for good.`, -cost, [calm(8, 3, 'Review sessions')]),
          option('no', 'Not this term', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'lateLibrary',
    kind: 'petition',
    advisor: 'provost',
    rest: 2,
    when: (f) => {
      if (!f.has('library') || (f.kind !== 'term' && f.kind !== 'midterms') || f.state.term.factor < 0.5) return null;
      const cost = amount(f, 4, 2000);
      return {
        title: 'Keep the Library open late',
        body: `At the height of finals, Stress here would reach about ${Math.round(f.state.term.factor * 100)} of 100. Students ask for the Library to stay open late until exams are over. The librarians ask for the same thing in fewer words.`,
        options: [
          option('yes', `Pay for late hours: ${dollars(cost)}`, `Stress is 10 points lower for ${days(3)}.`, -cost, [calm(10, 3, 'Late library hours')]),
          option('no', 'Keep the usual hours', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'pepRally',
    kind: 'petition',
    advisor: 'athletics',
    rest: 1,
    when: (f) => {
      if (!f.season || f.losses < 3 || !f.homeAhead) return null;
      const cost = amount(f, 2, 1000);
      return {
        title: 'A pep rally',
        body: `The team has lost ${f.losses} in a row. The Athletic Director would like a pep rally before the next home game, on the theory that it cannot hurt.`,
        options: [
          option('yes', `Hold the rally: ${dollars(cost)}`, `A tenth more fans want a ticket for ${days(2)}, and Happiness is ${points(1)} higher for ${days(1)}.`, -cost, [fans(0.1, 2, 'Pep rally'), happy(1, 1, 'Pep rally')]),
          option('no', 'No rally', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'foodCart',
    kind: 'petition',
    advisor: 'dean',
    rest: 2,
    when: (f) => {
      if (f.small < 150 || f.mood().worstPart !== 'dining') return null;
      const cost = amount(f, 3, 1500);
      return {
        title: 'A visiting food cart',
        body: 'Food is what students here grumble about most. A travelling noodle cart will set up outside the dorms for a few days, for a fee.',
        options: [
          option('yes', `Invite the cart: ${dollars(cost)}`, `Happiness is ${points(1.5)} higher for ${days(4)}. A second kind of food near the dorms would last.`, -cost, [happy(1.5, 4, 'Visiting food cart')]),
          option('no', 'No cart', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'nightWatch',
    kind: 'petition',
    advisor: 'dean',
    rest: 2,
    when: (f) => {
      if (f.missedNew < 6) return null;
      const cost = amount(f, 4, 2000);
      return {
        title: 'A night watch for the week',
        body: `${headCount(f.missedNew)} incidents lately had nobody come: a stubbed toe here, a borrowed traffic cone there. Students ask for someone, anyone, with a torch.`,
        options: [
          option('yes', `Hire a night watch: ${dollars(cost)}`, `Happiness is ${points(1)} higher for ${days(5)}. Campus Safety and a Medical Center in reach of the dorms would answer every call.`, -cost, [happy(1, 5, 'Night watch')]),
          option('no', 'No watch', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'endowSurplus',
    kind: 'petition',
    advisor: 'cfo',
    rest: 1,
    when: (f) => {
      if (f.cash < 400_000 * f.scale || f.cash < 0.45 * f.spend) return null;
      const gift = Math.round((f.cash * 0.1) / 10_000) * 10_000;
      return {
        title: 'Put the surplus to work',
        body: `There is ${dollars(f.cash)} in the bank, which is more than the campus spends in five months. The CFO would like a tenth of it somewhere it cannot be spent on a fountain.`,
        options: [
          option('pay', `Pay ${dollars(gift)} into the endowment`, 'It earns a little every year for good. It never comes back out.', 0, [{ t: 'endow', amount: gift }]),
          option('keep', 'Keep it in the bank', 'Nothing changes.'),
        ],
        fallback: 'keep',
        advised: 'pay',
      };
    },
  },
  // ---------------------------------------------------------------- deals
  {
    key: 'choirRooms',
    kind: 'deal',
    advisor: 'cfo',
    rest: 2,
    when: (f) => {
      if (f.kind !== 'term' || f.beds < 100 * f.scale || f.emptyBeds() < 0.15) return null;
      const fee = amount(f, 10, 4000);
      return {
        title: 'A choir festival wants the empty rooms',
        body: `${Math.round(f.emptyBeds() * 100)}% of the beds are empty, and empty beds earn nothing. A travelling choir festival will rent them for the weekend. They rehearse early.`,
        options: [
          option('yes', `Rent the rooms: ${dollars(fee)} comes in`, `Happiness is ${points(1.5)} lower for ${days(3)}: the breakfast queue doubles, in four-part harmony.`, fee, [happy(-1.5, 3, 'Guests in the dorms')]),
          option('no', 'Decline', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: f.kept() < 8 ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'naming',
    kind: 'deal',
    advisor: 'cfo',
    rest: 3,
    when: (f) => {
      if (!f.has('dining') || f.small < 150 || (f.kept() >= 12 && f.cash >= 0.05 * f.spend)) return null;
      const fee = amount(f, 25, 10_000);
      const sponsor = SPONSORS[f.pick(11) % SPONSORS.length]!;
      return {
        title: `${sponsor} would like its name on the Dining hall`,
        body: `Money is tight, and ${sponsor} has noticed. For a year the Dining hall would carry its name, on a sign the company describes as tasteful.`,
        options: [
          option('yes', `Take the deal: ${dollars(fee)} comes in`, `Happiness is ${points(1)} lower for ${days(7)}, while students find out what rhymes with it.`, fee, [happy(-1, 7, "A sponsor's name"), { t: 'mark', key: 'donor' }]),
          option('no', 'Decline', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: f.kept() < 6 ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'profile',
    kind: 'deal',
    advisor: 'provost',
    rest: 2,
    when: (f) => {
      if (f.small < 300 || f.mood().score < 60) return null;
      const cost = amount(f, 6, 3000);
      return {
        title: 'A college guide wants to profile the campus',
        body: `Happiness is ${Math.round(f.mood().score)}, which is the kind of number a college guide likes to print. The writer needs a room, a tour and, the guide is clear about this, lunch.`,
        options: [
          option('yes', `Host the writer: ${dollars(cost)}`, `Four in a hundred more applicants for ${days(7)}, which takes in the next class.`, -cost, [{ t: 'boost', kind: 'applicants', amount: 0.04, ticks: 7 * DAY, label: 'College guide' }]),
          option('no', 'Decline', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: easily(f, cost) ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'scoreboard',
    kind: 'deal',
    advisor: 'athletics',
    rest: 3,
    when: (f) => {
      if (f.tier < 1 || !f.season) return null;
      const fee = amount(f, 15, 8000);
      const sponsor = SPONSORS[f.pick(12) % SPONSORS.length]!;
      return {
        title: `${sponsor} wants the scoreboard`,
        body: `${sponsor} will pay to put a message on the scoreboard between plays. Every play.`,
        options: [
          option('yes', `Take the deal: ${dollars(fee)} comes in`, `Six in a hundred fewer fans want a ticket for ${days(7)}.`, fee, [fans(-0.06, 7, 'Scoreboard adverts'), { t: 'mark', key: 'donor' }]),
          option('no', 'Decline', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: f.kept() < 8 ? 'yes' : 'no',
      };
    },
  },
  {
    key: 'boat',
    kind: 'deal',
    advisor: 'cfo',
    rest: 99,
    when: (f) => {
      const marks = f.state.inbox.marks;
      if (marks.donor === 0 || marks.boat !== 0 || f.year <= marks.donor) return null;
      const price = amount(f, 8, 4000);
      const haul = amount(f, 1, 600);
      return {
        title: "A booster's suspicious gift of a boat",
        body: `After last year's sponsorship, a grateful booster has given the school a boat. It is forty feet long. ${f.has('pondLarge') || f.has('pondMedium') || f.has('pondSmall') ? 'The campus has a pond.' : 'The campus has no water at all.'}`,
        options: [
          option('sell', `Sell it quietly: ${dollars(price)} comes in`, `Happiness is ${points(1)} lower for ${days(3)}, while the student paper asks whose boat it was.`, price, [happy(-1, 3, 'Questions about a boat')]),
          option('show', `Park it on the quad: ${dollars(haul)} to haul it away after`, `Happiness is ${points(1)} higher for ${days(2)}. Students like the boat.`, -haul, [happy(1, 2, 'A boat on the quad')]),
          option('return', 'Send it back with thanks', 'Nothing changes.'),
        ],
        fallback: 'return',
        advised: 'return',
      };
    },
  },
  {
    key: 'filmCrew',
    kind: 'deal',
    advisor: 'dean',
    rest: 2,
    when: (f) => {
      if (!f.quad || f.small < 500 || f.kind !== 'term') return null;
      const fee = amount(f, 10, 5000);
      return {
        title: 'A film crew wants the quad',
        body: 'A film about a much older, much grander university needs a quad for two days. Yours will do, they say, with some ivy brought in.',
        options: [
          option('yes', `Rent out the quad: ${dollars(fee)} comes in`, `Happiness is ${points(1.5)} lower for ${days(2)}: the quad is closed, and nobody gets to be in the film.`, fee, [happy(-1.5, 2, 'Quad closed for filming')]),
          option('no', 'Decline', 'Nothing changes.'),
        ],
        fallback: 'no',
        advised: f.kept() < 8 ? 'yes' : 'no',
      };
    },
  },
  // --------------------------------------------------------------- events
  {
    key: 'mascot',
    kind: 'event',
    advisor: 'dean',
    rest: 1,
    days: [1],
    when: (f) => {
      // The risk that makes it possible: rivalry season, and Campus Safety covering little of the campus.
      if (!mascotYear(f)) return null;
      const cost = amount(f, 1.5, 800);
      return {
        title: 'The mascot costume is missing',
        body: `It is rivalry season, and the mascot costume has left the building. Campus Safety covers little of the campus, which made it easy. A note signed "a friend from ${f.rival}" says it is safe and enjoying the trip.`,
        options: [
          option('search', `Pay for a search: ${dollars(cost)}`, `It is back by the weekend. Five in a hundred more fans want a ticket for ${days(2)}.`, -cost, [fans(0.05, 2, 'The mascot is back')]),
          option('wait', 'Wait for it to turn up', `Happiness is ${points(1)} lower for ${days(2)}. It turns up after the game, on a roof.`, 0, [happy(-1, 2, 'No mascot')]),
        ],
        fallback: 'wait',
        advised: f.cash >= 5 * cost ? 'search' : 'wait',
        closes: f.state.clock.tick + EVENT_WINDOW_TICKS,
      };
    },
  },
  {
    key: 'rivalPrank',
    kind: 'event',
    advisor: 'athletics',
    rest: 1,
    days: [1],
    when: (f) => {
      if (!f.season || mascotYear(f)) return null;
      const landmark = f.has('admin') ? 'the Administration building' : 'the main gate';
      const leave = amount(f, 1, 600);
      const answer = amount(f, 2, 1200);
      return {
        title: `${landmark[0]!.toUpperCase()}${landmark.slice(1)} is wearing the wrong colours`,
        body: `Rivalry season has begun. Overnight, students from ${f.rival} dressed ${landmark} in their colours. It is, the Athletic Director admits, tidy work.`,
        options: [
          option('clean', 'Have it cleaned by noon', 'Nothing changes.'),
          option('leave', `Leave it up for the week: ${dollars(leave)} to clean it later`, `Happiness is ${points(1)} higher for ${days(2)}. Students rather like it.`, -leave, [happy(1, 2, "A rival's prank")]),
          option('answer', `Fund an answer: ${dollars(answer)}`, `A banner appears on their bridge. A tenth more fans want a ticket for ${days(2)}.`, -answer, [fans(0.1, 2, 'Rivalry season')]),
        ],
        fallback: 'clean',
        advised: easily(f, answer) ? 'answer' : 'clean',
        closes: f.state.clock.tick + EVENT_WINDOW_TICKS,
      };
    },
  },
  {
    key: 'profBand',
    kind: 'event',
    advisor: 'provost',
    rest: 1,
    days: [1, 2],
    when: (f) => {
      const hall = f.noisyHall();
      if (!hall || !f.season) return null;
      const professor = professorName(f);
      const cost = amount(f, 1.5, 800);
      return {
        title: `${professor} against the marching band`,
        body: `${hall} stands inside the stadium's noise. ${professor} has now lost three lectures to the drum line and has written to the Provost, the band, and a newspaper.`,
        options: [
          option('move', `Move band practice to the far lot: ${dollars(cost)}`, 'Peace. Nothing else changes.', -cost),
          option('band', 'Side with the band', `Five in a hundred more fans want a ticket for ${days(3)}. Happiness is ${points(1)} lower for ${days(2)}: a lecture is drowned out, with feeling.`, 0, [fans(0.05, 3, 'The band plays on'), happy(-1, 2, 'A drowned-out lecture')]),
          option('ignore', 'Let them sort it out', `Happiness is ${points(0.5)} lower for ${days(2)}. They do not sort it out.`, 0, [happy(-0.5, 2, 'The feud')]),
        ],
        fallback: 'ignore',
        advised: f.cash >= 5 * cost ? 'move' : 'ignore',
      };
    },
  },
  {
    key: 'clubsFair',
    kind: 'event',
    advisor: 'dean',
    rest: 1,
    days: [3],
    when: (f) => {
      if (!f.quad || f.small < INBOX_MIN_STUDENTS) return null;
      const cost = amount(f, 1, 500);
      return {
        title: 'The clubs ask for the main quad',
        body: 'A new semester, and forty clubs want the main quad for a fair. Thirty-nine have filled in the form. The juggling club has sent a diagram.',
        options: [
          option('yes', `Give them the quad: ${dollars(cost)} for tables`, `Happiness is ${points(1)} higher for ${days(3)}.`, -cost, [happy(1, 3, 'Clubs fair')]),
          option('side', 'Give them the side lawn', 'Nothing changes.'),
        ],
        fallback: 'side',
        advised: easily(f, cost) ? 'yes' : 'side',
        closes: f.state.clock.tick + EVENT_WINDOW_TICKS,
      };
    },
  },
  {
    key: 'concert',
    kind: 'event',
    advisor: 'dean',
    rest: 1,
    days: [4],
    when: (f) => {
      if (f.small < 200) return null;
      const big = amount(f, 8, 4000);
      const local = amount(f, 2, 1000);
      return {
        title: 'The spring concert',
        body: 'The student committee has two plans for the spring concert and a strong feeling about each.',
        options: [
          option('big', `Book a touring act: ${dollars(big)}`, `Happiness is ${points(2)} higher for ${days(2)}, and one in a hundred more applicants for ${days(4)}.`, -big, [happy(2, 2, 'Spring concert'), { t: 'boost', kind: 'applicants', amount: 0.01, ticks: 4 * DAY, label: 'Spring concert' }]),
          option('local', `Book three local bands: ${dollars(local)}`, `Happiness is ${points(1)} higher for ${days(2)}.`, -local, [happy(1, 2, 'Spring concert')]),
          option('none', 'Let the committee book whoever is free', 'Nothing changes. Someone plays. It is fine.'),
        ],
        fallback: 'none',
        advised: f.cash >= 40 * big ? 'big' : easily(f, local) ? 'local' : 'none',
        closes: f.state.clock.tick + EVENT_WINDOW_TICKS,
      };
    },
  },
  {
    key: 'seniorSteps',
    kind: 'event',
    advisor: 'dean',
    rest: 1,
    days: [5],
    when: (f) => {
      if (!f.has('admin') || !f.state.fourYears || f.state.cohorts[3] <= 0 || f.small < INBOX_MIN_STUDENTS) return null;
      const cost = amount(f, 1, 600);
      return {
        title: 'The seniors want to paint the steps',
        body: 'Commencement is near. The senior class asks to paint the steps of the Administration building in the school colour, as a gift to the campus. The Provost notes that nobody asked for it.',
        options: [
          option('yes', `Let them: ${dollars(cost)} to repaint in the summer`, `Happiness is ${points(1)} higher for ${days(2)}.`, -cost, [happy(1, 2, 'Painted steps')]),
          option('rock', 'Offer them a rock to paint instead', 'Nothing changes. It is a good rock.'),
        ],
        fallback: 'rock',
        advised: easily(f, cost) ? 'yes' : 'rock',
        closes: f.state.clock.tick + EVENT_WINDOW_TICKS,
      };
    },
  },
  {
    key: 'homecoming',
    kind: 'event',
    advisor: 'athletics',
    rest: 1,
    days: [7],
    when: (f) => {
      if (!hasSeason(f.state) || f.small < INBOX_MIN_STUDENTS) return null;
      const cost = amount(f, 3, 1500);
      // It closes a day into the fall, before Homecoming is played, and its crowd comes for that game.
      const closes = nextFall(f.state) + DAY;
      return {
        title: 'Plans for Homecoming',
        body: 'Homecoming is in the second week of the season. The alumni office can put on a small parade from its own budget, or a proper one from yours.',
        options: [
          option('parade', `A proper parade: ${dollars(cost)}`, 'Fifteen in a hundred more fans want a ticket for the Homecoming game.', -cost, [{ t: 'boost', kind: 'fans', amount: 0.15, ticks: 12 * TICKS_PER_HOUR, label: 'Homecoming parade', fromClose: true }]),
          option('small', 'The small parade', 'Nothing changes.'),
        ],
        fallback: 'small',
        advised: easily(f, cost) ? 'parade' : 'small',
        closes,
      };
    },
  },
];

// ------------------------------------------------------------- each day --

/** The first names and surnames of the four advisors, made once from the seed. */
export function advisorNames(seed: number): Record<AdvisorId, string> {
  const name = (n: number): string =>
    `${FIRST_NAMES[hashInts(seed, 9001, n, 1) % FIRST_NAMES.length]} ${SURNAME_STARTS[hashInts(seed, 9001, n, 2) % SURNAME_STARTS.length]}${SURNAME_ENDS[hashInts(seed, 9001, n, 3) % SURNAME_ENDS.length]}`;
  return { provost: name(1), cfo: name(2), athletics: name(3), dean: name(4) };
}

export function newInbox(seed: number): GameState['inbox'] {
  return { open: [], nextId: 1, last: {}, past: [], boosts: [], advisors: advisorNames(seed), marks: { missed: 0, donor: 0, boat: 0 } };
}

/** How long a routine item stays open when it does not say. */
function windowOf(kind: InboxItem['kind']): number {
  return kind === 'event' ? EVENT_WINDOW_TICKS : ROUTINE_WINDOW_TICKS;
}

/**
 * The start of each day of the game week: what has ended is dropped, and up
 * to two new items arrive if there is room on the desk. Arrivals pause while
 * two or more annual decisions are open, on a campus too small to have a
 * desk, and in a campus's first real day.
 */
export function openRoutine(state: GameState, day: number, log: LogEntry[]): void {
  const inbox = state.inbox;
  pruneBoosts(state);
  if (state.clock.tick < FIRST_INTAKE_TICK + TICKS_PER_DAY || smallCount(state, enrollment(state)) < INBOX_MIN_STUDENTS) return;
  if (state.decisions.open.length >= ANNUAL_PAUSE) return;
  let room = Math.min(NEW_PER_DAY, ROUTINE_CAP - inbox.open.length);
  if (room <= 0) return;
  const facts = read(state, day);
  const year = facts.year;
  // Events of the day come first, since they cannot wait. The rest take turns, in an order that changes every day.
  const order = WRITTEN.map((item, index) => ({ item, rank: (item.days ? 0 : 1) * 4294967296 + hashInts(state.seed, year, day, 77, index) })).sort((a, b) => a.rank - b.rank);
  for (const { item } of order) {
    if (room <= 0) break;
    if (item.days && !item.days.includes(day)) continue;
    if (inbox.open.some((open) => open.key === item.key)) continue;
    const last = inbox.last[item.key];
    if (last !== undefined && year - last < item.rest) continue;
    const draft = item.when(facts);
    if (!draft) continue;
    const opened: InboxItem = {
      id: inbox.nextId,
      key: item.key,
      kind: item.kind,
      advisor: item.advisor,
      title: draft.title,
      body: draft.body,
      opens: state.clock.tick,
      closes: draft.closes ?? state.clock.tick + windowOf(item.kind),
      options: draft.options,
      fallback: draft.fallback,
      advised: draft.advised,
    };
    inbox.nextId += 1;
    inbox.open.push(opened);
    inbox.last[item.key] = year;
    if (item.key === 'nightWatch') inbox.marks.missed = state.incidents.missed;
    if (item.key === 'boat') inbox.marks.boat = year;
    room -= 1;
    const fallback = opened.options.find((choice) => choice.id === opened.fallback);
    log.push({
      tick: state.clock.tick,
      kind: 'inbox',
      text: `On your desk: ${opened.title}. Open for ${duration(opened.closes - opened.opens)}. Left alone: ${fallback ? lowerFirst(fallback.label) : 'nothing changes'}.`,
      data: { id: opened.id, key: opened.key, closes: opened.closes, title: opened.title },
    });
  }
}

const lowerFirst = (text: string): string => (text.length > 1 && text[1] === text[1]!.toLowerCase() ? text[0]!.toLowerCase() + text.slice(1) : text);

// ------------------------------------------------------------- choosing --

/** Why a choice cannot be made right now, or null when it can. */
export function inboxBlocked(state: GameState, item: InboxItem, optionId: string): string | null {
  const picked = item.options.find((choice) => choice.id === optionId);
  if (!picked) return 'That is not one of the choices.';
  let needs = picked.cash < 0 ? -picked.cash : 0;
  for (const effect of picked.effects) if (effect.t === 'endow') needs += effect.amount;
  if (needs > state.money.cash) return `It costs ${dollars(needs)} and you have ${dollars(state.money.cash)}.`;
  return null;
}

function carryOut(state: GameState, item: InboxItem, picked: InboxOption): void {
  const money = state.money;
  if (picked.cash < 0) {
    money.cash += picked.cash;
    money.yearSpent -= picked.cash;
  } else if (picked.cash > 0) {
    money.cash += picked.cash;
    money.yearEarned += picked.cash;
  }
  const tick = state.clock.tick;
  for (const effect of picked.effects) {
    switch (effect.t) {
      case 'boost': {
        // One that waits for the window to close begins then, whenever it was chosen.
        const from = effect.fromClose ? item.closes : tick;
        const boost: Boost = { kind: effect.kind, amount: effect.amount, until: from + effect.ticks, label: effect.label };
        if (effect.fromClose && from > tick) boost.from = from;
        state.inbox.boosts.push(boost);
        break;
      }
      case 'endow':
        money.cash -= effect.amount;
        money.endowment += effect.amount;
        markRatesDirty(state);
        break;
      case 'tidy':
        for (const key of Object.keys(state.grounds.litter)) state.grounds.litter[Number(key)] = state.grounds.litter[Number(key)]! * (1 - effect.share) + 0;
        break;
      case 'fix':
        state.grounds.broken = {};
        state.grounds.brokenFrom = {};
        state.grounds.lamps = {};
        state.grounds.lampFrom = {};
        break;
      case 'mark':
        if (effect.key === 'donor') state.inbox.marks.donor = state.clock.week.year;
        else state.inbox.marks.boat = state.clock.week.year;
        break;
    }
  }
}

function settle(state: GameState, item: InboxItem, optionId: string, byDefault: boolean, log: LogEntry[] | null): void {
  const inbox = state.inbox;
  const picked = item.options.find((choice) => choice.id === optionId) ?? item.options.find((choice) => choice.id === item.fallback);
  if (picked) carryOut(state, item, picked);
  inbox.open = inbox.open.filter((open) => open.id !== item.id);
  const outcome = picked ? picked.label : 'Nothing changed';
  inbox.past.push({ key: item.key, title: item.title, outcome, byDefault, tick: state.clock.tick });
  if (inbox.past.length > INBOX_PAST_KEPT) inbox.past.splice(0, inbox.past.length - INBOX_PAST_KEPT);
  if (log && byDefault) {
    log.push({ tick: state.clock.tick, kind: 'inbox', text: `${item.title}: nobody chose, so the default applied. ${outcome}.`, data: { key: item.key, byDefault: 1 } });
  }
}

/** Each tick: an item whose window has closed takes its default. */
export function stepInbox(state: GameState, log: LogEntry[]): void {
  const open = state.inbox.open;
  if (open.length === 0) return;
  const tick = state.clock.tick;
  for (const item of [...open]) {
    if (tick < item.closes) continue;
    settle(state, item, item.fallback, true, log);
  }
}

/** The player picks. It takes effect at once and the item is done. Returns an error in words, or null. */
export function chooseInbox(state: GameState, id: number, optionId: string): string | null {
  const item = state.inbox.open.find((open) => open.id === id);
  if (!item) return 'That item has closed.';
  const why = inboxBlocked(state, item, optionId);
  if (why) return why;
  settle(state, item, optionId, false, null);
  return null;
}

/** The anchor moved and the summer is longer: an item that closes after the old fall closes that much later. */
export function stretchInbox(state: GameState, oldFall: number): void {
  const now = nextFall(state);
  const added = now - oldFall;
  if (added <= 0) return;
  for (const item of state.inbox.open) if (item.closes >= oldFall) item.closes += added;
  for (const boost of state.inbox.boosts) {
    if (boost.from !== undefined && boost.from >= oldFall) {
      boost.from += added;
      boost.until += added;
    }
  }
}

/**
 * Every written item as it would read on a campus where all of them are true
 * at once, with every line it can show. For the tone check and the tests:
 * it is never shown to anyone.
 */
export function everyWrittenItem(from: GameState): Array<{ key: string; draft: { title: string; body: string; options: InboxOption[]; fallback: string; advised: string; closes?: number }; lines: string[] }> {
  const state = structuredClone(from);
  const year = state.clock.week.year;
  state.term.factor = 0.7;
  state.fourYears = true;
  state.cohorts[3] = Math.max(1, state.cohorts[3]);
  state.inbox.marks = { missed: 0, donor: Math.max(1, year - 1), boat: 0 };
  const some = (type: Placed['type']): Placed => ({ id: 0, type, x: 0, y: 0, w: 1, h: 1, builtTick: -1 });
  const out: ReturnType<typeof everyWrittenItem> = [];
  for (const parity of [1, 2]) {
    const facts: Facts = {
      state,
      scale: 1,
      small: 2400,
      students: 2400,
      cash: 5_000_000,
      spend: 10_000_000,
      year: Math.max(2, year),
      day: 1,
      kind: 'term',
      mood: () => ({ ...campusHappiness(state), score: 66, worstPart: 'dining' }),
      kept: () => 5,
      queue: () => ({ name: PLACED.gym.name, wait: 15 }),
      mess: () => ({ name: PLACED.dining.name, clean: 0.3 }),
      broken: 4,
      crowd: 0.8,
      has: (type) => some(type),
      quad: true,
      emptyBeds: () => 0.2,
      beds: 800,
      safety: () => 0.2,
      season: true,
      losses: 3,
      homeAhead: true,
      rival: teamName(state, state.football.rival),
      tier: 2,
      noisyHall: () => 'Fernwick Hall',
      missedNew: 8,
      pick: () => parity,
    };
    for (const item of WRITTEN) {
      if (out.some((made) => made.key === item.key)) continue;
      const draft = item.when({ ...facts, day: item.days?.[0] ?? 1 });
      if (!draft) continue;
      const lines = [draft.title, draft.body];
      for (const choice of draft.options) {
        lines.push(choice.label, choice.detail);
        for (const effect of choice.effects) if (effect.t === 'boost') lines.push(effect.label);
      }
      out.push({ key: item.key, draft, lines });
    }
  }
  return out;
}

/** Kept for the tests: the day of the game week it is. */
export function inboxDay(state: GameState): number {
  return calendarAt(state.clock).day;
}
