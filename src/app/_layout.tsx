import { useEffect, useState } from 'react';
import { Slot, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { I18nProvider } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

// Standalone entry points meant to be reached directly (typed URL, bookmark,
// QR code) while signed out — not just via an in-app link from (auth). The
// redirect-to-(auth) effect below must not clobber a hard/first load of one
// of these. vendor-apply is deliberately NOT here anymore — applying is now
// an authenticated in-app action (see (tabs)/profile.tsx), so an
// unauthenticated visit should bounce to (auth) like any other protected route.
const PUBLIC_ROUTES = ['/admin-login'];

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();

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
      if (!PUBLIC_ROUTES.includes(pathname)) router.replace('/(auth)');
    } else {
      routeAfterAuth(session.user.id);
    }
    // pathname deliberately excluded: this only needs pathname's value at
    // the moment `session` first resolves (to decide whether a hard load
    // landed on a public route), not on every subsequent in-app navigation
    // — including pathname would re-run routeAfterAuth on every route
    // change for an authenticated user, bouncing them back to their
    // landing screen on every tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <I18nProvider>
      <StatusBar style="dark" />
      <Slot />
    </I18nProvider>
  );
}
