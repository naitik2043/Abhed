/**
 * New Supabase API keys (`sb_publishable_…` and `sb_secret_…`) are opaque API
 * keys, not JWTs. Send them with `apikey`; only legacy JWT keys belong in the
 * Authorization bearer header.
 */
export function supabaseApiHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    'content-type': 'application/json',
  };

  if (!key.startsWith('sb_publishable_') && !key.startsWith('sb_secret_')) {
    headers.authorization = `Bearer ${key}`;
  }

  return headers;
}
