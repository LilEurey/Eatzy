import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Tap } from '@/components/Tap';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorNotifications, markNotificationsRead } from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';
import { notificationText } from '@/lib/localize';

function timeAgo(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('common.daysAgo', { n: Math.floor(diff / 86400) });
}

export default function VendorNotificationsScreen() {
  const { t } = useI18n();
  const notifications = useVendorNotifications();

  useEffect(() => { void markNotificationsRead(); }, []);

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.notifications.title')}</Text>
        <Tap onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="arrow-back" size={14} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#8A8F9B' }}>{t('vendor.notifications.backCaption')}</Text>
        </Tap>
      </View>

      {notifications.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Ionicons name="notifications-outline" size={36} color="#C9CCD6" />
          <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 10 }}>{t('vendor.notifications.empty')}</Text>
        </View>
      ) : (
        <View style={{ gap: 10, maxWidth: 480 }}>
          {notifications.map(n => {
            const { title, body } = notificationText(n, t);
            return (
              <Tap
                key={n.id}
                onPress={() => router.push('/(vendor)/orders' as any)}
                style={{
                  flexDirection: 'row', gap: 12,
                  backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EEF0F5', padding: 14,
                  borderLeftWidth: n.read ? 1 : 3,
                  borderLeftColor: n.read ? '#EEF0F5' : Brand.orange,
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: Brand.vendorAccentLight, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 16 }}>{n.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{title}</Text>
                    {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.orange }} />}
                  </View>
                  <Text style={{ fontSize: 13, color: '#4B4F58', marginTop: 2 }}>{body}</Text>
                  <Text style={{ fontSize: 11, color: '#8A8F9B', marginTop: 6 }}>{timeAgo(n.created_at, t)}</Text>
                </View>
              </Tap>
            );
          })}
        </View>
      )}
    </View>
  );
}
