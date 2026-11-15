import { session } from '../app/session';
import { firstNamesOf, networkFor, type NetworkPerson, type TieFeeling } from '../app/socialView';
import { socialWeb } from '../app/socialWeb';
import { studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { studentName } from '../sim/systems/students';
import { drawSprite, loadAtlas, type Atlas } from './atlas';

/**
 * A student's network (DESIGN.md 63.12), from the Network button on their card: their face in the middle and their
 * people round them, partner and best friend nearest, then roommate, friend group and friends, then crushes, exes,
 * rivals and anyone picking on them. Each line is the tie and how it feels from their end: warm solid green, tense
 * dashed red, complicated dotted purple; a dotted grey line is someone only in their friend group. Tap a face to hop
 * to theirs; the back arrow retraces the path.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Where each ring sits, as a share of the stage's width from its middle. */
const RING = [0.2, 0.32, 0.43] as const;
const STROKE: Record<TieFeeling, { colour: string; dash: string }> = {
  warm: { colour: '#5bd17c', dash: '' },
  tense: { colour: '#ff6b6b', dash: '3 2' },
  complicated: { colour: '#b48cff', dash: '0.6 1.8' },
};
const SVG = 'http://www.w3.org/2000/svg';

/** Where a face goes: round its ring, the rings turned a little against each other so faces do not line up. */
export function networkPlaces(people: readonly NetworkPerson[]): Array<{ x: number; y: number }> {
  const counts = [0, 0, 0];
  for (const one of people) counts[one.ring]! += 1;
  const seen = [0, 0, 0];
  return people.map((one) => {
    const i = seen[one.ring]!++;
    const angle = -Math.PI / 2 + (one.ring * Math.PI) / 7 + (2 * Math.PI * i) / Math.max(1, counts[one.ring]!);
    return { x: 50 + 100 * RING[one.ring]! * Math.cos(angle), y: 50 + 100 * RING[one.ring]! * Math.sin(angle) };
  });
}

export function mountNetworkView(): { node: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'room-sheet network-sheet');
  const head = el('div', 'room-head');
  const back = el('button', 'room-close network-back', '‹ Back');
  back.type = 'button';
  const title = el('div', 'room-title');
  const done = el('button', 'room-close', 'Done');
  done.type = 'button';
  head.append(back, title, done);
  const trailLine = el('div', 'network-trail');
  const stage = el('div', 'network-stage');
  const legend = el('div', 'network-legend');
  for (const [feeling, words] of [['warm', 'warm'], ['tense', 'tense'], ['complicated', 'complicated']] as const) {
    const key = el('span', `network-key ${feeling}`);
    key.append(el('i'), document.createTextNode(words));
    legend.append(key);
  }
  const cardButton = el('button', 'student-follow network-card');
  cardButton.type = 'button';
  node.append(head, trailLine, stage, legend, cardButton);

  let atlas: Atlas | null = null;
  void loadAtlas().then((loaded) => {
    atlas = loaded;
    drawn = '';
  });
  /** The students hopped through, the first the one the button was pressed for; the last is in the middle. */
  let trail: StudentRef[] = [];
  let opened = '';
  let drawn = '';
  let state: GameState | null = null;

  const centre = (): StudentRef | null => trail[trail.length - 1] ?? null;
  done.addEventListener('click', () => session.closeNetwork());
  back.addEventListener('click', () => {
    if (trail.length > 1) trail.pop();
    drawn = '';
    if (state) render(state);
  });
  cardButton.addEventListener('click', () => {
    const ref = centre();
    if (!ref) return;
    session.closeNetwork();
    session.openStudent(ref);
  });

  function face(ref: StudentRef, big: boolean): HTMLCanvasElement {
    const canvas = el('canvas', big ? 'network-art big' : 'network-art');
    canvas.width = 96;
    canvas.height = 112;
    const pack = atlas?.people;
    if (atlas && pack && state) {
      const looks = Math.min(pack.looks, pack.crowd ?? pack.looks);
      drawSprite(canvas, atlas, `person.${studentFigure(state, ref, looks, pack.roles?.athlete)}.${pack.flip?.sw ?? 'sw'}.0`);
    }
    return canvas;
  }

  function draw(now: GameState, ref: StudentRef): void {
    const view = socialWeb.view;
    const people = view ? networkFor(view, now, ref) : [];
    const names = firstNamesOf(now, [ref, ...people.map((one) => one.ref)]);
    title.textContent = `${names[0]}'s network`;
    back.hidden = trail.length < 2;
    trailLine.textContent = trail.length > 1 ? trail.map((one) => firstNamesOf(now, [one])[0]).join(' › ') : `${studentName(now, ref)} · ${people.length === 0 ? 'nobody close yet' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}`;
    cardButton.textContent = `Open ${names[0]}'s card`;
    stage.textContent = '';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'network-lines');
    const places = networkPlaces(people);
    people.forEach((one, i) => {
      const at = places[i]!;
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', '50');
      line.setAttribute('y1', '50');
      line.setAttribute('x2', at.x.toFixed(2));
      line.setAttribute('y2', at.y.toFixed(2));
      const stroke = one.line === 'group' ? { colour: '#8a8f99', dash: '0.6 1.8' } : STROKE[one.feeling];
      line.setAttribute('stroke', stroke.colour);
      line.setAttribute('stroke-width', one.line === 'group' ? '0.35' : one.ring === 0 ? '0.9' : '0.6');
      if (stroke.dash) line.setAttribute('stroke-dasharray', stroke.dash);
      line.setAttribute('stroke-linecap', 'round');
      svg.append(line);
    });
    stage.append(svg);
    const middle = el('div', 'network-face centre');
    middle.style.left = '50%';
    middle.style.top = '50%';
    middle.append(face(ref, true), el('span', 'network-name', names[0]!));
    stage.append(middle);
    people.forEach((one, i) => {
      const at = places[i]!;
      const button = el('button', `network-face ring${one.ring}`);
      button.type = 'button';
      button.style.left = `${at.x}%`;
      button.style.top = `${at.y}%`;
      button.setAttribute('aria-label', `${names[i + 1]}, ${one.label}: see their network`);
      button.append(face(one.ref, false), el('span', 'network-name', names[i + 1]!), el('span', `network-label ${one.line === 'group' ? 'group' : one.feeling}`, one.label));
      button.addEventListener('click', () => {
        trail.push(one.ref);
        drawn = '';
        render(now);
      });
      stage.append(button);
    });
  }

  function render(now: GameState | null): void {
    state = now;
    const asked = session.network;
    if (!now || !asked) {
      node.classList.remove('show');
      trail = [];
      opened = '';
      drawn = '';
      return;
    }
    const key = studentKey(asked);
    if (key !== opened) {
      opened = key;
      trail = [asked];
      drawn = '';
    }
    const ref = centre()!;
    // Drawn again when the student in the middle changes, or the web has stepped.
    const stamp = `${studentKey(ref)}|${trail.length}|${socialWeb.view?.week ?? -1}|${atlas ? 1 : 0}`;
    node.classList.add('show');
    if (stamp === drawn) return;
    drawn = stamp;
    draw(now, ref);
  }

  return { node, render };
}
