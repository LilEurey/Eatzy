jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

import { __setNextRpcResult, __setNextResult, __getRpcCalls, __resetMock } from './__mocks__/supabase';
import { acceptOrder, rejectOrder } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';

describe('acceptOrder', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('accepts silently when the RPC charges the student successfully', async () => {
    __setNextRpcResult({ data: 'accepted', error: null });

    await acceptOrder('order-1');

    expect(showAlert).not.toHaveBeenCalled();
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
});
