/**
 * Analytics tracking for Broadway Scorecard mobile app.
 * Events are logged and can be forwarded to analytics services.
 * Ticket taps are tracked for affiliate revenue attribution.
 */

type AnalyticsEvent = {
  event: string;
  properties: Record<string, string | number | boolean | null>;
  timestamp: string;
};

// In-memory event queue (can be flushed to a real service later)
const MAX_QUEUE_SIZE = 500;
const eventQueue: AnalyticsEvent[] = [];

export function trackEvent(event: string, properties: Record<string, string | number | boolean | null> = {}) {
  const entry: AnalyticsEvent = {
    event,
    properties,
    timestamp: new Date().toISOString(),
  };
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    eventQueue.splice(0, 100); // drop oldest 100 events
  }
  eventQueue.push(entry);

  // Log in dev for debugging
  if (__DEV__) {
    console.log('[Analytics]', event, properties);
  }
}

/** Track a ticket link tap — used for affiliate revenue attribution */
export function trackTicketTap(showId: string, showTitle: string, platform: string, url: string) {
  trackEvent('ticket_tap', {
    show_id: showId,
    show_title: showTitle,
    platform,
    url,
    source: 'show_detail',
  });
}

/** Track a sticky buy button tap */
export function trackBuyButtonTap(showId: string, showTitle: string, platform: string, url: string) {
  trackEvent('buy_button_tap', {
    show_id: showId,
    show_title: showTitle,
    platform,
    url,
    source: 'sticky_cta',
  });
}

/** Get queued events (for future flush to analytics service) */
export function getEventQueue(): readonly AnalyticsEvent[] {
  return eventQueue;
}
