import { supabase } from '@/lib/supabase';

// Order placement: one call to the place_order() RPC, which validates and
// inserts the order, its lines and their add-ons in a single transaction
// (see migration 20260924000000_place_order_rpc.sql). Queue number,
// created_at, prices, totals, item availability and the add-on min/max rule
// are all decided server-side — nothing here is trusted beyond "which dishes,
// how many, which add-ons, which pickup window".

export type PlaceOrderLine = {
  menu_item_id: string;
  quantity: number;
  note: string;
  addons: { id: string }[];
};

export type PlaceOrderInput = {
  vendorId: string;
  lines: PlaceOrderLine[];
  slot: { start: Date; end: Date };
};

/** `message` is the raw error text; for every reason except 'failed' the
 * caller shows its own localized copy instead. */
export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | {
      ok: false;
      reason: 'no-session' | 'vendor-closed' | 'item-unavailable' | 'slot-expired' | 'failed';
      message: string;
    };

const REASON_BY_ERROR: Record<string, Exclude<PlaceOrderResult, { ok: true }>['reason']> = {
  not_authenticated: 'no-session',
  vendor_closed: 'vendor-closed',
  item_unavailable: 'item-unavailable',
  addon_unavailable: 'item-unavailable',
  addon_rule_violation: 'item-unavailable',
  invalid_pickup_window: 'slot-expired',
};

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // getSession() refreshes an expired-but-refreshable token in place; a
  // missing access_token past that point means the session is truly gone.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: 'no-session', message: 'no session' };

  const { data, error } = await supabase.rpc('place_order', {
    p_vendor_id: input.vendorId,
    p_lines: input.lines.map(line => ({
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
      note: line.note.trim() || null,
      addon_ids: line.addons.map(a => a.id),
    })),
    p_pickup_start: input.slot.start.toISOString(),
    p_pickup_end: input.slot.end.toISOString(),
  });

  if (error || !data) {
    // Postgrest errors are plain objects (not Error instances).
    const e = (error ?? { message: 'no order id returned' }) as { message: string; code?: string; details?: string; hint?: string };
    const reason = REASON_BY_ERROR[e.message];
    if (reason) return { ok: false, reason, message: e.message };
    const message = `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? `\n${e.details}` : ''}${e.hint ? `\n${e.hint}` : ''}`;
    return { ok: false, reason: 'failed', message };
  }

  return { ok: true, orderId: data };
}
