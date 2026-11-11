/**
 * The academic year as data: which date each moment of the real week shows,
 * and the events of the year with their dates. Its structure follows a real
 * university's published calendar. Dropping in another year's calendar is a
 * change to this file only.
 *
 * Only the date shown on the HUD reads this today. The events take effect in
 * the football and calendar layer (DESIGN.md section 4.8).
 */

/** A date in the academic year: month 1 to 12, day, and 0 for the year the fall term starts in or 1 for the year after. */
export type CalDate = readonly [month: number, day: number, year: 0 | 1];

export type CalendarEventKind =
  | 'start' // a term begins. The fall and spring starts are the intakes
  | 'classes' // first or last day of classes
  | 'holiday' // one day, campus closed
  | 'break' // most students leave
  | 'midterms'
  | 'finals'
  | 'commencement'
  | 'grades'; // a term closes and grades are due

export interface CalendarEntry {
  id: string;
  name: string;
  kind: CalendarEventKind;
  from: CalDate;
  /** The last day, for anything longer than a day. */
  to?: CalDate;
}

export interface AcademicCalendar {
  /** The calendar year the fall term starts in. It decides which weekday each date falls on. */
  startYear: number;
  /**
   * Real hours since the fall intake, and the date it is then. Dates in
   * between are spread evenly. The week is 168 hours.
   *
   * Hour 0 is the fall intake and hour 72 the spring intake, so each lands on
   * the first day of its semester. Hour 120 is commencement and hour 144 the
   * first day of the summer term.
   *
   * One fixed point at each change of phase and none inside a phase: the date
   * must run at a steady rate within fall, spring, graduation and summer
   * (the owner's rule, 2026-11-11). Football fits its games to the dates, never
   * the other way round. A test holds this.
   */
  knots: ReadonlyArray<readonly [hours: number, date: CalDate]>;
  events: readonly CalendarEntry[];
}

export const ACADEMIC_CALENDAR: AcademicCalendar = {
  startYear: 2026,
  knots: [
    [0, [8, 19, 0]],
    [72, [1, 19, 1]],
    [120, [5, 13, 1]],
    [144, [5, 26, 1]],
    [168, [8, 19, 1]],
  ],
  events: [
    // Fall
    { id: 'fallStart', name: 'Fall semester begins', kind: 'start', from: [8, 19, 0] },
    { id: 'fallClasses', name: 'First day of classes', kind: 'classes', from: [8, 24, 0] },
    { id: 'laborDay', name: 'Labor Day', kind: 'holiday', from: [9, 7, 0] },
    // The reference calendar lists no midterms. A week at the middle of each semester is added.
    { id: 'fallMidterms', name: 'Midterm week', kind: 'midterms', from: [10, 12, 0], to: [10, 16, 0] },
    { id: 'veteransDay', name: 'Veterans Day', kind: 'holiday', from: [11, 11, 0] },
    { id: 'thanksgiving', name: 'Thanksgiving break', kind: 'break', from: [11, 25, 0], to: [11, 29, 0] },
    { id: 'fallLastClasses', name: 'Last day of classes', kind: 'classes', from: [12, 11, 0] },
    { id: 'fallFinals', name: 'Finals week', kind: 'finals', from: [12, 12, 0], to: [12, 18, 0] },
    { id: 'winterBreak', name: 'Winter break', kind: 'break', from: [12, 19, 0], to: [1, 18, 1] },
    { id: 'fallGrades', name: 'Fall grades close', kind: 'grades', from: [12, 31, 0] },
    // Spring
    { id: 'newYear', name: "New Year's Day", kind: 'holiday', from: [1, 1, 1] },
    { id: 'mlkDay', name: 'Martin Luther King Jr. Day', kind: 'holiday', from: [1, 18, 1] },
    { id: 'springStart', name: 'Spring semester begins', kind: 'start', from: [1, 19, 1] },
    { id: 'springClasses', name: 'First day of classes', kind: 'classes', from: [1, 21, 1] },
    { id: 'springMidterms', name: 'Midterm week', kind: 'midterms', from: [3, 15, 1], to: [3, 19, 1] },
    { id: 'springBreak', name: 'Spring break', kind: 'break', from: [3, 29, 1], to: [4, 2, 1] },
    { id: 'springLastClasses', name: 'Last day of classes', kind: 'classes', from: [5, 5, 1] },
    { id: 'springFinals', name: 'Finals week', kind: 'finals', from: [5, 6, 1], to: [5, 12, 1] },
    // Graduation
    { id: 'commencement', name: 'Commencement', kind: 'commencement', from: [5, 13, 1], to: [5, 16, 1] },
    { id: 'springGrades', name: 'Spring grades close', kind: 'grades', from: [5, 21, 1] },
    // Summer
    { id: 'summerStart', name: 'Summer term begins', kind: 'start', from: [5, 26, 1] },
    { id: 'juneteenth', name: 'Juneteenth', kind: 'holiday', from: [6, 19, 1] },
    { id: 'independenceDay', name: 'Independence Day', kind: 'holiday', from: [7, 4, 1] },
    { id: 'summerLastClasses', name: 'Last day of summer classes', kind: 'classes', from: [8, 13, 1] },
    { id: 'summerEnd', name: 'Summer term ends', kind: 'grades', from: [8, 18, 1] },
  ],
};
