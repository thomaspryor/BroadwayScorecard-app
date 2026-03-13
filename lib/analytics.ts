/**
 * Analytics tracking for Broadway Scorecard mobile app.
 * Wraps PostHog — components never import PostHog directly.
 * Falls back to in-memory queue when PostHog isn't available.
 */

import type PostHog from 'posthog-react-native';

type AnalyticsEvent = {
  event: string;
  properties: Record<string, string | number | boolean | null>;
  timestamp: string;
};

// In-memory fallback queue (events before PostHog initializes)
const MAX_QUEUE_SIZE = 500;
const eventQueue: AnalyticsEvent[] = [];

// Pending identity calls queued before PostHog is ready
let pendingIdentify: { userId: string; properties?: Record<string, string> } | null = null;
let pendingReset = false;

// PostHog client instance — set from _layout.tsx after init
let posthog: PostHog | null = null;

/** Called from _layout.tsx to bridge the PostHog client instance */
export function setPostHogInstance(client: PostHog) {
  posthog = client;

  // Flush any queued identity calls
  if (pendingIdentify) {
    client.identify(pendingIdentify.userId, pendingIdentify.properties);
    pendingIdentify = null;
  }
  if (pendingReset) {
    client.reset();
    pendingReset = false;
  }

  // Flush any queued events (preserve original timestamps)
  for (const entry of eventQueue) {
    client.capture(entry.event, { ...entry.properties, $timestamp: entry.timestamp });
  }
  eventQueue.length = 0;
}

// ─── Core tracking ──────────────────────────────────────

export function trackEvent(event: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (posthog) {
    posthog.capture(event, properties);
  } else {
    // Queue for later flush
    const entry: AnalyticsEvent = {
      event,
      properties,
      timestamp: new Date().toISOString(),
    };
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      eventQueue.splice(0, 100);
    }
    eventQueue.push(entry);
  }

  if (__DEV__) {
    console.log('[Analytics]', event, properties);
  }
}

// ─── Ticket funnel tracking (P0 — affiliate revenue) ───

import type { TicketEventProperties, TicketSource } from './ticket-utils';

/**
 * Ticket links became visible on screen (impression).
 * Fire once per show page load, not per scroll.
 */
export function trackTicketLinksVisible(props: {
  show_id: string;
  show_title: string;
  show_slug: string;
  source: TicketSource;
  platforms: string[];
  affiliate_platforms: string[];
  ticket_link_count: number;
}) {
  trackEvent('ticket_links_visible', {
    ...props,
    platforms: props.platforms.join(','),
    affiliate_platforms: props.affiliate_platforms.join(','),
    has_affiliate: props.affiliate_platforms.length > 0,
  });
}

/**
 * User tapped a ticket link — the primary conversion event.
 * Contains full attribution context for affiliate revenue matching.
 */
export function trackTicketTap(props: TicketEventProperties) {
  trackEvent('ticket_tapped', { ...props });
}

/**
 * In-app browser opened successfully after ticket tap.
 * Confirms the URL actually loaded (vs. a cancelled tap).
 */
export function trackTicketBrowserOpened(props: TicketEventProperties) {
  trackEvent('ticket_browser_opened', { ...props });
}

/**
 * User returned from the in-app browser (dismissed it).
 * Includes time spent on the external site for engagement analysis.
 */
export function trackTicketBrowserDismissed(props: TicketEventProperties & {
  time_on_site_ms: number;
  time_on_site_seconds: number;
}) {
  trackEvent('ticket_browser_dismissed', { ...props });
}

/** Legacy wrapper — kept for any external callers */
export function trackBuyButtonTap(showId: string, showTitle: string, platform: string, url: string) {
  trackEvent('buy_button_tapped', {
    show_id: showId,
    show_title: showTitle,
    platform,
    url,
    source: 'sticky_cta',
  });
}

// ─── Show detail events (P0) ───────────────────────────

export function trackShowDetailViewed(showId: string, showTitle: string, category: string, score: number | null) {
  trackEvent('show_detail_viewed', {
    show_id: showId,
    show_title: showTitle,
    category,
    score: score ?? null,
  });
}

export function trackShowShared(showId: string, showTitle: string) {
  trackEvent('show_shared', {
    show_id: showId,
    show_title: showTitle,
  });
}

export function trackFullReviewTapped(showId: string, outlet: string, criticName: string | null) {
  trackEvent('full_review_tapped', {
    show_id: showId,
    outlet,
    critic_name: criticName,
  });
}

// ─── Search events (P0) ────────────────────────────────

export function trackSearchPerformed(query: string, resultCount: number) {
  trackEvent('search_performed', {
    query,
    result_count: resultCount,
  });
}

export function trackSearchNoResults(query: string) {
  trackEvent('search_no_results', { query });
}

// ─── Browse / Home events (P1) ─────────────────────────

export function trackFilterChanged(filterType: string, value: string, screen: string) {
  trackEvent('filter_changed', { filter_type: filterType, value, screen });
}

export function trackScoreModeToggled(mode: string, screen: string) {
  trackEvent('score_mode_toggled', { mode, screen });
}

export function trackMarketChanged(market: string, screen: string) {
  trackEvent('market_changed', { market, screen });
}

export function trackDataRefreshed(source: string, screen: string) {
  trackEvent('data_refreshed', { source, screen });
}

// ─── Onboarding events (P1) ────────────────────────────

export function trackOnboardingCompleted(pagesViewed: number, totalPages: number) {
  trackEvent('onboarding_completed', { pages_viewed: pagesViewed, total_pages: totalPages });
}

export function trackOnboardingSkipped(pagesViewed: number, totalPages: number) {
  trackEvent('onboarding_skipped', { pages_viewed: pagesViewed, total_pages: totalPages });
}

export function trackOnboardingSignInTapped() {
  trackEvent('onboarding_sign_in_tapped', {});
}

// ─── Settings events (P1) ──────────────────────────────

export function trackCacheCleared() {
  trackEvent('cache_cleared', { screen: 'settings' });
}

// ─── Auth events (P1) ──────────────────────────────────

export function trackSignInStarted(provider: string) {
  trackEvent('sign_in_started', { provider });
}

export function trackSignInCompleted(provider: string) {
  trackEvent('sign_in_completed', { provider });
}

export function trackSignOut() {
  trackEvent('sign_out', {});
}

// ─── Lists events (P1) ────────────────────────────────

export function trackListCreated(listId: string, name: string, isRanked: boolean) {
  trackEvent('list_created', { list_id: listId, name, is_ranked: isRanked });
}

export function trackListDeleted(listId: string) {
  trackEvent('list_deleted', { list_id: listId });
}

export function trackShowAddedToList(listId: string, showId: string, source: 'list_detail' | 'show_page') {
  trackEvent('show_added_to_list', { list_id: listId, show_id: showId, source });
}

export function trackShowRemovedFromList(listId: string, showId: string) {
  trackEvent('show_removed_from_list', { list_id: listId, show_id: showId });
}

export function trackListReordered(listId: string, itemCount: number) {
  trackEvent('list_reordered', { list_id: listId, item_count: itemCount });
}

// ─── Identity helpers ──────────────────────────────────

export function identifyUser(userId: string, properties?: Record<string, string>) {
  if (posthog) {
    posthog.identify(userId, properties);
  } else {
    pendingIdentify = { userId, properties };
  }
}

export function resetAnalyticsUser() {
  if (posthog) {
    posthog.reset();
  } else {
    pendingReset = true;
    pendingIdentify = null;
  }
}

/** Get queued events (for debugging / future flush) */
export function getEventQueue(): readonly AnalyticsEvent[] {
  return eventQueue;
}
