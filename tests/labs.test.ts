import { newGreek } from '../src/sim/systems/greek';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  advance,
  applyAction,
  collectables,
  discoveryDue,
  discoveryHeadline,
  discoveryText,
  DISCOVERY_CASH,
  DISCOVERY_HOURS,
  DISCOVERY_XP,
  edition,
  FINDING_CASH,
  FINDING_XP,
  FINDINGS_PER_HOUR,
  findingsHeld,
  LAB_CASH_SHARE,
  LAB_HOURS,
  LAB_REPUTATION,
  labCashLeft,
  labOf,
  labRate,
  LABS,
  newGame,
  newLabs,
  ORDER_CASH_YEAR,
  ORDER_KINDS,
  parseSave,
  PLACED,
  previewPlace,
  SAVE_VERSION,
  scaleOf,
  serialize,
  TICKS_PER_HOUR,
  toneProblem,
  validate,
  XP_SOURCES,
  type Action,
  type GameState,
  type LogEntry,
  type Placed,
  type PlacedType,
} from '../src/sim';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, T0 } from './helpers';

/**
 * The research labs (DESIGN.md 42.6, as built in section 49): one for each
 * field, findings that bank up and wait, discoveries of their own in the
 * paper, small grants out of the shared allowance, and a point of Reputation.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;
const model = (): GameState => {
  const state = structuredClone(MODEL);
  state.money.cash = 2_000_000_000;
  return state;
};

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A free block for a building: the one with the most lecture halls near it, or the first, scanning from the corner. */
function spotFor(state: GameState, type: PlacedType, near = true): [number, number] {
  let best: [number, number] | null = null;
  let most = -1;
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (previewPlace(state, type, x, y).problem !== null) continue;
      if (!near) return [x, y];
      let halls = 0;
      for (const lot of state.map.buildings) if (lot && lot.zone === 'academic' && Math.abs(lot.x - x) <= 8 && Math.abs(lot.y - y) <= 8) halls += 1;
      if (halls > most) {
        most = halls;
        best = [x, y];
      }
    }
  }
  if (!best) throw new Error(`no room for ${type}`);
  return best;
}

function build(state: GameState, type: PlacedType, near = true): GameState {
  const [x, y] = spotFor(state, type, near);
  return act(state, { type: 'place', building: type, x, y });
}

const lab = (state: GameState, type: PlacedType = 'labSciences'): Placed => labOf(state, type)!;
const later = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms);

describe('a research lab', () => {
  it('is bought from the Build menu under Academics, one for each field, and only on a campus with goals', () => {
    expect(LABS.map((spec) => spec.field)).toEqual(['sciences', 'engineering', 'health']);
    for (const spec of LABS) {
      expect(PLACED[spec.type].category).toBe('Academics');
      expect(PLACED[spec.type].family).toBe('lab');
    }
    let state = model();
    for (const spec of LABS) state = build(state, spec.type);
    expect(LABS.every((spec) => labOf(state, spec.type) !== null)).toBe(true);
    const again = applyAction(state, { type: 'place', building: 'labSciences', x: spotFor(state, 'labSciences')[0], y: spotFor(state, 'labSciences')[1] });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/One lab for each field/);
    // The small campus has no goals, and so no lab.
    const small = freshGame();
    small.money.cash = 10_000_000;
    const [x, y] = spotFor(small, 'labSciences', false);
    expect(applyAction(small, { type: 'place', building: 'labSciences', x, y }).ok).toBe(false);
  });

  it('banks findings up on its own, faster with lecture halls in reach and better faculty funding, up to 36 hours’ worth', () => {
    const near = build(model(), 'labSciences');
    const far = build(model(), 'labSciences', false);
    const fast = labRate(near, lab(near));
    expect(fast.seats).toBeGreaterThan(labRate(far, lab(far)).seats);
    expect(fast.perHour).toBeGreaterThan(labRate(far, lab(far)).perHour);
    // The Instruction slider up a step: a little more.
    const funded = structuredClone(near);
    funded.staffing.instruction += 2;
    expect(labRate(funded, lab(funded)).perHour).toBeGreaterThan(fast.perHour);
    const day = later(near, 12 * HOUR).state;
    expect(findingsHeld(day, lab(day))).toBeCloseTo(12 * labRate(day, lab(day)).perHour, 5);
    // It holds 36 hours' worth and waits: nothing spoils.
    const full = later(near, 3 * DAY).state;
    const held = findingsHeld(full, lab(full));
    expect(held).toBeCloseTo(LAB_HOURS * labRate(full, lab(full)).perHour, 5);
    expect(findingsHeld(later(full, 4 * DAY).state, lab(full))).toBeCloseTo(held, 5);
    expect(FINDINGS_PER_HOUR * 24).toBe(6);
  });

  it('pays experience and a small grant when collected, out of the shared allowance and never past the labs’ share', () => {
    const state = later(build(model(), 'labSciences'), 24 * HOUR).state;
    const ready = collectables(state).find((one) => one.key === `p${lab(state).id}`)!;
    expect(ready.ready).toBe(true);
    const findings = Math.floor(findingsHeld(state, lab(state)));
    // A lab that has just opened also holds its opening bonus, as every building placed does (42.4).
    const opening = state.daily.opened.some((one) => one.kind === 'placed' && one.id === lab(state).id) ? XP_SOURCES.placed.xp : 0;
    expect(ready.xp).toBe(findings * FINDING_XP + opening);
    expect(ready.cash).toBe(findings * FINDING_CASH * scaleOf(state));
    const result = applyAction(state, { type: 'collect', key: ready.key });
    if (!result.ok) throw new Error(result.error);
    const after = result.state;
    expect(after.daily.xp - state.daily.xp).toBe(findings * FINDING_XP + opening);
    expect(after.money.cash - state.money.cash).toBe(findings * FINDING_CASH * scaleOf(state));
    expect(after.labs.findings).toBe(findings);
    expect(after.orders.paid - (state.orders.paidYear === after.orders.paidYear ? state.orders.paid : 0)).toBe(findings * FINDING_CASH * scaleOf(state));
    expect(findingsHeld(after, lab(after))).toBeLessThan(1);
    // The labs' share of the year spent: findings still pay their experience, and no cash.
    const spent = structuredClone(after);
    spent.labs.paid = LAB_CASH_SHARE * ORDER_CASH_YEAR * scaleOf(spent);
    expect(labCashLeft(spent)).toBe(0);
    const next = later(spent, 24 * HOUR).state;
    const paid = applyAction(next, { type: 'collect', key: ready.key });
    if (!paid.ok) throw new Error(paid.error);
    expect(paid.state.money.cash).toBe(next.money.cash);
    expect(paid.state.daily.xp).toBeGreaterThan(next.daily.xp);
  });

  it('loses nothing for a once-a-day player: each day’s collect takes the whole of a day', () => {
    let state = build(model(), 'labSciences');
    const rate = labRate(state, lab(state)).perHour;
    let total = 0;
    for (let n = 0; n < 6; n++) {
      state = later(state, DAY).state;
      const before = state.labs.findings;
      state = act(state, { type: 'collect', key: `p${lab(state).id}` });
      total += state.labs.findings - before;
    }
    // Six days, at the rate, to within the part of a finding still filling.
    expect(total).toBeGreaterThanOrEqual(Math.floor(6 * 24 * rate) - 1);
  });

  it('makes a discovery by itself, with its own headline in the paper, a grant and experience, and keeps it in its list', () => {
    const state = build(model(), 'labSciences');
    const hours = DISCOVERY_HOURS / (labRate(state, lab(state)).perHour / FINDINGS_PER_HOUR);
    const run = later(state, (hours + 1) * HOUR);
    const said = run.log.filter((entry) => entry.kind === 'lab' && entry.data?.discovery === 1);
    expect(said).toHaveLength(1);
    expect(run.state.labs.found).toHaveLength(1);
    const found = run.state.labs.found[0]!;
    expect(said[0]!.text.startsWith(discoveryText(run.state, found))).toBe(true);
    expect(said[0]!.text).toMatch(/^Larp \w/);
    expect(said[0]!.data?.headline).toBe(discoveryHeadline(run.state, found));
    expect(said[0]!.data?.cash).toBe(DISCOVERY_CASH * scaleOf(state));
    expect(run.state.daily.xp - state.daily.xp).toBeGreaterThanOrEqual(DISCOVERY_XP);
    expect(run.state.orders.tally.discoveries).toBe(1);
    // The paper has it: its headline on a quiet day, at the top, or in the rest of the paper on a busy one, as here.
    const paper = edition(run.state, run.log, { minutes: (hours + 1) * 60, cashBefore: state.money.cash, cashAfter: run.state.money.cash, studentsBefore: 0, studentsAfter: 0 });
    expect(paper.headline === discoveryHeadline(run.state, found) || paper.top.some((item) => item.text === said[0]!.text) || paper.more.includes(said[0]!.text)).toBe(true);
    // On a quiet day it is the headline.
    const quiet = edition(run.state, said, { minutes: 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(quiet.headline).toBe(discoveryHeadline(run.state, found));
    // And the next is on its way.
    expect(run.state.timers.some((timer) => timer.kind === 'discovery' && timer.ref === lab(run.state).id)).toBe(true);
  });

  it('finds each of its field’s discoveries once before any comes again, and every one is said within the tone guide', () => {
    for (const spec of LABS) {
      const state = build(model(), spec.type);
      const log: LogEntry[] = [];
      for (let n = 0; n < spec.discoveries.length + 1; n++) discoveryDue(state, lab(state, spec.type).id, log);
      const seen = new Set<number>();
      for (const one of state.labs.found.slice(0, spec.discoveries.length)) seen.add(one.line);
      // The one after the whole list is the first again.
      expect(state.labs.found[spec.discoveries.length]!.line).toBe(state.labs.found[0]!.line);
      for (const entry of log.filter((one) => one.kind === 'lab')) expect(toneProblem(entry.text), entry.text).toBeNull();
      expect(seen.size).toBe(spec.discoveries.length);
      for (const one of state.labs.found) {
        expect(toneProblem(discoveryText(state, one)), discoveryText(state, one)).toBeNull();
        expect(toneProblem(discoveryHeadline(state, one))).toBeNull();
      }
    }
  });

  it('lifts Reputation a point for each lab, on the rating’s own line, once Reputation exists', () => {
    const without = model();
    without.field.rankYear = 1;
    without.field.reputation = 50;
    let withLabs = structuredClone(without);
    for (const spec of LABS) withLabs = build(withLabs, spec.type);
    const read = (state: GameState): { level: number; detail: string } => {
      const input = academicInputs(state).find((one) => one.id === 'reputation')!;
      return { level: input.level ?? 0, detail: input.detail };
    };
    expect(read(withLabs).level - read(without).level).toBeCloseTo(LAB_REPUTATION * LABS.length, 5);
    expect(read(withLabs).detail).toMatch(/research labs add 3 points/);
    // Before the first rankings day there is no Reputation to lift.
    const early = build(model(), 'labSciences');
    expect(academicInputs(early).find((one) => one.id === 'reputation')?.level).toBeNull();
  });

  it('gives the state and the donors orders to ask for: findings, and a discovery', () => {
    const findings = ORDER_KINDS.find((kind) => kind.metric === 'findings')!;
    const discovery = ORDER_KINDS.find((kind) => kind.metric === 'discoveries')!;
    expect(findings.giver).toBe('state');
    expect(discovery.giver).toBe('donors');
    // Each is counted where it happens.
    let state = later(build(model(), 'labSciences'), DAY).state;
    state = act(state, { type: 'collect', key: `p${lab(state).id}` });
    expect(state.orders.tally.findings).toBe(state.labs.findings);
  });

  it('takes what it held and its next discovery when cleared, and keeps the discoveries it made', () => {
    const state = later(build(model(), 'labSciences'), (DISCOVERY_HOURS * 2 + 1) * HOUR).state;
    const here = lab(state);
    const made = state.labs.found.length;
    expect(made).toBeGreaterThan(0);
    const cells: Array<[number, number]> = [[here.x, here.y]];
    const cleared = act(state, { type: 'paint', tool: 'clear', cells });
    expect(labOf(cleared, 'labSciences')).toBeNull();
    expect(cleared.labs.since[here.id]).toBeUndefined();
    expect(cleared.timers.some((timer) => timer.kind === 'discovery')).toBe(false);
    expect(cleared.labs.found).toHaveLength(made);
    expect(later(cleared, 5 * DAY).state.labs.found).toHaveLength(made);
  });
});

describe('saves', () => {
  it('keep a lab, what it holds, its next discovery and its discoveries through a save and a load', () => {
    const state = later(build(model(), 'labSciences'), (DISCOVERY_HOURS + 30) * HOUR).state;
    const loaded = parseSave(serialize(state, state.clock.lastSimulatedAt));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.labs).toEqual(state.labs);
    expect(loaded.state.timers.filter((timer) => timer.kind === 'discovery')).toEqual(state.timers.filter((timer) => timer.kind === 'discovery'));
    expect(findingsHeld(loaded.state, lab(loaded.state))).toBeCloseTo(findingsHeld(state, lab(state)), 5);
    expect(validate(loaded.state)).toBeNull();
    expect(SAVE_VERSION).toBe(27);
  });

  describe('from version 22', () => {
    const text = readFileSync(new URL('./fixtures/save-v22-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it("comes through with nothing else moved: the owner's own kind of game, with no lab yet", () => {
      expect(file.state.version).toBe(22);
      expect(file.state.labs).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(22);
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.labs = newLabs();
      expected.traditions = loaded.state.traditions;
      expected.greek = newGreek();
      // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
      expected.alumni = loaded.state.alumni;
      expect(loaded.state).toEqual(expected);
      expect(validate(loaded.state)).toBeNull();
      // It plays on, and can build a lab.
      const day = advance(loaded.state, file.savedAt, file.savedAt + DAY).state;
      expect(validate(day)).toBeNull();
      day.money.cash = 2_000_000_000;
      expect(labOf(build(day, 'labHealth'), 'labHealth')).not.toBeNull();
      const notes = upgradeNotes(22);
      expect(notes).toHaveLength(5);
      expect(notes[0]).toMatch(/research labs/);
      expect(notes[1]).toMatch(/traditions/);
    });
  });
});

describe('the ticks it costs', () => {
  it('runs on its own timer only, so a campus with no lab does nothing new on a tick', () => {
    const state = model();
    const day = later(state, DAY);
    expect(day.log.some((entry) => entry.kind === 'lab')).toBe(false);
    expect(day.state.labs).toEqual(newLabs());
    expect(TICKS_PER_HOUR).toBe(60);
  });
});
