/**
 * The Build menu: hand-placed buildings by category. Each card shows the
 * building's own sprite from the art atlas, its cost, the cells it covers, its
 * upkeep and one line on what it does.
 *
 * For now it is opened only by the dev look-preview, with example numbers, so
 * the owner can approve how it looks. It will be opened by a Build button once
 * the buildings exist.
 */

export interface BuildEntry {
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

interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}

async function loadAtlas(): Promise<{ sheet: HTMLImageElement; frames: Record<string, Frame> } | null> {
  try {
    const manifest = (await (await fetch('./assets/manifest.json')).json()) as { atlas: { image: string; data: string } };
    const frames = ((await (await fetch(`./assets/${manifest.atlas.data}`)).json()) as { frames: Record<string, Frame> }).frames;
    const sheet = new Image();
    sheet.src = `./assets/${manifest.atlas.image}`;
    await sheet.decode();
    return { sheet, frames };
  } catch {
    return null;
  }
}

function thumbnail(atlas: { sheet: HTMLImageElement; frames: Record<string, Frame> } | null, key: string): HTMLCanvasElement {
  // Drawn at twice the shown size, so it stays sharp on a phone.
  const side = 144;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const rect = atlas?.frames[key]?.frame;
  if (atlas && rect) {
    const scale = Math.min(side / rect.w, side / rect.h);
    const w = rect.w * scale;
    const h = rect.h * scale;
    canvas.getContext('2d')?.drawImage(atlas.sheet, rect.x, rect.y, rect.w, rect.h, (side - w) / 2, side - h, w, h);
  }
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
          text.append(el('div', 'build-cost', `${entry.cost} · ${entry.footprint}`));
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
