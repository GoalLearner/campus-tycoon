import { campusHappiness } from '../sim';
import { friendsKeep } from '../sim/systems/population';
import { campusSocial, firstNamesOf, type Told, type WebView } from '../app/socialView';
import { socialWeb } from '../app/socialWeb';
import { feedOf, moodLine } from '../app/quadline';
import { studentFigure, type GameState, type StudentRef } from '../sim';
import { regularsNow } from '../sim/systems/regulars';
import { drawSprite, loadAtlas } from './atlas';

/**
 * The Campus social page (DESIGN.md 63.6), behind the student count: how many couples and friend groups, this week's
 * new couples and splits, the drama of the week, the most popular students as faces, this week's news by name, the
 * biggest dozen friend groups as clusters and the most tight-knit places (63.12). Every name opens that student's card.
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

export function drawSocialPage(body: HTMLElement, state: GameState, view: WebView, open: (ref: StudentRef) => void): void {
  const social = campusSocial(view, state);
  const share = Math.round(social.inGroups * 100);
  body.append(stat('Couples', count(social.couples)), stat('Friend groups', `${count(social.groups)} · ${share}% of students`));
  // This week's news, once a week has been lived: a campus grown again tells none of its own (63.12).
  if (social.week.friends + social.week.couples + social.week.splits > 0) {
    body.append(
      stat('This week', `${count(social.week.couples)} new couples · ${count(social.week.splits)} split up`),
      stat('New friendships', `${count(social.week.friends)} this week`),
    );
  }

  // The feed's mood on Quadline (DESIGN.md 63.14): read only, often a step ahead of Happiness.
  const mood = moodLine(state, view, feedOf(view, state));
  body.append(stat('On Quadline', `${Math.round(mood.upbeat * 100)}% upbeat${mood.worry ? ` · worried about ${mood.worry.toLowerCase()}` : ''}`));

  // What friends do (DESIGN.md 63.10), as the campus last read them: Happiness, exam Stress and who stays.
  const effects = state.web.effects;
  if (effects) {
    const signed = (n: number, places: number): string => `${n > 0 ? '+' : n < 0 ? '\u2212' : ''}${Math.abs(n).toFixed(places)}`;
    const stay = friendsKeep(state, campusHappiness(state).base);
    body.append(
      el('div', 'money-head', 'What friends do'),
      stat('Happiness', `${signed(effects.happiness, 1)} across the campus`),
      stat('Stress in finals', `${signed(effects.examStress, 0)}`),
      stat('Each semester', `${(Math.abs(stay) * 100).toFixed(2)} points ${stay >= 0 ? 'more' : 'fewer'} stay`),
      stat('Nobody close yet', `${Math.round(effects.alone * 100)}% of students`),
      // Lonely, and missing home (DESIGN.md 65.5): common feelings, counted from everyone's ties.
      stat('Lonely', `${Math.round(social.lonely * 100)}% of students`),
      ...(social.homesick !== null ? [stat('Missing home', `${Math.round(social.homesick * 100)}% of first-years who moved away`)] : []),
      // Roommates (DESIGN.md 65.6): about half have some friction, and a few move apart each spring.
      ...(social.roommates
        ? [stat('Roommates', `${Math.round(social.roommates.friction * 100)}% with some friction, ${Math.round(social.roommates.atOdds * 100)}% at odds${social.roommates.switched > 0 ? `; ${social.roommates.switched.toLocaleString('en-US')} moved rooms this year` : ''}`)]
        : []),
      // Picking on someone (DESIGN.md 63.11).
      ...(effects.bullied !== undefined ? [stat('Picked on', `${(effects.bullied * 100).toFixed(1)}% of students`)] : []),
    );
  }

  if (social.drama.length > 0) body.append(el('div', 'money-head', 'Drama of the week'), ...social.drama.map((told) => toldLine(told, open)));

  if (social.popular.length > 0) {
    body.append(el('div', 'money-head', 'Most popular'));
    const faces = el('div', 'student-friends social-faces');
    const canvases: Array<{ canvas: HTMLCanvasElement; ref: StudentRef }> = [];
    const popularNames = firstNamesOf(state, social.popular.map((one) => one.ref));
    for (const [i, one] of social.popular.entries()) {
      const face = el('button', 'student-friend');
      face.type = 'button';
      const first = popularNames[i]!;
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
    const regularNames = firstNamesOf(state, regulars.map((one) => one.ref));
    for (const [i, one] of regulars.entries()) {
      const face = el('button', 'student-friend');
      face.type = 'button';
      const first = regularNames[i]!;
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

  // The biggest dozen friend groups as clusters (DESIGN.md 63.12): their faces in a ring and their vibe; tapped, their
  // members, each opening their card.
  if (social.clusters.length > 0) {
    body.append(el('div', 'money-head', 'Friend groups'));
    const grid = el('div', 'social-clusters');
    const canvases: Array<{ canvas: HTMLCanvasElement; ref: StudentRef }> = [];
    for (const group of social.clusters) {
      const box = el('details', 'social-cluster');
      const summary = el('summary', '');
      const ring = el('div', 'cluster-faces');
      const shown = group.members.slice(0, CLUSTER_FACES);
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'cluster-lines');
      // Round a ring as wide as the box is tall, so the faces keep apart.
      const at = shown.map((_, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / shown.length;
        return { x: 50 + 22 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) };
      });
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          const line = document.createElementNS(SVG, 'line');
          line.setAttribute('x1', at[i]!.x.toFixed(1));
          line.setAttribute('y1', at[i]!.y.toFixed(1));
          line.setAttribute('x2', at[j]!.x.toFixed(1));
          line.setAttribute('y2', at[j]!.y.toFixed(1));
          svg.append(line);
        }
      }
      ring.append(svg);
      for (const [i, ref] of shown.entries()) {
        const canvas = el('canvas', '');
        canvas.width = 96;
        canvas.height = 112;
        canvas.style.left = `${at[i]!.x}%`;
        canvas.style.top = `${at[i]!.y}%`;
        canvases.push({ canvas, ref });
        ring.append(canvas);
      }
      const vibe = group.vibe.charAt(0).toUpperCase() + group.vibe.slice(1);
      summary.append(ring, el('div', 'cluster-vibe', vibe), el('div', 'cluster-size', `${group.members.length} friends`));
      const members = el('div', 'cluster-members');
      const firsts = firstNamesOf(state, group.members);
      for (const [i, ref] of group.members.entries()) {
        const button = el('button', '', firsts[i]!);
        button.type = 'button';
        button.addEventListener('click', () => open(ref));
        members.append(button);
      }
      box.append(summary, members);
      grid.append(box);
    }
    body.append(grid);
    void loadAtlas().then((atlas) => {
      const pack = atlas?.people;
      if (!atlas || !pack) return;
      const looks = Math.min(pack.looks, pack.crowd ?? pack.looks);
      for (const { canvas, ref } of canvases) drawSprite(canvas, atlas, `person.${studentFigure(state, ref, looks, pack.roles?.athlete)}.${pack.flip?.sw ?? 'sw'}.0`);
    });
  }

  // The most tight-knit dorms, clubs, chapters and teams (63.12): how much of their friendships stay inside.
  const tight = socialWeb.tight;
  if (tight.length > 0) {
    body.append(el('div', 'money-head', 'Most tight-knit'), el('p', 'fine', 'How much of their friendships stay among themselves.'));
    for (const group of tight) {
      const line = el('div', 'size-row tight-row');
      const who = el('span', '');
      who.append(el('span', '', group.name), el('span', 'tight-kind', ` · ${TIGHT_KIND[group.kind]}`));
      line.append(who, el('span', 'size-value', `${Math.round(group.share * 100)}% inside`));
      body.append(line);
    }
  }
}

const SVG = 'http://www.w3.org/2000/svg';
/** The faces drawn for a friend group's cluster; the rest are in its list. */
const CLUSTER_FACES = 6;
const TIGHT_KIND = { hall: 'hall', club: 'club', chapter: 'chapter', team: 'team' } as const;
