/**
 * Watchlist hook — CRUD operations for user's show watchlist.
 *
 * Ported from web's src/hooks/useWatchlist.ts.
 * Adds AsyncStorage cache and uses expo-crypto for UUID fallback.
 */

import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/lib/supabase';
import type { WatchlistEntry } from '@/lib/user-types';

const CACHE_KEY = (userId: string) => `@bsc:watchlist:${userId}`;

export function useWatchlist(userId: string | null) {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getWatchlist = useCallback(async (): Promise<WatchlistEntry[]> => {
    const client = getSupabaseClient();
    if (!client || !userId) return [];

    setLoading(true);
    setError(null);
    try {
      // Try cache first
      const cached = await AsyncStorage.getItem(CACHE_KEY(userId));
      if (cached) {
        const parsed = JSON.parse(cached) as WatchlistEntry[];
        setWatchlist(parsed);
        // Background refresh
        refreshWatchlist(client, userId).catch(() => {});
        return parsed;
      }

      return await refreshWatchlist(client, userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load watchlist';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshWatchlist = async (
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    uid: string,
  ): Promise<WatchlistEntry[]> => {
    const { data, error: err } = await client
      .from('watchlist')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (err) throw err;
    const result = (data || []) as WatchlistEntry[];
    setWatchlist(result);
    await AsyncStorage.setItem(CACHE_KEY(uid), JSON.stringify(result)).catch(() => {});
    return result;
  };

  const isWatchlisted = useCallback(
    (showId: string): boolean => {
      return watchlist.some(w => w.show_id === showId);
    },
    [watchlist],
  );

  const addToWatchlist = useCallback(
    async (showId: string): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;

      setError(null);
      try {
        const { error: err } = await client.from('watchlist').insert({ user_id: userId, show_id: showId });

        if (err) throw err;

        // Optimistic update
        setWatchlist(prev => [
          {
            id: Crypto.randomUUID(),
            user_id: userId,
            show_id: showId,
            planned_date: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to add to watchlist';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId],
  );

  const removeFromWatchlist = useCallback(
    async (showId: string): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;

      setError(null);
      try {
        const { error: err } = await client
          .from('watchlist')
          .delete()
          .eq('user_id', userId)
          .eq('show_id', showId);

        if (err) throw err;
        setWatchlist(prev => prev.filter(w => w.show_id !== showId));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to remove from watchlist';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId],
  );

  const updatePlannedDate = useCallback(
    async (showId: string, plannedDate: string | null): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;

      setError(null);
      try {
        const { error: err } = await client
          .from('watchlist')
          .update({ planned_date: plannedDate })
          .eq('user_id', userId)
          .eq('show_id', showId);

        if (err) throw err;
        setWatchlist(prev => prev.map(w => (w.show_id === showId ? { ...w, planned_date: plannedDate } : w)));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to update date';
        setError(msg);
        throw new Error(msg);
      }
    },
    [userId],
  );

  return {
    watchlist,
    loading,
    error,
    getWatchlist,
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    updatePlannedDate,
  };
}
