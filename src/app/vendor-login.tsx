import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

export default function VendorLoginScreen() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const showHero = width >= 760;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // ponytail: real Supabase email/password auth + users.role === 'vendor' check.
  // The mock flow signs any input straight in as MOCK_VENDOR_SESSION's vendor.
  function signIn() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.replace('/(vendor)/overview' as any);
    }, 400);
  }

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Form panel */}
        <View style={{ flex: showHero ? 1 : undefined, width: showHero ? undefined : '100%', backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{ maxWidth: 380, width: '100%', alignSelf: showHero ? 'flex-end' : 'center' }}>
            {/* Brand */}
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

            {/* Email */}
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

            {/* Password */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>
                {t('vendor.login.passwordLabel')}
              </Text>
              <TouchableOpacity onPress={comingSoon}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.vendorAccent }}>
                  {t('vendor.login.forgotPassword')}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
              paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
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

            {/* Remember me */}
            <TouchableOpacity
              onPress={() => setRememberMe(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}
            >
              <View style={{
                width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
                borderColor: rememberMe ? Brand.vendorAccent : '#C9CCD6',
                backgroundColor: rememberMe ? Brand.vendorAccent : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {rememberMe && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={{ fontSize: 13, color: Brand.textSecondary }}>
                {t('vendor.login.rememberMe')}
              </Text>
            </TouchableOpacity>

            {/* Sign in */}
            <TouchableOpacity
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
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Text style={{ color: Brand.textSecondary, fontSize: 13 }}>
                {t('vendor.login.noAccount')}
              </Text>
              <TouchableOpacity onPress={comingSoon}>
                <Text style={{ color: Brand.vendorAccent, fontWeight: '600', fontSize: 13 }}>
                  {t('vendor.login.applyHere')}
                </Text>
              </TouchableOpacity>
            </View>

            {__DEV__ && (
              <TouchableOpacity onPress={signIn} style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={{ color: '#CCC', fontSize: 12 }}>{t('auth.skipLoginDev')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>← Back to student login</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero panel */}
        {showHero && (
          <View style={{ flex: 1, backgroundColor: Brand.vendorAccentLight, padding: 48, justifyContent: 'center' }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: Brand.textPrimary, maxWidth: 340, lineHeight: 38 }}>
              {t('vendor.login.heroHeadline')}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
