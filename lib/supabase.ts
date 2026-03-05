/**
 * Supabase client singleton for the mobile app.
 *
 * Uses a LargeSecureStore adapter that chunks values exceeding
 * expo-secure-store's 2KB limit. Auth tokens are stored encrypted
 * in the iOS Keychain via SecureStore.
 *
 * Returns null when env vars are missing (feature flag OFF).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// ─── LargeSecureStore ──────────────────────────────────────
// expo-secure-store has a ~2048 byte value limit on iOS.
// Supabase JWTs can exceed this. We chunk large values across
// multiple keys: `key`, `key.1`, `key.2`, etc.

const CHUNK_SIZE = 1800; // Leave headroom below 2048

const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const first = await SecureStore.getItemAsync(key);
    if (first === null) return null;

    // Check for continuation chunks
    let result = first;
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}.${i}`);
      if (chunk === null) break;
      result += chunk;
      i++;
    }
    return result;
  },

  async setItem(key: string, value: string): Promise<void> {
    // First, clean up any old chunks
    await LargeSecureStore.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    // Split into chunks
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Store first chunk under the main key
    await SecureStore.setItemAsync(key, chunks[0]);

    // Store remaining chunks with numbered suffixes
    for (let i = 1; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    }
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
    // Clean up any chunks (try up to 10)
    for (let i = 1; i <= 10; i++) {
      try {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      } catch {
        break;
      }
    }
  },
};

// ─── Simple Lock ───────────────────────────────────────────
// Serializes concurrent auth operations to prevent race conditions.
// Mirrors the web project's simpleLock (replaces navigator.locks).

const lockMap = new Map<string, Promise<unknown>>();
async function simpleLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const current = lockMap.get(name) ?? Promise.resolve();
  const next = current.then(
    () => fn(),
    () => fn(),
  );
  lockMap.set(name, next);
  try {
    return await next;
  } finally {
    if (lockMap.get(name) === next) {
      lockMap.delete(name);
    }
  }
}

// ─── Client Singleton ──────────────────────────────────────

let supabaseClient: SupabaseClient | null = null;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: LargeSecureStore,
        persistSession: true,
        storageKey: 'bsc_auth',
        autoRefreshToken: true,
        detectSessionInUrl: false, // No URL-based auth in React Native
        lock: simpleLock,
      },
    });
  }

  return supabaseClient;
}

/** Expose URL and key for REST helpers */
export { SUPABASE_URL, SUPABASE_ANON_KEY };
