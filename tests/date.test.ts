import { describe, expect, it } from 'vitest';
import { ACADEMIC_CALENDAR, dateAt, FIRST_INTAKE_TICK, formatDate, TICKS_PER_YEAR } from '../src/sim';

const at = (hours: number, year = 0): string => formatDate(dateAt(FIRST_INTAKE_TICK + year * TICKS_PER_YEAR + Math.round(hours * 60)));

describe('the date on the HUD', () => {
  it('puts each anchor of the week on its date', () => {
    expect(formatDate(dateAt(0))).toBe('Wed, Aug 19');
    expect(at(0)).toBe('Wed, Aug 19');
    // The spring class arrives on the first day of the spring semester.
    expect(at(72)).toBe('Tue, Jan 19');
    // Commencement opens the graduation day, and the summer term opens the last day.
    expect(at(120)).toBe('Thu, May 13');
    expect(at(144)).toBe('Wed, May 26');
    expect(at(168 - 1 / 60)).toBe('Wed, Aug 18');
  });

  it('reaches the first day of classes a couple of hours in', () => {
    expect(at(2.5)).toBe('Mon, Aug 24');
  });

  it('never runs backward, and every year is the same', () => {
    let last = -1;
    for (let hour = 0; hour < 168; hour += 0.25) {
      const date = dateAt(FIRST_INTAKE_TICK + Math.round(hour * 60));
      // Days since the fall start, counting through the new year.
      const order = ((date.month + 4) % 12) * 31 + date.day + (date.month === 8 && date.day < 19 ? 12 * 31 : 0);
      expect(order).toBeGreaterThanOrEqual(last);
      last = order;
      expect(at(hour, 3)).toBe(at(hour));
    }
  });

  it('holds every event of the year in date order within its term', () => {
    const ids = ACADEMIC_CALENDAR.events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['fallStart', 'fallMidterms', 'thanksgiving', 'fallFinals', 'winterBreak', 'springStart', 'springBreak', 'springFinals', 'commencement', 'summerStart']) {
      expect(ids).toContain(id);
    }
  });
});
