import { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function VendorLoginScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  function contactAdmin() {
    showAlert(t('vendor.login.contactAdminTitle'), t('vendor.login.contactAdminMsg'));
  }

  async function signIn() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).maybeSingle();
      if (profile?.role !== 'vendor') {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as a vendor.');
      }

      router.replace('/(vendor)/overview' as any);
    } catch (e: any) {
      showAlert(t('auth.signInFailedTitle'), e.message);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ maxWidth: 380, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 40 }}>
            <Ionicons name="restaurant" size={20} color={Brand.vendorAccent} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: Brand.textPrimary }}>
              {t('vendor.login.brand')}
            </Text>
          </View>

          <Text style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('vendor.login.heading')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 28 }}>
            {t('vendor.login.subtitle')}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('vendor.login.emailLabel')}
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
          }}>
            <Ionicons name="mail-outline" size={16} color="#9AA0AE" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('vendor.login.emailPlaceholder')}
              placeholderTextColor="#B0B4BF"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ flex: 1, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>
              {t('vendor.login.passwordLabel')}
            </Text>
            <Tap onPress={contactAdmin}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.vendorAccent }}>
                {t('vendor.login.forgotPassword')}
              </Text>
            </Tap>
          </View>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
          }}>
            <Ionicons name="lock-closed-outline" size={16} color="#9AA0AE" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#B0B4BF"
              secureTextEntry
              style={{ flex: 1, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>

          {/* Presentational only — sessions already persist via LargeSecureStore. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <Ionicons name="checkbox" size={18} color={Brand.vendorAccent} />
            <Text style={{ fontSize: 13, color: Brand.textSecondary }}>
              {t('vendor.login.rememberMe')}
            </Text>
          </View>

          <Tap
            onPress={signIn}
            disabled={loading}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: Brand.orange, borderRadius: 50, paddingVertical: 14,
              opacity: loading ? 0.7 : 1, marginBottom: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {loading ? t('vendor.login.signingIn') : t('vendor.login.signIn')}
            </Text>
            {!loading && <Ionicons name="arrow-forward" size={16} color="#fff" />}
          </Tap>

          <Tap onPress={contactAdmin} style={{ alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>
              {t('vendor.login.applyFooter')}
            </Text>
          </Tap>

          <Tap
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)'))}
            style={{ alignItems: 'center' }}
          >
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('vendor.login.back')}</Text>
          </Tap>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
