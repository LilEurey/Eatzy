import Animated, {
  Extrapolation, FadeInDown, FadeInRight, FadeOut, LinearTransition,
  ZoomIn, ZoomOut, cubicBezier, interpolate, useAnimatedRef, useAnimatedStyle, useScrollOffset,
} from 'react-native-reanimated';

// Shared motion tokens — one spring feel across the app.
export const STAGGER_MS = 45;

// Reanimated 4 merges a partial spring config into its own default (mass 4,
// stiffness 900), so a bare `.springify().damping(18)` is a ~0.15 damping
// ratio and visibly wobbles. Always go through these so all three are set.
// Settle: ~0.9 damping ratio — lands once, no ringing.
const MASS = 1, STIFFNESS = 180, DAMPING = 24;

// Fade-up entrance for headings, sections and anything that isn't a list row.
export const enterUp = (delayMs = 0) => 
  FadeInDown.delay(delayMs).springify().mass(MASS).stiffness(STIFFNESS).damping(DAMPING);
// Staggered list entrance shared by every list screen. Delay caps at the 6th
// row so long lists don't make the user wait for the bottom to appear.
export const listEnter = (index: number) => enterUp(Math.min(index, 6) * STAGGER_MS);
// Same cascade for horizontal card rows.
export const rowEnter = (index: number) => 
  FadeInRight.delay(Math.min(index, 5) * STAGGER_MS).springify().mass(MASS).stiffness(STIFFNESS).damping(DAMPING);
// Pair with listEnter on lists whose rows can disappear (cart, realtime).
export const listExit = FadeOut.duration(160);
export const listLayout = LinearTransition.springify().mass(MASS).stiffness(STIFFNESS).damping(DAMPING);

// Badges, checkmarks, the cart button: one small overshoot (~0.55 ratio).
export const popIn = ZoomIn.springify().mass(1).stiffness(260).damping(18);
export const popOut = ZoomOut.duration(120);

// Decelerating curve for CSS animations/transitions (bars growing, stars
// lighting) — fast start, long soft landing.
export const EASE_OUT = cubicBezier(0.32, 0.72, 0, 1);

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
