import { CONCESSIONS_PER_FAN, HOME_GAMES_PER_YEAR, TICKET_PRICE } from '../config/football';
import { ROOM_FEE_PER_BED_PER_YEAR } from '../config/money';
import type { PolicyEffect, PolicySpec } from '../config/policies';
import { CAUSE_NAMES } from '../config/students';
import { dollars, headCount } from '../format';
import { enrollment } from '../selectors';
import type { GameState } from '../types';
import { footballBooks } from './football';
import { housedIfOn, incomeOf, RATING_INPUT_NAME, upkeepOf } from './policies';
import { libraryShare } from './season';
import { driversNow } from './town';
import { greekDrag, greekMembers } from './greek';
import { lateNights } from './parties';

/**
 * A policy in this campus's own numbers: what the switch says before it is
 * turned on (DESIGN.md 41.7). One line for each effect, worked out from the
 * same functions the effect itself uses, so the switch and what follows it
 * cannot disagree. Nothing here is special to one policy.
 */

const signed = (n: number): string => `${n > 0 ? '+' : '\u2212'}${Math.abs(n)}`;
/** A share as a percentage: whole from ten in a hundred up, to one decimal place below that. */
const percent = (share: number): string => `${share >= 0.1 ? Math.round(share * 100) : Math.round(share * 1000) / 10}%`;
const plural = (n: number, one: string, many: string): string => `${headCount(n)} ${n === 1 ? one : many}`;
const lower = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** One effect as the switch says it, with the numbers this campus would see today. */
export function effectWords(state: GameState, effect: PolicyEffect): string {
  switch (effect.kind) {
    case 'cause': {
      const what = `${CAUSE_NAMES[effect.cause]} ${signed(effect.points)}`;
      if (effect.among === 'drivers') return `${what} for the ${plural(driversNow(state), 'student who drives', 'students who drive')}`;
      if (effect.among === 'housed') return `${what} for the freshmen it houses`;
      if (effect.among === 'greek') return `${what} for the ${plural(greekMembers(state), 'student in a chapter', 'students in chapters')}`;
      return effect.fall ? `${what} in the fall semester` : what;
    }
    case 'exams': {
      const words = `Stress ${signed(-effect.points)} in finals week`;
      return effect.library ? `${words} for the ${percent(libraryShare(state))} of students with a library in reach` : words;
    }
    case 'rating':
      return `${RATING_INPUT_NAME[effect.input]} ${signed(effect.points)} in the academic rating${effect.why ? `: ${effect.why}` : ''}`;
    case 'leaving':
      // Those who leave do not graduate, and the rating counts every class that ever finished here.
      return `${percent(effect.share)} more of each class leaves each semester: about ${plural(Math.round(enrollment(state) * effect.share), 'student', 'students')}. Fewer of each class graduate, and the rating remembers`;
    case 'spareBeds': {
      const housed = housedIfOn(state);
      const waiting = state.offCampus[0] - housed;
      return `${plural(housed, 'spare bed', 'spare beds')} filled, ${dollars(housed * ROOM_FEE_PER_BED_PER_YEAR)} a year${waiting > 0 ? `. ${plural(waiting, 'more freshman from town has', 'more freshmen from town have')} no spare bed to take` : ''}`;
    }
    case 'fans':
      return `${percent(effect.lift)} more fans want a seat`;
    case 'freeSeats': {
      const ball = footballBooks(state);
      const lost = HOME_GAMES_PER_YEAR * ball.crowd * (TICKET_PRICE[state.football.stadium.price] ?? 0) * effect.share;
      return `${percent(effect.share)} of the seats are free: ${dollars(lost)} a year less from tickets. The ${dollars(CONCESSIONS_PER_FAN)} a fan spends inside is still earned`;
    }
    case 'upkeep': {
      const more = upkeepOf(state, effect);
      return `${dollars(more.amount)} a year more to run ${plural(more.count, effect.one, effect.many)}`;
    }
    case 'income': {
      const line = incomeOf(state, effect);
      return `${dollars(line.amount)} a year: ${lower(line.detail)}`;
    }
    case 'mischief':
      return `${percent(1 - effect.times)} less mischief in the dorms`;
    case 'greekDrag': {
      const drag = greekDrag(state);
      const now = Math.round(drag.before * 10) / 10;
      return `Greek Row's drag on the graduation rate is ${percent(1 - effect.times)} smaller${now > 0 ? `: about ${Math.round(now * effect.times * 10) / 10} points instead of ${now}` : ''}`;
    }
    case 'greekMembers':
      return `${percent(1 - effect.times)} fewer students join a chapter at rush`;
    case 'hazing':
      return `Each chapter's hazing risk is ${percent(1 - effect.times)} lower`;
    case 'partyCalls':
      return `${percent(1 - effect.times)} fewer ${effect.calls === 'safety' ? 'parties broken up by Campus Safety' : effect.calls === 'medical' ? 'Medical Center calls from parties' : 'calls from parties on campus'}`;
    case 'lateNights': {
      const late = lateNights(state);
      return `Late nights cost ${percent(1 - effect.times)} less${late.stress > 0 ? `: about ${Math.round(late.stress * effect.times * 10) / 10} points of Stress instead of ${late.stress}` : ''}`;
    }
  }
}

/** A policy's gain and its cost, each as the lines the switch shows under the plain words. */
export function policyWords(state: GameState, spec: PolicySpec): { gain: string[]; cost: string[] } {
  return { gain: spec.gains.map((effect) => effectWords(state, effect)), cost: spec.costs.map((effect) => effectWords(state, effect)) };
}
