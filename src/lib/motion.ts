import Animated, {
  Extrapolation, FadeInDown, FadeOut, LinearTransition, interpolate,
  useAnimatedRef, useAnimatedStyle, useScrollOffset,
} from 'react-native-reanimated';

// Shared motion tokens — one spring feel across the app.
export const SPRING_DAMPING = 18;
export const STAGGER_MS = 60;

// Staggered list entrance shared by every list screen. Delay caps at the 8th
// row so long lists don't make the user wait for the bottom to appear.
export const listEnter = (index: number) =>
  FadeInDown.delay(Math.min(index, 8) * STAGGER_MS).springify().damping(SPRING_DAMPING);
// Pair with listEnter on lists whose rows can disappear (cart, realtime).
export const listExit = FadeOut.duration(160);
export const listLayout = LinearTransition.springify().damping(SPRING_DAMPING);

// Hero image that stretches on pull-down and parallaxes (scrolls at half
// speed) going up. Attach `ref` to an Animated.ScrollView and `heroStyle` to
// an absolutely-filled layer inside the hero.
export function useStretchyHero(height: number) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(ref);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: offset.value / 2 },
      { scale: interpolate(offset.value, [-height, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));
  return { ref, heroStyle };
}
