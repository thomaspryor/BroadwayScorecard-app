/**
 * Ticket link utilities — affiliate URL decoration & tracking helpers.
 *
 * Centralizes all ticket URL logic so affiliate params are applied consistently
 * across every surface (show detail, sticky CTA, home carousels, etc.).
 */

// ─── Affiliate configuration ─────────────────────────────────
// Mirrors web src/lib/affiliate-utils.ts. Keep both files in sync when adding,
// disabling, or changing ad IDs — drift causes attribution to silently regress.

type AffiliateType = 'utm' | 'impact' | 'partnerize';

export interface AffiliateConfig {
  type: AffiliateType;
  enabled: boolean;
  // UTM-based (simple param append)
  params?: Record<string, string>;
  // Impact — deep link format: https://{domain}/c/{publisherId}/{campaignId}/{programId}?u={encodedUrl}
  impactDomain?: string;
  impactPublisherId?: string;
  impactCampaignId?: string;
  impactProgramId?: string;
  // Partnerize (StubHub) — wraps URL via Partnerize redirect
  partnerizeDomain?: string;
  partnerizeCampaignRef?: string;
}

const AFFILIATE_CONFIG: Record<string, AffiliateConfig> = {
  TodayTix: {
    type: 'impact',
    impactDomain: 'todaytix.pxf.io',
    impactPublisherId: '6999278',
    impactCampaignId: '3855163', // Universal App/Web Link — captures in-app purchases
    impactProgramId: '20944',
    enabled: true,
  },
  Ticketmaster: {
    type: 'impact',
    impactDomain: 'ticketmaster.evyy.net',
    impactPublisherId: '6999278',
    impactCampaignId: '264167',
    impactProgramId: '4272',
    enabled: true,
  },
  StubHub: {
    type: 'partnerize',
    partnerizeDomain: 'stubhub.prf.hn',
    partnerizeCampaignRef: '1011l5DmFu',
    enabled: true,
  },
  SeatGeek: {
    type: 'impact',
    impactDomain: '',
    impactPublisherId: '',
    impactCampaignId: '',
    impactProgramId: '',
    enabled: false,
  },
  'Vivid Seats': {
    type: 'impact',
    impactDomain: 'vivid-seats.pxf.io',
    impactPublisherId: '6999278',
    impactCampaignId: '952533',
    impactProgramId: '12730',
    enabled: true,
  },
  SeatPlan: {
    type: 'impact',
    impactDomain: 'seatplan.sjv.io',
    impactPublisherId: '6999278',
    impactCampaignId: '2219054',
    impactProgramId: '28679',
    enabled: true,
  },
};

// ─── URL decoration ──────────────────────────────────────────

/**
 * Build a ticket URL with affiliate wrapping if applicable.
 * Returns the original URL unchanged if no affiliate config exists or is disabled.
 *
 * Impact URLs use the Universal App/Web Link format which honors iOS Universal
 * Links: if the partner app is installed, the OS hands the click off to the
 * native app while preserving the irclickid attribution. Otherwise it opens in
 * Safari and the user buys on web — both paths credit us.
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
    if (
      config.type === 'impact' &&
      config.impactDomain &&
      config.impactPublisherId &&
      config.impactCampaignId &&
      config.impactProgramId
    ) {
      const encodedUrl = encodeURIComponent(url);
      const affiliateUrl = `https://${config.impactDomain}/c/${config.impactPublisherId}/${config.impactCampaignId}/${config.impactProgramId}?u=${encodedUrl}`;
      return { url: affiliateUrl, isAffiliate: true };
    }

    if (config.type === 'partnerize' && config.partnerizeCampaignRef) {
      const domain = config.partnerizeDomain || 'prf.hn';
      const encodedUrl = encodeURIComponent(url);
      const affiliateUrl = `https://${domain}/click/camref:${config.partnerizeCampaignRef}/destination:${encodedUrl}`;
      return { url: affiliateUrl, isAffiliate: true };
    }

    if (config.type === 'utm' && config.params) {
      const parsed = new URL(url);
      for (const [key, value] of Object.entries(config.params)) {
        if (!parsed.searchParams.has(key)) {
          parsed.searchParams.set(key, value);
        }
      }
      parsed.searchParams.set('utm_content', source);
      return { url: parsed.toString(), isAffiliate: true };
    }

    return { url, isAffiliate: false };
  } catch {
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

// ─── Open-strategy helper ───────────────────────────────────
//
// Centralizes the affiliate-vs-non-affiliate decision so it's testable
// without React Native mocks. The actual side-effecting open call still
// lives in app/show/[slug].tsx.

export type TicketOpenStrategy = 'native-handoff' | 'in-app-browser';

/**
 * Affiliate links use the native-handoff path so iOS Universal Links can
 * route to the partner's installed app (preserving irclickid attribution).
 * Non-affiliate links use the in-app browser for better UX — there's no
 * native app to hand off to and SFSafariViewController keeps the user in
 * our app.
 */
export function chooseTicketOpenStrategy(isAffiliate: boolean): TicketOpenStrategy {
  return isAffiliate ? 'native-handoff' : 'in-app-browser';
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
