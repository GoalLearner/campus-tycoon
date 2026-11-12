import { isNative } from './platform';

/**
 * A one-time tip to add the game to the Home Screen. Safari keeps the saves of
 * a Home Screen game, and may clear those of a site left unopened for a week
 * (DESIGN.md 17.5). It is shown once, on a return visit, in a browser tab on
 * an iPhone or iPad: never in the iOS app, and never when the game is already
 * running from the Home Screen.
 */

const KEY = 'campus-tycoon.homeScreenTip';

export const HOME_SCREEN_TIP = 'Add Campus Tycoon to your Home Screen. Safari keeps the saves of Home Screen games, and may clear others it has not seen for a week.';

export interface TipFacts {
  native: boolean;
  /** Running from the Home Screen already. */
  standalone: boolean;
  /** An iPhone or iPad, where there is a Home Screen and Safari's rule applies. */
  appleTouch: boolean;
  shown: boolean;
}

/** Whether the tip is due, from plain facts. */
export function homeScreenTipDue(facts: TipFacts): boolean {
  return !facts.native && !facts.standalone && facts.appleTouch && !facts.shown;
}

function read(): TipFacts {
  let shown = false;
  try {
    shown = localStorage.getItem(KEY) === 'yes';
  } catch {
    // Storage is blocked. Say nothing rather than say it on every visit.
    shown = true;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  // An iPad says it is a Mac, but a Mac has no touch screen.
  const appleTouch = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return { native: isNative, standalone, appleTouch, shown };
}

export function shouldShowHomeScreenTip(): boolean {
  return homeScreenTipDue(read());
}

export function markHomeScreenTipShown(): void {
  try {
    localStorage.setItem(KEY, 'yes');
  } catch {
    // Nothing to remember it in.
  }
}
