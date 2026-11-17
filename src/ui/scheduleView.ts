import type { GameState } from '../sim';
import { DEGREE_CREDITS } from '../sim/config/courses';
import { courseHistory, type Enrolled, type SemesterPlan } from '../sim/systems/registration';
import { studentName } from '../sim/systems/students';
import { session } from '../app/session';
import { clockText } from '../app/clockText';

/**
 * A student's classes (the realism pass, R4a, DESIGN.md 80): this semester's week, day by day, each class with its
 * hall, room and professor; what registration did (a waitlist that let them in, a course they could not get); next
 * semester's, once they have registered; and every semester before, with the credits toward a degree's 120. Opened from
 * the card. Grades by class come with R4b; until then a semester shows its credits.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const YEARS = ['First-year', 'Second-year', 'Third-year', 'Fourth-year', 'Fifth-year', 'Sixth-year'];

/** "First-year fall", "Second-year spring": a semester as the student counts it. */
export function semesterWords(plan: SemesterPlan): string {
  return `${YEARS[Math.min(YEARS.length - 1, Math.floor(plan.n / 2))]} ${plan.n % 2 === 0 ? 'fall' : 'spring'}`;
}

function hours(from: number, to: number): string {
  return `${clockText(from, true)} to ${clockText(to, true)}`;
}

function week(plan: SemesterPlan): HTMLElement {
  const box = el('div', 'schedule-week');
  for (let day = 1; day <= 5; day++) {
    const today: Array<{ from: number; to: number; course: Enrolled; lab: boolean }> = [];
    for (const course of plan.courses) for (const m of course.meetings) if (m.days.includes(day)) today.push({ from: m.from, to: m.to, course, lab: m.lab });
    today.sort((a, b) => a.from - b.from);
    const row = el('div', 'schedule-day');
    row.append(el('div', 'schedule-day-name', DAYS[day]!));
    if (today.length === 0) row.append(el('div', 'schedule-none', 'No classes'));
    for (const one of today) {
      const item = el('div', 'schedule-class');
      item.append(el('span', 'schedule-time', hours(one.from, one.to)), el('span', 'schedule-what', `${one.course.course.code} ${one.course.course.title}${one.lab ? ', lab' : ''}`), el('span', 'schedule-where', `${one.course.hall}, room ${one.course.room} · ${one.course.professor}`));
      row.append(item);
    }
    box.append(row);
  }
  return box;
}

function notes(plan: SemesterPlan): string[] {
  const out: string[] = [];
  for (const course of plan.courses) if (course.fromWaitlist) out.push(`Got into ${course.course.code} ${course.course.title} off the waitlist.`);
  for (const miss of plan.missed) out.push(`Could not get ${miss.course.code} ${miss.course.title}: ${miss.needed ? 'full, and they needed it' : 'full'}.`);
  return out;
}

export function mountScheduleView(): { node: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'room-sheet schedule-sheet');
  const head = el('div', 'room-head');
  const title = el('div', 'room-title');
  const done = el('button', 'room-close', 'Done');
  done.type = 'button';
  done.addEventListener('click', () => session.closeSchedule());
  head.append(title, done);
  const body = el('div', 'schedule-body');
  node.append(head, body);
  let drawn = '';

  function render(state: GameState | null): void {
    const ref = session.schedule;
    node.classList.toggle('show', state !== null && ref !== null);
    if (!state || !ref) {
      drawn = '';
      return;
    }
    // Worked out once a semester: the same every time it is opened (from the seed and the campus's records).
    const key = `${ref.entryYear}:${ref.index}:${state.registration?.records.length ?? 0}:${state.registration?.records.at(-1)?.semester ?? -1}`;
    if (key === drawn) return;
    drawn = key;
    const history = courseHistory(state, ref);
    const now = history.semesters[history.semesters.length - 1];
    title.textContent = `${studentName(state, ref)}'s classes`;
    body.textContent = '';
    if (!now) {
      body.append(el('p', 'fine', 'Not registered for any classes.'));
      return;
    }
    body.append(el('div', 'money-head', `This semester · ${semesterWords(now)} · ${now.credits} credits`));
    body.append(week(now));
    for (const line of notes(now)) body.append(el('p', 'fine', line));
    if (history.next) {
      body.append(el('div', 'money-head', `Registered for next semester · ${history.next.credits} credits`));
      body.append(el('p', 'schedule-codes', history.next.courses.map((one) => `${one.course.code} ${one.course.title}`).join(' · ')));
      for (const line of notes(history.next)) body.append(el('p', 'fine', line));
    }
    const past = history.semesters.slice(0, -1);
    body.append(el('div', 'money-head', `Course record · ${history.earned} of ${DEGREE_CREDITS} credits`));
    if (past.length === 0) body.append(el('p', 'fine', 'This is their first semester.'));
    for (const plan of [...past].reverse()) {
      const item = el('div', 'schedule-term');
      item.append(el('div', 'schedule-term-name', `${semesterWords(plan)} · ${plan.credits} credits`), el('p', 'schedule-codes', plan.courses.map((one) => `${one.course.code} ${one.course.title}`).join(' · ')));
      body.append(item);
    }
  }

  return { node, render };
}
