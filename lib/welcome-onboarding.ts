/**
 * Welcome step after a brand-new account's first sign-in. App port of the
 * web's src/lib/welcome-onboarding.ts (BRO-4619) for BRO-4727.
 *
 * Pure decisions only (no React Native, no Supabase) so tests/unit can load
 * it. The sheet is components/onboarding/WelcomeSheet.tsx, opened by
 * WelcomeGate.tsx.
 *
 * Never twice, across web and app: the server column profiles.onboarding_seen_at
 * (NULL = not yet) is claimed atomically by claim_onboarding() before the
 * sheet opens (Broadwayscore supabase/migrations/20261005_profile_onboarding.sql).
 * Whichever of web or app claims it first shows it; the other never does.
 * AsyncStorage only saves the claim call on later launches.
 */

/** Only accounts this young get the welcome; older ones never do. */
export const WELCOME_ACCOUNT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A phone clock a little behind the server still counts a just-made account as new. */
export const WELCOME_CLOCK_SKEW_MS = 2 * 60 * 1000;

export const WELCOME_STEPS = ['shows', 'import', 'done'] as const;
export type WelcomeStep = typeof WELCOME_STEPS[number];

export function welcomeSeenKey(userId: string): string {
  return `@bsc:welcome_seen:${userId}`;
}

export interface WelcomeProfileState {
  /** undefined = the column is not in this database: treat as "do not show". */
  onboarding_seen_at?: string | null;
  created_at?: string | null;
}

/**
 * Whether to try claiming the welcome for this account. A true answer still
 * needs claim_onboarding() to return true before the sheet opens.
 */
export function shouldOfferWelcome(input: {
  profile: WelcomeProfileState | null;
  now: number;
  locallySeen: boolean;
}): boolean {
  const { profile, now, locallySeen } = input;
  if (!profile || locallySeen) return false;
  // Strictly null: undefined means the column is missing.
  if (profile.onboarding_seen_at !== null) return false;
  const created = profile.created_at ? Date.parse(profile.created_at) : NaN;
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= -WELCOME_CLOCK_SKEW_MS && age <= WELCOME_ACCOUNT_MAX_AGE_MS;
}

export function nextWelcomeStep(step: WelcomeStep): WelcomeStep {
  const i = WELCOME_STEPS.indexOf(step);
  return WELCOME_STEPS[Math.min(i + 1, WELCOME_STEPS.length - 1)];
}

// ─── Which posters to show ──────────────────────────────────────────────

export interface WelcomeShowSource {
  id: string;
  title: string;
  slug: string;
  status: string;
  category?: string;
  openingDate?: string | null;
  closingDate?: string | null;
  /** Poster path or URL (poster, else thumbnail); null = no image. */
  image: string | null;
  reviewCount: number;
}

export interface WelcomeShow {
  id: string;
  title: string;
  slug: string;
  image: string;
}

/** 18 posters = 6 rows of 3, same groups and sizes as the web sheet. */
export const WELCOME_LONG_RUNNER_COUNT = 8;
export const WELCOME_RECENT_COUNT = 7;
export const WELCOME_CLOSED_COUNT = 3;
/** A show running at least this long counts as a long-runner. */
export const WELCOME_LONG_RUNNER_YEARS = 3;
/** Review floors that keep stub rows out (long-runners predate most coverage). */
export const WELCOME_MIN_REVIEWS_LONG_RUNNER = 5;
export const WELCOME_MIN_REVIEWS_RECENT = 20;
export const WELCOME_MIN_REVIEWS_CLOSED = 30;
/** "Recent" closings: within this many days of today. */
export const WELCOME_CLOSED_WINDOW_DAYS = 730;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const byReviewsThenTitle = (a: WelcomeShowSource, b: WelcomeShowSource) =>
  b.reviewCount - a.reviewCount || a.title.localeCompare(b.title);
const byOpeningThenTitle = (a: WelcomeShowSource, b: WelcomeShowSource) =>
  (a.openingDate || '').localeCompare(b.openingDate || '') || a.title.localeCompare(b.title);

/**
 * The Broadway shows a new member is most likely to have seen: the longest
 * running ones still open (oldest first), then recent hits by critic review
 * count, then the biggest recent closings. One poster per title.
 */
export function pickWelcomeShows(shows: WelcomeShowSource[], today: string): WelcomeShow[] {
  const longRunnerSince = addDays(today, -Math.round(WELCOME_LONG_RUNNER_YEARS * 365.25));
  const closedSince = addDays(today, -WELCOME_CLOSED_WINDOW_DAYS);
  const eligible = shows.filter(s => (s.category ?? 'broadway') === 'broadway' && !!s.image);
  const open = eligible.filter(s => s.status === 'open' && !!s.openingDate && s.openingDate <= today);

  const longRunners = open
    .filter(s => (s.openingDate as string) <= longRunnerSince && s.reviewCount >= WELCOME_MIN_REVIEWS_LONG_RUNNER)
    .sort(byOpeningThenTitle);
  const recent = open
    .filter(s => (s.openingDate as string) > longRunnerSince && s.reviewCount >= WELCOME_MIN_REVIEWS_RECENT)
    .sort(byReviewsThenTitle);
  const closed = eligible
    .filter(s => s.status === 'closed' && s.reviewCount >= WELCOME_MIN_REVIEWS_CLOSED
      && !!s.closingDate && s.closingDate >= closedSince && s.closingDate <= today)
    .sort(byReviewsThenTitle);

  const seen = new Set<string>();
  const take = (list: WelcomeShowSource[], n: number) => {
    const out: WelcomeShowSource[] = [];
    for (const s of list) {
      if (out.length >= n) break;
      const k = titleKey(s.title);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  };

  return [
    ...take(longRunners, WELCOME_LONG_RUNNER_COUNT),
    ...take(recent, WELCOME_RECENT_COUNT),
    ...take(closed, WELCOME_CLOSED_COUNT),
  ].map(s => ({ id: s.id, title: s.title, slug: s.slug, image: s.image as string }));
}

// ─── Saving a pick ──────────────────────────────────────────────────────

export interface WelcomePick {
  showId: string;
  /** 0.5–5 half stars, or null when they only said "seen it". */
  rating: number | null;
}

export type WelcomeWrite =
  | { table: 'reviews'; row: { show_id: string; rating: number; date_seen: null } }
  | { table: 'seen_unrated'; row: { show_id: string } };

/**
 * A rated pick is a diary entry with no date. An unrated pick is "seen, date
 * not set": a seen_unrated row, listed under To Be Rated. No seen date is
 * ever made up for either.
 */
export function welcomeWriteFor(pick: WelcomePick): WelcomeWrite {
  if (pick.rating !== null && pick.rating >= 0.5 && pick.rating <= 5) {
    return { table: 'reviews', row: { show_id: pick.showId, rating: pick.rating, date_seen: null } };
  }
  return { table: 'seen_unrated', row: { show_id: pick.showId } };
}

/**
 * Saving one pick, given where the show already is. Already seen (a review or
 * an earlier pick): nothing to write. On the watchlist only (e.g. a show saved
 * before sign-in that moved over mid-sheet): it is written all the same, stars
 * kept, and the watchlist row goes, as rating a show does (app/rate, owner
 * rule 2026-07-12), so it is not listed as both seen and still to see.
 * Web parity: Broadwayscore src/lib/welcome-onboarding.ts welcomeSaveStep.
 */
export function welcomeSaveStep(pick: WelcomePick, where: { seen: boolean; watchlisted: boolean }): { write: WelcomeWrite | null; clearWatchlist: boolean } {
  if (where.seen) return { write: null, clearWatchlist: false };
  return { write: welcomeWriteFor(pick), clearWatchlist: where.watchlisted };
}

/** "Done" leads to My Shows when there is now something there to look at. */
export function welcomeFinishDestination(input: { showsAdded: number }): 'my-shows' | 'stay' {
  return input.showsAdded > 0 ? 'my-shows' : 'stay';
}

/**
 * The done step's first line. Only mentions To Be Rated when some picks went
 * in without stars, and says which ones when only some did.
 */
export function welcomeDoneMessage(input: { showsAdded: number; unratedAdded: number }): string {
  const { showsAdded } = input;
  if (showsAdded <= 0) return 'Rate a show from its page any time, and it lands in your diary.';
  const unrated = Math.min(Math.max(input.unratedAdded, 0), showsAdded);
  const added = `${showsAdded} ${showsAdded === 1 ? 'show' : 'shows'} added`;
  if (unrated === 0) return `${added} to your diary.`;
  const who = unrated === showsAdded
    ? (showsAdded === 1 ? 'It waits' : 'They wait')
    : (unrated === 1 ? 'The one without stars waits' : `The ${unrated} without stars wait`);
  return `${added}. ${who} for you under To Be Rated, where you can add the date and stars.`;
}

// ─── To Be Rated ────────────────────────────────────────────────────────

export interface SeenUnratedRow {
  show_id: string;
  created_at: string;
}

/**
 * Welcome picks still waiting for stars: newest first, minus shows that now
 * have a review or are already in To Be Rated from a past-dated watchlist row
 * (same rules as the web's My Shows toBeRatedEntries).
 */
export function seenUnratedToRate(
  rows: SeenUnratedRow[],
  ratedShowIds: Set<string>,
  alreadyToRate: Set<string>,
): SeenUnratedRow[] {
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(r => !ratedShowIds.has(r.show_id) && !alreadyToRate.has(r.show_id));
}
