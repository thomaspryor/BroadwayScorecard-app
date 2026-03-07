/**
 * Send push notifications via Expo Push API.
 *
 * Notification types:
 *   1. reviews-in — "The reviews are in for Hamilton — see what the critics thought"
 *                   Broadcast to ALL devices when a show first gets 8+ scored reviews.
 *   2. new-score  — "Hamilton: 89/100" (legacy, kept for compatibility)
 *   3. rate-show  — "How was Hamilton tonight? Tap to rate."
 *                   Sent to users who had a show on their watchlist for today.
 *   4. test       — Test notification to a single token.
 *
 * Usage:
 *   npx tsx scripts/send-notifications.ts --type reviews-in --show hamilton --title "Hamilton"
 *   npx tsx scripts/send-notifications.ts --type new-score --show hamilton --title "Hamilton" --score 89
 *   npx tsx scripts/send-notifications.ts --type rate-show
 *   npx tsx scripts/send-notifications.ts --type test --token "ExponentPushToken[xxx]"
 *
 * Requires:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 200; // Respect Expo rate limits

// ─── Types ───────────────────────────────────────────────────

interface PushToken {
  token: string;
  platform: string;
  user_id: string | null;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  channelId?: string;
}

// ─── Supabase ────────────────────────────────────────────────

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

async function getActiveTokens(client: SupabaseClient): Promise<PushToken[]> {
  // Only fetch tokens active within the last 90 days
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('push_tokens')
    .select('token, platform, user_id')
    .gte('updated_at', cutoff);
  if (error) throw new Error(`Failed to fetch tokens: ${error.message}`);
  return data || [];
}

async function getTokensForUsers(client: SupabaseClient, userIds: string[]): Promise<PushToken[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await client
    .from('push_tokens')
    .select('token, platform, user_id')
    .in('user_id', userIds);
  if (error) throw new Error(`Failed to fetch user tokens: ${error.message}`);
  return data || [];
}

// ─── Dedup via push_log ─────────────────────────────────────

async function hasAlreadySent(client: SupabaseClient, showId: string, type: string): Promise<boolean> {
  const { data } = await client
    .from('push_log')
    .select('id')
    .eq('show_id', showId)
    .eq('notification_type', type)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logPushSent(client: SupabaseClient, showId: string, type: string, deviceCount: number): Promise<void> {
  await client.from('push_log').insert({
    show_id: showId,
    notification_type: type,
    device_count: deviceCount,
  }).then(({ error }) => {
    if (error) console.error('Failed to log push:', error.message);
  });
}

// ─── Expo Push API ───────────────────────────────────────────

const staleTokens: string[] = [];

async function sendPushNotifications(messages: ExpoPushMessage[]): Promise<{ sent: number; errors: number }> {
  if (messages.length === 0) {
    console.log('No messages to send.');
    return { sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    // Rate limit: delay between batches
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      console.error(`Expo API error: ${response.status} ${response.statusText}`);
      errors += batch.length;
      continue;
    }

    const result = await response.json();
    const tickets = result.data || [];
    for (let j = 0; j < tickets.length; j++) {
      const ticket = tickets[j];
      if (ticket.status === 'ok') {
        sent++;
      } else {
        errors++;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // Track the specific token that failed (not batch[0])
          staleTokens.push(batch[j]?.to);
        } else {
          console.error('Push error:', ticket.message || ticket.details);
        }
      }
    }
  }

  console.log(`Sent: ${sent}, Errors: ${errors}, Total: ${messages.length}`);
  return { sent, errors };
}

/** Clean up stale tokens collected during sending */
async function cleanupStaleTokens(client: SupabaseClient): Promise<void> {
  if (staleTokens.length === 0) return;
  const unique = [...new Set(staleTokens.filter(Boolean))];
  console.log(`Cleaning up ${unique.length} stale tokens...`);
  for (const token of unique) {
    await client.from('push_tokens').delete().eq('token', token).catch(() => {});
  }
}

// ─── Notification builders ──────────────────────────────────

function buildReviewsInMessages(tokens: PushToken[], showSlug: string, showTitle: string): ExpoPushMessage[] {
  return tokens.map(t => ({
    to: t.token,
    title: `The reviews are in for ${showTitle}`,
    body: `See what the critics thought.`,
    data: { showSlug },
    sound: 'default' as const,
    channelId: 'scores',
  }));
}

function buildNewScoreMessages(tokens: PushToken[], showSlug: string, showTitle: string, score: number): ExpoPushMessage[] {
  return tokens.map(t => ({
    to: t.token,
    title: `${showTitle}: ${score}/100`,
    body: `The critics have spoken! See the full breakdown.`,
    data: { showSlug },
    sound: 'default' as const,
    channelId: 'scores',
  }));
}

async function buildRateShowMessages(client: SupabaseClient): Promise<ExpoPushMessage[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data: watchlistEntries, error } = await client
    .from('watchlist')
    .select('user_id, show_id, show_title')
    .eq('planned_date', today);

  if (error) { console.error('Failed to fetch watchlist:', error.message); return []; }
  if (!watchlistEntries?.length) { console.log('No watchlist entries for today.'); return []; }

  console.log(`Found ${watchlistEntries.length} watchlist entries for ${today}.`);

  const userIds = [...new Set(watchlistEntries.map(e => e.user_id).filter(Boolean))];
  const tokens = await getTokensForUsers(client, userIds);

  const tokensByUser = new Map<string, PushToken[]>();
  for (const t of tokens) {
    if (!t.user_id) continue;
    const list = tokensByUser.get(t.user_id) || [];
    list.push(t);
    tokensByUser.set(t.user_id, list);
  }

  const messages: ExpoPushMessage[] = [];
  for (const entry of watchlistEntries) {
    const userTokens = tokensByUser.get(entry.user_id) || [];
    for (const t of userTokens) {
      messages.push({
        to: t.token,
        title: `How was ${entry.show_title}?`,
        body: `Tap to rate your experience tonight.`,
        data: { showSlug: entry.show_id },
        sound: 'default',
        channelId: 'alerts',
      });
    }
  }

  return messages;
}

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── CLI ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const type = getArg('type');
  if (!type) {
    console.error('Usage: --type <reviews-in|new-score|rate-show|test>');
    process.exit(1);
  }

  if (type === 'test') {
    const token = getArg('token');
    if (!token) { console.error('--token required for test'); process.exit(1); }
    await sendPushNotifications([{
      to: token,
      title: 'Broadway Scorecard',
      body: 'Push notifications are working!',
      data: { screen: '/(tabs)' },
      sound: 'default',
    }]);
    return;
  }

  const client = getServiceClient();

  if (type === 'reviews-in') {
    const show = getArg('show');
    const title = getArg('title');
    if (!show || !title) {
      console.error('--show, --title required for reviews-in');
      process.exit(1);
    }

    // Dedup check
    if (await hasAlreadySent(client, show, 'reviews-in')) {
      console.log(`Already sent reviews-in for ${show}. Skipping.`);
      return;
    }

    const tokens = await getActiveTokens(client);
    console.log(`Broadcasting "reviews are in" for ${title} to ${tokens.length} devices.`);
    const messages = buildReviewsInMessages(tokens, show, title);
    const { sent } = await sendPushNotifications(messages);
    await cleanupStaleTokens(client);
    await logPushSent(client, show, 'reviews-in', sent);

  } else if (type === 'new-score') {
    const show = getArg('show');
    const title = getArg('title');
    const scoreStr = getArg('score');
    if (!show || !title || !scoreStr) {
      console.error('--show, --title, --score required for new-score');
      process.exit(1);
    }

    if (await hasAlreadySent(client, show, 'new-score')) {
      console.log(`Already sent new-score for ${show}. Skipping.`);
      return;
    }

    const tokens = await getActiveTokens(client);
    console.log(`Broadcasting new score for ${title} to ${tokens.length} devices.`);
    const messages = buildNewScoreMessages(tokens, show, title, parseInt(scoreStr, 10));
    const { sent } = await sendPushNotifications(messages);
    await cleanupStaleTokens(client);
    await logPushSent(client, show, 'new-score', sent);

  } else if (type === 'rate-show') {
    const messages = await buildRateShowMessages(client);
    console.log(`Sending ${messages.length} rate-show prompts.`);
    await sendPushNotifications(messages);
    await cleanupStaleTokens(client);

  } else {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
