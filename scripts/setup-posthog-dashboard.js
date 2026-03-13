#!/usr/bin/env node
/**
 * Creates the "Ticket Affiliate Funnel" dashboard in PostHog with 5 insights.
 *
 * Usage:
 *   POSTHOG_API_KEY=phx_... node scripts/setup-posthog-dashboard.js
 *
 * Requires a PostHog personal API key with scopes: dashboard:write, insight:write
 * Generate one at: https://us.posthog.com/settings/user-api-keys
 */

const POSTHOG_HOST = 'https://us.i.posthog.com';
const PROJECT_ID = '332742';

const API_KEY = process.env.POSTHOG_API_KEY;
if (!API_KEY) {
  console.error('Set POSTHOG_API_KEY env var (needs dashboard:write + insight:write scopes)');
  console.error('Create one at: https://us.posthog.com/settings/user-api-keys');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('Creating dashboard...');
  const dashboard = await api('POST', '/dashboards/', {
    name: 'Ticket Affiliate Funnel',
    description: 'Tracks the full ticket link funnel: impressions → taps → browser open → browser dismiss',
    tags: ['tickets', 'affiliate', 'revenue'],
  });
  const dashId = dashboard.id;
  console.log(`  Dashboard ID: ${dashId}`);

  const insights = [
    {
      name: 'Ticket Tap Funnel (All Platforms)',
      description: 'Full funnel: links visible → tapped → browser opened → browser dismissed',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'FunnelsQuery',
          series: [
            { kind: 'EventsNode', event: 'ticket_links_visible', name: 'Links Visible' },
            { kind: 'EventsNode', event: 'ticket_tapped', name: 'Ticket Tapped' },
            { kind: 'EventsNode', event: 'ticket_browser_opened', name: 'Browser Opened' },
            { kind: 'EventsNode', event: 'ticket_browser_dismissed', name: 'Browser Dismissed' },
          ],
          funnelsFilter: {
            funnelWindowInterval: 1,
            funnelWindowIntervalUnit: 'hour',
            funnelOrderType: 'ordered',
          },
        },
      },
    },
    {
      name: 'Affiliate-Only Funnel (TodayTix)',
      description: 'Funnel filtered to affiliate clicks only — for revenue attribution',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'FunnelsQuery',
          series: [
            { kind: 'EventsNode', event: 'ticket_links_visible', name: 'Links Visible', properties: [{ key: 'has_affiliate', value: true, type: 'event' }] },
            { kind: 'EventsNode', event: 'ticket_tapped', name: 'Affiliate Tapped', properties: [{ key: 'is_affiliate', value: true, type: 'event' }] },
            { kind: 'EventsNode', event: 'ticket_browser_opened', name: 'Browser Opened', properties: [{ key: 'is_affiliate', value: true, type: 'event' }] },
            { kind: 'EventsNode', event: 'ticket_browser_dismissed', name: 'Browser Dismissed', properties: [{ key: 'is_affiliate', value: true, type: 'event' }] },
          ],
          funnelsFilter: {
            funnelWindowInterval: 1,
            funnelWindowIntervalUnit: 'hour',
            funnelOrderType: 'ordered',
          },
        },
      },
    },
    {
      name: 'Ticket Taps by Platform',
      description: 'Breakdown of ticket taps by platform (TodayTix, Telecharge, etc.)',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'TrendsQuery',
          series: [{ kind: 'EventsNode', event: 'ticket_tapped', name: 'Ticket Taps', math: 'total' }],
          breakdownFilter: { breakdowns: [{ property: 'platform', type: 'event' }] },
          interval: 'day',
          dateRange: { date_from: '-30d' },
        },
      },
    },
    {
      name: 'Top Shows by Ticket Taps',
      description: 'Which shows drive the most ticket link clicks',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'TrendsQuery',
          series: [{ kind: 'EventsNode', event: 'ticket_tapped', name: 'Ticket Taps', math: 'total' }],
          breakdownFilter: { breakdowns: [{ property: 'show_title', type: 'event' }] },
          interval: 'day',
          dateRange: { date_from: '-30d' },
        },
      },
    },
    {
      name: 'Avg Time on Ticket Site (seconds)',
      description: 'Average time users spend on external ticket sites before returning',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'TrendsQuery',
          series: [{ kind: 'EventsNode', event: 'ticket_browser_dismissed', name: 'Avg Time on Site', math: 'avg', math_property: 'time_on_site_seconds' }],
          breakdownFilter: { breakdowns: [{ property: 'platform', type: 'event' }] },
          interval: 'week',
          dateRange: { date_from: '-30d' },
        },
      },
    },
  ];

  for (const insight of insights) {
    console.log(`Creating insight: ${insight.name}...`);
    const result = await api('POST', '/insights/', {
      ...insight,
      dashboards: [dashId],
    });
    console.log(`  ID: ${result.short_id}`);
  }

  console.log('\n✓ Done!');
  console.log(`Dashboard: https://us.posthog.com/project/${PROJECT_ID}/dashboard/${dashId}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
