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
  is_on_campus: boolean;
  stall_number: string | null;
  address: string | null;
  bio: string | null;
  bio_th: string | null;
  cuisine_tags: string[];
  is_halal_certified: boolean;
  open_time: string | null;
  close_time: string | null;
};

type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  name_th: string | null;
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

type VendorNotification = {
  id: string;
  order_id: string;
  icon: string;
  title: string;
  body: string;
  event: string | null;
  vendor_name: string | null;
  queue_number: number | null;
  total_amount: number | null;
  read: boolean;
  created_at: string;
};

type OrderItemAddon = { name: string; name_th: string | null; price: number };
type OrderItem = { menu_item_id: string; name: string; name_th: string | null; quantity: number; unit_price: number; addons: OrderItemAddon[]; done: boolean };
type VendorOrder = {
  id: string;
  queue_number: number | null;
  status: OrderStatus;
  total_amount: number;
  pickup_start: string | null;
  payment_method: string;
  created_at: string;
  prep_seconds: number | null;
  special_request: string | null;
  vendor_handed_off_at: string | null;
  items: OrderItem[];
};

let vendorProfile: VendorProfile | null = null;
let storeOpen = false;
let loading = true;
let menuItems: MenuItem[] = [];
let orders: VendorOrder[] = [];
let notifications: VendorNotification[] = [];
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

const listeners = new Set<() => void>();
function emit() {
  menuItems = [...menuItems];
  orders = [...orders];
  notifications = [...notifications];
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
export function useVendorNotifications() { return useSyncExternalStore(subscribe, () => notifications, () => notifications); }
export function useVendorUnreadNotifications() {
  return useSyncExternalStore(
    subscribe,
    () => notifications.some(n => !n.read),
    () => notifications.some(n => !n.read),
  );
}

function mapOrder(row: any): VendorOrder {
  const items: OrderItem[] = (row.order_items ?? []).map((oi: any) => ({
    menu_item_id: oi.menu_item_id,
    name: oi.menu_items?.name ?? '',
    name_th: oi.menu_items?.name_th ?? null,
    quantity: oi.quantity,
    unit_price: oi.unit_price,
    addons: (oi.order_item_addons ?? []).map((a: any) => ({
      name: a.name, name_th: a.name_th ?? null, price: a.price,
    })),
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
    vendor_handed_off_at: row.vendor_handed_off_at,
    items,
  };
}

async function fetchMenu(vendorId: string) {
  const { data } = await supabase
    .from('menu_items')
    .select('id,vendor_id,name,name_th,description,price,category,spice_level,is_available,is_halal,allergens,image_url,preparation_time_min')
    .eq('vendor_id', vendorId)
    .order('name');
  menuItems = (data as MenuItem[] | null) ?? [];
}

async function fetchOrders(vendorId: string) {
  const { data } = await supabase
    .from('orders')
    .select('id,queue_number,status,total_amount,pickup_start,payment_method,created_at,estimated_prep_minutes,vendor_handed_off_at,order_items(menu_item_id,quantity,unit_price,special_instructions,menu_items(name,name_th),order_item_addons(name,name_th,price))')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: true });
  orders = ((data as any[] | null) ?? []).map(mapOrder);
}

async function fetchNotifications(userId: string) {
  const { data } = await supabase
    .from('notifications')
    .select('id,order_id,icon,title,body,event,vendor_name,queue_number,total_amount,read,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  notifications = (data as VendorNotification[] | null) ?? [];
}

/** Called from (vendor)/notifications.tsx on mount — marks whatever's
 * currently unread as read, same as the student notifications screen. */
export async function markNotificationsRead() {
  const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
  if (!unreadIds.length) return;
  notifications = notifications.map(n => unreadIds.includes(n.id) ? { ...n, read: true } : n); // optimistic
  emit();
  await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
}

function subscribeRealtime(vendorId: string, userId: string) {
  realtimeChannel?.unsubscribe();
  realtimeChannel = supabase
    .channel(`vendor-${vendorId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${vendorId}` }, () => {
      void fetchOrders(vendorId).then(emit);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `vendor_id=eq.${vendorId}` }, () => {
      void fetchMenu(vendorId).then(emit);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
      notifications = [payload.new as VendorNotification, ...notifications];
      emit();
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
    .select('id,name,estimated_wait_min,current_queue_count,is_open,is_on_campus,stall_number,address,bio,bio_th,cuisine_tags,is_halal_certified,open_time,close_time')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (!vendor) { loading = false; emit(); return 'not-vendor'; }

  vendorProfile = {
    id: vendor.id,
    name: vendor.name,
    estimated_wait_min: vendor.estimated_wait_min,
    current_queue_count: vendor.current_queue_count,
    is_on_campus: vendor.is_on_campus,
    stall_number: vendor.stall_number,
    address: vendor.address,
    bio: vendor.bio,
    bio_th: vendor.bio_th,
    cuisine_tags: vendor.cuisine_tags ?? [],
    is_halal_certified: vendor.is_halal_certified,
    open_time: vendor.open_time,
    close_time: vendor.close_time,
  };
  storeOpen = vendor.is_open;

  await Promise.all([fetchMenu(vendor.id), fetchOrders(vendor.id), fetchNotifications(user.id)]);
  subscribeRealtime(vendor.id, user.id);

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
  notifications = [];
  storeOpen = false;
  loading = true;
  emit();
  await supabase.auth.signOut();
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export async function acceptOrder(id: string) {
  // Charging the student now happens inside this RPC, at the moment the
  // vendor accepts — not at order placement. See accept_order_and_charge
  // in 20260904010000_charge_on_vendor_accept.sql.
  const { data, error } = await supabase.rpc('accept_order_and_charge', { p_order_id: id });
  if (error) { showAlert('Could not accept order', error.message); return; }
  if (data === 'insufficient_balance') {
    showAlert('Order auto-rejected', "Customer's balance changed and is no longer enough to cover this order.");
  }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function rejectOrder(id: string) {
  // Reject only ever happens pre-accept — nothing was charged yet, so
  // there's nothing to refund. Guard on status='pending' so a race with
  // an accept that just landed (or a stale second device) can't flip an
  // already-charged order to 'rejected' with no way to unwind the debit.
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) { showAlert('Could not reject order', error.message); return; }
  if (!data || data.length === 0) {
    showAlert('Could not reject order', 'This order is no longer pending.');
  }
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
  const { error } = await supabase.rpc('vendor_confirm_handoff', { p_order_id: id });
  if (error) { showAlert('Could not confirm hand-off', error.message); return; }
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
  name_th: string | null;
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
    .select('id,vendor_id,name,name_th,description,price,category,spice_level,is_available,is_halal,allergens,image_url,preparation_time_min')
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

// ─── Profile ────────────────────────────────────────────────────────────────

type VendorProfilePatch = Partial<Pick<VendorProfile,
  'name' | 'is_on_campus' | 'stall_number' | 'address' | 'bio' | 'bio_th' | 'cuisine_tags' | 'is_halal_certified' | 'open_time' | 'close_time'
>>;

export async function updateVendorProfile(patch: VendorProfilePatch): Promise<boolean> {
  if (!vendorProfile) return false;
  const previous = vendorProfile;
  vendorProfile = { ...vendorProfile, ...patch }; // optimistic
  emit();
  const { error } = await supabase.from('vendors').update(patch).eq('id', previous.id);
  if (error) {
    vendorProfile = previous;
    emit();
    showAlert('Could not save profile', error.message);
    return false;
  }
  return true;
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
  // Escrow is held on accept, but only lands in the vendor's wallet once
  // both sides confirm handoff (finalize_order_handoff) — only 'completed'
  // orders are real, received revenue.
  return orders
    .filter(o => o.status === 'completed')
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
