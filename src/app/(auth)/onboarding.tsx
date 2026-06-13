import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';

const DIETARY_OPTIONS = ['Halal', 'Vegetarian', 'Jay'] as const;
type Dietary = (typeof DIETARY_OPTIONS)[number];

const ALLERGY_OPTIONS = ['Peanuts', 'Dairy', 'Gluten', 'Seafood', 'Beef', 'Egg', 'Other...'] as const;
type Allergy = (typeof ALLERGY_OPTIONS)[number];

export default function OnboardingScreen() {
  const [dietary, setDietary] = useState<Set<Dietary>>(new Set());
  const [allergies, setAllergies] = useState<Set<Allergy>>(new Set());
  const [budget, setBudget] = useState(60);
  const [saving, setSaving] = useState(false);

  function toggleDietary(item: Dietary) {
    setDietary(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  }

  function toggleAllergy(item: Allergy) {
    setAllergies(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  }

  async function handleSkip() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('user_preferences').upsert({ user_id: user.id });
    } catch {}
    router.replace('/(tabs)');
    setSaving(false);
  }

  async function handleContinue() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        is_halal: dietary.has('Halal'),
        is_vegetarian: dietary.has('Vegetarian'),
        is_jay: dietary.has('Jay'),
        allergies: [...allergies]
          .filter(a => a !== 'Other...')
          .map(a => a.toLowerCase()),
        budget_max: budget >= 150 ? null : budget,
      });
      if (error) throw error;
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error saving preferences', e.message);
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
        <TouchableOpacity onPress={handleSkip} disabled={saving}>
          <Text style={{ color: Brand.orange, fontWeight: '600', fontSize: 15 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={{ marginTop: 20, marginBottom: 36 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary }}>
            Personalize your plate
          </Text>
          <Text style={{ fontSize: 22 }}>🥗</Text>
          <Text style={{ color: Brand.textSecondary, fontSize: 15, marginTop: 8, lineHeight: 22 }}>
            Tell us what you like, and we'll handle{'\n'}the rest.
          </Text>
        </View>

        {/* Dietary Preferences */}
        <View style={{ marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: Brand.textSecondary,
              marginBottom: 14,
            }}
          >
            DIETARY PREFERENCES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DIETARY_OPTIONS.map(item => {
              const selected = dietary.has(item);
              return (
                <TouchableOpacity
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
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Allergies */}
        <View style={{ marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: Brand.textSecondary,
              marginBottom: 14,
            }}
          >
            ALLERGIES & AVOIDANCES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ALLERGY_OPTIONS.map(item => {
              const selected = allergies.has(item);
              return (
                <TouchableOpacity
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
                  {selected && <Text style={{ fontSize: 12 }}>🚫</Text>}
                  <Text
                    style={{
                      color: selected ? '#E04040' : Brand.textPrimary,
                      fontWeight: '600',
                      fontSize: 15,
                    }}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Budget */}
        <View>
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
              TYPICAL MEAL BUDGET
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.orange }}>
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
                Street Food (฿30)
              </Text>
              <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>
                Premium (฿150+)
              </Text>
            </View>
          </View>
        </View>
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
        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving}
          style={{
            backgroundColor: Brand.orange,
            borderRadius: 50,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {saving ? 'Saving…' : 'Continue'}
          </Text>
          <Text style={{ color: '#fff', fontSize: 16 }}>→</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
