import type { AdvisorId } from '../types';
import { MIN_WINDOW_TICKS, TICKS_PER_HOUR } from './time';

/**
 * The inbox, the advisors and the newspaper (DESIGN.md sections 12 and 36).
 * Every number here is a tuning target.
 */

/** The most routine items open at once. The annual decisions never count against it. */
export const ROUTINE_CAP = 4;
/** The most routine items that arrive in one real day. Two, so a player who looks in once a day never meets homework. */
export const NEW_PER_DAY = 2;
/** Routine arrivals pause while this many annual decisions are open. */
export const ANNUAL_PAUSE = 2;
/** How long a petition or a deal stays open, and an event. Nothing is shorter than the shortest window the game allows. */
export const ROUTINE_WINDOW_TICKS = 48 * TICKS_PER_HOUR;
export const EVENT_WINDOW_TICKS = MIN_WINDOW_TICKS;
/** No routine item arrives on a campus smaller than this, or in its first real day. */
export const INBOX_MIN_STUDENTS = 100;
/** The past items kept for the list. */
export const INBOX_PAST_KEPT = 8;

/** Everything on the desk together moves Happiness by at most this many points, either way. */
export const HAPPY_CAP = 3;
/** The most Stress any help takes off, in points. Two kinds of help do not add up. */
export const STRESS_OFF_CAP = 12;
/** The most the desk can add to or take from the crowd at a game, and add to a class's applicants. */
export const FANS_CAP = { down: -0.1, up: 0.2 } as const;
export const APPLICANTS_CAP = 0.06;

/** Who the four advisors are (12.2). Their names are made once for each campus and stored. */
export const ADVISORS: Record<AdvisorId, { title: string; domain: string }> = {
  provost: { title: 'Provost', domain: 'Classes, exams and rankings' },
  cfo: { title: 'Chief Financial Officer', domain: 'The budget' },
  athletics: { title: 'Athletic Director', domain: 'Football and the stadium' },
  dean: { title: 'Dean of Students', domain: 'Housing, Happiness and safety' },
};
export const ADVISOR_ORDER: readonly AdvisorId[] = ['provost', 'cfo', 'athletics', 'dean'];

/** What the campus paper may be called. One is picked from the seed and never changes. Every one is invented. */
export const PAPER_NAMES: readonly string[] = ['Lantern', 'Ledger', 'Courier', 'Quill', 'Bugle', 'Record', 'Clarion', 'Gazette'];

/** Invented businesses for deals. None is a real company. */
export const SPONSORS: readonly string[] = ['Brackenby Biscuits', 'Quillby Crackers', 'Hartlow Honey', 'Fennimoor Fizz', 'Wimblecote Waffles', 'Ottershaw Oats'];

/** A notice goes out this long before a decision closes (4.4). */
export const CLOSING_SOON_TICKS = 12 * TICKS_PER_HOUR;
