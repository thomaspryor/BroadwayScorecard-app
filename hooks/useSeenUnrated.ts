/**
 * "Seen it, date not set" picks from the welcome step (BRO-4633, BRO-4727).
 * Rows live in seen_unrated (Broadwayscore
 * supabase/migrations/20261005_profile_onboarding.sql: own-row SELECT,
 * INSERT and DELETE, no UPDATE). Watched lists the ones without a review
 * under To Be Rated as "Date not set" (lib/welcome-onboarding.ts
 * seenUnratedToRate); rating the show is what clears it from there.
 * Like useWatchlist, it does not load itself: the screen refreshes on focus.
 */

import { useCallback, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { SeenUnratedRow } from '@/lib/welcome-onboarding';

const EMPTY: SeenUnratedRow[] = [];

export function useSeenUnrated(userId: string | null) {
  // Rows are kept with the account they belong to, so a sign-out or a switch
  // of account never shows the last person's picks.
  const [state, setState] = useState<{ userId: string | null; rows: SeenUnratedRow[] }>({ userId: null, rows: [] });
  const seenUnrated = state.userId === userId && userId ? state.rows : EMPTY;

  const refreshSeenUnrated = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    const { data, error } = await client
      .from('seen_unrated')
      .select('show_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    // On error keep what is on screen; the next focus retries.
    if (!error) setState({ userId, rows: (data || []) as SeenUnratedRow[] });
  }, [userId]);

  /** "Didn't see it": drop the pick. Throws so the caller can say it failed. */
  const removeSeenUnrated = useCallback(async (showId: string) => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    setState(prev => ({ ...prev, rows: prev.rows.filter(r => r.show_id !== showId) }));
    const { error } = await client.from('seen_unrated').delete().eq('user_id', userId).eq('show_id', showId);
    if (error) {
      await refreshSeenUnrated();
      throw error;
    }
  }, [userId, refreshSeenUnrated]);

  return { seenUnrated, refreshSeenUnrated, removeSeenUnrated };
}
