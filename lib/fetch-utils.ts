/**
 * Network helpers for lib/api.ts: request timeouts, single-flight dedupe and
 * the LRU bookkeeping for the offline show-detail cache. Pure (no React
 * Native imports) so tests/unit/fetch-utils.test.mjs runs them under node.
 */

/** A stalled request on a bad connection otherwise spins forever. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request timed out after ${Math.round(ms / 1000)}s: ${url}`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * fetch() that aborts after `timeoutMs`. The timer covers the whole request,
 * body included, when `read` consumes the body inside the window.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    return await read(response);
  } catch (err) {
    if (controller.signal.aborted) throw new FetchTimeoutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap an async function so overlapping calls share one in-flight promise.
 * A cold launch and a pull-to-refresh racing each other make one request,
 * not two. The slot clears when the call settles, so the next call refetches.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

/** Most-recent-last list of cached show ids. */
export type LruIndex = string[];

export function parseLruIndex(raw: string | null | undefined): LruIndex | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Mark `key` most recently used and trim to `cap`. Returns the new index and
 * the keys pushed out (oldest first), which the caller deletes from storage.
 */
export function touchLru(index: readonly string[], key: string, cap: number): { next: LruIndex; evicted: string[] } {
  const next = index.filter(k => k !== key);
  next.push(key);
  const overflow = Math.max(0, next.length - Math.max(1, cap));
  return { next: next.slice(overflow), evicted: next.slice(0, overflow) };
}
