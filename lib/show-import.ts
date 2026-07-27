/**
 * Shared types + source adapters for the My Shows import flow (app/import.tsx).
 * Ported from the web project's src/lib/show-import.ts — same RawImportEntry
 * contract, same Show Score edge-function adapter. The Mezzanine adapter here
 * takes a document-picker file URI instead of a browser File, and there is no
 * diary-catalog merge (iOS matches against useShows()'s scored catalog only —
 * see app/import.tsx's matchShow).
 */
import { File } from 'expo-file-system';
import { getSupabaseClient } from './supabase';
import { sanitizeRating } from './rating';

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
}

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

interface MezzEntry {
  show: { name: string; id: string };
  rating: number | null;
  date: string | null;
  review: string | null;
  production?: { theater?: { name: string; location?: string } };
}

interface MezzExport {
  appVersion?: string;
  data: {
    diaryEntries: MezzEntry[];
    lists: { name: string; shows: { name: string; id?: string }[] }[];
  };
}

/** Parse a Mezzanine JSON export (Settings → Export Data → JSON) given a
 *  document-picker file URI. */
export async function acquireFromMezzanine(fileUri: string): Promise<ImportAcquireResult> {
  const text = await new File(fileUri).text();
  const parsed: MezzExport = JSON.parse(text);
  if (!parsed.data?.diaryEntries) {
    throw new Error('Invalid Mezzanine export — missing data.diaryEntries');
  }

  const entries: RawImportEntry[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const entry of parsed.data.diaryEntries) {
    const date = entry.date ? entry.date.split('T')[0] : null;
    const hasRating = !!(entry.rating && entry.rating > 0);
    // Unrated future entries are plans, not viewings → watchlist.
    const isFuture = date !== null && date > today;
    entries.push({
      title: entry.show.name,
      venue: entry.production?.theater?.name || null,
      // Mezzanine ratings are already 1–5 half-star; sanitize defensively.
      rating: hasRating ? sanitizeRating(entry.rating as number) || null : null,
      sourceScore: null,
      date,
      reviewText: entry.review || null,
      kind: !hasRating && isFuture ? 'watchlist' : 'diary',
      ...(!hasRating && isFuture ? { listName: 'Upcoming', fromDiary: true } : {}),
      ...(entry.show.id ? { mezzShowId: entry.show.id } : {}),
    });
  }

  for (const list of parsed.data.lists || []) {
    for (const show of list.shows) {
      entries.push({
        title: show.name,
        venue: null,
        rating: null,
        sourceScore: null,
        date: null,
        reviewText: null,
        kind: 'watchlist',
        listName: list.name,
        ...(show.id ? { mezzShowId: show.id } : {}),
      });
    }
  }

  return { entries, notices: [] };
}
