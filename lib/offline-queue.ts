/**
 * Offline write queue — queues Supabase mutations when offline,
 * flushes when connectivity returns.
 *
 * Operations are stored in AsyncStorage and replayed in order.
 * Each hook applies optimistic local state immediately, so the
 * UI stays responsive regardless of network state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { getSupabaseClient } from './supabase';

const QUEUE_KEY = '@bsc:offlineQueue';

// ─── Types ───────────────────────────────────────────────────

export interface QueuedOperation {
  id: string;
  table: 'reviews' | 'watchlist';
  action: 'insert' | 'update' | 'delete';
  /** Row data for insert, or partial data for update */
  data?: Record<string, unknown>;
  /** WHERE filters for update/delete (e.g. { id: '...', user_id: '...' }) */
  filters: Record<string, string>;
  createdAt: string;
}

// ─── Queue persistence ───────────────────────────────────────

async function getQueue(): Promise<QueuedOperation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function setQueue(queue: QueuedOperation[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

// ─── Public API ──────────────────────────────────────────────

/** Add an operation to the offline queue */
export async function enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...op,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  await setQueue(queue);
}

/** Get number of pending operations */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/** Check if device is online */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

/**
 * Flush the queue — replay all pending operations against Supabase.
 * Returns the number of successfully flushed operations.
 * Failed operations stay in the queue for the next flush.
 */
export async function flushQueue(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;

  const online = await isOnline();
  if (!online) return 0;

  const queue = await getQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedOperation[] = [];
  let flushed = 0;

  for (const op of queue) {
    try {
      await executeOperation(client, op);
      flushed++;
    } catch (e) {
      // Check if it's a conflict (already exists) — treat as success
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('23505')) {
        flushed++;
        continue;
      }
      // Keep in queue for retry
      remaining.push(op);
    }
  }

  await setQueue(remaining);

  if (__DEV__ && flushed > 0) {
    console.log(`[OfflineQueue] Flushed ${flushed} operations, ${remaining.length} remaining`);
  }

  return flushed;
}

async function executeOperation(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  op: QueuedOperation,
): Promise<void> {
  switch (op.action) {
    case 'insert': {
      const { error } = await client.from(op.table).insert(op.data!);
      if (error) throw error;
      break;
    }
    case 'update': {
      let query = client.from(op.table).update(op.data!);
      for (const [key, val] of Object.entries(op.filters)) {
        query = query.eq(key, val);
      }
      const { error } = await query;
      if (error) throw error;
      break;
    }
    case 'delete': {
      let query = client.from(op.table).delete();
      for (const [key, val] of Object.entries(op.filters)) {
        query = query.eq(key, val);
      }
      const { error } = await query;
      if (error) throw error;
      break;
    }
  }
}

// ─── Auto-flush on foreground ────────────────────────────────

let listenerActive = false;

/** Start listening for app foreground events to auto-flush */
export function startAutoFlush(): void {
  if (listenerActive) return;
  listenerActive = true;

  AppState.addEventListener('change', async (state) => {
    if (state === 'active') {
      const online = await isOnline();
      if (online) {
        await flushQueue().catch(() => {});
      }
    }
  });
}
