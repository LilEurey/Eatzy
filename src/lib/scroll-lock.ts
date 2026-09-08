import { useSyncExternalStore } from 'react';

// A tiny module-level flag so a full-bleed interactive map (the vendor store
// location picker) can freeze the parent layout ScrollView while a finger is
// on it — otherwise a vertical pan/drag on the map gets stolen by the
// ScrollView. Mirrors the useSyncExternalStore pattern in cart-store.ts.

let locked = false;
const listeners = new Set<() => void>();

export function setScrollLocked(next: boolean) {
  if (next === locked) return;
  locked = next;
  listeners.forEach(l => l());
}

export function useScrollLocked() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => locked,
    () => locked,
  );
}
