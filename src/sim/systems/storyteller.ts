import { POLICIES } from '../config/policies';
import {
  CLIFF_HOURS,
  EFFORT_FULL,
  EVENT_CHANCE,
  GOOD_AFTER_BAD,
  HEAVY_COOLDOWN_HOURS,
  ODDS_RANGE,
  QUIET_HOURS,
  REPEAT_COOLDOWN_HOURS,
  SIDE_MOST,
  TEAM_NAME,
  type Choice,
  type Odds,
  type OddsRead,
  type Outcome,
  type StoryEffect,
  type StoryNeed,
  type StorySpec,
} from '../config/stories';
import { LIBRARY } from '../config/storyLibrary';
import { TICKS_PER_HOUR } from '../config/time';
import { hashInts } from '../rng';
import type { ActiveArc, GameState, LogEntry, MainCharacter, Scene } from '../types';
import { chapters, nextGreekDay, pledgeSeason } from './greek';
import { approvalAt } from './happiness';
import { castMember, placesFor, remember } from './mc';
import { callTimes } from './parties';
import { classPressure, dayRead, seasonCurve } from './season';
import { classYearOf, studentCard, teachingQuality } from './students';

/**
 * The storyteller (DESIGN.md 53.3 and 53.5, as built in section 58). Once a
 * real hour it plays the stages that have come, and now and then begins a new
 * story: one main arc and up to two side arcs or events at a time, quiet
 * stretches between, no kind of story twice in a row, heavy themes rationed,
 * good stories mixed in after bad luck, and stories landing on the calendar
 * where they can (bid day in rush week, tryouts in the football season,
 * exams). The phone's rules pick the Main Character's choice; the game rolls
 * the outcome from real numbers and says the odds afterwards, with the part
 * the campus played named. It reads the campus and changes nothing in it.
 */

const SPECS = new Map(LIBRARY.map((spec) => [spec.id, spec]));
export function storySpec(id: string): StorySpec | undefined {
  return SPECS.get(id);
}

const roll = (state: GameState, ...salt: number[]): number => (hashInts(state.seed, 8001, ...salt) % 100_000) / 100_000;
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
const first = (name: string | undefined): string => (name ?? '').split(' ')[0] ?? '';

// --------------------------------------------------------------- the reads --

/** The share of a lever the president has switched on (DESIGN.md 53.3): 1 when a policy that gives it is on. */
function lever(state: GameState, which: 'jobs' | 'aid' | 'dining'): number {
  const on = state.policies?.on;
  if (!on || on.length === 0) return 0;
  return POLICIES.some((spec) => on.includes(spec.id) && spec.gains.some((effect) => effect.kind === 'storyOdds' && effect.lever === which)) ? 1 : 0;
}

/** How much the rules against hazing are on: 0 with none, more with each. */
function oversight(state: GameState): number {
  const on = state.policies?.on;
  if (!on || on.length === 0) return 0;
  let times = 1;
  for (const spec of POLICIES) if (on.includes(spec.id)) for (const effect of spec.gains) if (effect.kind === 'hazing') times *= effect.times;
  return clamp(1 - times, 0, 1);
}

/** One number the odds read, 0 to 1. */
export function oddsRead(state: GameState, mc: MainCharacter, read: OddsRead): number {
  if (read.startsWith('need.')) return mc.needs[read.slice(5) as keyof MainCharacter['needs']] / 100;
  if (read.startsWith('effort.')) {
    const activity = read.slice(7) as keyof typeof EFFORT_FULL;
    return clamp((mc.recent[activity] ?? 0) / (EFFORT_FULL[activity] ?? 10), 0, 1);
  }
  if (read === 'gpa') return clamp((mc.gpa ?? studentCard(state, mc.ref)?.gpa ?? 3) / 4, 0, 1);
  if (read.startsWith('close.')) {
    const role = read.slice(6);
    const one = mc.cast.find((member) => member.role === role);
    return one ? one.closeness / 100 : 0.5;
  }
  const places = placesFor(state, mc);
  switch (read) {
    case 'campus.recreation':
      return places.recreation;
    case 'campus.library':
      return places.library;
    case 'campus.social':
      return places.social;
    case 'campus.classes':
      return 1 - classPressure(state);
    case 'campus.teaching':
      return teachingQuality(state);
    case 'campus.safety': {
      const home = studentCard(state, mc.ref)?.home ?? null;
      if (home === null) return 0.5;
      return approvalAt(state, home).causes.find((cause) => cause.id === 'safety')?.level ?? 0.5;
    }
    case 'campus.ra': {
      // A dorm grown to its later stages has a Resident Advisor on each floor: the Housing stages are the lever.
      const home = studentCard(state, mc.ref)?.home ?? null;
      const building = home === null ? null : state.map.buildings[home];
      return building ? clamp((building.stage - 1) / 2, 0, 1) : 0.3;
    }
    case 'campus.oversight':
      return oversight(state);
    case 'campus.parties': {
      const times = callTimes(state, 0);
      return clamp((1 - (times.safety + times.medical) / 2) * 2, 0, 1);
    }
    case 'campus.jobs':
      return lever(state, 'jobs');
    case 'campus.aid':
      return lever(state, 'aid');
    case 'campus.dining':
      return clamp(lever(state, 'dining') * 0.6 + places.dining * 0.4, 0, 1);
    case 'campus.team':
      return clamp((state.football?.standing ?? 50) / 100, 0, 1);
    default:
      return 0.5;
  }
}

/**
 * The chance of the good outcome, and the words for what moved it, as they read once the outcome is known: a good one
 * names what helped most, the campus's part first where it counted; a bad one what held it back. When nothing pushed
 * that way, it says what it happened despite.
 */
export function oddsOf(state: GameState, mc: MainCharacter, odds: Odds): { chance: number; phrase: (good: boolean) => string } {
  let chance = odds.base;
  const parts = odds.parts.map((part) => ({ c: part.weight * (oddsRead(state, mc, part.read) - 0.5), campus: part.read.startsWith('campus.'), up: part.up, down: part.down }));
  for (const part of parts) chance += part.c;
  const most = (sign: 1 | -1): (typeof parts)[number] | null => {
    const pushing = parts.filter((part) => part.c * sign >= 0.02).sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
    return pushing.find((part) => part.campus) ?? pushing[0] ?? null;
  };
  const phrase = (good: boolean): string => {
    const way = most(good ? 1 : -1);
    if (way) return good ? `helped by ${way.up}` : `held back by ${way.down}`;
    const against = most(good ? -1 : 1);
    if (against) return good ? `despite ${against.down}` : `despite ${against.up}`;
    return 'nothing tipped it either way';
  };
  return { chance: clamp(chance, ODDS_RANGE.low, ODDS_RANGE.high), phrase };
}

// ----------------------------------------------------------- the people --

/** A story's words with the Main Character and the people around them in it. */
export function fill(state: GameState, mc: MainCharacter, text: string): string {
  const role = (r: string, n = 0): string => first(mc.cast.filter((one) => one.role === r)[n]?.name) || (r === 'friend' ? 'a friend' : `their ${r}`);
  const chapter = mc.member ?? chapters(state)[0]?.name ?? 'the chapter';
  return text
    .replaceAll('{name}', first(mc.name))
    .replaceAll('{roommate}', role('roommate'))
    .replaceAll('{friend2}', role('friend', 1))
    .replaceAll('{friend}', role('friend'))
    .replaceAll('{crush}', role('crush'))
    .replaceAll('{partner}', role('partner'))
    .replaceAll('{club}', mc.club ?? 'club')
    .replaceAll('{major}', mc.major)
    .replaceAll('{chapter}', chapter)
    .replaceAll('{team}', TEAM_NAME);
}

function meets(state: GameState, mc: MainCharacter, need: StoryNeed): boolean {
  const has = (role: string): boolean => mc.cast.some((one) => one.role === role);
  const year = classYearOf(state, mc.ref) ?? 0;
  const kind = dayRead(state.clock).kind;
  switch (need) {
    case 'roommate':
      return has('roommate');
    case 'partner':
      return has('partner');
    case 'crush':
      return has('crush');
    case 'single':
      return !has('partner');
    case 'friend':
      return has('friend');
    case 'greekRow':
      return chapters(state).length > 0;
    case 'member':
      return mc.member !== null;
    case 'notMember':
      return mc.member === null;
    case 'team':
      return mc.team;
    case 'notTeam':
      return !mc.team;
    case 'season':
      return !!state.football?.season && !state.football.season.closed;
    case 'over21':
      return year >= 2;
    case 'freshman':
      return year === 0;
    case 'notFreshman':
      return year > 0;
    case 'job':
      return mc.job !== null;
    case 'noJob':
      return mc.job === null;
    case 'club':
      return mc.club !== null;
    case 'term':
      return kind === 'term' || kind === 'midterms' || kind === 'finals';
  }
}

/** True when the calendar is where a story wants to land: rush week, the football season, exams. */
function onCalendar(state: GameState, spec: StorySpec): boolean {
  if (spec.calendar === 'rush') {
    const next = nextGreekDay(state, 0);
    return pledgeSeason(state) || (next !== null && next - state.clock.tick <= 24 * TICKS_PER_HOUR);
  }
  if (spec.calendar === 'season') return !!state.football?.season && !state.football.season.closed;
  if (spec.calendar === 'exams') return seasonCurve(state.clock) >= 0.5;
  return false;
}

// ----------------------------------------------------------- the effects --

function apply(state: GameState, mc: MainCharacter, effect: StoryEffect): void {
  switch (effect.t) {
    case 'need':
      mc.needs[effect.need] = clamp(mc.needs[effect.need] + effect.by, 0, 100);
      return;
    case 'mood':
      mc.mood += effect.by;
      return;
    case 'stress':
      mc.stress += effect.by;
      return;
    case 'gpa':
      mc.gpaBonus += effect.by;
      return;
    case 'money':
      mc.money = Math.round((mc.money + effect.by) * 100) / 100;
      return;
    case 'close': {
      const one = mc.cast.find((member) => member.role === effect.role);
      if (one) one.closeness = clamp(one.closeness + effect.by, 0, 100);
      return;
    }
    case 'job':
      mc.job = effect.job;
      return;
    case 'greek':
      mc.member = effect.join ? (chapters(state)[hashInts(state.seed, 8005, mc.ref.index) % Math.max(1, chapters(state).length)]?.name ?? null) : null;
      return;
    case 'team':
      mc.team = effect.join;
      return;
    case 'cast': {
      const avoid = [mc.name, ...mc.cast.map((one) => one.name)];
      if (effect.change === 'newFriend') mc.cast.push(castMember(state, 'friend', 55, avoid));
      else if (effect.change === 'crushToPartner') {
        const crush = mc.cast.find((one) => one.role === 'crush');
        if (crush) {
          crush.role = 'partner';
          crush.closeness = Math.max(crush.closeness, 60);
        }
      } else if (effect.change === 'breakup') mc.cast = mc.cast.filter((one) => one.role !== 'partner');
      else if (effect.change === 'newCrush') {
        mc.cast = mc.cast.filter((one) => one.role !== 'crush');
        if (!mc.cast.some((one) => one.role === 'partner')) mc.cast.push(castMember(state, 'crush', 15, avoid));
      } else if (effect.change === 'newRoommate') {
        mc.cast = mc.cast.filter((one) => one.role !== 'roommate');
        mc.cast.push(castMember(state, 'roommate', 40, avoid));
      }
      return;
    }
  }
}

// ------------------------------------------------------------ a stage --

/** The phone's rules pick a choice: who they are leans them, and a little of their own mood decides a close call. */
function pick(state: GameState, mc: MainCharacter, choices: readonly Choice[], salt: number): Choice {
  let best = choices[0]!;
  let top = -Infinity;
  choices.forEach((choice, n) => {
    const lean = choice.lean;
    let score = lean?.base ?? 1;
    if (lean?.natures?.includes(mc.nature)) score += 2;
    if (lean?.goals?.some((goal) => mc.goals.includes(goal))) score += 1.5;
    if (lean?.low?.some((need) => mc.needs[need] < 35)) score += 1.5;
    score += roll(state, salt, n);
    if (score > top) {
      top = score;
      best = choice;
    }
  });
  return best;
}

function begin(state: GameState, mc: MainCharacter, spec: StorySpec, main: boolean): void {
  const story = state.story;
  const tick = state.clock.tick;
  const id = story.nextChapter;
  story.nextChapter += 1;
  story.chapters.push({ id, arc: spec.id, title: spec.title, name: mc.name, scenes: [], ended: -1 });
  if (story.chapters.length > 40) story.chapters.splice(0, story.chapters.length - 40);
  story.arcs.push({ id: spec.id, stage: 0, due: tick + Math.round(spec.stages[0]!.hours * TICKS_PER_HOUR), main, chapter: id, cliffTold: false });
  story.lastStart = tick;
  story.cooldowns[spec.id] = tick + REPEAT_COOLDOWN_HOURS * TICKS_PER_HOUR;
}

function finish(state: GameState, arc: ActiveArc, spec: StorySpec): void {
  const story = state.story;
  story.arcs = story.arcs.filter((one) => one !== arc);
  const chapter = story.chapters.find((one) => one.id === arc.chapter);
  if (chapter) chapter.ended = state.clock.tick;
  if (spec.heavy) story.cooldowns.heavy = state.clock.tick + HEAVY_COOLDOWN_HOURS * TICKS_PER_HOUR;
  story.cooldowns[`category:${spec.category}`] = state.clock.tick;
}

/** A stage has come: the choice, the roll, the outcome and its odds, told as a scene. */
function play(state: GameState, mc: MainCharacter, arc: ActiveArc, log: LogEntry[]): void {
  const spec = SPECS.get(arc.id);
  const stage = spec?.stages[arc.stage];
  if (!spec || !stage) {
    state.story.arcs = state.story.arcs.filter((one) => one !== arc);
    return;
  }
  const choice = pick(state, mc, stage.choices, arc.chapter * 31 + arc.stage);
  let outcome: Outcome = choice.good;
  let phrase = '';
  let shown = 1;
  if (choice.odds) {
    const odds = oddsOf(state, mc, choice.odds);
    const good = roll(state, arc.chapter, arc.stage, 7) < odds.chance;
    outcome = good || !choice.bad ? choice.good : choice.bad;
    shown = outcome === choice.good ? odds.chance : 1 - odds.chance;
    phrase = odds.phrase(outcome === choice.good);
  }
  for (const effect of outcome.effects) apply(state, mc, effect);
  const text = fill(state, mc, outcome.text);
  // The odds as a short clause after what happened (the main session's note on build 12): "Sasha says no (47% likely,
  // nothing tipped it either way)." The outcome is said once, in the story's own words.
  const oddsLine = choice.odds ? `${Math.round(shown * 100)}% likely, ${phrase}` : '';
  const scene: Scene = { tick: state.clock.tick, text: fill(state, mc, stage.text), chose: `${first(mc.name)} ${fill(state, mc, choice.label)}.`, outcome: text, odds: fill(state, mc, oddsLine), good: outcome === choice.good };
  state.story.chapters.find((one) => one.id === arc.chapter)?.scenes.push(scene);
  remember(state, mc, scene.odds ? `${text.replace(/[.!]$/, '')} (${scene.odds}).` : text, !!outcome.big, log);
  // What comes next: the next stage, the end, or another story.
  const next = outcome.next;
  if (next === 'end' || (next === undefined && arc.stage + 1 >= spec.stages.length)) {
    finish(state, arc, spec);
    if (!scene.good) state.story.cooldowns.lastBad = state.clock.tick;
    return;
  }
  if (next !== undefined && next !== 'end') {
    finish(state, arc, spec);
    const chained = SPECS.get(next);
    if (chained) begin(state, mc, chained, arc.main);
    return;
  }
  arc.stage += 1;
  arc.due = state.clock.tick + Math.round(spec.stages[arc.stage]!.hours * TICKS_PER_HOUR);
  arc.cliffTold = false;
}

// ------------------------------------------------------------ each hour --

function eligible(state: GameState, mc: MainCharacter, kind: StorySpec['kind']): StorySpec[] {
  const story = state.story;
  const tick = state.clock.tick;
  const active = new Set(story.arcs.map((one) => one.id));
  const heavyBusy = story.arcs.some((one) => SPECS.get(one.id)?.heavy) || (story.cooldowns.heavy ?? -1) > tick;
  const last = story.chapters[story.chapters.length - 1];
  const lastCategory = last ? SPECS.get(last.arc)?.category : undefined;
  return LIBRARY.filter((spec) => {
    if (spec.kind !== kind || spec.weight <= 0 || active.has(spec.id)) return false;
    if ((story.cooldowns[spec.id] ?? -1) > tick) return false;
    if (spec.heavy && heavyBusy) return false;
    // No kind of story twice in a row (53.5).
    if (spec.category === lastCategory) return false;
    if (spec.calendar === 'rush' && !onCalendar(state, spec)) return false;
    return (spec.needs ?? []).every((need) => meets(state, mc, need));
  });
}

function choose(state: GameState, list: StorySpec[], salt: number): StorySpec | null {
  if (list.length === 0) return null;
  const tick = state.clock.tick;
  const badLately = (state.story.cooldowns.lastBad ?? -1) > tick - 24 * TICKS_PER_HOUR;
  const weights = list.map((spec) => spec.weight * (spec.good && badLately ? GOOD_AFTER_BAD : 1) * (spec.calendar && onCalendar(state, spec) ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let at = roll(state, salt, tick) * total;
  for (let n = 0; n < list.length; n++) {
    at -= weights[n]!;
    if (at < 0) return list[n]!;
  }
  return list[list.length - 1]!;
}

/** Once a real hour, with a Main Character: stages that have come are played, cliffhangers said, and new stories begun. */
export function stepStory(state: GameState, log: LogEntry[]): void {
  const mc = state.story?.mc;
  if (!mc || !state.story.arcs) return;
  const story = state.story;
  const tick = state.clock.tick;
  for (const arc of [...story.arcs]) {
    if (arc.due <= tick) play(state, mc, arc, log);
    else if (!arc.cliffTold && arc.due - tick <= CLIFF_HOURS * TICKS_PER_HOUR) {
      const cliff = SPECS.get(arc.id)?.stages[arc.stage]?.cliff;
      arc.cliffTold = true;
      if (cliff) remember(state, mc, fill(state, mc, cliff), true, log);
    }
  }
  const quiet = (hours: number): boolean => story.lastStart < 0 || tick - story.lastStart >= hours * TICKS_PER_HOUR;
  if (!story.arcs.some((one) => one.main) && quiet(QUIET_HOURS.arc)) {
    const spec = choose(state, eligible(state, mc, 'arc'), 11);
    if (spec) begin(state, mc, spec, true);
    return;
  }
  const sides = story.arcs.filter((one) => !one.main).length;
  if (sides < SIDE_MOST && quiet(QUIET_HOURS.event) && roll(state, 13, tick) < EVENT_CHANCE) {
    const spec = choose(state, eligible(state, mc, 'event'), 17);
    if (spec) begin(state, mc, spec, false);
  }
}
