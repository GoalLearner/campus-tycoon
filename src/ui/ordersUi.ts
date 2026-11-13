import { hasDaily, orderCounts, orderSlots, orderViews, rewardWords, type GameState, type OrderReward, type OrderView } from '../sim';
import type { StatChip } from './chips';

/**
 * Words for the orders board (DESIGN.md 42.3, as built in 42.16): the
 * button under the top bar and the page it opens. The Inbox is things to
 * decide. The board is things to do.
 */

export interface OrdersView {
  /** What the board says once about an order whose time ran out. '' with nothing to say. */
  note: string;
  rows: OrderView[];
  /** "A new order comes tomorrow." while the board has room, and '' when it is full. */
  next: string;
  /** "3 of 3 orders". */
  count: string;
}

/** The page. null on a game with no board. */
export function ordersView(state: GameState): OrdersView | null {
  if (!hasDaily(state)) return null;
  const rows = orderViews(state);
  const slots = orderSlots(state);
  return {
    note: state.orders.note,
    rows,
    next: rows.length < slots ? 'A new order comes tomorrow.' : '',
    count: `${rows.length} of ${slots} orders`,
  };
}

/** The Orders button: what is done and waiting first, then what is new, then how many are open. */
export function ordersChip(state: GameState): StatChip | null {
  const counts = orderCounts(state);
  if (!counts) return null;
  if (counts.done > 0) return { value: `${counts.done} done`, label: 'orders', tone: 'good' };
  if (counts.fresh > 0) return { value: `${counts.fresh} new`, label: 'orders', tone: 'urgent' };
  return { value: counts.open > 0 ? String(counts.open) : '', label: 'orders', tone: '' };
}

/** What a claimed order paid, for the burst and the toast: "150 experience". */
export function paidWords(rewards: readonly OrderReward[]): string {
  return `+${rewardWords(rewards)}`;
}
