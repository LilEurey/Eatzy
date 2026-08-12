import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TapProps = Omit<PressableProps, 'style'> & {
  /** Opacity reached at full press, matching TouchableOpacity's activeOpacity. */
  activeOpacity?: number;
  /** Light haptic tick on press-in. On by default; turn off for rapid-fire controls (steppers, chips). */
  haptic?: boolean;
  style?: PressableProps['style'];
};

// Drop-in TouchableOpacity replacement: adds a fast scale + opacity press response
// (GPU-only transform/opacity, off the JS thread) plus a light haptic tick, so every
// tap in the app feels acknowledged instead of relying on the default's abrupt opacity snap.
export const Tap = forwardRef<View, TapProps>(function Tap(
  { activeOpacity = 0.9, haptic = true, disabled, onPressIn, onPressOut, style, ...rest },
  ref
) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - activeOpacity),
    transform: [{ scale: 1 - pressed.value * 0.04 }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) });
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
        onPressOut?.(e);
      }}
      style={[style as object, animatedStyle]}
      {...rest}
    />
  );
});
