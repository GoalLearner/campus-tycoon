import { ADVISOR_ORDER, ADVISORS } from '../config/inbox';
import type { DriverId } from '../config/students';
import { dollars } from '../format';
import { scaleOf } from '../scale';
import { enrollment, openCapacity } from '../selectors';
import type { AdvisorId, GameState } from '../types';
import { budget, occupiedBeds } from './budget';
import { hasSeason, ratingOf, teamRating } from './football';
import { campusHappiness } from './happiness';
import { crowding } from './season';
import { classSizeNow, facultyNeed, facultyWorking, nextSemesterStaff, ratioTarget } from './staffing';
import { nextIntakeSeason } from './demand';

/**
 * The four advisors (DESIGN.md 12.2). Each has one line: the thing in their
 * part of the campus that is holding it back most, read from the campus as it
 * stands. It is the campus-level version of a lot's stall cause, and it
 * always names something the player can do or simply know.
 */

export interface AdvisorLine {
  id: AdvisorId;
  title: string;
  name: string;
  domain: string;
  issue: string;
}

/** What closes each gap in Happiness, in a few words. */
const GAP: Record<DriverId, string> = {
  walk: 'the walk to class. Paths, and lecture halls nearer the dorms, close it',
  green: 'green space. Quads, trees and ponds near the dorms close it',
  clean: 'litter. Bins, a Facilities Yard and workers close it',
  seating: 'somewhere to sit. Benches and picnic tables close it',
  noise: 'stadium noise, for the dorms beside it',
  dining: 'food. More kinds of food near the dorms close it',
  recreation: 'things to do. A gym, courts or a field in reach close it',
  safety: 'safety and health. A Medical Center and Campus Safety in reach close it',
};

/** The ratio in a few words, for the end of the Provost's line: "Faculty: 1 to 20." '' with nobody enrolled. */
export function ratioWords(state: GameState): string {
  const size = Math.round(classSizeNow(state));
  return size > 0 ? `Faculty: 1 to ${size}.` : '';
}

function provost(state: GameState): string {
  const ratio = ratioWords(state);
  const said = (line: string): string => (ratio ? `${line} ${ratio}` : line);
  const a = state.admissions;
  const last = a.lastIntake;
  if (a.waitlist > 0 && last?.bottleneck === 'academic') return said(`Academic seats are the bottleneck: ${a.waitlist.toLocaleString('en-US')} are waiting for one.`);
  // Faculty a tenth or more short of what the campus funds: classes are larger until those hired arrive.
  const need = facultyNeed(state);
  const short = need - facultyWorking(state);
  if (need > 0 && short >= need * 0.1) {
    const coming = nextSemesterStaff(state).faculty - facultyWorking(state);
    const when = nextIntakeSeason(state);
    const arrive = coming > 0 ? ` ${coming.toLocaleString('en-US')} more arrive in the ${when}.` : '';
    return `Faculty are stretched: one to every ${Math.round(classSizeNow(state))} students, where ${ratioTarget(state)} is funded.${arrive}`;
  }
  const crowd = crowding(state);
  if (crowd >= 0.4) {
    const seats = openCapacity(state, 'academic');
    const full = seats > 0 ? Math.round((100 * enrollment(state)) / seats) : 100;
    return said(`Classes are ${Math.min(100, full)}% full, and that is most of what makes exams hard here.`);
  }
  if (last && last.turnedAway > 0 && last.bottleneck === 'academic') return said(`Academic seats capped the last class: ${last.turnedAway.toLocaleString('en-US')} were turned away.`);
  const rank = state.field.rank;
  if (rank > 0) return said(`Ranked No. ${rank} of 200 for academics. Graduation and class size count most.`);
  const seats = openCapacity(state, 'academic');
  const free = Math.max(0, seats - enrollment(state));
  return said(free > 0 ? `Classes have room: ${free.toLocaleString('en-US')} seats are empty.` : 'The first rankings come out in the spring.');
}

function cfo(state: GameState): string {
  const books = budget(state);
  const kept = Math.round(books.kept);
  if (books.incomeTotal <= 0) return 'Nothing comes in until the first class arrives.';
  if (kept < 5) {
    const largest = books.groups[0];
    return `Only $${kept} of every $100 is kept.${largest ? ` ${largest.name} is the largest cost.` : ''}`;
  }
  const beds = openCapacity(state, 'housing');
  const empty = beds > 0 ? 1 - occupiedBeds(state) / beds : 0;
  if (beds >= 50 * scaleOf(state) && empty >= 0.15) return `Housing is ${Math.round(empty * 100)}% empty, and an empty bed earns nothing.`;
  if (state.money.cash >= 400_000 * scaleOf(state) && state.money.cash >= 0.45 * state.money.spendingPerYear) return `${dollars(state.money.cash)} is sitting in the bank. The endowment would put some of it to work.`;
  return `The campus keeps $${kept} of every $100 that comes in.`;
}

function athletics(state: GameState): string {
  const f = state.football;
  if (!hasSeason(state)) return 'The first season kicks off next fall.';
  if (f.stadium.plot === null) return 'The team has no plot for a stadium. Place one from the Build menu, under Athletics.';
  if (f.stadium.work) return `Tier ${f.stadium.work.tier} of the stadium is going up.`;
  if (f.stadium.earned > f.stadium.tier) return `A season of full houses has earned ${f.stadium.tier === 0 ? 'a stadium of your own' : `tier ${f.stadium.tier + 1}`}. The choice comes each spring.`;
  const season = f.season;
  if (season && !season.closed) {
    let losses = 0;
    let lastGap = '';
    for (const game of [...season.games].sort((x, y) => x.slot - y.slot)) {
      if (!game.done) continue;
      const won = game.us.reduce((x, y) => x + y, 0) > game.them.reduce((x, y) => x + y, 0);
      losses = won ? 0 : losses + 1;
      if (!won && game.gap) lastGap = game.gap;
    }
    if (losses >= 3) return `${losses} losses in a row.${lastGap ? ` The biggest gap is ${lastGap}.` : ''}`;
  }
  if (f.coach.until <= state.clock.week.year) return "The head coach's contract ends this year.";
  const rivals = [...f.divisions[0], ...f.divisions[1]].filter((team) => team >= 0);
  const average = rivals.length > 0 ? rivals.reduce((sum, team) => sum + ratingOf(state, team), 0) / rivals.length : 50;
  const mine = teamRating(state).total;
  return `The team rates ${Math.round(mine)} in a conference that averages ${Math.round(average)}.`;
}

function dean(state: GameState): string {
  const a = state.admissions;
  if (a.waitlist > 0 && a.lastIntake?.bottleneck === 'housing') return `Beds are the bottleneck: ${a.waitlist.toLocaleString('en-US')} are waiting for one.`;
  if (enrollment(state) === 0) return 'The first class has not arrived yet.';
  const mood = campusHappiness(state);
  if (mood.worstPart) return `Happiness is ${Math.round(mood.score)}. The biggest gap is ${GAP[mood.worstPart]}.`;
  return `Happiness is ${Math.round(mood.score)}.`;
}

const ISSUE: Record<AdvisorId, (state: GameState) => string> = { provost, cfo, athletics, dean };

/** The four advisors with their one line each, in the order they are listed. */
export function advisorLines(state: GameState): AdvisorLine[] {
  return ADVISOR_ORDER.map((id) => ({ id, title: ADVISORS[id].title, name: state.inbox.advisors[id], domain: ADVISORS[id].domain, issue: ISSUE[id](state) }));
}

/** One advisor, as an item on the desk names them: "Dean of Students Ada Fernwick". */
export function advisorByline(state: GameState, id: AdvisorId): string {
  return `${ADVISORS[id].title} ${state.inbox.advisors[id]}`;
}
