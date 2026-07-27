/**
 * useMyRatingsMap — signed-in user's ratings keyed by show_id, for poster-card
 * ★ chips (web parity: useMyRating + rated-state chip on cards).
 *
 * Wraps useUserReviews (AsyncStorage-cached, offline-first) and refreshes on
 * screen focus so a rating saved in the rate sheet shows up when you return.
 * Latest viewing (by created_at) wins when a show has multiple reviews —
 * computed explicitly, never trusted from array order (merge paths append).
 *
 * A module-level fetch stamp coalesces refreshes: Home and Browse both mount
 * this hook, and without it every tab focus fired two full getAllReviews()
 * round-trips (the request-storm pattern useWatchlist's shared state avoids).
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUserReviews } from '@/hooks/useUserReviews';

const REFRESH_TTL_MS = 30_000;
let lastFetchAt = 0;

export function useMyRatingsMap(userId: string | null): Map<string, number> {
  const { reviews, getAllReviews } = useUserReviews(userId);

  const refresh = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    if (now - lastFetchAt < REFRESH_TTL_MS) return;
    lastFetchAt = now;
    getAllReviews();
  }, [userId, getAllReviews]);

  useEffect(() => {
    // Populate this hook instance's state even when another screen fetched
    // recently — the stamp only throttles network refreshes, and getAllReviews
    // serves AsyncStorage cache first.
    if (userId) getAllReviews();
  }, [userId, getAllReviews]);

  useFocusEffect(refresh);

  return useMemo(() => {
    const map = new Map<string, number>();
    const newest = new Map<string, string>();
    for (const r of reviews) {
      if (r.rating <= 0) continue;
      const prev = newest.get(r.show_id);
      if (!prev || r.created_at > prev) {
        newest.set(r.show_id, r.created_at);
        map.set(r.show_id, r.rating);
      }
    }
    return map;
  }, [reviews]);
}
