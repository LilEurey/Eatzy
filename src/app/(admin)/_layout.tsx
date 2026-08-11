import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function AdminLayout() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const initStarted = useRef(false);

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
        <TouchableOpacity onPress={logOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="log-out-outline" size={18} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#4B4F58', fontWeight: '500' }}>{t('admin.nav.logOut')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Slot />
      </ScrollView>
    </SafeAreaView>
  );
}
