import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/platform', () => ({ isNative: false, hasTimeSkip: false }));

import { alwaysDaylight, currentDaylight, daylightAt, forceHour, periodAt, setAlwaysDaylight, shownHour } from '../src/app/daylight';
import { HOME_SCREEN_TIP, homeScreenTipDue } from '../src/app/homeScreenTip';

describe('the time of day', () => {
  it('has four periods that follow the clock', () => {
    expect(periodAt(7)).toBe('morning');
    expect(periodAt(13)).toBe('afternoon');
    expect(periodAt(19)).toBe('evening');
    expect(periodAt(23)).toBe('night');
    expect(periodAt(3)).toBe('night');
    expect(periodAt(5)).toBe('morning');
    expect(periodAt(21)).toBe('night');
  });

  it('is plain daylight at midday and darkest at night', () => {
    expect(daylightAt(13).strength).toBe(0);
    expect(daylightAt(13).lamps).toBe(0);
    expect(daylightAt(23).strength).toBeGreaterThan(0.5);
    expect(daylightAt(2).strength).toBe(daylightAt(23).strength);
    expect(daylightAt(18).strength).toBeGreaterThan(0);
    expect(daylightAt(18).strength).toBeLessThan(daylightAt(23).strength);
    // Night never goes black: the campus stays readable.
    for (let hour = 0; hour < 24; hour += 0.25) expect(daylightAt(hour).strength).toBeLessThanOrEqual(0.65);
  });

  it('changes smoothly, with no jump from one minute to the next', () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const a = daylightAt(minute / 60);
      const b = daylightAt((minute + 1) / 60);
      expect(Math.abs(a.strength - b.strength)).toBeLessThan(0.01);
      expect(Math.abs(a.lamps - b.lamps)).toBeLessThan(0.02);
      for (const shift of [16, 8, 0]) expect(Math.abs(((a.colour >> shift) & 0xff) - ((b.colour >> shift) & 0xff))).toBeLessThanOrEqual(3);
    }
    // Midnight joins up with itself.
    expect(daylightAt(24)).toEqual(daylightAt(0));
  });

  it('lights the street lamps through the evening and the night, and puts them out after dawn', () => {
    expect(daylightAt(17).lamps).toBe(0);
    expect(daylightAt(18).lamps).toBeCloseTo(0.5, 5);
    expect(daylightAt(19).lamps).toBe(1);
    expect(daylightAt(0).lamps).toBe(1);
    expect(daylightAt(5.9).lamps).toBe(1);
    expect(daylightAt(7).lamps).toBe(0);
  });

  it('reads the player\'s own clock, unless they asked for daylight at any hour', () => {
    const lateEvening = new Date(2026, 10, 11, 22, 30, 0);
    expect(shownHour(lateEvening)).toBe(22.5);
    expect(currentDaylight(lateEvening).period).toBe('night');

    expect(alwaysDaylight()).toBe(false);
    setAlwaysDaylight(true);
    expect(shownHour(lateEvening)).toBe(12);
    expect(currentDaylight(lateEvening).strength).toBe(0);
    expect(currentDaylight(lateEvening).period).toBe('afternoon');
    setAlwaysDaylight(false);
    expect(currentDaylight(lateEvening).period).toBe('night');

    // A screenshot can ask for any hour.
    forceHour(6);
    expect(currentDaylight(lateEvening).period).toBe('morning');
    forceHour(null);
  });
});

describe('the Home Screen tip', () => {
  const tab = { native: false, standalone: false, appleTouch: true, shown: false };

  it('shows once, in a browser tab on an iPhone or iPad', () => {
    expect(homeScreenTipDue(tab)).toBe(true);
    expect(homeScreenTipDue({ ...tab, shown: true })).toBe(false);
  });

  it('never shows in the iOS app, from the Home Screen, or where there is no Home Screen', () => {
    expect(homeScreenTipDue({ ...tab, native: true })).toBe(false);
    expect(homeScreenTipDue({ ...tab, standalone: true })).toBe(false);
    expect(homeScreenTipDue({ ...tab, appleTouch: false })).toBe(false);
  });

  it('is one short line', () => {
    expect(HOME_SCREEN_TIP.length).toBeLessThan(160);
    expect(HOME_SCREEN_TIP).toMatch(/Home Screen/);
  });
});
