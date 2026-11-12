import { registerPlugin } from '@capacitor/core';
import { NOTICES_DEFAULT, NOTICES_MOST, planNotices, type Notice } from '../sim';
import { isNative } from './platform';
import { store, wakeHourOf } from './store';

/**
 * Notifications on the iPhone (DESIGN.md 2.3 and 36.6).
 *
 * WRITTEN AND NOT RUN. Nothing here has been on a phone. It talks to
 * Capacitor's local-notifications plugin by name, through `registerPlugin`,
 * so this file needs no package the project does not already have. Until
 * `@capacitor/local-notifications` is installed and synced into the iOS
 * project (a step for the owner, DESIGN.md 36.8), every call below fails
 * quietly and the Menu says this build cannot send them.
 *
 * What it does, once the plugin is there:
 * - Nothing at launch. Permission is asked the first time the player turns
 *   notifications on in the Menu, and never before.
 * - When the app goes to the background, it plans the next few days from the
 *   save (`planNotices`) and hands those moments to the phone.
 * - When the app comes back, everything still pending is withdrawn: the
 *   player is looking at the campus, so nothing needs saying.
 *
 * In a browser tab none of this runs.
 */

interface Permission {
  display: string;
}

interface LocalNotifications {
  checkPermissions(): Promise<Permission>;
  requestPermissions(): Promise<Permission>;
  schedule(options: { notifications: Array<{ id: number; title: string; body: string; schedule: { at: Date } }> }): Promise<unknown>;
  getPending(): Promise<{ notifications: Array<{ id: number }> }>;
  cancel(options: { notifications: Array<{ id: number }> }): Promise<void>;
}

const plugin = registerPlugin<LocalNotifications>('LocalNotifications');

const KEY = 'campus.notices';
/** Our notices are numbered from here, so withdrawing them never touches anything else. */
const FIRST_ID = 9100;

export interface NoticeSetting {
  on: boolean;
  /** The most in a day, 1 to 3. */
  perDay: number;
}

let setting: NoticeSetting | null = null;

/** What the player has chosen. Off until they turn it on. Two a day when they do, unless they change it. */
export function noticeSetting(): NoticeSetting {
  if (setting) return setting;
  setting = { on: false, perDay: NOTICES_DEFAULT };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NoticeSetting> | null;
    if (stored && typeof stored === 'object') {
      setting.on = stored.on === true;
      if (typeof stored.perDay === 'number' && stored.perDay >= 1 && stored.perDay <= NOTICES_MOST) setting.perDay = Math.floor(stored.perDay);
    }
  } catch {
    // No storage: the choice lasts until the app closes.
  }
  return setting;
}

function keep(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(noticeSetting()));
  } catch {
    // Kept in memory only.
  }
}

/**
 * The player turns notifications on. The phone asks for permission here, the
 * first time, and never anywhere else. 'refused' when the phone says no, and
 * 'unavailable' when this build has no way to send any.
 */
export async function turnNoticesOn(): Promise<'on' | 'refused' | 'unavailable'> {
  if (!isNative) return 'unavailable';
  try {
    let permission = await plugin.checkPermissions();
    if (permission.display !== 'granted') permission = await plugin.requestPermissions();
    if (permission.display !== 'granted') return 'refused';
  } catch {
    return 'unavailable';
  }
  noticeSetting().on = true;
  keep();
  return 'on';
}

export function turnNoticesOff(): void {
  noticeSetting().on = false;
  keep();
  void withdraw();
}

export function setNoticesPerDay(perDay: number): void {
  noticeSetting().perDay = Math.max(1, Math.min(NOTICES_MOST, Math.floor(perDay)));
  keep();
}

/** Take back everything of ours the phone is still holding. */
async function withdraw(): Promise<void> {
  if (!isNative) return;
  try {
    const pending = await plugin.getPending();
    const ours = pending.notifications.filter((notice) => notice.id >= FIRST_ID && notice.id < FIRST_ID + 100);
    if (ours.length > 0) await plugin.cancel({ notifications: ours.map((notice) => ({ id: notice.id })) });
  } catch {
    // No plugin in this build, or nothing to withdraw.
  }
}

/** What would be handed to the phone if the app went to the background now. */
export function plannedNotices(): Notice[] {
  const chosen = noticeSetting();
  if (!chosen.on || !store.hasGame || store.visiting !== null) return [];
  const state = store.state;
  return planNotices(state, { perDay: chosen.perDay, wakeHour: wakeHourOf(state.clock.anchor), offsetMinutes: -new Date().getTimezoneOffset() });
}

async function hand(): Promise<void> {
  await withdraw();
  const notices = plannedNotices();
  if (notices.length === 0) return;
  try {
    await plugin.schedule({ notifications: notices.map((notice, n) => ({ id: FIRST_ID + n, title: notice.title, body: notice.body, schedule: { at: new Date(notice.at) } })) });
  } catch {
    // No plugin in this build.
  }
}

let started = false;

/** Plan when the app is put away, and withdraw when it comes back. Does nothing in a browser tab. */
export function startNotices(): void {
  if (started || !isNative) return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (noticeSetting().on) void hand();
    } else void withdraw();
  });
  void withdraw();
}
