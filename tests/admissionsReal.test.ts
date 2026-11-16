import { describe, expect, it } from 'vitest';
import { advance, newGame, yearAcceptance } from '../src/sim';
import { SPRING_SHARE } from '../src/sim/config/demand';
import { SELECTIVE, TRANSFERS } from '../src/sim/config/admissions';
import { classSize, fallClassDraw } from '../src/sim/systems/demand';
import { academicInputs } from '../src/sim/systems/field';
import { admissionsLines, fallPipeline, scorecard } from '../src/sim/systems/scorecard';
import { applyPer, FALL_SIZE, firstYearShare, pipeline, pipelineWords, SPRING_SIZE, transferWords, yieldAt } from '../src/sim/systems/selectivity';
import { headCount } from '../src/sim/format';
import { DAY, T0 } from './helpers';

/**
 * Admissions at real figures (DESIGN.md 70, the owner's "can't have 100% acceptance rate"): applications, admits,
 * yield and transfers, read against the real figures for large publics (NCES IPEDS fall 2024).
 */

const model = (seed = 35) => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });
const rate = (p: { applied: number; admitted: number }): number => p.admitted / p.applied;

describe('admissions at real figures', () => {
  it('reads like a real flagship at every rank, with room for everyone', () => {
    const at = (rank: number) => pipeline(Math.round(9500 * FALL_SIZE), Math.round(9500 * FALL_SIZE), rank, 'fall');
    // Far down the rankings, where a model campus opens: 75% to 85% admitted, 19% to 22% yield.
    const opening = at(150);
    expect(rate(opening)).toBeGreaterThan(0.75);
    expect(rate(opening)).toBeLessThan(0.85);
    expect(opening.yield).toBeGreaterThan(0.19);
    expect(opening.yield).toBeLessThan(0.22);
    expect(opening.applied).toBeGreaterThan(55_000);
    expect(opening.applied).toBeLessThan(60_000);
    // About 40th: about 60% admitted, about 22% yield, about 73,000 applications.
    const forty = at(40);
    expect(rate(forty)).toBeGreaterThan(0.55);
    expect(rate(forty)).toBeLessThan(0.65);
    expect(forty.yield).toBeGreaterThan(0.21);
    expect(forty.yield).toBeLessThan(0.23);
    expect(forty.applied).toBeGreaterThan(70_000);
    expect(forty.applied).toBeLessThan(80_000);
    // Near the top: 16% to 20% admitted, 42% to 50% yield, 100,000 to 140,000 applications.
    const top = at(3);
    expect(rate(top)).toBeGreaterThan(0.14);
    expect(rate(top)).toBeLessThan(0.2);
    expect(top.yield).toBeGreaterThan(0.42);
    expect(top.yield).toBeLessThan(0.5);
    expect(top.applied).toBeGreaterThan(100_000);
    expect(top.applied).toBeLessThan(150_000);
    // First: 13% to 15% at most.
    expect(rate(at(1))).toBeLessThanOrEqual(0.15);
    expect(rate(at(1))).toBeGreaterThan(0.12);
    // Higher is never less selective, and yield and applications only rise with rank.
    for (let rank = 2; rank <= 200; rank++) {
      expect(yieldAt(rank)).toBeLessThanOrEqual(yieldAt(rank - 1));
      expect(applyPer(rank)).toBeLessThanOrEqual(applyPer(rank - 1));
      expect(rate(at(rank))).toBeGreaterThanOrEqual(rate(at(rank - 1)) - 1e-9);
    }
  });

  it('admits fewer at its cap, and counts transfers apart, a fifth to a quarter of a first-year class', () => {
    const wanted = Math.round(12_000 * FALL_SIZE);
    const all = pipeline(wanted, wanted, 120, 'fall');
    const full = pipeline(wanted, Math.round(wanted * 0.8), 120, 'fall');
    expect(full.applied).toBe(all.applied);
    expect(rate(full)).toBeLessThan(rate(all) * 0.85);
    expect(full.enrolling / full.admitted).toBeCloseTo(all.yield, 2);
    // Transfers: about a quarter of the first-years a year, 35% to 40% of their applicants admitted.
    expect(all.transfers.enrolling / all.enrolling).toBeCloseTo(TRANSFERS.share * TRANSFERS.fall, 2);
    expect(all.transfers.admitted / all.transfers.applied).toBeGreaterThan(0.35);
    expect(all.transfers.admitted / all.transfers.applied).toBeLessThan(0.4);
    // In words, as the panel and the Scorecard say it.
    expect(pipelineWords(all, headCount)).toMatch(/^[\d,]+ applied · [\d,]+ admitted \(\d+%\) · [\d,]+ enrolling \(\d+% yield\)$/);
    expect(transferWords(all, headCount)).toMatch(/^[\d,]+ transfers \(\d+% of [\d,]+ admitted\)$/);
  });

  it('makes the fall the big intake and the spring a small one: first-years a hundredth of the fall’s, and transfers', () => {
    const state = model();
    const fall = classSize(state, 'fall', false);
    const spring = classSize(state, 'spring', false);
    const draw = fallClassDraw(state);
    expect(fall).toBe(Math.round(draw * FALL_SIZE));
    expect(spring).toBe(Math.round(draw * SPRING_SIZE));
    expect(spring).toBeLessThan(fall / 20);
    // Of the spring's, the first-years are a hundredth of the fall's first-years; the rest are transfers.
    expect(Math.round(spring * firstYearShare('spring'))).toBeCloseTo(draw * 0.01, -1);
    // A year brings about as many as before (a fifth then came in the spring): the cap holds a full campus either way.
    expect(FALL_SIZE + SPRING_SIZE).toBeGreaterThan(1 + SPRING_SHARE);
    expect(FALL_SIZE + SPRING_SIZE).toBeLessThan(1.3);
    // The small campus keeps its spring class of a fifth of the fall's.
    const small = newGame({ seed: 35, name: 'Test University', now: T0 });
    expect(classSize(small, 'spring', false)).toBe(Math.round(fallClassDraw(small) * SPRING_SHARE));
  });

  it('never says the students a campus opened with applied, and reads its first fall as an office would', () => {
    const state = model();
    expect(state.admissions.lastIntake!.opening).toBe(true);
    expect(state.admissions.lastIntake!.real).toBeUndefined();
    const lines = admissionsLines(state);
    expect(lines[0]).toBe('The campus opened with its 46,000 students: nobody applied for those places.');
    expect(lines[1]).toMatch(/^Next fall: [\d,]+ applied · /);
    // Its selectivity until the first fall is a fall's at its rank: about four in five admitted, no points.
    expect(yearAcceptance(state)!).toBeGreaterThan(0.75);
    expect(yearAcceptance(state)!).toBeLessThan(0.85);
    expect(academicInputs(state).find((input) => input.id === 'selectivity')!.level).toBe(0);

    const fall = advance(state, T0, T0 + 7 * DAY + 3_600_000).state;
    const last = fall.admissions.lastIntake!;
    expect(last.season).toBe('fall');
    const real = last.real!;
    expect(real.firstYears + real.transfers).toBe(last.expected - (last.capped ?? 0));
    expect(fall.admissions.year).toEqual({ applied: real.applied, admitted: real.offered });
    expect(yearAcceptance(fall)).toBeCloseTo(real.offered / real.applied, 9);
    expect(real.yield).toBeGreaterThan(0.19);
    expect(real.yield).toBeLessThan(0.23);
    expect(admissionsLines(fall)[0]).toMatch(/^Last fall: [\d,]+ applied · [\d,]+ admitted \(\d+%\) · [\d,]+ enrolling \(\d+% yield\), and [\d,]+ transfers \(\d+% of [\d,]+ admitted\)\.$/);
    // Selectivity reads the real rate: no points at 80% admitted, all of them at 15%.
    const selectivity = academicInputs(fall).find((input) => input.id === 'selectivity')!;
    const accept = yearAcceptance(fall)!;
    expect(selectivity.level).toBeCloseTo(100 * Math.max(0, Math.min(1, (SELECTIVE.none - accept) / (SELECTIVE.none - SELECTIVE.all))), 9);
  });

  it('puts applications, the share admitted and yield on the Scorecard as real numbers', () => {
    const state = advance(model(), T0, T0 + 7 * DAY + 3_600_000).state;
    const rows = scorecard(state)!;
    const row = (id: string) => rows.find((one) => one.id === id)!;
    expect(row('applications').number).toBe(fallPipeline(state).applied);
    expect(row('acceptance').value).toMatch(/^\d+% of first-year applicants admitted$/);
    expect(row('yield').value).toMatch(/^\d+% of those admitted enrol$/);
    expect(row('yield').number).toBeCloseTo(state.admissions.lastIntake!.real!.yield, 9);
    expect(row('yield').number!).toBeLessThan(1);
  });
});
