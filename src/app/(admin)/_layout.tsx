import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function AdminLayout() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const initStarted = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/admin-login' as any); return; }

      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'admin') { router.replace('/admin-login' as any); return; }

      setOk(true);
      setLoading(false);
    }
    void checkAdmin();
  }, []);

  async function logOut() {
    await supabase.auth.signOut();
    router.replace('/admin-login' as any);
  }

  if (loading || !ok) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.adminAccent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }} edges={['top', 'bottom']}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E4EC', backgroundColor: '#fff',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="shield-checkmark" size={18} color={Brand.adminAccent} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: Brand.textPrimary }}>{t('admin.portalLabel')}</Text>
        </View>
        <Tap onPress={logOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="log-out-outline" size={18} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#4B4F58', fontWeight: '500' }}>{t('admin.nav.logOut')}</Text>
        </Tap>
      </View>
      <View style={{
        flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E4EC',
      }}>
        <NavTab
          label={t('admin.nav.applications')}
          active={pathname === '/applications'}
          onPress={() => router.push('/(admin)/applications' as any)}
        />
        <NavTab
          label={t('admin.nav.vendors')}
          active={pathname === '/vendors'}
          onPress={() => router.push('/(admin)/vendors' as any)}
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Slot />
      </ScrollView>
    </SafeAreaView>
  );
}

function NavTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 50,
        backgroundColor: active ? Brand.adminAccentLight : 'transparent',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? Brand.adminAccent : '#8A8F9B' }}>
        {label}
      </Text>
    </Tap>
  );
}
