import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '@/constants/theme';

export default function WalletScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: Brand.textPrimary }}>
          Campus Wallet
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Brand.textSecondary }}>฿0.00</Text>
      </View>
    </SafeAreaView>
  );
}
