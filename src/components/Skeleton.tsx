import { View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

// Soft breathing opacity (Reanimated 4 CSS animation) — calmer than a shimmer
// sweep and costs nothing: opacity only, off the JS thread.
const BREATHE = {
  animationName: { from: { opacity: 1 }, to: { opacity: 0.45 } },
  animationDuration: '850ms',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
} as const;

// Neutral tint so the same bone reads on the student cream and the vendor/admin grey.
const BONE = 'rgba(38,24,18,0.07)';

export function Bone({ style }: { style?: ViewStyle }) {
  return <View style={[{ backgroundColor: BONE, borderRadius: 8 }, style]} />;
}

function Frame({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={[BREATHE, style]}>
      {children}
    </Animated.View>
  );
}

// Placeholder for any vertical list of rows (orders, stores, search, notifications…).
// `title` adds a heading bone for screens whose header isn't rendered while loading.
export function SkeletonList({ rows = 6, title = false, padded = true }: { rows?: number; title?: boolean; padded?: boolean }) {
  return (
    <Frame style={{ paddingHorizontal: padded ? 20 : 0, paddingTop: 12, gap: 14 }}>
      {title && <Bone style={{ width: '45%', height: 28, marginBottom: 10 }} />}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Bone style={{ width: 64, height: 64, borderRadius: 16 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone style={{ width: '70%', height: 14 }} />
            <Bone style={{ width: '40%', height: 12 }} />
          </View>
        </View>
      ))}
    </Frame>
  );
}

// Home feed: greeting, search bar, two horizontal card rows.
export function SkeletonHome() {
  return (
    <Frame style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      <Bone style={{ width: '60%', height: 32, marginBottom: 20 }} />
      <Bone style={{ height: 52, borderRadius: 26, marginBottom: 28 }} />
      {[0, 1].map(row => (
        <View key={row} style={{ marginBottom: 28 }}>
          <Bone style={{ width: '50%', height: 22, marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[0, 1, 2].map(i => <Bone key={i} style={{ width: 150, height: 210, borderRadius: 24 }} />)}
          </View>
        </View>
      ))}
    </Frame>
  );
}

// Item / store detail: full-bleed hero, title, a few lines.
export function SkeletonDetail({ heroHeight = 280 }: { heroHeight?: number }) {
  return (
    <Frame>
      <Bone style={{ height: heroHeight, borderRadius: 0 }} />
      <View style={{ padding: 20, gap: 12 }}>
        <Bone style={{ width: '70%', height: 26 }} />
        <Bone style={{ width: '35%', height: 16 }} />
        <Bone style={{ height: 14, marginTop: 12 }} />
        <Bone style={{ height: 14 }} />
        <Bone style={{ width: '80%', height: 14 }} />
      </View>
    </Frame>
  );
}
