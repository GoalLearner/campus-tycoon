import { stayingWords } from '../app/activityPeople';
import { canLookInside, homeActivity, homeName } from '../app/room';
import { currentDaylight, shownHour, type DayPeriod } from '../app/daylight';
import { session } from '../app/session';
import { store } from '../app/store';
import { studentCard, studentFigure, studentKey, type GameState, type StudentCard } from '../sim';
import { drawSprite, loadAtlas, type Atlas } from './atlas';

/**
 * The student card: tap a walking student and six lines say who they are,
 * what they are doing, their GPA, their club, their relationship status and
 * how happy they are.
 *
 * Every line is worked out when the card is open, from the student's seeded
 * identity and the campus numbers (src/sim/systems/students.ts). Nothing is
 * stored, and nothing here runs while the card is closed.
 */

/** What the walker on the map is doing. */
const DOING: Record<string, string> = {
  toClass: 'Walking to class',
  nextClass: 'Walking to the next class',
  toDorm: 'Heading back to the dorm',
  toQuad: 'Heading to the quad',
  onQuad: 'Sitting on the quad',
  movingIn: 'Moving in',
  walkingIn: 'Walking in from home',
  walkingHome: 'Walking home',
};
/** Where they went when they stepped out of sight, from what they were last doing. */
const INDOORS: Record<string, string> = {
  toClass: 'In class',
  nextClass: 'In class',
  toDorm: 'In the dorm',
  movingIn: 'Unpacking in the dorm',
  walkingIn: 'In class',
  walkingHome: 'At home in town',
};

/** The same, by the part of the player's day where it reads differently. */
const DOING_BY_PERIOD: Partial<Record<DayPeriod, Record<string, string>>> = {
  morning: { toClass: 'Hurrying to class' },
  evening: { toClass: 'Walking to an evening class', nextClass: 'Walking to an evening class' },
  night: { toClass: 'Walking to a night class', nextClass: 'Walking to a night class', toDorm: 'Heading back to the dorm for the night' },
};
const INDOORS_BY_PERIOD: Partial<Record<DayPeriod, Record<string, string>>> = {
  evening: { toClass: 'In an evening class', nextClass: 'In an evening class' },
  night: { toClass: 'In a night class', nextClass: 'In a night class', toDorm: 'Asleep in the dorm' },
};

/** What a student is doing at a seat, by the part of the player's day. Nobody in the pack can sit, so they stand at it. */
const SEATS: Record<string, { a: string; at: Record<DayPeriod, string> }> = {
  Bench: {
    a: 'a bench',
    at: { morning: 'Having coffee at a bench', afternoon: 'Reading at a bench', evening: 'Talking with friends at a bench', night: 'Out late at a bench' },
  },
  'Picnic table': {
    a: 'a picnic table',
    at: { morning: 'Having breakfast at a picnic table', afternoon: 'Studying at a picnic table', evening: 'Talking with friends at a picnic table', night: 'Out late at a picnic table' },
  },
};

/** A walker on the way to, or at, a named place such as the Dining hall. */
function doingText(doing: string): string {
  // Standing in a game, a line or a small scene: the map has the words already.
  const staying = stayingWords(doing);
  if (staying) return staying;
  // A bench or a picnic table: what they are doing there depends on the time of day.
  const seat = SEATS[doing.slice(8)];
  if (seat && doing.startsWith('toPlace:')) return `Looking for ${seat.a}`;
  if (seat && doing.startsWith('atPlace:')) return seat.at[currentDaylight().period];
  if (doing.startsWith('toPlace:')) return `Heading to the ${doing.slice(8)}`;
  if (doing.startsWith('atPlace:')) return `At the ${doing.slice(8)}`;
  return DOING_BY_PERIOD[currentDaylight().period]?.[doing] ?? DOING[doing] ?? 'Out on campus';
}

/** What a student is doing once they have stepped onto a court or through the gym's door, by the building's name. */
const PLAYING: Record<string, string> = {
  'Outdoor courts': 'Playing on the courts',
  'Recreation field': 'In a game on the field',
  'Aquatics pool': 'Swimming at the pool',
  'Track and field': 'Running on the track',
  Gym: 'Working out at the gym',
};

function indoorsText(doing: string): string {
  const playing = doing.startsWith('toPlace:') ? PLAYING[doing.slice(8)] : undefined;
  if (playing) return playing;
  const inside = INDOORS_BY_PERIOD[currentDaylight().period]?.[doing] ?? INDOORS[doing];
  if (inside) return inside;
  // Gone from view without going indoors anywhere the card knows: what they were last seen doing (DESIGN.md 47).
  const seen = doingText(doing);
  return `Last seen ${seen.charAt(0).toLowerCase()}${seen.slice(1)}`;
}

/**
 * Where a student is who has not been seen on the map since the card opened, in place of "Out of sight": at home,
 * asleep, getting ready or in for the evening, by their own hours (DESIGN.md 60), and otherwise in class.
 */
function awayText(state: GameState, card: StudentCard): string {
  const doing = homeActivity(state, card, shownHour());
  if (doing === null) return 'In class';
  const town = card.residence === 'offCampus';
  const home = homeName(state, card);
  if (doing === 'asleep') return town ? 'Asleep at home in town' : `Asleep in ${home}`;
  if (doing === 'ready') return town ? 'Getting ready at home in town' : `Getting ready in ${home}`;
  return town ? 'At home in town' : `In ${home}`;
}

/** "the dorm" in a line of the card, as the hall's own name: "Heading back to Fernwick Hall". */
function named(text: string, hall: string | null): string {
  return hall ? text.replace('the dorm', hall) : text;
}

const MOOD_NAMES = ['Miserable', 'Unhappy', 'Fine', 'Happy', 'Delighted'];
const MOOD_COLOURS = ['#ff8a7a', '#ffb347', '#ffd24a', '#b9e36b', '#7be495'];
/** The mouth for each mood, drawn in a 24 by 24 face. */
const MOUTHS = [
  'M7.5 17.5 Q12 12.5 16.5 17.5',
  'M8 16.8 Q12 14.2 16 16.8',
  'M8 15.8 H16',
  'M8 14.6 Q12 17.6 16 14.6',
  'M7 14 Q12 20.5 17 14 Z',
];

/** A small drawn face. The same five on every phone, unlike emoji. */
export function face(mood: number): string {
  const colour = MOOD_COLOURS[mood] ?? MOOD_COLOURS[2]!;
  const mouth = MOUTHS[mood] ?? MOUTHS[2]!;
  const brows = mood === 0 ? '<path d="M6.6 7.4 L10 8.6 M17.4 7.4 L14 8.6" />' : '';
  return (
    `<svg viewBox="0 0 24 24" width="26" height="26" role="img" aria-label="${MOOD_NAMES[mood] ?? 'Fine'}">` +
    `<circle cx="12" cy="12" r="10.5" fill="${colour}" stroke="#16201b" stroke-width="1.5" />` +
    `<g fill="#16201b"><circle cx="8.6" cy="10.2" r="1.35" /><circle cx="15.4" cy="10.2" r="1.35" /></g>` +
    `<g fill="${mood === 4 ? '#16201b' : 'none'}" stroke="#16201b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${mouth}" />${brows}</g></svg>`
  );
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function row(label: string): { line: HTMLElement; value: HTMLElement } {
  const line = el('div', 'student-row');
  const value = el('span', 'student-value');
  line.append(el('span', 'student-label', label), value);
  return { line, value };
}

export function mountStudentCard(): { node: HTMLElement; strip: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'student');

  // 1. Who.
  const head = el('div', 'student-head');
  const portrait = el('canvas', 'student-portrait');
  portrait.width = 96;
  portrait.height = 112;
  const who = el('div', 'student-who');
  const name = el('div', 'student-name');
  // Who they are, then where they live. The hall's name is a link: it glides the map to the hall and marks it.
  const about = el('div', 'student-about');
  const aboutText = el('span', '');
  const hallLink = el('button', 'student-hall');
  hallLink.type = 'button';
  const aboutAfter = el('span', '');
  about.append(aboutText, hallLink, aboutAfter);
  let hallAt: { x: number; y: number } | null = null;
  hallLink.addEventListener('click', () => {
    const bar = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
    if (hallAt) session.showHall(hallAt.x, hallAt.y, bar, node.getBoundingClientRect().top);
  });
  who.append(name, about);
  // Close, or while following, Hide: the card goes down to its strip and the camera goes on following (DESIGN.md 61).
  const close = el('button', 'student-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => (session.following ? session.tuckStudent() : session.closeStudent()));
  head.append(portrait, who, close);

  // The strip the card goes down to (DESIGN.md 61): their face, their first name and what they are doing now, live.
  // Tapping it brings the card back; its cross stops following and puts it away.
  const strip = el('div', 'follow-strip');
  const stripOpen = el('button', 'follow-strip-open');
  stripOpen.type = 'button';
  stripOpen.setAttribute('aria-label', 'Show their card');
  const stripFace = el('canvas', 'follow-strip-face');
  stripFace.width = 96;
  stripFace.height = 112;
  const stripText = el('span', 'follow-strip-text');
  const stripName = el('span', 'follow-strip-name');
  const stripFollowing = el('span', 'follow-strip-following', 'Following');
  const stripDoing = el('span', 'follow-strip-doing');
  stripName.append(stripFollowing);
  stripText.append(stripName, stripDoing);
  stripOpen.append(stripFace, stripText, el('span', 'student-go', '›'));
  stripOpen.addEventListener('click', () => session.untuckStudent());
  const stripStop = el('button', 'follow-strip-stop', '×');
  stripStop.type = 'button';
  stripStop.setAttribute('aria-label', 'Stop following');
  stripStop.addEventListener('click', () => session.closeStudent());
  strip.append(stripOpen, stripStop);
  const stripFirst = document.createTextNode('');
  stripName.prepend(stripFirst);

  // 2. Doing now, with the one Follow button.
  const doing = row('Doing now');
  const follow = el('button', 'student-follow', 'Follow');
  follow.type = 'button';
  follow.addEventListener('click', () => session.setFollowing(!session.following));
  // Home in their dorm: a look inside their room (DESIGN.md 46).
  const inside = el('button', 'student-follow student-inside', 'Look inside');
  inside.type = 'button';
  inside.hidden = true;
  inside.addEventListener('click', () => session.openRoom());
  doing.line.append(follow, inside);

  // 3 and 4.
  const grades = row('GPA');
  const club = row('Club');

  // 5. Relationship: the status, and a short note on what it does for this one student.
  const relationship = row('Relationship');
  const relationshipNote = el('span', 'student-note');
  relationship.value.after(relationshipNote);

  // 6. Happiness: a face and the biggest reason. Tapping it goes to the building it is about.
  const reason = el('button', 'student-row student-reason');
  reason.type = 'button';
  const mood = el('span', 'student-face');
  const thought = el('span', 'student-thought');
  reason.append(el('span', 'student-label', 'Happiness'), mood, thought, el('span', 'student-go', '›'));
  let target: { x: number; y: number } | null = null;
  reason.addEventListener('click', () => {
    if (target) session.focusOn(target.x, target.y);
  });

  // Stress, and what the calendar is doing to them this week. Low most of the year.
  const stress = row('Stress');
  // A Party Animal's weekends, said plainly (DESIGN.md 55). Shown only for them.
  const weekends = row('Weekends');
  // The Main Character (DESIGN.md 53.2): any student can be chosen from their card.
  const makeMain = el('button', 'student-follow student-main', 'Make main character');
  makeMain.type = 'button';
  makeMain.addEventListener('click', () => {
    const ref = session.student;
    if (!ref) return;
    const result = store.dispatch({ type: 'makeMain', ref });
    if (!result.ok) session.notify(result.error, 'error');
    else session.notify('Your main character is chosen. Their portrait is on the top bar.');
  });
  node.append(head, doing.line, grades.line, club.line, relationship.line, stress.line, weekends.line, reason, makeMain);

  let atlas: Atlas | null = null;
  let shownKey = '';
  let shownLook = '';
  let stripLook = '';
  let shownMood = -1;
  let lastDoing: string | null = null;
  void loadAtlas().then((loaded) => {
    atlas = loaded;
    shownLook = '';
    stripLook = '';
  });

  function render(state: GameState | null): void {
    const ref = session.student;
    if (!state || !ref) {
      node.classList.remove('show');
      strip.classList.remove('show');
      shownKey = '';
      return;
    }
    const card = studentCard(state, ref);
    if (!card) {
      // They graduated or left while the card was open.
      session.closeStudent();
      return;
    }

    const key = studentKey(ref);
    if (key !== shownKey) {
      shownKey = key;
      lastDoing = null;
      shownLook = '';
    }

    setText(name, card.name);
    // Their hall by its name (DESIGN.md 60), which can be tapped.
    const hall = card.residence === 'dorm' && card.home !== null ? homeName(state, card) : null;
    hallAt = hall !== null ? { x: card.home! % state.map.width, y: Math.floor(card.home! / state.map.width) } : null;
    const lives =
      card.residence === 'chapter'
        ? `Lives in the ${card.chapter} house`
        : card.residence === 'dorm'
          ? 'Lives in '
          : card.street
            ? `Lives off campus on ${card.street}`
            : 'Lives off campus';
    setText(aboutText, `${card.classYearName} · ${card.major} · ${card.archetypeName} · ${card.quirk} · ${lives}`);
    hallLink.hidden = hall === null;
    setText(hallLink, hall ?? '');
    setText(aboutAfter, hall !== null && card.chapter ? ` · ${card.chapter}, its house full` : '');

    const people = atlas?.people;
    if (atlas && people) {
      const looks = Math.min(people.looks, people.crowd ?? people.looks);
      // As they are drawn on the map now: a player on a court is in the kit.
      const sprite = `person.${session.studentLook ?? studentFigure(state, ref, looks, people.roles?.athlete)}.${people.flip?.sw ?? 'sw'}.0`;
      if (sprite !== shownLook) {
        shownLook = sprite;
        portrait.classList.toggle('missing', !drawSprite(portrait, atlas, sprite));
      }
      if (session.tucked && sprite !== stripLook) {
        stripLook = sprite;
        stripFace.classList.toggle('missing', !drawSprite(stripFace, atlas, sprite));
      }
    }

    if (session.doing) lastDoing = session.doing;
    const outside = session.doing !== null;
    // "the dorm" in what the map says, as where they live: their hall, or their chapter's house.
    const homeWord = hall ?? (card.residence === 'chapter' ? `the ${card.chapter} house` : null);
    setText(doing.value, named(outside ? doingText(session.doing!) : lastDoing ? indoorsText(lastDoing) : awayText(state, card), homeWord));
    follow.disabled = !outside;
    // Someone staying put has nowhere to be followed to.
    follow.hidden = stayingWords(session.doing) !== null;
    follow.classList.toggle('active', session.following);
    setText(follow, session.following ? 'Following' : 'Follow');
    setText(close, session.following ? 'Hide' : 'Close');
    // Followed home, gone indoors at their hall, or at home by their hours, asleep or in for the evening: the room can
    // be looked into (DESIGN.md 60). Look inside then stands where Follow was.
    const home = canLookInside(state, ref, lastDoing, outside, shownHour());
    inside.hidden = !home;
    if (home) follow.hidden = true;

    // A study center in reach lifts it. The card says so, because nothing else shows the study center working yet.
    // The ratio as this student meets it: how many of them there are to a member of faculty (DESIGN.md 38).
    const classes = card.classSize > 0 ? ` · classes of ${card.classSize}` : '';
    setText(grades.value, `${card.gpa.toFixed(1)}${card.tutored ? ', with tutoring' : ''}${classes}`);
    setText(club.value, card.club ?? 'None');
    setText(relationship.value, card.relationship.name);
    setText(relationshipNote, card.relationship.note);
    setText(stress.value, `${card.stress < 30 ? 'Low' : card.stress < 60 ? 'Some' : 'High'}, ${card.stress} of 100${card.week ? ` · ${card.week}` : ''}`);
    weekends.line.hidden = card.party === null;
    const main = state.story?.mc;
    const isMain = !!main && main.ref.entryYear === ref.entryYear && main.ref.index === ref.index;
    makeMain.disabled = isMain;
    setText(makeMain, isMain ? 'Your main character' : 'Make main character');
    setText(weekends.value, card.party ?? '');

    if (card.mood !== shownMood) {
      shownMood = card.mood;
      mood.innerHTML = face(card.mood);
    }
    setText(thought, card.reason ? `“${card.reason.thought}”` : '');
    target = card.reason
      ? { x: card.reason.cell % state.map.width, y: Math.floor(card.reason.cell / state.map.width) }
      : null;
    reason.disabled = target === null;

    // The strip: the same live line as the card's Doing now, and Following only while the camera is (DESIGN.md 61).
    // Gone indoors or dragged away from, it is one tap back to the card, which says where they are.
    stripFirst.textContent = card.name.split(' ')[0]!;
    stripFollowing.hidden = !session.following;
    setText(stripDoing, doing.value.textContent ?? '');
    strip.classList.toggle('following', session.following);

    // Looking inside their room, the card waits behind it (DESIGN.md 46). Put away, its strip shows instead (61).
    node.classList.toggle('show', session.room === null && !session.tucked);
    strip.classList.toggle('show', session.room === null && session.tucked);
  }

  return { node, strip, render };
}
