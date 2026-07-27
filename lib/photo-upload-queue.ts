/**
 * Persisted upload queue for diary photos — retry with visible failure
 * states. Separate from lib/offline-queue.ts (which only replays simple
 * table mutations): a photo upload is a two-step binary-upload + row-insert
 * operation that needs its own status per item so the UI can show
 * "uploading" / "failed, tap to retry" per photo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import type { QueuedPhotoUpload } from '@/lib/photo-types';
import { uploadPhotoFile, insertPhotoRow } from '@/lib/photo-storage';
import { buildPhotoStoragePath } from '@/lib/photo-path';

const QUEUE_KEY = '@bsc:photoUploadQueue';
const MAX_ATTEMPTS = 5;

async function getQueue(): Promise<QueuedPhotoUpload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function setQueue(queue: QueuedPhotoUpload[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

export async function enqueuePhotoUpload(item: Omit<QueuedPhotoUpload, 'status' | 'attempts' | 'lastError' | 'createdAt'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...item,
    status: 'queued',
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  });
  await setQueue(queue);
}

export async function getQueueForReview(reviewId: string): Promise<QueuedPhotoUpload[]> {
  const queue = await getQueue();
  return queue.filter(q => q.reviewId === reviewId);
}

export async function getAllQueued(): Promise<QueuedPhotoUpload[]> {
  return getQueue();
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

/**
 * Marks an item as failed without removing it — see `retryUpload` for the
 * user-visible retry path. Returns true if this call's own logic is what
 * hit the attempts ceiling (informational for the caller's telemetry).
 */
function markFailed(queue: QueuedPhotoUpload[], id: string, message: string): void {
  const item = queue.find(q => q.id === id);
  if (!item) return;
  item.status = 'failed';
  item.attempts += 1;
  item.lastError = message;
}

/**
 * Attempts every queued/failed item once. Successful uploads are removed
 * from the queue; failures stay with status='failed' + lastError for the
 * UI to render a retry affordance. Items over MAX_ATTEMPTS are dropped
 * (surfaced to the caller as `abandoned` so the UI can tell the user).
 */
export async function flushPhotoQueue(): Promise<{ uploaded: string[]; abandoned: string[] }> {
  const online = await isOnline();
  if (!online) return { uploaded: [], abandoned: [] };

  const queue = await getQueue();
  const uploaded: string[] = [];
  const abandoned: string[] = [];
  const remaining: QueuedPhotoUpload[] = [];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) {
      abandoned.push(item.id);
      continue;
    }
    try {
      item.status = 'uploading';
      const path = buildPhotoStoragePath(item.userId, item.reviewId, item.id);
      await uploadPhotoFile(item.userId, item.reviewId, item.id, item.localUri);
      await insertPhotoRow({
        id: item.id,
        reviewId: item.reviewId,
        userId: item.userId,
        storagePath: path,
        width: item.width,
        height: item.height,
        takenAt: item.takenAt,
      });
      item.status = 'done';
      uploaded.push(item.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      markFailed(queue, item.id, msg);
      remaining.push(item);
    }
  }

  await setQueue(remaining);
  return { uploaded, abandoned };
}

/** User-initiated retry for a single failed item (tap the failure badge). */
export async function retryPhotoUpload(id: string): Promise<boolean> {
  const queue = await getQueue();
  const item = queue.find(q => q.id === id);
  if (!item) return false;

  try {
    item.status = 'uploading';
    const path = buildPhotoStoragePath(item.userId, item.reviewId, item.id);
    await uploadPhotoFile(item.userId, item.reviewId, item.id, item.localUri);
    await insertPhotoRow({
      id: item.id,
      reviewId: item.reviewId,
      userId: item.userId,
      storagePath: path,
      width: item.width,
      height: item.height,
      takenAt: item.takenAt,
    });
    await setQueue(queue.filter(q => q.id !== id));
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    item.status = 'failed';
    item.attempts += 1;
    item.lastError = msg;
    await setQueue(queue);
    return false;
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  await setQueue(queue.filter(q => q.id !== id));
}
