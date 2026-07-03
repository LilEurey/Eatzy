import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';

const DEV_ROUTES: { label: string; route: string }[] = [
  { label: '🔐 Login screen', route: '/(auth)' },
  { label: '🥗 Onboarding / Preferences', route: '/(auth)/onboarding' },
  { label: '🏠 Home', route: '/(tabs)' },
  { label: '📋 Orders tab', route: '/(tabs)/orders' },
  { label: '💰 Wallet tab', route: '/(tabs)/wallet' },
  { label: '🛒 Cart', route: '/cart' },
  { label: '🏪 Store detail (sample)', route: '/store/v001' },
  { label: '🍛 Food item detail (sample)', route: '/item/m001' },
];

export default function ProfileScreen() {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: Brand.textPrimary, marginBottom: 24 }}>
          Profile
        </Text>

        {__DEV__ && (
          <View style={{ marginBottom: 32 }}>
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
