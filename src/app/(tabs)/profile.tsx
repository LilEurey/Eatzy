import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, LOCALE_LABELS, type Locale } from '@/lib/i18n';

const DEV_ROUTES: { label: string; route: string }[] = [
  { label: '🔐 Login screen', route: '/(auth)' },
  { label: '🥗 Onboarding / Preferences', route: '/(auth)/onboarding' },
  { label: '🏠 Home', route: '/(tabs)' },
  { label: '📋 Orders tab', route: '/(tabs)/orders' },
  { label: '💰 Wallet tab', route: '/(tabs)/wallet' },
  { label: '🛒 Cart', route: '/cart' },
  { label: '🏪 Store detail (sample)', route: '/store/v001' },
  { label: '🍛 Food item detail (sample)', route: '/item/m001' },
  { label: '📍 Track order (sample)', route: '/track/o001' },
  { label: '⭐ Rate order (sample)', route: '/rate/o003' },
];

export default function ProfileScreen() {
  const { t, locale, setLocale } = useI18n();
  const [name, setName] = useState('Student');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return; // dev skip-login: keep defaults
      setEmail(user.email ?? '');
      setName(
        (user.user_metadata?.full_name as string) ??
        user.email?.split('@')[0] ??
        'Student',
      );
      supabase.from('users').select('avatar_url').eq('id', user.id).maybeSingle().then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
    });
  }, []);

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

  const SETTINGS: { icon: string; label: string; onPress: () => void }[] = [
    { icon: '🥗', label: t('profile.dietaryPreferences'), onPress: () => router.push('/(auth)/onboarding') },
    { icon: '💰', label: t('profile.campusWallet'), onPress: () => router.push('/(tabs)/wallet') },
    { icon: '🔔', label: t('profile.notifications'), onPress: () => router.push('/notifications') },
    { icon: '🌐', label: t('profile.language'), onPress: () => setLanguagePickerOpen(true) },
    { icon: '💬', label: t('profile.help'), onPress: comingSoon },
  ];

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5, marginBottom: 20 }}>
          {t('profile.title')}
        </Text>

        {/* Avatar card */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 16,
          backgroundColor: Brand.card, borderRadius: 20, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} activeOpacity={0.8} style={{ position: 'relative' }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32, overflow: 'hidden',
              backgroundColor: Brand.orange, alignItems: 'center', justifyContent: 'center',
            }}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 64, height: 64 }} />
              ) : (
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff' }}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              )}
              {uploadingAvatar && (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
            </View>
            <View style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 22, height: 22, borderRadius: 11,
              backgroundColor: Brand.card, borderWidth: 2, borderColor: Brand.bg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 11 }}>📷</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary }}>{name}</Text>
            <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 2 }}>
              {email || t('profile.kmuttStudent')}
            </Text>
          </View>
        </View>

        {/* Settings */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('profile.settingsHeader')}
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, overflow: 'hidden', marginBottom: 28,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {SETTINGS.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              onPress={row.onPress}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                padding: 16,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Brand.border,
              }}
            >
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 17 }}>{row.icon}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Brand.textPrimary }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 18, color: Brand.textSecondary }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {__DEV__ && (
          <View style={{ marginBottom: 28 }}>
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
