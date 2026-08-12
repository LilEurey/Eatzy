import { useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { setVendorIntent, clearVendorIntent } from '@/lib/vendor-intent';

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

  async function signIn(vendorIntent = false) {
    setLoading(true);
    try {
      if (vendorIntent) await setVendorIntent();

      const redirectTo = ExpoLinking.createURL('/');

      if (Platform.OS === 'web') {
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

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') throw new Error('Browser flow cancelled');

      const params = extractAuthParams(result.url);
      if (params.error) throw new Error(params.error_description || params.error);
      if (!params.code) throw new Error('No authorization code returned');

      // PKCE: exchange the single-use code for a session using the code
      // verifier signInWithOAuth stashed locally — never transmitted over
      // the redirect URL, so an intercepted callback alone is useless.
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (exchangeError) throw exchangeError;
    } catch (e: any) {
      if (vendorIntent) await clearVendorIntent();
      showAlert(t('auth.signInFailedTitle'), e.message);
    } finally {
      setLoading(false);
    }
  }

  return { signIn, loading };
}
