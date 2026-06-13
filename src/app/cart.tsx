import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';

export default function CartScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 24, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Brand.orange, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>
          Your Cart
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Brand.textSecondary }}>Your cart is empty</Text>
      </View>
    </SafeAreaView>
  );
}
