import { describe, expect, it } from 'vitest';
import { advance, enrollment, summarizeAway, type LogEntry } from '../src/sim';
import { DAY, freshGame, T0 } from './helpers';

const facts = { minutes: 480, cashBefore: 100_000, cashAfter: 131_500, studentsBefore: 60, studentsAfter: 214 };

describe('the away list', () => {
  it('leads with how long the player was gone', () => {
    expect(summarizeAway([], facts).headline).toBe('While you were away: 8 h');
  });

  it('says what was earned and how enrollment moved', () => {
    const { lines } = summarizeAway([], facts);
    expect(lines).toContain('The campus earned $31,500.');
    expect(lines).toContain('Enrollment went from 60 to 214.');
  });

  it('reports a loss as a loss', () => {
    const { lines } = summarizeAway([], { ...facts, cashAfter: 90_000 });
    expect(lines).toContain('The campus spent $10,000 more than it earned.');
  });

  it('counts new buildings and growth separately', () => {
    const built = (stage: number): LogEntry => ({ tick: 1, kind: 'built', text: 'x', data: { stage } });
    const { lines } = summarizeAway([built(1), built(1), built(2)], facts);
    expect(lines).toContain('2 new buildings opened and 1 grew a stage.');
  });

  it('adds up everyone who came off a waitlist', () => {
    const log: LogEntry[] = [
      { tick: 1, kind: 'waitlist', text: 'a', data: { count: 20 } },
      { tick: 2, kind: 'waitlist', text: 'b', data: { count: 12 } },
    ];
    expect(summarizeAway(log, facts).lines).toContain('32 students came off waitlists.');
  });

  it('says so when nothing happened', () => {
    const quiet = { minutes: 15, cashBefore: 5, cashAfter: 5, studentsBefore: 0, studentsAfter: 0 };
    expect(summarizeAway([], quiet).lines).toEqual(['A quiet stretch. Nothing changed on campus.']);
  });

  it('stays short after a very long absence', () => {
    const start = freshGame();
    const result = advance(start, T0, T0 + 30 * DAY);
    const summary = summarizeAway(result.log, {
      minutes: 30 * 24 * 60,
      cashBefore: start.money.cash,
      cashAfter: result.state.money.cash,
      studentsBefore: 0,
      studentsAfter: enrollment(result.state),
    });
    expect(summary.lines.length).toBeLessThanOrEqual(10);
    expect(summary.lines.some((l) => l.includes('moved in'))).toBe(true);
    expect(summary.lines.some((l) => /^Year \d+ closed/.test(l))).toBe(true);
  });
});
