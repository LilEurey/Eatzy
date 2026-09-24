import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { createEmitter } from '@/lib/create-emitter';

// Shared cache of the current student's dietary prefs + allergies for every
// screen that filters or warns on them (item/[id], search, home, cart,
// store/[id], profile). Module-level cache + useSyncExternalStore, same shape
// as cart-store.ts / vendor-store.ts. The onboarding / edit-preferences forms
// still read and write the full row themselves.

export type Preferences = {
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  allergies: string[];
};

// Anonymous / no row: nothing is filtered and nothing warns — matches the old
// DEFAULT_PREFS in (tabs)/index.tsx.
const DEFAULT_PREFERENCES: Preferences = {
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

export type DietaryGate = {
  status: 'loading' | 'error' | 'ready';
  /** False for everything until prefs are loaded — a screen can't show a
   * restricted student something they can't eat during the cold-start gap
   * (prefs are still the all-false defaults) or after a failed load. */
  visible: (item: DietaryFlags) => boolean;
};

export function dietaryGate(state: { prefs: Preferences; loading: boolean; error: boolean }): DietaryGate {
  const status = state.error ? 'error' : state.loading ? 'loading' : 'ready';
  return { status, visible: item => status === 'ready' && passesDietary(item, state.prefs) };
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

// A cart/order line's allergens are the dish's own plus whatever its selected
// add-ons carry (e.g. "Fried Egg" can trip the warning even on an
// allergen-free dish) — item/[id].tsx and cart.tsx both need that combined,
// deduped set matched against saved allergies.
export function matchLineAllergens(
  dishAllergens: string[],
  addonAllergens: string[],
  prefs: Preferences,
): string[] {
  return matchAllergens([...new Set([...dishAllergens, ...addonAllergens])], prefs);
}

let prefs: Preferences = DEFAULT_PREFERENCES;
let loading = true;
// True when the last load attempt failed — lets consumers tell "no prefs
// saved" (prefs = defaults, error = false) apart from "failed to load"
// (prefs = stale/defaults, error = true), since the two must not be treated
// the same for hard filters / allergy gates.
let loadError = false;
// Rebuilt on every emit so useSyncExternalStore sees a new reference only when
// something actually changed.
let snapshot: { prefs: Preferences; loading: boolean; error: boolean } = { prefs, loading, error: loadError };

const emitter = createEmitter();
function emit() {
  snapshot = { prefs, loading, error: loadError };
  emitter.emit();
}

let inFlight: Promise<void> | null = null;

async function load(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    prefs = DEFAULT_PREFERENCES;
    loading = false;
    loadError = false;
    emit();
    return;
  }
  const { data, error } = await supabase
    .from('user_preferences')
    .select('is_halal,is_vegetarian,is_jay,allergies')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    // Don't overwrite with all-false: that would silently drop the halal /
    // vegetarian / jay hard filters for a student who has them saved.
    console.warn('load preferences failed:', error.message);
    loading = false;
    loadError = true;
    emit();
    return;
  }
  prefs = {
    is_halal: data?.is_halal ?? false,
    is_vegetarian: data?.is_vegetarian ?? false,
    is_jay: data?.is_jay ?? false,
    allergies: data?.allergies ?? [],
  };
  loading = false;
  loadError = false;
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

export function usePreferences(): { prefs: Preferences; loading: boolean; error: boolean; gate: DietaryGate } {
  const state = useSyncExternalStore(emitter.subscribe, () => snapshot, () => snapshot);
  useEffect(() => { ensureLoaded(); }, []);
  const gate = useMemo(() => dietaryGate(state), [state]);
  return { ...state, gate };
}
