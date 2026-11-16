import { dayCurve, nextLines, nowLine, type DayFacts } from '../app/campusDay';
import { clockText } from '../app/clockText';
import { clockHour, shownHour, viewAt, viewedHour } from '../app/daylight';

/**
 * "Today on campus" (DESIGN.md 75.3, 75.4), opened by tapping the clock on the HUD: the day's curve of how busy the
 * paths are, what is happening now, what comes next, and a "View at" slider that shows the campus at another hour.
 * The slider changes the light and the crowd only, never the simulation or income, and closing the strip puts the
 * player's own clock back.
 */

const SVG = 'http://www.w3.org/2000/svg';
/** The curve's drawing box: one unit for each five minutes of the day. */
const WIDTH = 288;
const HEIGHT = 40;
/** The slider moves in five-minute steps. */
const STEP_MINUTES = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export interface TodayStrip {
  node: HTMLElement;
  isOpen(): boolean;
  toggle(): void;
  close(): void;
  /** Once a second from the HUD, and at once when the slider moves. */
  render(facts: DayFacts): void;
}

/** The strip. `changed` is called when the hour shown changes, so the HUD's clock follows at once. */
export function makeTodayStrip(changed: () => void): TodayStrip {
  const node = el('section', 'today-strip');
  node.setAttribute('aria-label', 'Today on campus');
  const head = el('div', 'today-head');
  const title = el('span', 'today-title', 'Today on campus');
  const close = el('button', 'today-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  head.append(title, close);

  const curve = svg('svg', { class: 'today-curve', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const area = svg('path', { class: 'today-area', d: '' });
  const real = svg('line', { class: 'today-real', x1: 0, x2: 0, y1: 0, y2: HEIGHT });
  const marker = svg('line', { class: 'today-marker', x1: 0, x2: 0, y1: 0, y2: HEIGHT });
  curve.append(area, real, marker);
  const hours = el('div', 'today-hours');
  for (const at of [0, 6, 12, 18]) {
    const mark = el('span', '', clockText(at, true));
    mark.style.left = `${(at / 24) * 100}%`;
    hours.append(mark);
  }

  const now = el('div', 'today-now');
  const next = el('div', 'today-next');

  const view = el('div', 'today-view');
  const label = el('label', 'today-view-label', 'View at');
  const slider = el('input', 'today-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(24 * 60 - STEP_MINUTES);
  slider.step = String(STEP_MINUTES);
  slider.id = 'today-slider';
  label.htmlFor = slider.id;
  const back = el('button', 'today-back', 'Now');
  back.type = 'button';
  view.append(label, slider, back);

  node.append(head, curve, hours, now, next, view);

  let open = false;
  let drawn = '';

  const place = (line: SVGLineElement, hour: number): void => {
    const x = ((hour % 24) / 24) * WIDTH;
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
  };

  const strip: TodayStrip = {
    node,
    isOpen: () => open,
    toggle: () => {
      if (open) strip.close();
      else {
        open = true;
        node.classList.add('open');
        slider.value = String(Math.round((clockHour() * 60) / STEP_MINUTES) * STEP_MINUTES % (24 * 60));
        changed();
      }
    },
    close: () => {
      if (!open) return;
      open = false;
      node.classList.remove('open');
      viewAt(null);
      changed();
    },
    render: (facts) => {
      if (!open) return;
      // The curve is redrawn only when the kind of day changes.
      const key = JSON.stringify(facts);
      if (key !== drawn) {
        drawn = key;
        const points = dayCurve(facts, STEP_MINUTES);
        const top = HEIGHT - 2;
        let d = `M0 ${HEIGHT}`;
        points.forEach((level, i) => {
          d += ` L${(i * (WIDTH / points.length)).toFixed(1)} ${(HEIGHT - level * top).toFixed(1)}`;
        });
        d += ` L${WIDTH} ${(HEIGHT - points[0]! * top).toFixed(1)} L${WIDTH} ${HEIGHT} Z`;
        area.setAttribute('d', d);
      }
      const hour = shownHour();
      const viewing = viewedHour() !== null;
      place(marker, hour);
      place(real, clockHour());
      real.classList.toggle('show', viewing);
      back.classList.toggle('show', viewing);
      node.classList.toggle('viewing', viewing);
      setText(now, nowLine(hour, facts));
      setText(next, nextLines(hour, facts).join(' · '));
      if (!viewing && document.activeElement !== slider) slider.value = String(Math.round((clockHour() * 60) / STEP_MINUTES) * STEP_MINUTES % (24 * 60));
      slider.setAttribute('aria-valuetext', clockText(hour));
    },
  };

  slider.addEventListener('input', () => {
    viewAt(Number(slider.value) / 60);
    changed();
  });
  back.addEventListener('click', () => {
    viewAt(null);
    changed();
  });
  close.addEventListener('click', () => strip.close());
  return strip;
}
