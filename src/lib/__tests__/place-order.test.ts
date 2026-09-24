import {
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
  slot: { start: new Date('2026-06-15T05:00:00Z'), end: new Date('2026-06-15T05:15:00Z') },
  lines: [
    { menu_item_id: 'm1', quantity: 1, note: '  ', addons: [] },
    { menu_item_id: 'm1', quantity: 2, note: ' no chili ', addons: [{ id: 'a1' }] },
  ],
  ...over,
});

describe('placeOrder', () => {
  beforeEach(() => {
    __resetMock();
    __setSession(SESSION);
  });

  it('places the whole order in one RPC, sending only what the server trusts', async () => {
    __setNextRpcResult({ data: 'o1', error: null });

    await expect(placeOrder(input())).resolves.toEqual({ ok: true, orderId: 'o1' });

    expect(__getRpcCalls()).toEqual([{
      name: 'place_order',
      args: {
        p_vendor_id: 'v1',
        // Same dish twice stays two lines; blank note -> null, note is trimmed.
        p_lines: [
          { menu_item_id: 'm1', quantity: 1, note: null, addon_ids: [] },
          { menu_item_id: 'm1', quantity: 2, note: 'no chili', addon_ids: ['a1'] },
        ],
        p_pickup_start: '2026-06-15T05:00:00.000Z',
        p_pickup_end: '2026-06-15T05:15:00.000Z',
      },
    }]);
    // No direct table writes — and so nothing to roll back.
    expect(__getFromCalls()).toEqual([]);
  });

  it('bails before touching the DB when the session is gone', async () => {
    __setSession(null);

    await expect(placeOrder(input())).resolves.toMatchObject({ ok: false, reason: 'no-session' });

    expect(__getRpcCalls()).toEqual([]);
  });

  it.each([
    ['vendor_closed', 'vendor-closed'],
    ['item_unavailable', 'item-unavailable'],
    ['addon_unavailable', 'item-unavailable'],
    ['addon_rule_violation', 'item-unavailable'],
    ['invalid_pickup_window', 'slot-expired'],
    ['not_authenticated', 'no-session'],
  ])('maps %s to its own reason', async (message, reason) => {
    __setNextRpcResult({ data: null, error: { message } });

    await expect(placeOrder(input())).resolves.toMatchObject({ ok: false, reason });
  });

  it('formats an unknown error with its code, details and hint', async () => {
    __setNextRpcResult({ data: null, error: { message: 'boom', code: '23505', details: 'dup key', hint: 'retry' } });

    await expect(placeOrder(input())).resolves.toEqual({ ok: false, reason: 'failed', message: 'boom [23505]\ndup key\nretry' });
  });
});
