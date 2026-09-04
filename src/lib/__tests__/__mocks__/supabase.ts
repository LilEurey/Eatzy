// Minimal Supabase stub for pure-logic tests. Each test that cares about a
// query result overrides `__setNextResult` (for .from(...) chains) or
// `__setNextRpcResult` (for .rpc(...) calls) before calling the code under
// test. `__getRpcCalls()` / `__resetMock()` let a test assert an RPC was
// (or wasn't) called, without caring what the mock returned.
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };
let nextRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcCalls: { name: string; args: unknown }[] = [];

export function __setNextResult(result: { data?: unknown; error?: unknown }) {
  nextResult = { data: result.data ?? null, error: result.error ?? null };
}

export function __setNextRpcResult(result: { data?: unknown; error?: unknown }) {
  nextRpcResult = { data: result.data ?? null, error: result.error ?? null };
}

export function __getRpcCalls() {
  return rpcCalls;
}

export function __resetMock() {
  nextResult = { data: null, error: null };
  nextRpcResult = { data: null, error: null };
  rpcCalls = [];
}

const builder: any = {
  select: () => builder,
  eq: () => builder,
  order: () => builder,
  update: () => builder,
  maybeSingle: () => Promise.resolve(nextResult),
  then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve),
};

export const supabase = {
  from: () => builder,
  rpc: (name: string, args?: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(nextRpcResult);
  },
};
