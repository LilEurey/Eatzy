import {
  __setNextResult,
  __setNextRpcResult,
  __getRpcCalls,
  __getFromCalls,
  __resetMock,
} from './__mocks__/supabase';
import {
  confirmHandoff,
  isActiveForStudent,
  isEarned,
  isInVendorQueue,
  isVoided,
  transitionOrder,
  transitionOrderWithAlert,
  type OrderStatus,
} from '@/lib/order-lifecycle';
import { invokeEdgeFunction } from '@/lib/edge-function';
import { showAlert } from '@/lib/alert';

jest.mock('@/lib/edge-function', () => ({ invokeEdgeFunction: jest.fn() }));
jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

const ALL: OrderStatus[] = ['pending', 'accepted', 'ready', 'completed', 'rejected', 'cancelled'];
const pick = (fn: (s: OrderStatus) => boolean) => ALL.filter(fn);

describe('status predicates', () => {
  it('classifies every status', () => {
    expect(pick(isActiveForStudent)).toEqual(['pending', 'accepted', 'ready']);
    expect(pick(isInVendorQueue)).toEqual(['pending', 'accepted']);
    expect(pick(isEarned)).toEqual(['completed']);
    expect(pick(isVoided)).toEqual(['rejected', 'cancelled']);
  });

  it('never calls a voided order active or earned', () => {
    for (const s of pick(isVoided)) {
      expect(isActiveForStudent(s)).toBe(false);
      expect(isEarned(s)).toBe(false);
    }
  });
});

describe('transitionOrder', () => {
  beforeEach(() => __resetMock());

  it('guards the update on the current status and returns ok when a row matched', async () => {
    __setNextResult({ data: [{ id: 'o1' }] });

    await expect(transitionOrder('o1', 'pending', 'rejected')).resolves.toBe('ok');

    const [call] = __getFromCalls();
    expect(call.table).toBe('orders');
    expect(call.update).toEqual({ status: 'rejected' });
    expect(call.filters).toEqual([['id', 'o1'], ['status', 'pending']]);
  });

  it('returns lost-race when the guard matches zero rows', async () => {
    __setNextResult({ data: [] });
    await expect(transitionOrder('o1', 'pending', 'cancelled')).resolves.toBe('lost-race');
  });

  it('returns the error message when the update fails', async () => {
    __setNextResult({ error: { message: 'boom' } });
    await expect(transitionOrder('o1', 'accepted', 'ready')).resolves.toEqual({ error: 'boom' });
  });
});

describe('transitionOrderWithAlert', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  const messages = { lostRaceTitle: 'lost title', lostRaceMessage: 'lost msg', errorTitle: 'err title' };

  it('returns true and shows no alert on ok', async () => {
    __setNextResult({ data: [{ id: 'o1' }] });
    await expect(transitionOrderWithAlert('o1', 'pending', 'rejected', messages)).resolves.toBe(true);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('returns false and shows the lost-race message on lost-race', async () => {
    __setNextResult({ data: [] });
    await expect(transitionOrderWithAlert('o1', 'pending', 'rejected', messages)).resolves.toBe(false);
    expect(showAlert).toHaveBeenCalledWith('lost title', 'lost msg');
  });

  it('returns false and shows the error message on error', async () => {
    __setNextResult({ error: { message: 'boom' } });
    await expect(transitionOrderWithAlert('o1', 'pending', 'rejected', messages)).resolves.toBe(false);
    expect(showAlert).toHaveBeenCalledWith('err title', 'boom');
  });
});

describe('confirmHandoff', () => {
  beforeEach(() => {
    __resetMock();
    (invokeEdgeFunction as jest.Mock).mockClear();
  });

  it.each([
    ['vendor', 'vendor_confirm_handoff'],
    ['student', 'student_confirm_pickup'],
  ] as const)('%s side calls %s then nudges the payout', async (side, rpc) => {
    __setNextRpcResult({ data: null, error: null });

    await expect(confirmHandoff(side, 'o1')).resolves.toBeNull();

    expect(__getRpcCalls()).toEqual([{ name: rpc, args: { p_order_id: 'o1' } }]);
    expect(invokeEdgeFunction).toHaveBeenCalledWith('transfer-order-payout', { body: { order_id: 'o1' } });
  });

  it('returns the RPC error and skips the payout nudge', async () => {
    __setNextRpcResult({ error: { message: 'not ready' } });

    await expect(confirmHandoff('vendor', 'o1')).resolves.toBe('not ready');
    expect(invokeEdgeFunction).not.toHaveBeenCalled();
  });
});
