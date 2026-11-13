import { sound } from '../app/sound';
import { store } from '../app/store';
import { decorSprite, dollarsShort, duration, giftView, momentViews, yearView, type GameState, type MomentRow, type YearView } from '../sim';
import { drawSprite, loadAtlas } from './atlas';

/**
 * The daily rhythm on screen (DESIGN.md 42.8, as built in section 44): the
 * day's gift card, which opens the paper, and the Year row and the moments
 * of the calendar at the top of the orders board.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A small picture from the atlas, drawn when the atlas is in. */
function picture(key: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size * 2;
  canvas.className = 'gift-art';
  void loadAtlas().then((atlas) => drawSprite(canvas, atlas, key));
  return canvas;
}

/**
 * The gift card: seven boxes, the ones filled ticked, the next one lit, and
 * the seventh the better gift. One tap takes today's. `after` is told when it
 * is taken, with the words of what it gave. null on a game without the layer.
 */
export function giftCard(state: GameState, after: (words: string) => void, compact = false): HTMLElement | null {
  const view = giftView(state);
  if (!view) return null;
  if (compact) return compactCard(state, view, after);
  const card = el('div', view.ready ? 'gift-card ready' : 'gift-card');
  card.append(el('div', 'gift-title', view.ready ? "Today's gift" : "Today's gift is taken"));
  const row = el('div', 'gift-boxes');
  for (const box of view.boxes) {
    const cell = el('div', ['gift-box', box.filled ? 'filled' : '', box.next ? 'next' : '', box.best ? 'best' : ''].filter(Boolean).join(' '));
    cell.append(el('span', 'gift-day', box.best ? 'Day 7' : `Day ${box.n}`));
    // What the box holds, as pictures: a decoration's own drawing, a Gold Seal, cash, or the level's wreath.
    const art = el('div', 'gift-pics');
    if (box.decor) art.append(picture(decorSprite(state, box.decor), 22));
    if (box.seals > 0) art.append(picture('ui.seal', 18));
    if (box.cash > 0) art.append(el('span', 'gift-cash', dollarsShort(box.cash)));
    if (!box.decor && box.seals === 0 && box.cash === 0) art.append(picture('ui.level', 20));
    cell.append(art, el('span', 'gift-xp', `+${box.xp}`));
    if (box.filled) cell.append(el('span', 'gift-tick', '✓'));
    row.append(cell);
  }
  card.append(row);
  const next = view.boxes[view.next - 1]!;
  if (view.ready) {
    card.append(el('p', 'gift-line', `Day ${view.next}: ${next.words}.`));
    const take = el('button', 'primary wide gift-take', next.best ? 'Open the seventh gift' : "Take today's gift");
    take.type = 'button';
    take.addEventListener('click', () => {
      const result = store.dispatch({ type: 'takeGift' });
      if (!result.ok || !result.gift) {
        after(result.ok ? '' : result.error);
        return;
      }
      sound.ui('collect');
      const gift = result.gift;
      const words = [`+${gift.xp} experience`, gift.cash > 0 ? `+${dollarsShort(gift.cash)}` : '', gift.seals > 0 ? `+${gift.seals} Gold ${gift.seals === 1 ? 'Seal' : 'Seals'}` : '', gift.decor ? 'a decoration, in storage' : ''].filter(Boolean).join(' · ');
      after(words);
    });
    card.append(take);
  } else {
    card.append(el('p', 'gift-line', `Day ${view.next} comes tomorrow: ${next.words}. A day missed costs nothing: the card waits.`));
  }
  return card;
}

/** Take today's gift, and tell `after` what it gave. */
function take(after: (words: string) => void): void {
  const result = store.dispatch({ type: 'takeGift' });
  if (!result.ok || !result.gift) {
    after(result.ok ? '' : result.error);
    return;
  }
  sound.ui('collect');
  const gift = result.gift;
  after([`+${gift.xp} experience`, gift.cash > 0 ? `+${dollarsShort(gift.cash)}` : '', gift.seals > 0 ? `+${gift.seals} Gold ${gift.seals === 1 ? 'Seal' : 'Seals'}` : '', gift.decor ? 'a decoration, in storage' : ''].filter(Boolean).join(' · '));
}

/**
 * The gift card as the paper opens with it: one line and the button, with the week's seven boxes as small marks
 * under it, so the paper's headline stays on the first screen (DESIGN.md 47). The whole card is on the Level page.
 */
function compactCard(state: GameState, view: NonNullable<ReturnType<typeof giftView>>, after: (words: string) => void): HTMLElement {
  const card = el('div', view.ready ? 'gift-card compact ready' : 'gift-card compact');
  const next = view.boxes[view.next - 1]!;
  const row = el('div', 'gift-compact-row');
  const text = el('div', 'gift-compact-text');
  text.append(el('div', 'gift-title', view.ready ? "Today's gift" : "Today's gift is taken"), el('div', 'gift-line', view.ready ? `Day ${view.next} of 7: ${next.words}` : `Day ${view.next} comes tomorrow`));
  row.append(text);
  if (view.ready) {
    const button = el('button', 'primary gift-take-compact', next.best ? 'Open' : 'Take');
    button.type = 'button';
    button.addEventListener('click', () => take(after));
    row.append(button);
  }
  const marks = el('div', 'gift-marks');
  for (const box of view.boxes) marks.append(el('span', ['gift-mark', box.filled ? 'filled' : '', box.next ? 'next' : '', box.best ? 'best' : ''].filter(Boolean).join(' ')));
  card.append(row, marks);
  return card;
}

/** The Year row and the moments, at the top of the orders board. */
export function boardTop(state: GameState, claim: (row: MomentRow, box: HTMLElement) => void): HTMLElement[] {
  const out: HTMLElement[] = [];
  const year: YearView | null = yearView(state, duration);
  if (year) {
    const box = el('div', 'order year-row');
    box.append(el('span', 'order-from', 'Goals for the year'));
    if (year.rows) {
      for (const goal of year.rows) {
        const line = el('div', goal.done ? 'year-goal done' : 'year-goal');
        line.append(el('span', 'order-title', goal.words));
        const bar = el('div', 'cause-bar size-bar');
        const fill = el('div', 'cause-fill');
        fill.style.width = `${Math.round(goal.share * 100)}%`;
        bar.append(fill);
        const facts = el('div', 'order-facts');
        facts.append(el('span', '', goal.done ? `${goal.progress} · met` : goal.progress), el('span', '', goal.pays));
        line.append(bar, facts);
        box.append(line);
      }
    }
    box.append(el('p', 'fine', year.note));
    out.push(box);
  }
  for (const row of momentViews(state, duration)) {
    const box = el('div', row.done ? 'order moment done' : row.missed ? 'order moment missed' : 'order moment');
    box.append(el('span', 'order-from', row.name), el('span', 'order-title', row.ask));
    const facts = el('div', 'order-facts');
    facts.append(el('span', '', row.when), el('span', '', ''));
    box.append(facts, el('span', 'order-pays', `Pays ${row.pays}`));
    if (row.done) {
      const take = el('button', 'primary wide', 'Claim');
      take.type = 'button';
      take.addEventListener('click', () => claim(row, box));
      box.append(take);
    }
    out.push(box);
  }
  return out;
}
