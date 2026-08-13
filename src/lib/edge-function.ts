import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// supabase-js only populates `data` when an Edge Function responds 2xx —
// any non-2xx status (which is how apply/approve/reject-vendor-application
// signal errors, via a real 400/403/409/500) surfaces as a thrown
// FunctionsHttpError instead, with `data` left null and the actual
// `{ error, code }` body only reachable via `error.context.json()`. Callers
// that only checked `data?.error` never saw it — this normalizes both
// shapes into one place.
type EdgeFunctionError = { message: string; code?: string };

export async function invokeEdgeFunction<T = any>(
  name: string,
  options?: { body?: Record<string, unknown> },
): Promise<{ data: T | null; error: EdgeFunctionError | null }> {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (!error) return { data: data as T, error: null };

  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return { data: null, error: { message: body?.error ?? error.message, code: body?.code } };
    } catch {
      return { data: null, error: { message: error.message } };
    }
  }
  return { data: null, error: { message: error.message } };
}
