/**
 * The long run's check that a model campus's totals sit in the real ranges (DESIGN.md 65.10): the realism pass's
 * figures, read from the campuses the long run played. Each line names its real figure and its source in DESIGN.md 65.
 */
import { moneyFigures } from '../src/sim/systems/studentMoney';
import { sleepHours } from '../src/app/regularDay';
import { campusSocial, relationshipWords, viewOf } from '../src/app/socialView';
import { enrollment, sampleStudents, studentCard, type GameState } from '../src/sim';
import { drinkingFigures } from '../src/sim/systems/birthdays';
import { LEAVE_WHYS } from '../src/sim/config/population';
import { MAJORS } from '../src/sim/config/students';
import { campusRates } from '../src/sim/systems/field';
import { yearAcceptance } from '../src/sim/systems/admissions';
import { fallPipeline } from '../src/sim/systems/scorecard';
import { admissionsRank, applyPer } from '../src/sim/systems/selectivity';
import { TRANSFERS } from '../src/sim/config/admissions';
import { greekShare } from '../src/sim/systems/greek';
import { rostersOf } from '../src/sim/systems/teams';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';

export interface RealismLine {
  name: string;
  ok: boolean;
  detail: string;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const within = (x: number, low: number, high: number): boolean => x >= low && x <= high;

/** What one campus reads: its rates, its students' cards and its web, each as the real figures are counted. */
export function campusReading(state: GameState) {
  const rates = campusRates(state);
  const cards = sampleStudents(state, 600).map((ref) => ({ ref, card: studentCard(state, ref)! }));
  const share = (list: typeof cards, test: (one: (typeof cards)[number]) => boolean): number => (list.length > 0 ? list.filter(test).length / list.length : 0);
  const seniors = cards.filter(({ card }) => card.classYear >= 3);
  const field = (name: string): number => share(seniors, ({ card }) => MAJORS.find((major) => major.name === card.subject)?.field === name);
  let sleep = 0;
  let short = 0;
  let nights = 0;
  for (const { card } of cards) {
    if (card.archetype === 'allNighter') continue;
    for (let day = 0; day < 7; day++) {
      const [bed, up] = sleepHours(card, day >= 5);
      sleep += up - bed;
      if (up - bed < 7) short += 1;
      nights += 1;
    }
  }
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, webWeekOf(state));
  const view = viewOf(web, false);
  const social = campusSocial(view, state);
  const tally = state.admissions.whyLastYear ?? state.admissions.whyYear;
  return {
    second: rates.second,
    four: rates.four,
    six: rates.graduation,
    late: state.cohorts[4] + state.cohorts[5],
    why: tally?.why ?? [],
    business: field('business'),
    health: field('health'),
    undeclared: share(
      cards.filter(({ card }) => card.classYear === 0),
      ({ card }) => card.major === 'Undeclared',
    ),
    switched: share(seniors, ({ card }) => card.majorNote?.startsWith('Switched from') === true),
    double: share(seniors, ({ card }) => card.major.includes(' and ')),
    low: share(cards, ({ card }) => card.gpa < 2.25),
    high: share(cards, ({ card }) => card.gpa >= 3.75),
    probation: share(cards, ({ card }) => card.probation),
    deans: share(cards, ({ card }) => card.deansList),
    sleep: nights > 0 ? sleep / nights : 0,
    short: nights > 0 ? short / nights : 0,
    lonely: social.lonely,
    friction: social.roommates?.friction ?? 0,
    taken: share(cards, ({ ref, card }) => !/single/i.test(relationshipWords(view, state, ref, card.relationship).name)),
    athletes: rostersOf(state).share,
    greek: greekShare(state),
    // R2 (DESIGN.md 66): who is 21, the write-ups, who lives where, and seniors' milestones.
    over21: drinkingFigures(state)?.over21 ?? null,
    writeUps: state.admissions.lastSemester?.writeUps ? (state.admissions.lastSemester.writeUps * 2 * 1000) / Math.max(1, enrollment(state)) : null,
    firstInHalls: share(cards.filter(({ card }) => card.classYear === 0), ({ card }) => card.residence !== 'offCampus'),
    upperInHalls: share(cards.filter(({ card }) => card.classYear === 2 || card.classYear === 3), ({ card }) => card.residence !== 'offCampus'),
    internship: share(seniors, ({ card }) => card.milestones.did.internship),
    research: share(seniors, ({ card }) => card.milestones.did.research),
    capstone: share(seniors, ({ card }) => card.milestones.did.capstone),
    abroad: share(seniors, ({ card }) => card.milestones.did.abroad),
    // R3 (DESIGN.md 67): each student's own money, as the cards hold it; a job as held in term, whenever the run ends.
    grant: share(cards, ({ card }) => card.money.grant > 0),
    loan: share(cards, ({ card }) => card.money.loan > 0),
    workStudy: share(cards, ({ card }) => card.money.workStudy),
    working: share(cards, ({ card }) => card.money.work !== null),
    longHours: share(cards, ({ card }) => (card.money.work?.hours ?? 0) >= 20),
    runningShort: share(cards, ({ card }) => card.money.short),
    runningShortExpected: moneyFigures(state).short,
    borrowed: share(seniors, ({ card }) => card.money.owesAtFour > 0),
    debt: (() => {
      const owing = seniors.filter(({ card }) => card.money.owesAtFour > 0).map(({ card }) => card.money.owesAtFour);
      return owing.length > 0 ? owing.reduce((sum, x) => sum + x, 0) / owing.length : 0;
    })(),
  };
}

/**
 * The lines, for every tended campus the long run played and the one left alone: inside the real ranges, and the
 * neglected campus keeping fewer of its students than the tended ones.
 */
export function realismLines(tended: GameState[], alone: GameState): RealismLine[] {
  const read = tended.map(campusReading);
  const neglected = campusReading(alone);
  const all = [...read, neglected];
  const span = (values: number[]): string => (values.length === 0 ? 'none' : `${pct(Math.min(...values))} to ${pct(Math.max(...values))}`);
  const of = <K extends keyof ReturnType<typeof campusReading>>(key: K, from = read): number[] => from.map((one) => one[key] as number).filter((x) => typeof x === 'number');
  const lines: RealismLine[] = [];
  const line = (name: string, ok: boolean, detail: string): void => void lines.push({ name, ok, detail });

  line(
    'first-year retention sits between all publics and the most selective (82% to 96%), lower on a campus left alone',
    all.every((one) => one.second !== null && within(one.second, 0.8, 0.97)) && read.every((one) => one.second! > neglected.second!),
    `tended ${span(of('second'))}; left alone ${neglected.second === null ? 'none' : pct(neglected.second)}`,
  );
  line(
    'graduation in four years and in six sits between all publics and the most selective (46% to 80%, 63% to 91%, a few points more with the Honors College)',
    all.every((one) => one.four !== null && one.six !== null && within(one.four, 0.44, 0.84) && within(one.six, 0.6, 0.95)),
    `four years ${span(of('four', all))}; six years ${span(of('six', all))}`,
  );
  line(
    'fifth- and sixth-year seniors on every campus, and every leaver with a reason, transferring the most common',
    all.every((one) => one.late > 0) && read.every((one) => one.why.length === LEAVE_WHYS.length && one.why[0]! >= Math.max(one.why[2]!, one.why[4]!)),
    `fifth- and sixth-year seniors ${Math.min(...all.map((one) => one.late))} to ${Math.max(...all.map((one) => one.late))}; last year's leavers on the first campus ${LEAVE_WHYS.map((why, i) => `${why} ${read[0]?.why[i] ?? 0}`).join(', ')}`,
  );
  line(
    'majors at the degree shares: business about 18.6%, health about 13.1%; a third of first-years undeclared, about three in ten changed, one in twenty doubled',
    read.every((one) => within(one.business, 0.13, 0.25) && within(one.health, 0.08, 0.19) && within(one.undeclared, 0.1, 0.45) && within(one.switched, 0.2, 0.42) && within(one.double, 0.015, 0.1)),
    `business ${span(of('business'))}, health ${span(of('health'))}; undeclared first-years ${span(of('undeclared'))}; seniors who changed ${span(of('switched'))}, with two majors ${span(of('double'))}`,
  );
  line(
    'grades at the real spread: 12% under 2.25 and 13% at 3.75 and up, about 7% on probation, about a quarter on the Dean’s list',
    all.every((one) => within(one.low, 0.04, 0.2) && within(one.high, 0.05, 0.24) && within(one.probation, 0.03, 0.12) && within(one.deans, 0.16, 0.36)),
    `under 2.25 ${span(of('low', all))}; 3.75 and up ${span(of('high', all))}; probation ${span(of('probation', all))}; Dean's list ${span(of('deans', all))}`,
  );
  line(
    'sleep about 6 h 37 min a night, two nights in three under seven hours',
    all.every((one) => within(one.sleep, 6.35, 6.9) && within(one.short, 0.56, 0.76)),
    `${Math.min(...of('sleep', all)).toFixed(2)} to ${Math.max(...of('sleep', all)).toFixed(2)} hours; under seven ${span(of('short', all))}`,
  );
  line(
    'about half lonely, about half of roommates with some friction, about a third in a relationship',
    all.every((one) => within(one.lonely, 0.42, 0.65) && within(one.friction, 0.35, 0.65) && within(one.taken, 0.22, 0.48)),
    `lonely ${span(of('lonely', all))}; roommates with friction ${span(of('friction', all))}; in a relationship ${span(of('taken', all))} (a regrown web, at the moment each run ended)`,
  );
  // R2, four years (DESIGN.md 66).
  const known = (key: 'over21' | 'writeUps'): number[] => all.map((one) => one[key]).filter((x): x is number => x !== null);
  line(
    '21 and over about two in five of a campus, and about 7 write-ups a year for drinking under 21 in every 1,000 students',
    known('over21').length === all.length && known('over21').every((x) => within(x, 0.3, 0.52)) && known('writeUps').length > 0 && known('writeUps').every((x) => within(x, 4, 16)),
    `21 and over ${span(known('over21'))}; write-ups ${known('writeUps').map((x) => x.toFixed(1)).join(', ')} a year in every 1,000`,
  );
  line(
    'nearly every first-year in a hall, most juniors and seniors in town',
    all.every((one) => within(one.firstInHalls, 0.8, 0.95) && within(one.upperInHalls, 0.3, 0.52)),
    `first-years in a hall ${span(of('firstInHalls', all))}; juniors and seniors ${span(of('upperInHalls', all))}`,
  );
  line(
    'by senior year about half did an internship, a fifth research with faculty, two in five senior work, one in nine studied abroad',
    all.every((one) => within(one.internship, 0.4, 0.6) && within(one.research, 0.15, 0.31) && within(one.capstone, 0.32, 0.52) && within(one.abroad, 0.06, 0.18)),
    `internship ${span(of('internship', all))}; research ${span(of('research', all))}; senior work ${span(of('capstone', all))}; abroad ${span(of('abroad', all))}`,
  );
  line(
    'aid at the real shares: about 73% a grant, 44% a federal loan, 9% work-study; about 40% work, a quarter of everyone 20 hours or more',
    all.every((one) => within(one.grant, 0.66, 0.8) && within(one.loan, 0.37, 0.51) && within(one.workStudy, 0.05, 0.14) && within(one.working, 0.33, 0.47) && within(one.longHours, 0.19, 0.31)),
    `grant ${span(of('grant', all))}; federal loan ${span(of('loan', all))}; work-study ${span(of('workStudy', all))}; working ${span(of('working', all))}, 20 hours or more ${span(of('longHours', all))}`,
  );
  line(
    'about 23% running short in a month, less with Campus jobs and Need-based scholarships; about 47% of seniors borrowed, owing about $30,220',
    all.every((one) => Math.abs(one.runningShort - one.runningShortExpected) <= 0.07 && within(one.runningShortExpected, 0.1, 0.36) && within(one.borrowed, 0.35, 0.59) && within(one.debt, 26_000, 34_500)),
    `running short ${span(of('runningShort', all))} (the policies put it at ${span(of('runningShortExpected', all))}); seniors who borrowed ${span(of('borrowed', all))}, owing $${Math.round(Math.min(...of('debt', all))).toLocaleString('en-US')} to $${Math.round(Math.max(...of('debt', all))).toLocaleString('en-US')} on average`,
  );
  line(
    'varsity athletes about 1 to 2 in 100 of a big campus, and Greek Row inside its room',
    read.every((one) => within(one.athletes, 0.008, 0.025) && one.greek <= 0.25),
    `athletes ${span(of('athletes'))}; in chapters ${span(of('greek'))}`,
  );
  // Admissions at real figures (DESIGN.md 70): each campus's year by its rank, against NCES IPEDS fall 2024 for large
  // publics. A campus at its cap admits fewer, so the bands reach lower than an open campus would read.
  const admissions = [...tended, alone].map((state) => {
    const rank = admissionsRank(state);
    const accept = yearAcceptance(state) ?? 1;
    const p = fallPipeline(state);
    const band = rank <= 10 ? [0.1, 0.22] : rank <= 50 ? [0.35, 0.7] : rank <= 100 ? [0.45, 0.8] : [0.5, 0.86];
    const yieldBand = rank <= 10 ? [0.33, 0.5] : rank <= 50 ? [0.2, 0.3] : [0.19, 0.23];
    return { rank, accept, ok: within(accept, band[0]!, band[1]!) && within(p.yield, yieldBand[0]!, yieldBand[1]!), yield: p.yield };
  });
  line(
    'admitted by rank: about 15% in the top ten, 60% at 11th to 50th, 66% at 51st to 100th, 80% further down (fewer at the cap); yield 42% to 50% at the top, 21% to 23% elsewhere',
    admissions.every((one) => one.ok),
    admissions.map((one) => `No. ${one.rank}: ${pct(one.accept)} admitted, ${pct(one.yield)} yield`).join('; '),
  );
  line(
    'applications for each first-year who would come: 6 to 16 (a median of 7.8); transfers a fifth to a quarter of a first-year class',
    admissions.every((one) => within(applyPer(one.rank), 6, 16)) && within(TRANSFERS.share, 0.15, 0.3),
    `${admissions.map((one) => applyPer(one.rank).toFixed(1)).join(', ')} applications each; transfers ${pct(TRANSFERS.share)} of a first-year class`,
  );
  return lines;
}
