import { View, TouchableOpacity, Text } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useCart, cartCount } from '@/lib/cart-store';
import { useI18n } from '@/lib/i18n';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  return (
    <Ionicons
      name={name}
      size={24}
      color={focused ? Brand.orange : '#C4B8AE'}
    />
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  const count = cartCount(useCart());
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: Brand.border,
            borderTopWidth: 1,
            height: 80,
            paddingBottom: 16,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Brand.orange,
          tabBarInactiveTintColor: '#C4B8AE',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: t('tabs.orders'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'receipt' : 'receipt-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: t('tabs.wallet'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'wallet' : 'wallet-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
            ),
          }}
        />
      </Tabs>

      {/* Floating cart button — only when cart has items */}
      {count > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/cart')}
          style={{
            position: 'absolute',
            bottom: 90,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: Brand.orange,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: Brand.orange,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Text style={{ fontSize: 22 }}>🛒</Text>
          <View style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
            backgroundColor: '#fff', borderWidth: 2, borderColor: Brand.orange,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: Brand.orange }}>{count}</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
