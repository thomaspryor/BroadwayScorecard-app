/**
 * Ticket link utilities — affiliate URL decoration & tracking helpers.
 *
 * Centralizes all ticket URL logic so affiliate params are applied consistently
 * across every surface (show detail, sticky CTA, home carousels, etc.).
 */

// ─── Affiliate configuration ─────────────────────────────────
// TODO: Replace placeholder values once TodayTix affiliate approval comes through.
// The config shape supports any platform — just add a new entry.

export interface AffiliateConfig {
  /** URL query params to append */
  params: Record<string, string>;
  /** Whether this affiliate program is active */
  enabled: boolean;
}

const AFFILIATE_CONFIG: Record<string, AffiliateConfig> = {
  TodayTix: {
    params: {
      // Placeholder — replace with actual TodayTix affiliate params
      utm_source: 'broadwayscorecard',
      utm_medium: 'affiliate',
      utm_campaign: 'app',
    },
    enabled: false, // Flip to true once approved
  },
};

// ─── URL decoration ──────────────────────────────────────────

/**
 * Build a ticket URL with affiliate params if applicable.
 * Returns the original URL unchanged if no affiliate config exists or is disabled.
 */
export function buildTicketUrl(
  url: string,
  platform: string,
  source: TicketSource,
): { url: string; isAffiliate: boolean } {
  const config = AFFILIATE_CONFIG[platform];
  if (!config?.enabled) {
    return { url, isAffiliate: false };
  }

  try {
    const parsed = new URL(url);
    // Append affiliate params (don't overwrite existing ones)
    for (const [key, value] of Object.entries(config.params)) {
      if (!parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, value);
      }
    }
    // Add source tracking so we know which surface drove the click
    parsed.searchParams.set('utm_content', source);
    return { url: parsed.toString(), isAffiliate: true };
  } catch {
    // Invalid URL — return as-is
    return { url, isAffiliate: false };
  }
}

// ─── Shared types for ticket tracking ────────────────────────

/** Where the ticket link was displayed */
export type TicketSource =
  | 'show_detail'        // Main link buttons on show page
  | 'sticky_cta'         // Sticky buy button
  | 'home_carousel'      // Home screen featured/best-of carousel
  | 'browse_card'        // Browse list card
  | 'search_result'      // Search result card
  | 'to_watch_card'      // To Watch / watchlist card
  | 'showtimes'          // Showtimes grid
  | 'comparison'         // Comparison page
  | 'share_card';        // Share card CTA

/** All properties tracked with every ticket event */
export interface TicketEventProperties {
  show_id: string;
  show_title: string;
  show_slug: string;
  platform: string;
  url: string;
  affiliate_url: string;
  is_affiliate: boolean;
  source: TicketSource;
  link_position: number;
  show_status: string;
  show_category: string;
  show_score: number | null;
  has_audience_score: boolean;
  ticket_link_count: number;
}

/** Build the full ticket event properties object */
export function buildTicketEventProps(opts: {
  show: {
    id: string;
    title: string;
    slug: string;
    status: string;
    category: string;
    compositeScore: number | null;
    audienceGrade: unknown | null;
    ticketLinks: { platform: string; url: string }[];
  };
  platform: string;
  originalUrl: string;
  affiliateUrl: string;
  isAffiliate: boolean;
  source: TicketSource;
  linkPosition: number;
}): TicketEventProperties {
  return {
    show_id: opts.show.id,
    show_title: opts.show.title,
    show_slug: opts.show.slug,
    platform: opts.platform,
    url: opts.originalUrl,
    affiliate_url: opts.affiliateUrl,
    is_affiliate: opts.isAffiliate,
    source: opts.source,
    link_position: opts.linkPosition,
    show_status: opts.show.status,
    show_category: opts.show.category,
    show_score: opts.show.compositeScore,
    has_audience_score: opts.show.audienceGrade != null,
    ticket_link_count: opts.show.ticketLinks?.length ?? 0,
  };
}

// ─── Platform helpers ────────────────────────────────────────

/** Check if a platform has an active affiliate program */
export function isAffiliatePlatform(platform: string): boolean {
  return AFFILIATE_CONFIG[platform]?.enabled === true;
}

/** Get all configured affiliate platforms */
export function getAffiliatePlatforms(): string[] {
  return Object.entries(AFFILIATE_CONFIG)
    .filter(([, config]) => config.enabled)
    .map(([platform]) => platform);
}
