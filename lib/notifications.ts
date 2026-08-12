/**
 * Push notification setup for Broadway Scorecard.
 *
 * Handles permission requests, token registration, and notification
 * response handling (deep-link to show pages on tap).
 *
 * Uses expo-notifications (lazy-loaded to avoid crash if native module
 * isn't registered in the dev client).
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { captureException } from './sentry';

const PUSH_TOKEN_KEY = '@bsc:pushToken';
const PERMISSION_ASKED_KEY = '@bsc:notificationPermissionAsked';

type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');

let Notifications: NotificationsModule | null = null;
let Device: DeviceModule | null = null;

try {
  Notifications = require('expo-notifications');
} catch {
  if (__DEV__) console.warn('[Notifications] expo-notifications not available');
}

try {
  Device = require('expo-device');
} catch {
  if (__DEV__) console.warn('[Notifications] expo-device not available');
}

/**
 * Request notification permission and register for push notifications.
 * Returns the Expo push token, or null if permission denied or unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) return null;

  // Must be a physical device (simulators don't get push tokens)
  if (!Device.isDevice) {
    if (__DEV__) console.log('[Notifications] Skipping — not a physical device');
    return null;
  }

  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Mark that we've asked (so we don't re-prompt)
  await AsyncStorage.setItem(PERMISSION_ASKED_KEY, 'true');

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('[Notifications] Permission not granted:', finalStatus);
    return null;
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '8948052e-aa32-4767-9eeb-9f33288f8e6d',
    });
    const token = tokenData.data;

    // Cache token locally
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    // Store token in Supabase (if available)
    await savePushTokenToServer(token);

    if (__DEV__) console.log('[Notifications] Push token:', token);
    return token;
  } catch (e) {
    if (__DEV__) console.warn('[Notifications] Token registration failed:', e);
    return null;
  }
}

/** Check if we've already asked for permission */
export async function hasAskedPermission(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
  return value === 'true';
}

/** Get cached push token */
export async function getCachedPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

/**
 * Set up notification response handler — navigates to show page when
 * a notification is tapped.
 *
 * Call once at app startup. Returns cleanup function.
 */
export function setupNotificationHandler(): (() => void) | null {
  if (!Notifications) return null;

  // Configure how notifications appear when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Handle notification taps — navigate to the relevant screen
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      if (data?.showSlug && typeof data.showSlug === 'string') {
        // Navigate to show detail page
        router.push(`/show/${data.showSlug}`);
      } else if (data?.screen && typeof data.screen === 'string') {
        // Navigate to a specific screen
        router.push(data.screen as never);
      }
    },
  );

  return () => subscription.remove();
}

/**
 * Configure notification categories/channels (Android needs channels).
 */
export async function configureNotificationChannels(): Promise<void> {
  if (!Notifications) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('scores', {
      name: 'New Scores',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });

    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Show Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

// ─── Server sync ─────────────────────────────────────────────

async function savePushTokenToServer(token: string): Promise<void> {
  try {
    const { getSupabaseClient } = require('./supabase');
    const client = getSupabaseClient();
    if (!client) return;

    // Get current user (optional — tokens can be anonymous)
    const { data: { session } } = await client.auth.getSession();
    const userId = session?.user?.id ?? null;

    const row = {
      token,
      platform: Platform.OS,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    // Insert first, fall back to update on a duplicate-key error.
    //
    // NOT `.upsert(..., { onConflict: 'token' })`: that issues
    // `INSERT ... ON CONFLICT (token) DO UPDATE`, which Postgres rejects with
    // 42501 for every signed-in user, so no device ever registered and nobody
    // received a notification. The conflict path has to read the row it would
    // update, and push_tokens grants ordinary users no SELECT.
    //
    // NOT update-then-insert either, which was this code's first replacement
    // and was wrong for the same underlying reason: with no SELECT policy,
    // `.update(...).select()` comes back empty whether it changed a row or not,
    // so "no rows matched" cannot be distinguished from "matched but invisible".
    // It then inserted and hit 23505 on every re-registration — measured, run
    // 31602907198. Reading back a value RLS suppresses is the same mistake as
    // ignoring the error return; it just fails one step later.
    //
    // Insert-first needs no read at all. The unique constraint on `token` is
    // the signal, and 23505 is unambiguous.
    let { error } = await client.from('push_tokens').insert(row);

    if (error && (error as { code?: string }).code === '23505') {
      // Device already known to the server — this is the re-registration path,
      // which every launch after the first one takes.
      ({ error } = await client.from('push_tokens').update(row).eq('token', token));
    }

    // supabase-js RESOLVES with an { error } object instead of throwing, so the
    // catch below never sees a rejected write. Ignoring this return value is
    // what hid the failure above for the life of the feature.
    if (error) {
      captureException(new Error(`push_tokens write failed: ${error.message}`), {
        code: String((error as { code?: string }).code ?? 'unknown'),
        signedIn: String(userId != null),
      });
      if (__DEV__) console.warn('[Notifications] Failed to save token to server:', error);
    }
  } catch (e) {
    // Non-critical — token is cached locally, will retry next launch
    captureException(e instanceof Error ? e : new Error(String(e)), { stage: 'savePushTokenToServer' });
    if (__DEV__) console.warn('[Notifications] Failed to save token to server:', e);
  }
}
