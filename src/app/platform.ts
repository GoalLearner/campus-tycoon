import { Capacitor } from '@capacitor/core';

/** True inside the iOS app, false in any browser. */
export const isNative = Capacitor.isNativePlatform();

/** True when the time-skip panel exists in this build: every dev build, and tester builds of the app. */
export const hasTimeSkip = import.meta.env.DEV || __TESTER_TOOLS__;
