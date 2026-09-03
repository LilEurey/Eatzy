import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

// Single source of truth for the current student's dietary prefs + allergies.
// Before this, item/[id], search, home, cart and store/[id] each ran their own
// `supabase.from('user_preferences')` query — six copies that had already
// drifted once (the 'shellfish' vs 'seafood' value mismatch, migration
// 20260830181128). Module-level cache + useSyncExternalStore, same shape as
// cart-store.ts / vendor-store.ts.

export type Preferences = {
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  allergies: string[];
};

// Anonymous / no row: nothing is filtered and nothing warns — matches the old
// DEFAULT_PREFS in (tabs)/index.tsx.
export const DEFAULT_PREFERENCES: Preferences = {
  is_halal: false,
  is_vegetarian: false,
  is_jay: false,
  allergies: [],
};

type DietaryFlags = { is_halal: boolean; is_vegetarian: boolean; is_jay: boolean };

// Hard dietary filters — is_halal/is_vegetarian/is_jay are "cannot eat this at
// all" rules, so they hide the item (same as recommend-for-you's server-side
// passesHardFilters). Allergies are deliberately NOT here: they warn before
// add, they never hide (see item/[id].tsx's Add to Cart confirm).
export function passesDietary(item: DietaryFlags, prefs: Preferences): boolean {
  if (prefs.is_halal && !item.is_halal) return false;
  if (prefs.is_vegetarian && !item.is_vegetarian) return false;
  if (prefs.is_jay && !item.is_jay) return false;
  return true;
}

// The allergens on this item (or add-on) that the student saved as their own.
// Drives every ⚠️ badge and the warn-before-add / warn-before-checkout dialogs.
export function matchAllergens(
  itemAllergens: string[] | null | undefined,
  prefs: Preferences,
): string[] {
  if (!itemAllergens?.length || !prefs.allergies.length) return [];
  return itemAllergens.filter(a => prefs.allergies.includes(a));
}

let prefs: Preferences = DEFAULT_PREFERENCES;
let loading = true;
// Rebuilt on every emit so useSyncExternalStore sees a new reference only when
// something actually changed.
let snapshot: { prefs: Preferences; loading: boolean } = { prefs, loading };

const listeners = new Set<() => void>();
function emit() {
  snapshot = { prefs, loading };
  listeners.forEach(l => l());
}

let inFlight: Promise<void> | null = null;

async function load(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    prefs = DEFAULT_PREFERENCES;
    loading = false;
    emit();
    return;
  }
  const { data } = await supabase
    .from('user_preferences')
    .select('is_halal,is_vegetarian,is_jay,allergies')
    .eq('user_id', user.id)
    .maybeSingle();
  prefs = {
    is_halal: data?.is_halal ?? false,
    is_vegetarian: data?.is_vegetarian ?? false,
    is_jay: data?.is_jay ?? false,
    allergies: data?.allergies ?? [],
  };
  loading = false;
  emit();
}

function ensureLoaded() {
  if (inFlight || !loading) return;
  inFlight = load().finally(() => { inFlight = null; });
}

/** Re-pull from the DB. Call after writing user_preferences. */
export function refreshPreferences(): Promise<void> {
  loading = true;
  emit();
  inFlight = load().finally(() => { inFlight = null; });
  return inFlight;
}

// Sign-in / sign-out / profile change — the cached prefs belong to whoever was
// signed in when they loaded, so re-pull. TOKEN_REFRESHED / INITIAL_SESSION
// don't change identity, so they're ignored.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    void refreshPreferences();
  }
});

export function usePreferences(): { prefs: Preferences; loading: boolean } {
  const state = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => snapshot,
  );
  useEffect(() => { ensureLoaded(); }, []);
  return state;
}
