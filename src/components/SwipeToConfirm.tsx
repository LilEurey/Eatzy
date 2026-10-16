import { useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { Brand } from '@/constants/theme';

const HEIGHT = 60;
const PAD = 5;
const KNOB = HEIGHT - PAD * 2;

// Swipe-to-confirm for irreversible actions: an accidental tap can't fire it.
// Screen readers can't swipe, so the 'activate' accessibility action confirms directly.
export function SwipeToConfirm({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> | void }) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const max = Math.max(width - KNOB - PAD * 2, 1);

  async function confirm() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onConfirm();
    x.value = withSpring(0); // back to rest if the action failed and the screen stayed
  }

  const pan = Gesture.Pan()
    .onChange((e) => { x.value = Math.min(Math.max(x.value + e.changeX, 0), max); })
    .onEnd(() => {
      if (x.value > max * 0.5) {
        x.value = withTiming(max, { duration: 120 });
        scheduleOnRN(confirm);
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD * 2 }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, max * 0.4], [1, 0], 'clamp') }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={confirm}
      style={{ height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: Brand.orange, justifyContent: 'center', overflow: 'hidden' }}
    >
      {/* darker trail behind the knob shows progress */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: HEIGHT / 2, backgroundColor: 'rgba(0,0,0,0.12)' }, fillStyle]} />
      <Animated.Text style={[{ position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' }, labelStyle]}>
        {label}
      </Animated.Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          hitSlop={8}
          style={[{
            width: KNOB, height: KNOB, borderRadius: KNOB / 2, marginLeft: PAD, backgroundColor: '#fff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
          }, knobStyle]}
        >
          <Text style={{ color: Brand.orange, fontSize: 22, fontWeight: '800', marginLeft: 2 }}>»</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
