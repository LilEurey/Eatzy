import { supabase } from '@/lib/supabase';
import { getMealSegment } from '@/lib/time';

// Order placement, extracted from cart.tsx's submitOrder so the sequence and
// its rollback are testable without a React tree. Steps: session → queue
// number → orders row → one order_items row per line (+ its add-ons).
//
// ponytail: still client-side and best-effort atomic — a dropped connection
// between steps can strand a pending order (the compensating delete below is
// itself a network call). Real atomicity = one Postgres RPC that does all of
// this in a transaction; that needs a migration, so it's a follow-up.

export type PlaceOrderLine = {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  note: string;
  addons: { id: string; name: string; name_th: string | null; price: number }[];
};

export type PlaceOrderInput = {
  vendorId: string;
  lines: PlaceOrderLine[];
  subtotal: number;
  total: number;
  slot: { start: Date; end: Date };
};

/** `message` is the raw error text; for 'no-session' / 'vendor-closed' the
 * caller shows its own localized copy instead. */
export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: 'no-session' | 'vendor-closed' | 'failed'; message: string };

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  let orderId: string | null = null;
  try {
    // getSession() (not getUser()) because it's the session whose
    // access_token actually rides along on the inserts below — reading
    // identity from a separate getUser() call risks acting on a user
    // whose token isn't the one the request will carry. getSession()
    // refreshes an expired-but-refreshable token in place; a missing
    // access_token past that point means the session is truly gone.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, reason: 'no-session', message: 'no session' };
    const user = session.user;

    const { data: queueNumber, error: queueError } = await supabase
      .rpc('next_queue_number', { p_vendor_id: input.vendorId });
    if (queueError) throw queueError;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        vendor_id: input.vendorId,
        queue_number: queueNumber,
        status: 'pending',
        subtotal: input.subtotal,
        total_amount: input.total,
        payment_method: 'wallet',
        pickup_start: input.slot.start.toISOString(),
        pickup_end: input.slot.end.toISOString(),
        time_segment: getMealSegment(input.slot.start),
      })
      .select('id')
      .single();
    if (orderError) throw orderError;
    orderId = order.id;

    // Insert line by line: two lines can share menu_item_id (different
    // add-on configs), so a bulk insert can't be re-correlated to its
    // cart line when attaching order_item_addons. unit_price / add-on
    // name+price are re-derived from the catalog by DB triggers; the
    // values we send are the client's snapshot and get overwritten.
    for (const line of input.lines) {
      const { data: oi, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          menu_item_id: line.menu_item_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          special_instructions: line.note.trim() || null,
        })
        .select('id')
        .single();
      if (itemError) throw itemError;

      if (line.addons.length > 0) {
        const { error: addonError } = await supabase
          .from('order_item_addons')
          .insert(line.addons.map(a => ({
            order_item_id: oi.id,
            addon_id: a.id,
            name: a.name,
            name_th: a.name_th,
            price: a.price,
          })));
        if (addonError) throw addonError;
      }
    }

    return { ok: true, orderId: order.id };
  } catch (err) {
    // Postgrest errors are plain objects (not Error instances), so no instanceof.
    const e = err as { message: string; code?: string; details?: string; hint?: string };
    // Don't strand a pending order when order_items/addons insertion
    // fails after the orders row itself was created. Best-effort; RLS
    // lets a student delete their own not-yet-paid order. Wallet
    // deduction no longer happens here (see accept_order_and_charge —
    // it now fires when the vendor accepts), so the two failure modes
    // that used to need special-casing here (insufficient_wallet_balance,
    // addon_rule_violation) can no longer occur at this step.
    if (orderId) await supabase.from('orders').delete().eq('id', orderId);
    if (e.message === 'vendor_closed') return { ok: false, reason: 'vendor-closed', message: e.message };
    const message = `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? `\n${e.details}` : ''}${e.hint ? `\n${e.hint}` : ''}`;
    return { ok: false, reason: 'failed', message };
  }
}
