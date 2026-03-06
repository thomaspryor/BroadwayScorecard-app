/**
 * User reviews hook — CRUD operations for show ratings.
 *
 * Ported from web's src/hooks/useUserReviews.ts.
 * Adds AsyncStorage cache layer for offline-first behavior.
 */

import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/lib/supabase';
import type { UserReview } from '@/lib/user-types';

const CACHE_KEY = (userId: string) => `@bsc:reviews:${userId}`;

export function useUserReviews(userId: string | null) {
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);

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
    // Skip state update if a mutation happened while we were fetching
    if (versionAtStart === undefined || versionAtStart === mutationVersion.current) {
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
      try {
        if (data.reviewId) {
          const { data: updated, error: err } = await client
            .from('reviews')
            .update({
              rating: data.rating,
              review_text: data.reviewText || null,
              date_seen: data.dateSeen || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.reviewId)
            .eq('user_id', userId)
            .select()
            .single();

          if (err) throw err;
          mutationVersion.current++;
          await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
          return updated as UserReview;
        } else {
          const { data: inserted, error: err } = await client
            .from('reviews')
            .insert({
              user_id: userId,
              show_id: data.showId,
              rating: data.rating,
              review_text: data.reviewText || null,
              date_seen: data.dateSeen || null,
            })
            .select()
            .single();

          if (err) throw err;
          mutationVersion.current++;
          await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
          return inserted as UserReview;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save review';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId],
  );

  const deleteReview = useCallback(
    async (reviewId: string): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;

      setError(null);
      try {
        const { error: err } = await client
          .from('reviews')
          .delete()
          .eq('id', reviewId)
          .eq('user_id', userId);

        if (err) throw err;
        mutationVersion.current++;
        // Remove from local state immediately
        setReviews(prev => prev.filter(r => r.id !== reviewId));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
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
