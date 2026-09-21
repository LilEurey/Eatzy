import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';

// One place for what an order's status *means* and how it moves. The SQL
// transition guard (20260910000000_order_status_transition_guard.sql) is the
// real enforcement; this module is the client's single copy of the rules so
// screens stop re-deriving "active" / "earned" / race-loss handling by hand.

export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';

/** Student "Active" tab: the order still needs something to happen. */
export const isActiveForStudent = (s: OrderStatus) => s === 'pending' || s === 'accepted' || s === 'ready';

/** Vendor queue: not yet ready — still on the vendor's plate. */
export const isInVendorQueue = (s: OrderStatus) => s === 'pending' || s === 'accepted';

/** Money only reaches the vendor once both sides confirm handoff
 * (finalize_order_handoff) — pending/accepted/ready is still escrow. */
export const isEarned = (s: OrderStatus) => s === 'completed';

/** Rejected/cancelled: never charged, never demand. Both mean "the order
 * didn't happen" to the student. */
export const isVoided = (s: OrderStatus) => s === 'rejected' || s === 'cancelled';

export type TransitionResult = 'ok' | 'lost-race' | { error: string };

/** Moves an order `from` → `to`, guarded on its current status. If a
 * concurrent change (vendor accepted, second device…) got there first the
 * update matches zero rows and this returns 'lost-race' instead of
 * clobbering the newer state. */
export async function transitionOrder(id: string, from: OrderStatus, to: OrderStatus): Promise<TransitionResult> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: to })
    .eq('id', id)
    .eq('status', from)
    .select('id');
  if (error) return { error: error.message };
  return data && data.length > 0 ? 'ok' : 'lost-race';
}

/** Records one side's handoff confirmation, then nudges the payout. Returns
 * the RPC error message, or null on success. The payout call only actually
 * completes the order (and transfers) once the other side has also
 * confirmed — a no-op otherwise. Fire-and-forget: the internal wallet ledger
 * is already correct regardless of its outcome. */
export async function confirmHandoff(side: 'vendor' | 'student', orderId: string): Promise<string | null> {
  const { error } = await supabase.rpc(
    side === 'vendor' ? 'vendor_confirm_handoff' : 'student_confirm_pickup',
    { p_order_id: orderId },
  );
  if (error) return error.message;
  void invokeEdgeFunction('transfer-order-payout', { body: { order_id: orderId } });
  return null;
}
