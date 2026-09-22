import { useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

type CancelCell = { current: boolean };

export interface FocusGuard {
  /** Cancelled status of whichever focus cycle is currently active/most recent. */
  readonly current: boolean;
  /**
   * Call once, synchronously, at the top of a `useFocusEffect` callback that
   * re-runs its fetch on every focus, and check the returned cell instead of
   * `.current` directly. `.current` always reflects the *latest* cycle, so a
   * stale fetch from cycle N would read a reset-to-false `.current` once
   * cycle N+1 starts (blur then quick refocus, cycle N's fetch still
   * in-flight). `snapshot()` binds the check to cycle N's own cell, which
   * only that cycle's cleanup ever sets to true.
   */
  snapshot(): CancelCell;
}

export function useFocusGuard(): FocusGuard {
  const activeCell = useRef<CancelCell>({ current: true });

  useFocusEffect(
    useCallback(() => {
      const cell: CancelCell = { current: false };
      activeCell.current = cell;
      return () => { cell.current = true; };
    }, [])
  );

  return useMemo<FocusGuard>(() => ({
    get current() { return activeCell.current.current; },
    snapshot() { return activeCell.current; },
  }), []);
}
