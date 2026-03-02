/**
 * Image URL helper for Broadway Scorecard.
 *
 * Show images are served from the web CDN at broadwayscorecard.com.
 * Paths in mobile-shows.json are relative (e.g., "/images/shows/.../thumbnail.webp").
 * This helper prepends the CDN base URL.
 *
 * IMPORTANT: Guards against absolute URLs to prevent doubling
 * (e.g., "https://...com/https://...com/..." — caught by pre-mortem critique).
 */

const CDN_BASE = 'https://broadwayscorecard.com';

/**
 * Convert a relative image path to a full CDN URL.
 * Returns null for null/undefined input.
 * Returns the path unchanged if it's already an absolute URL.
 */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${CDN_BASE}${path}`;
}
