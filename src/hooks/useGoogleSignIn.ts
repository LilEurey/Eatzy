import { useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { showAlert, errorMessage } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

WebBrowser.maybeCompleteAuthSession();

// PKCE puts the auth code and any error in the ?query string, but check the
// #fragment too in case a provider/platform combination ever redirects there.
function extractAuthParams(url: string): Record<string, string> {
  const params = new URLSearchParams();
  const [beforeHash, hash] = url.split('#');
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex !== -1) {
    new URLSearchParams(beforeHash.slice(queryIndex + 1)).forEach((v, k) => params.set(k, v));
  }
  if (hash) {
    new URLSearchParams(hash).forEach((v, k) => params.set(k, v));
  }
  return Object.fromEntries(params.entries());
}

export function useGoogleSignIn() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const redirectTo = ExpoLinking.createURL('/');
        // Full-page redirect — no popup involved, so there's nothing for a
        // popup blocker to kill. The page navigates away here; when Google
        // sends it back with ?code=..., detectSessionInUrl (supabase.ts)
        // completes the PKCE exchange automatically on reload.
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) throw error;
        return;
      }

      // Always the app scheme, even in Expo Go: Supabase rejects exp://<LAN IP>
      // redirects, and ASWebAuthenticationSession catches eatzy:// itself
      // without the host app registering it.
      // ponytail: Android Expo Go can't catch eatzy:// — use a dev build there.
      const redirectTo = 'eatzy://';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      // Android: the Custom Tab can report 'dismiss' before the eatzy://?code=
      // deep link is delivered, so catch the link ourselves and use whichever
      // arrives. iOS's auth session always returns 'success' with the URL.
      let linkedUrl: string | null = null;
      const sub = ExpoLinking.addEventListener('url', ({ url }) => {
        if (url.startsWith(redirectTo)) linkedUrl = url;
      });
      let callbackUrl: string | null = null;
      try {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') callbackUrl = result.url;
        else if (Platform.OS === 'android') {
          // Slow phones can deliver the link well after 'dismiss'; poll up to 5s.
          for (let i = 0; i < 25 && !linkedUrl; i++) {
            await new Promise((r) => setTimeout(r, 200));
          }
          callbackUrl = linkedUrl;
        }
      } finally {
        sub.remove();
      }
      if (!callbackUrl) throw new Error('Browser flow cancelled');

      const params = extractAuthParams(callbackUrl);
      if (params.error) throw new Error(params.error_description || params.error);
      if (!params.code) throw new Error('No authorization code returned');

      // PKCE: exchange the single-use code for a session using the code
      // verifier signInWithOAuth stashed locally — never transmitted over
      // the redirect URL, so an intercepted callback alone is useless.
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (exchangeError) throw exchangeError;
    } catch (e) {
      showAlert(t('auth.signInFailedTitle'), errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return { signIn, loading };
}
