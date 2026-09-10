import {
  __setNextRpcResult,
  __setNextResult,
  __getRpcCalls,
  __getFromCalls,
  __queueResults,
  __setAuthUser,
  __resetMock,
} from './__mocks__/supabase';
import { acceptOrder, rejectOrder, markReady, initVendorSession, updateVendorProfile, __getVendorProfileForTest } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';

jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

describe('acceptOrder', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('accepts silently when the RPC charges the student successfully', async () => {
    __setNextRpcResult({ data: 'accepted', error: null });

    await acceptOrder('order-1');

    expect(showAlert).not.toHaveBeenCalled();
    expect(__getRpcCalls()).toEqual([{ name: 'accept_order_and_charge', args: { p_order_id: 'order-1' } }]);
  });

  it('alerts the vendor when the RPC auto-rejects for insufficient balance', async () => {
    __setNextRpcResult({ data: 'insufficient_balance', error: null });

    await acceptOrder('order-1');

    expect(showAlert).toHaveBeenCalledWith(
      'Order auto-rejected',
      "Customer's balance changed and is no longer enough to cover this order.",
    );
  });

  it('surfaces an alert if the RPC call itself errors', async () => {
    __setNextRpcResult({ data: null, error: { message: 'network error' } });

    await acceptOrder('order-1');

    expect(showAlert).toHaveBeenCalledWith('Could not accept order', 'network error');
  });
});

describe('rejectOrder', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('flips status without calling refund_escrow — nothing was ever charged', async () => {
    __setNextResult({ data: [{ id: 'order-1' }], error: null });

    await rejectOrder('order-1');

    expect(showAlert).not.toHaveBeenCalled();
    expect(__getRpcCalls()).toEqual([]);
  });

  it('alerts when the order is no longer pending (race with a just-landed accept)', async () => {
    __setNextResult({ data: [], error: null });

    await rejectOrder('order-1');

    expect(showAlert).toHaveBeenCalledWith('Could not reject order', 'This order is no longer pending.');
  });
});

describe('markReady', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('only promotes an order that is already accepted — a pending one was never charged', async () => {
    __setNextResult({ data: [{ id: 'order-1' }], error: null });

    await markReady('order-1');

    expect(showAlert).not.toHaveBeenCalled();
    // accept_order_and_charge is the sole wallet-charge point, so 'ready' must
    // never be reachable straight from 'pending'.
    expect(__getFromCalls()[0]).toMatchObject({ table: 'orders', update: { status: 'ready' } });
  });

  it('alerts when the order is no longer accepted', async () => {
    __setNextResult({ data: [], error: null });

    await markReady('order-1');

    expect(showAlert).toHaveBeenCalledWith('Could not update order', 'This order is no longer accepted.');
  });
});

describe('updateVendorProfile coordinates', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  // Drive initVendorSession the way the store expects: auth user, then a FIFO of
  // results for the `users` role check, the `vendors` row, and the three
  // fetchMenu / fetchOrders / fetchNotifications queries fired in Promise.all.
  async function seedVendorSession() {
    __setAuthUser({ id: 'owner-1' });
    __queueResults(
      { data: { role: 'vendor' }, error: null },
      {
        data: {
          id: 'vendor-1',
          name: 'Somtam Stall',
          estimated_wait_min: 5,
          current_queue_count: 0,
          is_open: true,
          is_on_campus: true,
          stall_number: 'A1',
          address: null,
          latitude: 13.6511,
          longitude: 100.4972,
          bio: null,
          bio_th: null,
          cuisine_tags: ['thai'],
          is_halal_certified: false,
          open_time: null,
          close_time: null,
        },
        error: null,
      },
      { data: [], error: null }, // fetchMenu
      { data: [], error: null }, // fetchOrders
      { data: [], error: null }, // fetchNotifications
    );
    const status = await initVendorSession();
    expect(status).toBe('ok');
  }

  it('loads the vendor row with a resilient select(*) so a not-yet-live column cannot 42703 the query', async () => {
    await seedVendorSession();

    const vendorSelect = __getFromCalls().find(
      c => c.table === 'vendors' && typeof c.select === 'string',
    );
    // A narrow column list that names latitude/longitude would 42703 against
    // the current hosted schema and bounce every vendor to login — the whole
    // point of Critical 2. Must be the wildcard, like the student side.
    expect(vendorSelect?.select).toBe('*');
  });

  it('surfaces latitude/longitude on the mapped profile', async () => {
    await seedVendorSession();

    expect(__getVendorProfileForTest()).toMatchObject({ latitude: 13.6511, longitude: 100.4972 });
  });

  it('maps a missing geo column to null rather than undefined', async () => {
    __setAuthUser({ id: 'owner-1' });
    __queueResults(
      { data: { role: 'vendor' }, error: null },
      {
        // Pre-migration hosted row: no latitude/longitude keys at all.
        data: {
          id: 'vendor-1',
          name: 'Somtam Stall',
          estimated_wait_min: 5,
          current_queue_count: 0,
          is_open: true,
          is_on_campus: true,
          stall_number: 'A1',
          address: null,
          bio: null,
          bio_th: null,
          cuisine_tags: ['thai'],
          is_halal_certified: false,
          open_time: null,
          close_time: null,
        },
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    expect(await initVendorSession()).toBe('ok');
    expect(__getVendorProfileForTest()).toMatchObject({ latitude: null, longitude: null });
  });

  it('alerts and bails without wiping the session when the vendors query errors', async () => {
    __setAuthUser({ id: 'owner-1' });
    __queueResults(
      { data: { role: 'vendor' }, error: null },
      { data: null, error: { message: 'column vendors.latitude does not exist' } },
    );

    const status = await initVendorSession();

    expect(status).toBe('no-session');
    expect(showAlert).toHaveBeenCalledWith(
      'Could not load your store',
      'column vendors.latitude does not exist',
    );
  });

  it('forwards latitude and longitude in the vendors update patch', async () => {
    await seedVendorSession();
    __setNextResult({ data: null, error: null });

    await updateVendorProfile({ latitude: 13.651, longitude: 100.497 });

    const vendorUpdate = __getFromCalls().find(
      c => c.table === 'vendors' && c.update !== undefined,
    );
    expect(vendorUpdate?.update).toEqual(
      expect.objectContaining({ latitude: 13.651, longitude: 100.497 }),
    );
  });
});
