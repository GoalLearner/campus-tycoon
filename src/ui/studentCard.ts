import { courseHistory, gpaWords, termOver } from '../sim/systems/registration';
import { stayingWords } from '../app/activityPeople';
import { canLookInside, homeActivity, homeName } from '../app/room';
import { currentDaylight, shownHour, shownMoment, type DayPeriod } from '../app/daylight';
import { session } from '../app/session';
import { partnerWord, peopleOf, possessive, relationshipWords, type Person } from '../app/socialView';
import { feelingOf } from '../app/emotion';
import { clockWords, itemAt, studentDayAt, type DayItem } from '../app/regularDay';
import { firstNamesOf, happenedTo, idIn, mainPeopleOf, refIn } from '../app/socialView';
import { studentFriends, type StudentFriends } from '../sim/systems/friends';
import { BULLIED_TIE } from '../sim/config/bullying';
import { regularRecord, regularWhy } from '../sim/systems/regulars';
import { socialWeb } from '../app/socialWeb';
import { feedOf, followersOf, postsBy, postWords } from '../app/quadline';
import { store } from '../app/store';
import { studentCard, studentFigure, studentKey, type GameState, type StudentCard, type StudentRef } from '../sim';
import { usesWords } from '../sim/systems/students';
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

/** A line just remembered shows on the follow strip for this many minutes of the player's clock (DESIGN.md 63.9). */
const FEED_FRESH_TICKS = 2;

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

/** What a student is doing at a seat, by the part of the player's day. They sit at it, in a pose made from the pack (DESIGN.md 64). */
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

/** A magnifying glass with a plus (to close up) or a minus (to back out), drawn in the strip's colours. */
function magnifier(out: boolean): string {
  const bar = out ? '' : '<path d="M10 7.2v5.6"/>';
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.2"/><path d="M14.6 14.6 20 20"/><path d="M7.2 10h5.6"/>${bar}</svg>`;
}

/** A walker on the way to, or at, a named place such as the Dining hall. */
function doingText(doing: string): string {
  // Standing in a game, a line or a small scene: the map has the words already.
  const staying = stayingWords(doing);
  if (staying) return staying;
  // Stopped on a path to talk with someone they know (DESIGN.md 63.8).
  if (doing.startsWith('chatting:')) return `Stopped to talk with ${doing.slice(9)}`;
  // A scene (DESIGN.md 63.11): on a date, at a party.
  if (doing.startsWith('date:')) return `On a date with ${doing.slice(5)}`;
  if (doing.startsWith('party:')) return `At a party on ${doing.slice(6)}`;
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
  // The full-size courts and pitch (DESIGN.md 72).
  'Basketball court': 'Shooting hoops on the court',
  'Tennis court': 'Playing tennis',
  'Volleyball court': 'Playing volleyball',
  'Soccer pitch': 'In a game on the pitch',
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
  if (doing === 'sick') return town ? 'In bed with the flu, at home in town' : `In bed with the flu, in ${home}`;
  return town ? 'At home in town' : `In ${home}`;
}

/**
 * Where a regular is who is out of sight: what their day has them doing now (DESIGN.md 63.9), in place of a guess from
 * the last thing the map saw, so Doing now and Today agree. At home, in the words the room uses.
 */
function plannedText(state: GameState, card: StudentCard, item: DayItem): string {
  if (item.where !== 'home') return item.words;
  const town = card.residence === 'offCampus';
  const home = homeName(state, card);
  if (item.words === 'Asleep') return town ? 'Asleep at home in town' : `Asleep in ${home}`;
  if (item.words === 'Getting ready') return town ? 'Getting ready at home in town' : `Getting ready in ${home}`;
  if (item.words === 'In their room') return town ? 'At home in town' : `In ${home}`;
  if (item.words === 'Laundry') return town ? 'Laundry, at home in town' : `Laundry in ${home}'s laundry room`;
  return item.words;
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
  // The close-up while following (DESIGN.md 64.5): in and out again, a magnifying glass with a plus or a minus.
  const stripClose = el('button', 'follow-strip-close');
  stripClose.type = 'button';
  stripClose.addEventListener('click', () => session.setCloseUp(!session.closeUp));
  const stripStop = el('button', 'follow-strip-stop', '×');
  stripStop.type = 'button';
  stripStop.setAttribute('aria-label', 'Stop following');
  stripStop.addEventListener('click', () => session.closeStudent());
  strip.append(stripOpen, stripClose, stripStop);
  const stripFirst = document.createTextNode('');
  stripName.prepend(stripFirst);

  // 2. Doing now, with the one Follow button.
  const doing = row('Doing now');
  const follow = el('button', 'student-follow', 'Follow');
  follow.type = 'button';
  follow.addEventListener('click', () => {
    // Followed, they become a regular, kept from now on (DESIGN.md 63.9).
    if (!session.following && session.student) store.dispatch({ type: 'promoteRegular', ref: session.student });
    session.setFollowing(!session.following);
  });
  // Home in their dorm: a look inside their room (DESIGN.md 46).
  const inside = el('button', 'student-follow student-inside', 'Look inside');
  inside.type = 'button';
  inside.hidden = true;
  inside.addEventListener('click', () => session.openRoom());
  // While following, Close up beside it (DESIGN.md 64.5).
  const closeUp = el('button', 'student-follow student-closeup', 'Close up');
  closeUp.type = 'button';
  closeUp.hidden = true;
  closeUp.addEventListener('click', () => session.setCloseUp(!session.closeUp));
  doing.line.append(follow, closeUp, inside);

  // What they feel right now (DESIGN.md 63.7): the emotion's emote, its name, and the top two reasons behind it.
  const feelingRow = row('Feeling');
  const emoteArt = el('canvas', 'student-emote');
  emoteArt.width = 64;
  emoteArt.height = 64;
  const feelingName = el('span', 'student-feeling');
  const feelingWhy = el('span', 'student-note');
  feelingRow.value.replaceWith(feelingName);
  feelingName.before(emoteArt);
  feelingName.after(feelingWhy);

  // 3 and 4.
  const grades = row('GPA');
  // Their classes this semester (R4a, DESIGN.md 80), and the way to their week and their record.
  const classesRow = row('Classes');
  const scheduleButton = el('button', 'student-follow student-schedule', 'Schedule');
  scheduleButton.type = 'button';
  scheduleButton.addEventListener('click', () => session.openSchedule());
  classesRow.line.append(scheduleButton);
  let classesKey = '';
  let shownHistory: ReturnType<typeof courseHistory> | null = null;
  const club = row('Club');
  // What they use (DESIGN.md 83.6): what they do for fun, where they eat, and what they want that the campus lacks.
  const usesRow = row('Uses');
  // Their milestones of four years (R2, DESIGN.md 66.4): an internship, study abroad, research, senior work.
  const milestones = row('Four years');
  // Their money (R3, DESIGN.md 67): running short, a job, aid, loans, rent and books, the most telling first.
  const wallet = row('Money');

  // 5. Relationship: the status, and a short note on what it does for this one student.
  const relationship = row('Relationship');
  const relationshipNote = el('span', 'student-note');
  relationship.value.after(relationshipNote);

  // Their people from the social web (DESIGN.md 63.6): a partner, a best friend, a roommate, friends, an ex and a
  // rival, each a face that opens their card, so you can hop from person to person.
  const peopleRow = row('People');
  const faces = el('div', 'student-friends');
  peopleRow.value.replaceWith(faces);
  // Their whole network (DESIGN.md 63.12): faces round them, a line for each tie, a face to tap to hop to theirs.
  const network = el('button', 'student-network');
  network.type = 'button';
  network.setAttribute('aria-label', 'See their network');
  network.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" fill="none"><line x1="12" y1="12" x2="5" y2="6"/><line x1="12" y1="12" x2="19" y2="7"/><line x1="12" y1="12" x2="7" y2="19"/><line x1="12" y1="12" x2="18" y2="18" stroke-dasharray="2 2"/></g><g fill="currentColor"><circle cx="12" cy="12" r="3.2"/><circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="7" r="2.2"/><circle cx="7" cy="19" r="2.2"/><circle cx="18" cy="18" r="2.2"/></g></svg>';
  network.append(el('span', 'student-network-word', 'Network'));
  network.addEventListener('click', () => {
    if (session.student) session.openNetwork(session.student);
  });
  peopleRow.line.append(network);

  // Their Quadline profile (DESIGN.md 63.13): followers and their latest post; tapped, the profile in the app.
  const quadRow = el('button', 'student-row student-reason student-quad');
  quadRow.type = 'button';
  const quadValue = el('span', 'student-value');
  const quadNote = el('span', 'student-thought');
  quadRow.append(el('span', 'student-label', 'Quadline'), quadValue, quadNote, el('span', 'student-go', '›'));
  quadRow.addEventListener('click', () => {
    if (session.student) session.openQuad('profile', session.student);
  });
  let quadFor = '';

  // A regular's day and what has happened to them lately (DESIGN.md 63.9). Following a student makes them one.
  const todayRow = row('Today');
  const todayList = el('div', 'student-day');
  todayRow.value.replaceWith(todayList);
  const latelyRow = row('Lately');
  const latelyList = el('div', 'student-day');
  latelyRow.value.replaceWith(latelyList);

  // What their ties do (DESIGN.md 63.10): to their Happiness, their Stress in an exam week and their grades, and why.
  const friendsRow = row('Friends');
  const friendsNote = el('span', 'student-note');
  friendsRow.value.after(friendsNote);

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
    // Their people are their real ties, once the web has answered (DESIGN.md 63.11).
    const people = mainPeopleOf(socialWeb.view, ref);
    const result = store.dispatch({ type: 'makeMain', ref, ...(people ? { people } : {}) });
    if (!result.ok) session.notify(result.error, 'error');
    else session.notify('Your main character is chosen. Their portrait is on the top bar.');
  });
  node.append(head, doing.line, feelingRow.line, grades.line, classesRow.line, club.line, usesRow.line, milestones.line, wallet.line, relationship.line, peopleRow.line, quadRow, friendsRow.line, todayRow.line, latelyRow.line, stress.line, weekends.line, reason, makeMain);

  let atlas: Atlas | null = null;
  let shownKey = '';
  let shownLook = '';
  let stripLook = '';
  let shownMood = -1;
  let shownEmote = '-';
  let emoteDrawn = false;
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
    // Their own ties, once the web has answered; the Main Character's too, whose story's people are on the web (63.11).
    const web = socialWeb.view;
    const tieId = web ? idIn(web, ref) : -1;
    const ties = web && tieId >= 0 ? studentFriends(web, tieId) : null;
    const card = studentCard(state, ref, ties);
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
            ? `Lives off campus on ${card.street}${card.movedOut ? ', moved out this year' : ''}`
            : `Lives off campus${card.movedOut ? ', moved out this year' : ''}`;
    // An undeclared student's leaning, or the major they left, beside the major (DESIGN.md 65.3).
    const major = card.majorNote ? `${card.major} (${card.majorNote.charAt(0).toLowerCase()}${card.majorNote.slice(1)})` : card.major;
    // A varsity athlete's team beside what they are (DESIGN.md 65.7).
    const nature = card.team ? `${card.archetypeName} (${card.team})` : card.archetypeName;
    // Their age (R2, DESIGN.md 66.2), and the day they turn 21 when it is this year, or that it is their birthday.
    const age = card.birthdayToday ? `${card.age} today` : card.age === 20 ? `20, 21 on ${card.birthday}` : String(card.age);
    setText(aboutText, `${card.classYearName}, ${age} · ${major} · ${nature} · ${card.quirk} · ${lives}`);
    hallLink.hidden = hall === null;
    setText(hallLink, hall ?? '');
    setText(aboutAfter, hall !== null && card.chapter ? ` · ${card.chapter}, its house full` : '');

    const feeling = feelingOf(socialWeb.view, state, ref, card, shownHour());
    setText(feelingName, feeling.name);
    setText(feelingWhy, feeling.reasons.join(' · '));
    const emoteKey = feeling.emote ? `emote.${feeling.emote}` : '';
    if (emoteKey !== shownEmote || (atlas && !emoteDrawn)) {
      shownEmote = emoteKey;
      emoteDrawn = !!atlas;
      const drawn = emoteKey !== '' && drawSprite(emoteArt, atlas, emoteKey);
      emoteArt.hidden = !drawn;
    }

    const people = atlas?.people;
    if (atlas && people) {
      // As they are drawn on the map now: a player on a court is in the kit. Otherwise they wear the face of what
      // they feel (DESIGN.md 63.7), where the art has it.
      const look = session.studentLook ?? studentFigure(state, ref, people);
      const plain = `person.${look}.${people.flip?.sw ?? 'sw'}.0`;
      const faced = session.studentLook === null && feeling.face ? `person.${look}.mood.${feeling.face}` : null;
      const sprite = faced && atlas.frames[faced] ? faced : plain;
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
    const today = regularToday(state, ref, card);
    const unseen = today?.now ? plannedText(state, card, today.now) : lastDoing ? indoorsText(lastDoing) : awayText(state, card);
    // On wheels (DESIGN.md 64.6): "Heading to the Library, on a bike".
    setText(doing.value, named(outside ? `${doingText(session.doing!)}${session.riding ? `, ${session.riding}` : ''}` : unseen, homeWord));
    follow.disabled = !outside;
    // Someone staying put has nowhere to be followed to.
    follow.hidden = stayingWords(session.doing) !== null;
    follow.classList.toggle('active', session.following);
    setText(follow, session.following ? 'Following' : 'Follow');
    closeUp.hidden = !session.following;
    closeUp.classList.toggle('active', session.closeUp);
    setText(closeUp, session.closeUp ? 'Close up: on' : 'Close up');
    setText(close, session.following ? 'Hide' : 'Close');
    // Followed home, gone indoors at their hall, or at home by their hours, asleep or in for the evening: the room can
    // be looked into (DESIGN.md 60). Look inside then stands where Follow was.
    const home = canLookInside(state, ref, lastDoing, outside, shownHour());
    inside.hidden = !home;
    if (home) follow.hidden = true;

    // Tutoring lifts it (DESIGN.md 83.4). The card says so, because nothing else shows the study center working yet.
    // The ratio as this student meets it: how many of them there are to a member of faculty (DESIGN.md 38).
    const classes = card.classSize > 0 ? ` · classes of ${card.classSize}` : '';
    // Their grades as their transcript has them (R4b, DESIGN.md 81): the average over the semesters already over, the
    // Dean's list for the last one at 3.5 and up, probation below 2.0; and this week's classes they went to (65.4).
    // Worked out from the seed and the campus's registration, once a semester for a card.
    const regKey = `${ref.entryYear}:${ref.index}:${state.registration?.records.at(-1)?.semester ?? -1}:${termOver(state) ? 1 : 0}:${state.story?.mc?.termShifts?.length ?? 0}`;
    if (regKey !== classesKey || !shownHistory) {
      classesKey = regKey;
      shownHistory = courseHistory(state, ref);
      const plan = shownHistory.semesters.at(-1);
      const missed = plan?.missed.filter((one) => one.needed).length ?? 0;
      setText(classesRow.value, plan && plan.courses.length > 0 ? `${plan.credits} credits: ${plan.courses.map((one) => one.course.code).join(', ')}${missed > 0 ? ` · could not get ${missed === 1 ? 'one they needed' : `${missed} they needed`}` : ''}` : 'None this semester');
    }
    const standing = gpaWords(shownHistory);
    const went = card.classes ? ` · went to ${card.classes.went} of ${card.classes.of} classes this week` : '';
    const latin = shownHistory.latin ? ` · on course for ${shownHistory.latin}` : '';
    setText(grades.value, `${standing}${card.tutored ? ' · with tutoring' : ''}${latin}${classes}${went}`);
    setText(club.value, card.club ?? 'None');
    setText(usesRow.value, usesWords(card.uses));
    const years = [...(card.outcome ? [card.outcome.line] : []), ...card.milestones.lines];
    milestones.line.hidden = years.length === 0;
    setText(milestones.value, years.join(' · '));
    // The Main Character's money is their own story's (DESIGN.md 57), told on their page.
    const mainNow = state.story?.mc;
    wallet.line.hidden = !!mainNow && mainNow.ref.entryYear === ref.entryYear && mainNow.ref.index === ref.index;
    setText(wallet.value, card.money.lines.slice(0, 4).join(' · '));
    const status = relationshipWords(socialWeb.view, state, ref, card.relationship);
    setText(relationship.value, status.name);
    // Single, with their ties known: the old note said what their status did to Happiness, and their ties say it now.
    setText(relationshipNote, card.friends && ties && ties.partner < 0 ? '' : status.note);
    showFriends(state, card, ties);
    showPeople(state, ref);
    showQuad(state, ref);
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

    showDay(state, ref, today);

    // The strip: the same live line as the card's Doing now, and Following only while the camera is (DESIGN.md 61).
    // Gone indoors or dragged away from, it is one tap back to the card, which says where they are. Something that
    // has just happened to them on the map shows there first, for a minute or two: the live feed (63.9).
    stripFirst.textContent = card.name.split(' ')[0]!;
    stripFollowing.hidden = !session.following;
    const latest = regularRecord(state, ref)?.memory.at(-1);
    const fresh = latest && state.clock.tick - latest.tick <= FEED_FRESH_TICKS ? latest.text : null;
    setText(stripDoing, fresh ?? doing.value.textContent ?? '');
    strip.classList.toggle('following', session.following);
    // The close-up's caption reads what the card says they are doing (DESIGN.md 64.5).
    session.doingWords = doing.value.textContent ?? '';
    stripClose.hidden = !session.following;
    stripClose.classList.toggle('active', session.closeUp);
    stripClose.setAttribute('aria-label', session.closeUp ? 'Back out from the close-up' : 'Close up on them');
    stripClose.innerHTML = magnifier(session.closeUp);

    // Looking inside their room, the card waits behind it (DESIGN.md 46). Put away, its strip shows instead (61).
    // So does it behind their network (63.12).
    node.classList.toggle('show', session.room === null && session.network === null && session.schedule === null && !session.tucked);
    strip.classList.toggle('show', session.room === null && session.network === null && session.schedule === null && session.tucked);
  }

  // ------------------------------------------------------------ their day --

  let dayKey = '';
  /** A regular's Today (now and what is next, with times) and Lately (what the map saw, then what the web says). */
  /** A regular's day and what it has them doing now; null for anyone else. The Main Character's day is their page's (57.1). */
  function regularToday(state: GameState, ref: StudentRef, card: StudentCard): { day: DayItem[]; now: DayItem | null } | null {
    const why = regularWhy(state, ref);
    if (why !== 'followed' && why !== 'named') return null;
    // Their own day on the game's clock: until they wake, the night before (DESIGN.md 84).
    const { day, hour } = studentDayAt(socialWeb.view, state, ref, card, shownMoment());
    return { day, now: itemAt(day, hour) };
  }

  function showDay(state: GameState, ref: StudentRef, today: { day: DayItem[]; now: DayItem | null } | null): void {
    if (!today) {
      todayRow.line.hidden = true;
      latelyRow.line.hidden = true;
      dayKey = '';
      return;
    }
    const view = socialWeb.view;
    const { day, now } = today;
    const at = now ? day.indexOf(now) : -1;
    const next = at >= 0 ? day.slice(at, at + 4) : day.slice(0, 4);
    const memory = [...(regularRecord(state, ref)?.memory ?? [])].reverse().map((one) => one.text);
    const told = view ? happenedTo(view, state, ref, 4).map((one) => one.line) : [];
    const lately = [...memory, ...told].slice(0, 4);
    todayRow.line.hidden = next.length === 0;
    latelyRow.line.hidden = lately.length === 0;
    const key = `${studentKey(ref)}|${next.map((one) => one.from + one.words).join(',')}|${lately.join(',')}`;
    if (key === dayKey) return;
    dayKey = key;
    todayList.textContent = '';
    next.forEach((item, i) => {
      const line = el('div', i === 0 && item === now ? 'student-day-line now' : 'student-day-line');
      line.append(el('span', 'student-day-time', i === 0 && item === now ? 'Now' : clockWords(item.from)), el('span', '', item.words));
      todayList.append(line);
    });
    latelyList.textContent = '';
    for (const text of lately) latelyList.append(el('div', 'student-day-line', text));
  }

  // ------------------------------------------------------------ their ties --

  /** "+3", "−2", "+0.05": a signed number as the card says it. */
  const signed = (n: number, places = 0): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(places)}`;

  function showFriends(state: GameState, card: StudentCard, ties: StudentFriends | null): void {
    friendsRow.line.hidden = !card.friends || !ties;
    if (!card.friends || !ties) return;
    const web = socialWeb.view!;
    // Told apart from the student themself too: "studies with Phoenix W." on Phoenix's card.
    const name = (id: number): string => (id >= 0 ? firstNamesOf(state, [card.ref, refIn(web, id)])[1]! : '');
    // Her, his or their, and girlfriend, boyfriend or partner, by gender (DESIGN.md 69.3).
    const own = possessive(state, card.ref).toLowerCase();
    const words: Record<string, (who: number) => string> = {
      close: () => 'close friends',
      partner: (who) => `${name(who)}, ${own} ${partnerWord(state, refIn(web, who)).toLowerCase()}`,
      strained: (who) => `things with ${name(who)}`,
      split: (who) => `${name(who)}, ${own} ex`,
      splitMessy: (who) => `a bad split with ${name(who)}`,
      rival: (who) => `${name(who)}, a rival`,
      alone: () => 'nobody close yet',
      bullied: (who) => BULLIED_TIE.replace('{name}', name(who)),
    };
    const parts = [`Happiness ${signed(card.friends.happiness)}`];
    if (card.friends.stress !== 0) parts.push(`Stress ${signed(card.friends.stress)}`);
    if (card.friends.gpa !== 0) parts.push(`GPA ${signed(card.friends.gpa, 2)}`);
    setText(friendsRow.value, parts.join(' · '));
    const why = ties.reasons.map((one) => `${words[one.id]!(one.who)} ${signed(one.points)}`);
    if (card.friends.gpa > 0 && ties.study >= 0) why.push(`studies with ${name(ties.study)}`);
    setText(friendsNote, why.join(' · '));
  }

  // ---------------------------------------------------------- their people --

  /** Their followers and latest post, read again when the web answers or the card changes hands. */
  let quadView: unknown = null;
  function showQuad(state: GameState, ref: StudentRef): void {
    const view = socialWeb.view;
    quadRow.hidden = !view;
    if (!view) return;
    const key = studentKey(ref);
    if (view === quadView && key === quadFor) return;
    quadView = view;
    quadFor = key;
    const latest = postsBy(feedOf(view, state), ref)[0];
    setText(quadValue, `${followersOf(view, ref).toLocaleString('en-US')} followers`);
    setText(quadNote, latest ? postWords(state, latest).text.replace(/\s*\[\w+\]/g, '') : 'No posts lately');
  }

  let facesKey = '';
  function showPeople(state: GameState, ref: StudentRef): void {
    const view = socialWeb.view;
    // The Main Character's people too: their story's people are on the web (DESIGN.md 63.11).
    const list: Person[] = view ? peopleOf(view, state, ref) : [];
    peopleRow.line.hidden = !view;
    const pack = atlas?.people;
    const key = `${studentKey(ref)}|${list.map((one) => `${studentKey(one.ref)}${one.role}`).join(',')}${atlas ? '' : '-'}`;
    if (key === facesKey) return;
    facesKey = key;
    faces.textContent = '';
    // Two of one first name on a card get their surname's first letter: "Sabrina M." and "Sabrina K.".
    // Told apart from each other and from the student themself.
    const firsts = firstNamesOf(state, [ref, ...list.map((one) => one.ref)]).slice(1);
    for (const [i, one] of list.entries()) {
      const first = firsts[i]!;
      const button = el('button', `student-friend ${one.role}`);
      button.type = 'button';
      button.setAttribute('aria-label', `${first}, ${one.label.toLowerCase()}: open their card`);
      const picture = el('canvas', 'student-friend-art');
      picture.width = 96;
      picture.height = 112;
      if (atlas && pack) drawSprite(picture, atlas, `person.${studentFigure(state, one.ref, pack)}.${pack.flip?.sw ?? 'sw'}.0`);
      button.append(picture, el('span', 'student-friend-name', first), el('span', 'student-friend-role', one.label));
      button.addEventListener('click', () => session.openStudent(one.ref));
      faces.append(button);
    }
    if (list.length === 0) faces.append(el('span', 'student-value student-quiet', 'Getting to know people'));
  }

  return { node, strip, render };
}
