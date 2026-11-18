import { giftReady, hasDaily, momentsDone, orderViews, rewardName, rewardsWaiting, workshopView, type GameState } from '../sim';

/**
 * The Next pill (DESIGN.md 85.7): one pill under the top bar with the one best thing to do now; a tap goes there. It
 * picks, in this order: an order done and waiting to be claimed (a Big day too); today's gift; an order that can be
 * finished in this sitting; a new order not looked at yet; a building earned and waiting in the Build menu; the
 * Workshop, when a bench stands idle; what the Workshop is making and about when; and otherwise following the Main
 * Character. Never a countdown that presses.
 */
export type NextGo = 'orders' | 'gift' | 'build' | 'workshop' | 'main';

export interface NextThing {
  text: string;
  go: NextGo;
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** About when a bench is done, in words that do not count down: "later today", "tomorrow". */
function readyWords(ticks: number): string {
  if (ticks <= 4 * 60) return 'Ready soon';
  if (ticks <= 14 * 60) return 'Ready later today';
  return 'Ready tomorrow';
}

/** The one best thing to do now, or null on a game without the board. */
export function nextThing(state: GameState): NextThing | null {
  if (!hasDaily(state)) return null;
  const views = orderViews(state);
  const done = views.filter((view) => view.done).length + momentsDone(state);
  if (done > 0) return { text: done === 1 ? 'An order is done: claim it' : `${done} orders are done: claim them`, go: 'orders' };
  if (giftReady(state)) return { text: "Today's gift is waiting", go: 'gift' };
  const now = views.find((view) => !view.done && !view.fresh && view.sitting);
  if (now) return { text: `Next: ${now.title}`, go: 'orders' };
  const fresh = views.filter((view) => view.fresh).length;
  if (fresh > 0) return { text: fresh === 1 ? 'A new order is on the board' : `${fresh} new orders are on the board`, go: 'orders' };
  const waiting = rewardsWaiting(state)[0];
  if (waiting) return { text: `${capital(rewardName(waiting))} is waiting in the Build menu`, go: 'build' };
  const shop = workshopView(state);
  const open = shop && shop.makerspace && shop.recipes.some((recipe) => !recipe.locked);
  if (shop && open) {
    if (shop.benches.some((bench) => bench.making === '' && !bench.ready)) return { text: 'Start something for tomorrow at the Workshop', go: 'workshop' };
    const soonest = shop.benches.filter((bench) => bench.making !== '' && !bench.ready).sort((a, b) => a.ticksLeft - b.ticksLeft)[0];
    if (soonest) return { text: `${readyWords(soonest.ticksLeft)}: ${soonest.making.toLowerCase()}`, go: 'workshop' };
  }
  const main = state.story?.mc;
  if (main) return { text: `Follow ${main.name.split(' ')[0]}`, go: 'main' };
  return null;
}
