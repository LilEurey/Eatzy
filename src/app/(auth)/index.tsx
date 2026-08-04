import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

WebBrowser.maybeCompleteAuthSession();

// Exact paths from the Figma export — the real 4-color Google "G", not an
// icon-font approximation.
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M18.8 10.2083C18.8 9.55833 18.7417 8.93333 18.6333 8.33333H10V11.8833H14.9333C14.7167 13.025 14.0667 13.9917 13.0917 14.6417V16.95H16.0667C17.8 15.35 18.8 13 18.8 10.2083V10.2083" fill="#4285F4" />
      <Path d="M10 19.1667C12.475 19.1667 14.55 18.35 16.0667 16.95L13.0917 14.6417C12.275 15.1917 11.2333 15.525 10 15.525C7.61667 15.525 5.59167 13.9167 4.86667 11.75H1.81667V14.1167C3.325 17.1083 6.41667 19.1667 10 19.1667V19.1667" fill="#34A853" />
      <Path d="M4.86667 11.7417C4.68333 11.1917 4.575 10.6083 4.575 10C4.575 9.39167 4.68333 8.80833 4.86667 8.25833V5.89167H1.81667C1.19167 7.125 0.833333 8.51667 0.833333 10C0.833333 11.4833 1.19167 12.875 1.81667 14.1083L4.19167 12.2583L4.86667 11.7417V11.7417" fill="#FBBC05" />
      <Path d="M10 4.48333C11.35 4.48333 12.55 4.95 13.5083 5.85L16.1333 3.225C14.5417 1.74167 12.475 0.833333 10 0.833333C6.41667 0.833333 3.325 2.89167 1.81667 5.89167L4.86667 8.25833C5.59167 6.09167 7.61667 4.48333 10 4.48333V4.48333" fill="#EA4335" />
    </Svg>
  );
}

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

export default function LoginScreen() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    try {
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
      showAlert(t('auth.signInFailedTitle'), e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF8F6' }}>
      {/* Background Decoration — orange, top-left */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '2.59%', left: '3.33%', right: '27.69%', bottom: '71.04%',
          borderRadius: 9999,
          backgroundColor: 'rgba(255,107,0,0.2)',
        }}
      />
      {/* Overlay+Blur — blue, bottom-right */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '62.22%', right: 0, bottom: 0, left: '15.64%',
          borderRadius: 9999,
          backgroundColor: 'rgba(156,202,255,0.3)',
        }}
      />

      <SafeAreaView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <View style={{ maxWidth: 448, width: '100%', alignSelf: 'center', gap: 24 }}>
          {/* Header / Logo Area */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center' }}>
              <Text style={{ color: '#020202' }}>Eat</Text>
              <Text style={{ color: '#e76106' }}>zy</Text>
            </Text>
            <Text style={{ color: '#5a4136', fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
              {t('auth.tagline')}
            </Text>
          </View>

          {/* Illustration Area */}
          <View
            style={{
              aspectRatio: 2,
              width: '100%',
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: 'rgba(226,191,176,0.3)',
              borderRadius: 24,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.04,
              shadowRadius: 30,
              elevation: 2,
            }}
          >
            <Image
              source={require('../../../assets/images/auth-illustration.png')}
              resizeMode="cover"
              style={{ width: '100%', height: '100%', opacity: 0.8 }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', '#fff']}
              style={{ position: 'absolute', top: 16, left: 0, right: 0, bottom: 0 }}
            />
          </View>

          {/* Login Card */}
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.5)',
              borderRadius: 24,
              paddingTop: 24,
              paddingHorizontal: 25,
              paddingBottom: 25,
              gap: 24,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.08,
              shadowRadius: 30,
              elevation: 4,
            }}
          >
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', textAlign: 'center' }}>
              {t('auth.welcomeBack')}
            </Text>

            {/* Google button */}
            <TouchableOpacity
              onPress={signInWithGoogle}
              disabled={loading}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                height: 46,
                borderWidth: 1,
                borderColor: 'rgba(226,191,176,0.5)',
                borderRadius: 16,
                gap: 10,
                backgroundColor: '#fff',
                opacity: loading ? 0.6 : 1,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 1,
              }}
            >
              <GoogleIcon size={20} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }}>
                {loading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
              </Text>
            </TouchableOpacity>

            {/* Vendor link */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              <Text style={{ color: '#5a4136', fontSize: 16 }}>{t('auth.forVendor')}</Text>
              <TouchableOpacity onPress={() => router.push('/vendor-login' as any)}>
                <Text style={{ color: '#4648d4', fontWeight: '600', fontSize: 14 }}>
                  {t('auth.clickHere')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Dev-only bypass */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={{ alignItems: 'center' }}
            >
              <Text style={{ color: '#CCC', fontSize: 12 }}>{t('auth.skipLoginDev')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
