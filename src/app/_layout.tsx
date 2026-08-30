import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { I18nProvider } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

// Standalone entry points meant to be reached directly (typed URL, bookmark,
// QR code) while signed out — not just via an in-app link from (auth). The
// redirect-to-(auth) effect below must not clobber a hard/first load of one
// of these. Both are password-login screens handed to staff out of band:
// admin-login for admins, vendor-login for vendors (whose store accounts are
// created by an admin, see (admin)/new-vendor.tsx).
const PUBLIC_ROUTES = ['/admin-login', '/vendor-login'];

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();
  // onAuthStateChange fires a new session object (same user) on background
  // token refresh, not just on sign-in/out. Routing off session-object
  // identity would then re-run routeAfterAuth and yank the user back to
  // their landing screen mid-navigation every ~hour. Track the routed user
  // id instead so only an actual sign-in/sign-out/switch re-routes.
  const routedUserId = useRef<string | null>(null);

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
    // router.replace() below only swaps the current stack frame — it doesn't
    // clear frames underneath. A pre-auth link (e.g. login -> vendor-login)
    // pushes a second screen on top of Login, so replacing just that top
    // frame leaves the stale, still-mounted Login screen reachable one
    // back-tap away post-auth. Collapse any such pre-auth history first so
    // every destination below lands on a clean, single-frame stack.
    // canGoBack() checks any ancestor navigator (tabs included), which can
    // be true even when there's no actual Stack history to pop — dismissAll
    // then dispatches POP_TO_TOP to a Stack with only one route and logs
    // "not handled by any navigator". canDismiss() checks specifically for
    // a Stack-type navigator with routes.length > 1, matching what
    // dismissAll's POP_TO_TOP actually needs.
    if (router.canDismiss()) router.dismissAll();

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
      router.replace('/(admin)/new-vendor' as any);
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
      routedUserId.current = null;
      // usePathname() can still report the previous/default path on a hard
      // web reload — the router hook hasn't hydrated from the real URL yet
      // even though session has already resolved. window.location is the
      // synchronous source of truth there; native has no equivalent lag
      // (no hard-reload concept), so pathname alone is correct off-web.
      const currentPath = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.pathname
        : pathname;
      if (!PUBLIC_ROUTES.includes(currentPath)) router.replace('/(auth)');
    } else {
      if (session.user.id === routedUserId.current) return; // token refresh, not a new sign-in
      routedUserId.current = session.user.id;
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
      <Stack screenOptions={{ headerShown: false }} />
    </I18nProvider>
  );
}
