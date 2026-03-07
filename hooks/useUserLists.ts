/**
 * User Lists hook — CRUD operations for custom show lists.
 *
 * Ported from web's src/hooks/useUserLists.ts.
 * Adds AsyncStorage cache, mutation versioning, offline queue,
 * and pendingMutations guard to prevent stale-fetch stomping.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueue, isOnline } from '@/lib/offline-queue';
import { getUserListsCache, setUserListsCache } from '@/lib/user-cache';
import type { UserList, ListItem } from '@/lib/user-types';

const MAX_LISTS = 50;
const MAX_ITEMS_PER_LIST = 200;
const POSITION_GAP = 1000;
const CACHE_KEY = (userId: string) => `@bsc:lists:${userId}`;

export function useUserLists(userId: string | null) {
  const [lists, setLists] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);
  const pendingMutations = useRef(0);

  // ─── Foreground refresh ──────────────────────────────────
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active' && userId) {
        getLists().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [userId]);

  // ─── Get all lists (cache-first) ────────────────────────
  const getLists = useCallback(async (): Promise<UserList[]> => {
    const client = getSupabaseClient();
    if (!client || !userId) return [];

    setLoading(true);
    setError(null);
    try {
      // Try cache first
      const cached = await getUserListsCache(userId);
      if (cached) {
        const parsed = JSON.parse(cached) as UserList[];
        setLists(parsed);
        // Background refresh — skip if mutations are pending
        refreshLists(client, userId, mutationVersion.current).catch(() => {});
        return parsed;
      }

      return await refreshLists(client, userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load lists';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshLists = async (
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    uid: string,
    versionAtStart?: number,
  ): Promise<UserList[]> => {
    // Fetch lists
    const { data: listsData, error: listsErr } = await client
      .from('lists')
      .select('*')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });

    if (listsErr) throw listsErr;
    if (!listsData || listsData.length === 0) {
      if (canApplyRefresh(versionAtStart)) {
        setLists([]);
        await setUserListsCache(uid, '[]').catch(() => {});
      }
      return [];
    }

    // Fetch all list_items in one query
    const listIds = listsData.map((l: UserList) => l.id);
    const { data: itemsData, error: itemsErr } = await client
      .from('list_items')
      .select('list_id, show_id, position')
      .in('list_id', listIds)
      .order('position', { ascending: true });

    if (itemsErr) throw itemsErr;

    // Group items by list_id
    const itemsByList = new Map<string, string[]>();
    for (const item of (itemsData || [])) {
      const existing = itemsByList.get(item.list_id) || [];
      existing.push(item.show_id);
      itemsByList.set(item.list_id, existing);
    }

    const result: UserList[] = listsData.map((l: UserList) => {
      const showIds = itemsByList.get(l.id) || [];
      return {
        ...l,
        item_count: showIds.length,
        preview_show_ids: showIds.slice(0, 4),
        all_show_ids: showIds,
      };
    });

    // Skip state update if a mutation happened while we were fetching,
    // or if mutations are still pending (prevents stomping optimistic state)
    if (canApplyRefresh(versionAtStart)) {
      setLists(result);
      await setUserListsCache(uid, JSON.stringify(result)).catch(() => {});
    }
    return result;
  };

  /** Safe to apply refresh data only when no mutations occurred/pending */
  const canApplyRefresh = (versionAtStart?: number): boolean => {
    if (pendingMutations.current > 0) return false;
    return versionAtStart === undefined || versionAtStart === mutationVersion.current;
  };

  // ─── Get items for a specific list ───────────────────────
  const getListItems = useCallback(async (listId: string): Promise<ListItem[]> => {
    const client = getSupabaseClient();
    if (!client || !userId) return [];

    try {
      const { data, error: err } = await client
        .from('list_items')
        .select('*')
        .eq('list_id', listId)
        .order('position', { ascending: true });

      if (err) throw err;
      return (data || []) as ListItem[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load list items';
      setError(msg);
      return [];
    }
  }, [userId]);

  // ─── Create list ─────────────────────────────────────────
  const createList = useCallback(async (
    name: string,
    description?: string | null,
    isRanked?: boolean,
  ): Promise<UserList | null> => {
    const client = getSupabaseClient();
    if (!client || !userId) return null;

    if (lists.length >= MAX_LISTS) {
      setError(`Maximum of ${MAX_LISTS} lists reached`);
      return null;
    }

    setError(null);
    pendingMutations.current++;
    try {
      const { data, error: err } = await client
        .from('lists')
        .insert({
          user_id: userId,
          name: name.trim(),
          description: description?.trim() || null,
          is_ranked: isRanked ?? false,
        })
        .select()
        .single();

      if (err) throw err;
      const newList: UserList = { ...data, item_count: 0, preview_show_ids: [], all_show_ids: [] };
      mutationVersion.current++;
      setLists(prev => [newList, ...prev]);
      await invalidateCache();
      return newList;
    } catch (e) {
      if (await isNetworkError(e)) {
        const optimistic: UserList = {
          id: Crypto.randomUUID(),
          user_id: userId,
          name: name.trim(),
          description: description?.trim() || null,
          is_ranked: isRanked ?? false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          item_count: 0,
          preview_show_ids: [],
          all_show_ids: [],
        };
        await enqueue({
          table: 'lists',
          action: 'insert',
          data: { user_id: userId, name: name.trim(), description: description?.trim() || null, is_ranked: isRanked ?? false },
          filters: {},
        });
        mutationVersion.current++;
        setLists(prev => [optimistic, ...prev]);
        return optimistic;
      }
      const msg = e instanceof Error ? e.message : 'Failed to create list';
      setError(msg);
      return null;
    } finally {
      pendingMutations.current--;
    }
  }, [userId, lists.length]);

  // ─── Update list metadata ────────────────────────────────
  const updateList = useCallback(async (
    listId: string,
    updates: { name?: string; description?: string | null; is_ranked?: boolean },
  ): Promise<void> => {
    const client = getSupabaseClient();
    if (!client || !userId) return;

    setError(null);
    pendingMutations.current++;
    try {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
      if (updates.is_ranked !== undefined) payload.is_ranked = updates.is_ranked;

      const { error: err } = await client
        .from('lists')
        .update(payload)
        .eq('id', listId);

      if (err) throw err;
      mutationVersion.current++;
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, ...payload, updated_at: new Date().toISOString() } : l
      ));
      await invalidateCache();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update list';
      setError(msg);
    } finally {
      pendingMutations.current--;
    }
  }, [userId]);

  // ─── Delete list ─────────────────────────────────────────
  const deleteList = useCallback(async (listId: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client || !userId) return;

    setError(null);
    pendingMutations.current++;
    try {
      const { error: err } = await client
        .from('lists')
        .delete()
        .eq('id', listId);

      if (err) throw err;
      mutationVersion.current++;
      setLists(prev => prev.filter(l => l.id !== listId));
      await invalidateCache();
    } catch (e) {
      if (await isNetworkError(e)) {
        await enqueue({ table: 'lists', action: 'delete', filters: { id: listId } });
        mutationVersion.current++;
        setLists(prev => prev.filter(l => l.id !== listId));
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to delete list';
      setError(msg);
    } finally {
      pendingMutations.current--;
    }
  }, [userId]);

  // ─── Add show to list ────────────────────────────────────
  const addToList = useCallback(async (listId: string, showId: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client || !userId) return;

    const list = lists.find(l => l.id === listId);
    if (list && (list.item_count || 0) >= MAX_ITEMS_PER_LIST) {
      setError(`Maximum of ${MAX_ITEMS_PER_LIST} shows per list reached`);
      return;
    }

    setError(null);
    pendingMutations.current++;
    try {
      // Query max position server-side (not from cache) to avoid web+mobile collision
      const { data: maxData } = await client
        .from('list_items')
        .select('position')
        .eq('list_id', listId)
        .order('position', { ascending: false })
        .limit(1);

      const maxPos = maxData && maxData.length > 0 ? maxData[0].position : 0;

      const { error: err } = await client
        .from('list_items')
        .upsert(
          { list_id: listId, show_id: showId, position: maxPos + POSITION_GAP },
          { onConflict: 'list_id,show_id', ignoreDuplicates: true }
        );

      if (err) throw err;

      mutationVersion.current++;
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        const allIds = l.all_show_ids || [];
        if (allIds.includes(showId)) return l; // Already in list (duplicate)
        const count = (l.item_count || 0) + 1;
        const previews = l.preview_show_ids || [];
        return {
          ...l,
          item_count: count,
          preview_show_ids: previews.length < 4 ? [...previews, showId] : previews,
          all_show_ids: [...allIds, showId],
          updated_at: new Date().toISOString(),
        };
      }));
      await invalidateCache();
    } catch (e) {
      if (await isNetworkError(e)) {
        await enqueue({
          table: 'list_items',
          action: 'insert',
          data: { list_id: listId, show_id: showId, position: POSITION_GAP },
          filters: {},
        });
        mutationVersion.current++;
        setLists(prev => prev.map(l => {
          if (l.id !== listId) return l;
          const allIds = l.all_show_ids || [];
          if (allIds.includes(showId)) return l;
          return {
            ...l,
            item_count: (l.item_count || 0) + 1,
            preview_show_ids: (l.preview_show_ids || []).length < 4
              ? [...(l.preview_show_ids || []), showId]
              : l.preview_show_ids,
            all_show_ids: [...allIds, showId],
          };
        }));
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to add to list';
      setError(msg);
    } finally {
      pendingMutations.current--;
    }
  }, [userId, lists]);

  // ─── Remove show from list ───────────────────────────────
  const removeFromList = useCallback(async (listId: string, showId: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client || !userId) return;

    setError(null);
    pendingMutations.current++;
    try {
      const { error: err } = await client
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .eq('show_id', showId);

      if (err) throw err;

      mutationVersion.current++;
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        return {
          ...l,
          item_count: Math.max(0, (l.item_count || 0) - 1),
          preview_show_ids: (l.preview_show_ids || []).filter(id => id !== showId),
          all_show_ids: (l.all_show_ids || []).filter(id => id !== showId),
        };
      }));
      await invalidateCache();
    } catch (e) {
      if (await isNetworkError(e)) {
        await enqueue({
          table: 'list_items',
          action: 'delete',
          filters: { list_id: listId, show_id: showId },
        });
        mutationVersion.current++;
        setLists(prev => prev.map(l => {
          if (l.id !== listId) return l;
          return {
            ...l,
            item_count: Math.max(0, (l.item_count || 0) - 1),
            preview_show_ids: (l.preview_show_ids || []).filter(id => id !== showId),
            all_show_ids: (l.all_show_ids || []).filter(id => id !== showId),
          };
        }));
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to remove from list';
      setError(msg);
    } finally {
      pendingMutations.current--;
    }
  }, [userId]);

  // ─── Reorder list items (ranked lists) ───────────────────
  // Returns false on failure so caller can revert UI + show toast
  const reorderList = useCallback(async (
    listId: string,
    itemIds: string[],
    positions: number[],
  ): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !userId) return false;

    setError(null);
    try {
      const { error: err } = await client.rpc('reorder_list_items', {
        p_list_id: listId,
        p_item_ids: itemIds,
        p_positions: positions,
      });

      if (err) throw err;
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to reorder list';
      setError(msg);
      return false;
    }
  }, [userId]);

  // ─── Update item note ────────────────────────────────────
  const updateItemNote = useCallback(async (itemId: string, note: string | null): Promise<void> => {
    const client = getSupabaseClient();
    if (!client || !userId) return;

    setError(null);
    try {
      const { error: err } = await client
        .from('list_items')
        .update({ note: note?.trim() || null })
        .eq('id', itemId);

      if (err) throw err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update note';
      setError(msg);
    }
  }, [userId]);

  // ─── Cache management ────────────────────────────────────
  const invalidateCache = useCallback(async (): Promise<void> => {
    if (userId) {
      await AsyncStorage.removeItem(CACHE_KEY(userId)).catch(() => {});
    }
  }, [userId]);

  return {
    lists,
    loading,
    error,
    getLists,
    getListItems,
    createList,
    updateList,
    deleteList,
    addToList,
    removeFromList,
    reorderList,
    updateItemNote,
    invalidateCache,
  };
}

async function isNetworkError(e: unknown): Promise<boolean> {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|fetch|load failed|timeout|aborterror/i.test(msg)) return true;
  return !(await isOnline());
}
