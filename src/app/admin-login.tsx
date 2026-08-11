import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function AdminLoginScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).maybeSingle();
      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as an admin.');
      }

      router.replace('/(admin)/applications' as any);
    } catch (e: any) {
      showAlert(t('auth.signInFailedTitle'), e.message);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 40 }}>
        <View style={{ maxWidth: 380, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 40 }}>
            <Ionicons name="shield-checkmark" size={20} color={Brand.adminAccent} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: Brand.textPrimary }}>
              {t('admin.login.brand')}
            </Text>
          </View>

          <Text style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('admin.login.heading')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 28 }}>
            {t('admin.login.subtitle')}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('admin.login.emailLabel')}
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
              placeholder={t('admin.login.emailPlaceholder')}
              placeholderTextColor="#B0B4BF"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ flex: 1, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('admin.login.passwordLabel')}
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 24,
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

          <TouchableOpacity
            onPress={signIn}
            disabled={loading}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: Brand.adminAccent, borderRadius: 50, paddingVertical: 14,
              opacity: loading ? 0.7 : 1, marginBottom: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {loading ? t('admin.login.signingIn') : t('admin.login.signIn')}
            </Text>
            {!loading && <Ionicons name="arrow-forward" size={16} color="#fff" />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center' }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
