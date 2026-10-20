/**
 * Persisted upload queue for diary photos — retry with visible failure
 * states. Separate from lib/offline-queue.ts (which only replays simple
 * table mutations): a photo upload is a two-step binary-upload + row-insert
 * operation that needs its own status per item so the UI can show
 * "uploading" / "failed, tap to retry" per photo.
 *
 * Safety rules (decisions in lib/offline-queue-logic.ts, unit-tested):
 * - every read-modify-write of the stored queue goes through one mutex, and
 *   upload work (auto flush, manual retry) runs one at a time
 * - only the signed-in account's items are uploaded; others wait for it
 * - queued files are copied out of Caches, which iOS may purge
 * - a retry after a partial success (file uploaded, row not) continues to the
 *   row insert instead of failing on the existing file forever
 * - nothing is dropped silently: drops and abandons are reported to Sentry
 *
 * lib/offline-queue.ts's startAutoFlush() flushes this queue at launch and on
 * every foreground, after the write queue.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import type { QueuedPhotoUpload } from '@/lib/photo-types';
import { uploadPhotoFile, insertPhotoRow, removePhotoFile } from '@/lib/photo-storage';
import { buildPhotoStoragePath } from '@/lib/photo-path';
import { getSupabaseClient } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import {
  MAX_PHOTO_ATTEMPTS,
  OFFLINE_QUEUE_KEY,
  applyFlushResult,
  createMutex,
  decidePhotoFailure,
  errorInfo,
  isOwnPendingPhotoFile,
  isStorageDuplicate,
  needsDurableCopy,
  parseQueue,
  pendingInsertIds,
  pendingPhotoUri,
  singleFlight,
  type QueuedOperation,
} from '@/lib/offline-queue-logic';

const QUEUE_KEY = '@bsc:photoUploadQueue';
const MAX_ATTEMPTS = MAX_PHOTO_ATTEMPTS;

/** Guards every read-modify-write of the stored queue. */
const withQueueLock = createMutex();
/** Serializes upload work so a manual retry never races the auto flush. */
const withUploadLock = createMutex();

async function getQueue(): Promise<QueuedPhotoUpload[]> {
  return parseQueue<QueuedPhotoUpload>(await AsyncStorage.getItem(QUEUE_KEY));
}

async function setQueue(queue: QueuedPhotoUpload[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

async function getSessionUserId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Reviews created offline whose row has not synced yet (their photos must wait). */
async function reviewsAwaitingSync(): Promise<Set<string>> {
  try {
    const ops = parseQueue<QueuedOperation>(await AsyncStorage.getItem(OFFLINE_QUEUE_KEY));
    return pendingInsertIds(ops, 'reviews');
  } catch {
    return new Set();
  }
}

/**
 * The image pipeline writes to the OS cache directory, which iOS can purge
 * under storage pressure before a slow upload finishes. Copies the file into
 * documentDirectory/pending-photos/ and returns the durable URI (or the
 * original if the copy fails, which is no worse than before).
 */
async function makeDurable(photoId: string, localUri: string): Promise<string> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir || !needsDurableCopy(localUri, FileSystem.cacheDirectory)) return localUri;
  const dest = pendingPhotoUri(docDir, photoId);
  try {
    await FileSystem.makeDirectoryAsync(dest.slice(0, dest.lastIndexOf('/') + 1), { intermediates: true }).catch(() => {});
    await FileSystem.copyAsync({ from: localUri, to: dest });
    return dest;
  } catch {
    return localUri;
  }
}

/** Deletes a queued file this module copied (never a file it does not own). */
async function deleteLocalCopy(localUri: string): Promise<void> {
  if (!isOwnPendingPhotoFile(localUri, FileSystem.documentDirectory)) return;
  await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
}

async function localFileMissing(localUri: string): Promise<boolean> {
  if (!localUri.startsWith('file://')) return false;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    return !info.exists;
  } catch {
    return false;
  }
}

function report(what: string, reason: string, item: QueuedPhotoUpload, e?: unknown): void {
  const info = errorInfo(e);
  captureException(new Error(`Photo upload ${what}: ${reason}`), {
    area: 'photo-upload-queue',
    reason,
    code: info.code || info.statusCode || 'none',
    attempts: String(item.attempts),
  });
}

export async function enqueuePhotoUpload(item: Omit<QueuedPhotoUpload, 'status' | 'attempts' | 'lastError' | 'createdAt'>): Promise<void> {
  const localUri = await makeDurable(item.id, item.localUri);
  await withQueueLock(async () => {
    const queue = await getQueue();
    queue.push({
      ...item,
      localUri,
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
    await setQueue(queue);
  });
}

/** Queued photos for one review, limited to the given account's items. */
export async function getQueueForReview(reviewId: string, userId: string): Promise<QueuedPhotoUpload[]> {
  const queue = await getQueue();
  return queue.filter(q => q.reviewId === reviewId && q.userId === userId);
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

interface AttemptResult {
  /** Remove the item from the queue */
  remove: boolean;
  /** Updated item to persist when it stays queued */
  next: QueuedPhotoUpload | null;
  uploaded: boolean;
  /** Hit the attempts ceiling on this attempt */
  abandoned: boolean;
}

const KEEP_AS_IS: AttemptResult = { remove: false, next: null, uploaded: false, abandoned: false };

/** True while `userId` is still the signed-in account. */
async function stillSignedInAs(userId: string): Promise<boolean> {
  return (await getSessionUserId()) === userId;
}

/** One upload attempt (file, then row). Never throws. */
async function attemptUpload(item: QueuedPhotoUpload): Promise<AttemptResult> {
  const path = buildPhotoStoragePath(item.userId, item.reviewId, item.id);

  if (await localFileMissing(item.localUri)) {
    report('dropped', 'local-file-missing', item);
    return { remove: true, next: null, uploaded: false, abandoned: false };
  }

  let fileUploaded = false;
  try {
    try {
      await uploadPhotoFile(item.userId, item.reviewId, item.id, item.localUri);
    } catch (e) {
      // `upsert: false`: an earlier attempt uploaded the file but failed on
      // the row insert. The object is there, so carry on to the row.
      if (!isStorageDuplicate(e)) throw e;
    }
    fileUploaded = true;
    await insertPhotoRow({
      id: item.id,
      reviewId: item.reviewId,
      userId: item.userId,
      storagePath: path,
      width: item.width,
      height: item.height,
      takenAt: item.takenAt,
    });
  } catch (e) {
    // Signed out or switched accounts mid-upload: the failure is the session's,
    // not the photo's. Dropping it here would delete the only local copy.
    if (!(await stillSignedInAs(item.userId))) return KEEP_AS_IS;
    const decision = decidePhotoFailure(item, e, MAX_ATTEMPTS);
    switch (decision.action) {
      case 'done':
        break; // row already there: an earlier attempt landed
      case 'orphaned':
        // The review was deleted: its row can never be inserted.
        if (fileUploaded) await removePhotoFile(path).catch(() => {});
        await deleteLocalCopy(item.localUri);
        return { remove: true, next: null, uploaded: false, abandoned: false };
      case 'drop':
        report('dropped', decision.reason, item, e);
        await deleteLocalCopy(item.localUri);
        return { remove: true, next: null, uploaded: false, abandoned: false };
      case 'keep': {
        const next: QueuedPhotoUpload = {
          ...item,
          // Offline or an expired token is not the photo failing: no retry badge.
          status: decision.deferred ? item.status : 'failed',
          attempts: decision.attempts,
          lastError: decision.lastError,
        };
        // Kept (not dropped) so the photo still shows with a retry badge;
        // auto flush stops trying it from here.
        if (decision.abandoned) report('abandoned', 'max-attempts', next, e);
        return { remove: false, next, uploaded: false, abandoned: decision.abandoned };
      }
    }
  }

  await deleteLocalCopy(item.localUri);
  return { remove: true, next: null, uploaded: true, abandoned: false };
}

async function applyResults(removed: Set<string>, updated: Map<string, QueuedPhotoUpload>): Promise<void> {
  if (removed.size === 0 && updated.size === 0) return;
  // Re-read: items enqueued or removed while uploads ran must survive.
  await withQueueLock(async () => {
    await setQueue(applyFlushResult(await getQueue(), removed, updated));
  });
}

/**
 * Attempts every queued/failed item of the signed-in account once.
 * Successful uploads are removed from the queue; failures stay with
 * status='failed' + lastError for the UI to render a retry affordance.
 * Items that reach MAX_ATTEMPTS are reported and returned as `abandoned`;
 * they stay visible (tap to retry) but auto flush no longer tries them.
 * Concurrent calls share one run.
 */
export const flushPhotoQueue: () => Promise<{ uploaded: string[]; abandoned: string[] }> =
  singleFlight(() => withUploadLock(runPhotoFlush));

async function runPhotoFlush(): Promise<{ uploaded: string[]; abandoned: string[] }> {
  const uploaded: string[] = [];
  const abandoned: string[] = [];

  const online = await isOnline();
  if (!online) return { uploaded, abandoned };

  const userId = await getSessionUserId();
  if (!userId) return { uploaded, abandoned };

  const queue = await withQueueLock(getQueue);
  if (queue.length === 0) return { uploaded, abandoned };

  const waitingOnReview = await reviewsAwaitingSync();
  const removed = new Set<string>();
  const updated = new Map<string, QueuedPhotoUpload>();

  for (const item of queue) {
    if (item.userId !== userId) continue; // another account's photo: wait for it to sign in
    if (item.attempts >= MAX_ATTEMPTS) continue; // abandoned: waits for a manual retry
    if (waitingOnReview.has(item.reviewId)) continue; // its review row is still queued
    if (!(await stillSignedInAs(userId))) break; // signed out mid-run: the rest waits

    const result = await attemptUpload(item);
    if (result.remove) removed.add(item.id);
    if (result.next) updated.set(item.id, result.next);
    if (result.uploaded) uploaded.push(item.id);
    if (result.abandoned) abandoned.push(item.id);
  }

  await applyResults(removed, updated);
  return { uploaded, abandoned };
}

/** User-initiated retry for a single failed item (tap the failure badge). */
export async function retryPhotoUpload(id: string): Promise<boolean> {
  return withUploadLock(async () => {
    const userId = await getSessionUserId();
    const queue = await withQueueLock(getQueue);
    const item = queue.find(q => q.id === id);
    if (!item || !userId || item.userId !== userId) return false;
    if ((await reviewsAwaitingSync()).has(item.reviewId)) return false;

    const result = await attemptUpload(item);
    const removed = new Set<string>(result.remove ? [id] : []);
    const updated = new Map<string, QueuedPhotoUpload>(result.next ? [[id, result.next]] : []);
    await applyResults(removed, updated);
    return result.uploaded;
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const gone = await withQueueLock(async () => {
    const queue = await getQueue();
    await setQueue(queue.filter(q => q.id !== id));
    return queue.filter(q => q.id === id);
  });
  for (const item of gone) await deleteLocalCopy(item.localUri);
}

/** Drops every queued photo of a review that is being deleted. */
export async function removeQueuedForReview(reviewId: string): Promise<void> {
  const gone = await withQueueLock(async () => {
    const queue = await getQueue();
    const keep = queue.filter(q => q.reviewId !== reviewId);
    if (keep.length !== queue.length) await setQueue(keep);
    return queue.filter(q => q.reviewId === reviewId);
  });
  for (const item of gone) await deleteLocalCopy(item.localUri);
}
