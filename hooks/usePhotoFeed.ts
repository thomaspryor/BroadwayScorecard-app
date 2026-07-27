/**
 * Aggregates reviews + their photos into the Feed's two views:
 * Timeline (month-grouped entry cards) and Photo wall (flat photo grid).
 * Also tracks per-entry "add a photo" nudge dismissals — persisted so a
 * dismissed nudge stays dismissed across app restarts, never nagware.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserReview } from '@/lib/user-types';
import type { ReviewPhoto } from '@/lib/photo-types';
import { getAllPhotosForUser, getSignedUrls } from '@/lib/photo-storage';

const DISMISSED_NUDGES_KEY = (userId: string) => `@bsc:photoNudgesDismissed:${userId}`;

export interface FeedEntry {
  review: UserReview;
  photos: ReviewPhoto[];
  nudgeDismissed: boolean;
}

export interface FeedMonthGroup {
  monthLabel: string; // e.g. "April 2026"
  entries: FeedEntry[];
}

export interface WallPhoto extends ReviewPhoto {
  show_id: string | null;
}

export function usePhotoFeed(userId: string | null, reviews: UserReview[]) {
  const [photosByReview, setPhotosByReview] = useState<Record<string, ReviewPhoto[]>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [allPhotos, dismissedRaw] = await Promise.all([
        getAllPhotosForUser(userId),
        AsyncStorage.getItem(DISMISSED_NUDGES_KEY(userId)),
      ]);
      if (!mounted.current) return;

      const byReview: Record<string, ReviewPhoto[]> = {};
      for (const photo of allPhotos) {
        (byReview[photo.review_id] ||= []).push(photo);
      }
      setPhotosByReview(byReview);
      setDismissedNudges(new Set(dismissedRaw ? JSON.parse(dismissedRaw) : []));

      if (allPhotos.length > 0) {
        const urls = await getSignedUrls(allPhotos.map(p => p.storage_path));
        if (mounted.current) setSignedUrls(urls);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount/user-change, same pattern as useUserReviews.ts's getAllReviews
  useEffect(() => { if (userId) refresh(); }, [userId, refresh]);

  const dismissNudge = useCallback(async (reviewId: string) => {
    if (!userId) return;
    setDismissedNudges(prev => {
      const next = new Set(prev);
      next.add(reviewId);
      AsyncStorage.setItem(DISMISSED_NUDGES_KEY(userId), JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, [userId]);

  const monthGroups: FeedMonthGroup[] = useMemo(() => {
    const dated = reviews.filter(r => r.date_seen);
    const sorted = [...dated].sort((a, b) => (b.date_seen! < a.date_seen! ? -1 : 1));

    const groups = new Map<string, FeedEntry[]>();
    for (const review of sorted) {
      const d = new Date(`${review.date_seen}T00:00:00`);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const entry: FeedEntry = {
        review,
        photos: photosByReview[review.id] || [],
        nudgeDismissed: dismissedNudges.has(review.id),
      };
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(entry);
    }
    return [...groups.entries()].map(([monthLabel, entries]) => ({ monthLabel, entries }));
  }, [reviews, photosByReview, dismissedNudges]);

  const allPhotosFlat: WallPhoto[] = useMemo(() => {
    const reviewById = new Map(reviews.map(r => [r.id, r]));
    return Object.values(photosByReview)
      .flat()
      .map(photo => ({ ...photo, show_id: reviewById.get(photo.review_id)?.show_id ?? null }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [photosByReview, reviews]);

  return {
    monthGroups,
    allPhotosFlat,
    signedUrls,
    loading,
    dismissNudge,
    refresh,
  };
}
