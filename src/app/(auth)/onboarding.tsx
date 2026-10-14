import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { listEnter } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert, errorMessage } from '@/lib/alert';
import { toggled } from '@/lib/toggle-set';
import Svg, { Circle, Path } from 'react-native-svg';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { getTopMenuCategories } from '@/lib/menu-categories';
import { ALLERGY_OPTIONS, ALLERGY_LABELS, ALLERGY_VALUES, type Allergy } from '@/lib/allergy-options';
import { refreshPreferences } from '@/hooks/usePreferences';

const DIETARY_OPTIONS = ['Halal', 'Vegetarian', 'Jay'] as const;
type Dietary = (typeof DIETARY_OPTIONS)[number];
const DIETARY_LABELS: Record<Dietary, TranslationKey> = {
  Halal: 'onboarding.dietary.halal',
  Vegetarian: 'onboarding.dietary.vegetarian',
  Jay: 'onboarding.dietary.jay',
};

export default function OnboardingScreen() {
  const { t } = useI18n();
  const [dietary, setDietary] = useState<Set<Dietary>>(new Set());
  const [allergies, setAllergies] = useState<Set<Allergy>>(new Set());
  const [budget, setBudget] = useState(60);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [favoriteCategories, setFavoriteCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Continue stays disabled until saved prefs are in: tapping it before the
  // load lands upserted blank defaults over a re-onboarding student's prefs.
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  async function loadPreferences() {
    setLoadError(false);
    setLoadingPrefs(true);
    try {
      await loadSavedPreferences();
    } finally {
      setLoadingPrefs(false);
    }
  }

  async function loadSavedPreferences() {
    void getTopMenuCategories().then(setCategoryOptions).catch(() => {});

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('user_preferences')
      .select('is_halal,is_vegetarian,is_jay,allergies,budget_max,favorite_categories')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      // A re-onboarding student may already have real saved prefs — don't
      // let Continue upsert blank defaults over them while this is broken.
      console.warn('load preferences failed:', error.message);
      setLoadError(true);
      return;
    }
    if (!data) return; // first-time onboarding: keep blank defaults

    const nextDietary = new Set<Dietary>();
    if (data.is_halal) nextDietary.add('Halal');
    if (data.is_vegetarian) nextDietary.add('Vegetarian');
    if (data.is_jay) nextDietary.add('Jay');
    setDietary(nextDietary);

    const nextAllergies = new Set<Allergy>();
    for (const saved of data.allergies ?? []) {
      const option = ALLERGY_OPTIONS.find(o => ALLERGY_VALUES[o] === saved);
      if (option) nextAllergies.add(option);
    }
    setAllergies(nextAllergies);

    setBudget(data.budget_max ?? 150);
    setFavoriteCategories(new Set(data.favorite_categories ?? []));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- fetch-on-mount is the intended pattern here (retry calls loadPreferences directly)
  useEffect(() => { void loadPreferences(); }, []);

  function toggleDietary(item: Dietary) {
    setDietary(prev => toggled(prev, item));
  }

  function toggleAllergy(item: Allergy) {
    setAllergies(prev => toggled(prev, item));
  }

  function toggleCategory(item: string) {
    setFavoriteCategories(prev => toggled(prev, item));
  }

  async function handleSkip() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('user_preferences').upsert({ user_id: user.id });
      if (error) throw error;
      await refreshPreferences();
      router.replace('/(tabs)');
    } catch (e) {
      showAlert(t('onboarding.errorSavingTitle'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        is_halal: dietary.has('Halal'),
        is_vegetarian: dietary.has('Vegetarian'),
        is_jay: dietary.has('Jay'),
        allergies: [...allergies]
          .filter(a => a !== 'Other...')
          .map(a => ALLERGY_VALUES[a]),
        budget_max: budget >= 150 ? null : budget,
        favorite_categories: [...favoriteCategories],
      });
      if (error) throw error;
      await refreshPreferences();
      router.replace('/(tabs)');
    } catch (e) {
      showAlert(t('onboarding.errorSavingTitle'), errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      {/* Header: step dots + skip */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Dot 1: small, inactive */}
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDD' }} />
          {/* Dot 2: wide pill, active (this screen) */}
          <View style={{ width: 24, height: 8, borderRadius: 4, backgroundColor: Brand.orange }} />
          {/* Dot 3: small, inactive */}
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDD' }} />
        </View>
        <Tap onPress={handleSkip} disabled={saving}>
          <Text style={{ color: Brand.orange, fontWeight: '600', fontSize: 15 }}>{t('onboarding.skip')}</Text>
        </Tap>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Animated.View entering={listEnter(0)} style={{ marginTop: 20, marginBottom: 36 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: Brand.textPrimary }}>
            {t('onboarding.title')}
          </Text>
          <Text style={{ fontSize: 22 }}>🥗</Text>
          <Text style={{ color: Brand.textSecondary, fontSize: 15, marginTop: 8, lineHeight: 22 }}>
            {t('onboarding.subtitle')}
          </Text>
        </Animated.View>

        {loadError && (
          <View style={{
            backgroundColor: '#fee2e2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca',
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
          }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700', marginBottom: 8 }}>
              {t('onboarding.loadErrorMsg')}
            </Text>
            <Tap onPress={() => void loadPreferences()}>
              <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700', textDecorationLine: 'underline' }}>
                {t('common.tryAgain')}
              </Text>
            </Tap>
          </View>
        )}

        {/* Dietary Preferences */}
        <Animated.View entering={listEnter(1)} style={{ marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: Brand.textSecondary,
              marginBottom: 14,
            }}
          >
            {t('onboarding.dietaryPreferences')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DIETARY_OPTIONS.map(item => {
              const selected = dietary.has(item);
              return (
                <Tap
                  key={item}
                  onPress={() => toggleDietary(item)}
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 50,
                    backgroundColor: selected ? Brand.orange : Brand.card,
                    borderWidth: 1.5,
                    borderColor: selected ? Brand.orange : '#DDD',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {selected && (
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                  )}
                  <Text
                    style={{
                      color: selected ? '#fff' : Brand.textPrimary,
                      fontWeight: '600',
                      fontSize: 15,
                    }}
                  >
                    {t(DIETARY_LABELS[item])}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </Animated.View>

        {/* Allergies */}
        <Animated.View entering={listEnter(2)} style={{ marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: Brand.textSecondary,
              marginBottom: 14,
            }}
          >
            {t('onboarding.allergies')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ALLERGY_OPTIONS.map(item => {
              const selected = allergies.has(item);
              return (
                <Tap
                  key={item}
                  onPress={() => toggleAllergy(item)}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 50,
                    backgroundColor: selected ? '#FFF0EE' : Brand.card,
                    borderWidth: 1.5,
                    borderColor: selected ? '#E04040' : '#DDD',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {selected && (
                    <Svg width={12} height={12} viewBox="0 0 512 512">
                      <Circle cx={256} cy={256} r={218} stroke="#ED1C24" strokeWidth={40} fill="none" />
                      <Path d="M102 410L410 102" stroke="#ED1C24" strokeWidth={40} />
                    </Svg>
                  )}
                  <Text
                    style={{
                      color: selected ? '#E04040' : Brand.textPrimary,
                      fontWeight: '600',
                      fontSize: 15,
                    }}
                  >
                    {t(ALLERGY_LABELS[item])}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </Animated.View>

        {/* Favorite Categories — feeds the personalized "Recommended For
            You" ranking (cold-started from this until real order history
            exists); only shown once the catalog has loaded some options */}
        {categoryOptions.length > 0 && (
          <Animated.View entering={listEnter(3)} style={{ marginBottom: 32 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.2,
                color: Brand.textSecondary,
                marginBottom: 14,
              }}
            >
              {t('onboarding.favoriteCategories')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {categoryOptions.map(item => {
                const selected = favoriteCategories.has(item);
                return (
                  <Tap
                    key={item}
                    onPress={() => toggleCategory(item)}
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 50,
                      backgroundColor: selected ? Brand.orange : Brand.card,
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.orange : '#DDD',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                    <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 15 }}>
                      {item}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Budget */}
        <Animated.View entering={listEnter(4)}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.2,
                color: Brand.textSecondary,
              }}
            >
              {t('onboarding.budget')}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: Brand.orange, fontVariant: ['tabular-nums'] }}>
              ฿{budget >= 150 ? '150+' : budget}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: Brand.card,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 16,
              borderWidth: 1,
              borderColor: '#EEE',
            }}
          >
            <Slider
              minimumValue={30}
              maximumValue={150}
              step={10}
              value={budget}
              onValueChange={v => setBudget(Math.round(v))}
              minimumTrackTintColor={Brand.orange}
              maximumTrackTintColor='#E8E0D8'
              thumbTintColor={Brand.orange}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>
                {t('onboarding.streetFood')}
              </Text>
              <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>
                {t('onboarding.premium')}
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Sticky Continue button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          paddingBottom: 36,
          paddingTop: 12,
          backgroundColor: Brand.bg,
        }}
      >
        <Tap
          onPress={handleContinue}
          disabled={saving || loadError || loadingPrefs}
          style={{
            backgroundColor: Brand.orange,
            borderRadius: 50,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: (saving || loadError || loadingPrefs) ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {saving ? t('onboarding.saving') : t('onboarding.continue')}
          </Text>
          <Text style={{ color: '#fff', fontSize: 16 }}>→</Text>
        </Tap>
      </View>
    </SafeAreaView>
  );
}
