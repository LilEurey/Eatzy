// Minimal Supabase stub for pure-logic tests. Each test that cares about a
// query result overrides `__setNextResult` before calling the code under test.
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

export function __setNextResult(result: { data?: unknown; error?: unknown }) {
  nextResult = { data: result.data ?? null, error: result.error ?? null };
}

const builder: any = {
  select: () => builder,
  eq: () => builder,
  order: () => builder,
  maybeSingle: () => Promise.resolve(nextResult),
  then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve),
};

export const supabase = {
  from: () => builder,
};
