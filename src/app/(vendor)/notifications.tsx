import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { Tap } from '@/components/Tap';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorNotifications, markNotificationsRead } from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';
import { notificationText } from '@/lib/localize';
import { timeAgo } from '@/lib/relative-time';

export default function VendorNotificationsScreen() {
  const { t } = useI18n();
  const notifications = useVendorNotifications();

  // Snapshot which ids were unread at the moment the screen opened, so the
  // "new" marker stays visible for this viewing even after markNotificationsRead()
  // flips the underlying store's `read` flag (which happens almost immediately —
  // otherwise every notification reads as already-seen before the vendor can look).
  const unreadAtOpenRef = useRef<Set<string> | null>(null);
  if (unreadAtOpenRef.current === null) {
    unreadAtOpenRef.current = new Set(notifications.filter(n => !n.read).map(n => n.id));
  }

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
            const isNew = unreadAtOpenRef.current!.has(n.id);
            return (
              <Tap
                key={n.id}
                onPress={() => router.push('/(vendor)/orders' as any)}
                style={{
                  flexDirection: 'row', gap: 12,
                  backgroundColor: isNew ? Brand.vendorAccentLight + '33' : '#fff',
                  borderRadius: 14, borderWidth: 1, borderColor: '#EEF0F5', padding: 14,
                  borderLeftWidth: isNew ? 3 : 1,
                  borderLeftColor: isNew ? Brand.orange : '#EEF0F5',
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
                    {isNew && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Brand.orange, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{t('vendor.notifications.new')}</Text>
                      </View>
                    )}
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
