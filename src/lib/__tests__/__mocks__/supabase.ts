// Minimal Supabase stub for pure-logic tests. Each test that cares about a
// query result overrides `__setNextResult` (for .from(...) chains) or
// `__setNextRpcResult` (for .rpc(...) calls) before calling the code under
// test. `__getRpcCalls()` / `__resetMock()` let a test assert an RPC was
// (or wasn't) called, without caring what the mock returned.
//
// `__queueResults(...)` seeds a FIFO of results for code paths that fire
// several `.from(...)` queries in sequence (e.g. `initVendorSession`); once
// the queue drains, chains fall back to `__setNextResult`. `__getFromCalls()`
// exposes the captured `.from(table)` chains — the table name plus whatever
// `.select(...)` / `.update(...)` / `.insert(...)` payload the code under test
// passed — so a test can assert on an update patch or a select column list.
type MockResult = { data: unknown; error: unknown };
type FromCall = { table: string; select?: unknown; update?: unknown; insert?: unknown };

let nextResult: MockResult = { data: null, error: null };
let nextRpcResult: MockResult = { data: null, error: null };
let resultQueue: MockResult[] = [];
let rpcCalls: { name: string; args: unknown }[] = [];
let fromCalls: FromCall[] = [];
let authUser: unknown = null;

export function __setNextResult(result: { data?: unknown; error?: unknown }) {
  nextResult = { data: result.data ?? null, error: result.error ?? null };
}

export function __setNextRpcResult(result: { data?: unknown; error?: unknown }) {
  nextRpcResult = { data: result.data ?? null, error: result.error ?? null };
}

/** FIFO of results for consecutive `.from(...)` chains — drains one per chain,
 * then falls back to `__setNextResult`. */
export function __queueResults(...results: { data?: unknown; error?: unknown }[]) {
  for (const r of results) resultQueue.push({ data: r.data ?? null, error: r.error ?? null });
}

/** Sets what `supabase.auth.getUser()` resolves its `data.user` to. */
export function __setAuthUser(user: unknown) {
  authUser = user;
}

export function __getRpcCalls() {
  return rpcCalls;
}

/** Every captured `.from(table)` chain, in call order. */
export function __getFromCalls() {
  return fromCalls;
}

export function __resetMock() {
  nextResult = { data: null, error: null };
  nextRpcResult = { data: null, error: null };
  resultQueue = [];
  rpcCalls = [];
  fromCalls = [];
  authUser = null;
}

function takeResult(): MockResult {
  return resultQueue.length ? (resultQueue.shift() as MockResult) : nextResult;
}

function makeBuilder(call: FromCall): any {
  const builder: any = {
    select: (arg?: unknown) => { call.select = arg; return builder; },
    update: (arg?: unknown) => { call.update = arg; return builder; },
    insert: (arg?: unknown) => { call.insert = arg; return builder; },
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(takeResult()),
    single: () => Promise.resolve(takeResult()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(takeResult()).then(resolve),
  };
  return builder;
}

const channelStub: any = {
  on: () => channelStub,
  subscribe: () => channelStub,
  unsubscribe: () => {},
};

export const supabase = {
  from: (table: string) => {
    const call: FromCall = { table };
    fromCalls.push(call);
    return makeBuilder(call);
  },
  rpc: (name: string, args?: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(nextRpcResult);
  },
  auth: {
    getUser: () => Promise.resolve({ data: { user: authUser }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },
  channel: () => channelStub,
};
