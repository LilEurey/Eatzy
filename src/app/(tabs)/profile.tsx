import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';

const DEV_ROUTES: { label: string; route: string }[] = [
  { label: '🔐 Login screen', route: '/(auth)' },
  { label: '🥗 Onboarding / Preferences', route: '/(auth)/onboarding' },
  { label: '🏠 Home', route: '/(tabs)' },
  { label: '📋 Orders tab', route: '/(tabs)/orders' },
  { label: '💰 Wallet tab', route: '/(tabs)/wallet' },
  { label: '🛒 Cart', route: '/cart' },
  { label: '🏪 Store detail (sample)', route: '/store/v001' },
  { label: '🍛 Food item detail (sample)', route: '/item/m001' },
  { label: '📍 Track order (sample)', route: '/track/o001' },
  { label: '⭐ Rate order (sample)', route: '/rate/o003' },
];

export default function ProfileScreen() {
  const [name, setName] = useState('Student');
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return; // dev skip-login: keep defaults
      setEmail(user.email ?? '');
      setName(
        (user.user_metadata?.full_name as string) ??
        user.email?.split('@')[0] ??
        'Student',
      );
    });
  }, []);

  const comingSoon = () => showAlert('Coming soon', 'This feature isn’t available yet.');

  const SETTINGS: { icon: string; label: string; onPress: () => void }[] = [
    { icon: '🥗', label: 'Dietary preferences', onPress: () => router.push('/(auth)/onboarding') },
    { icon: '💰', label: 'Campus Wallet', onPress: () => router.push('/(tabs)/wallet') },
    { icon: '🔔', label: 'Notifications', onPress: comingSoon },
    { icon: '🌐', label: 'Language', onPress: comingSoon },
    { icon: '💬', label: 'Help & support', onPress: comingSoon },
  ];

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5, marginBottom: 20 }}>
          Profile
        </Text>

        {/* Avatar card */}
        {/* ponytail: initials avatar — wire photo upload to Supabase Storage when accounts are live */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 16,
          backgroundColor: Brand.card, borderRadius: 20, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: Brand.orange, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff' }}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary }}>{name}</Text>
            <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 2 }}>
              {email || 'KMUTT student'}
            </Text>
          </View>
        </View>

        {/* Settings */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          SETTINGS
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, overflow: 'hidden', marginBottom: 28,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {SETTINGS.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              onPress={row.onPress}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                padding: 16,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Brand.border,
              }}
            >
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 17 }}>{row.icon}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Brand.textPrimary }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 18, color: Brand.textSecondary }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {__DEV__ && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
              color: Brand.textSecondary, marginBottom: 12,
            }}>
              DEV — NAVIGATE TO PAGE
            </Text>
            <View style={{ gap: 8 }}>
              {DEV_ROUTES.map(({ label, route }) => (
                <TouchableOpacity
                  key={route}
                  onPress={() => router.push(route as any)}
                  style={{
                    backgroundColor: Brand.card, borderRadius: 12,
                    paddingHorizontal: 16, paddingVertical: 12,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
                  }}
                >
                  <Text style={{ color: Brand.textPrimary, fontSize: 14, fontWeight: '500' }}>
                    {label}
                  </Text>
                  <Text style={{ color: Brand.textSecondary, fontSize: 11, marginTop: 2 }}>
                    {route}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          onPress={signOut}
          style={{
            borderWidth: 1.5, borderColor: Brand.orange,
            borderRadius: 50, paddingVertical: 14, alignItems: 'center',
          }}
        >
          <Text style={{ color: Brand.orange, fontWeight: '600', fontSize: 15 }}>
            → Logout
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
