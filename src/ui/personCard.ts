import { session } from '../app/session';
import { personCard, personKey, type GameState, type PersonRef } from '../sim';
import { drawSprite, loadAtlas, type Atlas } from './atlas';

/**
 * The card of someone who is not a student: a professor, a member of staff, a
 * maintenance worker, a Campus Safety officer, a medic or a visitor. It opens
 * when one is tapped on the map, in the style of the student card.
 *
 * Every line is worked out from the game by `personCard` each time the card is
 * drawn. Nothing about the person is stored anywhere. See DESIGN.md 32.2.
 *
 * The lines, top to bottom:
 *   1. Who they are: name, and what they do.
 *   2. What they are doing now. Visitors have no such line.
 *   3. One line in their own words, quoting a number the game reports. Tapping
 *      it goes to what it is about.
 */

/** Which look in the art each role wears. A role with two looks uses its number and the next. */
const TWO_LOOKS: Partial<Record<PersonRef['role'], true>> = { townie: true, parent: true };

/** The sprite number for a person, or null when the art has no figure for their role. */
export function personLook(roles: Record<string, number> | undefined, ref: PersonRef): number | null {
  // Dining workers and store clerks are staff, and each has a figure of their own.
  const base = roles?.[ref.role];
  if (base === undefined) return null;
  return base + (TWO_LOOKS[ref.role] ? Math.abs(ref.n) % 2 : 0);
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

export function mountPersonCard(): { node: HTMLElement; render: (state: GameState | null) => void } {
  // The same box and the same rows as the student card, so the two read as one family.
  const node = el('div', 'student person');

  const head = el('div', 'student-head');
  const portrait = el('canvas', 'student-portrait');
  portrait.width = 96;
  portrait.height = 112;
  const who = el('div', 'student-who');
  const name = el('div', 'student-name');
  const about = el('div', 'student-about');
  who.append(name, about);
  const close = el('button', 'student-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => session.closeStudent());
  head.append(portrait, who, close);

  const doing = el('div', 'student-row');
  const doingValue = el('span', 'student-value');
  doing.append(el('span', 'student-label', 'Doing now'), doingValue);

  // Their own words, with the number in them. Tapping it goes to the building it is about.
  const says = el('button', 'student-row student-reason');
  says.type = 'button';
  const thought = el('span', 'student-thought');
  const go = el('span', 'student-go', '›');
  says.append(el('span', 'student-label', 'Says'), thought, go);
  let target: { x: number; y: number } | null = null;
  says.addEventListener('click', () => {
    if (target) session.focusOn(target.x, target.y);
  });

  node.append(head, doing, says);

  let atlas: Atlas | null = null;
  let shownKey = '';
  let shownLook = '';
  void loadAtlas().then((loaded) => {
    atlas = loaded;
    shownLook = '';
  });

  function render(state: GameState | null): void {
    const ref = session.person;
    if (!state || !ref) {
      node.classList.remove('show');
      shownKey = '';
      return;
    }
    const card = personCard(state, ref);
    if (!card) {
      // Their job went while the card was open: the kitchen was cleared, or the yard let them go.
      session.closeStudent();
      return;
    }
    const key = personKey(ref);
    if (key !== shownKey) {
      shownKey = key;
      shownLook = '';
    }
    setText(name, card.name);
    setText(about, card.title);

    const people = atlas?.people;
    if (atlas && people) {
      const look = personLook(people.roles, ref);
      const sprite = look === null ? '' : `person.${look}.${people.flip?.sw ?? 'sw'}.0`;
      if (sprite !== shownLook) {
        shownLook = sprite;
        portrait.classList.toggle('missing', sprite === '' || !drawSprite(portrait, atlas, sprite));
      }
    }

    doing.style.display = card.doing ? '' : 'none';
    setText(doingValue, card.doing);
    setText(thought, `“${card.line}”`);
    target = card.cell === null ? null : { x: card.cell % state.map.width, y: Math.floor(card.cell / state.map.width) };
    says.disabled = target === null;
    go.style.visibility = target === null ? 'hidden' : '';

    node.classList.add('show');
  }

  return { node, render };
}
