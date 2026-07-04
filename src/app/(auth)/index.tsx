import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    try {
      const redirectTo = ExpoLinking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        await supabase.auth.exchangeCodeForSession(result.url);
      }
    } catch (e: any) {
      showAlert('Sign in failed', e.message);
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
            Your smart dining companion.
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
            Welcome Back
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
            {/* Google G logo colours */}
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#4285F4' }}>G</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: Brand.textPrimary }}>
              {loading ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* Vendor link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16 }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 13 }}>For Vendor </Text>
            <TouchableOpacity onPress={() => showAlert('Coming soon', 'Vendor sign-up isn’t available yet.')}>
              <Text style={{ color: '#4A90D9', fontWeight: '600', fontSize: 13 }}>
                Click Here
              </Text>
            </TouchableOpacity>
          </View>

          {/* Dev-only bypass */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={{ color: '#CCC', fontSize: 12 }}>⚙ Skip login (dev only)</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
