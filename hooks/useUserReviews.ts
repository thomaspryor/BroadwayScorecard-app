/**
 * User reviews hook — CRUD operations for show ratings.
 *
 * Ported from web's src/hooks/useUserReviews.ts.
 * Adds AsyncStorage cache layer for offline-first behavior.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueue, isOnline } from '@/lib/offline-queue';
import { errorInfo } from '@/lib/offline-queue-logic';
import { removeReviewPhotoFiles } from '@/lib/photo-storage';
import { removeQueuedForReview } from '@/lib/photo-upload-queue';
import type { UserReview } from '@/lib/user-types';

const CACHE_KEY = (userId: string) => `@bsc:reviews:${userId}`;

export function useUserReviews(userId: string | null) {
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sign-out / account switch: drop the previous account's reviews so they
  // never render (or feed useMyRatingsMap's ★ chips) under the next one.
  const [reviewsOwner, setReviewsOwner] = useState(userId);
  if (reviewsOwner !== userId) {
    setReviewsOwner(userId);
    setReviews([]);
    setError(null);
  }
  // A fetch started for the previous account must not land after the switch.
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  const mutationVersion = useRef(0);
  // Lets deleteReview find the show for a review id without re-creating itself.
  const reviewsRef = useRef(reviews);
  useEffect(() => { reviewsRef.current = reviews; }, [reviews]);

  const getReviewsForShow = useCallback(
    async (showId: string): Promise<UserReview[]> => {
      const client = getSupabaseClient();
      if (!client || !userId) return [];

      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await client
          .from('reviews')
          .select('*')
          .eq('user_id', userId)
          .eq('show_id', showId)
          .order('created_at', { ascending: false });

        if (err) throw err;
        const result = (data || []) as UserReview[];
        if (userIdRef.current !== userId) return result;
        // Merge into existing reviews — replace matching show's reviews, keep the rest
        setReviews(prev => {
          const otherReviews = prev.filter(r => r.show_id !== showId);
          return [...otherReviews, ...result];
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load reviews';
        setError(msg);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const getAllReviews = useCallback(async (): Promise<UserReview[]> => {
    const client = getSupabaseClient();
    if (!client || !userId) return [];

    setLoading(true);
    setError(null);
    try {
      // Try cache first
      const cached = await AsyncStorage.getItem(CACHE_KEY(userId));
      if (cached) {
        const parsed = JSON.parse(cached) as UserReview[];
        if (userIdRef.current !== userId) return parsed;
        setReviews(parsed);
        // Background refresh — skip state update if mutations happen during fetch
        refreshAllReviews(client, userId, mutationVersion.current).catch(() => {});
        return parsed;
      }

      return await refreshAllReviews(client, userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load reviews';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshAllReviews = async (
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    uid: string,
    versionAtStart?: number,
  ): Promise<UserReview[]> => {
    const { data, error: err } = await client
      .from('reviews')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (err) throw err;
    const result = (data || []) as UserReview[];
    // Skip state update if a mutation happened while we were fetching, or the
    // signed-in account changed
    const sameUser = userIdRef.current === uid;
    if (sameUser && (versionAtStart === undefined || versionAtStart === mutationVersion.current)) {
      setReviews(result);
    }

    // Update cache
    await AsyncStorage.setItem(CACHE_KEY(uid), JSON.stringify(result)).catch(() => {});
    return result;
  };

  const saveReview = useCallback(
    async (data: {
      showId: string;
      rating: number;
      reviewText?: string | null;
      dateSeen?: string | null;
      reviewId?: string;
    }): Promise<UserReview | null> => {
      const client = getSupabaseClient();
      if (!client || !userId) {
        throw new Error('Not signed in. Please refresh and try again.');
      }

      setError(null);
      // Client-generated so the optimistic row, any queued edits/deletes and
      // photos keyed by it all point at the row the queued insert creates. It
      // also makes a replay after a lost response a harmless duplicate (23505).
      const newReviewId = Crypto.randomUUID();
      try {
        if (data.reviewId) {
          const updateData = {
            rating: data.rating,
            review_text: data.reviewText || null,
            date_seen: data.dateSeen || null,
            updated_at: new Date().toISOString(),
          };
          const { data: updated, error: err } = await client
            .from('reviews')
            .update(updateData)
            .eq('id', data.reviewId)
            .eq('user_id', userId)
            .select()
            .single();

          if (err) throw err;
          mutationVersion.current++;
          await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
          return updated as UserReview;
        } else {
          const insertData = {
            id: newReviewId,
            user_id: userId,
            show_id: data.showId,
            rating: data.rating,
            review_text: data.reviewText || null,
            date_seen: data.dateSeen || null,
          };
          const { data: inserted, error: err } = await client
            .from('reviews')
            .insert(insertData)
            .select()
            .single();

          if (err) throw err;
          mutationVersion.current++;
          await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
          return inserted as UserReview;
        }
      } catch (e) {
        // Network error — queue for later and apply optimistic state
        if (await isNetworkError(e)) {
          const now = new Date().toISOString();
          if (data.reviewId) {
            await enqueue({
              table: 'reviews',
              action: 'update',
              data: {
                rating: data.rating,
                review_text: data.reviewText || null,
                date_seen: data.dateSeen || null,
                updated_at: now,
              },
              filters: { id: data.reviewId, user_id: userId },
              userId,
            });
            // Optimistic local update
            const optimistic: UserReview = {
              ...(reviews.find(r => r.id === data.reviewId) as UserReview),
              rating: data.rating,
              review_text: data.reviewText || null,
              date_seen: data.dateSeen || null,
              updated_at: now,
            };
            mutationVersion.current++;
            setReviews(prev => prev.map(r => r.id === data.reviewId ? optimistic : r));
            return optimistic;
          } else {
            await enqueue({
              table: 'reviews',
              action: 'insert',
              data: {
                id: newReviewId,
                user_id: userId,
                show_id: data.showId,
                rating: data.rating,
                review_text: data.reviewText || null,
                date_seen: data.dateSeen || null,
              },
              filters: {},
              userId,
            });
            // Optimistic local insert
            const optimistic: UserReview = {
              id: newReviewId,
              user_id: userId,
              show_id: data.showId,
              rating: data.rating,
              review_text: data.reviewText || null,
              date_seen: data.dateSeen || null,
              visibility: 'private',
              created_at: now,
              updated_at: now,
            };
            mutationVersion.current++;
            setReviews(prev => [optimistic, ...prev]);
            return optimistic;
          }
        }
        const msg = e instanceof Error ? e.message : 'Failed to save review';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId, reviews],
  );

  const deleteReview = useCallback(
    async (reviewId: string): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;

      setError(null);
      const showId = reviewsRef.current.find(r => r.id === reviewId)?.show_id;
      try {
        const { error: err } = await client
          .from('reviews')
          .delete()
          .eq('id', reviewId)
          .eq('user_id', userId);

        if (err) throw err;
        // A welcome "seen it" pick (seen_unrated) for this show would otherwise
        // put it back under To Be Rated as "Date not set" (web parity, BRO-4633).
        if (showId) {
          client.from('seen_unrated').delete().eq('user_id', userId).eq('show_id', showId)
            .then(() => {}, () => {});
        }
        // The photo rows cascade with the review; their storage files do not.
        // Best effort, after the delete landed, so a failed delete never
        // leaves a surviving review with missing photos.
        removeReviewPhotoFiles(userId, reviewId).catch(() => {});
        removeQueuedForReview(reviewId).catch(() => {});
        mutationVersion.current++;
        setReviews(prev => prev.filter(r => r.id !== reviewId));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        if (await isNetworkError(e)) {
          // The queued delete removes the storage files when it replays.
          await enqueue({
            table: 'reviews',
            action: 'delete',
            filters: { id: reviewId, user_id: userId },
            userId,
          });
          removeQueuedForReview(reviewId).catch(() => {});
          mutationVersion.current++;
          setReviews(prev => prev.filter(r => r.id !== reviewId));
          return;
        }
        const msg = e instanceof Error ? e.message : 'Failed to delete review';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId],
  );

  // Invalidate AsyncStorage cache so My Shows gets fresh data
  const invalidateCache = useCallback(async () => {
    if (userId) {
      await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
    }
  }, [userId]);

  return {
    reviews,
    loading,
    error,
    getReviewsForShow,
    getAllReviews,
    saveReview,
    deleteReview,
    invalidateCache,
  };
}

/** Check if an error is a network/connectivity issue (vs a server/auth error) */
async function isNetworkError(e: unknown): Promise<boolean> {
  // supabase-js errors are plain objects, not Error instances.
  const msg = errorInfo(e).text;
  if (/network|fetch|load failed|timeout|aborterror/i.test(msg)) return true;
  // Also check actual connectivity
  return !(await isOnline());
}
