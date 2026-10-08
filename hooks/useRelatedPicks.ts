/**
 * Curated "shows you might like" picks (see lib/related-shows.ts).
 * Cache first (instant, offline), then one CDN fetch per app session. Returns null until
 * loaded or if both fail; callers then fall back to the local ranking.
 */
import { useEffect, useState } from 'react';
import { fetchRelatedPicks } from '@/lib/api';
import { getCachedRelatedPicks } from '@/lib/cache';
import { decodeRelatedPicks, type RelatedPicks } from '@/lib/related-shows';

let sessionFetch: Promise<string | null> | null = null;

export function useRelatedPicks(): RelatedPicks | null {
  const [picks, setPicks] = useState<RelatedPicks | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (raw: string | null) => {
      if (cancelled || !raw) return;
      const decoded = decodeRelatedPicks(raw);
      if (decoded.size > 0) setPicks(decoded);
    };
    getCachedRelatedPicks().then(apply).catch(() => {});
    sessionFetch ??= fetchRelatedPicks();
    sessionFetch.then(apply).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return picks;
}
