import { campusSocial, type Told, type WebView } from '../app/socialView';
import { studentFigure, type GameState, type StudentRef } from '../sim';
import { firstNameOf } from '../sim/systems/students';
import { regularsNow } from '../sim/systems/regulars';
import { drawSprite, loadAtlas } from './atlas';

/**
 * The Campus social page (DESIGN.md 63.6), behind the student count: how many couples and friend groups, this week's
 * new couples and splits, the drama of the week, the most popular students as faces, this week's news by name, and
 * the biggest friend groups. Every name opens that student's card.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

const count = (n: number): string => Math.round(n).toLocaleString('en-US');

function stat(name: string, value: string): HTMLElement {
  const line = el('div', 'size-row');
  line.append(el('span', '', name), el('span', 'size-value', value));
  return line;
}

/** A line about someone, which opens the first of them. */
function toldLine(told: Told, open: (ref: StudentRef) => void): HTMLElement {
  const line = el('button', 'social-told');
  line.type = 'button';
  line.append(el('span', '', told.line), el('span', 'student-go', '›'));
  line.addEventListener('click', () => open(told.people[0]!));
  return line;
}

function names(state: GameState, refs: StudentRef[]): string {
  const first = refs.map((ref) => firstNameOf(state, ref));
  return first.length <= 1 ? (first[0] ?? '') : `${first.slice(0, -1).join(', ')} and ${first[first.length - 1]}`;
}

export function drawSocialPage(body: HTMLElement, state: GameState, view: WebView, open: (ref: StudentRef) => void): void {
  const social = campusSocial(view, state);
  const share = Math.round(social.inGroups * 100);
  body.append(
    stat('Couples', count(social.couples)),
    stat('Friend groups', `${count(social.groups)} · ${share}% of students`),
    stat('This week', `${count(social.week.couples)} new couples · ${count(social.week.splits)} split up`),
  );

  if (social.drama) body.append(el('div', 'money-head', 'Drama of the week'), toldLine(social.drama, open));

  if (social.popular.length > 0) {
    body.append(el('div', 'money-head', 'Most popular'));
    const faces = el('div', 'student-friends social-faces');
    const canvases: Array<{ canvas: HTMLCanvasElement; ref: StudentRef }> = [];
    for (const one of social.popular) {
      const face = el('button', 'student-friend');
      face.type = 'button';
      const first = firstNameOf(state, one.ref);
      face.setAttribute('aria-label', `${first}: open their card`);
      const canvas = el('canvas', 'student-friend-art');
      canvas.width = 96;
      canvas.height = 112;
      canvases.push({ canvas, ref: one.ref });
      face.append(canvas, el('span', 'student-friend-name', first), el('span', 'student-friend-role', `Known to ${one.known}`));
      face.addEventListener('click', () => open(one.ref));
      faces.append(face);
    }
    body.append(faces);
    void loadAtlas().then((atlas) => {
      const pack = atlas?.people;
      if (!atlas || !pack) return;
      const looks = Math.min(pack.looks, pack.crowd ?? pack.looks);
      for (const { canvas, ref } of canvases) drawSprite(canvas, atlas, `person.${studentFigure(state, ref, looks, pack.roles?.athlete)}.${pack.flip?.sw ?? 'sw'}.0`);
    });
  }

  // The regulars (DESIGN.md 63.9): those followed, then those the seed named, each opening their card.
  const regulars = regularsNow(state).filter((one) => one.why !== 'main').slice(0, 10);
  if (regulars.length > 0) {
    body.append(el('div', 'money-head', 'Regulars'));
    const row = el('div', 'student-friends social-faces');
    const canvases: Array<{ canvas: HTMLCanvasElement; ref: StudentRef }> = [];
    for (const one of regulars) {
      const face = el('button', 'student-friend');
      face.type = 'button';
      const first = firstNameOf(state, one.ref);
      face.setAttribute('aria-label', `${first}: open their card`);
      const canvas = el('canvas', 'student-friend-art');
      canvas.width = 96;
      canvas.height = 112;
      canvases.push({ canvas, ref: one.ref });
      face.append(canvas, el('span', 'student-friend-name', first), el('span', 'student-friend-role', one.why === 'followed' ? 'Followed' : 'Regular'));
      face.addEventListener('click', () => open(one.ref));
      row.append(face);
    }
    body.append(row);
    void loadAtlas().then((atlas) => {
      const pack = atlas?.people;
      if (!atlas || !pack) return;
      const looks = Math.min(pack.looks, pack.crowd ?? pack.looks);
      for (const { canvas, ref } of canvases) drawSprite(canvas, atlas, `person.${studentFigure(state, ref, looks, pack.roles?.athlete)}.${pack.flip?.sw ?? 'sw'}.0`);
    });
  }

  if (social.lines.length > 0) {
    body.append(el('div', 'money-head', 'This week'));
    for (const told of social.lines) body.append(toldLine(told, open));
  }

  if (social.groups3.length > 0) {
    body.append(el('div', 'money-head', 'Friend groups'));
    for (const group of social.groups3) {
      const vibe = group.vibe.charAt(0).toUpperCase() + group.vibe.slice(1);
      body.append(toldLine({ line: `${vibe}: ${names(state, group.members)}`, people: group.members, heavy: false }, open));
    }
  }
}
