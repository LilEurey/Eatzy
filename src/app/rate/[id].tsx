import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { getOrderById, getVendorName } from '@/lib/mock-data';
import { showAlert } from '@/lib/alert';

const LABELS = ['', 'Bad', 'Meh', 'Good', 'Great', 'Amazing'];

export default function RateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = getOrderById(id);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🧾</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vendor = getVendorName(order.vendor_id);

  function submit() {
    // ponytail: no persistence yet — insert into ratings table when the DB is live.
    showAlert('Thanks for the feedback!', `You rated ${vendor} ${score}★.`, () =>
      router.replace('/(tabs)/orders'),
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>Rate Order</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        {/* Vendor + items */}
        <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 28 }}>
          <Text style={{ fontSize: 44, marginBottom: 8 }}>🍽️</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: Brand.textPrimary }}>{vendor}</Text>
          <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 4, textAlign: 'center' }}>
            {order.items.map(i => i.name).join(', ')}
          </Text>
        </View>

        {/* Stars */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setScore(n)} activeOpacity={0.7}>
                <Text style={{ fontSize: 40, opacity: n <= score ? 1 : 0.25 }}>⭐</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.orange, height: 22, marginTop: 10 }}>
            {LABELS[score]}
          </Text>
        </View>

        {/* Comment */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10, marginTop: 16 }}>
          COMMENT (OPTIONAL)
        </Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Tell others what you thought…"
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
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={score === 0}
          onPress={submit}
          style={{
            backgroundColor: score === 0 ? Brand.border : Brand.orange,
            borderRadius: 16, paddingVertical: 16, alignItems: 'center',
          }}
        >
          <Text style={{ color: score === 0 ? Brand.textSecondary : '#fff', fontSize: 16, fontWeight: '700' }}>
            Submit Rating
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
