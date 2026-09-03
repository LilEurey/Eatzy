import type { TranslationKey } from '@/lib/i18n';

// Shared by onboarding.tsx and edit-preferences.tsx (previously duplicated in
// both, which is how the label/value mismatch below went unnoticed in one
// copy — single source of truth now).
export const ALLERGY_OPTIONS = ['Peanuts', 'Dairy', 'Gluten', 'Soy', 'Sesame', 'Seafood', 'Beef', 'Egg', 'Other...'] as const;
export type Allergy = (typeof ALLERGY_OPTIONS)[number];

export const ALLERGY_LABELS: Record<Allergy, TranslationKey> = {
  Peanuts: 'onboarding.allergy.peanuts',
  Dairy: 'onboarding.allergy.dairy',
  Gluten: 'onboarding.allergy.gluten',
  Soy: 'onboarding.allergy.soy',
  Sesame: 'onboarding.allergy.sesame',
  Seafood: 'onboarding.allergy.seafood',
  Beef: 'onboarding.allergy.beef',
  Egg: 'onboarding.allergy.egg',
  'Other...': 'onboarding.allergy.other',
};

// The string actually stored in user_preferences.allergies and matched
// against vendor-entered menu_items.allergens. These must equal the real
// vendor vocabulary, not just the lowercased UI label — "Egg" and "Seafood"
// used to save as 'egg'/'seafood' while real menu_items tag 'eggs' and
// 'shellfish', so that filter silently matched nothing. Verified against
// peanuts, shellfish, gluten, plus beef added by migration
// 20260903030000_backfill_menu_item_allergens.
export const ALLERGY_VALUES: Record<Allergy, string> = {
  Peanuts: 'peanuts',
  Dairy: 'dairy',
  Gluten: 'gluten',
  Soy: 'soy',
  Sesame: 'sesame',
  Seafood: 'shellfish',
  Beef: 'beef',
  Egg: 'eggs',
  'Other...': 'other',
};

// Canonical allergen tags for the vendor side (base dish in menu/new.tsx and
// add-on options in menu/[id]/addons.tsx). These MUST be the same strings the
// student side stores in user_preferences.allergies — i.e. the ALLERGY_VALUES
// above — or the warn-before-add / warn-before-checkout checks silently match
// nothing. "Seafood" saves as 'shellfish', "Egg" as 'eggs' (see the note
// above); the vendor picker used to write 'seafood'/'egg' and never matched.
// Restricted to tags that actually appear in menu_items.allergens (see
// migration 20260903030000_backfill_menu_item_allergens, which added beef).
export const ALLERGEN_VOCAB: { key: string; labelKey: TranslationKey }[] = [
  { key: 'peanuts', labelKey: 'onboarding.allergy.peanuts' },
  { key: 'dairy', labelKey: 'onboarding.allergy.dairy' },
  { key: 'gluten', labelKey: 'onboarding.allergy.gluten' },
  { key: 'soy', labelKey: 'onboarding.allergy.soy' },
  { key: 'sesame', labelKey: 'onboarding.allergy.sesame' },
  { key: 'shellfish', labelKey: 'onboarding.allergy.seafood' },
  { key: 'eggs', labelKey: 'onboarding.allergy.egg' },
  { key: 'beef', labelKey: 'onboarding.allergy.beef' },
];
