import type { MeddleId, MeddleRow } from '../sim';

/**
 * The Meddle page (chaos C4, DESIGN.md 78): behind the student count, beside the Scorecard. Two lists, things to stir up
 * and the calm tools, each with what it is, its good and its bad, its cost and how long it rests after, and a button.
 * A tool resting, out of reach of the purse, or waiting for snow says why instead.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function side(mark: string, words: string, cost: boolean): HTMLElement {
  const row = el('div', cost ? 'policy-side cost' : 'policy-side');
  const text = el('div', 'policy-text');
  text.append(el('span', 'policy-words', words));
  row.append(el('span', 'policy-mark', mark), text);
  return row;
}

export function drawMeddlePage(body: HTMLElement, view: { rows: MeddleRow[]; seals: number; sandbox: boolean }, use: (id: MeddleId) => void): void {
  body.append(el('p', 'fine', view.sandbox ? 'Stir things up, or calm them down. In the sandbox every tool is free and never rests.' : `Stir things up, or calm them down. Each costs something and rests a while after. You have ${view.seals} Gold ${view.seals === 1 ? 'Seal' : 'Seals'}.`));
  for (const [which, title] of [['stir', 'Stir things up'], ['calm', 'Calm things down']] as const) {
    body.append(el('div', 'money-head', title));
    for (const row of view.rows) {
      if (row.side !== which) continue;
      const box = el('div', row.problem ? 'policy meddle resting' : 'policy meddle');
      const top = el('div', 'policy-top');
      const go = el('button', 'policy-switch', which === 'calm' ? 'Calm' : 'Go');
      go.type = 'button';
      go.disabled = row.problem !== null;
      go.addEventListener('click', () => use(row.id));
      top.append(el('span', 'policy-name', row.name), go);
      box.append(top, el('p', 'tradition-line', row.line), side('+', row.good, false), side('−', row.bad, true));
      const rests = row.rests === 'never' ? 'never rests' : `rests ${row.rests} after`;
      box.append(el('p', 'fine', `${row.cost} · ${rests}${row.used > 0 ? ` · used ${row.used} ${row.used === 1 ? 'time' : 'times'}` : ''}`));
      if (row.problem) box.append(el('p', 'tradition-line risk', row.problem));
      body.append(box);
    }
  }
}
