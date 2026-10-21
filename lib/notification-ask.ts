/**
 * When to ask for notification permission (BRO-5852, owner decision
 * 2026-10-21): after a person's first rating or watchlist add, with a one-line
 * reason, never at launch. iOS shows its own permission dialog only once, and
 * a "no" given before the person has done anything is close to permanent.
 *
 * Pure so it is unit-testable; lib/notifications.ts wires it to the native
 * modules and the one-time flag.
 */

// Matches what the app actually sends: "How was <show>? Tap to rate" on the
// night of a planned date (lib/local-notifications.ts, scripts/send-notifications.ts
// rate-show) and "The reviews are in for <show>" (reviews-in).
export const SOFT_ASK_TITLE = 'Get a nudge to rate shows you see?';
export const SOFT_ASK_MESSAGE = "We'll check in on the night of a show you plan to see, and tell you when the reviews are in. You can turn this off anytime.";

export interface SoftAskInput {
  /** expo-notifications permission status: 'granted' | 'denied' | 'undetermined'. */
  status: string;
  /** The soft ask was already shown on this install. */
  alreadyAsked: boolean;
  /** Simulators get no push token, and an alert there would block E2E flows. */
  isDevice: boolean;
}

/** Ask once, only on a real device, only while iOS has never asked. */
export function shouldSoftAsk({ status, alreadyAsked, isDevice }: SoftAskInput): boolean {
  return isDevice && status === 'undetermined' && !alreadyAsked;
}

export type NotificationSettingsRow =
  | { value: 'On'; action: 'open-settings' }
  | { value: 'Off'; action: 'request' | 'open-settings' }
  | { value: 'Not available'; action: null };

/**
 * The Settings row. "Not now" on the soft ask leaves iOS undetermined, and iOS
 * lists an app under Settings > Notifications only after it has asked, so this
 * row is the only way back: undetermined shows the iOS dialog, anything iOS has
 * already answered opens the app's iOS Settings page.
 */
export function notificationSettingsRow(status: string): NotificationSettingsRow {
  if (status === 'granted') return { value: 'On', action: 'open-settings' };
  if (status === 'undetermined') return { value: 'Off', action: 'request' };
  if (status === 'denied') return { value: 'Off', action: 'open-settings' };
  return { value: 'Not available', action: null };
}
