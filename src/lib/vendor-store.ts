import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alert';

// Vendor-side state — orders, menu, store-open — backed by real Supabase
// queries + Realtime, scoped to whichever vendor the signed-in user owns.
// Module-level state + useSyncExternalStore (mirrors cart-store.ts) so it
// survives Expo Router unmounting screens on navigation.

export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';

type VendorProfile = {
  id: string;
  name: string;
  estimated_wait_min: number;
  current_queue_count: number;
};

export type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  spice_level: number;
  is_available: boolean;
  is_halal: boolean;
  allergens: string[];
  image_url: string | null;
  preparation_time_min: number | null;
};

type OrderItem = { menu_item_id: string; name: string; quantity: number; unit_price: number; done: boolean };
export type VendorOrder = {
  id: string;
  queue_number: number | null;
  status: OrderStatus;
  total_amount: number;
  pickup_start: string | null;
  payment_method: string;
  created_at: string;
  prep_seconds: number | null;
  special_request: string | null;
  items: OrderItem[];
};

let vendorProfile: VendorProfile | null = null;
let storeOpen = false;
let loading = true;
let menuItems: MenuItem[] = [];
let orders: VendorOrder[] = [];
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

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

export function useVendorProfile() { return useSyncExternalStore(subscribe, () => vendorProfile, () => vendorProfile); }
export function useVendorLoading() { return useSyncExternalStore(subscribe, () => loading, () => loading); }
export function useVendorOrders() { return useSyncExternalStore(subscribe, () => orders, () => orders); }
export function useVendorMenu() { return useSyncExternalStore(subscribe, () => menuItems, () => menuItems); }
export function useStoreOpen() { return useSyncExternalStore(subscribe, () => storeOpen, () => storeOpen); }

function mapOrder(row: any): VendorOrder {
  const items: OrderItem[] = (row.order_items ?? []).map((oi: any) => ({
    menu_item_id: oi.menu_item_id,
    name: oi.menu_items?.name ?? '',
    quantity: oi.quantity,
    unit_price: oi.unit_price,
    done: false,
  }));
  const specialNotes = (row.order_items ?? [])
    .map((oi: any) => oi.special_instructions)
    .filter((s: string | null) => !!s);
  return {
    id: row.id,
    queue_number: row.queue_number,
    status: row.status,
    total_amount: row.total_amount,
    pickup_start: row.pickup_start,
    payment_method: row.payment_method,
    created_at: row.created_at,
    prep_seconds: row.estimated_prep_minutes ? row.estimated_prep_minutes * 60 : null,
    special_request: specialNotes.length ? specialNotes.join('; ') : null,
    items,
  };
}

async function fetchMenu(vendorId: string) {
  const { data } = await supabase
    .from('menu_items')
    .select('id,vendor_id,name,description,price,category,spice_level,is_available,is_halal,allergens,image_url,preparation_time_min')
    .eq('vendor_id', vendorId)
    .order('name');
  menuItems = (data as MenuItem[] | null) ?? [];
}

async function fetchOrders(vendorId: string) {
  const { data } = await supabase
    .from('orders')
    .select('id,queue_number,status,total_amount,pickup_start,payment_method,created_at,estimated_prep_minutes,order_items(menu_item_id,quantity,unit_price,special_instructions,menu_items(name))')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: true });
  orders = ((data as any[] | null) ?? []).map(mapOrder);
}

function subscribeRealtime(vendorId: string) {
  realtimeChannel?.unsubscribe();
  realtimeChannel = supabase
    .channel(`vendor-${vendorId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${vendorId}` }, () => {
      void fetchOrders(vendorId).then(emit);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `vendor_id=eq.${vendorId}` }, () => {
      void fetchMenu(vendorId).then(emit);
    })
    .subscribe();
}

/** Called once from (vendor)/_layout.tsx on mount — resolves the signed-in
 * user's vendor row and loads their data. */
export async function initVendorSession(): Promise<'ok' | 'not-vendor' | 'no-session'> {
  loading = true;
  emit();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { loading = false; emit(); return 'no-session'; }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'vendor') { loading = false; emit(); return 'not-vendor'; }

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id,name,estimated_wait_min,current_queue_count,is_open')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (!vendor) { loading = false; emit(); return 'not-vendor'; }

  vendorProfile = { id: vendor.id, name: vendor.name, estimated_wait_min: vendor.estimated_wait_min, current_queue_count: vendor.current_queue_count };
  storeOpen = vendor.is_open;

  await Promise.all([fetchMenu(vendor.id), fetchOrders(vendor.id)]);
  subscribeRealtime(vendor.id);

  loading = false;
  emit();
  return 'ok';
}

export async function signOutVendor() {
  realtimeChannel?.unsubscribe();
  realtimeChannel = null;
  vendorProfile = null;
  menuItems = [];
  orders = [];
  storeOpen = false;
  loading = true;
  emit();
  await supabase.auth.signOut();
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export async function acceptOrder(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', id);
  if (error) { showAlert('Could not accept order', error.message); return; }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function rejectOrder(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'rejected' }).eq('id', id);
  if (error) { showAlert('Could not reject order', error.message); return; }
  const { error: refundError } = await supabase.rpc('refund_escrow', { p_order_id: id });
  if (refundError) showAlert('Order rejected, but refund failed', refundError.message);
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function markReady(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'ready' }).eq('id', id);
  if (error) { showAlert('Could not update order', error.message); return; }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function handOff(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', id);
  if (error) { showAlert('Could not update order', error.message); return; }
  const { error: releaseError } = await supabase.rpc('release_escrow_to_vendor', { p_order_id: id });
  if (releaseError) showAlert('Order completed, but payout failed', releaseError.message);
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

// No order_items column backs a per-item prep checklist in the current schema
// — stays local/ephemeral (resets on refetch), same as before.
export function toggleItemDone(orderId: string, index: number) {
  const o = orders.find(o => o.id === orderId);
  if (o?.items[index]) o.items[index].done = !o.items[index].done;
  emit();
}

// ─── Menu ───────────────────────────────────────────────────────────────────

export async function toggleAvailability(itemId: string) {
  const item = menuItems.find(i => i.id === itemId);
  if (!item) return;
  const next = !item.is_available;
  item.is_available = next; // optimistic
  emit();
  const { error } = await supabase.from('menu_items').update({ is_available: next }).eq('id', itemId);
  if (error) {
    item.is_available = !next; // revert
    emit();
    showAlert('Could not update availability', error.message);
  }
}

type NewMenuItemInput = {
  name: string;
  description: string;
  price: number;
  category: string;
  spice_level: number;
  preparation_time_min: number;
  allergens: string[];
  image_url: string | null;
};

export async function addMenuItem(input: NewMenuItemInput): Promise<boolean> {
  if (!vendorProfile) return false;
  const { data, error } = await supabase
    .from('menu_items')
    .insert({ ...input, vendor_id: vendorProfile.id })
    .select('id,vendor_id,name,description,price,category,spice_level,is_available,is_halal,allergens,image_url,preparation_time_min')
    .single();
  if (error || !data) {
    showAlert('Could not save item', error?.message ?? 'Unknown error');
    return false;
  }
  menuItems = [data as MenuItem, ...menuItems];
  emit();
  return true;
}

// ─── Store status ───────────────────────────────────────────────────────────

export async function setStoreOpen(open: boolean) {
  if (!vendorProfile) return;
  storeOpen = open; // optimistic
  emit();
  const { error } = await supabase.from('vendors').update({ is_open: open }).eq('id', vendorProfile.id);
  if (error) {
    storeOpen = !open;
    emit();
    showAlert('Could not update store status', error.message);
  }
}

// ─── Derived: payments / finance ───────────────────────────────────────────

type VendorPayment = {
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
      display_id: `#${o.queue_number ?? o.id.slice(0, 8).toUpperCase()}`,
      created_at: o.created_at,
      amount: o.total_amount,
      method: o.payment_method,
      status: 'COMPLETED' as const,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
