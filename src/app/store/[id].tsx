import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Brand } from '@/constants/theme';

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>
          Store Detail
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40 }}>🏪</Text>
        <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>Coming in Phase 4</Text>
        <Text style={{ color: Brand.textSecondary, fontSize: 12, marginTop: 4 }}>ID: {id}</Text>
      </View>
    </SafeAreaView>
  );
}
