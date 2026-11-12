import { describe, expect, it } from 'vitest';
import {
  admissionsStory,
  advance,
  awayLines,
  edition,
  enrollment,
  newGame,
  paperName,
  shortName,
  studentPoll,
  summarizeAway,
  TOP_ITEMS,
  toneProblem,
  type Edition,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { awayView, inboxChip, inboxView } from '../src/ui/deskUi';
import { DAY, freshGame, T0 } from './helpers';

const whole = (scale?: number): GameState => newGame({ seed: 11, name: 'Larkspur University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });

/** One day away, from day `from` to the next, with nobody answering anything: the state, the day's log and its facts. */
function dayAway(start: GameState, from: number): { state: GameState; log: LogEntry[]; facts: { minutes: number; cashBefore: number; cashAfter: number; studentsBefore: number; studentsAfter: number } } {
  const before = advance(start, start.clock.lastSimulatedAt, T0 + from * DAY).state;
  const result = advance(before, before.clock.lastSimulatedAt, T0 + (from + 1) * DAY);
  return {
    state: result.state,
    log: result.log,
    facts: { minutes: 1440, cashBefore: before.money.cash, cashAfter: result.state.money.cash, studentsBefore: enrollment(before), studentsAfter: enrollment(result.state) },
  };
}

const everyLine = (paper: Edition): string[] => [paper.headline, paper.deck, ...paper.top.map((item) => item.text), ...paper.scores, ...paper.more, ...(paper.admissions ? [paper.admissions] : []), ...(paper.movers ? [paper.movers] : []), ...paper.days.flatMap((day) => day.lines)];

describe('an edition after a day away', () => {
  // The log of a real day for each of nine days of the test campus, fall into the next year.
  const editions = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((from) => {
    const away = dayAway(whole(1), from);
    return { ...away, paper: edition(away.state, away.log, away.facts) };
  });

  it('leads with a headline and at most four things, and folds the rest away', () => {
    for (const { paper } of editions) {
      expect(paper.headline.length).toBeGreaterThan(10);
      expect(paper.deck.length).toBeGreaterThan(10);
      expect(paper.top.length).toBeGreaterThanOrEqual(1);
      expect(paper.top.length).toBeLessThanOrEqual(TOP_ITEMS);
      const dated = paper.days.reduce((sum, day) => sum + day.lines.length, 0);
      expect(paper.folded).toBe(paper.more.length + paper.scores.length + (paper.admissions ? 1 : 0) + (paper.poll.length > 0 ? 1 : 0) + dated);
      // Nothing at the top is said again underneath.
      for (const item of paper.top) expect(paper.more).not.toContain(item.text);
    }
  });

  it('puts what the player can still act on first, whenever anything is waiting', () => {
    const waiting = editions.filter(({ state }) => state.inbox.open.length + state.decisions.open.filter((item) => item.chosen === null).length > 0);
    expect(waiting.length).toBeGreaterThan(3);
    for (const { paper } of waiting) {
      expect(paper.top[0]!.kind).toBe('decisions');
      expect(paper.top[0]!.go).toBe('inbox');
      expect(paper.top[0]!.text).toMatch(/waiting for you/);
    }
  });

  it('carries every game played, each with its recap, and leads the football line with the record', () => {
    const fall = editions.find(({ log }) => log.filter((entry) => entry.kind === 'game').length >= 2)!;
    expect(fall).toBeDefined();
    const games = fall.log.filter((entry) => entry.kind === 'game');
    expect(fall.paper.scores.length).toBe(games.length);
    const line = fall.paper.top.find((item) => item.kind === 'game')!;
    expect(line.text).toMatch(/\d+ won and \d+ lost while you were away/);
    expect(line.go).toBe('football');
  });

  it('is the same paper for the same absence, and its name never changes', () => {
    const away = dayAway(whole(1), 4);
    expect(edition(away.state, away.log, away.facts)).toEqual(edition(away.state, away.log, away.facts));
    expect(new Set(editions.map(({ paper }) => paper.paper)).size).toBe(1);
    expect(paperName(whole(1))).toMatch(/^The Larkspur \w+$/);
  });

  it('keeps to the tone guide in every line it prints', () => {
    for (const { paper } of editions) for (const line of everyLine(paper)) expect(toneProblem(line), line).toBeNull();
  });

  it('reads right at 46,000 students: no five figures in a row without a comma', () => {
    for (const from of [1, 6, 7, 8]) {
      const away = dayAway(whole(), from);
      const paper = edition(away.state, away.log, away.facts);
      for (const line of everyLine(paper)) expect(line, line).not.toMatch(/\d{5,}/);
    }
  });
});

describe('the ranking', () => {
  const entry = (kind: LogEntry['kind'], text: string, data: LogEntry['data'] = {}): LogEntry => ({ tick: 100, kind, text, data });

  it('orders a day of news: what waits, what was decided without you, the big result, the class, then the rest', () => {
    const away = dayAway(whole(1), 2);
    const state = structuredClone(away.state);
    state.inbox.open = [{ id: 1, key: 'concert', kind: 'event', advisor: 'dean', title: 'The spring concert', body: '', opens: state.clock.tick, closes: state.clock.tick + 600, options: [], fallback: 'none', advised: 'none' }];
    const log: LogEntry[] = [
      entry('incident', 'A stubbed toe.', { handled: 1 }),
      entry('decision', 'TV deal: nobody chose, so the default applied. The deal rolls on.', { byDefault: 1 }),
      entry('game', 'Larkspur University 21, Yarrowstead College 14, at home. It went to the last drive.', { slot: 3, won: 1, at: 90 }),
      entry('intake', 'The fall class of year 2 moved in: 400 students, and everyone found a place.', { admitted: 400, expected: 400, turnedAway: 0, bottleneck: '' }),
      entry('inbox', 'A clean-up day: nobody chose, so the default applied. Leave it to the grounds staff.', { byDefault: 1 }),
    ];
    const paper = edition(state, log, { minutes: 1440, cashBefore: 1000, cashAfter: 51_000, studentsBefore: 1200, studentsAfter: 1600 });
    expect(paper.top.map((item) => item.kind)).toEqual(['decisions', 'defaults', 'intake', 'game']);
    expect(paper.more.join(' ')).toMatch(/The campus earned \$50,000/);
    expect(paper.more.join(' ')).toMatch(/A clean-up day/);
    // The class is the headline: it outranks an ordinary game.
    expect(paper.headline).toMatch(/400 Move In/);
  });

  it('gives a quiet day a paper too', () => {
    const state = structuredClone(whole(1));
    state.inbox.open = [];
    state.decisions.open = [];
    const paper = edition(state, [], { minutes: 90, cashBefore: 5, cashAfter: 5, studentsBefore: 10, studentsAfter: 10 });
    expect(paper.headline).toMatch(/Quiet Day on Campus/);
    expect(paper.top.map((item) => item.text)).toEqual(['A quiet stretch. Nothing changed on campus.']);
  });

  it('leaves the plain list as it was: the same lines in the same order', () => {
    const away = dayAway(whole(1), 3);
    expect(summarizeAway(away.log, away.facts).lines.filter((line) => !line.startsWith('And '))).toEqual(
      awayLines(away.log, away.facts)
        .map((line) => line.text)
        .slice(0, summarizeAway(away.log, away.facts).lines.filter((line) => !line.startsWith('And ')).length),
    );
  });
});

describe('the student poll', () => {
  it('adds up what a hundred students would say, the most common first, three at the most', () => {
    const poll = studentPoll(whole(1));
    expect(poll.lines.length).toBeLessThanOrEqual(3);
    let last = 101;
    let total = poll.content;
    for (const line of poll.lines) {
      expect(line.share).toBeGreaterThan(0);
      expect(line.share).toBeLessThanOrEqual(last);
      last = line.share;
      total += line.share;
    }
    expect(total).toBeLessThanOrEqual(101);
    expect(studentPoll(whole(1))).toEqual(poll);
  });

  it('moves when the campus does: with no food near the dorms, food leads the complaints', () => {
    const state = structuredClone(whole(1));
    state.map.placed = state.map.placed.map((placed) => (placed && (placed.type === 'dining' || placed.type === 'coffee') ? null : placed));
    const before = studentPoll(whole(1));
    const after = studentPoll(state);
    const share = (poll: typeof after): number => poll.lines.find((line) => line.label === 'The food')?.share ?? 0;
    expect(share(after)).toBeGreaterThan(share(before));
    expect(after.content).toBeLessThan(before.content);
  });

  it('asks nobody on a campus with nobody on it', () => {
    expect(studentPoll(freshGame())).toEqual({ lines: [], content: 0 });
  });
});

describe('the admissions story', () => {
  it('says how many came, names what drew them most, and what turned any away', () => {
    const away = dayAway(whole(1), 7);
    const story = admissionsStory(away.state, away.log);
    expect(story).toMatch(/wanted a place and [\d,]+ got one\./);
    expect(story).toMatch(/What drew them most: /);
    expect(story).toMatch(/What turned [\d,]+ away: (beds|classroom seats)\.|Nobody was turned away\./);
    expect(admissionsStory(away.state, [])).toBeNull();
  });
});

describe('names', () => {
  it('shortens a school to the word a headline uses', () => {
    expect(shortName('Larkspur University')).toBe('Larkspur');
    expect(shortName('University of Tansycroft')).toBe('Tansycroft');
    expect(shortName('Fernwick State University')).toBe('Fernwick');
    expect(shortName('University')).toBe('University');
  });
});

describe('the screens read from the same game', () => {
  it('shows the paper after an hour away and the plain list after less', () => {
    const away = dayAway(whole(1), 3);
    const report = { ...away.facts, weeksSkipped: 0, log: away.log, grounds: '', groundsFirst: false };
    const paper = awayView(away.state, report);
    expect(paper.kind).toBe('paper');
    if (paper.kind !== 'paper') return;
    expect(paper.paper.awayFor).toBe('Away 1 d');
    expect(paper.paper.top.length).toBeLessThanOrEqual(TOP_ITEMS);
    expect(paper.paper.restLabel).toMatch(/^The rest of the paper · \d+ lines?$/);
    expect(awayView(away.state, { ...report, minutes: 30 }).kind).toBe('list');
  });

  it('lists the year\'s decisions apart from the four on the desk, each choice with its tags', () => {
    let state = whole(1);
    for (let day = 1; day <= 14 && state.inbox.open.length === 0; day++) state = advance(state, state.clock.lastSimulatedAt, T0 + day * DAY).state;
    const view = inboxView(state);
    expect(view.desk.length).toBeGreaterThan(0);
    expect(view.deskHead).toBe(`On your desk: ${view.desk.length} of 4`);
    for (const item of view.desk) {
      expect(item.from).toMatch(/^From (Provost|Chief Financial Officer|Athletic Director|Dean of Students) \S+ \S+$/);
      expect(item.closes).toMatch(/^Closes in /);
      expect(item.options.filter((option) => option.tags.some((tag) => tag.endsWith("'s pick"))).length).toBe(1);
      expect(item.options.filter((option) => option.tags.includes('Happens by itself if you leave it')).length).toBe(1);
    }
    expect(view.advisors.map((advisor) => advisor.title)).toEqual(['Provost', 'Chief Financial Officer', 'Athletic Director', 'Dean of Students']);
    for (const advisor of view.advisors) expect(advisor.issue.length).toBeGreaterThan(10);
    expect(inboxChip(state)).toEqual({ text: expect.stringMatching(/^\d+ to decide · .+ left$/), urgent: true });
    const quiet = structuredClone(state);
    quiet.inbox.open = [];
    quiet.decisions.open = [];
    expect(inboxChip(quiet)).toEqual({ text: 'Inbox', urgent: false });
    expect(inboxView(quiet).empty).toBe('Nothing is waiting for you.');
  });
});
