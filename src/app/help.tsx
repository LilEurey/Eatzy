import { useState } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Brand } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';

// ponytail: placeholder inbox — swap for the real support address before launch.
const SUPPORT_EMAIL = 'support@eatzy.app';

const FAQ = ['preorder', 'wallet', 'cancel', 'topup', 'dietary', 'queue', 'problem'] as const;

export default function HelpScreen() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '';

  const emailSupport = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const body = `\n\n---\nUser: ${user?.id ?? 'guest'}\nApp: ${version}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Eatzy support')}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => showAlert(t('help.contact'), SUPPORT_EMAIL));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Brand.textPrimary} />
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '800', color: Brand.textPrimary, flex: 1 }}>{t('profile.help')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#5A4136', letterSpacing: 1 }}>{t('help.faqHeader')}</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' }}>
          {FAQ.map((key, i) => (
            <Tap
              key={key}
              onPress={() => setOpen(open === key ? null : key)}
              style={{ padding: 16, borderTopWidth: i ? 1 : 0, borderColor: '#F0E6E0' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#261812' }}>
                  {t(`help.q.${key}` as TranslationKey)}
                </Text>
                <Ionicons name={open === key ? 'chevron-up' : 'chevron-down'} size={14} color="#5A4136" />
              </View>
              {open === key && (
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: '#5A4136' }}>
                  {t(`help.a.${key}` as TranslationKey)}
                </Text>
              )}
            </Tap>
          ))}
        </View>

        <Text style={{ fontSize: 12, fontWeight: '700', color: '#5A4136', letterSpacing: 1, marginTop: 12 }}>{t('help.contactHeader')}</Text>
        <Tap
          onPress={emailSupport}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16 }}
        >
          <Ionicons name="mail-outline" size={20} color="#261812" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: '#261812' }}>{t('help.contact')}</Text>
            <Text style={{ fontSize: 13, color: '#5A4136' }}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#5A4136" />
        </Tap>

        <Text style={{ textAlign: 'center', fontSize: 12, color: '#5A4136', marginTop: 16 }}>
          {t('help.version')} {version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
