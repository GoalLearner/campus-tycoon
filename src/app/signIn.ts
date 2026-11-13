import { Capacitor } from '@capacitor/core';
import type { AppleCredential, SignInProvider } from './cloud';

/**
 * Ways to sign in (DESIGN.md 48), each behind the small `SignInProvider`
 * interface the cloud sync asks for.
 */

/** The app's bundle ID (capacitor.config.json): who Apple's tokens are for. */
const BUNDLE_ID = 'com.goallearner.campustycoon';

interface ApplePlugin {
  authorize(options: { clientId: string; redirectURI: string; scopes?: string; state?: string; nonce?: string }): Promise<{ response?: { identityToken?: string; authorizationCode?: string } }>;
}

/**
 * Sign in with Apple on the iPhone. FOR THE OWNER TO SWITCH ON, and not yet run: it needs a Sign in with Apple
 * plugin added to the app (`@capacitor-community/apple-sign-in`, which registers itself as `SignInWithApple`), the
 * capability on the App ID, and a new provisioning profile. Until then the plugin is not there and this returns
 * null. No name or email is asked for: only Apple's user ID is used.
 */
export const appleSignIn: SignInProvider = {
  async signIn(): Promise<AppleCredential | null> {
    const plugin = (Capacitor as unknown as { Plugins?: Record<string, ApplePlugin | undefined> }).Plugins?.SignInWithApple;
    if (!plugin) return null;
    const nonce = crypto.randomUUID();
    try {
      const result = await plugin.authorize({ clientId: BUNDLE_ID, redirectURI: '', scopes: '', nonce });
      const identityToken = result.response?.identityToken;
      if (!identityToken) return null;
      const code = result.response?.authorizationCode;
      return code ? { identityToken, authorizationCode: code, nonce } : { identityToken, nonce };
    } catch {
      // The player closed the sheet.
      return null;
    }
  },
};

/**
 * The dev server's stand-in for Apple: `node server/dev.mjs` runs a fake Apple beside the local server, which signs
 * test tokens with a key made when it starts. `&fakeApple=<address>` on the dev page points here. Never in a build.
 */
export function devSignIn(address: string | null, sub: string): SignInProvider {
  return {
    async signIn(): Promise<AppleCredential | null> {
      if (!address) return null;
      try {
        const reply = (await (await fetch(`${address}/token?sub=${encodeURIComponent(sub)}`)).json()) as { identityToken?: string };
        return reply.identityToken ? { identityToken: reply.identityToken } : null;
      } catch {
        return null;
      }
    },
  };
}
