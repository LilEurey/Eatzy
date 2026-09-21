import {
  __queueResults,
  __setNextRpcResult,
  __setSession,
  __getFromCalls,
  __getRpcCalls,
  __resetMock,
} from './__mocks__/supabase';
import { placeOrder, type PlaceOrderInput } from '@/lib/place-order';

const SESSION = { access_token: 'tok', user: { id: 'u1' } };

const input = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  vendorId: 'v1',
  subtotal: 100,
  total: 100,
  slot: { start: new Date('2026-06-15T05:00:00Z'), end: new Date('2026-06-15T05:15:00Z') }, // 12:00 BKK
  lines: [
    { menu_item_id: 'm1', quantity: 1, unit_price: 40, note: '  ', addons: [] },
    {
      menu_item_id: 'm1', quantity: 2, unit_price: 30, note: ' no chili ',
      addons: [{ id: 'a1', name: 'Egg', name_th: null, price: 10 }],
    },
  ],
  ...over,
});

describe('placeOrder', () => {
  beforeEach(() => {
    __resetMock();
    __setSession(SESSION);
    __setNextRpcResult({ data: 5, error: null });
  });

  it('writes the order, then each line separately, then that line\'s add-ons', async () => {
    __queueResults({ data: { id: 'o1' } }, { data: { id: 'i1' } }, { data: { id: 'i2' } }, { data: null });

    await expect(placeOrder(input())).resolves.toEqual({ ok: true, orderId: 'o1' });

    expect(__getRpcCalls()).toEqual([{ name: 'next_queue_number', args: { p_vendor_id: 'v1' } }]);
    const calls = __getFromCalls();
    expect(calls.map(c => c.table)).toEqual(['orders', 'order_items', 'order_items', 'order_item_addons']);
    expect(calls[0].insert).toEqual(expect.objectContaining({
      user_id: 'u1', vendor_id: 'v1', queue_number: 5, status: 'pending',
      total_amount: 100, payment_method: 'wallet', time_segment: 'lunch',
    }));
    // Same dish twice stays two lines; blank note -> null, note is trimmed.
    expect(calls[1].insert).toEqual(expect.objectContaining({ order_id: 'o1', menu_item_id: 'm1', special_instructions: null }));
    expect(calls[2].insert).toEqual(expect.objectContaining({ menu_item_id: 'm1', quantity: 2, special_instructions: 'no chili' }));
    expect(calls[3].insert).toEqual([{ order_item_id: 'i2', addon_id: 'a1', name: 'Egg', name_th: null, price: 10 }]);
  });

  it('bails before touching the DB when the session is gone', async () => {
    __setSession(null);

    await expect(placeOrder(input())).resolves.toMatchObject({ ok: false, reason: 'no-session' });

    expect(__getRpcCalls()).toEqual([]);
    expect(__getFromCalls()).toEqual([]);
  });

  it('deletes the stranded order when a later insert fails, and formats the error', async () => {
    __queueResults(
      { data: { id: 'o1' } },
      { error: { message: 'boom', code: '23505', details: 'dup key', hint: 'retry' } },
    );

    const result = await placeOrder(input());

    expect(result).toEqual({ ok: false, reason: 'failed', message: 'boom [23505]\ndup key\nretry' });
    const del = __getFromCalls().find(c => c.deleted);
    expect(del?.table).toBe('orders');
    expect(del?.filters).toEqual([['id', 'o1']]);
  });

  it('reports vendor_closed as its own reason, with nothing to roll back', async () => {
    __queueResults({ error: { message: 'vendor_closed' } });

    await expect(placeOrder(input())).resolves.toMatchObject({ ok: false, reason: 'vendor-closed' });

    expect(__getFromCalls().some(c => c.deleted)).toBe(false);
  });
});
