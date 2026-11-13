import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

// Number that eases from its previous value to the new one (wallet balance).
// JS-driven: it's one Text re-rendering ~40 times, cheaper than a TextInput hack.
// Jumps straight to the value when the OS "Reduce Motion" setting is on.
export function CountUp({ value, format, duration = 700, ...rest }: TextProps & {
  value: number; format: (n: number) => string; duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      from.current = value;
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let frame: number;
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const v = begin + (value - begin) * (1 - Math.pow(1 - p, 3)); // ease-out cubic
      setShown(v);
      from.current = v;
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  return <Text {...rest}>{format(reduceMotion ? value : shown)}</Text>;
}
