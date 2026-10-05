/**
 * Moves shows saved while signed out (lib/local-watchlist-store.ts) into the
 * account after sign-in. Port of migrateLocalWatchlist in the web's
 * src/hooks/useWatchlist.ts (BRO-4616) for BRO-4727. Mounted once, in
 * app/_layout.tsx, so it runs whichever screen the sign-in started from.
 *
 * Shows the account already has, or has rated (rated = seen, so they don't
 * belong on the watchlist), are dropped. A failed insert stays saved locally
 * and is retried on the next sign-in or app launch.
 */

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseClient } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';
import { showsToMigrate } from '@/lib/local-watchlist';
import { getLocalWatchlist, loadLocalWatchlist, removeLocalShow } from '@/lib/local-watchlist-store';
import { useWatchlist, invalidateWatchlistCache } from '@/hooks/useWatchlist';

let inFlight: { userId: string; promise: Promise<number> } | null = null;
// A show that keeps failing (not a duplicate) must not re-run on every
// sign-in event; a few tries per app launch, then the next launch retries.
const MAX_RUNS = 3;
let runs = 0;

async function migrate(userId: string): Promise<number> {
  await loadLocalWatchlist();
  const local = getLocalWatchlist();
  if (local.length === 0) return 0;
  const client = getSupabaseClient();
  if (!client) return 0;
  const [account, rated] = await Promise.all([
    client.from('watchlist').select('show_id').eq('user_id', userId),
    client.from('reviews').select('show_id').eq('user_id', userId),
  ]);
  if (account.error) throw account.error;
  if (rated.error) throw rated.error;
  const ratedIds = new Set((rated.data || []).map((r: { show_id: string }) => r.show_id));
  const toAdd = showsToMigrate(local, (account.data || []).map((w: { show_id: string }) => w.show_id))
    .filter(id => !ratedIds.has(id));
  let added = 0;
  for (const showId of toAdd) {
    if (!getLocalWatchlist().some(e => e.showId === showId)) continue;
    const { error } = await client.from('watchlist').insert({ user_id: userId, show_id: showId });
    // 23505 = UNIQUE(user_id, show_id): already on the account.
    if (!error || error.code === '23505') {
      if (!error) added++;
      await removeLocalShow(showId);
    }
  }
  // Skipped shows (already on the account, or rated) are done too.
  for (const e of local) {
    if (!toAdd.includes(e.showId)) await removeLocalShow(e.showId);
  }
  trackEvent('watchlist_local_migrated', { local_count: local.length, added, failed: toAdd.length - added });
  if (added > 0) await invalidateWatchlistCache(userId);
  return added;
}

function migrateOnce(userId: string): Promise<number> {
  if (!inFlight || inFlight.userId !== userId) {
    if (runs >= MAX_RUNS) return Promise.resolve(0);
    runs++;
    const promise: Promise<number> = migrate(userId)
      .catch(() => 0)
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { userId, promise };
  }
  return inFlight.promise;
}

export function useLocalWatchlistMigration() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { getWatchlist } = useWatchlist(userId);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    migrateOnce(userId).then(added => {
      if (!cancelled && added > 0) getWatchlist();
    });
    return () => { cancelled = true; };
  }, [userId, getWatchlist]);
}

/** Renders nothing; mounts the migration inside AuthProvider. */
export function LocalWatchlistMigrator() {
  useLocalWatchlistMigration();
  return null;
}
