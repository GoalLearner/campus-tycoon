import { describe, expect, it } from 'vitest';
import { advance, applyAction, newGame, parseSave, serialize, toneProblem, TICK_MS, type GameState } from '../src/sim';
import { MEDDLE, MEDDLE_BY_ID, MEDDLE_EFFECT, type MeddleId } from '../src/sim/config/meddle';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { KIND } from '../src/sim/config/web';
import { MEDDLE_HEADLINES, MEDDLE_WEB_HEADLINES } from '../src/sim/newspaper';
import { friendsEffectsOf } from '../src/sim/systems/friends';
import { MIGRATIONS, SAVE_VERSION } from '../src/sim/save';
import { scaleOf } from '../src/sim/scale';
import { happyParts, stressOff, callsLift } from '../src/sim/systems/boosts';
import { chaosReach } from '../src/sim/systems/chaos';
import { campusLevels } from '../src/sim/systems/happiness';
import { WEB_LINES, cooldownLeft, meddle, meddleShowing, meddleCalm, meddleProblem, meddleRein, meddleStress, meddleTemper, meddleView, prankWarDorms, stepMeddle } from '../src/sim/systems/meddle';
import { stressRead, weatherAt } from '../src/sim/systems/season';
import { applyAsks, idOf, newWeb, catchUp, refAt, webWeekOf, type Web } from '../src/sim/systems/web';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { chooseLawnKind, lawnWords, partyTonight, showingOut } from '../src/app/lawnLife';
import type { LogEntry } from '../src/sim/types';
import { spawnChaos } from '../src/sim/systems/chaos';
import { INCIDENT_EVAL_TICKS } from '../src/sim/config/incidents';

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const DAY = 24 * 60;
const model = (): GameState => {
  const state = newGame({ seed: 77, name: 'Test University', now: T0, campus: 'model' });
  state.money.cash = 1e10;
  state.daily.seals = 100;
  return state;
};
const small = (): GameState => newGame({ seed: 77, name: 'Test University', now: T0 });
const told = (state: GameState, id: MeddleId): string => {
  const done = meddle(state, id);
  if (typeof done === 'string') throw new Error(`${id}: ${done}`);
  return done.told;
};
/** Every line the tools write: what the player reads and the paper's, the latter after the night is out. */
function linesOf(state: GameState): string[] {
  return state.chaos.meddle.news.map((one) => one.text);
}
function snowing(state: GameState): void {
  for (let t = state.clock.tick; t < state.clock.tick + 60 * DAY; t += 60) {
    if (weatherAt(state.seed, { ...state.clock, tick: t }) === 'snow') {
      state.clock.tick = t;
      return;
    }
  }
  throw new Error('no snow found');
}

describe('the Meddle menu and the calm tools (C4, DESIGN.md 78)', () => {
  it('is on a game with goals only: the small campus has no page and no tools', () => {
    const state = small();
    expect(meddleView(state)).toBeNull();
    expect(meddle(state, 'party')).toBe('Meddling is for a campus with goals.');
    const view = meddleView(model());
    expect(view?.rows.map((row) => row.id)).toEqual(MEDDLE.map((spec) => spec.id));
    expect(view?.rows.filter((row) => row.side === 'calm').map((row) => row.id)).toEqual(['counselling', 'festival', 'security', 'dogs']);
  });

  it('charges each tool its cost, cash at the campus scale or Gold Seals, and rests it a day, or a week for the big ones', () => {
    for (const spec of MEDDLE) {
      const state = model();
      if (spec.snowOnly) snowing(state);
      const cash = state.money.cash;
      const seals = state.daily.seals;
      told(state, spec.id);
      expect(cash - state.money.cash, spec.id).toBeCloseTo((spec.cash ?? 0) * scaleOf(state), 0);
      expect(seals - state.daily.seals, spec.id).toBe(spec.seals ?? 0);
      expect(cooldownLeft(state, spec.id), spec.id).toBe(spec.cooldown);
      expect(meddleProblem(state, spec.id), spec.id).toMatch(/^Ready again in /);
      state.clock.tick += spec.cooldown;
      if (spec.id === 'mascot') state.chaos.mascot = null;
      expect(cooldownLeft(state, spec.id), spec.id).toBe(0);
    }
    expect(['mascot', 'prankWar'].map((id) => MEDDLE_BY_ID[id as MeddleId].seals)).toEqual([5, 5]);
    expect(['roommates', 'mascot', 'prankWar', 'festival'].every((id) => MEDDLE_BY_ID[id as MeddleId].cooldown === 7 * DAY)).toBe(true);
  });

  it('says why a tool cannot be used: short of money or Seals, no snow, the mascot already out', () => {
    const state = model();
    state.money.cash = 0;
    state.daily.seals = 2;
    expect(meddleProblem(state, 'festival')).toMatch(/^That takes \$/);
    expect(meddleProblem(state, 'prankWar')).toBe('That takes 5 Gold Seals. You have 2.');
    expect(meddleProblem(state, 'rumour')).toBeNull();
    if (weatherAt(state.seed, state.clock) !== 'snow') expect(meddleProblem(state, 'snowball')).toBe('Only while it is snowing.');
    state.chaos.mascot = { at: state.clock.tick, until: state.clock.tick + 60 };
    state.daily.seals = 10;
    expect(meddleProblem(state, 'mascot')).toBe("The rival's mascot is on campus already.");
    const result = applyAction(state, { type: 'meddle', id: 'festival' });
    expect(result.ok).toBe(false);
  });

  it('lifts Happiness and eases Stress through the desk\'s dated boosts, inside their caps, and they end', () => {
    const state = model();
    told(state, 'party');
    told(state, 'dogs');
    told(state, 'counselling');
    told(state, 'festival');
    const parts = happyParts(state);
    expect(parts.map((part) => part.label)).toEqual(expect.arrayContaining(['Campus-wide party', 'Therapy dogs', 'Campus festival']));
    // Together within the desk's cap of 3 points, however many run.
    expect(parts.reduce((sum, part) => sum + part.points, 0)).toBeLessThanOrEqual(3 + 1e-9);
    expect(stressOff(state).points).toBe(6);
    expect(callsLift(state)).toBe(MEDDLE_EFFECT.party.calls);
    state.clock.tick += 3 * DAY;
    expect(happyParts(state).filter((part) => part.label !== 'Campus spirit')).toHaveLength(0);
    expect(stressOff(state).points).toBe(0);
  });

  it('adds Stress for a power cut or a surprise exam, for the night, within its cap', () => {
    const state = model();
    const levels = campusLevels(state);
    const before = stressRead(state, levels, 0.6).score;
    told(state, 'powerCut');
    told(state, 'surpriseExam');
    expect(meddleStress(state)).toBe(Math.min(8, MEDDLE_EFFECT.powerCut.stress + MEDDLE_EFFECT.surpriseExam.stress));
    expect(stressRead(state, levels, 0.6).score).toBe(before + meddleStress(state));
    state.clock.tick += 15 * 60;
    expect(meddleStress(state)).toBe(0);
  });

  it('calms chaos: counselling and the festival ease tempers, extra security stops most mischief, all for a while', () => {
    const state = model();
    expect([meddleCalm(state), meddleRein(state), meddleTemper(state)]).toEqual([1, 1, 1]);
    told(state, 'counselling');
    expect(meddleCalm(state)).toBeCloseTo(0.6);
    told(state, 'festival');
    // Two calm tools together, never below the floor.
    expect(meddleCalm(state)).toBeCloseTo(Math.max(0.45, 0.6 * 0.75));
    told(state, 'security');
    expect(meddleRein(state)).toBe(0.25);
    state.clock.tick += DAY;
    expect(meddleRein(state)).toBe(1);
    expect(meddleCalm(state)).toBeCloseTo(0.45);
    state.clock.tick += DAY;
    expect(meddleCalm(state)).toBeCloseTo(0.75);
    state.clock.tick += DAY;
    expect(meddleCalm(state)).toBe(1);
  });

  it('stirs chaos: a prank war at two dorms for a week, the mascot with tempers and a prank back, spirit and the word out', () => {
    const state = model();
    told(state, 'prankWar');
    const war = prankWarDorms(state)!;
    expect(war).toHaveLength(2);
    expect(war[0]).not.toBe(war[1]);
    expect(state.chaos.spiritAt).toBe(state.clock.tick);
    // Pranks and graffiti during the war land at its two dorms.
    state.clock.tick -= state.clock.tick % INCIDENT_EVAL_TICKS;
    let at = 0;
    for (let n = 0; n < 7 * DAY - INCIDENT_EVAL_TICKS && at < 3; n += INCIDENT_EVAL_TICKS) {
      state.clock.tick += INCIDENT_EVAL_TICKS;
      spawnChaos(state);
      for (const one of state.incidents.active) {
        if (one.chaos === 'prank' || one.chaos === 'graffiti') {
          const hall = state.map.buildings.find((b) => b && b.x === one.x && b.y === one.y);
          expect(war).toContain(hall?.id);
          at += 1;
        }
      }
      state.incidents.active = state.incidents.active.filter((one) => !one.chaos);
    }
    expect(at).toBeGreaterThan(0);
    const other = model();
    other.clock.tick += 2 * DAY;
    told(other, 'mascot');
    expect(other.chaos.mascot?.until).toBe(other.clock.tick + 4 * 60);
    expect(meddleTemper(other)).toBe(1.5);
    const reach = chaosReach(other);
    expect(reach).toBeGreaterThan(0);
    const graffiti = other.incidents.active.filter((one) => one.chaos === 'graffiti').length;
    const later: LogEntry[] = [];
    other.clock.tick += 6 * 60;
    stepMeddle(other, later);
    expect(other.incidents.active.filter((one) => one.chaos === 'graffiti').length).toBe(graffiti + 1);
    expect(later.some((entry) => entry.data?.meddle === MEDDLE.findIndex((spec) => spec.id === 'mascot') + 1 && entry.data?.outcome === 2)).toBe(true);
  });

  it('a party, free food and the festival leave litter; a snowball battle leaves a bruise or two for Medical', () => {
    for (const id of ['party', 'freeFood', 'festival'] as const) {
      const state = model();
      const litter = Object.values(state.grounds.litter).reduce((sum, n) => sum + n, 0);
      told(state, id);
      expect(Object.values(state.grounds.litter).reduce((sum, n) => sum + n, 0), id).toBeGreaterThan(litter);
    }
    const state = model();
    snowing(state);
    const injuries = state.incidents.active.filter((one) => one.kind === 'injury').length;
    told(state, 'snowball');
    expect(state.incidents.active.filter((one) => one.kind === 'injury').length).toBeGreaterThan(injuries);
  });

  it('asks the social web for what a rumour, a date, roommates or a prank war does, and the web does it at its next week', () => {
    const state = advance(model(), T0, T0 + DAY * TICK_MS).state;
    state.money.cash = 1e10;
    state.daily.seals = 100;
    for (const id of ['rumour', 'date', 'roommates', 'prankWar'] as const) told(state, id);
    const asks = state.chaos.meddle.asks;
    expect(asks).toHaveLength(4);
    const week = webWeekOf(state);
    expect(asks.every((one) => one.week === week + 1)).toBe(true);
    // On a web, each kind of ask makes its tie: a couple dates, a feud is a rivalry, friends for life are best friends.
    const web: Web = newWeb(state.seed, 1024);
    catchUp(web, state, week);
    const pick = (n: number) => ({ entryYear: asks[0]!.a.entryYear, index: asks[0]!.a.index + n });
    const tie = (a: { entryYear: number; index: number }, b: { entryYear: number; index: number }): number => {
      const ia = idOf(web, a);
      const ib = idOf(web, b);
      for (let k = 0; k < 12; k++) if (web.other[ia * 12 + k] === ib) return web.kind[ia * 12 + k]!;
      return -1;
    };
    const kinds: Array<['couple' | 'feud' | 'friends', number]> = [['feud', KIND.rival], ['friends', KIND.best]];
    for (const [n, [kind, want]] of kinds.entries()) {
      const a = pick(20 + 2 * n);
      const b = pick(21 + 2 * n);
      if (idOf(web, a) < 0 || idOf(web, b) < 0) continue;
      web.week += 1;
      applyAsks(web, [{ kind, a, b, week: web.week }]);
      expect(tie(a, b), kind).toBe(want);
    }
    // Never the Main Character's ties.
    const a = pick(40);
    const b = pick(41);
    web.mainId = idOf(web, a);
    const before = tie(a, b);
    web.week += 1;
    applyAsks(web, [{ kind: 'feud', a, b, week: web.week }]);
    expect(tie(a, b)).toBe(before);
  });

  it('tells it all in comic words, inside the tone guide and its hard lines, and the paper has a headline for each', () => {
    const lines: string[] = [];
    const allLines: string[] = [];
    for (const spec of MEDDLE) {
      for (const text of [spec.name, spec.line, spec.good, spec.bad]) lines.push(text);
      for (let k = 0; k < 6; k++) {
        const state = model();
        state.clock.tick += k * 997;
        if (spec.snowOnly) snowing(state);
        lines.push(told(state, spec.id), ...linesOf(state));
        for (const one of state.chaos.meddle.news) {
          const headline = MEDDLE_HEADLINES[Number(one.data.meddle) - 1]?.[Number(one.data.outcome)];
          expect(headline, `${spec.id} ${one.data.outcome}`).toBeTruthy();
          lines.push(headline!);
        }
      }
    }
    expect(MEDDLE_HEADLINES).toHaveLength(MEDDLE.length);
    // Every line a rumour, a date or roommates can end with, and its headline.
    for (const [tool, lines] of Object.entries(WEB_LINES)) {
      for (const [did, line] of Object.entries(lines!)) {
        const headline = MEDDLE_WEB_HEADLINES[MEDDLE.findIndex((spec) => spec.id === tool)]?.[did];
        expect(headline, `${tool} ${did}`).toBeTruthy();
        allLines.push(line, headline!);
      }
    }
    lines.push(...allLines);
    for (const line of lines) {
      expect(toneProblem(line), line).toBeNull();
      expect(hardLineProblem(line), line).toBeNull();
      expect(line.toLowerCase(), line).not.toMatch(/riot|brawl|crime|vandal|burn|fire|flame|candle|punch|blind/);
    }
  });

  it('tells the paper the next tick, and an outcome that takes a while when it is over', () => {
    const state = model();
    told(state, 'prankWar');
    const log: LogEntry[] = [];
    state.clock.tick += 1;
    stepMeddle(state, log);
    expect(log).toHaveLength(1);
    expect(log[0]!.kind).toBe('chaos');
    state.clock.tick += 7 * DAY;
    stepMeddle(state, log);
    expect(log).toHaveLength(2);
    expect(log[1]!.data?.outcome).toBe(2);
    expect(state.chaos.meddle.news).toHaveLength(0);
  });

  it('says what the social web did with a rumour, a date or roommates, never what was asked: the taken case is a complicated friendship', () => {
    const state = advance(model(), T0, T0 + DAY * TICK_MS).state;
    const week = webWeekOf(state);
    const web: Web = newWeb(state.seed, 1024);
    catchUp(web, state, week);
    // Someone already dating, and someone single of their class: a rumour asks the web to make them a couple.
    const kindAt = (id: number, k: number): number => web.kind[id * 12 + k]!;
    const partnered = (id: number): boolean => Array.from({ length: 12 }, (_, k) => kindAt(id, k)).some((kind) => kind >= KIND.dating && kind <= KIND.longterm && web.other[id * 12 + Array.from({ length: 12 }, (_, j) => j).find((j) => kindAt(id, j) === kind)!]! >= 0);
    let taken = -1;
    for (let id = 0; id < web.n && taken < 0; id++) if (web.year[id]! >= 0 && id !== web.mainId && partnered(id)) taken = id;
    expect(taken).toBeGreaterThanOrEqual(0);
    let single = -1;
    for (let id = taken + 1; id < web.n && single < 0; id++) if (web.year[id]! === web.year[taken]! && id !== web.mainId && !partnered(id)) single = id;
    expect(single).toBeGreaterThanOrEqual(0);
    const a = refAt(web, taken);
    const b = refAt(web, single);
    state.chaos.meddle.asks.push({ id: 4242, tool: 'rumour', kind: 'couple', a, b, week: week + 1 });
    web.week += 1;
    web.asked = [];
    applyAsks(web, state.chaos.meddle.asks);
    expect(web.asked).toEqual([{ id: 4242, did: 'complicated' }]);
    expect(partnered(taken)).toBe(true);
    // The campus reads it back: the paper says what was done, and the ask is gone.
    const effects = friendsEffectsOf(web)!;
    expect(effects.meddled).toEqual([{ id: 4242, did: 'complicated' }]);
    const done = applyAction(state, { type: 'socialEffects', effects: { ...effects, week: week + 1 } });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.state.web.effects?.meddled).toBeUndefined();
    expect(done.state.chaos.meddle.asks.find((one) => one.id === 4242)).toBeUndefined();
    const line = done.state.chaos.meddle.news.at(-1)!;
    expect(line.text).toMatch(/one of them is with someone else: they are friends, and it is complicated/);
    expect(line.text).not.toMatch(/couple now/);
    expect(line.data).toEqual({ meddle: MEDDLE.findIndex((spec) => spec.id === 'rumour') + 1, did: 'complicated' });
    expect(MEDDLE_WEB_HEADLINES[1]!.complicated).toMatch(/Complicated/);
    // Two single students with room for one more tie: a couple, and the paper says so.
    const free = (id: number): boolean => Array.from({ length: 12 }, (_, k) => web.other[id * 12 + k]).some((other) => other === -1);
    const singles: number[] = [];
    for (let id = 0; id < web.n && singles.length < 2; id++) {
      if (web.year[id]! === web.year[taken]! && id !== web.mainId && id !== taken && id !== single && !partnered(id) && free(id)) singles.push(id);
    }
    expect(singles).toHaveLength(2);
    web.asked = [];
    applyAsks(web, [{ id: 5151, tool: 'date', kind: 'couple', a: refAt(web, singles[0]!), b: refAt(web, singles[1]!), week: web.week }]);
    expect(web.asked).toEqual([{ id: 5151, did: 'couple' }]);
    // A player is never told how it landed before the web has done it.
    for (const id of ['rumour', 'date', 'roommates'] as const) {
      const fresh = model();
      expect(told(fresh, id)).toMatch(/within a game week/);
      expect(fresh.chaos.meddle.news).toHaveLength(0);
    }
  });

  it('is an action: paid, noted, and the state as it was when it cannot be done', () => {
    const state = model();
    const result = applyAction(state, { type: 'meddle', id: 'freeFood' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBeCloseTo(6_000 * scaleOf(state), 0);
    expect(result.note).toMatch(/Free food/);
    expect(state.chaos.meddle.used.freeFood).toBeUndefined();
    expect(result.state.chaos.meddle.used.freeFood).toBe(1);
    const again = applyAction(result.state, { type: 'meddle', id: 'freeFood' });
    expect(again.ok).toBe(false);
  });

  it('comes through a version 38 save with nothing used, nothing running and nothing asked', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(39);
    const state = model();
    const file = JSON.parse(serialize(state, T0));
    file.v = 38;
    delete file.state.chaos.meddle;
    const loaded = parseSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(38);
    expect(loaded.state).toEqual(state);
    expect(typeof MIGRATIONS[38]).toBe('function');
    expect(upgradeNotes(38)).toHaveLength(5);
    expect(upgradeNotes(38)[0]).toMatch(/Meddle/);
  });

  it('shows on the map while it runs (view only): therapy dogs bring groups round a dog, a campus-wide party any night, a snowball battle brings everyone out', () => {
    const state = model();
    expect(meddleShowing(state)).toEqual([]);
    told(state, 'dogs');
    told(state, 'party');
    expect(meddleShowing(state).sort()).toEqual(['dogs', 'party']);
    const group = { size: 3, couple: false, vibe: null, likes: new Set<string>(), exams: false };
    const kinds = (showing: ReadonlySet<string>): string[] => Array.from({ length: 200 }, (_, k) => chooseLawnKind({ ...group, showing }, 'afternoon', 'clear', (k + 0.5) / 200));
    const with_ = kinds(new Set(['dogs']));
    const without = kinds(new Set());
    expect(without.filter((kind) => kind === 'petting')).toHaveLength(0);
    expect(with_.filter((kind) => kind === 'petting').length).toBeGreaterThan(60);
    expect(lawnWords('petting', 'the quad', ['Mia'])).toBe('Petting a therapy dog with Mia on the quad');
    // A Monday evening is no party night, unless the player threw one.
    const monday = { weekday: 1, period: 'evening' as const, weather: 'clear' as const, term: true, parties: true };
    expect(partyTonight(monday)).toBe(false);
    expect(partyTonight({ ...monday, campusWide: true })).toBe(true);
    expect(showingOut(new Set(['snowball']), 'snow', 'afternoon')).toBe(4);
    expect(showingOut(new Set(['dogs']), 'clear', 'night')).toBe(1);
    state.clock.tick += 6 * 60;
    expect(meddleShowing(state)).toEqual(['party']);
    state.clock.tick += 4 * 60;
    expect(meddleShowing(state)).toEqual([]);
  });

  it('is the same in one step or many after meddling', () => {
    const a = model();
    for (const id of ['party', 'prankWar', 'mascot', 'counselling', 'rumour'] as const) told(a, id);
    const b = structuredClone(a);
    const span = DAY * TICK_MS;
    const one = advance(a, T0, T0 + span).state;
    let many = b;
    for (let k = 0; k < 12; k++) many = advance(many, T0 + (k * span) / 12, T0 + ((k + 1) * span) / 12).state;
    expect(many.chaos).toEqual(one.chaos);
    expect(many.inbox.boosts).toEqual(one.inbox.boosts);
    expect(many.incidents).toEqual(one.incidents);
    expect(many.money.cash).toBeCloseTo(one.money.cash, 6);
  });
});

