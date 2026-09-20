// "Load, then subscribe while focused, then clean up" — the shared lifecycle
// behind every live student screen. Framework-free so it stays unit-testable
// (see hooks/useLiveWhileFocused.ts for the React binding).
//
// The bug this exists for: a screen's start work is async (getUser, fetch…)
// and only *then* creates its Realtime channel. If the tab blurs first, the
// naive `return () => { if (channel) removeChannel(channel) }` cleanup runs
// while `channel` is still undefined, and the channel is created afterwards
// and never removed. Here, a cleanup that arrives after stop() runs at once.

export type Cleanup = () => void;

/** Runs `start`; returns `stop`. `start` gets an `isCancelled()` to bail out
 * of stale async work and may resolve to a cleanup (e.g. removeChannel) —
 * run on stop(), or immediately if stop() already happened. Errors thrown by
 * `start` are left to surface as unhandled rejections, as they did before. */
export function startGuarded(start: (isCancelled: () => boolean) => Promise<Cleanup | void>): Cleanup {
  let cancelled = false;
  let cleanup: Cleanup | void;
  void start(() => cancelled).then(result => {
    if (cancelled) result?.();
    else cleanup = result;
  });
  return () => {
    cancelled = true;
    cleanup?.();
    cleanup = undefined;
  };
}
