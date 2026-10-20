/**
 * Shared types + source adapters for the My Shows import flow (app/import.tsx).
 * Ported from the web project's src/lib/show-import.ts — same RawImportEntry
 * contract, same Show Score edge-function adapter. The Mezzanine adapter here
 * takes a document-picker file URI instead of a browser File, and there is no
 * diary-catalog merge (iOS matches against useShows()'s scored catalog only —
 * see app/import.tsx's matchShow).
 */
import { File } from 'expo-file-system';
import { downscaleToJpeg } from './photo-image-pipeline';
import { localToday } from './stats-scope';
import { getSupabaseClient } from './supabase';
import { sanitizeRating } from './rating';
import { parseMezzanineExport, MEZZANINE_FILE_ERROR } from './mezzanine-parse';
import {
  THEATR_BATCH_SIZE,
  THEATR_ERROR_COPY,
  THEATR_MAX_EDGE,
  THEATR_MAX_SCREENSHOTS,
  invokeErrorCode,
  overlapBatches,
  theatrNotices,
  theatrRowsPipeline,
  type TheatrRow,
  type TheatrScreenshotResponse,
} from './theatr-import';

/** One seen-show / want-to-see entry, normalized across sources. */
export interface RawImportEntry {
  title: string;
  venue: string | null;
  /** 0.5–5 half-star; null = source had no usable rating for this entry. */
  rating: number | null;
  /** Original source-scale score for preview display (Show Score 0–100). */
  sourceScore: number | null;
  date: string | null; // YYYY-MM-DD
  reviewText: string | null;
  kind: 'diary' | 'watchlist';
  listName?: string;
  /** True for diary entries rerouted to watchlist (unrated future viewings) —
   *  their auto-select rule differs from list-based watchlist entries. */
  fromDiary?: boolean;
  /** Mezzanine Show class objectId (entry.show.id in the export). */
  mezzShowId?: string;
  /** Theatr reaction on a seen show. Rated by the user's own choice in the
   *  preview (reactionRatings), never by the source; a written score wins. */
  reaction?: TheatrReaction;
}

export type TheatrReaction = 'recommend' | 'mixed' | 'dislike';

export interface ImportAcquireResult {
  entries: RawImportEntry[];
  /** Non-fatal caveats to surface in the preview ("12 reviews had no rating"). */
  notices: string[];
}

// ---------------------------------------------------------------------------
// Show Score
// ---------------------------------------------------------------------------

/** Mirror of the show-score-proxy edge function's response contract
 *  (supabase/functions/show-score-proxy/index.ts — single-channel: always
 *  HTTP 200 with ok:false for handled failures). */
interface ShowScoreProxyResponse {
  ok: boolean;
  error?: 'invalid_slug' | 'unauthorized' | 'rate_limited' | 'not_found' | 'upstream_blocked' | 'internal';
  displayName?: string | null;
  totalOnProfile?: number | null;
  reviews?: Array<{
    reviewId: string | null;
    title: string;
    venue: string | null;
    rating: number | null;
    sourceScore: number | null;
    reviewText: string | null;
    dateSeen: string | null;
  }>;
  unparsed?: number;
  truncated?: boolean;
  incomplete?: boolean;
}

export const SHOW_SCORE_ERROR_COPY: Record<string, string> = {
  invalid_slug: "That doesn't look like a Show Score profile link. Paste your profile URL, e.g. show-score.com/member/your-name.",
  unauthorized: 'Please sign in again and retry.',
  rate_limited: "You've hit the import limit for now — try again in an hour.",
  not_found: "We couldn't find that Show Score member. Check the profile link and try again.",
  upstream_blocked: 'Show Score is blocking our importer right now. Try again in a few hours.',
  internal: 'Something went wrong on our side. Try again in a few minutes.',
};

/** Extract a member slug from a pasted profile URL or bare slug. UX-level
 *  parsing only — the edge function independently validates the slug. */
export function extractMemberSlug(input: string): string | null {
  const s = String(input || '').trim();
  const fromUrl = s.match(/show-score\.com\/member\/([a-z0-9][a-z0-9-]{0,79})/i);
  if (fromUrl) return fromUrl[1].toLowerCase();
  if (/^[a-z0-9][a-z0-9-]{0,79}$/i.test(s)) return s.toLowerCase();
  return null;
}

/** Fetch + normalize a Show Score profile via the show-score-proxy function.
 *  Throws Error with user-ready copy on any handled failure. */
export async function acquireFromShowScore(profileInput: string): Promise<ImportAcquireResult> {
  const slug = extractMemberSlug(profileInput);
  if (!slug) throw new Error(SHOW_SCORE_ERROR_COPY.invalid_slug);

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(SHOW_SCORE_ERROR_COPY.unauthorized);

  const { data, error } = await supabase.functions.invoke<ShowScoreProxyResponse>('show-score-proxy', {
    body: { slug },
  });
  if (error || !data) throw new Error(SHOW_SCORE_ERROR_COPY.internal);
  if (!data.ok) throw new Error(SHOW_SCORE_ERROR_COPY[data.error || 'internal'] || SHOW_SCORE_ERROR_COPY.internal);

  const entries: RawImportEntry[] = (data.reviews || [])
    .filter((r) => r.rating !== null)
    .map((r) => ({
      title: r.title,
      venue: r.venue,
      rating: sanitizeRating(r.rating as number) || null,
      sourceScore: r.sourceScore,
      date: r.dateSeen,
      reviewText: r.reviewText,
      kind: 'diary',
    }));

  const notices: string[] = [];
  if (data.unparsed) notices.push(`${data.unparsed} review(s) had no readable rating and were skipped.`);
  if (data.truncated) notices.push('This profile has more than 1,000 reviews — only the most recent 1,000 were fetched.');
  if (data.incomplete) notices.push(`Show Score stopped responding partway — only ${entries.length} review(s) were fetched. You can re-run the import later to pick up the rest.`);
  return { entries, notices };
}

// ---------------------------------------------------------------------------
// Mezzanine
// ---------------------------------------------------------------------------

/** Parse a Mezzanine JSON export (Settings → Export Data → JSON) given a
 *  document-picker file URI. Parsing lives in ./mezzanine-parse (pure, unit
 *  tested); a file that can't be read gets the same plain-English error as
 *  one that isn't an export. */
export async function acquireFromMezzanine(fileUri: string): Promise<ImportAcquireResult> {
  let text: string;
  try {
    text = await new File(fileUri).text();
  } catch {
    throw new Error(MEZZANINE_FILE_ERROR);
  }
  // localToday, not a UTC split: from ~8pm ET a show planned for tomorrow
  // compared equal to "today" and imported as already seen.
  return parseMezzanineExport(text, localToday());
}

// ---------------------------------------------------------------------------
// Theatr (screenshots) — pure helpers live in ./theatr-import
// ---------------------------------------------------------------------------

export interface PickedScreenshot {
  uri: string;
  width?: number;
  height?: number;
}

/** Downscale + re-encode a screenshot to the JPEG the edge function accepts. */
async function screenshotToJpegBase64(shot: PickedScreenshot): Promise<{ mediaType: string; data: string }> {
  const out = await downscaleToJpeg(shot.uri, {
    maxEdge: THEATR_MAX_EDGE,
    compress: 0.85,
    width: shot.width,
    height: shot.height,
    base64: true,
  });
  if (!out.base64) throw new Error('invalid_images');
  return { mediaType: 'image/jpeg', data: out.base64 };
}

/** Read Theatr screenshots via the theatr-screenshot-import function, two
 *  batches at a time. Throws Error with user-ready copy when nothing usable
 *  came back. */
export async function acquireFromTheatrScreenshots(
  shots: PickedScreenshot[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportAcquireResult> {
  if (shots.length === 0) throw new Error(THEATR_ERROR_COPY.no_shows);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(THEATR_ERROR_COPY.unauthorized);

  // Selection order (orderedSelection): the feed walk needs screenshots top
  // to bottom, which is the order users pick them in.
  const picked = shots.slice(0, THEATR_MAX_SCREENSHOTS);
  const batches = overlapBatches(picked.map((_, i) => i), THEATR_BATCH_SIZE);
  // Indexed by batch so the stitch sees rows in screenshot order, whichever
  // batch finishes first.
  const rowsByBatch: TheatrRow[][] = batches.map(() => []);
  const read = new Set<number>(); // screenshots a successful call covered
  const seen = new Set<number>(); // for progress: each screenshot once
  let unreadable = 0;
  let firstError: string | null = null;
  onProgress?.(0, picked.length);

  const runBatch = async (batchIndex: number) => {
    const batch = batches[batchIndex];
    // One at a time (a 48MP photo decodes to ~200MB; twelve in parallel can
    // get the app killed), and one unreadable image must not sink the rest.
    const images: { mediaType: string; data: string }[] = [];
    const ok: number[] = [];
    for (const i of batch) {
      try {
        images.push(await screenshotToJpegBase64(picked[i]));
        ok.push(i);
      } catch { /* not in `read`, so counted as failed */ }
    }
    if (images.length < batch.length && !firstError) firstError = 'invalid_images';
    try {
      if (images.length === 0) return;
      const { data, error } = await supabase.functions.invoke<TheatrScreenshotResponse>('theatr-screenshot-import', {
        body: { images },
      });
      if (error || !data) throw new Error(invokeErrorCode(error));
      if (!data.ok) throw new Error(data.error || 'internal');
      rowsByBatch[batchIndex] = data.entries || [];
      ok.forEach((i) => read.add(i));
      unreadable += data.unreadableImages || 0;
    } catch (err) {
      const code = err instanceof Error ? err.message : 'internal';
      if (!firstError || firstError === 'invalid_images') firstError = code;
    } finally {
      batch.forEach((i) => seen.add(i));
      onProgress?.(seen.size, picked.length);
    }
  };

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (next < batches.length) await runBatch(next++);
  }));

  const { entries, feedDates, backfillDropped } = theatrRowsPipeline(rowsByBatch, localToday());
  if (entries.length === 0) {
    const code = firstError || 'no_shows';
    throw new Error(THEATR_ERROR_COPY[code] || THEATR_ERROR_COPY.internal);
  }
  return {
    entries,
    notices: theatrNotices(entries, {
      picked: shots.length,
      failedScreenshots: picked.length - read.size,
      unreadable,
      feedDates,
      backfillDropped,
    }),
  };
}
