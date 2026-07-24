/**
 * useMyRatingsMap — signed-in user's ratings keyed by show_id, for poster-card
 * ★ chips (web parity: useMyRating + rated-state chip on cards).
 *
 * Wraps useUserReviews (AsyncStorage-cached, offline-first) and refreshes on
 * screen focus so a rating saved in the rate sheet shows up when you return.
 * Latest viewing wins when a show has multiple reviews.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUserReviews } from '@/hooks/useUserReviews';

export function useMyRatingsMap(userId: string | null): Map<string, number> {
  const { reviews, getAllReviews } = useUserReviews(userId);

  useEffect(() => {
    if (userId) getAllReviews();
  }, [userId, getAllReviews]);

  useFocusEffect(
    useCallback(() => {
      if (userId) getAllReviews();
    }, [userId, getAllReviews]),
  );

  return useMemo(() => {
    const map = new Map<string, number>();
    // reviews arrive ordered created_at desc — first seen per show is the latest
    for (const r of reviews) {
      if (r.rating > 0 && !map.has(r.show_id)) map.set(r.show_id, r.rating);
    }
    return map;
  }, [reviews]);
}
