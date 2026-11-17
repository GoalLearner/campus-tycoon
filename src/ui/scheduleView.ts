import type { GameState } from '../sim';
import { dateAt } from '../sim/calendar';
import { DEGREE_CREDITS } from '../sim/config/courses';
import { adviserOf, curvedCourse, professorFor, syllabusOf } from '../sim/systems/coursework';
import { majorAt, majorPath } from '../sim/systems/majors';
import { courseHistory, type Enrolled, type SemesterPlan } from '../sim/systems/registration';
import { studentName } from '../sim/systems/students';
import { session } from '../app/session';
import { clockText } from '../app/clockText';

/**
 * A student's classes (the realism pass, R4a and R4b, DESIGN.md 80 and 81): this semester's week, day by day, each class
 * with its hall, room and professor; each class's syllabus and their marks so far; their adviser, minor and the Honors
 * College; next semester's once registered; and every semester before with its letters and average, toward a degree's
 * 120 credits. A professor's name opens who they are: their title, department, office hours and how they teach.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const YEARS = ['First-year', 'Second-year', 'Third-year', 'Fourth-year', 'Fifth-year', 'Sixth-year'];
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
      item.append(el('span', 'schedule-time', hours(one.from, one.to)), el('span', 'schedule-what', `${one.course.course.code} ${one.course.course.title}${one.lab ? ', lab' : ''}${one.course.honors ? ', honors' : ''}`), el('span', 'schedule-where', `${one.course.hall}, room ${one.course.room} · ${one.course.professor}`));
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

/** "B+", "W", or for an average "3.2". */
const avg = (gpa: number | null): string => (gpa === null ? 'no grades' : gpa.toFixed(2));

export function mountScheduleView(): { node: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'room-sheet schedule-sheet');
  const head = el('div', 'room-head');
  const back = el('button', 'room-close network-back', '‹ Back');
  back.type = 'button';
  const title = el('div', 'room-title');
  const done = el('button', 'room-close', 'Done');
  done.type = 'button';
  done.addEventListener('click', () => session.closeSchedule());
  head.append(back, title, done);
  const body = el('div', 'schedule-body');
  node.append(head, body);
  let drawn = '';
  /** A professor opened from a class: who they are, until Back. */
  let professor: { course: Enrolled } | null = null;
  let last: GameState | null = null;
  back.addEventListener('click', () => {
    professor = null;
    drawn = '';
    if (last) render(last);
  });

  function professorPage(state: GameState, one: Enrolled): void {
    const who = professorFor(state.seed, one.course, one.section);
    title.textContent = who.name;
    body.textContent = '';
    body.append(el('div', 'money-head', `${who.title} · ${who.department}`));
    body.append(el('p', 'schedule-codes', `Teaches ${one.course.code} ${one.course.title}, section ${one.section} of ${one.sections}, in ${one.hall}, room ${one.room}.`));
    body.append(el('p', 'schedule-codes', who.style));
    body.append(el('div', 'money-head', 'Office hours'));
    for (const slot of who.officeHours) body.append(el('p', 'schedule-codes', `${DAYS[slot.day]}, ${hours(slot.from, slot.to)}, ${one.hall}`));
  }

  function render(state: GameState | null): void {
    last = state;
    const ref = session.schedule;
    node.classList.toggle('show', state !== null && ref !== null);
    back.hidden = professor === null;
    if (!state || !ref) {
      drawn = '';
      professor = null;
      return;
    }
    if (professor) {
      const key = `p:${professor.course.course.code}:${professor.course.section}`;
      if (key === drawn) return;
      drawn = key;
      professorPage(state, professor.course);
      return;
    }
    // Worked out once a semester and a month: the same every time it is opened (from the seed and the records).
    const date = dateAt(state.clock);
    const key = `${ref.entryYear}:${ref.index}:${state.registration?.records.length ?? 0}:${state.registration?.records.at(-1)?.semester ?? -1}:${date.month}`;
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
    // Who looks after them: an adviser in their major's department; a minor; the Honors College.
    const major = majorAt(majorPath(state.seed, ref), now.n).subject;
    const adviser = adviserOf(state.seed, ref, major, Math.floor(now.n / 2));
    const about = [`Adviser: ${adviser.name}, ${adviser.department}${adviser.guided ? `, met before each registration${adviser.required ? ' (required)' : ''}` : ', not met this year'}`];
    if (history.minor) about.push(`Minor in ${history.minor}`);
    if (history.honors) about.push('In the Honors College');
    body.append(el('p', 'schedule-codes', about.join(' · ')));
    body.append(el('div', 'money-head', `This semester · ${semesterWords(now)} · ${now.credits} credits`));
    body.append(week(now));
    for (const line of notes(now)) body.append(el('p', 'fine', line));
    // Each class: its professor (tap for who they are), its syllabus, and their marks on what is done.
    const spring = now.n % 2 === 1;
    for (const one of now.courses) {
      const item = el('div', 'schedule-term');
      const name = el('button', 'schedule-prof', `${one.course.code} ${one.course.title} · ${one.professor} ›`);
      name.type = 'button';
      name.addEventListener('click', () => {
        professor = { course: one };
        drawn = '';
        render(state);
      });
      item.append(name);
      const parts = syllabusOf(state.seed, ref, now.semester, one.course, one.grade, spring, date.month, false).map((line) => `${line.name} ${Math.round(line.weight * 100)}%${line.mark ? ` · ${line.mark}` : ` · ${MONTHS[line.month]}`}`);
      item.append(el('p', 'schedule-codes', `${parts.join(' · ')}${curvedCourse(one.course) ? ' · curved' : ''}`));
      body.append(item);
    }
    if (history.next) {
      body.append(el('div', 'money-head', `Registered for next semester · ${history.next.credits} credits`));
      body.append(el('p', 'schedule-codes', history.next.courses.map((one) => `${one.course.code} ${one.course.title}`).join(' · ')));
      for (const line of notes(history.next)) body.append(el('p', 'fine', line));
    }
    // The transcript: every semester over, its letters and its average; the average over all and the credits passed.
    const past = history.semesters.slice(0, -1);
    const latin = history.latin ? ` · on course for ${history.latin}` : '';
    body.append(el('div', 'money-head', `Course record · GPA ${avg(history.gpa)} · ${history.earned} of ${DEGREE_CREDITS} credits${latin}`));
    if (past.length === 0) body.append(el('p', 'fine', 'This is their first semester: no grades yet.'));
    for (const plan of [...past].reverse()) {
      const item = el('div', 'schedule-term');
      item.append(el('div', 'schedule-term-name', `${semesterWords(plan)} · GPA ${avg(plan.gpa)} · ${plan.earned} credits`), el('p', 'schedule-codes', plan.courses.map((one) => `${one.course.code} ${one.course.title} ${one.grade?.letter ?? ''}`).join(' · ')));
      body.append(item);
    }
  }

  return { node, render };
}
