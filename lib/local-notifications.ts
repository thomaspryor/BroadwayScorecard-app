/**
 * Local notification scheduling for "rate show" reminders.
 *
 * Uses deterministic notification IDs (`rate-{showId}-{date}`) so
 * re-scheduling is idempotent — same ID replaces, never duplicates.
 *
 * iOS limits: 64 pending local notifications max. We cap at 60.
 */

import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  if (__DEV__) console.warn('[LocalNotifications] expo-notifications not available');
}

const NOTIFICATION_PREFIX = 'rate-';
const MAX_SCHEDULED = 60; // Leave headroom under iOS's 64 limit

/** Build a deterministic notification ID */
function notificationId(showId: string, date: string): string {
  return `${NOTIFICATION_PREFIX}${showId}-${date}`;
}

/**
 * Schedule a "rate show" local notification for 10pm on the given date.
 * Uses deterministic ID so calling this multiple times is safe (idempotent).
 */
export async function scheduleRateReminder(
  showId: string,
  showTitle: string,
  date: string, // YYYY-MM-DD
): Promise<void> {
  if (!Notifications || Platform.OS !== 'ios') return;

  // Don't schedule past dates
  const target = new Date(date + 'T22:00:00');
  if (target.getTime() <= Date.now()) return;

  const id = notificationId(showId, date);

  // Cancel existing notification with this ID (idempotent replace)
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  const [year, month, day] = date.split('-').map(Number);

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `How was ${showTitle}?`,
      body: 'Tap to rate your experience tonight.',
      data: { showSlug: showId, type: 'rate-reminder' },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      year,
      month,
      day,
      hour: 22,
      minute: 0,
      repeats: false,
    },
  });

  if (__DEV__) console.log(`[LocalNotifications] Scheduled rate reminder: ${showTitle} on ${date}`);
}

/** Cancel a scheduled rate reminder for a specific show + date */
export async function cancelRateReminder(showId: string, date: string): Promise<void> {
  if (!Notifications) return;
  const id = notificationId(showId, date);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Cancel all rate reminders for a show (any date) */
export async function cancelAllRemindersForShow(showId: string): Promise<void> {
  if (!Notifications) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `${NOTIFICATION_PREFIX}${showId}-`;
  for (const n of all) {
    if (n.identifier.startsWith(prefix)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }
}

/**
 * Re-schedule all rate reminders from watchlist data.
 * Called on app launch to recover from app kill / iOS clearing notifications.
 *
 * 1. Cancels ALL existing rate-* notifications
 * 2. Schedules future planned dates (up to MAX_SCHEDULED)
 */
export async function rescheduleAllReminders(
  entries: Array<{ show_id: string; planned_date: string | null }>,
  showTitleLookup: (showId: string) => string,
): Promise<void> {
  if (!Notifications || Platform.OS !== 'ios') return;

  // Step 1: Cancel all existing rate reminders
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(NOTIFICATION_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }

  // Step 2: Filter to future dates and schedule (capped at MAX_SCHEDULED)
  const now = Date.now();
  const futureEntries = entries
    .filter(e => {
      if (!e.planned_date) return false;
      return new Date(e.planned_date + 'T22:00:00').getTime() > now;
    })
    .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))
    .slice(0, MAX_SCHEDULED);

  for (const entry of futureEntries) {
    const title = showTitleLookup(entry.show_id);
    await scheduleRateReminder(entry.show_id, title, entry.planned_date!);
  }

  if (__DEV__) {
    console.log(`[LocalNotifications] Re-scheduled ${futureEntries.length} rate reminders`);
  }
}
