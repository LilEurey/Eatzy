import { useSyncExternalStore } from 'react';

// Minimal cross-screen cart. No dependency — module-level state + useSyncExternalStore.
// ponytail: single active vendor per cart; adding from another vendor replaces it.
// Multi-vendor carts would need per-vendor grouping — add when checkout supports it.

export type CartAddon = {
  id: string;
  name: string;
  name_th: string | null;
  price: number;
};

type CartItem = {
  // Lines are keyed by line_id, not menu_item_id: the same dish with two
  // different add-on selections must coexist as two lines. line_id is a
  // module counter (RN has no reliable crypto.randomUUID).
  line_id: string;
  menu_item_id: string;
  name: string;
  name_th: string | null;
  unit_price: number; // bare menu price; add-ons are priced separately
  quantity: number;
  addons: CartAddon[];
  note: string; // free-text message to the kitchen; '' means none
};

export const NOTE_MAX = 200;

type Cart = {
  vendor_id: string | null;
  items: CartItem[];
};

let cart: Cart = { vendor_id: null, items: [] };
let lineSeq = 0;

const listeners = new Set<() => void>();
function emit() {
  cart = { ...cart, items: [...cart.items] }; // new refs so useSyncExternalStore re-renders
  listeners.forEach(l => l());
}

// Two lines stack (quantity +) only when they're the same dish, the same
// set of add-ons AND the same kitchen note; any difference makes a new line.
function configSignature(menuItemId: string, addons: CartAddon[], note: string) {
  return `${menuItemId}|${addons.map(a => a.id).sort().join(',')}|${note}`;
}

export function addToCart(
  item: { id: string; vendor_id: string; name: string; name_th?: string | null; price: number },
  qty = 1,
  addons: CartAddon[] = [],
  note = '',
) {
  if (cart.vendor_id && cart.vendor_id !== item.vendor_id) {
    cart.items = []; // switching vendors clears the cart
  }
  cart.vendor_id = item.vendor_id;

  const trimmedNote = note.trim().slice(0, NOTE_MAX);
  const sig = configSignature(item.id, addons, trimmedNote);
  const existing = cart.items.find(
    i => configSignature(i.menu_item_id, i.addons, i.note) === sig,
  );
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.push({
      line_id: `l${++lineSeq}`,
      menu_item_id: item.id,
      name: item.name,
      name_th: item.name_th ?? null,
      unit_price: item.price,
      quantity: qty,
      addons,
      note: trimmedNote,
    });
  }
  emit();
}

export function setNote(lineId: string, note: string) {
  const it = cart.items.find(i => i.line_id === lineId);
  if (!it) return;
  it.note = note.slice(0, NOTE_MAX);
  emit();
}

export function setQty(lineId: string, delta: number) {
  const it = cart.items.find(i => i.line_id === lineId);
  if (!it) return;
  it.quantity += delta;
  cart.items = cart.items.filter(i => i.quantity > 0);
  if (cart.items.length === 0) cart.vendor_id = null;
  emit();
}

export function clearCart() {
  cart = { vendor_id: null, items: [] };
  emit();
}

/** Per-line price incl. add-ons, before quantity. */
export function lineUnitTotal(i: { unit_price: number; addons: CartAddon[] }) {
  return i.unit_price + i.addons.reduce((sum, a) => sum + a.price, 0);
}

export function cartSubtotal(c: Cart) {
  return c.items.reduce((sum, i) => sum + lineUnitTotal(i) * i.quantity, 0);
}

export function cartCount(c: Cart) {
  return c.items.reduce((sum, i) => sum + i.quantity, 0);
}

export function useCart() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cart,
    () => cart,
  );
}
