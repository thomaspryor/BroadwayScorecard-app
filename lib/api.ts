/**
 * API layer for fetching show data from the CDN.
 *
 * Broadway Scorecard has no REST API — data is a static JSON file
 * generated at build time and served from the web CDN.
 */

const CDN_BASE = 'https://broadwayscorecard.com/data';
const SHOWS_URL = `${CDN_BASE}/mobile-shows.json`;

/**
 * Fetch mobile show data from the CDN.
 * Returns the raw JSON string (caller handles parsing).
 * Throws on network or HTTP errors.
 */
export async function fetchMobileShows(): Promise<string> {
  const response = await fetch(SHOWS_URL, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch shows (HTTP ${response.status})`);
  }

  return response.text();
}

/**
 * Fetch per-show detail data from the CDN.
 * Returns parsed JSON (small files, ~5KB each).
 * Returns null on 404 (show detail not generated yet).
 */
export async function fetchShowDetail(showId: string): Promise<object | null> {
  const url = `${CDN_BASE}/shows/${encodeURIComponent(showId)}.json`;
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Failed to fetch show detail (HTTP ${response.status})`);
  }

  return response.json();
}
