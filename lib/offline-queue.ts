/**
 * Offline write queue — queues Supabase mutations when offline,
 * flushes when connectivity returns.
 *
 * Operations are stored in AsyncStorage and replayed in order.
 * Each hook applies optimistic local state immediately, so the
 * UI stays responsive regardless of network state.
 *
 * Every op records the account that queued it and is replayed only while
 * that account is signed in. All read-modify-writes of the stored queue go
 * through one mutex, and only one flush runs at a time. The decision rules
 * live in lib/offline-queue-logic.ts (pure, unit-tested).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { getSupabaseClient } from './supabase';
import { captureException } from './sentry';
import { removeReviewPhotoFiles } from './photo-storage';
import { flushPhotoQueue } from './photo-upload-queue';
import {
  OFFLINE_QUEUE_KEY,
  applyFlushResult,
  createMutex,
  decideOnFailure,
  deriveOwner,
  errorInfo,
  isFlushableBy,
  parseQueue,
  singleFlight,
  type QueuedOperation,
} from './offline-queue-logic';

export type { QueuedOperation } from './offline-queue-logic';

const QUEUE_KEY = OFFLINE_QUEUE_KEY;

// ─── Queue persistence ───────────────────────────────────────

const withQueueLock = createMutex();

async function getQueue(): Promise<QueuedOperation[]> {
  return parseQueue<QueuedOperation>(await AsyncStorage.getItem(QUEUE_KEY));
}

async function setQueue(queue: QueuedOperation[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

async function getSessionUserId(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
): Promise<string | null> {
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────

/** Add an operation to the offline queue */
export async function enqueue(
  op: Omit<QueuedOperation, 'id' | 'createdAt' | 'attempts' | 'lastError'>,
): Promise<void> {
  const userId = op.userId ?? deriveOwner(op) ?? undefined;
  await withQueueLock(async () => {
    const queue = await getQueue();
    queue.push({
      ...op,
      ...(userId ? { userId } : {}),
      id: Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    await setQueue(queue);
  });
}

/** Number of pending operations the signed-in account will sync */
export async function getPendingCount(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  const userId = await getSessionUserId(client);
  const queue = await getQueue();
  return queue.filter(op => isFlushableBy(op, userId)).length;
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
 * Flush the queue — replay the signed-in account's pending operations
 * against Supabase, in order. Concurrent calls share one run.
 *
 * Returns the number of operations cleared from the queue (synced, or dropped
 * because they can never sync). A failing op stays queued and stops the run
 * so later ops that depend on it (an update after an insert) keep their order.
 */
export const flushQueue: () => Promise<number> = singleFlight(runFlush);

async function runFlush(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;

  const online = await isOnline();
  if (!online) return 0;

  // Signed out: nothing may be replayed (every write would fail RLS and be
  // dropped). The ops stay queued for when their account signs back in.
  const userId = await getSessionUserId(client);
  if (!userId) return 0;

  const queue = await withQueueLock(getQueue);
  if (queue.length === 0) return 0;

  const removed = new Set<string>();
  const updated = new Map<string, QueuedOperation>();

  // The account can change while the run is in flight (sign-out, switch). A
  // request sent then goes out under another session or none: RLS rejects
  // it, or an update matches 0 rows and still "succeeds". Neither says
  // anything about the op, so the run stops and the op stays queued (replays
  // are safe: inserts carry ids, so a landed one comes back as a duplicate).
  const sameAccount = async () => (await getSessionUserId(client)) === userId;

  for (const op of queue) {
    if (!isFlushableBy(op, userId)) continue;
    if (!(await sameAccount())) break;
    try {
      await executeOperation(client, op);
      if (!(await sameAccount())) break;
      removed.add(op.id);
      continue;
    } catch (e) {
      if (!(await sameAccount())) break;
      const decision = decideOnFailure(op, e);
      if (decision.action === 'done') {
        removed.add(op.id);
        continue;
      }
      if (decision.action === 'drop') {
        removed.add(op.id);
        reportDroppedOp(op, decision.reason, e);
        continue;
      }
      updated.set(op.id, decision.op);
      break;
    }
  }

  if (removed.size > 0 || updated.size > 0) {
    // Re-read: ops enqueued while this flush ran must survive its write.
    await withQueueLock(async () => {
      await setQueue(applyFlushResult(await getQueue(), removed, updated));
    });
  }

  if (__DEV__ && removed.size > 0) {
    console.log(`[OfflineQueue] Cleared ${removed.size} operations`);
  }

  return removed.size;
}

function reportDroppedOp(op: QueuedOperation, reason: string, e: unknown): void {
  const info = errorInfo(e);
  captureException(new Error(`Offline sync dropped a queued ${op.table} ${op.action}: ${reason}`), {
    area: 'offline-queue',
    table: op.table,
    action: op.action,
    reason,
    code: info.code || info.statusCode || 'none',
    attempts: String(op.attempts ?? 0),
  });
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
      // The review's photo rows cascade; its storage files do not.
      const owner = deriveOwner(op);
      if (op.table === 'reviews' && owner && op.filters.id) {
        removeReviewPhotoFiles(owner, op.filters.id).catch(() => {});
      }
      break;
    }
  }
}

// ─── Auto-flush on launch and foreground ─────────────────────

let listenerActive = false;

/** Writes first, then photos: a photo's review row may be one of the queued writes. */
async function flushAll(): Promise<void> {
  await flushQueue().catch(() => 0);
  await flushPhotoQueue().catch(() => undefined);
}

/** Start listening for app foreground events to auto-flush (also flushes once now) */
export function startAutoFlush(): void {
  if (listenerActive) return;
  listenerActive = true;

  flushAll().catch(() => {});

  AppState.addEventListener('change', async (state) => {
    if (state === 'active') {
      const online = await isOnline();
      if (online) {
        await flushAll().catch(() => {});
      }
    }
  });
}
