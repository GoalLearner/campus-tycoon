import { dateAt, formatDate } from './calendar';
import { DESIRABILITY_DRAW_FLOOR, DESIRABILITY_DRAW_SPAN } from './config/demand';
import { PAPER_NAMES, TOP_ITEMS, TOP_WEIGHTS } from './config/inbox';
import type { DriverId } from './config/students';
import { awayLines, datedDays, type AwayDay, type AwayFacts } from './digest';
import { dollars, duration } from './format';
import { hashInts } from './rng';
import { enrollment } from './selectors';
import { applicantsLift } from './systems/boosts';
import { marketingLift } from './systems/budget';
import { averageDesirability } from './systems/demand';
import { athleticLift } from './systems/football';
import { sampleStudents, studentCard } from './systems/students';
import type { GameState, LogEntry } from './types';

/**
 * The campus newspaper (DESIGN.md 12.5 and section 36). It is the front of
 * the away list: a headline for the largest change, then the three or four
 * things that matter most, and everything else folded away under them.
 *
 * Nothing here is stored and nothing here changes the game. An edition is
 * worked out from the log of the time away and the campus as it stands, so
 * the same absence always prints the same paper.
 *
 * The voice follows the tone guide (16.1): the joke sits on top and the
 * number sits underneath, and jokes aim at institutions, never at students.
 */

export type TopKind = 'decisions' | 'defaults' | 'game' | 'intake' | 'money' | 'problem' | 'news';

export interface TopItem {
  kind: TopKind;
  text: string;
  /** Where a tap on it leads, when it leads anywhere. */
  go?: 'inbox' | 'football';
}

export interface PollLine {
  label: string;
  /** Out of 100 students asked. */
  share: number;
}

export interface Edition {
  /** "The Larkspur Lantern". */
  paper: string;
  /** "Sat, Oct 31 · Year 3". */
  dateline: string;
  headline: string;
  /** The plain fact under the headline. */
  deck: string;
  /** What matters most, most important first. Never more than four. */
  top: TopItem[];
  /** Every game played while away, with its short recap, in the order played. */
  scores: string[];
  /** The admissions story, when a class arrived while away. */
  admissions: string | null;
  /** The top complaints of a hundred students, most common first. Empty on a campus with nobody to ask. */
  poll: PollLine[];
  /** How many of the hundred named something they like instead. */
  content: number;
  /** Rankings day, when it fell while away: who moved. */
  movers: string | null;
  /** Everything else that is not dated. */
  more: string[];
  /** Everything dated, by date, oldest first. */
  days: AwayDay[];
  earlier: number;
  /** How many lines are folded away under the top: scores, stories, the rest and the dated lines. */
  folded: number;
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A school's short name: "Larkspur" from "Larkspur University", "Tansycroft" from "University of Tansycroft". */
export function shortName(name: string): string {
  const short = name
    .trim()
    .replace(/^(the\s+)?university\s+of\s+/i, '')
    .replace(/\s+(state\s+university|university|college|institute|academy|tech|state)$/i, '')
    .trim();
  return short === '' ? name.trim() : short;
}

/** The paper's name. Picked once from the seed, so it never changes. */
export function paperName(state: GameState): string {
  return `The ${shortName(state.school.name)} ${PAPER_NAMES[hashInts(state.seed, 4242) % PAPER_NAMES.length]}`;
}

// ----------------------------------------------------------------- poll --

const COMPLAINT: Record<DriverId, string> = {
  walk: 'The walk to class',
  green: 'Not enough green space',
  clean: 'Litter',
  seating: 'Nowhere to sit',
  noise: 'Stadium noise',
  dining: 'The food',
  recreation: 'Not enough to do',
  safety: 'Safety and health',
};

/**
 * The student poll: what a hundred students' cards would say is wrong, added
 * up (DESIGN.md 12.1). It asks the same students every time, an even share
 * from each class year, so the poll moves only when the campus does.
 */
export function studentPoll(state: GameState, asked = 100): { lines: PollLine[]; content: number } {
  const students = sampleStudents(state, Math.ceil(asked / 4)).slice(0, asked);
  if (students.length === 0) return { lines: [], content: 0 };
  const counts = new Map<DriverId, number>();
  let content = 0;
  let answered = 0;
  for (const ref of students) {
    const card = studentCard(state, ref);
    if (!card || !card.reason) continue;
    answered += 1;
    if (card.reason.positive) content += 1;
    else counts.set(card.reason.part, (counts.get(card.reason.part) ?? 0) + 1);
  }
  if (answered === 0) return { lines: [], content: 0 };
  const lines = [...counts]
    .map(([part, count]) => ({ label: COMPLAINT[part], share: Math.round((100 * count) / answered) }))
    .filter((line) => line.share > 0)
    .sort((a, b) => b.share - a.share || a.label.localeCompare(b.label))
    .slice(0, 3);
  return { lines, content: Math.round((100 * content) / answered) };
}

// ----------------------------------------------------------- admissions --

const UNIT: Record<string, string> = { housing: 'beds', academic: 'classroom seats' };

/**
 * The admissions story (DESIGN.md 12.5 and 24.1): how many came, and the top
 * driver at each stage. What drew applicants is the largest of the things
 * that draw them. What turned any away is the zone that ran out.
 */
export function admissionsStory(state: GameState, log: readonly LogEntry[]): string | null {
  let intake: LogEntry | null = null;
  for (const entry of log) if (entry.kind === 'intake') intake = entry;
  if (!intake) return null;
  const admitted = Number(intake.data?.admitted ?? 0);
  const expected = Number(intake.data?.expected ?? admitted);
  const turnedAway = Number(intake.data?.turnedAway ?? 0);
  const look = (DESIRABILITY_DRAW_SPAN * averageDesirability(state)) / 100 / DESIRABILITY_DRAW_FLOOR;
  const drivers: Array<[string, number]> = [
    [`how the campus looks, at ${Math.round(averageDesirability(state))} of 100 for desirability`, look],
    [`football, which brings ${Math.round(athleticLift(state) * 100)} in a hundred more`, athleticLift(state)],
    [`recruiting and marketing, which brings ${Math.round(marketingLift(state) * 100)} in a hundred more`, marketingLift(state)],
    [`this season's good press, which brings ${Math.round(applicantsLift(state) * 100)} in a hundred more`, applicantsLift(state)],
  ];
  drivers.sort((a, b) => b[1] - a[1]);
  const top = drivers[0]![1] > 0 ? drivers[0]![0] : 'word of mouth, and nothing else yet';
  const came = `${expected.toLocaleString('en-US')} wanted a place and ${admitted.toLocaleString('en-US')} got one.`;
  const drew = `What drew them most: ${top}.`;
  const lost = turnedAway > 0 ? ` What turned ${turnedAway.toLocaleString('en-US')} away: ${UNIT[String(intake.data?.bottleneck)] ?? 'room'}.` : ' Nobody was turned away.';
  return `${came} ${drew}${lost}`;
}

// ------------------------------------------------------------- headline --

/** A game's result as a headline reads it: the score line without where it was played. */
function scoreLine(recap: string): string {
  const first = recap.split('. ')[0] ?? recap;
  return first.replace(/,\s*(at home|away at .*)$/i, '').replace(/^The rivalry:\s*/i, '');
}

function pickLine(state: GameState, tick: number, lines: readonly string[]): string {
  return lines[hashInts(state.seed, tick, 611) % lines.length]!;
}

const WON = ['Band Takes Full Credit', 'Trustees Suddenly Remember Their Seats', 'Bookstore Runs Out of Scarves', 'Parking Office Declares It a Coincidence'];
const LOST = ['Coach Praises "Several Good Minutes"', 'Band Reported in Fine Form', 'Fans Admire the Weather', 'Athletics Office Points to the Schedule'];

interface Lead {
  weight: number;
  headline: string;
  deck: string;
}

function leads(state: GameState, log: readonly LogEntry[], facts: AwayFacts): Lead[] {
  const out: Lead[] = [];
  const school = shortName(state.school.name);
  for (const entry of log) {
    switch (entry.kind) {
      case 'game': {
        const slot = Number(entry.data?.slot ?? 0);
        const won = entry.data?.won === 1;
        const big = slot >= 10 ? 96 : slot === 9 ? 92 : 70;
        out.push({ weight: big + (won ? 1 : 0), headline: `${scoreLine(entry.text)}; ${pickLine(state, entry.tick, won ? WON : LOST)}`, deck: entry.text });
        break;
      }
      case 'intake': {
        const admitted = Number(entry.data?.admitted ?? 0);
        const turnedAway = Number(entry.data?.turnedAway ?? 0);
        const unit = UNIT[String(entry.data?.bottleneck)] ?? 'room';
        out.push({
          weight: 85,
          headline: turnedAway > 0 ? `${admitted.toLocaleString('en-US')} Move In; ${turnedAway.toLocaleString('en-US')} More Wait for ${unit === 'beds' ? 'Beds' : 'Classroom Seats'}` : `${admitted.toLocaleString('en-US')} Move In; Housing Office Surprised to Find Room for All`,
          deck: entry.text,
        });
        break;
      }
      case 'rankings': {
        const rank = Number(entry.data?.rank ?? 0);
        const up = / up \d+ place/.test(entry.text);
        const down = / down \d+ place/.test(entry.text);
        out.push({ weight: 80, headline: `${school} Is No. ${rank} of 200${up ? '; Rivals Request a Recount' : down ? '; Provost Questions the Method' : '; Committee Relieved'}`, deck: entry.text });
        break;
      }
      case 'yearEnd':
        out.push({ weight: 60, headline: `Year ${Number(entry.data?.year ?? 0)} Is in the Books; Accountants Seen Smiling`, deck: entry.text });
        break;
      case 'graduation':
        out.push({ weight: 62, headline: 'Seniors Graduate; Parents Find Parking, Eventually', deck: entry.text });
        break;
      case 'waitlistClosed':
        if (Number(entry.data?.lost ?? 0) > 0) {
          out.push({ weight: 66, headline: `${Number(entry.data?.lost).toLocaleString('en-US')} Go Elsewhere for Want of ${(UNIT[String(entry.data?.bottleneck)] ?? 'room') === 'beds' ? 'Beds' : 'Classroom Seats'}; Trustees Surprised by Arithmetic`, deck: entry.text });
        }
        break;
      case 'grant':
        out.push({ weight: 68, headline: 'State Covers a Shortfall; Budget Described as "Aspirational"', deck: entry.text });
        break;
      case 'football':
        if (entry.data?.tier !== undefined) out.push({ weight: 78, headline: 'New Stadium Opens; Old Bleachers Not Missed', deck: entry.text });
        else if (entry.data?.title === 1) out.push({ weight: 76, headline: `${school} Wins Its Division; Nobody More Surprised Than ${school}`, deck: entry.text });
        break;
      case 'decision':
        if (entry.data?.byDefault === 1) out.push({ weight: 58, headline: 'A Decision Makes Itself; Committee Claims the Credit', deck: entry.text });
        break;
      default:
        break;
    }
  }
  const net = facts.cashAfter - facts.cashBefore;
  if (net >= 1) out.push({ weight: 30, headline: `Campus Earns ${dollars(net)}; Quad Remains Unimpressed`, deck: `The campus earned ${dollars(net)} while you were away.` });
  else if (net <= -1) out.push({ weight: 40, headline: `Campus Spends ${dollars(-net)} More Than It Earned; Nobody Saw It Go`, deck: `The campus spent ${dollars(-net)} more than it earned while you were away.` });
  out.push({ weight: 1, headline: 'Quiet Day on Campus; Committee Formed to Find Out Why', deck: 'Nothing much changed while you were away.' });
  return out;
}

// -------------------------------------------------------------- edition --

/** What is waiting for the player right now: every open decision and item on the desk, soonest to close first. */
export function waiting(state: GameState): Array<{ title: string; closes: number; annual: boolean }> {
  const out = [
    ...state.decisions.open.filter((item) => item.chosen === null).map((item) => ({ title: item.title, closes: item.closes, annual: true })),
    ...state.inbox.open.map((item) => ({ title: item.title, closes: item.closes, annual: false })),
  ];
  return out.sort((a, b) => a.closes - b.closes);
}

/**
 * An edition, for an absence and the campus as it stands at the end of it.
 * `grounds` is the one line about litter, and whether cleanliness is what
 * holds Happiness back.
 */
export function edition(state: GameState, log: readonly LogEntry[], facts: AwayFacts, grounds: { line: string; first: boolean } = { line: '', first: false }): Edition {
  const lead = leads(state, log, facts).sort((a, b) => b.weight - a.weight)[0]!;
  const date = dateAt(state.clock);

  // Everything that could go at the top, each with how much it matters.
  const ranked: Array<{ weight: number; item: TopItem; order: number }> = [];
  let order = 0;
  const offer = (weight: number, kind: TopKind, text: string, go?: TopItem['go']): void => {
    ranked.push({ weight, item: go ? { kind, text, go } : { kind, text }, order: order++ });
  };

  const open = waiting(state);
  if (open.length > 0) {
    const first = open[0]!;
    const left = Math.max(0, first.closes - state.clock.tick);
    offer(TOP_WEIGHTS.decisions, 'decisions', `${open.length === 1 ? '1 decision is' : `${open.length} decisions are`} waiting for you. ${open.length === 1 ? 'It' : 'The first'} closes in ${duration(left)}: ${first.title}.`, 'inbox');
  }

  const annualDefaults = log.filter((entry) => entry.kind === 'decision' && entry.data?.byDefault === 1);
  if (annualDefaults.length === 1) offer(TOP_WEIGHTS.annualDefault, 'defaults', annualDefaults[0]!.text);
  else if (annualDefaults.length > 1) offer(TOP_WEIGHTS.annualDefault, 'defaults', `${annualDefaults.length} of the year's decisions closed with their defaults. The last: ${annualDefaults[annualDefaults.length - 1]!.text}`);
  const deskDefaults = log.filter((entry) => entry.kind === 'inbox' && entry.data?.byDefault === 1);
  if (deskDefaults.length === 1) offer(TOP_WEIGHTS.deskDefault, 'defaults', deskDefaults[0]!.text);
  else if (deskDefaults.length > 1) offer(TOP_WEIGHTS.deskDefault, 'defaults', `${deskDefaults.length} items on your desk closed with their defaults.`);

  // Games: the one that mattered most leads, with the record of the rest.
  const games = log.filter((entry) => entry.kind === 'game').sort((a, b) => Number(a.data?.at ?? a.tick) - Number(b.data?.at ?? b.tick));
  if (games.length > 0) {
    const weightOf = (entry: LogEntry): number => (Number(entry.data?.slot ?? 0) >= 9 ? TOP_WEIGHTS.bigGame : TOP_WEIGHTS.game);
    let best = games[games.length - 1]!;
    for (const game of games) if (weightOf(game) > weightOf(best)) best = game;
    const wins = games.filter((entry) => entry.data?.won === 1).length;
    const tally = games.length > 1 ? `${wins} won and ${games.length - wins} lost while you were away. ` : '';
    offer(weightOf(best), 'game', `${tally}${best.text}`, 'football');
  }

  for (const line of awayLines(log, facts)) {
    if (line.weight <= 0) continue;
    offer(line.weight, line.kind, line.text);
  }
  if (grounds.line) offer(grounds.first ? TOP_WEIGHTS.groundsFirst : 38, 'problem', grounds.line);

  for (const entry of log) {
    if (entry.kind === 'football' && (entry.data?.tier !== undefined || entry.data?.earned !== undefined || entry.data?.title === 1)) offer(TOP_WEIGHTS.goodNews, 'news', entry.text, 'football');
    else if (entry.kind === 'rankings') offer(TOP_WEIGHTS.goodNews - 1, 'news', entry.text);
    else if (entry.kind === 'exam' && Number(entry.data?.peak ?? 0) >= 60) offer(TOP_WEIGHTS.exams, 'problem', entry.text);
  }

  ranked.sort((a, b) => b.weight - a.weight || a.order - b.order);
  const top = ranked.slice(0, TOP_ITEMS).map((entry) => entry.item);
  const shown = new Set(top.map((item) => item.text));
  const more = ranked
    .slice(TOP_ITEMS)
    .map((entry) => entry.item.text)
    .filter((text) => !shown.has(text));

  const scores = games.map((entry) => entry.text);
  const admissions = admissionsStory(state, log);
  const poll = studentPoll(state);
  const rankings = log.filter((entry) => entry.kind === 'rankings');
  const movers = rankings.length > 0 ? rankings[rankings.length - 1]!.text : null;
  const dated = datedDays(log);
  const folded = more.length + scores.length + (admissions ? 1 : 0) + (poll.lines.length > 0 ? 1 : 0) + sum(dated.days.map((day) => day.lines.length));

  return {
    paper: paperName(state),
    dateline: `${formatDate(date)} · Year ${Math.max(1, state.clock.week.year)}`,
    headline: lead.headline,
    deck: lead.deck,
    top,
    scores,
    admissions,
    poll: poll.lines,
    content: poll.content,
    movers,
    more,
    days: dated.days,
    earlier: dated.earlier,
    folded,
  };
}

/** Every line an edition could print that is written here, for the tone check. */
export function newspaperLines(): string[] {
  return [...WON, ...LOST, ...Object.values(COMPLAINT)];
}

/** Used by the tests: the number of students on campus the poll could ask. */
export function pollable(state: GameState): number {
  return Math.min(100, enrollment(state));
}
