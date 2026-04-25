/**
 * Standalone test for ticket-utils.ts and analytics.ts ticket tracking.
 * Run: npx tsx scripts/test-ticket-tracking.ts
 */

import {
  buildTicketUrl,
  buildTicketEventProps,
  isAffiliatePlatform,
  getAffiliatePlatforms,
  type TicketSource,
  type TicketEventProperties,
} from '../lib/ticket-utils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual:   ${JSON.stringify(actual)}`);
  }
}

// ─── Test buildTicketUrl ──────────────────────────────

console.log('\n=== buildTicketUrl ===');

// Test 1: Non-affiliate platform returns URL unchanged
{
  const result = buildTicketUrl('https://telecharge.com/show/123', 'Telecharge', 'show_detail');
  assertEqual(result.url, 'https://telecharge.com/show/123', 'Non-affiliate URL unchanged');
  assertEqual(result.isAffiliate, false, 'Non-affiliate isAffiliate=false');
}

// Test 2: TodayTix wraps URL via Impact Universal App/Web Link
{
  const original = 'https://www.todaytix.com/nyc/shows/123';
  const result = buildTicketUrl(original, 'TodayTix', 'show_detail');
  assertEqual(result.isAffiliate, true, 'TodayTix enabled → isAffiliate=true');
  assert(
    result.url.startsWith('https://todaytix.pxf.io/c/6999278/3855163/20944?u='),
    'TodayTix wrapped via Impact ad 3855163',
  );
  assert(
    result.url.includes(encodeURIComponent(original)),
    'TodayTix preserves destination URL via ?u=',
  );
}

// Test 2b: Ticketmaster wraps via Impact ad 264167
{
  const result = buildTicketUrl('https://www.ticketmaster.com/event/abc', 'Ticketmaster', 'show_detail');
  assertEqual(result.isAffiliate, true, 'Ticketmaster enabled → isAffiliate=true');
  assert(
    result.url.startsWith('https://ticketmaster.evyy.net/c/6999278/264167/4272?u='),
    'Ticketmaster wrapped via Impact ad 264167',
  );
}

// Test 2c: StubHub wraps via Partnerize
{
  const original = 'https://www.stubhub.com/event/xyz';
  const result = buildTicketUrl(original, 'StubHub', 'show_detail');
  assertEqual(result.isAffiliate, true, 'StubHub enabled → isAffiliate=true');
  assert(
    result.url.startsWith('https://stubhub.prf.hn/click/camref:1011l5DmFu/destination:'),
    'StubHub wrapped via Partnerize',
  );
  assert(
    result.url.includes(encodeURIComponent(original)),
    'StubHub preserves destination URL',
  );
}

// Test 3: Unknown platform returns URL unchanged
{
  const result = buildTicketUrl('https://example.com', 'SomeNewPlatform', 'show_detail');
  assertEqual(result.isAffiliate, false, 'Unknown platform isAffiliate=false');
  assertEqual(result.url, 'https://example.com', 'Unknown platform URL unchanged');
}

// Test 4: Invalid URL — Impact wrapping doesn't validate destination,
// so it still wraps. The invalid string ends up encoded inside ?u=.
// This matches web behavior in src/lib/affiliate-utils.ts.
{
  const result = buildTicketUrl('not-a-url', 'TodayTix', 'show_detail');
  assertEqual(result.isAffiliate, true, 'Invalid URL still wraps (Impact does not validate)');
  assert(
    result.url.includes(encodeURIComponent('not-a-url')),
    'Invalid URL embedded as ?u= payload',
  );
}

// Test 5: URL with existing params preserved
{
  const result = buildTicketUrl('https://telecharge.com/show/123?foo=bar', 'Telecharge', 'show_detail');
  assert(result.url.includes('foo=bar'), 'Existing params preserved');
}

// Test 6: Empty URL — wraps with empty ?u= (parity with web).
{
  const result = buildTicketUrl('', 'TodayTix', 'show_detail');
  assertEqual(result.isAffiliate, true, 'Empty URL wraps (Impact does not validate)');
  assertEqual(
    result.url,
    'https://todaytix.pxf.io/c/6999278/3855163/20944?u=',
    'Empty URL produces empty ?u=',
  );
}

// ─── Test isAffiliatePlatform ──────────────────────────

console.log('\n=== isAffiliatePlatform ===');

assertEqual(isAffiliatePlatform('TodayTix'), true, 'TodayTix enabled → true');
assertEqual(isAffiliatePlatform('Ticketmaster'), true, 'Ticketmaster enabled → true');
assertEqual(isAffiliatePlatform('StubHub'), true, 'StubHub enabled → true');
assertEqual(isAffiliatePlatform('Vivid Seats'), true, 'Vivid Seats enabled → true');
assertEqual(isAffiliatePlatform('SeatPlan'), true, 'SeatPlan enabled → true');
assertEqual(isAffiliatePlatform('SeatGeek'), false, 'SeatGeek configured but disabled → false');
assertEqual(isAffiliatePlatform('Telecharge'), false, 'Telecharge not configured → false');
assertEqual(isAffiliatePlatform(''), false, 'Empty string → false');

// ─── Test getAffiliatePlatforms ──────────────────────────

console.log('\n=== getAffiliatePlatforms ===');

{
  const platforms = getAffiliatePlatforms().sort();
  assertEqual(
    platforms,
    ['SeatPlan', 'StubHub', 'Ticketmaster', 'TodayTix', 'Vivid Seats'],
    'Active affiliates list (5 enabled)',
  );
}

// ─── Test buildTicketEventProps ──────────────────────────

console.log('\n=== buildTicketEventProps ===');

{
  const mockShow = {
    id: 'hamilton-2015',
    title: 'Hamilton',
    slug: 'hamilton',
    status: 'open',
    category: 'broadway',
    compositeScore: 92,
    audienceGrade: { grade: 'A', label: 'Loving It', color: '#22c55e' },
    ticketLinks: [
      { platform: 'TodayTix', url: 'https://todaytix.com/123' },
      { platform: 'Telecharge', url: 'https://telecharge.com/456' },
    ],
  };

  const props = buildTicketEventProps({
    show: mockShow,
    platform: 'TodayTix',
    originalUrl: 'https://todaytix.com/123',
    affiliateUrl: 'https://todaytix.com/123?utm_source=broadwayscorecard',
    isAffiliate: true,
    source: 'show_detail',
    linkPosition: 0,
  });

  assertEqual(props.show_id, 'hamilton-2015', 'show_id correct');
  assertEqual(props.show_title, 'Hamilton', 'show_title correct');
  assertEqual(props.show_slug, 'hamilton', 'show_slug correct');
  assertEqual(props.platform, 'TodayTix', 'platform correct');
  assertEqual(props.url, 'https://todaytix.com/123', 'original url correct');
  assertEqual(props.affiliate_url, 'https://todaytix.com/123?utm_source=broadwayscorecard', 'affiliate url correct');
  assertEqual(props.is_affiliate, true, 'is_affiliate correct');
  assertEqual(props.source, 'show_detail', 'source correct');
  assertEqual(props.link_position, 0, 'link_position correct');
  assertEqual(props.show_status, 'open', 'show_status correct');
  assertEqual(props.show_category, 'broadway', 'show_category correct');
  assertEqual(props.show_score, 92, 'show_score correct');
  assertEqual(props.has_audience_score, true, 'has_audience_score correct');
  assertEqual(props.ticket_link_count, 2, 'ticket_link_count correct');
}

// Test with null score and no audience
{
  const mockShow = {
    id: 'new-show',
    title: 'New Show',
    slug: 'new-show',
    status: 'previews',
    category: 'off-broadway',
    compositeScore: null,
    audienceGrade: null,
    ticketLinks: [{ platform: 'TodayTix', url: 'https://todaytix.com/789' }],
  };

  const props = buildTicketEventProps({
    show: mockShow,
    platform: 'TodayTix',
    originalUrl: 'https://todaytix.com/789',
    affiliateUrl: 'https://todaytix.com/789',
    isAffiliate: false,
    source: 'home_carousel',
    linkPosition: 2,
  });

  assertEqual(props.show_score, null, 'null score handled');
  assertEqual(props.has_audience_score, false, 'null audienceGrade → false');
  assertEqual(props.show_status, 'previews', 'previews status');
  assertEqual(props.show_category, 'off-broadway', 'off-broadway category');
  assertEqual(props.source, 'home_carousel', 'home_carousel source');
  assertEqual(props.link_position, 2, 'link_position=2');
  assertEqual(props.ticket_link_count, 1, 'single ticket link count');
}

// Test with empty ticketLinks
{
  const mockShow = {
    id: 'closed-show',
    title: 'Closed Show',
    slug: 'closed-show',
    status: 'closed',
    category: 'broadway',
    compositeScore: 75,
    audienceGrade: null,
    ticketLinks: [],
  };

  const props = buildTicketEventProps({
    show: mockShow,
    platform: 'Official Site',
    originalUrl: 'https://example.com',
    affiliateUrl: 'https://example.com',
    isAffiliate: false,
    source: 'show_detail',
    linkPosition: 0,
  });

  assertEqual(props.ticket_link_count, 0, 'empty ticketLinks → count 0');
}

// ─── Test all TicketSource values are valid ──────────────

console.log('\n=== TicketSource type coverage ===');

{
  const allSources: TicketSource[] = [
    'show_detail', 'sticky_cta', 'home_carousel', 'browse_card',
    'search_result', 'to_watch_card', 'showtimes', 'comparison', 'share_card',
  ];
  for (const source of allSources) {
    const result = buildTicketUrl('https://todaytix.com/123', 'TodayTix', source);
    assert(typeof result.url === 'string', `Source "${source}" produces valid result`);
  }
}

// ─── Test analytics import types ─────────────────────────

console.log('\n=== Analytics type compatibility ===');

{
  // Verify TicketEventProperties can be spread into Record<string, ...>
  const props: TicketEventProperties = buildTicketEventProps({
    show: {
      id: 'test', title: 'Test', slug: 'test', status: 'open',
      category: 'broadway', compositeScore: 50, audienceGrade: null,
      ticketLinks: [{ platform: 'TodayTix', url: 'https://example.com' }],
    },
    platform: 'TodayTix',
    originalUrl: 'https://example.com',
    affiliateUrl: 'https://example.com',
    isAffiliate: false,
    source: 'show_detail',
    linkPosition: 0,
  });

  const spread: Record<string, string | number | boolean | null> = { ...props };
  assert(typeof spread.show_id === 'string', 'Spread show_id is string');
  assert(typeof spread.is_affiliate === 'boolean', 'Spread is_affiliate is boolean');
  assert(spread.show_score === 50, 'Spread show_score is number');

  // Verify time_on_site extension works
  const withTime = { ...props, time_on_site_ms: 5000, time_on_site_seconds: 5 };
  const spreadWithTime: Record<string, string | number | boolean | null> = { ...withTime };
  assert(spreadWithTime.time_on_site_seconds === 5, 'time_on_site_seconds spreads correctly');
}

// ─── Summary ──────────────────────────────────────────────

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
