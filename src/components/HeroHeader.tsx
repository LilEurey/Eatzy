import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';

// Pinned header for hero screens (item, store). The back button stays put while
// the page scrolls; the title bar behind it fades in once the hero is nearly
// gone (`barStyle` from useStretchyHero). Render after the ScrollView.
export function HeroHeader({ title, barStyle }: { title: string; barStyle: AnimatedStyle<ViewStyle> }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top, left: 0, right: 0, height: 72, pointerEvents: 'box-none' }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, {
          pointerEvents: 'none', backgroundColor: Brand.bg,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.border,
          alignItems: 'center', justifyContent: 'center', paddingHorizontal: 68,
        }, barStyle]}
      >
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>{title}</Text>
      </Animated.View>
      <Tap
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={{
          position: 'absolute', top: 16, left: 16,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.9)',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
        }}
      >
        <Text style={{ fontSize: 18, color: Brand.textPrimary }}>←</Text>
      </Tap>
    </View>
  );
}
