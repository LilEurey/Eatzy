// Boilerplate every Edge Function repeated verbatim: the CORS-aware JSON
// responder and the two Supabase clients (caller-scoped vs. service-role).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

/** CORS headers for this request plus a `json(body, status)` response builder
 * that carries them. Handle OPTIONS with `new Response('ok', { headers: cors })`. */
export function corsAndJson(req: Request) {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  return { cors, json };
}

/** Anon-key client acting as the caller (RLS applies; `auth.getUser()` resolves
 * their session). Deliberately NOT service-role, so a dropped role check can't
 * turn an endpoint into an unauthenticated admin one. */
export function callerClient(authHeader: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
}

/** Service-role client — bypasses RLS. Server-side only. */
export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}
