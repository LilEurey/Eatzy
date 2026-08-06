import { useSyncExternalStore } from 'react';

// Minimal cross-screen cart. No dependency — module-level state + useSyncExternalStore.
// ponytail: single active vendor per cart; adding from another vendor replaces it.
// Multi-vendor carts would need per-vendor grouping — add when checkout supports it.

const PACKAGING_FEE = 5;

type CartItem = {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
};

type Cart = {
  vendor_id: string | null;
  items: CartItem[];
  packaging_fee: number;
};

let cart: Cart = { vendor_id: null, items: [], packaging_fee: PACKAGING_FEE };

const listeners = new Set<() => void>();
function emit() {
  cart = { ...cart, items: [...cart.items] }; // new refs so useSyncExternalStore re-renders
  listeners.forEach(l => l());
}

export function addToCart(
  item: { id: string; vendor_id: string; name: string; price: number },
  qty = 1,
) {
  if (cart.vendor_id && cart.vendor_id !== item.vendor_id) {
    cart.items = []; // switching vendors clears the cart
  }
  cart.vendor_id = item.vendor_id;

  const existing = cart.items.find(i => i.menu_item_id === item.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.push({ menu_item_id: item.id, name: item.name, unit_price: item.price, quantity: qty });
  }
  emit();
}

export function setQty(menuItemId: string, delta: number) {
  const it = cart.items.find(i => i.menu_item_id === menuItemId);
  if (!it) return;
  it.quantity += delta;
  cart.items = cart.items.filter(i => i.quantity > 0);
  if (cart.items.length === 0) cart.vendor_id = null;
  emit();
}

export function clearCart() {
  cart = { vendor_id: null, items: [], packaging_fee: PACKAGING_FEE };
  emit();
}

export function cartSubtotal(c: Cart) {
  return c.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
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
