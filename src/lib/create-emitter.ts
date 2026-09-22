// Shared listener-set plumbing for the module-level stores (cart-store,
// vendor-store, usePreferences) that back useSyncExternalStore with plain
// module state instead of a state library. Each store still owns its own
// state variables and emit() — this is only the Set<fn> + forEach part.
export function createEmitter() {
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit(): void {
      listeners.forEach(l => l());
    },
  };
}
