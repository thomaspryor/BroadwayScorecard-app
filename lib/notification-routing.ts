/**
 * Where a tapped notification should take the user. Pure (no React Native
 * imports) so tests/unit/notification-routing.test.mjs can load it.
 *
 * The "How was <show>?" planned-date reminder used to carry only
 * { showSlug, type: 'rate-reminder' }, and the tap handler sent every
 * showSlug to the show page. It now opens the rate screen, prefilled with
 * the planned date.
 */

/** Same prefix lib/local-notifications.ts gives reminder identifiers. */
export const RATE_REMINDER_PREFIX = 'rate-';

export type NotificationTarget =
  | { pathname: '/rate/[showId]'; params: { showId: string; showTitle?: string; suggestedDate?: string } }
  | { pathname: '/show/[slug]'; params: { slug: string } }
  | { pathname: string; params?: undefined };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** "How was Hamilton?" → "Hamilton" (reminders scheduled before showTitle
 *  was added to the payload only have it in the notification title). */
function titleFromReminder(title: string | null): string | null {
  const m = title?.match(/^How was (.+)\?$/);
  return m ? m[1] : null;
}

/** "rate-<showId>-YYYY-MM-DD" → "YYYY-MM-DD" (same fallback). */
function dateFromReminderId(identifier: string | null): string | null {
  if (!identifier?.startsWith(RATE_REMINDER_PREFIX)) return null;
  const m = identifier.match(/-(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

export function notificationTarget(
  data: Record<string, unknown> | null | undefined,
  title?: string | null,
  identifier?: string | null,
): NotificationTarget | null {
  const showSlug = str(data?.showSlug);
  // The server-sent reminder had no type before it was added, and a tap on
  // one still sitting in Notification Center should land on the rate screen.
  const isRateReminder = data?.type === 'rate-reminder' || titleFromReminder(str(title)) !== null;
  if (showSlug && isRateReminder) {
    const params: { showId: string; showTitle?: string; suggestedDate?: string } = { showId: showSlug };
    const showTitle = str(data?.showTitle) ?? titleFromReminder(str(title));
    const date = str(data?.date) ?? dateFromReminderId(str(identifier));
    if (showTitle) params.showTitle = showTitle;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) params.suggestedDate = date;
    return { pathname: '/rate/[showId]', params };
  }
  if (showSlug) return { pathname: '/show/[slug]', params: { slug: showSlug } };
  const screen = str(data?.screen);
  if (screen && screen.startsWith('/')) return { pathname: screen };
  return null;
}
