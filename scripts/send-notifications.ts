/**
 * Send push notifications via Expo Push API.
 *
 * Two notification types:
 *   1. new-score  — "Hamilton just got its critic score: 89!"
 *                   Sent to ALL devices when a show's score is first published.
 *   2. rate-show  — "How was Hamilton tonight? Tap to rate."
 *                   Sent at 11pm to users who had a show on their watchlist for today.
 *
 * Usage:
 *   npx tsx scripts/send-notifications.ts --type new-score --show hamilton --title "Hamilton" --score 89
 *   npx tsx scripts/send-notifications.ts --type rate-show
 *   npx tsx scripts/send-notifications.ts --type test --token "ExponentPushToken[xxx]"
 *
 * Requires:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

async function getAllTokens(client: SupabaseClient): Promise<PushToken[]> {
  const { data, error } = await client
    .from('push_tokens')
    .select('token, platform, user_id');
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

// ─── Expo Push API ───────────────────────────────────────────

async function sendPushNotifications(messages: ExpoPushMessage[]): Promise<{ sent: number; errors: number }> {
  if (messages.length === 0) {
    console.log('No messages to send.');
    return { sent: 0, errors: 0 };
  }

  const BATCH_SIZE = 100;
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

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
    for (const ticket of (result.data || [])) {
      if (ticket.status === 'ok') {
        sent++;
      } else {
        errors++;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await cleanupStaleToken(batch[0]?.to);
        } else {
          console.error('Push error:', ticket.message || ticket.details);
        }
      }
    }
  }

  console.log(`Sent: ${sent}, Errors: ${errors}, Total: ${messages.length}`);
  return { sent, errors };
}

async function cleanupStaleToken(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const client = getServiceClient();
    await client.from('push_tokens').delete().eq('token', token);
    console.log(`Cleaned up stale token: ${token.slice(0, 30)}...`);
  } catch {}
}

// ─── Notification type: new-score ────────────────────────────
// Broadcast to all devices when a show first gets its critic score.

function buildNewScoreMessages(
  tokens: PushToken[],
  showSlug: string,
  showTitle: string,
  score: number,
): ExpoPushMessage[] {
  return tokens.map(t => ({
    to: t.token,
    title: `${showTitle}: ${score}/100`,
    body: `The critics have spoken! See the full breakdown.`,
    data: { showSlug },
    sound: 'default' as const,
    channelId: 'scores',
  }));
}

// ─── Notification type: rate-show ────────────────────────────
// Sent at 11pm to users who had a watchlist entry with today's date.
// "How was Hamilton tonight? Tap to rate."

async function buildRateShowMessages(client: SupabaseClient): Promise<ExpoPushMessage[]> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Find watchlist entries with planned_date = today
  const { data: watchlistEntries, error } = await client
    .from('watchlist')
    .select('user_id, show_id, show_title')
    .eq('planned_date', today);

  if (error) {
    console.error('Failed to fetch watchlist:', error.message);
    return [];
  }

  if (!watchlistEntries?.length) {
    console.log('No watchlist entries for today.');
    return [];
  }

  console.log(`Found ${watchlistEntries.length} watchlist entries for ${today}.`);

  // Get unique user IDs
  const userIds = [...new Set(watchlistEntries.map(e => e.user_id).filter(Boolean))];
  const tokens = await getTokensForUsers(client, userIds);

  // Build a map of user_id -> tokens
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

// ─── CLI ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const type = getArg('type');
  if (!type) {
    console.error('Usage: --type <new-score|rate-show|test>');
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

  if (type === 'new-score') {
    const show = getArg('show');
    const title = getArg('title');
    const scoreStr = getArg('score');
    if (!show || !title || !scoreStr) {
      console.error('--show, --title, --score required for new-score');
      process.exit(1);
    }
    const tokens = await getAllTokens(client);
    console.log(`Broadcasting new score to ${tokens.length} devices.`);
    const messages = buildNewScoreMessages(tokens, show, title, parseInt(scoreStr, 10));
    await sendPushNotifications(messages);
  } else if (type === 'rate-show') {
    const messages = await buildRateShowMessages(client);
    console.log(`Sending ${messages.length} rate-show prompts.`);
    await sendPushNotifications(messages);
  } else {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
