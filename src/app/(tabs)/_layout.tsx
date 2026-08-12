import { View, Text } from 'react-native';
import { Tap } from '@/components/Tap';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
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

// Exact path from the Figma export — a dark stroked outline reads clearly
// against the orange circle; the 🛒 emoji it replaced renders with its own
// built-in colors on most platforms and all but disappears on orange.
function CartIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40.1667 38.5" fill="none">
      <Path
        d="M1.75 1.75H8.41667L12.8833 24.0667C13.0357 24.834 13.4532 25.5233 14.0626 26.0138C14.672 26.5044 15.4345 26.765 16.2167 26.75H32.4167C33.1988 26.765 33.9614 26.5044 34.5708 26.0138C35.1802 25.5233 35.5976 24.834 35.75 24.0667L38.4167 10.0833H10.0833M16.75 35.0833C16.75 36.0038 16.0038 36.75 15.0833 36.75C14.1629 36.75 13.4167 36.0038 13.4167 35.0833C13.4167 34.1629 14.1629 33.4167 15.0833 33.4167C16.0038 33.4167 16.75 34.1629 16.75 35.0833ZM35.0833 35.0833C35.0833 36.0038 34.3371 36.75 33.4167 36.75C32.4962 36.75 31.75 36.0038 31.75 35.0833C31.75 34.1629 32.4962 33.4167 33.4167 33.4167C34.3371 33.4167 35.0833 34.1629 35.0833 35.0833Z"
        stroke="#1E1E1E"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
        <Tap
          onPress={() => router.push('/cart')}
          style={{
            position: 'absolute',
            bottom: 90,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#FE6B00',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#FE6B00',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <CartIcon size={22} />
          <View style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
            backgroundColor: '#fff', borderWidth: 2, borderColor: '#FE6B00',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#FE6B00' }}>{count}</Text>
          </View>
        </Tap>
      )}
    </View>
  );
}
