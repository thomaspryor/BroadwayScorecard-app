/**
 * Per-review photo CRUD — picks, queues, uploads, and deletes photos
 * attached to a single diary entry. Mirrors useUserReviews.ts's shape
 * (state + callbacks) for consistency with the rest of the app.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import type { ReviewPhoto, QueuedPhotoUpload } from '@/lib/photo-types';
import { MAX_PHOTOS_PER_REVIEW } from '@/lib/photo-types';
import { pickAndProcessPhotos } from '@/lib/photo-image-pipeline';
import { getPhotosForReview, getSignedUrls, deletePhoto as deletePhotoRemote } from '@/lib/photo-storage';
import { buildPhotoStoragePath } from '@/lib/photo-path';
import { enqueuePhotoUpload, getQueueForReview, flushPhotoQueue, retryPhotoUpload } from '@/lib/photo-upload-queue';

export interface DisplayPhoto {
  id: string;
  status: 'queued' | 'uploading' | 'failed' | 'done';
  localUri?: string; // for queued/uploading/failed items, shown immediately
  signedUrl?: string; // for done items, resolved lazily
  lastError?: string | null;
}

export function useReviewPhotos(reviewId: string | null, userId: string | null) {
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [pending, setPending] = useState<QueuedPhotoUpload[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const totalCount = photos.length + pending.length;

  const refresh = useCallback(async () => {
    if (!reviewId || !userId) return;
    setLoading(true);
    try {
      const [uploaded, queued] = await Promise.all([
        getPhotosForReview(reviewId, userId),
        getQueueForReview(reviewId),
      ]);
      if (!mounted.current) return;
      setPhotos(uploaded);
      setPending(queued);

      if (uploaded.length > 0) {
        const urls = await getSignedUrls(uploaded.map(p => p.storage_path));
        if (mounted.current) setSignedUrls(urls);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [reviewId, userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount/id-change, same pattern as useUserReviews.ts's getAllReviews
  useEffect(() => { if (reviewId && userId) refresh(); }, [reviewId, userId, refresh]);

  const remainingSlots = MAX_PHOTOS_PER_REVIEW - photos.length - pending.filter(p => p.status !== 'failed').length;

  const addPhotos = useCallback(async () => {
    if (!reviewId || !userId || remainingSlots <= 0) return;

    const processed = await pickAndProcessPhotos(remainingSlots);
    for (const photo of processed) {
      const id = Crypto.randomUUID();
      await enqueuePhotoUpload({
        id,
        reviewId,
        userId,
        localUri: photo.uri,
        width: photo.width,
        height: photo.height,
        takenAt: null,
      });
    }
    await refresh();
    // Fire-and-forget upload attempt; UI already shows "queued"/"uploading" state.
    flushPhotoQueue().finally(() => { if (mounted.current) refresh(); });
  }, [reviewId, userId, remainingSlots, refresh]);

  /** Adds already-processed local URIs (e.g. from the "From that night" suggestion). */
  const addProcessedPhotos = useCallback(async (items: { uri: string; width: number; height: number }[]) => {
    if (!reviewId || !userId) return;
    const slots = remainingSlots;
    for (const photo of items.slice(0, slots)) {
      const id = Crypto.randomUUID();
      await enqueuePhotoUpload({
        id,
        reviewId,
        userId,
        localUri: photo.uri,
        width: photo.width,
        height: photo.height,
        takenAt: null,
      });
    }
    await refresh();
    flushPhotoQueue().finally(() => { if (mounted.current) refresh(); });
  }, [reviewId, userId, remainingSlots, refresh]);

  const retry = useCallback(async (id: string) => {
    await retryPhotoUpload(id);
    await refresh();
  }, [refresh]);

  const removePhoto = useCallback(async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    await deletePhotoRemote(photoId, photo.storage_path);
    await refresh();
  }, [photos, refresh]);

  return {
    photos,
    pending,
    signedUrls,
    loading,
    remainingSlots,
    totalCount,
    addPhotos,
    addProcessedPhotos,
    retry,
    removePhoto,
    refresh,
  };
}

export { buildPhotoStoragePath };
