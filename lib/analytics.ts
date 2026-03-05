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

// PostHog client instance — set from _layout.tsx after initAsync resolves
let posthog: PostHog | null = null;

/** Called from _layout.tsx to bridge the PostHog client instance */
export function setPostHogInstance(client: PostHog) {
  posthog = client;

  // Flush any queued events
  for (const entry of eventQueue) {
    client.capture(entry.event, entry.properties);
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

// ─── Ticket tracking (P0) ──────────────────────────────

/** Track a ticket link tap — used for affiliate revenue attribution */
export function trackTicketTap(showId: string, showTitle: string, platform: string, url: string) {
  trackEvent('ticket_tapped', {
    show_id: showId,
    show_title: showTitle,
    platform,
    url,
    source: 'show_detail',
  });
}

/** Track a sticky buy button tap */
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

// ─── Identity helpers ──────────────────────────────────

export function identifyUser(userId: string, properties?: Record<string, string>) {
  if (posthog) {
    posthog.identify(userId, properties);
  }
}

export function resetAnalyticsUser() {
  if (posthog) {
    posthog.reset();
  }
}

/** Get queued events (for debugging / future flush) */
export function getEventQueue(): readonly AnalyticsEvent[] {
  return eventQueue;
}
