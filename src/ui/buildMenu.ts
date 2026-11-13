/**
 * The Build menu: hand-placed buildings by category. Each card shows the
 * building's own sprite from the art atlas, its cost, the cells it covers, its
 * upkeep and one line on what it does.
 *
 * For now it is opened only by the dev look-preview, with example numbers, so
 * the owner can approve how it looks. It will be opened by a Build button once
 * the buildings exist.
 */

import { drawSprite, loadAtlas, type Atlas } from './atlas';

export interface BuildEntry {
  /** The building this card places. Missing on cards that are only shown. */
  id?: string;
  /** Sprite name in the art manifest. */
  key: string;
  name: string;
  category: string;
  cost: string;
  footprint: string;
  upkeep: string;
  effect: string;
  /** Set on things that are on the way: shown faded with this note instead of a price. */
  locked?: string;
}

function thumbnail(atlas: Atlas | null, key: string): HTMLCanvasElement {
  // Drawn at twice the shown size, so it stays sharp on a phone.
  const side = 144;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  drawSprite(canvas, atlas, key);
  return canvas;
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function openBuildMenu(root: HTMLElement, entries: readonly BuildEntry[], onPick: (entry: BuildEntry) => void): () => void {
  const sheet = el('div', 'build-menu');
  const head = el('div', 'build-head');
  const close = el('button', 'build-close', 'Close');
  head.append(el('div', 'build-title', 'Build'), close);
  const body = el('div', 'build-body');
  sheet.append(head, body);
  root.append(sheet);
  const shut = (): void => sheet.remove();
  close.addEventListener('click', shut);

  void loadAtlas().then((atlas) => {
    const categories = [...new Set(entries.map((entry) => entry.category))];
    for (const category of categories) {
      body.append(el('div', 'build-category', category));
      const grid = el('div', 'build-grid');
      for (const entry of entries.filter((item) => item.category === category)) {
        const card = el('button', entry.locked ? 'build-card locked' : 'build-card');
        const text = el('div', 'build-text');
        text.append(el('div', 'build-name', entry.name));
        if (entry.locked) {
          text.append(el('div', 'build-soon', entry.locked));
        } else {
          // Every decoration is one cell, so its card leaves the size out.
          text.append(el('div', 'build-cost', entry.footprint ? `${entry.cost} · ${entry.footprint}` : entry.cost));
          text.append(el('div', 'build-upkeep', entry.upkeep));
        }
        text.append(el('div', 'build-effect', entry.effect));
        card.append(thumbnail(atlas, entry.key), text);
        if (!entry.locked) {
          card.addEventListener('click', () => {
            onPick(entry);
            shut();
          });
        }
        grid.append(card);
      }
      body.append(grid);
    }
  });
  return shut;
}
