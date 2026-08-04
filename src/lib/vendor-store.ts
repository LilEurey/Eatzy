import { useSyncExternalStore } from 'react';
import {
  MOCK_VENDOR_SESSION,
  getMenuItemsByVendor,
  getOrdersByVendor,
} from '@/lib/mock-data';

// Mutable vendor-side state (orders, menu, store-open). Lives at module scope so it
// survives Expo Router unmounting screens on navigation — same pattern as cart-store.ts.

type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';
type MenuItem = ReturnType<typeof getMenuItemsByVendor>[number];
type OrderItem = ReturnType<typeof getOrdersByVendor>[number]['items'][number] & { done: boolean };
type VendorOrder = Omit<ReturnType<typeof getOrdersByVendor>[number], 'items' | 'status'> & {
  items: OrderItem[];
  status: OrderStatus;
};

const vendorId = MOCK_VENDOR_SESSION.vendorId;

let menuItems: MenuItem[] = getMenuItemsByVendor(vendorId);
let orders: VendorOrder[] = getOrdersByVendor(vendorId).map(o => ({
  ...o,
  items: o.items.map(i => ({ ...i, done: false })),
}));
let storeOpen = true;

const listeners = new Set<() => void>();
function emit() {
  menuItems = [...menuItems];
  orders = [...orders];
  listeners.forEach(l => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ─── Orders ─────────────────────────────────────────────────────────────────

// ponytail: update orders.status via Supabase RPC/update on accept.
export function acceptOrder(id: string) {
  const o = orders.find(o => o.id === id);
  if (o) o.status = 'accepted';
  emit();
}

// ponytail: update orders.status via Supabase RPC/update on reject (also triggers refund).
export function rejectOrder(id: string) {
  const o = orders.find(o => o.id === id);
  if (o) o.status = 'rejected';
  emit();
}

// ponytail: update orders.status via Supabase RPC/update when marking ready.
export function markReady(id: string) {
  const o = orders.find(o => o.id === id);
  if (o) o.status = 'ready';
  emit();
}

// ponytail: update orders.status via Supabase RPC/update on hand-off.
export function handOff(id: string) {
  const o = orders.find(o => o.id === id);
  if (o) o.status = 'completed';
  emit();
}

// ponytail: local prep checklist only — no order_items column for this today.
export function toggleItemDone(orderId: string, index: number) {
  const o = orders.find(o => o.id === orderId);
  if (o?.items[index]) o.items[index].done = !o.items[index].done;
  emit();
}

export function useVendorOrders() {
  return useSyncExternalStore(subscribe, () => orders, () => orders);
}

// ─── Menu ───────────────────────────────────────────────────────────────────

// ponytail: update menu_items.is_available via Supabase update.
export function toggleAvailability(itemId: string) {
  const item = menuItems.find(i => i.id === itemId);
  if (item) item.is_available = !item.is_available;
  emit();
}

// ponytail: insert into menu_items via Supabase.
export function addMenuItem(item: MenuItem) {
  menuItems = [item, ...menuItems];
  emit();
}

export function useVendorMenu() {
  return useSyncExternalStore(subscribe, () => menuItems, () => menuItems);
}

// ─── Store status ───────────────────────────────────────────────────────────

// ponytail: update vendors.is_open via Supabase update.
export function setStoreOpen(open: boolean) {
  storeOpen = open;
  emit();
}

export function useStoreOpen() {
  return useSyncExternalStore(subscribe, () => storeOpen, () => storeOpen);
}

// ─── Derived: payments / finance ───────────────────────────────────────────

export type VendorPayment = {
  order_id: string;
  display_id: string;
  created_at: string;
  amount: number;
  method: string;
  status: 'COMPLETED';
};

export function getVendorPayments(): VendorPayment[] {
  return orders
    .filter(o => o.status === 'accepted' || o.status === 'ready' || o.status === 'completed')
    .map(o => ({
      order_id: o.id,
      display_id: `#ORD-${o.id.toUpperCase()}`,
      created_at: o.created_at,
      amount: o.total_amount,
      method: o.payment_method,
      status: 'COMPLETED' as const,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
