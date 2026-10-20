/**
 * Watchlist hook — CRUD operations for user's show watchlist.
 *
 * Ported from web's src/hooks/useWatchlist.ts.
 * Adds AsyncStorage cache and uses expo-crypto for UUID fallback.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueue, isOnline } from '@/lib/offline-queue';
import { scheduleRateReminder, cancelAllRemindersForShow } from '@/lib/local-notifications';
import type { WatchlistEntry } from '@/lib/user-types';
import { trackEvent } from '@/lib/analytics';
import { useShows } from '@/lib/data-context';
import { resolveShowTitle } from '@/lib/rate-reminders';

const CACHE_KEY = (userId: string) => `@bsc:watchlist:${userId}`;

// Shared state so all useWatchlist instances stay in sync
type Listener = (entries: WatchlistEntry[]) => void;
const listeners = new Set<Listener>();
let sharedWatchlist: WatchlistEntry[] = [];

function broadcastWatchlist(entries: WatchlistEntry[]) {
  sharedWatchlist = entries;
  listeners.forEach(fn => fn(entries));
}

/** Forget the in-memory watchlist shared by every mounted useWatchlist (sign-out,
 *  account deletion). Without this, screens kept showing the previous account's
 *  shows, and the next account to sign in briefly inherited them. */
export function resetWatchlistState(): void {
  broadcastWatchlist([]);
}

/** Make the device's "How was <show>?" reminder match the planned date. Clears
 *  the show's reminders first: ids are per date, so changing a date used to
 *  leave the old date's reminder scheduled as well. */
function syncRateReminder(showId: string, plannedDate: string | null, showTitle: string): void {
  cancelAllRemindersForShow(showId)
    .then(() => (plannedDate ? scheduleRateReminder(showId, showTitle, plannedDate) : undefined))
    .catch(() => {});
}

/** Drop the cached copy so the next getWatchlist() reads the server (used after
 *  signed-out saves move into the account, hooks/useLocalWatchlistMigration.ts). */
export async function invalidateWatchlistCache(userId: string): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
}

export function useWatchlist(userId: string | null) {
  // Show titles for reminders: no caller passes one, so resolve it here.
  const { shows } = useShows();
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(sharedWatchlist);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);
  // The list is shared across hook instances: a fetch that finishes after a
  // sign-out or account switch must not broadcast (or cache) the old
  // account's list over the new one. Same guard as useUserReviews.
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Subscribe to shared state changes from other hook instances
  useEffect(() => {
    const listener: Listener = (entries) => setWatchlist(entries);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

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
        if (userIdRef.current !== userId) return parsed;
        broadcastWatchlist(parsed);
        // Background refresh — skip state update if mutations happen during fetch
        refreshWatchlist(client, userId, mutationVersion.current).catch(() => {});
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
    versionAtStart?: number,
  ): Promise<WatchlistEntry[]> => {
    const { data, error: err } = await client
      .from('watchlist')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (err) throw err;
    const result = (data || []) as WatchlistEntry[];
    if (userIdRef.current !== uid) return result;
    // Skip state update if a mutation happened while we were fetching
    if (versionAtStart === undefined || versionAtStart === mutationVersion.current) {
      broadcastWatchlist(result);
    }
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

      const optimistic: WatchlistEntry = {
        id: Crypto.randomUUID(),
        user_id: userId,
        show_id: showId,
        planned_date: null,
        created_at: new Date().toISOString(),
      };

      setError(null);
      // Offline fast-path: don't wait for the insert to fail/hang — queue and
      // apply optimistically so the bookmark responds instantly (beta feedback
      // 2026-08-01: "can't hit the bookmark icon while offline").
      if (!(await isOnline())) {
        await enqueue({
          table: 'watchlist',
          action: 'insert',
          data: { user_id: userId, show_id: showId },
          filters: {},
        });
        mutationVersion.current++;
        broadcastWatchlist([optimistic, ...sharedWatchlist]);
        return;
      }
      try {
        const { error: err } = await client.from('watchlist').insert({ user_id: userId, show_id: showId });
        if (err) throw err;
        trackEvent('watchlist_add', { show_id: showId, local: false });
        mutationVersion.current++;
        broadcastWatchlist([optimistic, ...sharedWatchlist]);
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        if (await isNetworkError(e)) {
          await enqueue({
            table: 'watchlist',
            action: 'insert',
            data: { user_id: userId, show_id: showId },
            filters: {},
          });
          mutationVersion.current++;
          broadcastWatchlist([optimistic, ...sharedWatchlist]);
          return;
        }
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
      // Offline fast-path — mirror addToWatchlist
      if (!(await isOnline())) {
        await enqueue({
          table: 'watchlist',
          action: 'delete',
          filters: { user_id: userId, show_id: showId },
        });
        mutationVersion.current++;
        broadcastWatchlist(sharedWatchlist.filter(w => w.show_id !== showId));
        cancelAllRemindersForShow(showId).catch(() => {});
        return;
      }
      try {
        const { error: err } = await client
          .from('watchlist')
          .delete()
          .eq('user_id', userId)
          .eq('show_id', showId);

        if (err) throw err;
        mutationVersion.current++;
        broadcastWatchlist(sharedWatchlist.filter(w => w.show_id !== showId));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        if (await isNetworkError(e)) {
          await enqueue({
            table: 'watchlist',
            action: 'delete',
            filters: { user_id: userId, show_id: showId },
          });
          mutationVersion.current++;
          broadcastWatchlist(sharedWatchlist.filter(w => w.show_id !== showId));
          cancelAllRemindersForShow(showId).catch(() => {});
          return;
        }
        const msg = e instanceof Error ? e.message : 'Failed to remove from watchlist';
        setError(msg);
        throw new Error(msg);
      }

      // Cancel any scheduled notifications for this show
      cancelAllRemindersForShow(showId).catch(() => {});
    },
    [userId],
  );

  const updatePlannedDate = useCallback(
    async (showId: string, plannedDate: string | null, showTitle?: string): Promise<void> => {
      const client = getSupabaseClient();
      if (!client || !userId) return;
      const title = resolveShowTitle(showId, shows, showTitle);

      setError(null);
      // Offline fast-path — mirror addToWatchlist
      if (!(await isOnline())) {
        await enqueue({
          table: 'watchlist',
          action: 'update',
          data: { planned_date: plannedDate },
          filters: { user_id: userId, show_id: showId },
        });
        mutationVersion.current++;
        broadcastWatchlist(sharedWatchlist.map(w => (w.show_id === showId ? { ...w, planned_date: plannedDate } : w)));
        // The date is saved (queued); the reminder is local and needs no network.
        syncRateReminder(showId, plannedDate, title);
        return;
      }
      try {
        const { error: err } = await client
          .from('watchlist')
          .update({ planned_date: plannedDate })
          .eq('user_id', userId)
          .eq('show_id', showId);

        if (err) throw err;
        mutationVersion.current++;
        broadcastWatchlist(sharedWatchlist.map(w => (w.show_id === showId ? { ...w, planned_date: plannedDate } : w)));
        await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
      } catch (e) {
        if (await isNetworkError(e)) {
          await enqueue({
            table: 'watchlist',
            action: 'update',
            data: { planned_date: plannedDate },
            filters: { user_id: userId, show_id: showId },
          });
          mutationVersion.current++;
          broadcastWatchlist(sharedWatchlist.map(w => (w.show_id === showId ? { ...w, planned_date: plannedDate } : w)));
          syncRateReminder(showId, plannedDate, title);
          return;
        }
        const msg = e instanceof Error ? e.message : 'Failed to update date';
        setError(msg);
        throw new Error(msg);
      }

      // Schedule or cancel local notification
      syncRateReminder(showId, plannedDate, title);
    },
    [userId, shows],
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

async function isNetworkError(e: unknown): Promise<boolean> {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|fetch|load failed|timeout|aborterror/i.test(msg)) return true;
  return !(await isOnline());
}
