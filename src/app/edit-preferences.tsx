import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Tap } from '@/components/Tap';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
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

// Same three sections/data as (auth)/onboarding.tsx (same user_preferences
// columns, same options) — this is the "edit later" entry point reached
// from Profile > Account Details, so the chrome is a normal detail screen
// (back arrow + Save) instead of the first-run onboarding flow (skip +
// step dots + Continue).
export default function EditPreferencesScreen() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [dietary, setDietary] = useState<Set<Dietary>>(new Set());
  const [allergies, setAllergies] = useState<Set<Allergy>>(new Set());
  const [budget, setBudget] = useState(60);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [favoriteCategories, setFavoriteCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      void getTopMenuCategories().then(setCategoryOptions).catch(() => {});

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: userRow }, { data }] = await Promise.all([
        supabase.from('users').select('name').eq('id', user.id).maybeSingle(),
        supabase
          .from('user_preferences')
          .select('is_halal,is_vegetarian,is_jay,allergies,budget_max,favorite_categories')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      setName(
        userRow?.name ??
        (user.user_metadata?.full_name as string) ??
        user.email?.split('@')[0] ??
        '',
      );

      if (data) {
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
      setLoading(false);
    }
    void load();
  }, []);

  function toggleDietary(item: Dietary) {
    setDietary(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  }

  function toggleAllergy(item: Allergy) {
    setAllergies(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  }

  function toggleCategory(item: string) {
    setFavoriteCategories(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAlert(t('onboarding.errorSavingTitle'), t('editPreferences.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: nameError } = await supabase.from('users').update({ name: trimmedName }).eq('id', user.id);
      if (nameError) throw nameError;

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

      // Refresh the shared store so Home / Search / Item / Cart / Store pick up
      // the new dietary rules and allergies without a full reload.
      await refreshPreferences();

      showAlert(t('editPreferences.savedTitle'), t('editPreferences.savedMsg'), () => router.back());
    } catch (e: any) {
      showAlert(t('onboarding.errorSavingTitle'), e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Brand.textPrimary} />
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '800', color: Brand.textPrimary, flex: 1 }}>
          {t('profile.accountDetails')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: Brand.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
          {t('editPreferences.subtitle')}
        </Text>

        {/* Name card */}
        <View style={{
          backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
            {t('editPreferences.name')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('editPreferences.namePlaceholder')}
            placeholderTextColor={Brand.textSecondary}
            style={{
              fontSize: 16, fontWeight: '600', color: Brand.textPrimary,
              borderWidth: 1.5, borderColor: '#DDD', borderRadius: 14,
              paddingHorizontal: 16, paddingVertical: 12,
            }}
          />
        </View>

        {/* Dietary Type card */}
        <View style={{
          backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
            {t('editPreferences.dietaryType')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DIETARY_OPTIONS.map(item => {
              const selected = dietary.has(item);
              return (
                <Tap
                  key={item}
                  onPress={() => toggleDietary(item)}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 50,
                    backgroundColor: selected ? Brand.orange : Brand.card,
                    borderWidth: 1.5, borderColor: selected ? Brand.orange : '#DDD',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}
                >
                  {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 15 }}>
                    {t(DIETARY_LABELS[item])}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {/* Food Allergies card */}
        <View style={{
          backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="warning" size={16} color="#E04040" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>
              {t('editPreferences.foodAllergies')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ALLERGY_OPTIONS.map(item => {
              const selected = allergies.has(item);
              return (
                <Tap
                  key={item}
                  onPress={() => toggleAllergy(item)}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 50,
                    backgroundColor: selected ? '#FFF0EE' : Brand.card,
                    borderWidth: 1.5, borderColor: selected ? '#E04040' : '#DDD',
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                  }}
                >
                  {selected && <Text style={{ fontSize: 12 }}>🚫</Text>}
                  <Text style={{ color: selected ? '#E04040' : Brand.textPrimary, fontWeight: '600', fontSize: 15 }}>
                    {t(ALLERGY_LABELS[item])}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {/* Favorite Categories card — feeds personalized "Recommended For
            You" ranking */}
        {categoryOptions.length > 0 && (
          <View style={{
            backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 16,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
              {t('editPreferences.favoriteCategories')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {categoryOptions.map(item => {
                const selected = favoriteCategories.has(item);
                return (
                  <Tap
                    key={item}
                    onPress={() => toggleCategory(item)}
                    style={{
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 50,
                      backgroundColor: selected ? Brand.orange : Brand.card,
                      borderWidth: 1.5, borderColor: selected ? Brand.orange : '#DDD',
                      flexDirection: 'row', alignItems: 'center', gap: 6,
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
          </View>
        )}

        {/* Budget card */}
        <View style={{
          backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 1,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Brand.textSecondary }}>
              {t('onboarding.budget')}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.orange }}>
              ฿{budget >= 150 ? '150+' : budget}
            </Text>
          </View>
          <Slider
            minimumValue={30}
            maximumValue={150}
            step={10}
            value={budget}
            onValueChange={v => setBudget(Math.round(v))}
            minimumTrackTintColor={Brand.orange}
            maximumTrackTintColor="#E8E0D8"
            thumbTintColor={Brand.orange}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('onboarding.streetFood')}</Text>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('onboarding.premium')}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky save */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.bg, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
      }}>
        <Tap
          onPress={handleSave}
          disabled={saving || loading}
          style={{
            backgroundColor: Brand.orange, borderRadius: 50, paddingVertical: 16,
            alignItems: 'center', opacity: saving || loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {saving ? t('editPreferences.saving') : t('editPreferences.saveChanges')}
          </Text>
        </Tap>
      </View>
    </SafeAreaView>
  );
}
