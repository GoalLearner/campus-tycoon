import { describe, expect, it } from 'vitest';
import { advance, newGame, type GameState } from '../src/sim';
import { AID_SHARE, BORROWED_BY_GRADUATION, DEBT_AVERAGE, RENT_PER_BED_MONTH, RUNNING_SHORT, TEXTBOOKS_PER_YEAR, WORKING, WORKING_20_PLUS } from '../src/sim/config/studentMoney';
import { MAJORS, NATURE_WEIGHTS, type ArchetypeId, type MajorGroup } from '../src/sim/config/students';
import { debtAverageAtFour, moneyOf, shortEase } from '../src/sim/systems/studentMoney';
import { sampleStudents, studentCard } from '../src/sim/systems/students';
import { DAY, T0 } from './helpers';

/** R3 of the realism pass, money and daily life (DESIGN.md 67): each student's own money, at the real shares. */

const N = 20_000;
/** A game in a week of fall term, with its first classes in. */
function inTerm(): GameState {
  return advance(newGame({ seed: 7, name: 'Money', now: T0, campus: 'model' }), T0, T0 + 1.2 * DAY).state;
}
/** Students of every class year, each field at its real share, any nature. */
function many(state: GameState, facts: { inTown?: boolean; atHome?: boolean; term?: boolean; nature?: ArchetypeId } = {}) {
  const total = MAJORS.reduce((sum, major) => sum + major.share, 0);
  const out = [];
  for (let i = 0; i < N; i++) {
    let at = ((i * 0.6180339887) % 1) * total;
    let group: MajorGroup = MAJORS[0]!.group;
    for (const major of MAJORS) {
      at -= major.share;
      if (at < 0) {
        group = major.group;
        break;
      }
    }
    const classYear = i % 4;
    // Natures at their weights, as a campus has them.
    const weights = NATURE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
    let pick = ((i * 0.7548776662) % 1) * weights;
    let nature: ArchetypeId = NATURE_WEIGHTS[0]![0];
    for (const [id, weight] of NATURE_WEIGHTS) {
      pick -= weight;
      if (pick < 0) {
        nature = id;
        break;
      }
    }
    out.push(moneyOf(state, { entryYear: 3 - classYear, index: i }, classYear, { nature: facts.nature ?? nature, group, inTown: facts.inTown ?? false, atHome: facts.atHome ?? false, term: facts.term ?? true }));
  }
  return out;
}
const share = <T,>(list: T[], test: (one: T) => boolean): number => list.filter(test).length / list.length;
const mean = (list: number[]): number => list.reduce((sum, one) => sum + one, 0) / list.length;

describe('money, R3', () => {
  it('gives each student an aid package at the real shares: grants, federal loans, work-study', () => {
    const all = many(inTerm());
    expect(share(all, (one) => one.grant > 0)).toBeCloseTo(AID_SHARE.grant, 1);
    expect(Math.abs(share(all, (one) => one.loan > 0) - AID_SHARE.loan)).toBeLessThan(0.02);
    expect(Math.abs(share(all, (one) => one.workStudy) - AID_SHARE.workStudy)).toBeLessThan(0.01);
    // Grants and loans are real-sized: no grant above the range, every loan near a federal year's limit.
    for (const one of all) {
      expect(one.grant).toBeLessThanOrEqual(12_500);
      if (one.loan > 0) expect(one.loan).toBeGreaterThanOrEqual(3_900);
    }
  });

  it('has about 47% graduate owing, about $30,220 on average', () => {
    const all = many(inTerm());
    const borrowers = all.filter((one) => one.owesAtFour > 0);
    expect(Math.abs(borrowers.length / all.length - BORROWED_BY_GRADUATION)).toBeLessThan(0.015);
    expect(Math.abs(mean(borrowers.map((one) => one.owesAtFour)) / DEBT_AVERAGE - 1)).toBeLessThan(0.03);
    expect(Math.abs(debtAverageAtFour() / DEBT_AVERAGE - 1)).toBeLessThan(0.01);
    // Owing only grows: a senior owes at least what they did as a first-year.
    const state = inTerm();
    for (let index = 0; index < 400; index++) {
      const facts = { nature: 'butterfly' as ArchetypeId, group: 'letters' as MajorGroup, inTown: false, atHome: false, term: true };
      const year = [0, 1, 2, 3].map((classYear) => moneyOf(state, { entryYear: 0, index }, classYear, facts).owes);
      for (let y = 1; y < 4; y++) expect(year[y]!).toBeGreaterThanOrEqual(year[y - 1]!);
    }
  });

  it('gives about 40% a job, a quarter of everyone 20 hours or more, with shifts only in term', () => {
    const state = inTerm();
    const all = many(state);
    expect(Math.abs(share(all, (one) => one.job !== null) - WORKING)).toBeLessThan(0.015);
    expect(Math.abs(share(all, (one) => (one.job?.hours ?? 0) >= 20) - WORKING_20_PLUS)).toBeLessThan(0.015);
    // Work-study is on campus and under 20 hours.
    for (const one of all.filter((each) => each.workStudy)) {
      expect(one.job?.onCampus).toBe(true);
      expect(one.job!.hours).toBeLessThan(20);
    }
    expect(share(many(state, { term: false }), (one) => one.job !== null)).toBe(0);
    // A campus jobs program puts more of the jobs on campus.
    const jobs = { ...state, policies: { ...state.policies, on: ['campusJobs'] } };
    const onCampus = (list: ReturnType<typeof many>) => share(list.filter((one) => one.job && !one.workStudy), (one) => one.job!.onCampus);
    expect(onCampus(many(jobs))).toBeGreaterThan(onCampus(all) + 0.1);
  });

  it('has about 23% running short in a month, eased by Campus jobs and Need-based scholarships', () => {
    const state = inTerm();
    const all = many(state);
    expect(Math.abs(share(all, (one) => one.short) - RUNNING_SHORT)).toBeLessThan(0.02);
    const eased = { ...state, policies: { ...state.policies, on: ['campusJobs', 'needScholarships'] } };
    expect(shortEase(eased)).toBeCloseTo(0.48, 6);
    expect(Math.abs(share(many(eased), (one) => one.short) - RUNNING_SHORT * 0.48)).toBeLessThan(0.02);
    // A Broke Student runs short more often than most.
    expect(share(many(state, { nature: 'broke' }), (one) => one.short)).toBeGreaterThan(RUNNING_SHORT * 1.6);
    // Short some months and not others, not the same students every month.
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 0.6 * DAY).state;
    const next = many(later);
    const both = all.filter((one, i) => one.short && next[i]!.short).length;
    expect(both).toBeLessThan(all.filter((one) => one.short).length * 0.8);
  });

  it('charges rent only to those in town on their own, at about $928 a bed a month, and books at about $338 a year', () => {
    const state = inTerm();
    expect(many(state).every((one) => one.rent === null)).toBe(true);
    expect(many(state, { inTown: true, atHome: true }).every((one) => one.rent === null)).toBe(true);
    const town = many(state, { inTown: true });
    expect(Math.abs(mean(town.map((one) => one.rent!)) / RENT_PER_BED_MONTH - 1)).toBeLessThan(0.03);
    expect(Math.abs(mean(town.map((one) => one.textbooks)) / TEXTBOOKS_PER_YEAR - 1)).toBeLessThan(0.03);
  });

  it('puts the money on every card, with what tells most first, and never a word about weight', () => {
    const state = inTerm();
    const weight = /\b(weigh\w*|pounds?|lbs?|fat|fatty|chubby|skinny|obese|overweight|underweight|freshman (fifteen|15)|diet\w*|calorie\w*|bmi)\b/i;
    let cards = 0;
    for (const ref of sampleStudents(state, 600)) {
      const card = studentCard(state, ref);
      if (!card) continue;
      cards += 1;
      expect(card.money.lines.length).toBeGreaterThan(0);
      if (card.money.short) expect(card.money.lines[0]).toMatch(/running short/i);
      for (const line of card.money.lines) expect(line).not.toMatch(weight);
      for (const text of [card.name, card.archetypeName, card.quirk, card.major, card.majorNote ?? '', card.club ?? '', card.week ?? '', card.party ?? '', ...card.milestones.lines, card.outcome?.line ?? '']) expect(text).not.toMatch(weight);
    }
    expect(cards).toBeGreaterThan(300);
  });
});
