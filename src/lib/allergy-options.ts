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
// live data: distinct menu_items.allergens = dairy, soy, eggs, sesame,
// peanuts, shellfish, gluten.
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
