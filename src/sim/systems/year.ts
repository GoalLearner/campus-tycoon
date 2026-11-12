import { calendarAt } from '../calendar';
import { dollars, headCount } from '../format';
import { enrollment } from '../selectors';
import type { GameState, LogEntry } from '../types';
import { closeYear } from './money';

/** Day 7: close the books and write the year's summary line. */
export function yearEnd(state: GameState, log: LogEntry[]): void {
  const { year } = calendarAt(state.clock);
  const { earned, spent } = closeYear(state);
  state.stats.yearsCompleted += 1;
  const net = earned - spent;
  log.push({
    tick: state.clock.tick,
    kind: 'yearEnd',
    text: `Year ${year} closed with ${headCount(enrollment(state))} students and a net of ${dollars(net)}.`,
    data: { year, enrollment: enrollment(state), earned: Math.round(earned), spent: Math.round(spent) },
  });
}
