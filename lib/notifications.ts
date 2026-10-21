/**
 * Push notification setup for Broadway Scorecard.
 *
 * Handles permission requests, token registration, and notification
 * response handling (deep-link to show pages on tap).
 *
 * Uses expo-notifications (lazy-loaded to avoid crash if native module
 * isn't registered in the dev client).
 */

import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { captureException } from './sentry';
import { shouldSoftAsk, SOFT_ASK_MESSAGE, SOFT_ASK_TITLE } from './notification-ask';
import { reviewPromptRequestedWithin } from './store-review';

const PUSH_TOKEN_KEY = '@bsc:pushToken';
const PERMISSION_ASKED_KEY = '@bsc:notificationPermissionAsked';
/** Set once the in-context soft ask has been shown (lib/notification-ask.ts). */
const SOFT_ASK_KEY = '@bsc:notificationSoftAsked';
/** Let the rate sheet finish closing so the question doesn't land mid-animation. */
const SOFT_ASK_DELAY_MS = 800;
let softAskInFlight = false;
const EAS_PROJECT_ID = '8948052e-aa32-4767-9eeb-9f33288f8e6d';
/** Sign-out waits at most this long for the push-token unlink. */
const UNLINK_TIMEOUT_MS = 4000;
/** `${token}|${userId}` of the last successful server write this process made.
 *  Launch (syncPushTokenIfPermitted) and the sign-in sync would otherwise
 *  write the identical row twice. */
let lastSavedLink: string | null = null;

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
 * Shows the iOS dialog when undetermined, so only maybeAskForNotifications()
 * (after the person said yes to the soft ask) and Settings call it.
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
      projectId: EAS_PROJECT_ID,
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

/**
 * After a first rating or watchlist add: ask once, in plain words, whether the
 * person wants reminders, and only on "Turn on" show the iOS dialog. Does
 * nothing on a simulator, once asked, or when iOS already has an answer.
 */
export async function maybeAskForNotifications(): Promise<void> {
  // Two quick bookmark taps would both pass the check during the wait below.
  if (!Notifications || !Device || softAskInFlight) return;
  softAskInFlight = true;
  try {
    const [{ status }, asked] = await Promise.all([
      Notifications.getPermissionsAsync(),
      AsyncStorage.getItem(SOFT_ASK_KEY),
    ]);
    if (!shouldSoftAsk({ status, alreadyAsked: asked === 'true', isDevice: !!Device.isDevice })) return;
    // After a rating save the sheet is still closing; let it finish so the
    // question reads as a follow-up rather than part of the save.
    await new Promise(resolve => setTimeout(resolve, SOFT_ASK_DELAY_MS));
    // A rating can also bring up Apple's App Store prompt (lib/store-review.ts).
    // Never stack the two; the flag stays unset, so the next action asks.
    if (reviewPromptRequestedWithin(60_000)) return;
    await AsyncStorage.setItem(SOFT_ASK_KEY, 'true');
    Alert.alert(SOFT_ASK_TITLE, SOFT_ASK_MESSAGE, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Turn on', onPress: () => { registerForPushNotifications().catch(() => {}); } },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[Notifications] Soft ask failed:', e);
  } finally {
    softAskInFlight = false;
  }
}

/** iOS permission status for the Settings row; 'unavailable' on a simulator or without the module. */
export async function getNotificationPermissionStatus(): Promise<string> {
  if (!Notifications || !Device?.isDevice) return 'unavailable';
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return 'unavailable';
  }
}

/**
 * Link this device's push token to whoever is signed in NOW, without ever
 * showing the permission prompt (does nothing unless permission is already
 * granted). Called at launch and on sign-in, so a mid-session sign-in does
 * not leave the device anonymous (or still unlinked by a sign-out) until the
 * next cold start.
 */
export async function syncPushTokenIfPermitted(): Promise<void> {
  if (!Notifications || !Device?.isDevice) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    let token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    }
    await savePushTokenToServer(token);
  } catch (e) {
    if (__DEV__) console.warn('[Notifications] Push token sync failed:', e);
  }
}

/**
 * Detach this device's push token from the account that is signing out.
 * Personal notifications (send-notifications.ts targets tokens by user_id)
 * otherwise kept arriving for the old account, on a phone that may now be
 * someone else's. The row stays, with user_id NULL: the same anonymous
 * registration a device has before sign-in, which push_tokens_claim_update
 * permits (using (true), with check user_id is null). No DELETE policy exists.
 *
 * Call BEFORE auth.signOut(). Best effort and bounded: a hung request must
 * never block signing out.
 */
export async function unlinkPushTokenFromUser(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    const { getSupabaseClient } = require('./supabase');
    const client = getSupabaseClient();
    if (!client) return;
    // The next sign-in must write the row again, even for the same account.
    lastSavedLink = null;
    const write: PromiseLike<{ error: { message: string; code?: string } | null }> = client
      .from('push_tokens')
      .update({ user_id: null, updated_at: new Date().toISOString() })
      .eq('token', token);
    const result = await Promise.race([
      write,
      new Promise<{ error: null }>(resolve => setTimeout(() => resolve({ error: null }), UNLINK_TIMEOUT_MS)),
    ]);
    if (result.error) {
      captureException(new Error(`push_tokens unlink failed: ${result.error.message}`), {
        code: String(result.error.code ?? 'unknown'),
      });
    }
  } catch (e) {
    captureException(e instanceof Error ? e : new Error(String(e)), { stage: 'unlinkPushTokenFromUser' });
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
    const link = `${token}|${userId ?? ''}`;
    if (link === lastSavedLink) return;

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
      // Device already known to the server — the re-registration path, which
      // every launch after the first one takes.
      //
      // The row may belong to a DIFFERENT user (sign out, hand the phone over,
      // new person signs in, token unchanged). push_tokens_claim_update has
      // `using (true)`, so the UPDATE matches that row and re-points it at the
      // signed-in user, and Postgres reports no error.
      //
      // Do NOT chain `.select()` here to "confirm" the write. push_tokens grants
      // ordinary users no SELECT, so the read-back is empty whether or not the
      // update worked. Treating empty as "unconfirmed" reported every successful
      // re-registration to Sentry (10 events in the week of 2026-09-25, all
      // false alarms). A real failure surfaces as `updateErr`, handled below.
      const { error: updateErr } = await client
        .from('push_tokens').update(row).eq('token', token);
      error = updateErr;
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
    } else {
      lastSavedLink = link;
    }
  } catch (e) {
    // Non-critical — token is cached locally, will retry next launch
    captureException(e instanceof Error ? e : new Error(String(e)), { stage: 'savePushTokenToServer' });
    if (__DEV__) console.warn('[Notifications] Failed to save token to server:', e);
  }
}
