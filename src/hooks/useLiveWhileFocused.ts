import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { startGuarded, type Cleanup } from '@/lib/focus-lifecycle';

/** Runs `start` on every focus and tears down on blur — including when the
 * blur lands before `start`'s async work finishes. Return a cleanup (e.g.
 * `() => supabase.removeChannel(channel)`) from `start`; check `isCancelled()`
 * before touching state after an await. See lib/focus-lifecycle.ts. */
export function useLiveWhileFocused(start: (isCancelled: () => boolean) => Promise<Cleanup | void>) {
  // Latest closure without re-running the effect (and re-subscribing) on
  // every render.
  const startRef = useRef(start);
  startRef.current = start;
  useFocusEffect(useCallback(() => startGuarded(isCancelled => startRef.current(isCancelled)), []));
}
