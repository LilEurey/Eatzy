import { useSyncExternalStore } from 'react';
import { createEmitter } from '@/lib/create-emitter';

// Minimal cross-screen cart. No dependency — module-level state + useSyncExternalStore.
// Multi-store: each line carries its vendor_id; checkout splits into one
// order per stall via place_orders() (all or nothing).

export type CartAddon = {
  id: string;
  name: string;
  name_th: string | null;
  price: number;
  allergens: string[]; // option's own allergen tags — folded into the cart-screen / checkout warning
};

type CartItem = {
  // Lines are keyed by line_id, not menu_item_id: the same dish with two
  // different add-on selections must coexist as two lines. line_id is a
  // module counter (RN has no reliable crypto.randomUUID).
  line_id: string;
  vendor_id: string;
  menu_item_id: string;
  name: string;
  name_th: string | null;
  unit_price: number; // bare menu price; add-ons are priced separately
  quantity: number;
  addons: CartAddon[];
  allergens: string[]; // base dish's allergen tags, snapshotted so the cart doesn't re-query
  note: string; // free-text message to the kitchen; '' means none
};

export const NOTE_MAX = 200;

export type CartLine = CartItem;

type Cart = {
  items: CartItem[];
};

let cart: Cart = { items: [] };
let lineSeq = 0;

const emitter = createEmitter();
function emit() {
  cart = { ...cart, items: [...cart.items] }; // new refs so useSyncExternalStore re-renders
  emitter.emit();
}

// Two lines stack (quantity +) only when they're the same dish, the same
// set of add-ons AND the same kitchen note; any difference makes a new line.
function configSignature(menuItemId: string, addons: CartAddon[], note: string) {
  return `${menuItemId}|${addons.map(a => a.id).sort().join(',')}|${note}`;
}

export function addToCart(
  item: { id: string; vendor_id: string; name: string; name_th?: string | null; price: number; allergens?: string[] },
  qty = 1,
  addons: CartAddon[] = [],
  note = '',
) {
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
      vendor_id: item.vendor_id,
      menu_item_id: item.id,
      name: item.name,
      name_th: item.name_th ?? null,
      unit_price: item.price,
      quantity: qty,
      addons,
      allergens: item.allergens ?? [],
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
  emit();
}

export function clearCart() {
  cart = { items: [] };
  emit();
}

/** Per-line price incl. add-ons, before quantity. */
export function lineUnitTotal(i: { unit_price: number; addons: CartAddon[] }) {
  return i.unit_price + i.addons.reduce((sum, a) => sum + a.price, 0);
}

/** Lines grouped by stall, in first-added order — one checkout order per group. */
export function groupByVendor<T extends { vendor_id: string }>(items: T[]): { vendor_id: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const i of items) groups.set(i.vendor_id, [...(groups.get(i.vendor_id) ?? []), i]);
  return [...groups].map(([vendor_id, items]) => ({ vendor_id, items }));
}

export function cartSubtotal(c: { items: { unit_price: number; addons: CartAddon[]; quantity: number }[] }) {
  return c.items.reduce((sum, i) => sum + lineUnitTotal(i) * i.quantity, 0);
}

export function cartCount(c: Cart) {
  return c.items.reduce((sum, i) => sum + i.quantity, 0);
}

export function useCart() {
  return useSyncExternalStore(emitter.subscribe, () => cart, () => cart);
}
