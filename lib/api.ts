/**
 * API layer for fetching show data from the CDN.
 *
 * Broadway Scorecard has no REST API — data is a static JSON file
 * generated at build time and served from the web CDN.
 */

const CDN_URL = 'https://broadwayscorecard.com/data/mobile-shows.json';

/**
 * Fetch mobile show data from the CDN.
 * Returns the raw JSON string (caller handles parsing).
 * Throws on network or HTTP errors.
 */
export async function fetchMobileShows(): Promise<string> {
  const response = await fetch(CDN_URL, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch shows (HTTP ${response.status})`);
  }

  return response.text();
}
