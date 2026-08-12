import { View, Text, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { MOCK_NOTIFICATIONS } from '@/lib/mock-data';
import { useI18n } from '@/lib/i18n';

function timeAgo(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('common.daysAgo', { n: Math.floor(diff / 86400) });
}

export default function NotificationsScreen() {
  const { t } = useI18n();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('notifications.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 }}>
        {MOCK_NOTIFICATIONS.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
            <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {MOCK_NOTIFICATIONS.map(n => (
              <View
                key={n.id}
                style={{
                  flexDirection: 'row', gap: 12,
                  backgroundColor: Brand.card, borderRadius: 18, padding: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
                  borderLeftWidth: n.read ? 0 : 3,
                  borderLeftColor: n.read ? 'transparent' : Brand.orange,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 18 }}>{n.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>
                      {n.title}
                    </Text>
                    {!n.read && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.orange }} />
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 2 }}>{n.body}</Text>
                  <Text style={{ fontSize: 11, color: Brand.textSecondary, marginTop: 6 }}>{timeAgo(n.created_at, t)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
