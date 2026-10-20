/**
 * When the Watched tab's photo Feed refetches. Pure (no React Native) so it
 * runs under `node --test`.
 *
 * usePhotoFeed loads once per mount, but its signed URLs live only
 * SIGNED_URL_TTL_SECONDS (5 minutes). A tab stays mounted for hours, so the
 * Feed showed broken images after five minutes and never showed a photo
 * added from the rating sheet until the app restarted.
 */
import { SIGNED_URL_TTL_SECONDS } from './photo-types';

/** Re-sign a minute before the URLs expire while the Feed stays on screen. */
export const PHOTO_URL_REFRESH_MS = Math.max(30, SIGNED_URL_TTL_SECONDS - 60) * 1000;

/** Coming back to the Feed refetches if the last load is older than this,
 *  which picks up photos added elsewhere without refetching on every tap. */
export const PHOTO_FEED_REVISIT_MS = 30_000;

export function shouldRefreshPhotoFeed(lastRefreshMs: number | null, now: number): boolean {
  if (lastRefreshMs === null) return true;
  return now - lastRefreshMs >= PHOTO_FEED_REVISIT_MS;
}
