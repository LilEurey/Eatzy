import { useEffect, useState } from 'react';
import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { I18nProvider } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function routeAfterAuth(userId: string) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.role === 'vendor') {
      router.replace('/(vendor)/overview' as any);
      return;
    }

    if (profile?.role === 'admin') {
      router.replace('/(admin)/applications' as any);
      return;
    }

    const { data } = await supabase
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) {
      router.replace('/(auth)/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }

  useEffect(() => {
    if (session === undefined) return; // still loading
    if (!session) {
      router.replace('/(auth)');
    } else {
      routeAfterAuth(session.user.id);
    }
  }, [session]);

  return (
    <I18nProvider>
      <StatusBar style="dark" />
      <Slot />
    </I18nProvider>
  );
}
