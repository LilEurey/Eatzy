import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
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
    <View style={{ flex: 1, backgroundColor: Brand.bg }}>
      {/* Orange glow blob — top */}
      <View
        style={{
          position: 'absolute',
          top: -100,
          left: '50%',
          marginLeft: -160,
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: '#F9C49A',
          opacity: 0.55,
        }}
      />
      {/* Blue glow blob — bottom */}
      <View
        style={{
          position: 'absolute',
          bottom: -80,
          left: '50%',
          marginLeft: -140,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: '#B8CEED',
          opacity: 0.45,
        }}
      />

      <SafeAreaView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
        {/* Logo + tagline */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 38, fontWeight: '800', letterSpacing: -0.5 }}>
            <Text style={{ color: Brand.textPrimary }}>Eat</Text>
            <Text style={{ color: Brand.orange }}>zy</Text>
          </Text>
          <Text style={{ color: Brand.textSecondary, fontSize: 14, marginTop: 4 }}>
            {t('auth.tagline')}
          </Text>
        </View>

        {/* Dining image card */}
        <View
          style={{
            backgroundColor: Brand.card,
            borderRadius: 20,
            overflow: 'hidden',
            height: 180,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          {/* Orange side strips + centre placeholder for dining illustration */}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 10, backgroundColor: Brand.orange, opacity: 0.7 }} />
            <View style={{ flex: 1, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 48 }}>🍽️</Text>
              <Text style={{ color: Brand.textSecondary, fontSize: 12, marginTop: 6 }}>
                KMUTT Dining Hall
              </Text>
            </View>
            <View style={{ width: 10, backgroundColor: Brand.orange, opacity: 0.7 }} />
          </View>
          {/* Bottom fade overlay */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 10,
              right: 10,
              height: 48,
              backgroundColor: Brand.card,
              opacity: 0.6,
            }}
          />
        </View>

        {/* Welcome card */}
        <View
          style={{
            backgroundColor: Brand.card,
            borderRadius: 20,
            padding: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: Brand.textPrimary,
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
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
              borderWidth: 1.5,
              borderColor: '#E0D8D0',
              borderRadius: 50,
              paddingVertical: 13,
              gap: 10,
              backgroundColor: Brand.card,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AntDesign name="google" size={18} color="#4285F4" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: Brand.textPrimary }}>
              {loading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
            </Text>
          </TouchableOpacity>

          {/* Vendor link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16 }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 13 }}>{t('auth.forVendor')}</Text>
            <TouchableOpacity onPress={() => router.push('/vendor-login' as any)}>
              <Text style={{ color: '#4A90D9', fontWeight: '600', fontSize: 13 }}>
                {t('auth.clickHere')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Dev-only bypass */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={{ color: '#CCC', fontSize: 12 }}>{t('auth.skipLoginDev')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
