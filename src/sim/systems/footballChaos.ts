import { FOOTBALL_CHAOS, FREE_REIN, SPIRIT_REACH } from '../config/chaos';
import { RIVALRY_SLOT, SCHOOL_COLOURS } from '../config/football';
import { INCIDENT_EVAL_TICKS } from '../config/incidents';
import { dollarsShort } from '../format';
import { hashInts, nextFloat } from '../rng';
import { scaleOf } from '../scale';
import type { Game, GameState, LogEntry } from '../types';
import { chaosOn, rivalryWeek } from './chaos';
import { teamName } from './football';
import { coverFor } from './incidents';

/**
 * The chaos sandbox, stop C3: football chaos (DESIGN.md 77). After a big home win the fans storm the field (34.3), and
 * spirit is up; where Campus Safety does not reach the stadium the goalposts come down and are carried off, and new ones
 * are paid for. After a big win, or a loss in the rivalry, students may drag couches into the street outside a dorm for
 * the night (dragged, never burned). In rivalry week they may kidnap the rival's mascot, which tours the campus until
 * Campus Safety drives it home. Each counts on the Chaos meter (68.2) and makes the paper.
 *
 * On a game with goals only, as all chaos is. Draws from chaos's own random stream, so nothing else turns out
 * differently, and reads only what the game already keeps, so the outcome is the same watched or away.
 */

const DAY = 24 * 60;
/** The storming is kept this long for the map and the paper, in ticks. */
const STORM_KEEP = 30;
/** A game is read at its whistle, within this many ticks of its kickoff, and never after. */
const READ_WITHIN = 6 * 60;

const sum = (points: readonly number[]): number => points.reduce((a, b) => a + b, 0);

/** The rival school's colour: one of the eight school colours, never the player's own, the same every season. */
export function rivalColour(state: GameState): { id: string; name: string; hex: number } {
  const f = state.football;
  const others = SCHOOL_COLOURS.filter((one) => one.id !== f.colour);
  return others[hashInts(state.seed, f.rival, 7717) % others.length]!;
}

/** True when a game was a big win: the rivalry, an upset, or by seventeen or more, as football reads it (10.4). */
function bigWin(game: Game): boolean {
  const us = sum(game.us);
  const them = sum(game.them);
  return us > them && (game.slot === RIVALRY_SLOT || game.oppRating - game.rating >= 6 || us - them >= 17);
}

/** Each tick, on a game with chaos: a game of ours just over is read once; the rival's mascot, in rivalry week. */
export function stepFootballChaos(state: GameState, log: LogEntry[]): void {
  if (!chaosOn(state)) return;
  const c = state.chaos;
  const tick = state.clock.tick;
  const season = state.football.season;
  if (season) {
    for (const game of season.games) {
      // Read once, at its whistle: never a game long over (a save from before chaos has not read its season's games).
      if (!game.done || game.us.length === 0 || game.kick <= c.lastKick || tick - game.kick > READ_WITHIN) continue;
      c.lastKick = game.kick;
      afterGame(state, game, log);
    }
  }
  if (c.storm && tick - c.storm.at > STORM_KEEP) c.storm = null;
  if (c.street && tick >= c.street.until) c.street = null;
  if (c.mascot && tick >= c.mascot.until) {
    c.mascot = null;
    log.push({ tick, kind: 'chaos', text: `Campus Safety has driven the ${teamName(state, state.football.rival)} mascot home, in the back seat, waving. It seemed in good spirits.`, data: { football: 5 } });
  }
  if (tick % INCIDENT_EVAL_TICKS === 0) takeMascot(state, log);
}

/** Spirit is up (68.3): Happiness a little higher for some real days, and the word is out, at most once a real day. */
function lift(state: GameState): boolean {
  const c = state.chaos;
  const tick = state.clock.tick;
  if (tick - c.spiritAt < DAY) return false;
  c.spiritAt = tick;
  c.reach.push({ at: tick, size: SPIRIT_REACH });
  return true;
}

function afterGame(state: GameState, game: Game, log: LogEntry[]): void {
  const c = state.chaos;
  const f = state.football;
  const tick = state.clock.tick;
  const won = sum(game.us) > sum(game.them);
  const big = bigWin(game);
  const plot = f.stadium.plot === null ? null : state.map.placed[f.stadium.plot];
  // The field stormed: a big win at home, at the campus's own stadium.
  if (game.home && big && f.stadium.tier >= 1 && plot) {
    const reached = coverFor(state.map, 'safety', plot.x, plot.y) !== null;
    const roll = nextFloat(state.rng, 'chaos');
    const goalposts = roll < (reached ? FOOTBALL_CHAOS.goalposts.reached : FOOTBALL_CHAOS.goalposts.none);
    c.storm = { at: tick, goalposts };
    const spirit = lift(state);
    const opp = teamName(state, game.opp);
    const score = `${sum(game.us)}-${sum(game.them)}`;
    if (goalposts) {
      const bill = FOOTBALL_CHAOS.goalpostBill * scaleOf(state);
      state.money.cash -= bill;
      c.tally.goalposts += 1;
      if (!reached) c.missed.goalposts += 1;
      log.push({ tick, kind: 'chaos', text: `Fans stormed the field after the ${score} win over ${opp}, and the goalposts came down and went for a walk across campus. New ones cost ${dollarsShort(bill)}.${spirit ? ' Spirit is up.' : ''}`, data: { football: 2, spirit: spirit ? 1 : 0 } });
    } else {
      log.push({ tick, kind: 'chaos', text: `Fans stormed the field after the ${score} win over ${opp}${reached ? ', and Campus Safety kept the goalposts standing' : ''}.${spirit ? ' Spirit is up.' : ''}`, data: { football: 1, spirit: spirit ? 1 : 0 } });
    }
  }
  // Couches in the street: after a big win, or a loss in the rivalry, wherever the game was.
  const rivalryLoss = !won && game.slot === RIVALRY_SLOT;
  if (big || rivalryLoss) {
    const roll = nextFloat(state.rng, 'chaos');
    const pick = nextFloat(state.rng, 'chaos');
    const base = big ? FOOTBALL_CHAOS.street.win : FOOTBALL_CHAOS.street.rivalryLoss;
    const reachedShare = c.covered * (1 - FOOTBALL_CHAOS.street.reached);
    const chance = Math.min(0.9, base * (0.5 + 0.5 * c.tension) * (1 - reachedShare));
    const dorms = state.map.buildings.filter((b): b is NonNullable<typeof b> => !!b && b.zone === 'housing' && b.stage > 0);
    if (roll < chance && dorms.length > 0) {
      const dorm = dorms[Math.min(dorms.length - 1, Math.floor(pick * dorms.length))]!;
      const from = tick + FOOTBALL_CHAOS.street.after;
      c.street = { from, until: from + FOOTBALL_CHAOS.street.lasts, dorm: dorm.id, won };
      c.tally.street += 1;
      if (!coverFor(state.map, 'safety', dorm.x, dorm.y)) c.missed.street += 1;
      const bill = FOOTBALL_CHAOS.couchBill * scaleOf(state);
      state.money.cash -= bill;
      const after = won ? 'the win' : `the loss to ${teamName(state, game.opp)}`;
      log.push({ tick, kind: 'chaos', text: `After ${after}, students dragged couches out into the street by one of the dorms for the night: a lot of cheering, nobody the worse for it, and every couch carried back in the morning. Hauling them cost ${dollarsShort(bill)}.`, data: { football: 3, won: won ? 1 : 0 } });
    }
  }
}

/**
 * In rivalry week, at each incident check: students may kidnap the rival's mascot, once a season. Free rein where Campus
 * Safety does not reach the halls (68.1); it tours the campus until Campus Safety drives it home.
 */
function takeMascot(state: GameState, log: LogEntry[]): void {
  const c = state.chaos;
  const season = state.football.season;
  if (!season || !rivalryWeek(state) || c.mascot || c.mascotSeason === season.year) return;
  const roll = nextFloat(state.rng, 'chaos');
  const rein = FREE_REIN.reached + (FREE_REIN.none - FREE_REIN.reached) * (1 - c.covered);
  if (roll >= FOOTBALL_CHAOS.mascot.chance * rein) return;
  const tick = state.clock.tick;
  c.mascot = { at: tick, until: tick + (c.covered >= 0.6 ? FOOTBALL_CHAOS.mascot.homeReached : FOOTBALL_CHAOS.mascot.homeNone) };
  c.mascotSeason = season.year;
  c.tally.mascot += 1;
  if (c.covered < 0.6) c.missed.mascot += 1;
  const spirit = lift(state);
  const rival = teamName(state, state.football.rival);
  log.push({ tick, kind: 'chaos', text: `The ${rival} mascot has turned up on our campus, in ${rivalColour(state).name.toLowerCase()} and in good spirits, and is being shown round by some very proud students. Campus Safety is arranging the trip home.${spirit ? ' Spirit is up.' : ''}`, data: { football: 4, spirit: spirit ? 1 : 0 } });
}

/** Football chaos on the map now (DESIGN.md 77): for the map and the dev page. Nothing is read from it. */
export function footballChaosNow(state: GameState): { storm: { at: number; goalposts: boolean } | null; street: { from: number; until: number; dorm: number; won: boolean } | null; mascot: { at: number; until: number } | null } {
  if (!chaosOn(state)) return { storm: null, street: null, mascot: null };
  const c = state.chaos;
  const tick = state.clock.tick;
  return { storm: c.storm, street: c.street && tick >= c.street.from ? c.street : null, mascot: c.mascot };
}

