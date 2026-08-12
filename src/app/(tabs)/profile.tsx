import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, LOCALE_LABELS, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatBangkokClock, isBangkokToday, formatBangkokDate } from '@/lib/time';

// Exact bell path from the Figma export (see (tabs)/index.tsx for the same
// fix applied to the home header) — an emoji renders with baked-in colors.
function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 16 20" fill="none">
      <Path
        d="M0 17V15H2V8C2 6.61667 2.41667 5.3875 3.25 4.3125C4.08333 3.2375 5.16667 2.53333 6.5 2.2V1.5C6.5 1.08333 6.64583 0.729167 6.9375 0.4375C7.22917 0.145833 7.58333 0 8 0C8.41667 0 8.77083 0.145833 9.0625 0.4375C9.35417 0.729167 9.5 1.08333 9.5 1.5V2.2C10.8333 2.53333 11.9167 3.2375 12.75 4.3125C13.5833 5.3875 14 6.61667 14 8V15H16V17H0V17M8 9.5V9.5V9.5V9.5V9.5V9.5V9.5V9.5V9.5M8 20C7.45 20 6.97917 19.8042 6.5875 19.4125C6.19583 19.0208 6 18.55 6 18H10C10 18.55 9.80417 19.0208 9.4125 19.4125C9.02083 19.8042 8.55 20 8 20V20M4 15H12V8C12 6.9 11.6083 5.95833 10.825 5.175C10.0417 4.39167 9.1 4 8 4C6.9 4 5.95833 4.39167 5.175 5.175C4.39167 5.95833 4 6.9 4 8V15V15"
        fill="#5A4136"
      />
    </Svg>
  );
}

// Decorative corner glow on the profile card — see (auth)/index.tsx for why
// a radial gradient (not a flat-fill circle) is needed to look soft.
function CornerGlow() {
  return (
    <Svg width={128} height={128} style={{ position: 'absolute', top: 0, right: 0 }}>
      <Defs>
        <RadialGradient id="profileGlow" cx="70%" cy="30%" r="70%">
          <Stop offset="0%" stopColor="#FF6B00" stopOpacity={0.2} />
          <Stop offset="60%" stopColor="#FF6B00" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={128} height={128} fill="url(#profileGlow)" />
    </Svg>
  );
}

type RecentOrder = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  itemSummary: string;
};

const ORDER_STATUS_LABEL: Record<string, TranslationKey> = {
  pending: 'orders.status.pending',
  accepted: 'orders.status.preparing',
  ready: 'orders.status.ready',
  completed: 'orders.status.completed',
  rejected: 'orders.status.rejected',
  cancelled: 'orders.status.cancelled',
};

export default function ProfileScreen() {
  const { t, locale, setLocale } = useI18n();
  const [name, setName] = useState('Student');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [dietaryChips, setDietaryChips] = useState<string[]>([]);
  const [allergyChips, setAllergyChips] = useState<string[]>([]);
  const [recentOrder, setRecentOrder] = useState<RecentOrder | null | undefined>(undefined);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // useFocusEffect (not a mount-only effect) so returning from Edit
  // Preferences or Account Details shows the just-saved chips/data
  // immediately, without needing a full remount.
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) { setRecentOrder(null); return; } // dev skip-login: keep defaults
        setEmail(user.email ?? '');
        setName(
          (user.user_metadata?.full_name as string) ??
          user.email?.split('@')[0] ??
          'Student',
        );

        const [profileRes, prefsRes, orderRes] = await Promise.all([
          supabase.from('users').select('avatar_url,notifications_enabled').eq('id', user.id).maybeSingle(),
          supabase.from('user_preferences').select('is_halal,is_vegetarian,is_jay,allergies').eq('user_id', user.id).maybeSingle(),
          supabase
            .from('orders')
            .select('id,status,total_amount,created_at,order_items(quantity,menu_items(name))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);
        if (profileRes.data) setNotificationsEnabled(profileRes.data.notifications_enabled);

        const prefs = prefsRes.data;
        const dietary: string[] = [];
        if (prefs?.is_halal) dietary.push(t('onboarding.dietary.halal'));
        if (prefs?.is_vegetarian) dietary.push(t('onboarding.dietary.vegetarian'));
        if (prefs?.is_jay) dietary.push(t('onboarding.dietary.jay'));
        setDietaryChips(dietary);
        setAllergyChips((prefs?.allergies ?? []).map(a => a.charAt(0).toUpperCase() + a.slice(1)));

        const order = orderRes.data as any;
        if (!order) { setRecentOrder(null); return; }
        const items = order.order_items ?? [];
        const itemSummary = items.length
          ? items[0].menu_items?.name + (items.length > 1 ? ` +${items.length - 1}` : '')
          : '';
        setRecentOrder({ id: order.id, status: order.status, total_amount: order.total_amount, created_at: order.created_at, itemSummary });
      });
    }, [t]),
  );

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  async function pickAvatar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { comingSoon(); return; } // dev skip-login: no account to attach a photo to

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t('common.permissionNeededTitle'), t('profile.avatarPermissionMsg'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const arraybuffer = await fetch(asset.uri).then(res => res.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arraybuffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase.from('users').update({ avatar_url: bustedUrl }).eq('id', user.id);
      if (updateError) throw updateError;

      setAvatarUrl(bustedUrl);
    } catch (e) {
      showAlert(t('profile.avatarUploadErrorTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function toggleNotifications(next: boolean) {
    setNotificationsEnabled(next); // optimistic
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { comingSoon(); setNotificationsEnabled(!next); return; }
    const { error } = await supabase.from('users').update({ notifications_enabled: next }).eq('id', user.id);
    if (error) {
      setNotificationsEnabled(!next);
      showAlert(t('common.comingSoonTitle'), error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)');
  }

  const orderTime = recentOrder
    ? (isBangkokToday(recentOrder.created_at) ? `${t('common.today')}, ` : `${formatBangkokDate(recentOrder.created_at)}, `) + formatBangkokClock(recentOrder.created_at)
    : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }} edges={['top']}>
      {/* Header — matches the home screen's TopAppBar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, height: 64,
      }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16, overflow: 'hidden',
          backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
        }}>
          {avatarUrl
            ? <Image source={{ uri: avatarUrl }} style={{ width: 32, height: 32 }} />
            : <Text style={{ fontSize: 13, fontWeight: '800', color: Brand.orange }}>{name.charAt(0).toUpperCase()}</Text>}
        </View>
        <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -1.2 }}>
          <Text style={{ color: '#020202' }}>Eat</Text>
          <Text style={{ color: '#e76106' }}>zy</Text>
        </Text>
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <BellIcon size={16} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 24, padding: 24, marginTop: 8, marginBottom: 12,
          overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
        }}>
          <CornerGlow />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} activeOpacity={0.8} style={{ position: 'relative' }}>
              <View style={{
                width: 80, height: 80, borderRadius: 20, overflow: 'hidden',
                borderWidth: 2, borderColor: '#F8DDD2',
                backgroundColor: Brand.orange, alignItems: 'center', justifyContent: 'center',
              }}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 80, height: 80 }} />
                ) : (
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#fff' }}>{name.charAt(0).toUpperCase()}</Text>
                )}
                {uploadingAvatar && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </View>
              <View style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: '#fff', borderWidth: 2, borderColor: '#F8F9FA',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="camera" size={11} color={Brand.orange} />
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#261812', letterSpacing: -0.32 }} numberOfLines={1}>{name}</Text>
              <Text style={{ fontSize: 14, color: '#5A4136', marginTop: 4 }} numberOfLines={1}>
                {email || t('profile.kmuttStudent')}
              </Text>
            </View>
          </View>
        </View>

        {/* Dietary / Allergies bento */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="leaf-outline" size={16} color="#261812" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }}>{t('profile.dietary')}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {dietaryChips.length > 0 ? dietaryChips.map(chip => (
                <View key={chip} style={{ backgroundColor: '#F8DDD2', borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#261812' }}>{chip}</Text>
                </View>
              )) : (
                <Text style={{ fontSize: 12, color: '#5A4136' }}>{t('profile.noneSet')}</Text>
              )}
            </View>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="restaurant-outline" size={16} color="#261812" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812', letterSpacing: 0.7, textTransform: 'uppercase' }}>{t('profile.allergies')}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {allergyChips.length > 0 ? allergyChips.map(chip => (
                <View key={chip} style={{ backgroundColor: '#F8DDD2', borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#261812' }}>{chip}</Text>
                </View>
              )) : (
                <Text style={{ fontSize: 12, color: '#5A4136' }}>{t('profile.noneSet')}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Recent Orders */}
        <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#261812' }}>{t('profile.recentOrders')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#A04100' }}>{t('profile.viewAll')}</Text>
            </TouchableOpacity>
          </View>
          {recentOrder === undefined ? (
            <ActivityIndicator color={Brand.orange} size="small" />
          ) : recentOrder === null ? (
            <Text style={{ fontSize: 13, color: '#5A4136' }}>{t('profile.noOrdersYet')}</Text>
          ) : (
            <TouchableOpacity
              onPress={() => router.push(`/track/${recentOrder.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#F8DDD2', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>🍽️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }} numberOfLines={1}>{recentOrder.itemSummary}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#5A4136', marginTop: 2 }}>{orderTime}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }}>฿{recentOrder.total_amount}</Text>
                <View style={{ backgroundColor: 'rgba(255,107,0,0.1)', borderRadius: 9999, paddingHorizontal: 4, paddingVertical: 3, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#A04100' }}>
                    {t(ORDER_STATUS_LABEL[recentOrder.status] ?? 'orders.status.completed')}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Account settings links */}
        <View style={{ backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 30, elevation: 2 }}>
          <TouchableOpacity onPress={() => router.push('/edit-preferences')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F8DDD2' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ionicons name="person-circle-outline" size={20} color="#261812" />
              <Text style={{ fontSize: 16, color: '#261812' }}>{t('profile.accountDetails')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#5A4136" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setLanguagePickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F8DDD2' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ionicons name="globe-outline" size={20} color="#261812" />
              <Text style={{ fontSize: 16, color: '#261812' }}>{t('profile.language')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#5A4136" />
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F8DDD2' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ionicons name="notifications-outline" size={20} color="#261812" />
              <Text style={{ fontSize: 16, color: '#261812' }}>{t('profile.notifications')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#E2E4EC', true: '#34C759' }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ionicons name="help-circle-outline" size={20} color="#261812" />
              <Text style={{ fontSize: 16, color: '#261812' }}>{t('profile.help')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#5A4136" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={signOut}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: '#fff', borderWidth: 2, borderColor: '#A04100',
            borderRadius: 16, height: 60, marginBottom: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#A04100" />
          <Text style={{ color: '#A04100', fontWeight: '600', fontSize: 14 }}>
            {t('profile.logout')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={languagePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setLanguagePickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 }}
        >
          <View style={{ backgroundColor: Brand.card, borderRadius: 20, padding: 8 }}>
            <Text style={{
              fontSize: 15, fontWeight: '700', color: Brand.textPrimary,
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
            }}>
              {t('profile.languagePickerTitle')}
            </Text>
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <TouchableOpacity
                key={code}
                onPress={() => {
                  setLocale(code);
                  setLanguagePickerOpen(false);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 16, color: Brand.textPrimary, fontWeight: locale === code ? '700' : '500' }}>
                  {LOCALE_LABELS[code]}
                </Text>
                {locale === code && <Text style={{ color: Brand.orange, fontSize: 16, fontWeight: '700' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
