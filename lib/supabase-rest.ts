/**
 * Direct Supabase REST API helpers using fetch().
 *
 * Bypasses the Supabase JS client's internal PostgREST wrapper which
 * can lose the auth token under certain session/lock timing conditions.
 * These functions explicitly pass the access_token from getSession()
 * in the Authorization header, ensuring RLS always sees auth.uid().
 *
 * Ported from web project's src/lib/supabase-rest.ts.
 */

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { fetchWithTimeout } from './fetch-utils';

interface RestResult<T = Record<string, unknown>> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Get a valid access token, refreshing if necessary.
 * Uses getUser() to validate the token server-side, then reads the session.
 */
async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  // getUser() validates the token with Supabase auth server
  // and triggers a refresh if the access token is expired
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user) {
    // Try explicit refresh as last resort
    const { error: refreshErr } = await client.auth.refreshSession();
    if (refreshErr) return null;
  }

  // Now getSession() should have the refreshed token
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.access_token ?? null;
}

interface RawResponse {
  ok: boolean;
  status: number;
  /** Parsed JSON body; null when empty or not JSON. */
  body: unknown;
}

/**
 * One request under the shared timeout (lib/fetch-utils), body included. A
 * stalled save otherwise spun the Save button forever on a bad connection.
 */
function request(url: string, init: RequestInit): Promise<RawResponse> {
  return fetchWithTimeout(url, init, async r => {
    const text = await r.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
    return { ok: r.ok, status: r.status, body };
  });
}

function restError(res: RawResponse): { message: string; code?: string } {
  const body = (res.body && typeof res.body === 'object' ? res.body : {}) as { message?: string; code?: string };
  return { message: body.message || `HTTP ${res.status}`, code: body.code };
}

function headers(accessToken: string, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h['Prefer'] = prefer;
  return h;
}

/** INSERT a row via PostgREST, returning the inserted row. */
export async function supabaseRestInsert<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
  opts: { returning?: 'representation' | 'minimal' } = {},
): Promise<RestResult<T>> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: { message: 'No valid session. Please sign in again.' } };
  }

  const res = await request(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(accessToken, `return=${opts.returning ?? 'representation'}`),
    body: JSON.stringify(row),
  });

  if (!res.ok) return { data: null, error: restError(res) };

  // return=minimal sends an empty 201: nothing to parse (and a column-grant
  // table like user_show_stubs would refuse the RETURNING read anyway).
  if (opts.returning === 'minimal') return { data: null, error: null };
  const data = res.body as T | T[] | null;
  return { data: Array.isArray(data) ? data[0] : data, error: null };
}

/** UPSERT a row via PostgREST. */
export async function supabaseRestUpsert(
  table: string,
  row: Record<string, unknown>,
  _onConflict: string,
): Promise<RestResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: { message: 'No valid session. Please sign in again.' } };
  }

  const res = await request(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(accessToken, 'return=representation,resolution=merge-duplicates'),
    body: JSON.stringify(row),
  });

  if (!res.ok) return { data: null, error: restError(res) };

  const data = res.body as Record<string, unknown> | Record<string, unknown>[] | null;
  return { data: Array.isArray(data) ? data[0] : data, error: null };
}

/** UPDATE rows via PostgREST PATCH with filters in query string. */
export async function supabaseRestUpdate<T = Record<string, unknown>>(
  table: string,
  filters: string,
  updates: Record<string, unknown>,
): Promise<RestResult<T>> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: { message: 'No valid session. Please sign in again.' } };
  }

  const res = await request(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'return=representation'),
    body: JSON.stringify(updates),
  });

  if (!res.ok) return { data: null, error: restError(res) };

  const data = res.body as T | T[] | null;
  return { data: Array.isArray(data) ? data[0] : data, error: null };
}

/** SELECT rows via PostgREST with query string params. */
export async function supabaseRestSelect<T = Record<string, unknown>>(
  table: string,
  params: string,
): Promise<RestResult<T[]>> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: { message: 'No valid session. Please sign in again.' } };
  }

  const res = await request(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'GET',
    headers: headers(accessToken),
  });

  if (!res.ok) return { data: null, error: restError(res) };

  // PostgREST answers a select with a JSON array. Anything else (a truncated
  // or garbled body) is an error, never "no rows": import dedupes on this.
  if (!Array.isArray(res.body)) {
    return { data: null, error: { message: `Unexpected response (HTTP ${res.status})` } };
  }
  return { data: res.body as T[], error: null };
}
