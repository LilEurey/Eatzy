// Shared CORS handling. The native app sends no Origin header (CORS is a
// browser-only check), so tightening this doesn't affect mobile — it only
// stops arbitrary web pages from calling these functions with a victim's
// bearer token from a browser context.
//
// Allowed origins come from the ALLOWED_ORIGINS secret (comma-separated).
// Set it per environment:
//   supabase secrets set ALLOWED_ORIGINS="https://app.eatzy.example,http://localhost:8081"
// Falls back to the local Expo web / dev origins when unset.
const DEFAULT_ALLOWED = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:3000',
  'https://127.0.0.1:3000',
];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return DEFAULT_ALLOWED;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Reflect the caller's Origin only when it's on the allowlist; otherwise send
// no Access-Control-Allow-Origin at all (a browser then blocks the response,
// while a native client — which never set Origin — is unaffected).
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
