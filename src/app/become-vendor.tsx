import { View, Text, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';

const BENEFIT_KEYS = ['vendor.pitch.benefit1', 'vendor.pitch.benefit2', 'vendor.pitch.benefit3'] as const;

export default function BecomeVendorScreen() {
  const { t } = useI18n();
  const { signIn, loading } = useGoogleSignIn();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F6' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('vendor.pitch.title')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 24 }}>
            {t('vendor.pitch.subtitle')}
          </Text>

          <View style={{ gap: 14, marginBottom: 24 }}>
            {BENEFIT_KEYS.map(key => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={Brand.orange} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 14, color: Brand.textPrimary, lineHeight: 20 }}>
                  {t(key)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 13, color: Brand.textSecondary, marginBottom: 28, lineHeight: 18 }}>
            {t('vendor.pitch.reviewNote')}
          </Text>

          <Tap
            onPress={() => signIn(true)}
            disabled={loading}
            style={{
              backgroundColor: Brand.orange, borderRadius: 50, paddingVertical: 14,
              alignItems: 'center', opacity: loading ? 0.6 : 1, marginBottom: 16,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {loading ? t('auth.signingIn') : t('vendor.pitch.cta')}
            </Text>
          </Tap>

          <Tap onPress={() => router.back()} style={{ alignItems: 'center' }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('vendor.pitch.backToLogin')}</Text>
          </Tap>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
