/**
 * Pure helpers for the rating sheet (app/rate/[showId].tsx). No React Native
 * imports so they run under `node --test`.
 *
 * Why this exists: the sheet used to track "dirty" in a ref flipped by an
 * effect, which (a) could not drive the swipe-to-dismiss guard because a ref
 * change does not re-render, and (b) counted an edit that was typed and then
 * undone as unsaved. Comparing against a baseline fixes both.
 */

export interface RateFormValues {
  rating: number | null;
  text: string;
  /** YYYY-MM-DD, or '' when no date is set. */
  date: string;
  /** Photos picked before the first save, still waiting to upload. */
  stagedCount: number;
}

/**
 * True when the form holds something the user would lose by leaving.
 * `baseline` is null while an existing rating is still loading; nothing the
 * user could have typed yet, so it is never dirty then.
 */
export function isRateFormDirty(baseline: RateFormValues | null, current: RateFormValues): boolean {
  if (!baseline) return false;
  if (baseline.rating !== current.rating) return true;
  if (baseline.text.trim() !== current.text.trim()) return true;
  if (baseline.date !== current.date) return true;
  return current.stagedCount > baseline.stagedCount;
}

/** Shown when an update matched no row: the rating was deleted elsewhere. */
export const RATING_GONE_MESSAGE =
  'This rating no longer exists. It may have been deleted on another device.';

export const OFFLINE_SAVE_MESSAGE =
  'You’re offline. Your rating is still here; try Save again when you’re back online.';

export const CONNECTION_SAVE_MESSAGE =
  'Couldn\u2019t reach Broadway Scorecard. Your rating is still here; try Save again.';

const NETWORK_FAILURE = /network request failed|failed to fetch|network error|timed out|aborted/i;

/**
 * Turns a save failure into copy a person can act on. Offline saves used to
 * surface "No valid session. Please sign in again." because the token refresh
 * fails without a network, which told signed-in users to sign in again.
 */
export function friendlySaveError(message: string, online: boolean): string {
  if (!online) return OFFLINE_SAVE_MESSAGE;
  if (NETWORK_FAILURE.test(message)) return CONNECTION_SAVE_MESSAGE;
  if (message === RATING_GONE_MESSAGE) return message;
  return `Save failed: ${message}`;
}
