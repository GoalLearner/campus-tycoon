/**
 * A one-time tip, the first time the map is open after the Turn button went
 * (DESIGN.md section 43): two fingers turn the map now. Its flag is a setting
 * of this phone, kept beside the others, and never in the save.
 */

const KEY = 'campus-tycoon.twistTip';

export const TWIST_TIP = 'Twist two fingers to turn the map.';

/** Whether the tip is still to be shown. When storage is blocked it is never shown, rather than on every visit. */
export function twistTipDue(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'yes';
  } catch {
    return false;
  }
}

export function markTwistTipShown(): void {
  try {
    localStorage.setItem(KEY, 'yes');
  } catch {
    // Nothing to remember it in.
  }
}
