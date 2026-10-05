/**
 * Signed-out half of the watchlist toggle (BRO-4727, port of the web's
 * src/hooks/useLocalWatchlist.tsx from BRO-4616, "save first, ask later").
 * Callers keep their signed-in path as is and call toggleLocal() where they
 * used to open the sign-in sheet.
 *
 * The save always happens first. Then the sign-in sheet opens (at most once per
 * cooldown); other saves get a toast with a "Keep them" (or "Keep it") sign-in action.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToastSafe } from '@/lib/toast-context';
import { trackEvent } from '@/lib/analytics';
import { shouldPromptAfterSave, type LocalWatchlistEntry } from '@/lib/local-watchlist';
import {
  addLocalShow,
  getLastPromptedAt,
  getLocalWatchlist,
  loadLocalWatchlist,
  markPrompted,
  removeLocalShow,
  subscribeLocalWatchlist,
} from '@/lib/local-watchlist-store';

export function useLocalWatchlist() {
  const { showSignIn } = useAuth();
  const { showToast } = useToastSafe();
  const [localList, setLocalList] = useState<LocalWatchlistEntry[]>(getLocalWatchlist);

  useEffect(() => {
    const unsubscribe = subscribeLocalWatchlist(setLocalList);
    loadLocalWatchlist().then(() => setLocalList(getLocalWatchlist()));
    return unsubscribe;
  }, []);

  const isSavedLocally = useCallback(
    (showId: string) => localList.some(e => e.showId === showId),
    [localList],
  );

  const toggleLocal = useCallback(async (showId: string, source: string) => {
    await loadLocalWatchlist();
    if (getLocalWatchlist().some(e => e.showId === showId)) {
      await removeLocalShow(showId);
      trackEvent('watchlist_remove', { show_id: showId, reason: 'user', local: true, source });
      showToast('Removed from your saved shows', 'info');
      return;
    }
    const next = await addLocalShow(showId);
    trackEvent('watchlist_add', { show_id: showId, local: true, source, local_count: next.length });
    const now = Date.now();
    if (shouldPromptAfterSave(next.length, getLastPromptedAt(), now)) {
      markPrompted(now);
      showSignIn('watchlist_local', 'watchlist_saved');
      return;
    }
    showToast('Saved on this phone', 'success', {
      actionLabel: next.length === 1 ? 'Keep it' : 'Keep them',
      onAction: () => showSignIn('watchlist_local', 'watchlist_toast'),
    });
  }, [showSignIn, showToast]);

  return { localList, isSavedLocally, toggleLocal };
}
