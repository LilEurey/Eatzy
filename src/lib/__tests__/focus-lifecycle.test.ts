import { startGuarded } from '@/lib/focus-lifecycle';

// A start whose async work we resolve by hand, to place stop() before/after it.
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const flush = () => new Promise(r => setImmediate(r));

describe('startGuarded', () => {
  it('runs the cleanup on stop when start already finished', async () => {
    const cleanup = jest.fn();
    const stop = startGuarded(async () => cleanup);
    await flush();

    stop();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs the cleanup immediately if stop() came before start finished (the channel leak)', async () => {
    const d = deferred<() => void>();
    const cleanup = jest.fn();
    const stop = startGuarded(() => d.promise);

    stop();                 // blur lands while getUser/fetch is still in flight
    expect(cleanup).not.toHaveBeenCalled();
    d.resolve(cleanup);     // ...then start creates its channel and returns cleanup
    await flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exposes cancellation to start so stale work can bail out', async () => {
    const d = deferred<void>();
    let sawCancelled: boolean | undefined;
    const stop = startGuarded(async isCancelled => {
      await d.promise;
      sawCancelled = isCancelled();
    });

    stop();
    d.resolve();
    await flush();

    expect(sawCancelled).toBe(true);
  });

  it('runs the cleanup only once even if stop() is called twice', async () => {
    const cleanup = jest.fn();
    const stop = startGuarded(async () => cleanup);
    await flush();

    stop();
    stop();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('tolerates a start that returns no cleanup', async () => {
    const stop = startGuarded(async () => undefined);
    await flush();
    expect(() => stop()).not.toThrow();
  });
});
