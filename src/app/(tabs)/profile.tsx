import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';

export default function ProfileScreen() {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: Brand.textPrimary }}>
          Profile
        </Text>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            onPress={signOut}
            style={{
              borderWidth: 1.5,
              borderColor: Brand.orange,
              borderRadius: 50,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: Brand.orange, fontWeight: '600', fontSize: 15 }}>
              → Logout
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
