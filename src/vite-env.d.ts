/// <reference types="vite/client" />

/** The version in package.json. */
declare const __APP_VERSION__: string;
/** The short commit id the build was made from. */
declare const __BUILD_LABEL__: string;
/** True for the files that ship inside the iOS app. */
declare const __NATIVE_BUILD__: boolean;
/** True when the tester time-skip panel is compiled in. */
declare const __TESTER_TOOLS__: boolean;
