import { useState } from 'react';
import { useIsFocused } from 'expo-router';

/**
 * Counter that bumps each time the tab regains focus. Tab screens stay
 * mounted, and Reanimated `entering` only runs on mount — key the animated
 * content with this so the entrance replays on every tab visit.
 * useIsFocused (not useFocusEffect) so returning from a pushed screen
 * (item, cart) doesn't replay it — only a real tab switch does.
 */
export function useFocusKey(): number {
  const focused = useIsFocused();
  const [prev, setPrev] = useState(focused);
  const [key, setKey] = useState(0);
  if (focused !== prev) {
    setPrev(focused);
    if (focused) setKey(k => k + 1);
  }
  return key;
}
