import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';

// Index 1–5 maps to a star score; index 0 has no label (nothing selected yet).
const LABEL_KEYS: (TranslationKey | null)[] = [
  null, 'rate.labelBad', 'rate.labelMeh', 'rate.labelGood', 'rate.labelGreat', 'rate.labelAmazing',
];

type RateOrder = { id: string; vendor_name: string; item_names: string[]; primary_menu_item_id: string | null };

export default function RateScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<RateOrder | null | undefined>(undefined);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select('id,vendors(name),order_items(menu_item_id,menu_items(name))')
        .eq('id', id)
        .maybeSingle();
      if (!data) { setOrder(null); return; }
      const orderItems = (data as any).order_items ?? [];
      setOrder({
        id: data.id,
        vendor_name: (data as any).vendors?.name ?? '',
        item_names: orderItems.map((oi: any) => oi.menu_items?.name ?? ''),
        primary_menu_item_id: orderItems[0]?.menu_item_id ?? null,
      });
    }
    void load();
  }, [id]);

  if (order === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <Tap onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </Tap>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🧾</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>{t('common.orderNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vendor = order.vendor_name;

  async function submit() {
    if (!order?.primary_menu_item_id) return;
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const { error } = await supabase.from('ratings').insert({
      user_id: user.id,
      menu_item_id: order.primary_menu_item_id,
      order_id: order.id,
      score,
      comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      showAlert(t('common.orderNotFound'), error.message);
      return;
    }
    showAlert(t('rate.thanksTitle'), t('rate.thanksMsg', { vendor, score }), () =>
      router.replace('/(tabs)/orders'),
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('rate.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        {/* Vendor + items */}
        <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 28 }}>
          <Text style={{ fontSize: 44, marginBottom: 8 }}>🍽️</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: Brand.textPrimary }}>{vendor}</Text>
          <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 4, textAlign: 'center' }}>
            {order.item_names.join(', ')}
          </Text>
        </View>

        {/* Stars */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <Tap key={n} onPress={() => setScore(n)} activeOpacity={0.7}>
                <Text style={{ fontSize: 40, opacity: n <= score ? 1 : 0.25 }}>⭐</Text>
              </Tap>
            ))}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.orange, height: 22, marginTop: 10 }}>
            {LABEL_KEYS[score] ? t(LABEL_KEYS[score]!) : ''}
          </Text>
        </View>

        {/* Comment */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10, marginTop: 16 }}>
          {t('rate.commentLabel')}
        </Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('rate.commentPlaceholder')}
          placeholderTextColor={Brand.textSecondary}
          multiline
          style={{
            backgroundColor: Brand.card, borderRadius: 16, padding: 16,
            fontSize: 15, color: Brand.textPrimary, minHeight: 100, textAlignVertical: 'top',
            borderWidth: 1, borderColor: Brand.border,
          }}
        />
      </ScrollView>

      {/* Sticky submit */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: Brand.border,
      }}>
        <Tap
          activeOpacity={0.85}
          disabled={score === 0 || submitting || !order.primary_menu_item_id}
          onPress={submit}
          style={{
            backgroundColor: score === 0 ? Brand.border : Brand.orange,
            borderRadius: 16, paddingVertical: 16, alignItems: 'center',
          }}
        >
          <Text style={{ color: score === 0 ? Brand.textSecondary : '#fff', fontSize: 16, fontWeight: '700' }}>
            {t('rate.submit')}
          </Text>
        </Tap>
      </View>
    </SafeAreaView>
  );
}
