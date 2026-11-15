import { ATHLETES_MOST, RECORD_LEAN, SEASON_GAMES, VARSITY_TEAMS, type VarsityTeam } from '../config/teams';
import { hashInts } from '../rng';
import type { LogEntry } from '../types';
import { enrollment } from '../selectors';
import type { GameState } from '../types';

/**
 * The varsity teams (DESIGN.md 65.7): which the campus fields, how many of its students are on a roster, which team a
 * varsity athlete is on, and where each team practises. Football is fielded once its first season has come; every
 * other team while the campus has its kind of building.
 */

/** Rosters as the campus fields them: the share of students on one, and each team's part of that share, in order. */
export interface Rosters {
  share: number;
  /** Each team fielded, by its place in VARSITY_TEAMS, with the share of all rosters up to and including it. */
  teams: Array<{ index: number; upTo: number }>;
}

let kept: { placed: GameState['map']['placed']; count: number; tick: number; students: number; year: number; rosters: Rosters } | null = null;

/** The teams fielded now, and their rosters against the campus. Kept for the moment: a screen of cards asks once. */
export function rostersOf(state: GameState): Rosters {
  const students = enrollment(state);
  if (kept && kept.placed === state.map.placed && kept.count === state.map.placed.length && kept.tick === state.clock.tick && kept.students === students && kept.year === state.football.firstYear) return kept.rosters;
  const have = new Set<string>();
  for (const placed of state.map.placed) if (placed) have.add(placed.type);
  const season = state.clock.week.year >= state.football.firstYear;
  const fielded = VARSITY_TEAMS.map((team, index) => ({ team, index })).filter(({ team }) => (team.needs === 'stadium' ? season : have.has(team.needs)));
  const total = fielded.reduce((sum, { team }) => sum + team.roster, 0);
  let running = 0;
  const rosters: Rosters = {
    share: students > 0 && total > 0 ? Math.min(ATHLETES_MOST, total / students) : 0,
    teams: fielded.map(({ team, index }) => {
      running += team.roster;
      return { index, upTo: running / total };
    }),
  };
  kept = { placed: state.map.placed, count: state.map.placed.length, tick: state.clock.tick, students, year: state.football.firstYear, rosters };
  return rosters;
}

/** The share of students on a varsity roster now. */
export function athleteShare(state: GameState): number {
  return rostersOf(state).share;
}

/** The team a student's sport roll puts them on, by its place in VARSITY_TEAMS, or -1 for no team. */
export function teamFor(rosters: Rosters, sport: number): number {
  if (sport >= rosters.share || rosters.share <= 0) return -1;
  const at = sport / rosters.share;
  for (const one of rosters.teams) if (at < one.upTo) return one.index;
  return rosters.teams[rosters.teams.length - 1]?.index ?? -1;
}

/** A team by its place in VARSITY_TEAMS. */
export function teamAt(index: number): VarsityTeam | null {
  return VARSITY_TEAMS[index] ?? null;
}

/**
 * Where each team fielded practises: the buildings of its kind in turn, so two teams that need a field use two
 * fields when there are two. By placed building, the teams that practise there. Football is at the stadium.
 */
export function teamVenues(state: GameState): Map<number, VarsityTeam[]> {
  const byType = new Map<string, number[]>();
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const list = byType.get(placed.type) ?? [];
    list.push(placed.id);
    byType.set(placed.type, list);
  }
  const out = new Map<number, VarsityTeam[]>();
  const turn = new Map<string, number>();
  for (const { index } of rostersOf(state).teams) {
    const team = VARSITY_TEAMS[index]!;
    if (team.needs === 'stadium') continue;
    const ids = byType.get(team.needs);
    if (!ids || ids.length === 0) continue;
    const n = turn.get(team.needs) ?? 0;
    turn.set(team.needs, n + 1);
    const id = ids[n % ids.length]!;
    out.set(id, [...(out.get(id) ?? []), team]);
  }
  return out;
}

/** A team's season in a year: its wins and losses, from its luck and a little from the campus's academic standing. */
export function seasonRecord(state: GameState, team: number, year: number): { wins: number; losses: number } {
  const rank = state.field.rank > 0 ? 1 - state.field.rank / 200 : 0.5;
  const luck = (hashInts(state.seed, 9810, year, team) / 4294967296 + hashInts(state.seed, 9811, year, team) / 4294967296) / 2;
  const share = Math.max(0.1, Math.min(0.9, luck + RECORD_LEAN * (rank - 0.5)));
  const wins = Math.round(SEASON_GAMES * share);
  return { wins, losses: SEASON_GAMES - wins };
}

/**
 * The year's varsity seasons (DESIGN.md 65.7), told at the year's end: the best team's and the weakest's. Football
 * has its own season and its own news.
 */
export function teamsYearEnd(state: GameState, year: number, log: LogEntry[]): void {
  const teams = rostersOf(state).teams.filter(({ index }) => VARSITY_TEAMS[index]!.needs !== 'stadium');
  if (teams.length === 0) return;
  const records = teams.map(({ index }) => ({ index, ...seasonRecord(state, index, year) })).sort((a, b) => b.wins - a.wins || a.index - b.index);
  const best = records[0]!;
  const worst = records[records.length - 1]!;
  const name = (index: number): string => VARSITY_TEAMS[index]!.name;
  const title = best.wins >= SEASON_GAMES * 0.8;
  const top = title ? `${name(best.index)} won its conference, ${best.wins}-${best.losses}` : `${name(best.index)} had the best season, ${best.wins}-${best.losses}`;
  const text = records.length > 1 ? `The varsity seasons are over: ${top}, and ${name(worst.index)} finished ${worst.wins}-${worst.losses}.` : `The varsity season is over: ${top}.`;
  log.push({ tick: state.clock.tick, kind: 'teams', text, data: { best: best.index, wins: best.wins, title: title ? 1 : 0, worst: worst.index, worstWins: worst.wins } });
}
